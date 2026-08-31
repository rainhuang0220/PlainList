const migrationFilenamePattern = /^\d{3}_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/;

export function discoverMigrationFilenames(entries: readonly string[]): string[] {
  return entries.filter((entry) => migrationFilenamePattern.test(entry)).sort();
}
