import { readFile } from 'node:fs/promises';
import { pool } from '../../db/pool';
import { importDailySemanticFacts, type ImportedDailySemanticFact } from './importDailySemanticFacts';

async function main() {
  const userId = Number(process.argv[2] || '');
  const filePath = String(process.argv[3] || '');
  if (!Number.isInteger(userId) || userId <= 0 || !filePath) {
    console.error('usage: node dist/modules/chatgpt-activity/importDailySemanticFactsCli.js <userId> <facts.json>');
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
  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as {
    factsByConversation?: Record<string, ImportedDailySemanticFact[]>;
  };
  const factsByConversation = parsed.factsByConversation ?? {};
  const result = await importDailySemanticFacts({
    id: Number(row.id),
    username: String(row.username),
    isAdmin: Boolean(row.is_admin),
  }, factsByConversation);
  console.log(JSON.stringify({ userId: row.id, ...result }));
  await pool.end();
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'import failed');
  await pool.end().catch(() => undefined);
  process.exit(1);
});
