export interface ChatgptJournalFact {
  id: number;
  sourceId: number;
  category: string;
  title: string;
  outputState: string;
  summary?: string;
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
const KEYWORD_DUMP = /本地优先现场场景|数字化工作台|封板结果|工作树干净|基线已核对/;
const GENERIC_FILLER = /取得了一定进展|开展了相关工作|进行了多方面探索/;
const LEADING_VERB = /^(继续|再次|反复)?(完成了|推进了|讨论了|梳理了|确定了|计划了|修改了|核对了|调整了|修复了|排查了|确认了|完成|推进|讨论|梳理|排查|确定|计划|修改|核对|调整|修复|确认|研究|学习)/;
const KNOWN_TOPICS: Array<{ name: string; match: RegExp }> = [
  { name: 'PlainList', match: /plainlist/i },
  { name: 'Foreshadow', match: /foreshadow/i },
  { name: '论文', match: /论文|related work|相关工作/i },
  { name: 'ChatGPT 活动记录', match: /chatgpt|活动记录|ai ?小记|每日小记/i },
  { name: '用户画像', match: /用户画像|recency/i },
  { name: 'Desktop', match: /titlebar|\bdesktop\b/i },
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

function isKeywordDump(title: string): boolean {
  if (KEYWORD_DUMP.test(title)) return true;
  const tokens = title.trim().split(/\s+/).filter(Boolean);
  return tokens.length >= 5 && !/[的了与和，,]/.test(title);
}

function stripLeadingVerb(title: string): string {
  return title.trim().replace(/[。！？.!?]+$/u, '').replace(LEADING_VERB, '').trim();
}

function leadAction(title: string): string {
  const match = LEADING_VERB.exec(title.trim());
  return (match?.[2] ?? '').replace(/了$/, '');
}

function topicName(text: string): string {
  for (const topic of KNOWN_TOPICS) {
    if (topic.match.test(text)) return topic.name;
  }
  const cleaned = stripLeadingVerb(scrubFactText(text)).replace(/[，,。]/g, '').trim();
  const label = Array.from(cleaned).slice(0, 8).join('') || '相关工作';
  return label;
}

function statusFor(fact: ChatgptJournalFact): DailyTopicStatus {
  if (fact.outputState === 'produced') return 'completed';
  if (fact.category === 'planning' || /计划|下一步/.test(fact.title)) return 'planned';
  if (fact.outputState === 'partial') return 'progress';
  return 'discussed';
}

function importance(status: DailyTopicStatus): number {
  return { completed: 0, progress: 1, planned: 2, discussed: 3 }[status];
}

function joinTokens(tokens: string[]): string {
  const unique = [...new Set(tokens.map((item) => item.trim()).filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? '';
  if (unique.length === 2) return `${unique[0]}和${unique[1]}`;
  return `${unique.slice(0, -1).join('、')}和${unique[unique.length - 1]}`;
}

function objectFor(fact: ChatgptJournalFact, name: string): string {
  const raw = scrubFactText(fact.title) || scrubFactText(fact.summary ?? '');
  let leftover = stripLeadingVerb(raw);
  leftover = leftover.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ').trim();
  leftover = leftover
    .replace(/^的/, '')
    .replace(/^[与和、，,\s]+/, '')
    .replace(/[与和、，,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = leftover.split(/\s+/).filter((token) => chineseCharCount(token) >= 2 && !/^\d+$/.test(token));
  leftover = joinTokens(tokens);
  if (chineseCharCount(leftover) < 2) leftover = '';
  if (leftover && name && !leftover.includes(name) && !name.startsWith(leftover)) {
    return `${name}的${leftover}`;
  }
  return leftover || name;
}

function sentenceFor(fact: ChatgptJournalFact, name: string, status: DailyTopicStatus): string {
  const object = objectFor(fact, name);
  const lead = leadAction(fact.title);
  if (lead === '确认' || lead === '核对') return `当天${lead}了${object}。`;
  if (lead === '修改' || lead === '调整' || lead === '排查') return `当天继续${lead}${object}。`;
  if (status === 'completed') {
    if (lead === '修复') return `当天修复了${object}。`;
    return `当天完成了${object}。`;
  }
  if (status === 'progress') return `当天继续推进${object}。`;
  if (status === 'planned') return `当天确定了${object}。`;
  return `当天讨论了${object}。`;
}

function usableFact(fact: ChatgptJournalFact): boolean {
  const title = scrubFactText(fact.title);
  if (!title || isTriviaActivityTitle(title) || isKeywordDump(title)) return false;
  if (GENERIC_FILLER.test(title)) return false;
  if (chineseCharCount(stripLeadingVerb(title)) < 2 && !KNOWN_TOPICS.some((topic) => topic.match.test(title))) {
    return false;
  }
  return true;
}

export function normalizeDailyFacts(date: string, facts: ChatgptJournalFact[]): DailySummaryInput {
  const groups = new Map<string, DailyTopicInput>();
  const ranked = [...facts].filter(usableFact).sort((left, right) => (
    importance(statusFor(left)) - importance(statusFor(right)) || left.id - right.id
  ));

  for (const fact of ranked) {
    const text = `${fact.title} ${fact.summary ?? ''}`;
    const name = topicName(text);
    const status = statusFor(fact);
    const sentence = sentenceFor(fact, name, status);
    if (!sentence.endsWith('。') || chineseCharCount(sentence) < 6) continue;
    if (/10\.\d{4}|https?:\/\//i.test(sentence)) continue;
    const existing = groups.get(name);
    if (!existing) {
      groups.set(name, { name, status, facts: [sentence] });
      continue;
    }
    if (importance(status) < importance(existing.status)) existing.status = status;
    if (existing.facts.length < 2 && !existing.facts.includes(sentence)) existing.facts.push(sentence);
  }

  const topics = [...groups.values()]
    .sort((left, right) => importance(left.status) - importance(right.status))
    .slice(0, 4);

  return { date, topics };
}
