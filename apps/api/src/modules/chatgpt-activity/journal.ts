export interface ChatgptJournalFact {
  id: number;
  sourceId: number;
  category: string;
  title: string;
  outputState: string;
}

export function renderChatgptDailyJournal(date: string, _facts: ChatgptJournalFact[]) {
  const facts = _facts.slice();
  if (!facts.length) {
    return { date, summaryMarkdown: '', activityCount: 0, conversationCount: 0 };
  }

  const categoryLabels: Record<string, string> = {
    engineering: '软件工程',
    research: '研究',
    learning: '学习',
    planning: '规划',
    decision: '决策',
    unresolved: '未完成',
  };
  const orderedCategories = ['engineering', 'research', 'learning', 'planning', 'decision', 'unresolved'];
  const grouped = new Map<string, ChatgptJournalFact[]>();
  for (const fact of facts) {
    const category = categoryLabels[fact.category] ? fact.category : 'planning';
    grouped.set(category, [...(grouped.get(category) ?? []), fact]);
  }

  const labels = orderedCategories.filter((category) => grouped.has(category)).map((category) => categoryLabels[category]);
  const intro = labels.length === 1
    ? `今天主要围绕${labels[0]}展开。`
    : `今天的 ChatGPT 活动主要涉及${labels.join('、')}。`;
  const sections = orderedCategories.flatMap((category) => {
    const entries = grouped.get(category);
    if (!entries?.length) return [];
    return [
      `### ${categoryLabels[category]}`,
      ...entries.map((fact) => `- ${fact.outputState === 'produced' ? '完成' : '推进'}：${fact.title}`),
    ];
  });

  return {
    date,
    summaryMarkdown: ['## 今日 ChatGPT 活动', '', intro, '', ...sections].join('\n'),
    activityCount: facts.length,
    conversationCount: new Set(facts.map((fact) => fact.sourceId)).size,
  };
}
