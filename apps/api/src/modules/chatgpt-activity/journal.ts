export interface ChatgptJournalFact {
  id: number;
  sourceId: number;
  category: string;
  title: string;
  outputState: string;
  summary?: string;
}

export const DAILY_JOURNAL_SOURCE_VERSION = 'journal-v3';

type TopicVerb = 'completed' | 'progress' | 'planned' | 'discussed';

interface DailyTopic {
  key: string;
  label: string;
  verb: TopicVerb;
  detail: string;
  lead: string;
}

const TRIVIA_TITLE = /^(今天)?(天气怎么样|天气|气温|会下雨吗|几点了?|hello|hi|你好|在吗|谢谢)([?？!！.。])?$/i;
const HASH_OR_ID = /\b(?:[0-9a-f]{12,}|sourceExternalId|conversation_id)\b/i;
const DOI = /\b10\.\d{4,9}\/[^\s，。；;]+|\b10\.\d{4,9}\b/g;
const URL = /https?:\/\/\S+/gi;
const YEAR_FRAGMENT = /\b(?:19|20)\d{2}\.\d+\b/g;
const BARE_YEAR = /(?<![A-Za-z])(?:19|20)\d{2}(?![A-Za-z0-9])/g;
const SHORT_HASH = /\b[0-9a-f]{7,}\b/gi;
const LEADING_VERB = /^(继续|再次|反复|完成了|推进了|讨论了|梳理了|确定了|计划了|修改了|核对了|调整了|修复了|排查了|确认了|完成|推进|讨论|梳理|排查|确定|计划|修改|核对|调整|修复|确认)/;
const KEYWORD_DUMP = /本地优先现场场景|数字化工作台|封板结果|工作树干净|基线已核对/;
const GENERIC_FILLER = /取得了一定进展|开展了相关工作|进行了多方面探索/;
const KNOWN_TOPICS: Array<{ key: string; label: string; match: RegExp }> = [
  { key: 'plainlist', label: 'PlainList', match: /plainlist/i },
  { key: 'foreshadow', label: 'Foreshadow', match: /foreshadow/i },
  { key: 'paper', label: '论文', match: /论文|related work|相关工作/i },
  { key: 'chatgpt', label: 'ChatGPT 活动记录', match: /chatgpt|活动记录|ai 小记|每日小记/i },
  { key: 'profile', label: '用户画像', match: /用户画像|recency/i },
  { key: 'desktop', label: 'Desktop', match: /titlebar|desktop/i },
];
const LEAD_ACTION = /^(继续|再次|反复)?(完成了|确认了|修改了|核对了|调整了|修复了|排查了|验收了|讨论了|梳理了|确定了|计划了|完成|确认|修改|核对|调整|修复|排查|验收|讨论|梳理|确定|计划)/;

export function chineseMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${Number(month)} 月 ${Number(day)} 日`;
}

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
  return text.length < 4 || TRIVIA_TITLE.test(text) || HASH_OR_ID.test(text);
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
  const match = LEAD_ACTION.exec(title.trim());
  return (match?.[2] ?? '').replace(/了$/, '');
}

function importance(fact: ChatgptJournalFact): number {
  if (fact.outputState === 'produced') return 1;
  if (fact.category === 'decision') return 2;
  if (fact.outputState === 'partial' && (fact.category === 'engineering' || fact.category === 'planning')) return 3;
  if (fact.category === 'research' || fact.category === 'learning') return 4;
  if (fact.category === 'planning') return 5;
  return 6;
}

function verbFor(fact: ChatgptJournalFact): TopicVerb {
  if (fact.outputState === 'produced') return 'completed';
  if (fact.outputState === 'partial') return 'progress';
  if (fact.category === 'planning' || /计划|下一步/.test(fact.title)) return 'planned';
  return 'discussed';
}

function topicFor(text: string): { key: string; label: string } {
  for (const topic of KNOWN_TOPICS) {
    if (topic.match.test(text)) return { key: topic.key, label: topic.label };
  }
  const cleaned = stripLeadingVerb(scrubFactText(text)).replace(/[，,。]/g, '');
  const label = cleaned.slice(0, 8) || '相关工作';
  return { key: `other:${label}`, label };
}

function detailFor(fact: ChatgptJournalFact, label: string): string {
  const raw = scrubFactText(fact.title) || scrubFactText(fact.summary ?? '');
  let detail = stripLeadingVerb(raw);
  detail = detail.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ').trim();
  detail = detail.replace(/^的/, '').replace(/^[与和、，,\s]+/, '').replace(/[与和、，,]+$/g, '').replace(/\s+/g, ' ').trim();
  if (chineseCharCount(detail) < 2) detail = stripLeadingVerb(raw);
  if (chineseCharCount(detail) > 18) detail = Array.from(detail).slice(0, 18).join('');
  return detail;
}

function usableFact(fact: ChatgptJournalFact): boolean {
  const title = scrubFactText(fact.title);
  if (!title || isTriviaActivityTitle(title) || isKeywordDump(title)) return false;
  if (GENERIC_FILLER.test(title)) return false;
  return chineseCharCount(stripLeadingVerb(title)) >= 2;
}

function clusterTopics(facts: ChatgptJournalFact[]): DailyTopic[] {
  const groups = new Map<string, { label: string; facts: ChatgptJournalFact[] }>();
  const ranked = [...facts].sort((left, right) => importance(left) - importance(right) || left.id - right.id);
  for (const fact of ranked) {
    const topic = topicFor(`${fact.title} ${fact.summary ?? ''}`);
    const group = groups.get(topic.key) ?? { label: topic.label, facts: [] };
    group.facts.push(fact);
    groups.set(topic.key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const best = group.facts[0];
      const verb = group.facts.some((item) => verbFor(item) === 'completed')
        ? 'completed'
        : group.facts.some((item) => verbFor(item) === 'progress')
          ? 'progress'
          : verbFor(best);
      return {
        key,
        label: group.label,
        verb,
        detail: detailFor(best, group.label),
        lead: leadAction(best.title),
      };
    })
    .sort((left, right) => {
      const order = { completed: 0, progress: 1, planned: 2, discussed: 3 };
      return order[left.verb] - order[right.verb];
    })
    .slice(0, 4)
    .filter((topic) => topic.detail);
}

function objectPhrase(topic: DailyTopic, includeLabel: boolean): string {
  if (includeLabel && !topic.key.startsWith('other:') && !topic.detail.includes(topic.label)) {
    return `${topic.label}的${topic.detail}`;
  }
  return topic.detail;
}

function actionClause(topic: DailyTopic, includeLabel = false): string {
  const detail = objectPhrase(topic, includeLabel);
  if (topic.verb === 'completed') {
    if (topic.lead === '确认' || topic.lead === '核对') return `${topic.lead}了${detail}`;
    const moved = /^(修复|排查|确认|修改|调整|验收|核对|整理|阅读|接入)(.+)$/.exec(detail);
    if (moved) return `完成了${moved[2]}的${moved[1]}`;
    return `完成了${detail}`;
  }
  if (topic.verb === 'progress') {
    if (['修改', '排查', '调整', '核对', '整理'].includes(topic.lead)) return `继续${topic.lead}${detail}`;
    if (/^(修改|排查|调整|核对|整理|推进)/.test(detail)) return `继续${detail}`;
    return `继续推进${detail}`;
  }
  if (topic.verb === 'planned') return `确定了${detail}`;
  return `讨论了${detail}`;
}

function joinNames(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}和${labels[1]}`;
  return `${labels.slice(0, -1).join('、')}和${labels[labels.length - 1]}`;
}

