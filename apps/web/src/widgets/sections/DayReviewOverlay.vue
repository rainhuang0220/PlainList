<template>
  <Teleport to="body">
    <Transition name="review-shell">
      <div class="day-review-overlay" @click.self="emit('close')">
        <section class="day-review">
          <header class="day-review-head">
            <div>
              <div class="day-review-kicker">{{ t('calendar.review.kicker', 'Day review') }}</div>
              <h3 class="day-review-title">{{ review.title }}</h3>
              <div class="day-review-meta">
                {{ review.completed }} / {{ review.total }} {{ t('tracker.done_col', 'Done') }}
              </div>
            </div>
            <div class="day-review-actions">
              <div class="day-review-tabs" role="tablist">
                <button
                  v-for="option in modeOptions"
                  :key="option.id"
                  class="day-review-tab"
                  :class="{ active: mode === option.id }"
                  type="button"
                  @click="mode = option.id"
                >
                  {{ option.label }}
                </button>
              </div>
              <button class="day-review-close" type="button" @click="emit('close')">x</button>
            </div>
          </header>

          <div v-if="orderedTasks.length" class="day-review-stage" :class="`mode-${mode}`">
            <!-- WALL -->
            <div v-if="mode === 'wall'" class="task-wall" :style="wallStyle">
              <article
                v-for="item in orderedTasks"
                :key="item.id"
                class="task-art-card"
                :class="{ done: item.done, habit: item.type === 'habit' }"
              >
                <span class="task-art-time">{{ item.time }}</span>
                <strong>{{ item.name }}</strong>
                <span class="task-art-type">
                  {{ item.type === 'habit' ? t('plan.type.habit', 'daily habit') : t('plan.type.todo', 'task') }}
                </span>
              </article>
            </div>

            <!-- ATLAS (拼图 v2): 等高线群岛，自管理 canvas -->
            <ArchipelagoChart
              v-else-if="mode === 'atlas'"
              :tasks="puzzleTasks"
              :date-key="review.dateKey"
            />

            <!-- ABSTRACT: 抽象艺术·实心群岛 -->
            <ArchipelagoAbstract
              v-else-if="mode === 'abstract'"
              :tasks="puzzleTasks"
              :date-key="review.dateKey"
            />

            <!-- RELIEF 3D: three.js 写实浮雕 -->
            <ArchipelagoRelief3D
              v-else-if="mode === 'relief3d'"
              :tasks="puzzleTasks"
              :date-key="review.dateKey"
            />

            <!-- GALAXY: 12个月球星系 + 物理引擎 -->
            <GalaxySystem
              v-else-if="mode === 'galaxy'"
              :year-data="yearGalaxyData"
              :year="currentYear"
            />

            <!-- GRAVITY + PUZZLE share a measured free stage -->
            <div v-else ref="stageEl" class="free-stage" :class="{ ready: stageSize.w > 0, armed: gravityArmed }">
              <template v-if="mode === 'gravity'">
                <article
                  v-for="item in gravityItems"
                  :key="item.task.id"
                  class="task-physics-card"
                  :class="{ done: item.task.done, habit: item.task.type === 'habit' }"
                  :style="item.style"
                >
                  <span>{{ item.task.time }}</span>
                  <strong>{{ item.task.name }}</strong>
                </article>
              </template>

              <template v-else>
                <div
                  v-if="puzzleBoard"
                  class="task-puzzle-board"
                  :style="puzzleBoard.style"
                >
                  <svg
                    class="task-puzzle-svg"
                    :viewBox="`0 0 ${puzzleBoard.w} ${puzzleBoard.h}`"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      v-for="item in puzzleItems"
                      :key="`shape-${item.task.id}`"
                      class="task-puzzle-shape"
                      :class="{ done: item.task.done, habit: item.task.type === 'habit' }"
                      :d="item.path"
                      vector-effect="non-scaling-stroke"
                    />
                  </svg>
                  <span
                    v-for="item in puzzleItems"
                    :key="`label-${item.task.id}`"
                    class="task-puzzle-label"
                    :class="{ done: item.task.done }"
                    :style="item.labelStyle"
                    :title="`${item.task.time} · ${item.task.name}`"
                  >
                    <span class="task-puzzle-time">{{ item.task.time }}</span>
                    <span class="task-puzzle-name">{{ item.task.name }}</span>
                  </span>
                </div>
              </template>
            </div>
          </div>

          <div v-else class="day-review-empty">
            {{ t('calendar.review.empty', 'No tasks were recorded on this day.') }}
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { PlanType } from '@plainlist/shared';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import ArchipelagoChart from './ArchipelagoChart.vue';
import ArchipelagoAbstract from './ArchipelagoAbstract.vue';
// three.js 较重，仅在切到 3D 浮雕时按需加载（独立分包）
const ArchipelagoRelief3D = defineAsyncComponent(() => import('./ArchipelagoRelief3D.vue'));
// Galaxy System: 12个月球星系 + 物理引擎
const GalaxySystem = defineAsyncComponent(() => import('./GalaxySystem.vue'));

