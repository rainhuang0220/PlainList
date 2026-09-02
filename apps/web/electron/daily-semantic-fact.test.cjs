const assert = require('node:assert/strict');
const test = require('node:test');
const { parseArchive } = require('./chatgpt-local-sync.cjs');
const {
  extractDailySemanticFacts,
  isCompleteSemanticFact,
} = require('./daily-semantic-fact.cjs');

function archiveFrom(title, messages) {
  return parseArchive({
    conversation_id: 'conv-test',
    title,
    update_time: messages.at(-1)?.occurred_at || '2026-09-01T10:00:00.000Z',
    messages,
  });
}

test('keeps a complete user sentence instead of joining keywords', () => {
  const archive = archiveFrom('PlainList scheduler stale lease debugging', [
    {
      message_id: 'u1',
      role: 'user',
      occurred_at: '2026-09-01T10:00:00.000Z',
      content: '我今天完成了 PlainList 2.4.4 的 UI 重写，并重新生成历史 Daily。',
    },
  ]);

  const facts = extractDailySemanticFacts(archive);

  assert.equal(facts.length, 1);
  assert.equal(isCompleteSemanticFact(facts[0].summary), true);
  assert.match(facts[0].summary, /PlainList/);
  assert.match(facts[0].summary, /2\.4\.4/);
  assert.match(facts[0].summary, /UI 重写|界面重写/);
  assert.match(facts[0].summary, /Daily/);
  assert.equal(facts[0].summary.includes('完成 PlainList UI 历史 Daily'), false);
  assert.equal(/完成PlainList/.test(facts[0].summary) && !/的/.test(facts[0].summary), false);
  assert.equal(facts[0].summary.includes('PlainList scheduler stale lease debugging'), false);
  assert.equal(facts[0].status, 'completed');
});

test('never copies the conversation title into a semantic fact', () => {
  const archive = archiveFrom('Related Work Structure Analysis', [
    {
      message_id: 'u1',
      role: 'user',
      occurred_at: '2026-09-01T04:30:00.000Z',
      content: 'II. RELATED WORK A. U-Net Medical image segmentation is one of the important tasks [11,12,13]. doi:10.1109/TMI.2016.2644615',
    },
    {
      message_id: 'u2',
      role: 'user',
      occurred_at: '2026-09-01T04:35:00.000Z',
      content: '这是完全两篇论文，第一篇是已经录用的2025cscwd，第二篇是我们准备投的，而且你在相关工作B中间提到cscwd的文章多少有些不合适。包括有出现乱加参考文献的情况。',
    },
  ]);

  const facts = extractDailySemanticFacts(archive);
  const blob = JSON.stringify(facts);

  assert.ok(facts.length >= 1);
  assert.equal(blob.includes('Related Work Structure Analysis'), false);
  assert.equal(facts.every((fact) => isCompleteSemanticFact(fact.summary)), true);
  assert.equal(facts.some((fact) => /论文/.test(fact.summary) && /区分|参考文献|相关工作/.test(fact.summary)), true);
  assert.equal(facts.every((fact) => !/^讨论了这是/.test(fact.summary)), true);
  assert.equal(facts.every((fact) => !/包括有出现/.test(fact.summary)), true);
  assert.equal(/\b10\.\d{4}/.test(blob), false);
});

test('drops extractor residue, prompt-only turns, and citation dumps', () => {
  const archive = archiveFrom('核对论文引用', [
    {
      message_id: 'u1',
      role: 'user',
      occurred_at: '2026-09-01T08:04:00.000Z',
      content: 'P. Morice, A. Leary, “Endometrial cancer,” Lancet, vol. 387, pp. 1094–1108, 2016. 10.1109/TMI.2016.2644615',
    },
    {
      message_id: 'u2',
      role: 'user',
      occurred_at: '2026-09-01T08:05:00.000Z',
      content: '来grok提示词',
    },
    {
      message_id: 'u3',
      role: 'user',
      occurred_at: '2026-09-01T08:06:00.000Z',
      content: '没有可提取的用户活动。',
    },
  ]);

  const facts = extractDailySemanticFacts(archive);
  assert.deepEqual(facts, []);
});

test('does not keep 无论你怎么收口 as a fact and records the planned product test instead', () => {
  const archive = archiveFrom('Foreshadow进度与下一步', [
    {
      message_id: 'u1',
      role: 'user',
      occurred_at: '2026-09-01T16:00:00.000Z',
      content: '无论你怎么收口，测试，重构，这都是最后一个晚上，明天我会直接产品测试。一晚上，你可以选择草草收尾，也可以精心测试。直接生成给grok的提示词',
    },
    {
      message_id: 'u2',
      role: 'user',
      occurred_at: '2026-09-01T16:10:00.000Z',
      content: 'Foreshadow Beta 总结。结论：可以当产品用。请装 v0.2.1。',
    },
  ]);

  const facts = extractDailySemanticFacts(archive);
  const blob = JSON.stringify(facts);

  assert.ok(facts.length >= 1);
  assert.equal(blob.includes('无论你怎么收口'), false);
  assert.equal(blob.includes('给grok的提示词'), false);
  assert.equal(blob.includes('草草收尾'), false);
  assert.equal(facts.every((fact) => isCompleteSemanticFact(fact.summary)), true);
  assert.equal(facts.some((fact) => /Foreshadow/.test(fact.summary) && /计划第二天|产品测试/.test(fact.summary)), true);
});

test('drops questions, image pointers and status dumps instead of wrapping them', () => {
  const archive = archiveFrom('plainlist', [
    {
      message_id: 'u1',
      role: 'user',
      occurred_at: '2026-08-31T10:00:00.000Z',
      content: '那你觉得这个项目叫什么名称比较好呢？[image_asset_pointer: sediment://file_000000004c2481fda531b37cbedb71c6] 封板结果 HEAD 3b68268，main，工作树干净。',
    },
    {
      message_id: 'u2',
      role: 'user',
      occurred_at: '2026-08-31T10:05:00.000Z',
      content: '本轮已完成并处理了完整回归中发现的 PlainList 生产构建问题。',
    },
  ]);
  const facts = extractDailySemanticFacts(archive);
  const blob = JSON.stringify(facts);
  assert.equal(blob.includes('叫什么名称'), false);
  assert.equal(blob.includes('image_asset_pointer'), false);
  assert.equal(blob.includes('工作树干净'), false);
  assert.equal(blob.includes('讨论了如何'), false);
  assert.ok(facts.some((fact) => /PlainList/.test(fact.summary) && /生产构建|回归/.test(fact.summary)));
});

test('isCompleteSemanticFact rejects titles, keyword dumps and internal phrasing', () => {
  assert.equal(isCompleteSemanticFact('完成 PlainList UI'), false);
  assert.equal(isCompleteSemanticFact('完成PlainList UI 历史 Daily'), false);
  assert.equal(isCompleteSemanticFact('Related Work Structure Analysis'), false);
  assert.equal(isCompleteSemanticFact('没有可提取的用户活动'), false);
  assert.equal(isCompleteSemanticFact('10.1109 参考文献'), false);
  assert.equal(isCompleteSemanticFact('无论你怎么收口'), false);
  assert.equal(
    isCompleteSemanticFact('完成 PlainList v2.4.4 的 AI 小记界面重写，并验证历史 Daily Journal 已重新生成。'),
    true,
  );
  assert.equal(isCompleteSemanticFact('讨论了论文 Related Work 的结构，并核对了几篇参考文献。'), true);
  assert.equal(isCompleteSemanticFact('计划第二天继续测试 chatgpt-local-sync 的增量同步。'), true);
});
