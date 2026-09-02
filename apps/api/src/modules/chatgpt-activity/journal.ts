export interface ChatgptJournalFact {
  id: number;
  sourceId: number;
  category: string;
  title: string;
  outputState: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  engineering: '软件工程',
  research: '研究',
  learning: '学习',
  planning: '规划',
  decision: '决策',
  unresolved: '未完成',
};

const ORDERED_CATEGORIES = ['engineering', 'research', 'learning', 'planning', 'decision', 'unresolved'];

const TRIVIA_TITLE = /^(今天)?(天气怎么样|天气|气温|会下雨吗|几点了?|hello|hi|你好|在吗|谢谢)([?？!！.。])?$/i;

export function chineseMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${Number(month)} 月 ${Number(day)} 日`;
}

export function isTriviaActivityTitle(title: string): boolean {
  const text = title.trim();
  return text.length < 4 || TRIVIA_TITLE.test(text);
}

function verbPhrase(state: string, title: string): string {
  const trimmed = title.trim()
    .replace(/[。！？.!?]+$/u, '')
    .replace(/^(完成了|推进了|讨论了|完成|推进|讨论)/, '');
  if (state === 'produced') return `完成了${trimmed}`;
  if (state === 'partial') return `推进了${trimmed}`;
  return `讨论了${trimmed}`;
}

function joinPhrases(parts: string[]): string {
  if (parts.length === 1) return `${parts[0]}。`;
  return `${parts.slice(0, -1).join('，')}，并${parts[parts.length - 1]}。`;
}

export function renderChatgptDailyJournal(date: string, _facts: ChatgptJournalFact[]) {
  const facts = _facts.filter((fact) => !isTriviaActivityTitle(fact.title));
  if (!facts.length) {
    return { date, summaryMarkdown: '', activityCount: 0, conversationCount: 0 };
  }

  const grouped = new Map<string, ChatgptJournalFact[]>();
  for (const fact of facts) {
    const category = CATEGORY_LABELS[fact.category] ? fact.category : 'planning';
    grouped.set(category, [...(grouped.get(category) ?? []), fact]);
  }

  const labels = ORDERED_CATEGORIES
    .filter((category) => grouped.has(category))
    .map((category) => CATEGORY_LABELS[category]);
  const intro = labels.length === 1
    ? `今天主要围绕${labels[0]}展开。`
    : `今天主要继续推进${labels.join('和')}。`;

  const sections = ORDERED_CATEGORIES.flatMap((category) => {
    const entries = grouped.get(category);
    if (!entries?.length) return [];
    return [
      `### ${CATEGORY_LABELS[category]}`,
      '',
      joinPhrases(entries.map((fact) => verbPhrase(fact.outputState, fact.title))),
      '',
    ];
  });

  return {
    date,
    summaryMarkdown: [`## ${chineseMonthDay(date)}`, '', intro, '', ...sections].join('\n').trim(),
    activityCount: facts.length,
    conversationCount: new Set(facts.map((fact) => fact.sourceId)).size,
  };
}
