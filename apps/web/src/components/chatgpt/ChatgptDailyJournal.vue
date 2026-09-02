<template>
  <article class="chatgpt-journal">
    <header>
      <div><span class="source-dot"></span>ChatGPT 活动</div>
      <span v-if="journal">{{ journal.conversationCount }} 个对话 · {{ journal.activityCount }} 项活动</span>
    </header>
    <!-- The renderer escapes all input before adding a narrow Markdown allowlist. -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-if="journal" class="journal-markdown" v-html="safeHtml"></div>
    <p v-else class="journal-empty">当天还没有 ChatGPT 活动记录。</p>
  </article>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import { renderSafeMarkdown } from '@/features/chatgpt-activity/safeMarkdown';
import { useChatgptActivityStore } from '@/features/chatgpt-activity/useChatgptActivityStore';
const props = defineProps<{ date: string }>();
const store = useChatgptActivityStore();
const journal = computed(() => store.journals[props.date]);
const safeHtml = computed(() => renderSafeMarkdown(journal.value?.summaryMarkdown ?? ''));
watch(() => props.date, (date) => void store.fetchRange(date, date), { immediate: true });
</script>
<style scoped>
.chatgpt-journal{margin-top:18px;padding:18px;border:1px solid color-mix(in srgb,var(--faint) 75%,transparent);background:color-mix(in srgb,var(--surface) 92%,#dbe8df);border-radius:16px;text-align:left}
header{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);padding-bottom:12px;border-bottom:1px solid var(--faint)}header div{font-weight:700;color:var(--text)}.source-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#4d8064;margin-right:8px}.journal-empty{color:var(--muted);font-size:13px}.journal-markdown:deep(h2){font-size:18px;margin:18px 0 8px}.journal-markdown:deep(h3){font-size:13px;letter-spacing:.04em;margin:18px 0 6px}.journal-markdown:deep(p),.journal-markdown:deep(li){font-size:13px;line-height:1.75}.journal-markdown:deep(ul){padding-left:20px}.journal-markdown:deep(code){padding:1px 5px;border-radius:5px;background:var(--faint)}.journal-markdown:deep(a){color:#315f49}
</style>
