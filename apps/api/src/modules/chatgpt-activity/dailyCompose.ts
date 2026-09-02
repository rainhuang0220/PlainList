import { chineseCharCount, type DailySummaryInput, type DailyTopicStatus } from './dailyNormalize';

export type DailyCompositionMode = 'model' | 'fallback';

export interface DailyComposeResult {
  text: string;
  compositionMode: DailyCompositionMode;
  providerCalled: boolean;
}

const GENERIC_FILLER = /取得了一定进展|开展了相关工作|进行了多方面探索/;
const KEYWORD_DUMP = /本地优先现场场景|数字化工作台|封板结果|工作树干净|基线已核对/;

const SYSTEM_PROMPT = [
  '根据下面已经提取好的用户活动事实，写一段当天活动记录。',
  '规则：',
  '- 只写提供的事实',
  '- 不猜测',
  '- 不扩展',
  '- 一个自然段',
  '- 使用完整中文句子',
  '- 80–200 字，事实少时可以更短',
  '- 按重要程度组织',
  '- 合并同一项目',
  '- completed / discussed / planned 必须准确',
  '- 删除 DOI / URL / hash / 数字垃圾',
  '- 保留有意义的项目名、论文主题、模型名、版本号',
  '- 不使用“取得了一定进展”等空话',
  '- 不列点',
  '- 不加标题',
  '只返回正文。',
].join('\n');

const REPAIR_PROMPT = [
  '上一次输出不合格。',
  '只返回一段完整中文，不要标题、列表、Markdown、DOI、URL 或关键词拼接。',
  '必须是可以读通的句子，通常 80 到 200 字。',
].join('');

function joinNames(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]}和${labels[1]}`;
  return `${labels.slice(0, -1).join('、')}和${labels[labels.length - 1]}`;
}

function clipToLimit(paragraph: string, limit = 200): string {
  if (chineseCharCount(paragraph) <= limit) return paragraph;
  const sentences = paragraph.split(/(?<=[。；])/u).filter(Boolean);
  let next = '';
  for (const sentence of sentences) {
    const trial = `${next}${sentence}`;
    if (chineseCharCount(trial) > limit) break;
    next = trial;
  }
  const text = next.trim() || paragraph;
  if (chineseCharCount(text) <= limit) {
    return /[。；]$/u.test(text) ? text.replace(/；$/u, '。') : `${text.replace(/[。；]?$/u, '')}。`;
  }
  return `${Array.from(text.replace(/。$/u, '')).slice(0, Math.max(1, limit - 1)).join('')}。`;
}

export function isReadableDailyParagraph(text: string): boolean {
  const value = text.trim();
  if (!value || value.includes('\n') || /^## /.test(value) || value.includes('### ')) return false;
  if (!/。/.test(value)) return false;
  if (/\b10\.\d{4,9}/.test(value) || /https?:\/\//i.test(value) || /\b(?:19|20)\d{2}\.\d+/.test(value)) return false;
  if (GENERIC_FILLER.test(value) || KEYWORD_DUMP.test(value)) return false;
  if (/(^|\n)[-*] /.test(value) || /推进[\u4e00-\u9fffA-Za-z]+ [\u4e00-\u9fff]{2,}/.test(value)) return false;
  if (/完了(?!成)/.test(value) || /当取|当天户|相关活动。$/.test(value)) return false;
  if (/[“”"]/.test(value) && (value.match(/[“”"]/g) ?? []).length % 2 !== 0) return false;
  if (!/今天|当天|完成了|继续|讨论了|确定了/.test(value)) return false;
  const count = chineseCharCount(value);
  return count > 12 && count <= 280;
}

function clauseFromTopic(topic: DailySummaryInput['topics'][number]): string {
  const fact = topic.facts[0]?.replace(/。$/u, '').replace(/^当天/, '') ?? '';
  if (fact) return fact;
  const verb: Record<DailyTopicStatus, string> = {
    completed: `完成了${topic.name}相关工作`,
    progress: `继续推进${topic.name}`,
    planned: `确定了${topic.name}的下一步`,
    discussed: `讨论了${topic.name}`,
  };
  return verb[topic.status];
}

export function composeReadableFallback(input: DailySummaryInput): string {
  const topics = input.topics.slice(0, 4);
  if (!topics.length) return '';
  if (topics.length === 1) {
    const only = topics[0].facts[0] || `当天继续推进${topics[0].name}。`;
    return only.replace(/^当天/, '今天');
  }

  const completed = topics.filter((topic) => topic.status === 'completed');
  const openingNames = (completed.length ? completed : topics.slice(0, 2)).map((topic) => topic.name);
  const opening = completed.length
    ? `今天主要完成了${joinNames(openingNames)}相关工作。`
    : `今天主要推进${joinNames(openingNames)}。`;

  const clauses = topics.map((topic, index) => {
    const clause = clauseFromTopic(topic);
    if (index === 0 || clause.includes(topic.name)) return clause;
    if (topic.status === 'discussed' || topic.status === 'planned' || topic.status === 'progress') {
      return `${topic.name}方面${clause}`;
    }
    return `${topic.name}${clause}`;
  });

  return clipToLimit(`${opening}${clauses.join('；')}。`);
}

function compactPayload(input: DailySummaryInput) {
  return {
    date: input.date,
    topics: input.topics.map((topic) => ({
      name: topic.name,
      status: topic.status,
      facts: topic.facts,
    })),
  };
}

export async function composeDailyJournal(
  input: DailySummaryInput,
  options: {
    tryModel: boolean;
    complete?: (request: { system: string; user: string }) => Promise<string>;
  },
): Promise<DailyComposeResult> {
  const fallback = composeReadableFallback(input);
  if (!input.topics.length) {
    return { text: fallback, compositionMode: 'fallback', providerCalled: false };
  }
  if (!options.tryModel || !options.complete) {
    return { text: fallback, compositionMode: 'fallback', providerCalled: false };
  }

  const payload = JSON.stringify(compactPayload(input));
  try {
    const first = (await options.complete({ system: SYSTEM_PROMPT, user: payload })).trim();
    if (isReadableDailyParagraph(first)) {
      return { text: first.replace(/\s+/g, ''), compositionMode: 'model', providerCalled: true };
    }
    const second = (await options.complete({
      system: `${SYSTEM_PROMPT}\n${REPAIR_PROMPT}`,
      user: payload,
    })).trim();
    if (isReadableDailyParagraph(second)) {
      return { text: second.replace(/\s+/g, ''), compositionMode: 'model', providerCalled: true };
    }
  } catch {
    return { text: fallback, compositionMode: 'fallback', providerCalled: true };
  }
  return { text: fallback, compositionMode: 'fallback', providerCalled: true };
}
