<template>
  <section class="activity-source-card">
    <div class="source-head">
      <div><div class="eyebrow">AUTOMATIC SOURCE</div><h3>ChatGPT 活动记录</h3></div>
      <span class="health" :class="status">{{ statusLabel }}</span>
    </div>
    <div class="source-ledger">
      <div><span>连接</span><strong>{{ connectionLabel }}</strong></div>
      <div><span>资料库</span><strong>{{ rootName || (connection.viaDesktop ? 'ChatGPT Local Sync' : '—') }}</strong></div>
      <div><span>自动同步</span><strong>{{ status === 'paused' ? '已暂停' : status === 'enabled' || connection.viaDesktop ? '开启' : '—' }}</strong></div>
      <div><span>最后同步</span><strong>{{ lastSyncLabel }}</strong></div>
    </div>
    <div v-if="lastResult?.historicalBootstrap && !lastResult.bootstrapComplete" class="bootstrap-progress">
      <strong>正在建立历史活动记录</strong>
      <span v-if="lastResult.dateFrom">发现 {{ lastResult.checked }} 个 ChatGPT 对话 · {{ lastResult.dateFrom }} → {{ lastResult.dateTo }}</span>
      <span>已处理 {{ lastResult.processed }} / {{ lastResult.changed }} 个对话 · 已生成 {{ lastResult.journalDays }} 天记录 · 跳过 {{ lastResult.skipped }} 个</span>
      <progress :value="lastResult.processed" :max="Math.max(1, lastResult.changed)"></progress>
    </div>
    <p v-else-if="lastResult" class="today-line">本次处理 {{ lastResult.changed }} 个变化对话 · 形成 {{ lastResult.activities }} 项活动</p>
    <p v-if="isDesktop" class="privacy-note">完整对话保留在你的设备上。PlainList 服务器只接收派生活动和每日 Markdown 日志。</p>
    <p v-else class="privacy-note">资料库连接和自动同步需要 PlainList Desktop；同步完成后，这里会自动显示派生记录。</p>
    <div v-if="isDesktop" class="actions">
      <button v-if="!rootName" class="primary" @click="choose">连接资料库</button>
      <button v-else @click="choose">重新选择资料库</button>
      <button :disabled="status !== 'enabled'" @click="checkNow">立即检查</button>
      <button v-if="status === 'enabled'" @click="pause">暂停同步</button>
      <button v-if="status === 'paused'" @click="resume">继续同步</button>
    </div>
    <p v-if="error" class="sync-error">同步暂不可用，请稍后重试。</p>
    <div class="journal-browser">
      <label for="chatgpt-journal-date">查看每日记录</label>
      <input id="chatgpt-journal-date" v-model="selectedDate" type="date" :max="today" />
    </div>
    <ChatgptDailyJournal :date="selectedDate" />
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useChatgptActivityStore } from '@/features/chatgpt-activity/useChatgptActivityStore';
import ChatgptDailyJournal from '@/components/chatgpt/ChatgptDailyJournal.vue';
const auth = useAuthStore();
const activity = useChatgptActivityStore();
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = localDateKey(new Date());
const selectedDate = ref(today);
const status = ref('disabled'); const rootName = ref<string | null>(null); const error = ref('');
type SyncResult = { checked:number; changed:number; skipped:number; activities:number; processed:number; journalDays:number; historicalBootstrap:boolean; bootstrapComplete:boolean; dateFrom:string|null; dateTo:string|null };
const lastSyncAt = ref<string | null>(null); const lastResult = ref<SyncResult | null>(null);
const desktop = () => (window as any).plainlistDesktop?.chatgptLocalSync;
const isDesktop = computed(() => Boolean(desktop()));
const connection = computed(() => activity.connection);
const statusLabel = computed(() => status.value === 'enabled' ? '自动记录中' : status.value === 'paused' ? '已暂停' : connection.value.viaDesktop ? '已通过桌面端连接' : '暂未连接');
const connectionLabel = computed(() => status.value === 'enabled' || status.value === 'paused' ? '已连接' : connection.value.viaDesktop ? '已通过桌面端连接' : '未连接');
const lastSyncLabel = computed(() => { const value = lastSyncAt.value || connection.value.lastSyncedAt; return value ? new Date(value).toLocaleString() : '尚未同步'; });
async function refresh(){ await activity.fetchConnection().catch(() => {}); const result = await desktop()?.status(); if(result){ status.value=result.status; rootName.value=result.rootName; lastSyncAt.value=result.lastSyncAt; lastResult.value=result.lastResult; } }
async function choose(){ error.value=''; await desktop()?.chooseDirectory(auth.currentUser); await refresh(); checkNow(); }
function checkNow(){ window.dispatchEvent(new CustomEvent('chatgpt-activity:check-now')); }
async function pause(){ window.dispatchEvent(new CustomEvent('chatgpt-activity:pause')); await desktop()?.setPaused(true); await refresh(); }
async function resume(){ await desktop()?.setPaused(false); await refresh(); checkNow(); }
const onSynced = () => void refresh();
const onProgress = (event: Event) => { lastResult.value = (event as CustomEvent<SyncResult>).detail; };
onMounted(() => { void refresh(); window.addEventListener('chatgpt-activity:synced', onSynced); window.addEventListener('chatgpt-activity:progress', onProgress); });
onUnmounted(() => { window.removeEventListener('chatgpt-activity:synced', onSynced); window.removeEventListener('chatgpt-activity:progress', onProgress); });
</script>
<style scoped>
.activity-source-card{max-width:680px;padding:24px;border:1px solid var(--faint);border-radius:18px;background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#dbe8df));box-shadow:0 18px 40px rgba(32,45,36,.08)}.source-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.eyebrow{font-size:10px;letter-spacing:.16em;color:var(--muted)}h3{margin:5px 0 0;font-size:22px}.health{font-size:12px;padding:6px 10px;border-radius:999px;background:var(--faint)}.health.enabled{background:#dcecdf;color:#285c3e}.source-ledger{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin:22px 0;background:var(--faint);border:1px solid var(--faint);border-radius:12px;overflow:hidden}.source-ledger div{display:flex;flex-direction:column;gap:5px;padding:13px;background:var(--surface)}.source-ledger span{font-size:11px;color:var(--muted)}.source-ledger strong{font-size:13px}.today-line{font-weight:600}.bootstrap-progress{display:grid;gap:8px;padding:14px;border-radius:12px;background:color-mix(in srgb,#dcecdf 60%,var(--surface))}.bootstrap-progress strong{font-size:13px}.bootstrap-progress span{font-size:12px;color:var(--muted)}.bootstrap-progress progress{width:100%;height:6px;accent-color:#4d8064}.privacy-note{font-size:12px;line-height:1.7;color:var(--muted)}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.actions button{padding:9px 12px;border:1px solid var(--faint);border-radius:9px;background:var(--surface);cursor:pointer}.actions .primary{background:var(--text);color:var(--surface)}.sync-error{color:#a33}.journal-browser{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:28px;padding-top:18px;border-top:1px solid var(--faint)}.journal-browser label{font-size:12px;font-weight:700}.journal-browser input{padding:7px 9px;border:1px solid var(--faint);border-radius:8px;background:var(--surface);color:var(--text)}@media(max-width:560px){.source-ledger{grid-template-columns:1fr}}
</style>
