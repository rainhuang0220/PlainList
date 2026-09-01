import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatComplete, extractJsonObject, repairTruncatedJson, stripModelArtifacts } from './llm';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('stripModelArtifacts', () => {
  it('removes MiniMax thinking blocks before JSON parse', () => {
    const tag = `${'redacted'}_${'thinking'}`;
    const raw = `<${tag}>planning...</${tag}>
{"items":[{"name":"开会","type":"todo","time":"15:00"}]}`;
    expect(stripModelArtifacts(raw)).toBe(
      '{"items":[{"name":"开会","type":"todo","time":"15:00"}]}',
    );
  });
});

describe('extractJsonObject', () => {
  it('extracts JSON after Flash model reasoning preamble', () => {
    const raw = '我们分析用户输入。今天是2026-07-03，用户说「明天」…\n{"items":[{"name":"学习","type":"todo","time":"09:00"}],"discarded":[]}';
    expect(extractJsonObject(raw)).toBe('{"items":[{"name":"学习","type":"todo","time":"09:00"}],"discarded":[]}');
  });
});

describe('repairTruncatedJson', () => {
  it('closes JSON truncated mid-field', () => {
    const raw = '{"items":[{"name":"抢今日选修课","type":"todo","time":"10:00"},{"name":"打CS","type":"todo","time":"09:00","note":"连续5小时"}],"discarded":[]';
    const repaired = repairTruncatedJson(raw);
    expect(repaired).toBeTruthy();
    const parsed = JSON.parse(repaired!) as { items: unknown[] };
    expect(parsed.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('chatComplete timeout boundary', () => {
  it('aborts an unfinished provider request at the requested hard timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    })));

    const request = chatComplete({
      provider: 'openai',
      baseUrl: 'https://provider.example/v1',
      model: 'safe-model',
      apiKey: 'test-key',
      timeoutMs: 30_000,
      anthropicVersion: '2023-06-01',
      source: 'user',
    }, {
      system: 'test',
      user: 'test',
      timeoutMs: 60_000,
    });

    const assertion = expect(request).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });
});
