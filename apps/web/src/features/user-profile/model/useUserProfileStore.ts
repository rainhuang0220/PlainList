import type {
  UserProfileAnalyzeResponse,
  UserProfileEvidenceRecord,
  UserProfileResponse,
  UserProfileTraitRecord,
} from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';

export const useUserProfileStore = defineStore('userProfile', () => {
  const { get, patch, post } = useApi();

  const traits = ref<UserProfileTraitRecord[]>([]);
  const lastRun = ref<UserProfileResponse['lastRun']>(null);
  const loading = ref(false);
  const analyzing = ref(false);
  const saving = ref(false);
  const error = ref('');

  async function fetch() {
    loading.value = true;
    error.value = '';
    try {
      const response = await get<UserProfileResponse>('/user-profile');
      traits.value = response.traits;
      lastRun.value = response.lastRun ?? null;
      return response;
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Failed to load user profile';
      throw caughtError;
    } finally {
      loading.value = false;
    }
  }

  async function analyze(days = 60): Promise<UserProfileAnalyzeResponse> {
    analyzing.value = true;
    error.value = '';
    try {
      const result = await post<UserProfileAnalyzeResponse>('/user-profile/analyze', { days });
      await fetch();
      return result;
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Failed to analyze user profile';
      throw caughtError;
    } finally {
      analyzing.value = false;
    }
  }

  async function updateTrait(id: number, payload: {
    title?: string;
    userSummary?: string | null;
    impactRatio?: number;
    enabled?: boolean;
  }) {
    saving.value = true;
    error.value = '';
    try {
      const updated = await patch<UserProfileTraitRecord>(`/user-profile/${id}`, payload);
      traits.value = traits.value.map((trait) => (trait.id === id ? updated : trait));
      return updated;
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Failed to update user profile';
      throw caughtError;
    } finally {
      saving.value = false;
    }
  }

  async function fetchEvidence(id: number): Promise<UserProfileEvidenceRecord[]> {
    return get<UserProfileEvidenceRecord[]>(`/user-profile/${id}/evidence`);
  }

  function clear() {
    traits.value = [];
    lastRun.value = null;
    loading.value = false;
    analyzing.value = false;
    saving.value = false;
    error.value = '';
  }

  return {
    traits,
    lastRun,
    loading,
    analyzing,
    saving,
    error,
    fetch,
    analyze,
    updateTrait,
    fetchEvidence,
    clear,
  };
});
