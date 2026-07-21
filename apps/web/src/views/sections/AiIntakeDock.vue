<template>
  <div class="ai-intake" :class="{ open: open, busy: intake.loading, has: intake.drafts.length > 0 }">
    <button
      ref="triggerEl"
      class="ai-intake-trigger"
      :class="{ active: open }"
      :title="t('intake.trigger_hint', '把脑子里的一团话直接整理成今日计划')"
      @click="toggleOpen"
    >
      <span class="ai-intake-trigger-icon" aria-hidden="true">
        <span class="ai-intake-trigger-dot"></span>
      </span>
      <span class="ai-intake-trigger-label">
        {{ open ? t('intake.trigger_close', '收起 AI 速记') : t('intake.trigger_open', 'AI 速记') }}
      </span>
      <span class="ai-intake-trigger-tag">{{ t('intake.trigger_tag', 'beta') }}</span>
    </button>

    <Teleport to="body">
      <Transition name="ai-intake-pop">
        <div
          v-if="open"
          class="ai-intake-panel"
          :style="panelStyle"
          @click.stop
        >
          <div class="ai-intake-head">
            <div class="ai-intake-headline">
              <div class="ai-intake-kicker">
                <span class="ai-intake-kicker-dot"></span>
                {{ t('intake.kicker', 'INTAKE · 自然语言入清单') }}
              </div>
              <div class="ai-intake-title">{{ t('intake.title', '说人话，我来排今天') }}</div>
              <div class="ai-intake-subtitle">{{ t('intake.subtitle', '把今天想做的事一口气说完，模型帮你拆条、分类、配时间，最终走的就是手动添加那条路。') }}</div>
            </div>
            <button class="ai-intake-close" :title="t('intake.close', '关闭')" @click="closePanel">×</button>
          </div>

          <div class="ai-intake-input-shell" :class="{ focused: textareaFocused, busy: intake.loading }">
            <textarea
              ref="inputEl"
              v-model="text"
              class="ai-intake-input"
              rows="3"
              spellcheck="false"
              :placeholder="rotatingPlaceholder"
              :disabled="intake.loading"
              @focus="textareaFocused = true"
              @blur="textareaFocused = false"
              @keydown.meta.enter.prevent="submit"
              @keydown.ctrl.enter.prevent="submit"
            ></textarea>
            <div class="ai-intake-input-meta">
              <span class="ai-intake-counter" :class="{ over: text.length > 1800 }">{{ text.length }}/2000</span>
              <span class="ai-intake-shortcut">{{ t('intake.shortcut', '⌘ / Ctrl + Enter 整理') }}</span>
            </div>
            <div class="ai-intake-shimmer" aria-hidden="true"></div>
          </div>

          <div class="ai-intake-actions">
            <div class="ai-intake-status">
              <template v-if="intake.loading">
                <span class="ai-intake-think">
                  <span></span><span></span><span></span>
                </span>
                {{ t('intake.parsing', '正在拆解你说的这一串…') }}
              </template>
              <template v-else-if="intake.error">
                <span class="ai-intake-status-err">{{ intake.error }}</span>
              </template>
              <template v-else-if="intake.lastResponse && intake.drafts.length">
                <span class="ai-intake-status-tag" :class="intake.lastResponse.source">
                  {{ intake.lastResponse.source === 'ai' ? t('intake.tag.ai', 'MODEL') : t('intake.tag.fallback', 'LOCAL') }}
                </span>
                <span class="ai-intake-status-text">{{ statusCopy }}</span>
              </template>
              <template v-else-if="intake.lastResponse && !intake.drafts.length">
                <span class="ai-intake-status-text">{{ t('intake.empty_after_parse', '没有解析出条目，可以再说一遍？') }}</span>
              </template>
              <template v-else>
                <span class="ai-intake-status-text muted">{{ t('intake.idle', '等你输入。') }}</span>
              </template>
            </div>

            <div class="ai-intake-buttons">
              <button class="ai-intake-clear" :disabled="!text && !intake.drafts.length" @click="clearAll">
                {{ t('intake.clear', '清空') }}
              </button>
              <button
                class="ai-intake-submit"
                :disabled="!text.trim() || intake.loading"
                @click="submit"
              >
                <span class="ai-intake-submit-dot"></span>
                {{ intake.loading ? t('intake.parsing_short', '整理中…') : t('intake.parse', '整理为今日清单') }}
              </button>
            </div>
          </div>

          <div
            v-if="intake.lastResponse?.notes && intake.lastResponse.source === 'fallback'"
            class="ai-intake-banner warn"
          >
            <span class="ai-intake-banner-tag">{{ t('intake.banner.fallback_tag', '降级提示') }}</span>
            <span class="ai-intake-banner-text">{{ intake.lastResponse.notes }}</span>
          </div>

          <div
            v-if="intake.clearDirective?.clearTodayTodos"
            class="ai-intake-clear-card"
            :class="{ active: intake.clearTodos }"
          >
            <label class="ai-intake-clear-row">
              <input
                type="checkbox"
                class="ai-intake-clear-check"
                :checked="intake.clearTodos"
                @change="onToggleClear($event)"
              />
              <div class="ai-intake-clear-body">
                <div class="ai-intake-clear-head">
                  <span class="ai-intake-clear-tag">{{ t('intake.clear.tag', '待执行清空') }}</span>
                  <span class="ai-intake-clear-title">
                    {{ t('intake.clear.title', '加入新条目前先删除当前 {n} 项 todo', { n: currentTodoCount }) }}
                  </span>
                </div>
                <div class="ai-intake-clear-meta">
                  <span v-if="currentHabitCount > 0" class="ai-intake-clear-meta-text">
                    {{ t('intake.clear.habits_kept', '{n} 个习惯会保留，不受影响', { n: currentHabitCount }) }}
                  </span>
                  <span v-else class="ai-intake-clear-meta-text">
                    {{ t('intake.clear.no_habits', '当前没有习惯，仅会清空 todo') }}
                  </span>
                </div>
                <div v-if="intake.clearDirective?.matchedText" class="ai-intake-clear-quote">
                  <span class="ai-intake-clear-quote-mark">"</span>{{ intake.clearDirective.matchedText }}<span class="ai-intake-clear-quote-mark">"</span>
                </div>
                <div v-if="intake.clearDirective?.clearReason" class="ai-intake-clear-reason">
                  {{ intake.clearDirective.clearReason }}
                </div>
                <button
                  v-if="currentTodoCount > 0"
                  type="button"
                  class="ai-intake-clear-detail-toggle"
                  @click.prevent="clearDetailOpen = !clearDetailOpen"
                >
                  <span class="ai-intake-clear-detail-mark">{{ clearDetailOpen ? '−' : '+' }}</span>
                  {{ clearDetailOpen
                    ? t('intake.clear.detail_hide', '收起将被删除的 todo 列表')
                    : t('intake.clear.detail_show', '展开看会被删的 {n} 条 todo', { n: currentTodoCount }) }}
                </button>
              </div>
            </label>
            <Transition name="ai-intake-fold">
              <ul v-if="clearDetailOpen && currentTodoCount > 0" class="ai-intake-clear-detail-list">
                <li v-for="todo in currentTodos" :key="todo.id" class="ai-intake-clear-detail-item">
                  <span class="ai-intake-clear-detail-time">{{ todo.time }}</span>
                  <span class="ai-intake-clear-detail-name">{{ todo.name }}</span>
                </li>
              </ul>
            </Transition>
          </div>

          <div v-if="intake.lastResponse?.summary || intake.lastResponse?.advice" class="ai-intake-brief">
            <div v-if="intake.lastResponse?.summary" class="ai-intake-brief-block">
              <div class="ai-intake-brief-label">{{ t('intake.brief.summary', '今日形状') }}</div>
              <div class="ai-intake-brief-text">{{ intake.lastResponse.summary }}</div>
            </div>
            <div v-if="intake.lastResponse?.advice" class="ai-intake-brief-block accent">
              <div class="ai-intake-brief-label">{{ t('intake.brief.advice', 'AI 建议') }}</div>
              <div class="ai-intake-brief-text">{{ intake.lastResponse.advice }}</div>
            </div>
          </div>

          <TransitionGroup name="ai-intake-card" tag="div" class="ai-intake-cards">
            <div
              v-for="(draft, index) in intake.drafts"
              :key="draft.draftId"
              class="ai-intake-card"
              :class="[draft.priority ? `prio-${draft.priority}` : '']"
              :style="{ '--card-delay': `${index * 50}ms` }"
            >
              <div class="ai-intake-card-row">
                <span v-if="draft.order" class="ai-intake-card-order">{{ String(draft.order).padStart(2, '0') }}</span>
                <input
                  class="ai-intake-card-name"
                  :value="draft.name"
                  :placeholder="t('intake.field.name', '事项名称')"
                  @input="onNameInput(draft.draftId, $event)"
                />
                <span v-if="draft.priority === 'high'" class="ai-intake-card-prio high">{{ t('intake.prio.high', '高') }}</span>
                <span v-else-if="draft.priority === 'low'" class="ai-intake-card-prio low">{{ t('intake.prio.low', '低') }}</span>
                <button class="ai-intake-card-remove" :title="t('intake.field.remove', '丢掉这条')" @click="intake.removeDraft(draft.draftId)">×</button>
              </div>
              <div class="ai-intake-card-row meta">
                <div class="ai-intake-card-type">
                  <button
                    class="ai-intake-card-type-btn"
                    :class="{ active: draft.type === 'habit' }"
                    @click="setType(draft.draftId, 'habit')"
                  >{{ t('intake.field.habit', '习惯') }}</button>
                  <button
                    class="ai-intake-card-type-btn"
                    :class="{ active: draft.type === 'todo' }"
                    @click="setType(draft.draftId, 'todo')"
                  >{{ t('intake.field.todo', '任务') }}</button>
                </div>
                <input
                  class="ai-intake-card-time"
                  :value="draft.time"
                  placeholder="HH:MM"
                  maxlength="5"
                  @input="onTimeInput(draft.draftId, $event)"
                />
                <span v-if="draft.note" class="ai-intake-card-note">{{ draft.note }}</span>
              </div>
              <div v-if="draft.why" class="ai-intake-card-why">
                <span class="ai-intake-card-why-mark">↳</span>
                <span>{{ draft.why }}</span>
              </div>
            </div>
          </TransitionGroup>

          <IntakeGanttChart :items="vizItems" />

          <div v-if="intake.discarded.length" class="ai-intake-discarded">
            <button class="ai-intake-discarded-toggle" @click="discardedOpen = !discardedOpen">
              <span class="ai-intake-discarded-mark">{{ discardedOpen ? '−' : '+' }}</span>
              {{ t('intake.discarded.toggle', 'AI 丢弃了 {n} 条', { n: intake.discarded.length }) }}
            </button>
            <Transition name="ai-intake-fold">
              <ul v-if="discardedOpen" class="ai-intake-discarded-list">
                <li v-for="(item, idx) in intake.discarded" :key="`disc-${idx}`" class="ai-intake-discarded-item">
                  <span class="ai-intake-discarded-text">"{{ item.text }}"</span>
                  <span class="ai-intake-discarded-reason">{{ item.reason }}</span>
                </li>
              </ul>
            </Transition>
          </div>

          <div v-if="intake.drafts.length || footClearActive" class="ai-intake-foot">
            <div class="ai-intake-foot-meta">
              <span v-if="intake.drafts.length" class="ai-intake-foot-count">
                {{ t('intake.count', '{n} 条待加入今日', { n: intake.drafts.length }) }}
              </span>
              <span v-if="footClearActive" class="ai-intake-foot-clear">
                {{ t('intake.foot.clear_first', '提交时会先删除 {n} 项现有 todo', { n: currentTodoCount }) }}
              </span>
              <span v-if="intake.lastResponse" class="ai-intake-foot-model">
                {{ t('intake.model_label', '模型') }} · {{ intake.lastResponse.model }}
              </span>
            </div>
            <button class="ai-intake-commit" :class="{ destructive: footClearActive }" :disabled="committing" @click="commitAll">
              <span class="ai-intake-commit-icon" aria-hidden="true"></span>
              {{ commitButtonLabel }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { findHabitByName, isPlanVisibleOnDate, toDateKey, type PlanType } from '@plainlist/shared';
import { useAiIntakeStore } from '@/features/ai-intake/model/useAiIntakeStore';
import IntakeGanttChart from '@/features/ai-intake/viz/IntakeGanttChart.vue';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const intake = useAiIntakeStore();
const plans = usePlansStore();
const i18n = useI18nStore();
const scrollListenerOptions = { passive: true, capture: true };
const scrollRemoveOptions = { capture: true };

const text = ref('');
const open = ref(false);
const textareaFocused = ref(false);
const committing = ref(false);
const discardedOpen = ref(false);
const clearDetailOpen = ref(false);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);

