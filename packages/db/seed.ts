import { createPool, ensureDatabaseExists, loadDatabaseConfig } from './utils';
import { runDemoSeed } from './seeds/001_demo';
import { seed as seedMarketplace } from './seeds/002_marketplace';

async function main(): Promise<void> {
  const config = loadDatabaseConfig();
  await ensureDatabaseExists(config);
  const pool = createPool(config);

  try {
    console.log('Refreshing PlainList demo dataset...');
    await runDemoSeed(pool);
    console.log('Seeding plugin marketplace...');
    await seedMarketplace(pool);
    console.log('PlainList demo dataset is ready.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database seed failed:', error);
  process.exit(1);
});
