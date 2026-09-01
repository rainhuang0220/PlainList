<template>
  <div class="sync-panel">
    <p>从你本地保存的 ChatGPT 对话中提取有意义的学习、研究和项目活动，用于完善每日记录与周进展回顾。完整对话不会保存到 PlainList 服务器。</p>
    <p><strong>{{ label }}</strong><span v-if="rootName"> · {{ rootName }}</span></p>
    <p v-if="lastSyncAt">最后同步：{{ new Date(lastSyncAt).toLocaleString() }}</p>
    <p v-if="lastResult">已检查 {{ lastResult.checked }} 个对话 · {{ lastResult.changed }} 个发生变化 · 提取 {{ lastResult.activities }} 条活动 · 跳过 {{ lastResult.skipped }} 个</p>
    <label v-if="!lastSyncAt">首次同步范围 <select v-model="bootstrapWindow"><option value="0">今天</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="all">全部历史</option></select></label>
    <div class="sync-actions"><button @click="choose">{{ rootName ? '重新选择资料库' : '选择 chatgpt-local-sync 资料库' }}</button><button :disabled="status !== 'enabled' || syncing" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button><button v-if="status === 'enabled'" @click="pause">暂停</button><button v-if="status === 'paused'" @click="resume">继续</button><button v-if="rootName" @click="disable">关闭</button></div>
    <p v-if="error" class="sync-error">ChatGPT 本地同步暂不可用：{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
const auth = useAuthStore(); const { post } = useApi(); const status = ref('disabled'); const rootName = ref<string | null>(null); const syncing = ref(false); const error = ref(''); const lastSyncAt = ref<string | null>(null); const bootstrapWindow = ref('7'); const lastResult = ref<{ checked:number; changed:number; skipped:number; activities:number } | null>(null);
const desktop = () => (window as any).plainlistDesktop?.chatgptLocalSync;
const label = computed(() => status.value === 'enabled' ? '已启用' : status.value === 'paused' ? '已暂停' : '未启用');
async function refresh(){ const result = await desktop()?.status(); if(result){ status.value=result.status; rootName.value=result.rootName; lastSyncAt.value=result.lastSyncAt; lastResult.value=result.lastResult; } }
async function choose(){ error.value=''; await desktop()?.chooseDirectory(auth.currentUser); await refresh(); }
async function sync(){ if(!desktop()) return; syncing.value=true; error.value=''; try { const result=await desktop().scan(auth.currentUser, bootstrapWindow.value); let activities=0; const completed=[...(result.skippedArchives ?? [])]; for(const item of result.digests){ if(item.digest.localFacts.length){ const response=await post<{factCount:number}>('/activity-knowledge/sources/chatgpt-digest', item.digest); activities += response.factCount; } completed.push({ conversationId:item.digest.sourceExternalId, hash:item.hash, updatedAt:item.digest.occurredAt }); } const summary={ checked:result.checked, changed:result.changed, skipped:result.skipped, activities }; await desktop().acknowledge(auth.currentUser, completed, summary); lastResult.value=summary; lastSyncAt.value=new Date().toISOString(); if(result.status==='unavailable') error.value='资料库正在写入或无法读取；请稍后重试。'; } catch(e){ error.value=e instanceof Error?e.message:'同步失败'; } finally { syncing.value=false; } }
async function pause(){ await desktop()?.setPaused(true); await refresh(); } async function resume(){ await desktop()?.setPaused(false); await refresh(); }
async function disable(){ await desktop()?.disable(); await refresh(); }
let stopWatching: (() => void) | undefined;
onMounted(async () => { await refresh(); stopWatching = desktop()?.onChanged(() => { if (status.value === 'enabled' && !syncing.value) void sync(); }); });
onUnmounted(() => stopWatching?.());
</script>
<style scoped>.sync-panel{max-width:620px;font-size:13px;line-height:1.65}.sync-actions{display:flex;gap:8px;flex-wrap:wrap}.sync-actions button{padding:8px 10px;border:1px solid var(--faint);background:var(--surface);cursor:pointer}.sync-error{color:#a33}</style>
