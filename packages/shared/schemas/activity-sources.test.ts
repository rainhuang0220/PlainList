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
});
