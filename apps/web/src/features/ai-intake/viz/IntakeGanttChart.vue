<template>
  <div v-if="blocks.length" class="ai-intake-gantt">
    <div class="ai-intake-gantt-label">今日时间轴</div>
    <div ref="chartEl" class="ai-intake-gantt-canvas" :style="{ height: `${chartHeight}px` }"></div>
  </div>
</template>

<script setup lang="ts">
import type { AiIntakeItem } from '@plainlist/shared';
import { buildTimelineBlocksFromItems, timeToMinutes } from '@plainlist/shared';
import * as echarts from 'echarts';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  items: AiIntakeItem[];
}>();

const chartEl = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

const DAY_START = 8 * 60;
const DAY_END = 23 * 60;
const DAY_SPAN = DAY_END - DAY_START;

const blocks = computed(() => buildTimelineBlocksFromItems(props.items));
const chartHeight = computed(() => Math.max(120, blocks.value.length * 40 + 48));

function fmtMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function render() {
  if (!chartEl.value || blocks.value.length === 0) return;

  if (chart) {
    chart.dispose();
    chart = null;
  }
  chart = echarts.init(chartEl.value, null, { renderer: 'svg' });

  const styles = getComputedStyle(document.documentElement);
  const muted = styles.getPropertyValue('--muted').trim() || '#888888';

  const labels = blocks.value.map((block) => block.label);
  const offsets = blocks.value.map((block) => Math.max(0, timeToMinutes(block.start) - DAY_START));
  const durations = blocks.value.map((block) =>
    Math.max(8, timeToMinutes(block.end) - timeToMinutes(block.start)),
  );
  const colors = blocks.value.map((block) => (block.kind === 'point' ? '#1d3557' : '#2d6a4f'));

  chart.setOption({
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 900,
    animationEasing: 'cubicOut',
    animationDelay: (idx: number) => idx * 140,
    grid: { left: 4, right: 8, top: 4, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: DAY_SPAN,
      axisLabel: {
        color: muted,
        fontSize: 10,
        formatter: (value: number) => fmtMinutes(DAY_START + value),
      },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } },
    },
    yAxis: {
      type: 'category',
      data: labels,
      inverse: true,
      axisLabel: { color: muted, fontSize: 11, width: 88, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: { seriesName: string; dataIndex: number }) => {
        const block = blocks.value[params.dataIndex];
        if (!block) return '';
        return `${block.label}<br/>${block.start} – ${block.end}`;
      },
    },
    series: [
      {
        name: 'offset',
        type: 'bar',
        stack: 'day',
        silent: true,
        itemStyle: { color: 'transparent' },
        data: offsets,
        animation: false,
      },
      {
        name: 'task',
        type: 'bar',
        stack: 'day',
        barMinHeight: 6,
        data: durations.map((value, index) => ({
          value,
          itemStyle: {
            color: colors[index],
            borderRadius: blocks.value[index]?.kind === 'point' ? 999 : 6,
          },
        })),
        animationDelay: (idx: number) => idx * 140,
      },
    ],
  });
}

function onResize() {
  chart?.resize();
}

onMounted(() => {
  render();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
  chart = null;
});

watch(blocks, async () => {
  await nextTick();
  render();
}, { deep: true });
</script>

<style scoped>
.ai-intake-gantt {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--faint, #e4e4e4);
}

.ai-intake-gantt-label {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted, #888);
  margin-bottom: 6px;
}

.ai-intake-gantt-canvas {
  width: 100%;
  min-height: 120px;
}
</style>