const vizItems = computed(() => intake.drafts.map(({ draftId, ...item }) => item));

const sessionDateKey = ref(toDateKey(new Date()));

function todayKey() {
  return toDateKey(new Date());
}

function syncSessionDate() {
  const today = todayKey();
  if (sessionDateKey.value === today) {
    return;
  }

  sessionDateKey.value = today;
  if (intake.drafts.length || intake.lastResponse || text.value.trim()) {
    intake.reset();
    text.value = '';
    discardedOpen.value = false;
    clearDetailOpen.value = false;
  }
}

const currentTodos = computed(() =>
  plans.plans
    .filter((plan) => plan.type === 'todo' && isPlanVisibleOnDate(plan, todayKey()))
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time)),
);
const currentTodoCount = computed(() => currentTodos.value.length);
const currentHabitCount = computed(() => plans.plans.filter((plan) => plan.type === 'habit').length);

function onToggleClear(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  intake.setClearTodos(checked);
  if (!checked) clearDetailOpen.value = false;
}

const footClearActive = computed(() => intake.clearTodos && currentTodoCount.value > 0);

const commitButtonLabel = computed(() => {
  if (committing.value) return t('intake.committing', '加入中…');
  if (footClearActive.value && intake.drafts.length === 0) {
    return t('intake.commit_clear_only', '清空当前 {n} 项 todo', { n: currentTodoCount.value });
  }
  if (footClearActive.value) {
    return t('intake.commit_clear_then_add', '清空后加入 {n} 条新条目', { n: intake.drafts.length });
  }
  return t('intake.commit', '一键加入今日清单');
});

