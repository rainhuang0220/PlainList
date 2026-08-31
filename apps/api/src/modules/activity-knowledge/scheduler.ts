import { createReviewClock, normalizeWeekStart, shiftDateKey, type AuthenticatedUser } from '@plainlist/shared';
import { env } from '../../config/env';
import { pool } from '../../db/pool';
import { generateDailyDigest } from './daily';
import { generateWeeklyIntelligence } from './weekly';

const clock = createReviewClock({ timezone: env.APP_TIME_ZONE });

export async function catchUpActivityIntelligence(): Promise<void> {
  const [rows] = await pool.query('SELECT id, username, is_admin FROM users');
  if (!Array.isArray(rows)) return;
  const today = clock.currentDateKey();
  const yesterday = shiftDateKey(today, -1);
  const weekStarts = [...new Set([normalizeWeekStart(yesterday), normalizeWeekStart(today)])];
  await Promise.all(rows.map(async (row) => {
    const user: AuthenticatedUser = {
      id: Number((row as { id: number }).id),
      username: String((row as { username: string }).username),
      isAdmin: Boolean((row as { is_admin: number }).is_admin),
    };
    await generateDailyDigest(user, yesterday);
    await Promise.all(weekStarts.map((weekStart) => generateWeeklyIntelligence(user, weekStart)));
  }));
}

interface ActivityIntelligenceSchedulerDeps {
  catchUp: () => Promise<void>;
  millisecondsUntilNextMidnight: () => number;
  setTimer: (callback: () => void, milliseconds: number) => NodeJS.Timeout;
  clearTimer: (timer: NodeJS.Timeout) => void;
}

export function createActivityIntelligenceScheduler(deps: ActivityIntelligenceSchedulerDeps = {
  catchUp: catchUpActivityIntelligence,
  millisecondsUntilNextMidnight: () => clock.millisecondsUntilNextMidnight(),
  setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer: (timer) => clearTimeout(timer),
}): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const run = () => void deps.catchUp().catch((error) => console.error('[activity-intelligence] generation failed', error));
  const schedule = () => {
    if (stopped) return;
    timer = deps.setTimer(() => {
      run();
      schedule();
    }, deps.millisecondsUntilNextMidnight());
  };
  run();
  schedule();
  return () => { stopped = true; if (timer) deps.clearTimer(timer); };
}