interface DayReviewTask {
  id: number | string;
  name: string;
  type: PlanType;
  time: string;
  done: boolean;
}

interface DayReview {
  title: string;
  completed: number;
  total: number;
  dateKey: string;
  tasks: DayReviewTask[];
}

type ReviewMode = 'wall' | 'gravity' | 'puzzle' | 'atlas' | 'abstract' | 'relief3d' | 'galaxy';

const props = defineProps<{
  review: DayReview;
}>();

const emit = defineEmits<{
  close: [];
}>();

const i18n = useI18nStore();
const plansStore = usePlansStore();
const checksStore = useChecksStore();
function t(key: string, fallback: string, params?: Record<string, string | number>) {
  return i18n.t(key, fallback, params);
}

/* ---------- Galaxy System Data ---------- */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

const currentYear = computed(() => {
  if (props.review.dateKey) {
    return parseInt(props.review.dateKey.split('-')[0], 10);
  }
  return new Date().getFullYear();
});

interface MonthGalaxyData {
  month: number;
  name: string;
  days: { day: number; dateKey: string; completedCount: number; totalCount: number; completionRate: number }[];
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

const yearGalaxyData = computed<MonthGalaxyData[]>(() => {
  const year = currentYear.value;
  const allPlans = plansStore.plans;
  const data: MonthGalaxyData[] = [];

  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: MonthGalaxyData['days'] = [];
    let monthCompletedTotal = 0;
    let monthTotalTasks = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const completedForDay = allPlans.filter((plan) => checksStore.isChecked(plan.id, dateKey));
      const completionRate = allPlans.length > 0
        ? Math.round((completedForDay.length / allPlans.length) * 100)
        : 0;

      days.push({
        day,
        dateKey,
        completedCount: completedForDay.length,
        totalCount: allPlans.length,
        completionRate,
      });

      monthCompletedTotal += completedForDay.length;
      monthTotalTasks += allPlans.length;
    }

    data.push({
      month,
      name: MONTH_NAMES[month],
      days,
      totalTasks: monthTotalTasks,
      completedTasks: monthCompletedTotal,
      completionRate: monthTotalTasks > 0 ? Math.round((monthCompletedTotal / monthTotalTasks) * 100) : 0,
    });
  }

  return data;
});

const mode = ref<ReviewMode>('wall');
const modeOptions = computed<{ id: ReviewMode; label: string }[]>(() => [
  { id: 'wall', label: t('calendar.review.wall', 'Wall') },
  { id: 'gravity', label: t('calendar.review.physics', 'Gravity') },
  { id: 'puzzle', label: t('calendar.review.puzzle', 'Puzzle') },
  { id: 'atlas', label: t('calendar.review.atlas', 'Atlas') },
  { id: 'abstract', label: t('calendar.review.abstract', 'Ink') },
  { id: 'relief3d', label: t('calendar.review.relief3d', 'Relief 3D') },
  { id: 'galaxy', label: t('calendar.review.galaxy', '🌌 Galaxy') },
]);

const stageEl = ref<HTMLElement | null>(null);
const stageSize = reactive({ w: 0, h: 0 });
const gravitySettled = ref(false);
const gravityArmed = ref(false);
let resizeObserver: ResizeObserver | null = null;