const PANEL_WIDTH = 560;
const PANEL_MARGIN = 16;
const PANEL_GAP = 10;
const panelTop = ref(0);
const panelLeft = ref(0);

const panelStyle = computed(() => ({
  top: `${panelTop.value}px`,
  left: `${panelLeft.value}px`,
  width: `${Math.min(PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2)}px`,
}));

function updatePanelPosition() {
  const trigger = triggerEl.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const width = Math.min(PANEL_WIDTH, vw - PANEL_MARGIN * 2);

  let left = rect.right - width;
  if (left < PANEL_MARGIN) left = PANEL_MARGIN;
  if (left + width > vw - PANEL_MARGIN) left = vw - PANEL_MARGIN - width;

  panelTop.value = rect.bottom + PANEL_GAP;
  panelLeft.value = left;
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  const trigger = triggerEl.value;
  if (trigger && trigger.contains(target)) return;
  const panel = document.querySelector('.ai-intake-panel');
  if (panel && panel.contains(target)) return;
  open.value = false;
}

function onWindowReflow() {
  if (!open.value) return;
  updatePanelPosition();
}

const PLACEHOLDERS_DEFAULT = [
  '今早九点改 PPT；下午两点和小李 review 文献；每天背 30 个单词，晚上十点前跑步半小时。',
  '明早 7:30 晨读英语，11 点和导师对一下方案；记得每天喝 2L 水、晚上写日记。',
  '下午三五点钟答辩，答辩前两小时洗个澡；晚上7点约了吃饭，回来九十点钟写作业。',
];

