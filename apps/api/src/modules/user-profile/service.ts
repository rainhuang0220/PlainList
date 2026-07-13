import type {
  AuthenticatedUser,
  UserProfileAnalyzeResponse,
  UserProfileEvidenceRecord,
  UserProfileResponse,
  UserProfileRunRecord,
  UserProfileTraitRecord,
} from '@plainlist/shared';
import {
  toDateKey,
  userProfileAnalyzeSchema,
  userProfilePatchSchema,
  userProfileTraitIdParamSchema,
} from '@plainlist/shared';
import { pool } from '../../db/pool';
import { extractProfileEvidenceFromReviews, type ProfileEvidenceCandidate } from './extractor';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

interface TraitRow {
  id: number;
  trait_key: string;
  title: string;
  generated_summary: string;
  user_summary?: string | null;
  impact_ratio: string | number;
  confidence: string | number;
  support_count: number;
  enabled: number | boolean;
  last_evidence_date?: string | Date | null;
  updated_at: string | Date;
}

interface EvidenceRow {
  id: number;
  trait_id: number;
  review_date: string | Date;
  excerpt: string;
  observation: string;
  impact_note: string;
  weight: string | number;
  created_at: string | Date;
}

interface RunRow {
  id: number;
  from_date: string | Date;
  to_date: string | Date;
  status: 'success' | 'failed';
  model?: string | null;
  message?: string | null;
  evidence_count: number;
  analyzed_at: string | Date;
}

interface ReviewRow {
  review_date: string | Date;
  content: string;
}

function toLocalDateKey(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return toDateKey(value);
  }
  return String(value).slice(0, 10);
}

