<template>
  <Teleport to="body">
    <div v-if="open" class="day-task-menu-root">
      <div
        class="day-task-menu-backdrop"
        @click="close"
        @contextmenu.prevent="close"
      />
      <div
        class="day-task-menu"
        :style="menuStyle"
        role="menu"
        @click.stop
        @contextmenu.prevent
      >
        <template v-if="panel === 'actions'">
          <button
            type="button"
            class="day-task-menu-item"
            role="menuitem"
            @click="emitToggle"
          >
            {{ toggleLabel }}
          </button>
          <button
            type="button"
            class="day-task-menu-item"
            role="menuitem"
            @click="openMinutesPanel"
          >
            {{ t('calendar.makeup.set_minutes', '设置/修改时长') }}
          </button>
        </template>

        <template v-else>
          <div class="day-task-menu-kicker">
            {{ t('calendar.makeup.minutes_label', '实际时长（分钟）') }}
          </div>
          <div class="day-task-menu-presets">
            <button
              v-for="preset in PRESETS"
              :key="preset"
              type="button"
              class="day-task-menu-preset"
              :class="{ active: Number(minutesInput) === preset }"
              @click="minutesInput = String(preset)"
            >
              {{ preset }}
            </button>
          </div>
          <input
            ref="minutesInputEl"
            v-model="minutesInput"
            class="day-task-menu-input"
            type="number"
            min="1"
            :max="MAX_MINUTES"
            inputmode="numeric"
            :placeholder="minutesPlaceholder"
            @keydown.enter.prevent="confirmMinutes"
          />
          <div class="day-task-menu-row">
            <button type="button" class="day-task-menu-btn ghost" @click="panel = 'actions'">
              {{ t('common.back', '返回') }}
            </button>
            <button type="button" class="day-task-menu-btn" @click="confirmMinutes">
              {{ t('common.confirm', '确认') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const PRESETS = [15, 30, 60, 120]
const MAX_MINUTES = 24 * 60
const MENU_WIDTH = 220

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  done: { type: Boolean, default: false },
  /** Prefill: actual minutes, else plan duration, else null */
  defaultMinutes: { type: Number, default: null },
})

const emit = defineEmits(['close', 'toggle-done', 'edit-minutes'])

const i18n = useI18nStore()
const panel = ref('actions')
const minutesInput = ref('')
const minutesInputEl = ref(null)

function t(key, fallback) {
  return i18n.t(key, fallback)
}

const toggleLabel = computed(() =>
  props.done
    ? t('calendar.makeup.mark_undone', '切换完成状态')
    : t('calendar.makeup.mark_done', '切换完成状态'),
)

const minutesPlaceholder = computed(() => {
  if (props.defaultMinutes != null) return String(props.defaultMinutes)
  return t('calendar.makeup.minutes_ph', '分钟')
})

const menuStyle = computed(() => {
  const width = Math.min(MENU_WIDTH, typeof window !== 'undefined' ? window.innerWidth - 24 : MENU_WIDTH)
  const left = typeof window !== 'undefined'
    ? Math.min(Math.max(12, props.x), window.innerWidth - width - 12)
    : props.x
  const top = typeof window !== 'undefined'
    ? Math.min(Math.max(12, props.y), window.innerHeight - 200)
    : props.y
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  }
})

function resetPanel() {
  panel.value = 'actions'
  minutesInput.value = props.defaultMinutes != null ? String(props.defaultMinutes) : ''
}

function close() {
  emit('close')
}

function emitToggle() {
  emit('toggle-done')
}

function openMinutesPanel() {
  panel.value = 'minutes'
  minutesInput.value = props.defaultMinutes != null ? String(props.defaultMinutes) : ''
  nextTick(() => minutesInputEl.value?.focus?.())
}

function confirmMinutes() {
  const parsed = Number.parseInt(String(minutesInput.value).trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_MINUTES) return
  emit('edit-minutes', parsed)
}

watch(
  () => props.open,
  (open) => {
    if (open) resetPanel()
  },
)

watch(
  () => props.defaultMinutes,
  () => {
    if (props.open && panel.value === 'minutes') {
      minutesInput.value = props.defaultMinutes != null ? String(props.defaultMinutes) : ''
    }
  },
)
</script>

<style scoped>
.day-task-menu-root {
  position: fixed;
  inset: 0;
  z-index: 10050;
}

.day-task-menu-backdrop {
  position: absolute;
  inset: 0;
}

.day-task-menu {
  position: fixed;
  padding: 6px;
  border: 1px solid var(--faint);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow: 0 16px 40px rgba(17, 17, 17, 0.14);
  backdrop-filter: blur(12px);
}

.day-task-menu-item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dark);
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.02em;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}

.day-task-menu-item:hover {
  background: var(--faint2);
}

.day-task-menu-kicker {
  padding: 6px 8px 8px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.day-task-menu-presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 0 6px 8px;
}

.day-task-menu-preset {
  padding: 6px 0;
  border: 1px solid var(--faint);
  border-radius: 8px;
  background: var(--surface);
  color: var(--mid);
  font-family: var(--mono);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}

.day-task-menu-preset:hover {
  border-color: color-mix(in srgb, var(--mid) 40%, var(--surface));
  color: var(--dark);
}

.day-task-menu-preset.active {
  background: var(--dark);
  border-color: var(--dark);
  color: var(--bg);
}

.day-task-menu-input {
  display: block;
  width: calc(100% - 12px);
  margin: 0 6px 8px;
  padding: 8px 10px;
  border: 1px solid var(--faint);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 96%, var(--bg));
  color: var(--dark);
  font-family: var(--mono);
  font-size: 13px;
  outline: none;
}

.day-task-menu-input:focus {
  border-color: color-mix(in srgb, var(--mid) 40%, var(--surface));
}

.day-task-menu-row {
  display: flex;
  gap: 6px;
  padding: 0 6px 6px;
}

.day-task-menu-btn {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--dark);
  border-radius: 8px;
  background: var(--dark);
  color: var(--bg);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.day-task-menu-btn.ghost {
  border-color: var(--faint);
  background: transparent;
  color: var(--mid);
}

.day-task-menu-btn.ghost:hover {
  border-color: color-mix(in srgb, var(--mid) 40%, var(--surface));
  color: var(--dark);
}
</style>
