import { getMonthRange } from '@plainlist/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
export const useChecksStore = defineStore('checks', () => {
    const { get, put } = useApi();
    const checks = ref({});
    async function fetchRange(from, to) {
        const rows = await get(`/checks?from=${from}&to=${to}`);
        Object.keys(rows).forEach((planId) => {
            if (!checks.value[planId]) {
                checks.value[planId] = {};
            }
            Object.assign(checks.value[planId], rows[planId]);
        });
    }
    async function fetchMonth(year, month) {
        const range = getMonthRange(year, month - 1);
        await fetchRange(range.from, range.to);
    }
    function isChecked(planId, dateKey) {
        return Boolean(checks.value[String(planId)]?.[dateKey]);
    }
    async function toggle(planId, dateKey) {
        const planKey = String(planId);
        const current = isChecked(planKey, dateKey);
        const next = !current;
        if (!checks.value[planKey]) {
            checks.value[planKey] = {};
        }
        checks.value[planKey][dateKey] = next;
        try {
            await put('/checks', { planId, date: dateKey, done: next });
        }
        catch (error) {
            checks.value[planKey][dateKey] = current;
            throw error;
        }
    }
    function clear() {
        checks.value = {};
    }
    return {
        checks,
        fetchRange,
        fetchMonth,
        isChecked,
        toggle,
        clear,
    };
});