function hash(value: string) {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function seededUnit(seed: string) {
  return hash(seed) / 4294967295;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const orderedTasks = computed(() => [...props.review.tasks].sort((left, right) => {
  const leftTime = left.time || '99:99';
  const rightTime = right.time || '99:99';
  if (left.done !== right.done) return left.done ? -1 : 1;
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
  return String(left.id).localeCompare(String(right.id));
}));

/* ---------- WALL ---------- */
const gridShape = computed(() => {
  const count = Math.max(orderedTasks.value.length, 1);
  const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : 5;
  const rows = Math.ceil(count / cols);
  return { cols, rows };
});

const wallStyle = computed(() => ({
  '--wall-cols': String(gridShape.value.cols),
}));

/* ---------- GRAVITY (dependency-free settle animation) ---------- */
const gravityItems = computed(() => {
  const tasks = orderedTasks.value;
  const w = stageSize.w;
  const h = stageSize.h;
  if (!w || !h || !tasks.length) {
    return tasks.map((task) => ({ task, style: { opacity: '0' } as Record<string, string> }));
  }

  const cols = clamp(Math.round(w / 190), 2, 6);
  const gap = 12;
  const colW = (w - gap * (cols + 1)) / cols;
  const baseH = clamp(colW * 0.46, 52, 88);
  const colHeights = new Array(cols).fill(gap);

  return tasks.map((task, index) => {
    const seed = `${props.review.dateKey}-${task.id}`;
    const cardH = Math.round(baseH * (0.86 + seededUnit(`${seed}-h`) * 0.32));
    // pour into the currently-shortest column for an organic pile
    let col = 0;
    for (let c = 1; c < cols; c += 1) {
      if (colHeights[c] < colHeights[col]) col = c;
    }
    const x = Math.round(gap + col * (colW + gap));
    const restY = Math.round(h - colHeights[col] - cardH);
    colHeights[col] += cardH + gap;

    const rot = (seededUnit(`${seed}-r`) - 0.5) * 7;
    const dropY = -(cardH + 240);
    const y = gravitySettled.value ? restY : dropY;

    return {
      task,
      style: {
        width: `${Math.round(colW)}px`,
        height: `${cardH}px`,
        transform: `translate(${x}px, ${y}px) rotate(${rot.toFixed(2)}deg)`,
        transitionDelay: `${index * 45}ms`,
      } as Record<string, string>,
    };
  });
});

/* ---------- PUZZLE (real SVG board + text safety layer) ---------- */
const PUZZLE_KNOB = 0.18;
const PUZZLE_LABEL_INSET = 0.22;

interface PieceEdges { top: number; right: number; bottom: number; left: number; }
interface PuzzleSlot { row: number; col: number; index: number; }

function puzzleGrid(count: number): { cols: number; rows: number; slots: PuzzleSlot[] } {
  const cols = count <= 2 ? count : count <= 6 ? 3 : count <= 8 ? 4 : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const slots: PuzzleSlot[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / cols);
    let col = index % cols;
    // Keep short final rows attached but less rigid: 5 becomes a 3-over-2 shape.
    if (row % 2 === 1 && row !== rows - 1) {
      col = cols - 1 - col;
    }
    slots.push({ row, col, index });
  }

  return { cols, rows, slots };
}

function edgeSign(seed: string) {
  return seededUnit(seed) > 0.5 ? 1 : -1;
}

function outerEdge(seed: string) {
  // Outer silhouette should not collapse back into a perfect rectangle.
  return seededUnit(seed) > 0.5 ? 1 : -1;
}

function jigsawPathAt(edges: PieceEdges, x: number, y: number, w: number, h: number, k: number): string {
  const x0 = x;
  const y0 = y;
  const x1 = x + w;
  const y1 = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const tabW = Math.min(w, h) * 0.14;
  const handle = Math.min(w, h) * 0.10;
  const d: string[] = [`M ${x0.toFixed(1)} ${y0.toFixed(1)}`];

  const topOut = -edges.top * k;
  d.push(`L ${(cx - tabW).toFixed(1)} ${y0.toFixed(1)}`);
  if (edges.top) {
    d.push(`C ${(cx - tabW + handle).toFixed(1)} ${y0.toFixed(1)} ${(cx - handle).toFixed(1)} ${(y0 + topOut).toFixed(1)} ${cx.toFixed(1)} ${(y0 + topOut).toFixed(1)}`);
    d.push(`C ${(cx + handle).toFixed(1)} ${(y0 + topOut).toFixed(1)} ${(cx + tabW - handle).toFixed(1)} ${y0.toFixed(1)} ${(cx + tabW).toFixed(1)} ${y0.toFixed(1)}`);
  }
  d.push(`L ${x1.toFixed(1)} ${y0.toFixed(1)}`);

  const rightOut = edges.right * k;
  d.push(`L ${x1.toFixed(1)} ${(cy - tabW).toFixed(1)}`);
  if (edges.right) {
    d.push(`C ${x1.toFixed(1)} ${(cy - tabW + handle).toFixed(1)} ${(x1 + rightOut).toFixed(1)} ${(cy - handle).toFixed(1)} ${(x1 + rightOut).toFixed(1)} ${cy.toFixed(1)}`);
    d.push(`C ${(x1 + rightOut).toFixed(1)} ${(cy + handle).toFixed(1)} ${x1.toFixed(1)} ${(cy + tabW - handle).toFixed(1)} ${x1.toFixed(1)} ${(cy + tabW).toFixed(1)}`);
  }
  d.push(`L ${x1.toFixed(1)} ${y1.toFixed(1)}`);

  const bottomOut = edges.bottom * k;
  d.push(`L ${(cx + tabW).toFixed(1)} ${y1.toFixed(1)}`);
  if (edges.bottom) {
    d.push(`C ${(cx + tabW - handle).toFixed(1)} ${y1.toFixed(1)} ${(cx + handle).toFixed(1)} ${(y1 + bottomOut).toFixed(1)} ${cx.toFixed(1)} ${(y1 + bottomOut).toFixed(1)}`);
    d.push(`C ${(cx - handle).toFixed(1)} ${(y1 + bottomOut).toFixed(1)} ${(cx - tabW + handle).toFixed(1)} ${y1.toFixed(1)} ${(cx - tabW).toFixed(1)} ${y1.toFixed(1)}`);
  }
  d.push(`L ${x0.toFixed(1)} ${y1.toFixed(1)}`);

  const leftOut = -edges.left * k;
  d.push(`L ${x0.toFixed(1)} ${(cy + tabW).toFixed(1)}`);
  if (edges.left) {
    d.push(`C ${x0.toFixed(1)} ${(cy + tabW - handle).toFixed(1)} ${(x0 + leftOut).toFixed(1)} ${(cy + handle).toFixed(1)} ${(x0 + leftOut).toFixed(1)} ${cy.toFixed(1)}`);
    d.push(`C ${(x0 + leftOut).toFixed(1)} ${(cy - handle).toFixed(1)} ${x0.toFixed(1)} ${(cy - tabW + handle).toFixed(1)} ${x0.toFixed(1)} ${(cy - tabW).toFixed(1)}`);
  }
  d.push(`L ${x0.toFixed(1)} ${y0.toFixed(1)} Z`);
  return d.join(' ');
}

const puzzleTasks = computed(() => [...props.review.tasks].sort((left, right) => {
  const leftTime = left.time || '99:99';
  const rightTime = right.time || '99:99';
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
  return String(left.id).localeCompare(String(right.id));
}));

const puzzleBoard = computed(() => {
  const w = stageSize.w;
  const h = stageSize.h;
  const count = puzzleTasks.value.length;
  if (!w || !h || !count) return null;

  const { cols, rows } = puzzleGrid(count);
  const margin = 24;
  const safeW = Math.max(320, w - margin * 2);
  const safeH = Math.max(240, h - margin * 2);
  const cellW = safeW / (cols + PUZZLE_KNOB * 2);
  const cellH = Math.min(safeH / (rows + PUZZLE_KNOB * 2), cellW * 0.78);
  const boardW = cellW * cols;
  const boardH = cellH * rows;
  const knob = Math.min(cellW, cellH) * PUZZLE_KNOB;

  return {
    w: boardW + knob * 2,
    h: boardH + knob * 2,
    cellW,
    cellH,
    knob,
    style: {
      width: `${(boardW + knob * 2).toFixed(1)}px`,
      height: `${(boardH + knob * 2).toFixed(1)}px`,
    } as Record<string, string>,
  };
});

const puzzleItems = computed(() => {
  const board = puzzleBoard.value;
  const tasks = puzzleTasks.value;
  if (!board) {
    return tasks.map((task) => ({ task, path: '', labelStyle: { opacity: '0' } as Record<string, string> }));
  }

  const { cols, rows, slots } = puzzleGrid(tasks.length);
  const slotByCell = new Map<string, PuzzleSlot>();
  for (const slot of slots) slotByCell.set(`${slot.row}:${slot.col}`, slot);

  return tasks.map((task, index) => {
    const slot = slots[index];
    const x = board.knob + slot.col * board.cellW;
    const y = board.knob + slot.row * board.cellH;
    const topSlot = slotByCell.get(`${slot.row - 1}:${slot.col}`);
    const rightSlot = slotByCell.get(`${slot.row}:${slot.col + 1}`);
    const bottomSlot = slotByCell.get(`${slot.row + 1}:${slot.col}`);
    const leftSlot = slotByCell.get(`${slot.row}:${slot.col - 1}`);

    const rightEdge = rightSlot ? edgeSign(`${props.review.dateKey}-p-right-${slot.row}-${slot.col}`) : outerEdge(`${props.review.dateKey}-p-outer-r-${index}`);
    const bottomEdge = bottomSlot ? edgeSign(`${props.review.dateKey}-p-bottom-${slot.row}-${slot.col}`) : outerEdge(`${props.review.dateKey}-p-outer-b-${index}`);
    const edges: PieceEdges = {
      top: topSlot ? -edgeSign(`${props.review.dateKey}-p-bottom-${topSlot.row}-${topSlot.col}`) : outerEdge(`${props.review.dateKey}-p-outer-t-${index}`),
      right: rightEdge,
      bottom: bottomEdge,
      left: leftSlot ? -edgeSign(`${props.review.dateKey}-p-right-${leftSlot.row}-${leftSlot.col}`) : outerEdge(`${props.review.dateKey}-p-outer-l-${index}`),
    };

    const labelW = board.cellW * (1 - PUZZLE_LABEL_INSET * 2);
    const labelH = board.cellH * 0.52;
    const labelX = x + board.cellW * PUZZLE_LABEL_INSET;
    const labelY = y + (board.cellH - labelH) / 2;

    return {
      task,
      path: jigsawPathAt(edges, x, y, board.cellW, board.cellH, board.knob),
      labelStyle: {
        left: `${labelX.toFixed(1)}px`,
        top: `${labelY.toFixed(1)}px`,
        width: `${labelW.toFixed(1)}px`,
        height: `${labelH.toFixed(1)}px`,
        transitionDelay: `${index * 35}ms`,
      } as Record<string, string>,
    };
  });
});

/* ---------- stage measurement + mode lifecycle ---------- */
function measureStage() {
  const el = stageEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  stageSize.w = rect.width;
  stageSize.h = rect.height;
}

function triggerGravity() {
  // place cards at their drop height with transitions disabled, then arm + release
  gravityArmed.value = false;
  gravitySettled.value = false;
  window.requestAnimationFrame(() => {
    gravityArmed.value = true;
    window.requestAnimationFrame(() => {
      gravitySettled.value = true;
    });
  });
}

async function enterFreeMode() {
  await nextTick();
  measureStage();
  if (resizeObserver) resizeObserver.disconnect();
  if (stageEl.value) {
    resizeObserver = new ResizeObserver(() => measureStage());
    resizeObserver.observe(stageEl.value);
  }
  if (mode.value === 'gravity') triggerGravity();
}

watch(mode, (value) => {
  if (value === 'wall') {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    return;
  }
  void enterFreeMode();
});

watch(() => props.review, () => {
  if (mode.value === 'wall') return;
  void enterFreeMode();
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<style scoped>
.day-review-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  background: color-mix(in srgb, var(--bg) 88%, rgba(0,0,0,.08));
  backdrop-filter: blur(16px);
}

.day-review {
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  color: var(--dark);
}

.day-review-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 30px 34px 16px;
}

.day-review-kicker {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--muted);
}

