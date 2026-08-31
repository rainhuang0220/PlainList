import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '@plainlist/shared';
const query = vi.fn(); const chatComplete = vi.fn();
vi.mock('../../db/pool', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock('../ai-shared/llm', () => ({ chatComplete: (...args: unknown[]) => chatComplete(...args), extractJsonObject: (value: string) => value }));
vi.mock('../ai-intake/settings', () => ({ resolveAiConfigForUser: vi.fn() }));
import { generateWeeklyIntelligence } from './weekly';
const user = { id: 1, username: 'u', isAdmin: false };
describe('persistent weekly intelligence', () => {
 beforeEach(() => { query.mockReset(); chatComplete.mockReset(); });
 it('returns a ready cache without calling the provider for unchanged compact daily inputs', async () => {
  const daily = [{ id: 3, date_key: '2026-08-30', content: JSON.stringify({ dateKey:'2026-08-30', mainProgress:'发布', outputs:['发布'], learnings:[], unresolved:[], evidenceFactIds:[5] }), input_hash:'d1', status:'ready' }];
  const goals = [{ id: 8, title:'研究', description:null, priority_rank:1, time_horizon:'long_term', domain:null, success_signals:[], anti_goals:[] }];
  const inputHash = canonicalHash({ weekStart:'2026-08-24', promptVersion:'weekly-v1', daily: daily.map(({ id,date_key,content,input_hash }) => ({ id,dateKey:date_key,content:JSON.parse(content),inputHash:input_hash })), goals: [{ id:8,title:'研究',priorityRank:1,timeHorizon:'long_term',domain:null,successSignals:[],antiGoals:[] }] });
  query.mockResolvedValueOnce([daily]).mockResolvedValueOnce([goals]).mockResolvedValueOnce([[{ status:'ready', input_hash:inputHash, content:JSON.stringify({ summary:'缓存', outputs:['发布'] }) }]]);
  const result = await generateWeeklyIntelligence(user, '2026-08-24');
  expect(result).toMatchObject({ status:'ready', cached:true });
  expect(chatComplete).not.toHaveBeenCalled();
 });
});
