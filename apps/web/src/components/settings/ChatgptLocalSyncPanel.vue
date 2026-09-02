<template>
  <section class="activity-card">
    <div class="status-row">
      <span class="pulse" :class="card.variant" />
      <div class="status-copy">
        <h3>{{ card.headline }}</h3>
        <p v-if="card.body">{{ card.body }}</p>
        <p v-if="card.countLine" class="count-line">{{ card.countLine }}</p>
        <p v-if="card.lastUpdated" class="meta">最后同步：{{ formatSync(card.lastUpdated) }}</p>
        <p v-if="card.progressLine" class="meta">{{ card.progressLine }}</p>
      </div>
    </div>

    <div v-if="lastResult?.historicalBootstrap && !lastResult.bootstrapComplete" class="bootstrap-progress">
      <strong>正在建立历史活动记录</strong>
      <span>已处理 {{ lastResult.processed }} / {{ lastResult.changed }} · 已生成 {{ lastResult.journalDays }} 天记录</span>
      <progress :value="lastResult.processed" :max="Math.max(1, lastResult.changed)" />
    </div>

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
      <button v-if="isDesktop && rootName" class="ghost" type="button" :disabled="status !== 'enabled'" @click="checkNow">立即检查</button>
      <button v-if="isDesktop && rootName" class="ghost" type="button" @click="choose">重新选择资料库</button>
      <button v-if="isDesktop && status === 'enabled'" class="ghost" type="button" @click="pause">暂停</button>
      <button v-if="isDesktop && status === 'paused'" class="ghost" type="button" @click="resume">继续同步</button>
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

function formatSync(value: string) {
  try {
    const date = new Date(value);
    const now = new Date();
    const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
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
  gap: 12px;
  max-width: 34rem;
}
.status-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.status-copy {
  min-width: 0;
}
.pulse {
  width: 8px;
  height: 8px;
  margin-top: 7px;
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
.pulse.web-empty,
.pulse.desktop-paused {
  background: #b0893a;
}
h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.4;
  font-weight: 650;
}
p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}
.count-line {
  margin: 6px 0 0;
  color: var(--dark);
  font-size: 13px;
  font-weight: 600;
}
.meta,
.hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.bootstrap-progress {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
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
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.actions button,
.actions .link-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.actions button {
  border: 1px solid var(--faint);
  background: var(--surface);
  color: var(--dark);
}
.actions .primary {
  background: var(--text);
  color: var(--surface);
  border-color: var(--text);
}
.actions .ghost {
  border-color: transparent;
  background: transparent;
  color: var(--mid);
  padding: 0 8px;
}
.actions .ghost:hover {
  color: var(--dark);
  background: var(--faint2);
}
.actions .link-btn {
  text-decoration: none;
}
.sync-error {
  color: #a33;
}
</style>