function t(key: string, fallback: string, params?: Record<string, string | number>) {
  return i18n.t(key, fallback, params);
}

const placeholderPool = computed(() => i18n.L('intake.placeholders', PLACEHOLDERS_DEFAULT));

const placeholderIndex = ref(0);
const rotatingPlaceholder = computed(() => {
  const list = placeholderPool.value;
  if (!list.length) return '';
  return list[placeholderIndex.value % list.length];
});

let placeholderTimer: number | null = null;
function startRotation() {
  stopRotation();
  placeholderTimer = window.setInterval(() => {
    if (!open.value || textareaFocused.value || text.value.length > 0) return;
    placeholderIndex.value = (placeholderIndex.value + 1) % placeholderPool.value.length;
  }, 4200);
}
function stopRotation() {
  if (placeholderTimer !== null) {
    window.clearInterval(placeholderTimer);
    placeholderTimer = null;
  }
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    nextTick(() => {
      updatePanelPosition();
      inputEl.value?.focus();
    });
  }
}

function closePanel() {
  open.value = false;
}

function clearAll() {
  text.value = '';
  intake.reset();
  discardedOpen.value = false;
  clearDetailOpen.value = false;
  nextTick(() => inputEl.value?.focus());
}

async function submit() {
  syncSessionDate();
  const value = text.value.trim();
  if (!value) {
    inputEl.value?.focus();
    return;
  }
  discardedOpen.value = false;
  try {
    await intake.parse(value, todayKey());
  } catch {
    // Store exposes the error state for the panel.
  }
}

function onNameInput(draftId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  intake.updateDraft(draftId, { name: value });
}

function onTimeInput(draftId: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  intake.updateDraft(draftId, { time: raw });
}

function setType(draftId: string, type: PlanType) {
  intake.updateDraft(draftId, { type });
}

function isValidTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

const statusCopy = computed(() => {
  const count = intake.drafts.length;
  if (!count) return '';
  return t('intake.parsed', '已整理 {count} 条，可以直接加入或继续微调。', { count });
});