function toIsoLike(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asRatio(value: string | number): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function mapEvidence(row: EvidenceRow): UserProfileEvidenceRecord {
  return {
    id: row.id,
    traitId: row.trait_id,
    reviewDate: toLocalDateKey(row.review_date) ?? '',
    excerpt: row.excerpt,
    observation: row.observation,
    impactNote: row.impact_note,
    weight: asRatio(row.weight),
    createdAt: toIsoLike(row.created_at),
  };
}

function mapTrait(row: TraitRow, evidence?: UserProfileEvidenceRecord[]): UserProfileTraitRecord {
  const userSummary = row.user_summary ?? null;
  return {
    id: row.id,
    traitKey: row.trait_key,
    title: row.title,
    generatedSummary: row.generated_summary,
    userSummary,
    effectiveSummary: userSummary?.trim() || row.generated_summary,
    impactRatio: asRatio(row.impact_ratio),
    confidence: asRatio(row.confidence),
    supportCount: row.support_count,
    enabled: Boolean(row.enabled),
    lastEvidenceDate: toLocalDateKey(row.last_evidence_date),
    updatedAt: toIsoLike(row.updated_at),
    evidence,
  };
}

function mapRun(row: RunRow): UserProfileRunRecord {
  return {
    id: row.id,
    fromDate: toLocalDateKey(row.from_date) ?? '',
    toDate: toLocalDateKey(row.to_date) ?? '',
    status: row.status,
    model: row.model ?? null,
    message: row.message ?? null,
    evidenceCount: row.evidence_count,
    analyzedAt: toIsoLike(row.analyzed_at),
  };
}

async function selectTraits(userId: number): Promise<TraitRow[]> {
  const [rows] = await pool.query(
    `SELECT id, trait_key, title, generated_summary, user_summary, impact_ratio, confidence,
            support_count, enabled, last_evidence_date, updated_at
     FROM user_profile_traits
     WHERE user_id = ?
     ORDER BY enabled DESC, impact_ratio DESC, support_count DESC, updated_at DESC`,
    [userId],
  );
  return Array.isArray(rows) ? rows as TraitRow[] : [];
}

async function selectLatestEvidence(userId: number, traitIds: number[], limitPerTrait = 3): Promise<Map<number, UserProfileEvidenceRecord[]>> {
  if (traitIds.length === 0) {
    return new Map();
  }

  const [rows] = await pool.query(
    `SELECT id, trait_id, review_date, excerpt, observation, impact_note, weight, created_at
     FROM (
       SELECT e.*,
              ROW_NUMBER() OVER (PARTITION BY e.trait_id ORDER BY e.review_date DESC, e.id DESC) AS row_num
       FROM user_profile_evidence e
       WHERE e.user_id = ? AND e.trait_id IN (${traitIds.map(() => '?').join(',')})
     ) ranked
     WHERE row_num <= ?
     ORDER BY review_date DESC, id DESC`,
    [userId, ...traitIds, limitPerTrait],
  );

  const grouped = new Map<number, UserProfileEvidenceRecord[]>();
  if (!Array.isArray(rows)) {
    return grouped;
  }

  for (const row of rows as EvidenceRow[]) {
    const record = mapEvidence(row);
    grouped.set(record.traitId, [...(grouped.get(record.traitId) ?? []), record]);
  }
  return grouped;
}

async function selectLastRun(userId: number): Promise<UserProfileRunRecord | null> {
  const [rows] = await pool.query(
    `SELECT id, from_date, to_date, status, model, message, evidence_count, analyzed_at
     FROM user_profile_runs
     WHERE user_id = ?
     ORDER BY analyzed_at DESC, id DESC
     LIMIT 1`,
    [userId],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return mapRun(rows[0] as RunRow);
}

export async function listUserProfile(user: AuthenticatedUser): Promise<UserProfileResponse> {
  const traitRows = await selectTraits(user.id);
  const evidenceByTrait = await selectLatestEvidence(user.id, traitRows.map((row) => row.id));
  return {
    traits: traitRows.map((row) => mapTrait(row, evidenceByTrait.get(row.id) ?? [])),
    lastRun: await selectLastRun(user.id),
  };
}

export async function listTraitEvidence(
  user: AuthenticatedUser,
  params: unknown,
): Promise<UserProfileEvidenceRecord[]> {
  const { id } = userProfileTraitIdParamSchema.parse(params);
  const [rows] = await pool.query(
    `SELECT e.id, e.trait_id, e.review_date, e.excerpt, e.observation, e.impact_note, e.weight, e.created_at
     FROM user_profile_evidence e
     INNER JOIN user_profile_traits t ON t.id = e.trait_id
     WHERE e.user_id = ? AND e.trait_id = ? AND t.user_id = ?
     ORDER BY e.review_date DESC, e.id DESC`,
    [user.id, id, user.id],
  );
  return Array.isArray(rows) ? (rows as EvidenceRow[]).map(mapEvidence) : [];
}

export async function updateUserProfileTrait(
  user: AuthenticatedUser,
  params: unknown,
  payload: unknown,
): Promise<UserProfileTraitRecord> {
  if (user.isAdmin) {
    throw serviceError(403, 'admin account is read-only');
  }

  const { id } = userProfileTraitIdParamSchema.parse(params);
  const input = userProfilePatchSchema.parse(payload);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    fields.push('title = ?');
    values.push(input.title);
  }
  if (input.userSummary !== undefined) {
    fields.push('user_summary = ?');
    values.push(input.userSummary?.trim() ? input.userSummary.trim() : null);
  }
  if (input.impactRatio !== undefined) {
    fields.push('impact_ratio = ?');
    values.push(input.impactRatio);
  }
  if (input.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(input.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    throw serviceError(400, 'no fields to update');
  }

  values.push(id, user.id);
  const [result] = await pool.query(
    `UPDATE user_profile_traits SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    values,
  );
  if (Number((result as { affectedRows: number }).affectedRows) === 0) {
    throw serviceError(404, 'profile trait not found');
  }

  const [rows] = await pool.query(
    `SELECT id, trait_key, title, generated_summary, user_summary, impact_ratio, confidence,
            support_count, enabled, last_evidence_date, updated_at
     FROM user_profile_traits
     WHERE id = ? AND user_id = ?`,
    [id, user.id],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw serviceError(404, 'profile trait not found after update');
  }
  const evidenceByTrait = await selectLatestEvidence(user.id, [id]);
  return mapTrait(rows[0] as TraitRow, evidenceByTrait.get(id) ?? []);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveAnalyzeRange(payload: unknown): { fromDate: string; toDate: string } {
  const input = userProfileAnalyzeSchema.parse(payload ?? {});
  const today = new Date();
  const toDate = input.toDate ?? toDateKey(today);
  const fromDate = input.fromDate ?? toDateKey(addDays(today, -(input.days ?? 60) + 1));
  return { fromDate, toDate };
}

async function loadReviews(userId: number, fromDate: string, toDate: string): Promise<Array<{ reviewDate: string; content: string }>> {
  const [rows] = await pool.query(
    `SELECT review_date, content
     FROM daily_reviews
     WHERE user_id = ? AND review_date BETWEEN ? AND ?
     ORDER BY review_date ASC`,
    [userId, fromDate, toDate],
  );
  if (!Array.isArray(rows)) {
    return [];
  }
  return (rows as ReviewRow[])
    .map((row) => ({
      reviewDate: toLocalDateKey(row.review_date) ?? '',
      content: row.content,
    }))
    .filter((row) => row.reviewDate && row.content.trim());
}

async function ensureTrait(userId: number, candidate: ProfileEvidenceCandidate): Promise<number> {
  await pool.query(
    `INSERT INTO user_profile_traits (user_id, trait_key, title, generated_summary)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       generated_summary = VALUES(generated_summary)`,
    [userId, candidate.traitKey, candidate.title, candidate.generatedSummary],
  );

  const [rows] = await pool.query(
    'SELECT id FROM user_profile_traits WHERE user_id = ? AND trait_key = ?',
    [userId, candidate.traitKey],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw serviceError(500, 'failed to create profile trait');
  }
  return Number((rows[0] as { id: number }).id);
}

async function insertEvidence(userId: number, candidate: ProfileEvidenceCandidate): Promise<void> {
  const traitId = await ensureTrait(userId, candidate);
  await pool.query(
    `INSERT IGNORE INTO user_profile_evidence
       (trait_id, user_id, review_date, excerpt, observation, impact_note, weight, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      traitId,
      userId,
      candidate.reviewDate,
      candidate.excerpt,
      candidate.observation,
      candidate.impactNote,
      candidate.weight,
      candidate.sourceHash,
    ],
  );
}

async function refreshTraitAggregates(userId: number): Promise<void> {
  const [traits] = await pool.query('SELECT id FROM user_profile_traits WHERE user_id = ?', [userId]);
  if (!Array.isArray(traits)) {
    return;
  }

  for (const row of traits as Array<{ id: number }>) {
    const [aggregateRows] = await pool.query(
      `SELECT COUNT(*) AS support_count, AVG(weight) AS avg_weight, MAX(review_date) AS last_evidence_date
       FROM user_profile_evidence
       WHERE user_id = ? AND trait_id = ?`,
      [userId, row.id],
    );
    const aggregate = Array.isArray(aggregateRows) ? aggregateRows[0] as {
      support_count?: number;
      avg_weight?: string | number | null;
      last_evidence_date?: string | Date | null;
    } : null;
    const supportCount = Number(aggregate?.support_count ?? 0);
    const avgWeight = Number(aggregate?.avg_weight ?? 0);
    const confidence = Math.min(0.95, supportCount <= 0 ? 0 : 0.35 + supportCount * 0.12);
    const impactRatio = Math.min(0.85, supportCount <= 0 ? 0 : avgWeight * Math.min(1, supportCount / 6));

    await pool.query(
      `UPDATE user_profile_traits
       SET support_count = ?, confidence = ?, impact_ratio = ?, last_evidence_date = ?
       WHERE id = ? AND user_id = ?`,
      [
        supportCount,
        Number(confidence.toFixed(4)),
        Number(impactRatio.toFixed(4)),
        aggregate?.last_evidence_date ? toLocalDateKey(aggregate.last_evidence_date) : null,
        row.id,
        userId,
      ],
    );
  }
}

async function recordRun(
  userId: number,
  fromDate: string,
  toDate: string,
  status: 'success' | 'failed',
  evidenceCount: number,
  message?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_profile_runs (user_id, from_date, to_date, status, model, message, evidence_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, fromDate, toDate, status, 'local-rules', message ?? null, evidenceCount],
  );
}

export async function analyzeUserProfile(user: AuthenticatedUser, payload: unknown): Promise<UserProfileAnalyzeResponse> {
  if (user.isAdmin) {
    throw serviceError(403, 'admin account is read-only');
  }

  const { fromDate, toDate } = resolveAnalyzeRange(payload);
  const reviews = await loadReviews(user.id, fromDate, toDate);
  const candidates = extractProfileEvidenceFromReviews(reviews);

  try {
    await pool.query(
      'DELETE FROM user_profile_evidence WHERE user_id = ? AND review_date BETWEEN ? AND ?',
      [user.id, fromDate, toDate],
    );
    for (const candidate of candidates) {
      await insertEvidence(user.id, candidate);
    }
    await refreshTraitAggregates(user.id);
    await recordRun(user.id, fromDate, toDate, 'success', candidates.length);

    const traits = await selectTraits(user.id);
    return {
      ok: true,
      evidenceCount: candidates.length,
      traitCount: traits.filter((trait) => trait.support_count > 0).length,
      model: 'local-rules',
    };
  } catch (error) {
    await recordRun(
      user.id,
      fromDate,
      toDate,
      'failed',
      candidates.length,
      error instanceof Error ? error.message.slice(0, 500) : 'unknown error',
    );
    throw error;
  }
}

export async function loadEnabledProfileTraitsForIntake(
  userId: number,
  limit = 4,
): Promise<UserProfileTraitRecord[]> {
  const [rows] = await pool.query(
    `SELECT id, trait_key, title, generated_summary, user_summary, impact_ratio, confidence,
            support_count, enabled, last_evidence_date, updated_at
     FROM user_profile_traits
     WHERE user_id = ? AND enabled = 1 AND support_count > 0 AND impact_ratio > 0
     ORDER BY impact_ratio DESC, confidence DESC, support_count DESC
     LIMIT ?`,
    [userId, limit],
  );
  return Array.isArray(rows) ? (rows as TraitRow[]).map((row) => mapTrait(row)) : [];
}
