import bcrypt from 'bcryptjs';
import type { Pool } from 'mysql2/promise';

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

export async function runDemoSeed(pool: Pool): Promise<void> {
  const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', ['admin']);
  if (Array.isArray(rows) && rows.length > 0) {
    console.log('Seed skipped because admin already exists.');
    return;
  }

  const passwordHash = await bcrypt.hash('admin', 10);
  const [result] = await pool.query('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)', [
    'admin',
    passwordHash,
  ]);

  const adminId = Number((result as { insertId: number }).insertId);

  for (const [type, name, time] of demoPlans) {
    const [planResult] = await pool.query('INSERT INTO plans (user_id, type, name, time) VALUES (?, ?, ?, ?)', [
      adminId,
      type,
      name,
      time,
    ]);

    const planId = Number((planResult as { insertId: number }).insertId);
    const today = new Date();
    const checks: Array<[number, string, number]> = [];

    for (let day = 1; day < today.getDate(); day += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), day);
      const done = Math.random() > (type === 'habit' ? 0.22 : 0.28) ? 1 : 0;
      checks.push([planId, toDateKey(date), done]);
    }

    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const previousMonthDays = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= previousMonthDays; day += 1) {
      const date = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), day);
      const done = Math.random() > 0.22 ? 1 : 0;
      checks.push([planId, toDateKey(date), done]);
    }

    const todayDone = ['Morning stretching', 'Read 30 min', 'Review email backlog', 'Design system tokens', 'Lunch walk (20 min)', 'Team sync call'].includes(name)
      ? 1
      : 0;
    checks.push([planId, toDateKey(today), todayDone]);

    if (checks.length > 0) {
      const placeholders = checks.map(() => '(?, ?, ?)').join(', ');
      await pool.query(
        `INSERT INTO checks (plan_id, check_date, done) VALUES ${placeholders} ON DUPLICATE KEY UPDATE done = VALUES(done)`,
        checks.flat(),
      );
    }
  }

  console.log('Seeded admin account and demo plans.');
}
