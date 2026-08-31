import { discoverMigrationFilenames } from './migrationDiscovery';

export interface MigrationRunnerDependencies {
  isApplied(filename: string): Promise<boolean>;
  readMigration(filename: string): Promise<string>;
  applyMigration(filename: string, sql: string): Promise<void>;
}

export async function runPendingMigrations(
  entries: readonly string[],
  dependencies: MigrationRunnerDependencies,
): Promise<void> {
  for (const filename of discoverMigrationFilenames(entries)) {
    if (await dependencies.isApplied(filename)) {
      continue;
    }

    const sql = await dependencies.readMigration(filename);
    await dependencies.applyMigration(filename, sql);
  }
}
