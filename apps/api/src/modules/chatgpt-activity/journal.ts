import { composeDailyJournal, composeReadableFallback, isReadableDailyParagraph } from './dailyCompose';
import {
  chineseCharCount,
  isTriviaActivityTitle,
  normalizeDailyFacts,
  scrubFactText,
  type ChatgptJournalFact,
} from './dailyNormalize';

export type { ChatgptJournalFact } from './dailyNormalize';
export { chineseCharCount, isTriviaActivityTitle, scrubFactText };
export { isReadableDailyParagraph };

export const DAILY_JOURNAL_SOURCE_VERSION = 'journal-v5';

export function chineseMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${Number(month)} 月 ${Number(day)} 日`;
}

export function renderChatgptDailyJournal(date: string, facts: ChatgptJournalFact[]) {
  const input = normalizeDailyFacts(date, facts);
  const summaryMarkdown = composeReadableFallback(input);
  if (!summaryMarkdown) {
    return { date, summaryMarkdown: '', activityCount: 0, conversationCount: 0 };
  }
  const usable = facts.filter((fact) => !isTriviaActivityTitle(fact.title));
  return {
    date,
    summaryMarkdown,
    activityCount: usable.length,
    conversationCount: new Set(usable.map((fact) => fact.sourceId)).size,
  };
}

export async function composeDailyJournalWithModel(
  facts: ChatgptJournalFact[],
  complete: (request: { system: string; user: string }) => Promise<string>,
): Promise<string> {
  const input = normalizeDailyFacts('', facts);
  const result = await composeDailyJournal(input, { tryModel: true, complete });
  return result.text;
}
