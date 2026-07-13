import type { AuthenticatedUser } from '@plainlist/shared';
import { toDateKey } from '@plainlist/shared';
import { pool } from '../../db/pool';
import { z } from 'zod';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

const reviewRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const reviewDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const reviewBodySchema = z.object({
  content: z.string().max(10000),
});

export async function listReviews(user: AuthenticatedUser, query: unknown): Promise<Record<string, string>> {
  const parsed = reviewRangeSchema.parse(query);

  const [rows] = await pool.query(
    'SELECT review_date, content FROM daily_reviews WHERE user_id = ? AND review_date BETWEEN ? AND ?',
    [user.id, parsed.from, parsed.to],
  );

  if (!Array.isArray(rows)) {
    return {};
  }

  return rows.reduce<Record<string, string>>((result, row) => {
    const record = row as { review_date: Date | string; content: string };
    // DATE columns arrive as strings (pool dateStrings); the Date branch must
    // use local time — toISOString() shifts the day on non-UTC servers.
    const dateKey = record.review_date instanceof Date
      ? toDateKey(record.review_date)
      : String(record.review_date).slice(0, 10);
    result[dateKey] = record.content;
    return result;
  }, {});
}

export async function upsertReview(user: AuthenticatedUser, params: unknown, payload: unknown): Promise<void> {
  const { date } = reviewDateSchema.parse(params);
  const { content } = reviewBodySchema.parse(payload);

  const todayKey = toDateKey(new Date());
  if (date !== todayKey) {
    throw serviceError(403, 'only today\'s review can be edited');
  }

  await pool.query(
    `INSERT INTO daily_reviews (user_id, review_date, content)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content)`,
    [user.id, date, content],
  );
}