.day-review-title {
  margin: 4px 0 4px;
  font-size: clamp(25px, 4vw, 48px);
  line-height: 1;
  letter-spacing: 0;
}

.day-review-meta {
  font-family: var(--mono);
  color: var(--muted);
}

.day-review-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.day-review-tabs {
  display: inline-flex;
  border: 1px solid var(--faint);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
}

.day-review-tab,
.day-review-close {
  border: 0;
  background: transparent;
  color: var(--mid);
  font-family: var(--mono);
  cursor: pointer;
}

.day-review-tab {
  min-height: 38px;
  padding: 0 13px;
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.day-review-tab + .day-review-tab {
  border-left: 1px solid var(--faint);
}

.day-review-tab.active {
  background: var(--dark);
  color: var(--bg);
}

.day-review-close {
  width: 42px;
  height: 42px;
  border: 1px solid var(--faint);
  border-radius: 50%;
  font-size: 18px;
}

.day-review-stage {
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 24px 24px;
}

/* WALL — clean responsive grid (no overlap; scrolls if it overflows) */
.task-wall {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(var(--wall-cols), minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  align-content: start;
  padding-top: 16px;
  overflow-y: auto;
  border-top: 1px solid color-mix(in srgb, var(--faint) 82%, transparent);
}

.task-art-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  min-height: clamp(96px, 13vh, 150px);
  padding: clamp(12px, 1.6vw, 22px);
  border: 1px solid color-mix(in srgb, var(--faint) 72%, var(--dark));
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  color: var(--dark);
}

.task-art-card.done {
  background: var(--dark);
  color: var(--bg);
  border-color: var(--dark);
}

.task-art-card.habit:not(.done) {
  background: color-mix(in srgb, var(--surface) 72%, var(--faint));
}

.task-art-card strong {
  display: block;
  overflow-wrap: anywhere;
  font-size: clamp(15px, 1.6vw, 24px);
  line-height: 1.12;
}

.task-art-time,
.task-art-type,
.task-physics-card span {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .1em;
  text-transform: uppercase;
  opacity: .62;
}

/* FREE STAGE (gravity + puzzle) */
.free-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  margin-top: 16px;
  overflow: hidden;
  border-top: 1px solid color-mix(in srgb, var(--faint) 82%, transparent);
}