function composeParagraph(topics: DailyTopic[]): string {
  if (!topics.length) return '';
  if (topics.length === 1) {
    return `今天主要${actionClause(topics[0], true)}。`;
  }

  const completed = topics.filter((topic) => topic.verb === 'completed');
  const openingNames = (completed.length ? completed : topics.slice(0, 2)).map((topic) => topic.label);
  const opening = completed.length
    ? `今天主要完成了${joinNames(openingNames)}的相关工作。`
    : `今天主要推进${joinNames(openingNames)}。`;

  const clauses = topics.map((topic) => {
    const clause = actionClause(topic);
    if (topic.key.startsWith('other:')) return clause;
    if (topic.verb === 'discussed' || topic.verb === 'planned' || topic.verb === 'progress') {
      return `${topic.label}方面${clause}`;
    }
    return `${topic.label}${clause}`;
  });

  return clipToLimit(`${opening}${clauses.join('；')}。`);
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
  if (/\b10\.\d{4,9}/.test(value) || /https?:\/\//i.test(value) || /\b(?:19|20)\d{2}\.\d+/.test(value) || GENERIC_FILLER.test(value)) return false;
  if (KEYWORD_DUMP.test(value)) return false;
  const count = chineseCharCount(value);
  return count > 12 && count <= 280;
}

export function composeDailyJournalParagraph(facts: ChatgptJournalFact[]): string {
  const usable = facts.filter(usableFact);
  return composeParagraph(clusterTopics(usable));
}

export function renderChatgptDailyJournal(date: string, facts: ChatgptJournalFact[]) {
  const usable = facts.filter(usableFact);
  const summaryMarkdown = composeDailyJournalParagraph(usable);
  if (!summaryMarkdown) {
    return { date, summaryMarkdown: '', activityCount: 0, conversationCount: 0 };
  }
  return {
    date,
    summaryMarkdown,
    activityCount: facts.filter((fact) => !isTriviaActivityTitle(fact.title)).length,
    conversationCount: new Set(usable.map((fact) => fact.sourceId)).size,
  };
}

export async function composeDailyJournalWithModel(
  facts: ChatgptJournalFact[],
  complete: (request: { system: string; user: string }) => Promise<string>,
): Promise<string> {
  const fallback = composeDailyJournalParagraph(facts);
  const compact = facts.filter(usableFact).map((fact) => ({
    category: fact.category,
    outputState: fact.outputState,
    title: scrubFactText(fact.title),
  }));
  if (!compact.length) return fallback;
  try {
    const text = (await complete({
      system: [
        '你把一天的 compact activity facts 写成一段正常中文。',
        '只输出一段完整句子，不要标题、列表或 Markdown。',
        '通常 100 到 200 个中文字，事实少时可以更短，不要硬凑。',
        '必须区分：讨论了/梳理了、继续推进/修改了、完成了、确定下一步/计划。',
        '禁止 DOI、URL、Git SHA、无上下文年份、数字碎片和关键词串联。',
      ].join(''),
      user: JSON.stringify({ facts: compact }),
    })).trim();
    if (isReadableDailyParagraph(text)) return text.replace(/\s+/g, '');
  } catch {
    return fallback;
  }
  return fallback;
}
