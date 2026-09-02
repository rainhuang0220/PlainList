import { describe, expect, it } from 'vitest';
import { isCompleteSemanticFact } from './semanticFact';

describe('isCompleteSemanticFact', () => {
  it('accepts independently readable Chinese facts and rejects titles or residue', () => {
    expect(isCompleteSemanticFact('完成 PlainList v2.4.4 的 AI 小记界面重写，并验证历史 Daily Journal 已重新生成。')).toBe(true);
    expect(isCompleteSemanticFact('讨论了论文 Related Work 的结构，并核对了几篇参考文献。')).toBe(true);
    expect(isCompleteSemanticFact('计划第二天继续测试 chatgpt-local-sync 的增量同步。')).toBe(true);
    expect(isCompleteSemanticFact('完成 PlainList UI')).toBe(false);
    expect(isCompleteSemanticFact('Related Work Structure Analysis')).toBe(false);
    expect(isCompleteSemanticFact('没有可提取的用户活动')).toBe(false);
    expect(isCompleteSemanticFact('无论你怎么收口')).toBe(false);
    expect(isCompleteSemanticFact('10.1109 参考文献')).toBe(false);
    expect(isCompleteSemanticFact('用户消息')).toBe(false);
  });
});