/* GRAVITY */
.task-physics-card {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 8px 14px;
  border: 1px solid color-mix(in srgb, var(--dark) 32%, var(--surface));
  background: color-mix(in srgb, var(--surface) 92%, var(--bg));
  color: var(--dark);
  will-change: transform;
  transition: transform .72s cubic-bezier(.34, 1.32, .5, 1);
}

.free-stage:not(.armed) .task-physics-card {
  transition: none;
}

.task-physics-card.done {
  background: var(--dark);
  color: var(--bg);
  border-color: var(--dark);
}

.task-physics-card.habit:not(.done) {
  background: color-mix(in srgb, var(--surface) 70%, var(--faint));
}

.task-physics-card strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(13px, 1.2vw, 17px);
  line-height: 1.1;
}

/* PUZZLE */
.task-puzzle-board {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  overflow: visible;
}

.task-puzzle-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.task-puzzle-shape {
  fill: color-mix(in srgb, var(--surface) 82%, var(--faint));
  stroke: color-mix(in srgb, var(--dark) 62%, var(--bg));
  stroke-width: 1.35;
  stroke-linejoin: round;
}

.task-puzzle-shape.habit:not(.done) {
  fill: color-mix(in srgb, var(--surface) 58%, var(--faint));
}

.task-puzzle-shape.done {
  fill: var(--dark);
  stroke: color-mix(in srgb, var(--bg) 76%, var(--dark));
}

.task-puzzle-label {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
  overflow: hidden;
  padding: 2px 4px;
  color: var(--dark);
  text-align: left;
  pointer-events: none;
  opacity: 0;
  animation: puzzle-in .34s ease forwards;
  animation-delay: inherit;
}

.task-puzzle-label.done { color: var(--bg); }

.task-puzzle-time {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: .08em;
  opacity: .56;
}

.task-puzzle-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  max-width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: clamp(11px, 1vw, 15px);
  line-height: 1.2;
}

@keyframes puzzle-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

.day-review-empty {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 120px);
  color: var(--muted);
  font-family: var(--mono);
}

.review-shell-enter-active,
.review-shell-leave-active {
  transition: opacity .22s ease;
}

.review-shell-enter-from,
.review-shell-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .day-review-head {
    flex-direction: column;
    padding: 22px 18px 12px;
  }

  .day-review-stage {
    padding: 0 12px 12px;
  }

  .day-review-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
