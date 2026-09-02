<template>
  <section class="activity-card">
    <div class="status-row">
      <span class="pulse" :class="card.variant" />
      <div>
        <h3>{{ card.headline }}</h3>
        <p>{{ card.body }}</p>
      </div>
    </div>

    <p v-if="card.todayLine" class="today-line">{{ card.todayLine }}</p>
    <p v-if="card.lastUpdated" class="meta">最后更新：{{ formatTime(card.lastUpdated) }}</p>

    <div v-if="lastResult?.historicalBootstrap && !lastResult.bootstrapComplete" class="bootstrap-progress">
      <strong>正在建立历史活动记录</strong>
      <span v-if="lastResult.dateFrom">发现 {{ lastResult.checked }} 个对话 · {{ lastResult.dateFrom }} → {{ lastResult.dateTo }}</span>
      <span>已处理 {{ lastResult.processed }} / {{ lastResult.changed }} · 已生成 {{ lastResult.journalDays }} 天记录</span>
      <progress :value="lastResult.processed" :max="Math.max(1, lastResult.changed)" />
    </div>

    <p v-if="card.progressLine" class="meta">{{ card.progressLine }}</p>
    <p v-if="connection.earliestJournalDate && connection.latestJournalDate" class="meta">
      历史小记 {{ formatDay(connection.earliestJournalDate) }} → {{ formatDay(connection.latestJournalDate) }}
    </p>

    <div v-if="hasActions" class="actions">
      <button v-if="isDesktop && !rootName" class="primary" type="button" @click="choose">连接本地资料库</button>
      <button v-if="card.connected" class="primary" type="button" @click="emit('openAiJournal')">查看 AI 小记</button>
      <a
        v-if="card.showDesktopDownload"
        class="primary link-btn"
        href="https://github.com/rainhuang0220/PlainList/releases/latest"
        target="_blank"
        rel="noreferrer"
      >下载 Desktop</a>
      <button v-if="isDesktop && rootName" type="button" :disabled="status !== 'enabled'" @click="checkNow">立即检查</button>
      <button v-if="isDesktop && rootName" type="button" @click="choose">重新选择资料库</button>
      <button v-if="isDesktop && status === 'enabled'" type="button" @click="pause">暂停</button>
      <button v-if="isDesktop && status === 'paused'" type="button" @click="resume">继续同步</button>
    </div>
    <p v-if="isDesktop && !rootName" class="hint">需要先安装并使用 chatgpt-local-sync。</p>
    <p v-if="error" class="sync-error">同步暂不可用，请稍后重试。</p>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useChatgptActivityStore } from '@/features/chatgpt-activity/useChatgptActivityStore';
import { presentChatgptActivityCard } from '@/features/chatgpt-activity/presentChatgptActivityCard';

const emit = defineEmits<{ openAiJournal: [] }>();
const auth = useAuthStore();
const activity = useChatgptActivityStore();
const status = ref('disabled');
const rootName = ref<string | null>(null);
const error = ref('');
type SyncResult = { checked:number; changed:number; skipped:number; activities:number; processed:number; journalDays:number; historicalBootstrap:boolean; bootstrapComplete:boolean; dateFrom:string|null; dateTo:string|null };
const lastSyncAt = ref<string | null>(null);
const lastResult = ref<SyncResult | null>(null);
const desktop = () => (window as any).plainlistDesktop?.chatgptLocalSync;
const isDesktop = computed(() => Boolean(desktop()));
const connection = computed(() => activity.connection);
const card = computed(() => presentChatgptActivityCard({
  isDesktop: isDesktop.value,
  localStatus: status.value,
  rootName: rootName.value,
  connection: {
    status: connection.value.status,
    viaDesktop: connection.value.viaDesktop,
    lastSyncedAt: lastSyncAt.value || connection.value.lastSyncedAt,
    displayState: connection.value.displayState,
    checked: connection.value.checked,
    processed: connection.value.processed,
    journalCount: connection.value.journalCount,
    earliestJournalDate: connection.value.earliestJournalDate,
  },
  lastResult: lastResult.value,
}));
const hasActions = computed(() => (
  Boolean(isDesktop.value && !rootName.value)
  || card.value.connected
  || card.value.showDesktopDownload
  || Boolean(isDesktop.value && rootName.value)
));

function formatDay(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

async function refresh() {
  await activity.fetchConnection().catch(() => {});
  const result = await desktop()?.status();
  if (result) {
    status.value = result.status;
    rootName.value = result.rootName;
    lastSyncAt.value = result.lastSyncAt;
    lastResult.value = result.lastResult;
  }
}
async function choose() {
  error.value = '';
  await desktop()?.chooseDirectory(auth.currentUser);
  await refresh();
  checkNow();
}
function checkNow() { window.dispatchEvent(new CustomEvent('chatgpt-activity:check-now')); }
async function pause() {
  window.dispatchEvent(new CustomEvent('chatgpt-activity:pause'));
  await desktop()?.setPaused(true);
  await refresh();
}
async function resume() {
  await desktop()?.setPaused(false);
  await refresh();
  checkNow();
}
const onSynced = () => void refresh();
const onProgress = (event: Event) => { lastResult.value = (event as CustomEvent<SyncResult>).detail; };
onMounted(() => {
  void refresh();
  window.addEventListener('chatgpt-activity:synced', onSynced);
  window.addEventListener('chatgpt-activity:progress', onProgress);
});
onUnmounted(() => {
  window.removeEventListener('chatgpt-activity:synced', onSynced);
  window.removeEventListener('chatgpt-activity:progress', onProgress);
});
</script>
<style scoped>
.activity-card {
  display: grid;
  gap: 10px;
  max-width: 520px;
}
.status-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.pulse {
  width: 8px;
  height: 8px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--muted);
  flex: 0 0 auto;
}
.pulse.desktop-connected,
.pulse.web-connected,
.pulse.web-bootstrapping,
.pulse.web-waiting {
  background: #4d8064;
}
.pulse.web-empty {
  background: #b0893a;
}
.pulse.desktop-paused {
  background: #b0893a;
}
h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.45;
}
p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}
.today-line {
  margin: 0;
  font-weight: 600;
  color: var(--dark);
}
.meta,
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.bootstrap-progress {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: color-mix(in srgb, #dcecdf 60%, var(--surface));
}
.bootstrap-progress span {
  font-size: 12px;
  color: var(--muted);
}
.bootstrap-progress progress {
  width: 100%;
  height: 6px;
  accent-color: #4d8064;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.actions button {
  padding: 9px 12px;
  border: 1px solid var(--faint);
  border-radius: 9px;
  background: var(--surface);
  cursor: pointer;
}
.actions .primary {
  background: var(--text);
  color: var(--surface);
}
.actions .link-btn {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
.sync-error {
  color: #a33;
}
</style>
