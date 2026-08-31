import { describe, expect, test } from 'vitest';
import { runPendingMigrations } from './migrationRunner';

describe('runPendingMigrations', () => {
  test('never reads ignored filenames', async () => {
    const readFilenames: string[] = [];
    const appliedFilenames: string[] = [];

    await runPendingMigrations([
      '._011_weekly_review_snapshots.sql',
      '.DS_Store',
      '001_example.sql',
      '011_weekly_review_snapshots.sql',
      'foo.sql',
    ], {
      isApplied: async () => false,
      readMigration: async (filename) => {
        readFilenames.push(filename);
        return `-- ${filename}`;
      },
      applyMigration: async (filename) => {
        appliedFilenames.push(filename);
      },
    });

    expect(readFilenames).toEqual(['001_example.sql', '011_weekly_review_snapshots.sql']);
    expect(appliedFilenames).toEqual(['001_example.sql', '011_weekly_review_snapshots.sql']);
  });
});
