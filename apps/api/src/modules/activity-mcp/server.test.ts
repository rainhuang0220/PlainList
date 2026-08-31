import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCP_ACTIVITY_WRITE_SCOPE, MCP_CONTEXT_READ_SCOPE } from './oauth/service';
import { createActivityMcpServer, MCP_TOOL_INPUT_MAX_BYTES } from './server';

const user = { id: 7, username: 'reader', isAdmin: false };
const digest = {
  sourceExternalId: 'chat-123', idempotencyKey: 'digest-chat-123', dateKey: '2026-08-30',
  conversationTitle: 'Remote MCP', topic: 'Integration', summary: 'Implemented a compact MCP adapter.',
  activities: ['Read official protocol'], outputs: ['Working adapter'], learnings: [], decisions: [], unresolved: [],
  candidateGoalRelations: [],
};

async function connected(scopes = [MCP_ACTIVITY_WRITE_SCOPE, MCP_CONTEXT_READ_SCOPE], overrides: Record<string, unknown> = {}) {
  const appendDigest = vi.fn().mockResolvedValue({ sourceId: 44, factCount: 2, created: true });
  const listGoals = vi.fn().mockResolvedValue([{
    id: 3, title: 'Publish research', description: 'Finish the paper', priorityRank: 0,
    timeHorizon: 'near_term', status: 'active', domain: 'research', successSignals: ['submitted'], antiGoals: [],
    version: 1, createdAt: 'private', updatedAt: 'private',
  }]);
  const getContext = vi.fn().mockResolvedValue({ weekStart: '2026-08-24', status: 'ready', goals: [],
    intelligence: { summary: 'A compact week.' }, daily: [] });
  const dependencies = { appendDigest, listGoals, getContext, ...overrides };
  const server = createActivityMcpServer({ user, scopes, clientId: 'test-client' }, dependencies);
  const client = new Client({ name: 'plainlist-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { appendDigest, listGoals, getContext, server, client };
}

const resources: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(resources.splice(0).map((resource) => resource.close()));
});

describe('PlainList activity MCP tools', () => {
  it('initializes and exposes exactly the three scoped activity tools', async () => {
    const { client, server } = await connected();
    resources.push(client, server);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(['save_activity_digest', 'get_goals', 'get_week_context']);
    expect(listed.tools.find((tool) => tool.name === 'save_activity_digest')?.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: false, idempotentHint: true,
    });
  });

  it.each([
    [{ sourceId: 44, factCount: 2, created: true }, 'created'],
    [{ sourceId: 44, factCount: 0, created: false }, 'unchanged'],
    [{ sourceId: 44, factCount: 3, created: false }, 'updated'],
  ])('adapts digest ingestion result %# without triggering any generation service', async (ingest, status) => {
    const appendDigest = vi.fn().mockResolvedValue(ingest);
    const { client, server } = await connected(undefined, { appendDigest });
    resources.push(client, server);
    const result = await client.callTool({ name: 'save_activity_digest', arguments: digest });

    expect(result.structuredContent).toMatchObject({ status, sourceId: 44, savedDateKey: '2026-08-30' });
    expect(appendDigest).toHaveBeenCalledWith(user, digest);
  });

  it('rejects oversized or invalid digest args before the application service', async () => {
    const appendDigest = vi.fn();
    const { client, server } = await connected(undefined, { appendDigest });
    resources.push(client, server);
    const oversized = { ...digest, summary: 'x'.repeat(MCP_TOOL_INPUT_MAX_BYTES) };
    const tooLarge = await client.callTool({ name: 'save_activity_digest', arguments: oversized });
    const invalidDate = await client.callTool({ name: 'save_activity_digest', arguments: { ...digest, dateKey: '2026-02-30' } });
    const forgedIdentity = await client.callTool({ name: 'save_activity_digest', arguments: { ...digest, userId: 999 } });

    expect(tooLarge.isError).toBe(true);
    expect(invalidDate.isError).toBe(true);
    expect(forgedIdentity.isError).toBe(true);
    expect(appendDigest).not.toHaveBeenCalled();
  });

  it('returns active goals through a compact projection without internal metadata', async () => {
    const { client, server, listGoals } = await connected();
    resources.push(client, server);
    const result = await client.callTool({ name: 'get_goals', arguments: {} });
    const serialized = JSON.stringify(result.structuredContent);

    expect(result.structuredContent).toMatchObject({ goals: [{ id: 3, title: 'Publish research', priority: 0 }] });
    expect(serialized).not.toMatch(/version|createdAt|updatedAt|userId|antiGoals/);
    expect(listGoals).toHaveBeenCalledWith(user, false);
  });

  it('bounds the goals projection even if the account has many large active goals', async () => {
    const manyGoals = Array.from({ length: 30 }, (_, id) => ({
      id: id + 1, title: `Goal ${id + 1}`, description: 'd'.repeat(4000), priorityRank: id,
      timeHorizon: 'near_term' as const, status: 'active' as const, domain: 'research',
      successSignals: Array.from({ length: 12 }, () => 's'.repeat(240)), antiGoals: [],
      version: 1, createdAt: '', updatedAt: '',
    }));
    const { client, server } = await connected(undefined, { listGoals: vi.fn().mockResolvedValue(manyGoals) });
    resources.push(client, server);
    const result = await client.callTool({ name: 'get_goals', arguments: {} });
    const goals = (result.structuredContent as { goals: Array<{ description: string; successSignals: string[] }> }).goals;
    expect(goals).toHaveLength(20);
    expect(goals[0].description).toHaveLength(600);
    expect(goals[0].successSignals).toHaveLength(6);
  });

  it('returns only the requested compact week context', async () => {
    const { client, server, getContext } = await connected();
    resources.push(client, server);
    const result = await client.callTool({ name: 'get_week_context', arguments: { weekStart: '2026-08-24' } });
    expect(result.structuredContent).toMatchObject({ weekStart: '2026-08-24', status: 'ready' });
    expect(getContext).toHaveBeenCalledWith(user, '2026-08-24');
  });

  it('rejects a tool call when its narrow OAuth scope is absent', async () => {
    const { client, server, appendDigest } = await connected([MCP_CONTEXT_READ_SCOPE]);
    resources.push(client, server);
    const result = await client.callTool({ name: 'save_activity_digest', arguments: digest });
    expect(result.isError).toBe(true);
    expect(appendDigest).not.toHaveBeenCalled();
  });

  it('returns protocol errors for unknown tools', async () => {
    const { client, server } = await connected();
    resources.push(client, server);
    const result = await client.callTool({ name: 'delete_everything', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/not found/i);
  });
});
