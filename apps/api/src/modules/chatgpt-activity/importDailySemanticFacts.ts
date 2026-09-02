import type { AuthenticatedUser } from '@plainlist/shared';
import { pool } from '../../db/pool';
import { isCompleteSemanticFact } from './semanticFact';

export interface ImportedDailySemanticFact {
  topic: string;
  status: 'completed' | 'progress' | 'planned' | 'discussed';
  summary: string;
  dateKey: string;
  occurredAt?: string;
  sourceConversationId?: string;
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof value === 'object') return { ...(value as Record<string, unknown>) };
  return {};
}

export async function importDailySemanticFacts(
  user: AuthenticatedUser,
  factsByConversation: Record<string, ImportedDailySemanticFact[]>,
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  for (const [conversationId, facts] of Object.entries(factsByConversation)) {
    const usable = facts.filter((fact) => isCompleteSemanticFact(fact.summary));
    if (!usable.length) {
      skipped += 1;
      continue;
    }
    const [rows] = await pool.query(
      `SELECT id, compact_payload FROM activity_sources
       WHERE user_id = ? AND source_type = 'chatgpt-local-sync' AND status = 'active' AND external_id = ?
       LIMIT 1`,
      [user.id, conversationId],
    );
    const row = Array.isArray(rows) ? rows[0] as { id: number; compact_payload: unknown } | undefined : undefined;
    if (!row) {
      skipped += 1;
      continue;
    }
    const payload = parsePayload(row.compact_payload);
    payload.dailySemanticFacts = usable.map((fact) => ({
      topic: fact.topic,
      status: fact.status,
      summary: fact.summary,
      dateKey: fact.dateKey,
      occurredAt: fact.occurredAt,
      sourceConversationId: fact.sourceConversationId || conversationId,
    }));
    await pool.query(
      'UPDATE activity_sources SET compact_payload = ? WHERE id = ? AND user_id = ?',
      [JSON.stringify(payload), row.id, user.id],
    );
    updated += 1;
  }
  return { updated, skipped };
}
