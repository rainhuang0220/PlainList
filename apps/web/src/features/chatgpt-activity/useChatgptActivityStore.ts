import type { ChatgptActivityConnectionView } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';

export interface ChatgptDailyJournal {
  date: string; summaryMarkdown: string; activityCount: number; conversationCount: number;
  status: 'dirty' | 'ready' | 'final' | 'failed'; generatedAt: string | null; updatedAt: string;
}

export const useChatgptActivityStore = defineStore('chatgpt-activity', () => {
  const { get } = useApi();
  const journals = ref<Record<string, ChatgptDailyJournal>>({});
  const connection = ref<ChatgptActivityConnectionView>({
    status: 'not_connected',
    viaDesktop: false,
    lastSyncedAt: null,
    journalCount: 0,
    earliestJournalDate: null,
    latestJournalDate: null,
    historicalStartDate: '2026-08-01',
    displayState: 'not_connected',
  });
  async function fetchRange(from: string, to: string) {
    const rows = await get<ChatgptDailyJournal[]>(`/chatgpt-activity/journals?from=${from}&to=${to}`);
    for (const row of rows) journals.value[row.date] = row;
    return rows;
  }
  async function fetchConnection() {
    connection.value = await get('/chatgpt-activity/connection');
    return connection.value;
  }
  return { journals, connection, fetchRange, fetchConnection };
});
