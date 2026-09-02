export interface ChatgptJournalFact {
  id: number;
  sourceId: number;
  category: string;
  title: string;
  outputState: string;
  summary?: string;
}

const TRIVIA_TITLE = /^(今天)?(天气怎么样|天气|气温|会下雨吗|几点了?|hello|hi|你好|在吗|谢谢)([?？!！.。])?$/i;
const GENERIC_TITLE = /^(今天)?(主要)?(围绕|继续)?(推进|开展|完成|排查并修复)?(了)?(软件工程|研究|学习|规划)(问题|工作)?$/;
const HASH_OR_ID = /\b(?:[0-9a-f]{12,}|sourceExternalId|conversation_id)\b/i;

export function chineseMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${Number(month)} 月 ${Number(day)} 日`;
}

export function isTriviaActivityTitle(title: string): boolean {
  const text = title.trim();
  return text.length < 4 || TRIVIA_TITLE.test(text) || HASH_OR_ID.test(text);
}

export function chineseCharCount(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

function stripBoilerplate(title: string): string {
  return title.trim()
    .replace(/[。！？.!?]+$/u, '')
    .replace(/^(继续|再次|反复)/, '')
    .replace(/^(完成了|推进了|讨论了|梳理了|确定了|计划了|完成|推进|讨论|梳理|排查)/, '')
    .trim();
}

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLE.test(title.trim());
}

function importance(fact: ChatgptJournalFact): number {
  const genericPenalty = isGenericTitle(fact.title) ? 10 : 0;
  if (fact.outputState === 'produced') return 1 + genericPenalty;
  if (fact.category === 'decision') return 2 + genericPenalty;
  if (fact.outputState === 'partial' && (fact.category === 'engineering' || fact.category === 'planning')) return 3 + genericPenalty;
  if (fact.category === 'research' || fact.category === 'learning') return 4 + genericPenalty;
  return 5 + genericPenalty;
}

function normalizeKey(title: string): string {
  return stripBoilerplate(title)
    .toLowerCase()
    .replace(/[\s，,、]/g, '')
    .slice(0, 24);
}

function dedupeFacts(facts: ChatgptJournalFact[]): ChatgptJournalFact[] {
  const sorted = [...facts].sort((left, right) => importance(left) - importance(right) || left.id - right.id);
  const kept: ChatgptJournalFact[] = [];
  for (const fact of sorted) {
    const key = normalizeKey(fact.title);
    if (!key) continue;
    const duplicate = kept.some((existing) => {
      const other = normalizeKey(existing.title);
      return key === other || key.includes(other) || other.includes(key);
    });
    if (duplicate) continue;
    kept.push(fact);
  }
  return kept.slice(0, 5);
}

function clauseFor(fact: ChatgptJournalFact): string | null {
  const specific = stripBoilerplate(fact.title) || stripBoilerplate(fact.summary ?? '');
  if (!specific) return null;
  if (fact.outputState === 'produced') return `完成${specific}`;
  if (fact.outputState === 'partial') return `推进${specific}`;
  if (fact.category === 'planning') return `确定${specific}`;
  return `讨论${specific}`;
}

function joinClauses(parts: string[]): string {
  if (parts.length === 1) return `今天${parts[0]}。`;
  if (parts.length === 2) return `今天${parts[0]}，随后${parts[1]}。`;
  return `今天${parts[0]}，${parts.slice(1, -1).join('，')}，并${parts[parts.length - 1]}。`;
}

function clipToLimit(paragraph: string, limit = 200): string {
  if (chineseCharCount(paragraph) <= limit) return paragraph;
  const sentences = paragraph.split(/(?<=。)/u).filter(Boolean);
  let next = '';
  for (const sentence of sentences) {
    const trial = `${next}${sentence}`;
    if (chineseCharCount(trial) > limit) break;
    next = trial;
  }
  if (next.trim()) return next.trim();
  const chars = Array.from(paragraph.replace(/。$/u, ''));
  return `${chars.slice(0, Math.max(1, limit - 1)).join('')}。`;
}

export function renderChatgptDailyJournal(date: string, _facts: ChatgptJournalFact[]) {
  const facts = _facts.filter((fact) => !isTriviaActivityTitle(fact.title));
  if (!facts.length) {
    return { date, summaryMarkdown: '', activityCount: 0, conversationCount: 0 };
  }

  const preferred = dedupeFacts(facts.filter((fact) => !isGenericTitle(fact.title)));
  const selected = preferred.length ? preferred : dedupeFacts(facts);
  const clauses = selected.map(clauseFor).filter((item): item is string => Boolean(item));
  if (!clauses.length) {
    return { date, summaryMarkdown: '', activityCount: 0, conversationCount: 0 };
  }

  return {
    date,
    summaryMarkdown: clipToLimit(joinClauses(clauses)),
    activityCount: facts.length,
    conversationCount: new Set(facts.map((fact) => fact.sourceId)).size,
  };
}
