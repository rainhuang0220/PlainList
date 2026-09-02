<template><span v-if="false" aria-hidden="true"></span></template>
<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useApi } from '@/shared/api/useApi';
import { syncChatgptActivity } from '@/features/chatgpt-activity/syncChatgptActivity';

const auth = useAuthStore();
const { post } = useApi();
const desktop = () => (window as any).plainlistDesktop?.chatgptLocalSync;
let running = false;
let pendingReason: string | null = null;
let stopListening: (() => void) | undefined;
let syncController: AbortController | null = null;
const onManualCheck = () => void run('manual');
const onPause = () => syncController?.abort();

async function run(reason: string) {
  if (!desktop() || !auth.currentUser) return;
  if (running) { pendingReason = reason; return; }
  running = true;
  syncController = new AbortController();
  try {
    await syncChatgptActivity({
      userScope: auth.currentUser,
      reason,
      scan: desktop().scan,
      acknowledge: async (userScope, completed, summary, options) => {
        const response = await desktop().acknowledge(userScope, completed, summary, options);
        window.dispatchEvent(new CustomEvent('chatgpt-activity:progress', { detail: { ...summary as object, ...options } }));
        return response;
      },
      postDigest: (digest) => post('/activity/sources/chatgpt-digest', digest),
      reconcile: (payload) => post('/chatgpt-activity/reconcile', payload),
      signal: syncController.signal,
    });
    window.dispatchEvent(new CustomEvent('chatgpt-activity:synced'));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.warn('[chatgpt-activity] automatic sync deferred', error instanceof Error ? error.message : 'unavailable');
  } finally {
    syncController = null;
    running = false;
    const next = pendingReason; pendingReason = null;
    if (next) void run(next);
  }
}

onMounted(() => {
  stopListening = desktop()?.onSyncRequested((reason: string) => void run(reason));
  window.addEventListener('chatgpt-activity:check-now', onManualCheck);
  window.addEventListener('chatgpt-activity:pause', onPause);
  if (auth.isLoggedIn) void run('startup');
});
watch(() => auth.isLoggedIn, (loggedIn) => { if (loggedIn) void run('login'); });
onUnmounted(() => { syncController?.abort(); stopListening?.(); window.removeEventListener('chatgpt-activity:check-now', onManualCheck); window.removeEventListener('chatgpt-activity:pause', onPause); });
</script>
