import { describe, expect, it } from 'vitest';
import { extractJsonObject, repairTruncatedJson, stripModelArtifacts } from './llm';

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
