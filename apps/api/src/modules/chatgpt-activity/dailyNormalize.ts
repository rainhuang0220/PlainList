import { chineseWordCount, ensurePeriod, isCompleteSemanticFact, isKeywordDump } from './semanticFact';

export interface ChatgptJournalFact {
  id: number;
  sourceId: number;
  category: string;
  title: string;
  outputState: string;
  summary?: string;
  topic?: string;
}

export type DailyTopicStatus = 'completed' | 'progress' | 'planned' | 'discussed';

export interface DailyTopicInput {
  name: string;
  status: DailyTopicStatus;
  facts: string[];
}

export interface DailySummaryInput {
  date: string;
  topics: DailyTopicInput[];
}

const TRIVIA_TITLE = /^(今天)?(天气怎么样|天气|气温|会下雨吗|几点了?|hello|hi|你好|在吗|谢谢)([?？!！.。])?$/i;
const HASH_OR_ID = /\b(?:[0-9a-f]{12,}|sourceExternalId|conversation_id)\b/i;
const DOI = /\b10\.\d{4,9}\/[^\s，。；;]+|\b10\.\d{4,9}\b/g;
const URL = /https?:\/\/\S+/gi;
const YEAR_FRAGMENT = /\b(?:19|20)\d{2}\.\d+\b/g;
const BARE_YEAR = /(?<![A-Za-z])(?:19|20)\d{2}(?![A-Za-z0-9])/g;
const SHORT_HASH = /\b[0-9a-f]{7,}\b/gi;
const GENERIC_FILLER = /取得了一定进展|开展了相关工作|进行了多方面探索/;
const INTERNAL = /没有可提取的用户|无有效活动|\bextract\b|\bfallback\b|\bconversation\b|用户消息|对话标题|无论你怎么收口/i;
const TITLE_LIKE = /^(Related Work Structure Analysis|最终产品 是一个本地优先现场场景)/i;
const KNOWN_TOPICS: Array<{ name: string; match: RegExp }> = [
  { name: 'PlainList', match: /plainlist/i },
  { name: 'Foreshadow', match: /foreshadow/i },
  { name: '论文', match: /论文|related work|相关工作/i },
  { name: 'ChatGPT 活动记录', match: /chatgpt|活动记录|ai ?小记|每日小记/i },
  { name: '用户画像', match: /用户画像|recency/i },
  { name: 'Desktop', match: /titlebar|\bdesktop\b/i },
  { name: '学习', match: /huggingface|transformers|学习/i },
];

export function chineseCharCount(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

export function scrubFactText(text: string): string {
  return text
    .replace(URL, ' ')
    .replace(DOI, ' ')
    .replace(YEAR_FRAGMENT, ' ')
    .replace(SHORT_HASH, ' ')
    .replace(HASH_OR_ID, ' ')
    .replace(BARE_YEAR, ' ')
    .replace(/[|/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTriviaActivityTitle(title: string): boolean {
  const text = scrubFactText(title);
  return text.length < 2 || TRIVIA_TITLE.test(text) || HASH_OR_ID.test(text);
}

function topicName(text: string, fallback?: string): string {
  if (fallback && fallback.trim() && fallback !== '工作') return fallback.trim();
  for (const topic of KNOWN_TOPICS) {
    if (topic.match.test(text)) return topic.name;
  }
  const cleaned = scrubFactText(text).replace(/[，,。]/g, '').trim();
  const label = Array.from(cleaned).slice(0, 8).join('') || '相关工作';
  return label;
}

function statusFor(fact: ChatgptJournalFact): DailyTopicStatus {
  if (fact.outputState === 'produced') return 'completed';
  if (fact.category === 'planning' || /计划|下一步/.test(`${fact.title} ${fact.summary ?? ''}`)) return 'planned';
  if (fact.outputState === 'partial') return 'progress';
  return 'discussed';
}

function importance(status: DailyTopicStatus): number {
  return { completed: 0, progress: 1, planned: 2, discussed: 3 }[status];
}

function completeSentenceFor(fact: ChatgptJournalFact): string | null {
  const candidates = [fact.summary, fact.title]
    .map((item) => ensurePeriod(scrubFactText(String(item || ''))))
    .filter(Boolean);
  for (const candidate of candidates) {
    if (INTERNAL.test(candidate) || TITLE_LIKE.test(candidate) || GENERIC_FILLER.test(candidate)) continue;
    if (isTriviaActivityTitle(candidate) || isKeywordDump(candidate)) continue;
    if (!isCompleteSemanticFact(candidate)) continue;
    if (chineseWordCount(candidate) < 8) continue;
    return candidate;
  }
  return null;
}

export function normalizeDailyFacts(date: string, facts: ChatgptJournalFact[]): DailySummaryInput {
  const groups = new Map<string, DailyTopicInput>();
  const ranked = [...facts]
    .map((fact) => ({ fact, sentence: completeSentenceFor(fact), status: statusFor(fact) }))
    .filter((item) => item.sentence)
    .sort((left, right) => (
      importance(left.status) - importance(right.status) || left.fact.id - right.fact.id
    ));

  for (const item of ranked) {
    const sentence = item.sentence as string;
    const name = topicName(`${sentence} ${item.fact.summary ?? ''} ${item.fact.title}`, item.fact.topic);
    if (INTERNAL.test(name) || TITLE_LIKE.test(name)) continue;
    const existing = groups.get(name);
    if (!existing) {
      groups.set(name, { name, status: item.status, facts: [sentence] });
      continue;
    }
    if (importance(item.status) < importance(existing.status)) existing.status = item.status;
    if (existing.facts.length < 2 && !existing.facts.includes(sentence)) existing.facts.push(sentence);
  }

  const topics = [...groups.values()]
    .sort((left, right) => importance(left.status) - importance(right.status))
    .slice(0, 4);

  return { date, topics };
}