async function commitAll() {
  if (committing.value) return;
  syncSessionDate();
  const today = todayKey();
  const valid = intake.drafts.filter((draft) => draft.name.trim() && isValidTime(draft.time));
  const willClear = intake.clearTodos && currentTodoCount.value > 0;
  if (!valid.length && !willClear) return;

  if (willClear) {
    const promptCopy = t(
      'intake.clear.confirm_prompt',
      '即将永久删除当前 {n} 项 todo（习惯不受影响），删除后无法撤销，是否继续？',
      { n: currentTodoCount.value },
    );
    if (!window.confirm(promptCopy)) {
      return;
    }
  }

  committing.value = true;
  try {
    let removeFailedCount = 0;
    if (willClear) {
      const ids = currentTodos.value.map((plan) => plan.id);
      const result = await plans.removeMany(ids);
      removeFailedCount = result.failed.length;
    }

    const ordered = [...valid].sort((left, right) => {
      const byTime = left.time.localeCompare(right.time);
      if (byTime !== 0) return byTime;
      return left.name.trim().localeCompare(right.name.trim());
    });

    let addedCount = 0;
    for (const draft of ordered) {
      const name = draft.name.trim();
      if (draft.type === 'habit' && findHabitByName(plans.plans, name)) {
        continue;
      }
      await plans.add(name, draft.type, draft.time, draft.type === 'todo' ? today : undefined);
      addedCount += 1;
    }

    if (removeFailedCount > 0) {
      window.alert(
        t(
          'intake.clear.partial_fail',
          '已加入 {added} 条新条目，但有 {failed} 条旧 todo 删除失败，请稍后手动检查。',
          { added: addedCount, failed: removeFailedCount },
        ),
      );
    }

    text.value = '';
    intake.reset();
    discardedOpen.value = false;
    clearDetailOpen.value = false;
    open.value = false;
  } finally {
    committing.value = false;
  }
}

watch(open, (value) => {
  if (value) {
    startRotation();
  } else {
    stopRotation();
  }
});

onMounted(() => {
  syncSessionDate();
  if (open.value) startRotation();
  window.addEventListener('resize', onWindowReflow);
  window.addEventListener('scroll', onWindowReflow, scrollListenerOptions);
  document.addEventListener('mousedown', onDocumentClick);
  document.addEventListener('visibilitychange', syncSessionDate);
});

onUnmounted(() => {
  stopRotation();
  window.removeEventListener('resize', onWindowReflow);
  window.removeEventListener('scroll', onWindowReflow, scrollRemoveOptions);
  document.removeEventListener('mousedown', onDocumentClick);
  document.removeEventListener('visibilitychange', syncSessionDate);
});
</script>

<style scoped>
.ai-intake {
  position: relative;
  display: inline-flex;
  font-family: var(--font, 'JetBrains Mono', monospace);
}

