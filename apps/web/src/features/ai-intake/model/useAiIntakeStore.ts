import type { AiIntakeDiscarded, AiIntakeItem, AiIntakeResponse } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useApi } from '@/shared/api/useApi';

export interface DraftItem extends AiIntakeItem {
  draftId: string;
}

let draftCounter = 0;
function nextDraftId() {
  draftCounter += 1;
  return `intake-${Date.now().toString(36)}-${draftCounter.toString(36)}`;
}

export const useAiIntakeStore = defineStore('aiIntake', () => {
  const { post } = useApi();

  const lastResponse = ref<AiIntakeResponse | null>(null);
  const drafts = ref<DraftItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const clearTodos = ref(false);

  const discarded = computed<AiIntakeDiscarded[]>(() => lastResponse.value?.discarded ?? []);
  const clearDirective = computed(() => lastResponse.value?.directives ?? null);

  async function parse(text: string, referenceDate?: string) {
    loading.value = true;
    error.value = '';
    try {
      const response = await post<AiIntakeResponse>('/ai-intake', { text, referenceDate });
      lastResponse.value = response;
      drafts.value = response.items.map((item) => ({ ...item, draftId: nextDraftId() }));
      clearTodos.value = response.directives?.clearTodayTodos === true;
      return response;
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Failed to parse intake';
      lastResponse.value = null;
      drafts.value = [];
      clearTodos.value = false;
      throw caughtError;
    } finally {
      loading.value = false;
    }
  }

  function updateDraft(draftId: string, patch: Partial<AiIntakeItem>) {
    drafts.value = drafts.value.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft));
  }

  function removeDraft(draftId: string) {
    drafts.value = drafts.value.filter((draft) => draft.draftId !== draftId);
  }

  function setClearTodos(value: boolean) {
    clearTodos.value = value;
  }

  function reset() {
    lastResponse.value = null;
    drafts.value = [];
    error.value = '';
    loading.value = false;
    clearTodos.value = false;
  }

  return {
    lastResponse,
    drafts,
    discarded,
    clearDirective,
    clearTodos,
    loading,
    error,
    parse,
    updateDraft,
    removeDraft,
    setClearTodos,
    reset,
  };
});
