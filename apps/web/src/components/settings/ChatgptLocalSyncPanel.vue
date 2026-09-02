<template>
  <section class="chatgpt-source">
    <p class="status">
      <span class="dot" :class="card.variant" />
      <span>{{ card.headline }}</span>
    </p>
    <p v-if="card.body" class="copy">{{ card.body }}</p>
    <p v-if="card.countLine" class="meta">{{ card.countLine }}</p>
    <p v-if="card.lastUpdated" class="meta">最后同步：{{ formatSync(card.lastUpdated) }}</p>
    <p v-if="card.progressLine" class="meta">{{ card.progressLine }}</p>

    <div class="actions">
      <button v-if="isDesktop && !rootName" type="button" class="settings-btn-primary" @click="choose">连接本地资料库</button>
      <button v-if="card.connected" type="button" class="settings-btn-primary" @click="emit('openAiJournal')">查看 AI 小记</button>
      <a
        v-if="card.showDesktopDownload"
        class="text-link"
        href="https://github.com/rainhuang0220/PlainList/releases/latest"
        target="_blank"
        rel="noreferrer"
      >下载 Desktop</a>
      <button v-if="isDesktop && rootName" type="button" class="settings-btn-secondary" :disabled="status !== 'enabled'" @click="checkNow">立即检查</button>
      <button v-if="isDesktop && rootName" type="button" class="settings-btn-secondary" @click="choose">重新选择资料库</button>
      <button v-if="isDesktop && status === 'enabled'" type="button" class="settings-btn-secondary" @click="pause">暂停</button>
      <button v-if="isDesktop && status === 'paused'" type="button" class="settings-btn-secondary" @click="resume">继续同步</button>
    </div>
    <p v-if="error" class="error">同步暂不可用，请稍后重试。</p>
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

function formatSync(value: string) {
  try {
    const date = new Date(value);
    const now = new Date();
    const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`;
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
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--dark);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
  flex: 0 0 auto;
}
.dot.desktop-connected,
.dot.web-connected,
.dot.web-bootstrapping,
.dot.web-waiting {
  background: var(--dark);
}
.dot.desktop-paused,
.dot.web-empty {
  background: var(--mid);
}
.copy {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
.meta {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 16px;
}
.settings-btn-primary,
.settings-btn-secondary {
  border: 1px solid var(--faint);
  padding: 8px 14px;
  font-size: 12px;
  letter-spacing: 0.06em;
  cursor: pointer;
  border-radius: var(--r);
  font-family: inherit;
}
.settings-btn-primary {
  background: var(--dark);
  color: var(--surface);
  border-color: var(--dark);
}
.settings-btn-secondary {
  background: transparent;
  color: var(--mid);
}
.settings-btn-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
.text-link {
  font-size: 13px;
  line-height: 1.5;
  color: var(--mid);
  text-decoration: none;
}
.text-link:hover {
  color: var(--dark);
}
.error {
  margin: 12px 0 0;
  color: #b42318;
  font-size: 13px;
}
</style>