.ai-intake-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px dashed color-mix(in srgb, var(--mid, #888) 40%, transparent);
  border-radius: 10px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface, #fff) 88%, var(--bg, #fafafa)), transparent);
  color: var(--muted, #666);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color .15s, border-color .15s, background .15s;
}
.ai-intake-trigger:hover,
.ai-intake-trigger.active {
  color: var(--dark, #111);
  border-color: color-mix(in srgb, var(--dark, #111) 55%, transparent);
}
.ai-intake-trigger-icon {
  width: 16px; height: 16px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
}
.ai-intake-trigger-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.ai-intake.busy .ai-intake-trigger-dot {
  animation: ai-intake-pulse 1s ease-in-out infinite;
}
.ai-intake-trigger-tag {
  font-size: 9px;
  padding: 2px 6px;
  border: 1px solid currentColor;
  border-radius: 999px;
  letter-spacing: .12em;
  opacity: .8;
}

.ai-intake-panel {
  position: fixed;
  max-height: min(78vh, 820px);
  overflow-y: auto;
  z-index: 1000;
  padding: 22px 22px 18px;
  background: var(--surface, #fff);
  border: 1px solid var(--faint, #e4e4e4);
  border-radius: 14px;
  box-shadow:
    0 28px 64px -28px rgba(0, 0, 0, 0.32),
    0 10px 24px -12px rgba(0, 0, 0, 0.16);
  color: var(--dark, #111);
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
  font-family: var(--font, system-ui);
}
.ai-intake-panel::-webkit-scrollbar { width: 6px; }
.ai-intake-panel::-webkit-scrollbar-thumb {
  background: var(--faint, #e4e4e4);
  border-radius: 999px;
}

.ai-intake-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  justify-content: space-between;
}
.ai-intake-headline { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ai-intake-kicker {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--muted, #666);
}
.ai-intake-kicker-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--dark, #111);
}
.ai-intake-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: .01em;
}
.ai-intake-subtitle {
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted, #666);
}
.ai-intake-close {
  background: none; border: none; cursor: pointer;
  font-size: 18px; line-height: 1;
  color: var(--muted, #666);
  padding: 2px 6px;
}
.ai-intake-close:hover { color: var(--dark, #111); }

.ai-intake-input-shell {
  position: relative;
  border: 1px solid var(--faint, #e4e4e4);
  border-radius: 10px;
  padding: 10px 12px 8px;
  background: color-mix(in srgb, var(--surface, #fff) 96%, var(--bg, #fafafa));
  transition: border-color .15s, box-shadow .15s;
}
.ai-intake-input-shell.focused {
  border-color: var(--dark, #111);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dark, #111) 8%, transparent);
}
.ai-intake-input {
  width: 100%;
  border: none; outline: none;
  background: transparent;
  resize: vertical;
  font-family: inherit;
  font-size: 13px; line-height: 1.55;
  color: var(--dark, #111);
  min-height: 64px;
}
.ai-intake-input::placeholder { color: var(--muted, #888); }
.ai-intake-input-meta {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 10px; letter-spacing: .08em; color: var(--muted, #666);
  text-transform: uppercase;
  padding-top: 6px;
}
.ai-intake-counter.over { color: #c0392b; }
.ai-intake-shimmer { display: none; }

.ai-intake-actions {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  flex-wrap: wrap;
}
.ai-intake-status {
  font-size: 11px; color: var(--muted, #666);
  display: inline-flex; align-items: center; gap: 8px;
  flex: 1; min-width: 0;
}
.ai-intake-status-text { letter-spacing: .02em; }
.ai-intake-status-text.muted { opacity: .7; }
.ai-intake-status-err { color: #c0392b; }
.ai-intake-status-tag {
  font-size: 9px; padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--mid, #888);
  letter-spacing: .12em; text-transform: uppercase;
}
.ai-intake-status-tag.ai { background: var(--dark, #111); color: var(--surface, #fff); border-color: var(--dark, #111); }
.ai-intake-status-tag.fallback { color: #b8722e; border-color: #b8722e; }
.ai-intake-think { display: inline-flex; gap: 3px; }
.ai-intake-think span {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--dark, #111);
  animation: ai-intake-pulse 1.2s ease-in-out infinite;
}
.ai-intake-think span:nth-child(2) { animation-delay: .15s; }
.ai-intake-think span:nth-child(3) { animation-delay: .3s; }

.ai-intake-buttons { display: inline-flex; gap: 8px; }
.ai-intake-clear,
.ai-intake-submit {
  font-family: inherit;
  font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  padding: 8px 12px; border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--faint, #e4e4e4);
  background: var(--surface, #fff);
  color: var(--muted, #666);
  transition: all .15s;
}
.ai-intake-clear:hover:not(:disabled) { color: var(--dark, #111); border-color: var(--dark, #111); }
.ai-intake-submit {
  background: var(--dark, #111);
  color: var(--surface, #fff);
  border-color: var(--dark, #111);
  display: inline-flex; align-items: center; gap: 6px;
}
.ai-intake-submit:hover:not(:disabled) { transform: translateY(-1px); }
.ai-intake-submit:disabled,
.ai-intake-clear:disabled { opacity: .4; cursor: not-allowed; }
.ai-intake-submit-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}

.ai-intake-banner {
  display: flex; gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px; line-height: 1.5;
}
.ai-intake-banner.warn {
  background: color-mix(in srgb, #b8722e 14%, var(--surface, #fff));
  color: #6e3e0d;
}
.ai-intake-banner-tag {
  font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
  padding: 2px 6px; border-radius: 999px;
  border: 1px solid currentColor;
  flex-shrink: 0;
}

.ai-intake-clear-card {
  border: 1px solid color-mix(in srgb, #c0392b 45%, var(--faint, #e4e4e4));
  background: color-mix(in srgb, #c0392b 6%, var(--surface, #fff));
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color .15s, background .15s;
}
.ai-intake-clear-card.active {
  border-color: #c0392b;
  background: color-mix(in srgb, #c0392b 12%, var(--surface, #fff));
  box-shadow: 0 0 0 1px color-mix(in srgb, #c0392b 30%, transparent);
}
.ai-intake-clear-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  cursor: pointer;
}
.ai-intake-clear-check {
  width: 16px;
  height: 16px;
  margin-top: 3px;
  accent-color: #c0392b;
  cursor: pointer;
  flex-shrink: 0;
}
.ai-intake-clear-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.ai-intake-clear-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ai-intake-clear-tag {
  font-size: 9px;
  letter-spacing: .14em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: #c0392b;
  color: #fff;
  flex-shrink: 0;
}
.ai-intake-clear-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dark, #111);
  line-height: 1.4;
}
.ai-intake-clear-meta {
  font-size: 11px;
  color: var(--muted, #666);
  line-height: 1.5;
}
.ai-intake-clear-quote {
  font-size: 11px;
  font-style: italic;
  color: var(--muted, #666);
  line-height: 1.5;
  padding: 4px 8px;
  background: color-mix(in srgb, var(--surface, #fff) 70%, transparent);
  border-radius: 6px;
  border-left: 2px solid color-mix(in srgb, #c0392b 60%, transparent);
}
.ai-intake-clear-quote-mark {
  opacity: .5;
  margin: 0 1px;
}
.ai-intake-clear-reason {
  font-size: 11px;
  color: var(--muted, #666);
  line-height: 1.5;
}
.ai-intake-clear-detail-toggle {
  align-self: flex-start;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
  font-family: inherit;
  font-size: 10px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted, #666);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ai-intake-clear-detail-toggle:hover { color: var(--dark, #111); }
.ai-intake-clear-detail-mark {
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}
.ai-intake-clear-detail-list {
  list-style: none;
  margin: 0;
  padding: 4px 0 0 28px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px dashed color-mix(in srgb, #c0392b 30%, transparent);
  padding-top: 8px;
}
.ai-intake-clear-detail-item {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--mid, #555);
  align-items: baseline;
}
.ai-intake-clear-detail-time {
  font-family: var(--mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--muted, #666);
  min-width: 38px;
}
.ai-intake-clear-detail-name {
  flex: 1;
  word-break: break-word;
}

.ai-intake-brief {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.ai-intake-brief-block {
  font-size: 12px; line-height: 1.55;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--surface, #fff) 92%, var(--bg, #fafafa));
  border: 1px solid var(--faint, #e4e4e4);
  border-radius: 10px;
  display: flex; flex-direction: column; gap: 4px;
  min-width: 0;
}
.ai-intake-brief-block.accent {
  background: var(--dark, #111);
  color: var(--surface, #fff);
  border-color: var(--dark, #111);
}
.ai-intake-brief-block.accent .ai-intake-brief-label { color: color-mix(in srgb, var(--surface, #fff) 70%, transparent); }
.ai-intake-brief-label {
  font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--muted, #666); margin-bottom: 2px;
}
.ai-intake-brief-text { word-break: break-word; }
@media (max-width: 540px) {
  .ai-intake-brief { grid-template-columns: 1fr; }
}

.ai-intake-cards {
  display: flex; flex-direction: column; gap: 10px;
}
.ai-intake-card {
  border: 1px solid var(--faint, #e4e4e4);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--surface, #fff);
  display: flex; flex-direction: column; gap: 8px;
  animation: ai-intake-slide-in .25s ease-out both;
  animation-delay: var(--card-delay, 0ms);
  transition: border-color .15s, box-shadow .15s;
}
.ai-intake-card:hover { border-color: color-mix(in srgb, var(--dark, #111) 35%, var(--faint, #e4e4e4)); }
.ai-intake-card.prio-high {
  border-color: var(--dark, #111);
  box-shadow: 0 0 0 1px var(--dark, #111);
}
.ai-intake-card.prio-low { opacity: .85; }
.ai-intake-card-row { display: flex; align-items: center; gap: 10px; }
.ai-intake-card-row.meta { gap: 8px; flex-wrap: wrap; padding-left: 36px; }
.ai-intake-card-order {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: 1px solid var(--faint, #e4e4e4);
  border-radius: 50%;
  font-family: var(--mono, monospace);
  font-size: 10px; font-weight: 600;
  color: var(--mid, #555);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.ai-intake-card.prio-high .ai-intake-card-order {
  background: var(--dark, #111);
  color: var(--surface, #fff);
  border-color: var(--dark, #111);
}
.ai-intake-card-name {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  font-family: inherit; font-size: 14px; font-weight: 500;
  color: var(--dark, #111);
  border-bottom: 1px dashed transparent;
  padding: 2px 0;
}
.ai-intake-card-name:focus { border-color: var(--faint, #e4e4e4); }
.ai-intake-card-prio {
  font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
  padding: 2px 6px; border-radius: 999px;
}
.ai-intake-card-prio.high { background: #c0392b; color: #fff; }
.ai-intake-card-prio.low { background: var(--faint, #e4e4e4); color: var(--muted, #666); }
.ai-intake-card-remove {
  background: none; border: none; cursor: pointer;
  font-size: 16px; line-height: 1;
  color: var(--muted, #666);
}
.ai-intake-card-remove:hover { color: #c0392b; }

.ai-intake-card-type {
  display: inline-flex;
  border: 1px solid var(--faint, #e4e4e4);
  border-radius: 6px;
  overflow: hidden;
}
.ai-intake-card-type-btn {
  background: transparent; border: none; cursor: pointer;
  font-family: inherit;
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
  padding: 4px 8px;
  color: var(--muted, #666);
}
.ai-intake-card-type-btn.active {
  background: var(--dark, #111); color: var(--surface, #fff);
}
.ai-intake-card-time {
  width: 64px;
  background: transparent;
  border: 1px solid var(--faint, #e4e4e4);
  border-radius: 6px;
  padding: 4px 8px;
  font-family: inherit; font-size: 11px;
  text-align: center;
  color: var(--dark, #111);
  font-variant-numeric: tabular-nums;
}
.ai-intake-card-time:focus { outline: none; border-color: var(--dark, #111); }
.ai-intake-card-note {
  font-size: 10px; color: var(--muted, #666);
}
.ai-intake-card-why {
  display: flex; gap: 8px;
  font-size: 11px; line-height: 1.5;
  color: var(--muted, #666);
  padding-left: 36px;
}
.ai-intake-card-why-mark { opacity: .6; flex-shrink: 0; }

.ai-intake-discarded {
  border-top: 1px dashed var(--faint, #e4e4e4);
  padding-top: 10px;
}
.ai-intake-discarded-toggle {
  background: none; border: none; cursor: pointer;
  font-family: inherit; font-size: 10px;
  letter-spacing: .1em; text-transform: uppercase;
  color: var(--muted, #666);
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0;
}
.ai-intake-discarded-toggle:hover { color: var(--dark, #111); }
.ai-intake-discarded-mark {
  width: 14px; height: 14px;
  border: 1px solid currentColor;
  border-radius: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px;
}
.ai-intake-discarded-list {
  list-style: none; padding: 8px 0 0; margin: 0;
  display: flex; flex-direction: column; gap: 6px;
}
.ai-intake-discarded-item {
  display: flex; flex-direction: column; gap: 2px;
  font-size: 11px;
  padding: 6px 8px;
  background: color-mix(in srgb, var(--surface, #fff) 92%, var(--bg, #fafafa));
  border-radius: 6px;
}
.ai-intake-discarded-text { color: var(--muted, #666); }
.ai-intake-discarded-reason { color: var(--dark, #111); font-size: 10px; opacity: .85; }

.ai-intake-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--faint, #e4e4e4);
  flex-wrap: wrap;
}
.ai-intake-foot-meta {
  display: flex; flex-direction: column; gap: 2px;
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--muted, #666);
}
.ai-intake-foot-count { color: var(--dark, #111); font-weight: 600; }
.ai-intake-foot-clear {
  color: #c0392b;
  font-weight: 600;
  letter-spacing: .06em;
}
.ai-intake-commit {
  font-family: inherit;
  font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  padding: 10px 16px; border-radius: 8px;
  cursor: pointer;
  background: var(--dark, #111);
  color: var(--surface, #fff);
  border: 1px solid var(--dark, #111);
  display: inline-flex; align-items: center; gap: 8px;
  transition: transform .15s, background .15s, border-color .15s;
}
.ai-intake-commit:hover:not(:disabled) { transform: translateY(-1px); }
.ai-intake-commit:disabled { opacity: .5; cursor: not-allowed; }
.ai-intake-commit.destructive {
  background: #c0392b;
  border-color: #c0392b;
}
.ai-intake-commit.destructive:hover:not(:disabled) {
  background: color-mix(in srgb, #c0392b 90%, #000);
}
.ai-intake-commit-icon {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}

@keyframes ai-intake-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .35; transform: scale(.8); }
}
@keyframes ai-intake-slide-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-intake-pop-enter-active,
.ai-intake-pop-leave-active {
  transition: opacity .18s ease, transform .18s ease;
  transform-origin: top right;
}
.ai-intake-pop-enter-from,
.ai-intake-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(.98);
}

.ai-intake-card-enter-active,
.ai-intake-card-leave-active { transition: opacity .2s, transform .2s; }
.ai-intake-card-enter-from { opacity: 0; transform: translateY(4px); }
.ai-intake-card-leave-to { opacity: 0; transform: translateY(-4px); }

.ai-intake-fold-enter-active,
.ai-intake-fold-leave-active { transition: opacity .15s, max-height .2s; overflow: hidden; }
.ai-intake-fold-enter-from,
.ai-intake-fold-leave-to { opacity: 0; max-height: 0; }
.ai-intake-fold-enter-to,
.ai-intake-fold-leave-from { max-height: 400px; }

</style>
