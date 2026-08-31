import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '@plainlist/shared';
const query = vi.fn(); const resolveAiConfigForUser = vi.fn(); const chatComplete = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock('../ai-intake/settings', () => ({ resolveAiConfigForUser: (...args: unknown[]) => resolveAiConfigForUser(...args) }));
vi.mock('../ai-shared/llm', () => ({ chatComplete: (...args: unknown[]) => chatComplete(...args) }));
import { generateDailyDigest } from './daily';
const user = { id: 1, username: 'u', isAdmin: false };
describe('persistent daily digest', () => {
 beforeEach(() => { query.mockReset(); resolveAiConfigForUser.mockReset(); chatComplete.mockReset(); });
 it('returns a ready cache without invoking the provider when fact hash is unchanged', async () => {
   const facts = [{ id: 1, fact_hash: 'a', category: 'output', summary: '发布', output_state: 'produced', exploration_state: 'not_applicable' }];
   query.mockResolvedValueOnce([facts])
     .mockResolvedValueOnce([[{ status: 'ready', input_hash: canonicalHash({ promptVersion: 'daily-v1', facts: facts.map(({ fact_hash, ...fact }) => ({ ...fact, factHash: fact_hash })) }), content: JSON.stringify({ mainProgress:'发布', outputs:['发布'], learnings:[], unresolved:[], evidenceFactIds:[1] }) }]]);
   const result = await generateDailyDigest(user, '2026-08-30');
   expect(result.status).toBe('ready'); expect(result.cached).toBe(true); expect(chatComplete).not.toHaveBeenCalled();
 });
});
