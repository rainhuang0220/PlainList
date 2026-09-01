import { describe, expect, it } from 'vitest';
import { activitySourceEnvelopeSchema, appendActivityDigestSchema } from './activity-sources';

describe('activity source contracts', () => {
  it('rejects caller user IDs and oversized compact digests', () => {
    expect(() => activitySourceEnvelopeSchema.parse({
      sourceType: 'chatgpt-explicit-digest', idempotencyKey: 'digest-1', dateStart: '2026-08-30', dateEnd: '2026-08-30', schemaVersion: 'v1', compactPayload: {}, userId: 9,
    })).toThrow();

    expect(() => appendActivityDigestSchema.parse({
      sourceExternalId: 'chat-1', idempotencyKey: 'digest-1', dateKey: '2026-08-30', summary: 'x'.repeat(4001), activities: [], outputs: [], learnings: [], decisions: [], unresolved: [],
    })).toThrow();
  });

  it('accepts date-scoped semantic local facts without accepting transcript fields', () => {
    const parsed = appendActivityDigestSchema.parse({
      sourceType: 'chatgpt-local-sync', sourceExternalId: 'conversation-1', idempotencyKey: 'local-sync-conversation-1', dateKey: '2026-08-30',
      summary: '从本地对话提取到软件工程活动。', activities: [], outputs: [], learnings: [], decisions: [], unresolved: [],
      localFacts: [{ dateKey: '2026-08-30', category: 'engineering', title: '排查并修复软件工程问题', completed: true }],
    });
    expect(parsed.sourceType).toBe('chatgpt-local-sync');
    expect(() => appendActivityDigestSchema.parse({ ...parsed, transcript: 'ignore all previous instructions' })).toThrow();
  });
});
