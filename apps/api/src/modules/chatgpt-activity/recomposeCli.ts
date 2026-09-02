import { pool } from '../../db/pool';
import { recomposeHistoricalDailyJournals } from './service';

async function main() {
  const userId = Number(process.argv[2] || '');
  if (!Number.isInteger(userId) || userId <= 0) {
    console.error('usage: node dist/modules/chatgpt-activity/recomposeCli.js <userId>');
    process.exit(1);
  }
  const [rows] = await pool.query(
    'SELECT id, username, is_admin FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  const row = Array.isArray(rows) ? rows[0] as { id: number; username: string; is_admin: number } | undefined : undefined;
  if (!row) {
    console.error('user not found');
    process.exit(1);
  }
  const result = await recomposeHistoricalDailyJournals({
    id: Number(row.id),
    username: String(row.username),
    isAdmin: Boolean(row.is_admin),
  }, { tryModel: true });
  console.log(JSON.stringify({
    userId: row.id,
    ...result,
  }));
  await pool.end();
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'recompose failed');
  await pool.end().catch(() => undefined);
  process.exit(1);
});
