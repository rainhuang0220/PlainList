import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
export const usePlansStore = defineStore('plans', () => {
    const { del, get, post } = useApi();
    const plans = ref([]);
    async function fetch() {
        plans.value = await get('/plans');
    }
    async function add(name, type, time) {
        const createdPlan = await post('/plans', { name, type, time });
        plans.value.push(createdPlan);
        return createdPlan;
    }
    async function remove(id) {
        await del(`/plans/${id}`);
        plans.value = plans.value.filter((plan) => plan.id !== id);
    }
    function clear() {
        plans.value = [];
    }
    return {
        plans,
        fetch,
        add,
        remove,
        clear,
    };
});
