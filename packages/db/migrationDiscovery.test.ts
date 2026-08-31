import { describe, expect, test } from 'vitest';
import { discoverMigrationFilenames } from './migrationDiscovery';

describe('discoverMigrationFilenames', () => {
  test('discovers and orders only formal migration filenames', () => {
    expect(discoverMigrationFilenames([
      '011_weekly_review_snapshots.sql',
      '._011_weekly_review_snapshots.sql',
      '.DS_Store',
      'foo.sql',
      '011.sql',
      'backup.sql.bak',
      '011_weekly_review_snapshots.sql.bak',
      '011_weekly_review_snapshots.SQL',
      '../evil.sql',
      '010_activity.sql',
      '001_example.sql',
    ])).toEqual([
      '001_example.sql',
      '010_activity.sql',
      '011_weekly_review_snapshots.sql',
    ]);
  });
});
