import bcrypt from 'bcryptjs';
import type { Pool } from 'mysql2/promise';
import { DEMO_ACCOUNT, DEMO_THEME_ID, THEME_PLUGIN_ID, USER_SETTING_KEYS } from '@plainlist/shared';

const demoPlans: Array<[type: 'habit' | 'todo', name: string, time: string]> = [
  ['habit', 'Morning stretching', '06:30'],
  ['habit', 'Read 30 min', '07:00'],
  ['habit', 'Cold shower', '07:30'],
  ['todo', 'Review email backlog', '09:00'],
  ['todo', 'Design system tokens', '10:00'],
  ['todo', 'Write weekly report', '11:00'],
  ['habit', 'Lunch walk (20 min)', '12:30'],
  ['todo', 'Frontend PR review', '14:00'],
  ['todo', 'Team sync call', '15:30'],
  ['habit', 'No phone after 21:00', '21:00'],
  ['habit', 'Journal entry', '22:00'],
  ['todo', "Prep tomorrow's tasks", '22:30'],
];

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hashString(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }
  return hash;
}

function shouldMarkDone(planName: string, date: Date, type: 'habit' | 'todo'): boolean {
  const daySeed = Number(toDateKey(date).replaceAll('-', ''));
  const mixed = hashString(`${planName}-${type}-${daySeed}`) % 100;
  const threshold = type === 'habit' ? 73 : 58;
  return mixed < threshold;
}

async function upsertDemoUser(pool: Pool): Promise<number> {
  const passwordHash = await bcrypt.hash(DEMO_ACCOUNT.password, 10);
  await pool.query(
    `INSERT INTO users (username, password, is_admin)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE password = VALUES(password), is_admin = VALUES(is_admin)`,
    [DEMO_ACCOUNT.username, passwordHash],
  );

  const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [DEMO_ACCOUNT.username]);
  return Number((rows as Array<{ id: number }>)[0]?.id);
}

async function clearDemoData(pool: Pool, userId: number): Promise<void> {
  await pool.query(
    'DELETE c FROM checks c INNER JOIN plans p ON p.id = c.plan_id WHERE p.user_id = ?',
    [userId],
  );
  await pool.query('DELETE FROM plans WHERE user_id = ?', [userId]);
}

async function seedDemoSettings(pool: Pool, userId: number): Promise<void> {
  const installedPlugins = JSON.stringify([
    {
      id: THEME_PLUGIN_ID,
      enabled: true,
      installedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  await pool.query(
    `INSERT INTO user_settings (user_id, key_name, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, USER_SETTING_KEYS.installedPlugins, installedPlugins],
  );

  await pool.query(
    `INSERT INTO user_settings (user_id, key_name, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, USER_SETTING_KEYS.activeTheme, DEMO_THEME_ID],
  );
}

async function seedDemoPlans(pool: Pool, userId: number): Promise<void> {
  const today = new Date();
  const checks: Array<[number, string, number]> = [];

  for (const [index, [type, name, time]] of demoPlans.entries()) {
    const [planResult] = await pool.query(
      'INSERT INTO plans (user_id, type, name, time, sort_order) VALUES (?, ?, ?, ?, ?)',
      [userId, type, name, time, index],
    );

    const planId = Number((planResult as { insertId: number }).insertId);

    for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
      const cursorMonth = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
      const monthDays = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= monthDays; day += 1) {
        const date = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), day);
        if (date > today) {
          continue;
        }

        checks.push([planId, toDateKey(date), shouldMarkDone(name, date, type) ? 1 : 0]);
      }
    }
  }

  if (checks.length > 0) {
    const placeholders = checks.map(() => '(?, ?, ?)').join(', ');
    await pool.query(
      `INSERT INTO checks (plan_id, check_date, done) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE done = VALUES(done)`,
      checks.flat(),
    );
  }
}

export async function runDemoSeed(pool: Pool): Promise<void> {
  const demoUserId = await upsertDemoUser(pool);
  await clearDemoData(pool, demoUserId);
  await seedDemoPlans(pool, demoUserId);
  await seedDemoSettings(pool, demoUserId);
  console.log(`Demo account refreshed: ${DEMO_ACCOUNT.username} / ${DEMO_ACCOUNT.password}`);
}
