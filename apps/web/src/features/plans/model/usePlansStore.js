import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAiReviewStore } from '@/features/ai-review/model/useAiReviewStore';
import { useApi } from '@/shared/api/useApi';
export const usePlansStore = defineStore('plans', () => {
    const { del, get, post } = useApi();
    const aiReview = useAiReviewStore();
    const plans = ref([]);
    async function fetch() {
        plans.value = await get('/plans');
    }
    async function add(name, type, time) {
        const createdPlan = await post('/plans', { name, type, time });
        plans.value.push(createdPlan);
        aiReview.clear();
        return createdPlan;
    }
    async function remove(id) {
        await del(`/plans/${id}`);
        plans.value = plans.value.filter((plan) => plan.id !== id);
        aiReview.clear();
    }
    function clear() {
        plans.value = [];
        aiReview.clear();
    }
    return {
        plans,
        fetch,
        add,
        remove,
        clear,
    };
});
