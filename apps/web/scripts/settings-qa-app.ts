import { createApp } from 'vue';
import { createPinia } from 'pinia';
import UserSettingsPanel from '@/components/settings/UserSettingsPanel.vue';
import { useChatgptActivityStore } from '@/features/chatgpt-activity/useChatgptActivityStore';
import { useReviewsStore } from '@/features/reviews/model/useReviewsStore';
import '@/shared/styles/main.css';

type SettingsSection = 'account' | 'ai' | 'profile' | 'theme' | 'chatgpt-local-sync' | 'ai-journal';

const params = new URLSearchParams(window.location.search);
const section = (params.get('section') as SettingsSection) || 'ai-journal';
const activityState = params.get('activity') === 'connected' ? 'connected' : 'disconnected';

const paragraph = '这一周把 PlainList 的活动归档从「能同步」推进到「能阅读」。桌面端持续从本地资料库提取有对象、有动作、有状态的事实，服务端只接收这些压缩后的语义，不再接触原始对话。';
const longProse = Array.from({ length: 28 }, (_, i) => `${paragraph}（${i + 1}）`).join('\n\n');

const app = createApp(UserSettingsPanel, {
  username: 'rain',
  isAdmin: true,
  initialSection: section,
});
const pinia = createPinia();
app.use(pinia);

const activity = useChatgptActivityStore();
const reviews = useReviewsStore();

if (activityState === 'connected') {
  activity.connection = {
    status: 'connected',
    viaDesktop: true,
    lastSyncedAt: '2026-09-02T15:41:00.000Z',
    checked: 105,
    processed: 76,
    journalCount: 7,
    earliestJournalDate: '2026-08-01',
    latestJournalDate: '2026-09-02',
    historicalStartDate: '2026-08-01',
    displayState: 'ready',
  };
} else {
  activity.connection = {
    status: 'not_connected',
    viaDesktop: false,
    lastSyncedAt: null,
    journalCount: 0,
    earliestJournalDate: null,
    latestJournalDate: null,
    historicalStartDate: '2026-08-01',
    displayState: 'not_connected',
  };
}

activity.fetchConnection = async () => activity.connection;

reviews.fetchWeeklyHistory = async () => ({
  weekly: [
    { weekStart: '2026-08-25', weekEnd: '2026-08-31', narrativeMarkdown: `## 8 月 25 日\n\n${longProse}` },
    { weekStart: '2026-08-18', weekEnd: '2026-08-24', narrativeMarkdown: `## 8 月 18 日\n\n${longProse}` },
    { weekStart: '2026-08-11', weekEnd: '2026-08-17', narrativeMarkdown: `## 8 月 11 日\n\n${longProse}` },
    { weekStart: '2026-08-04', weekEnd: '2026-08-10', narrativeMarkdown: `## 8 月 4 日\n\n${longProse}` },
    { weekStart: '2026-07-28', weekEnd: '2026-08-03', narrativeMarkdown: `## 7 月 28 日\n\n${longProse}` },
  ],
});

app.mount('#app');
