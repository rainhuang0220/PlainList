<template>
  <div class="dmf">
    <div class="dmf-label">{{ t('plan.duration.label', '时长（可选）') }}</div>
    <div class="dmf-presets">
      <button
        v-for="preset in PRESETS"
        :key="preset"
        type="button"
        class="dmf-preset"
        :class="{ active: modelValue === preset }"
        @click="selectPreset(preset)"
      >
        {{ preset }}
      </button>
      <button
        type="button"
        class="dmf-preset dmf-clear"
        :class="{ active: modelValue == null }"
        @click="clear"
      >
        {{ t('plan.duration.none', '不设') }}
      </button>
    </div>
    <input
      class="dmf-input"
      type="number"
      min="1"
      :max="MAX_MINUTES"
      inputmode="numeric"
      :value="customDisplay"
      :placeholder="t('plan.duration.custom_ph', '自定义分钟')"
      @input="onCustomInput"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const PRESETS = [15, 30, 60, 120]
const MAX_MINUTES = 24 * 60

const props = defineProps({
  modelValue: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue'])

const i18n = useI18nStore()
function t(key, fallback) {
  return i18n.t(key, fallback)
}

const customDisplay = computed(() => {
  if (props.modelValue == null) return ''
  if (PRESETS.includes(props.modelValue)) return ''
  return String(props.modelValue)
})

function selectPreset(minutes) {
  emit('update:modelValue', minutes)
}

function clear() {
  emit('update:modelValue', null)
}

function onCustomInput(event) {
  const raw = String(event.target?.value ?? '').trim()
  if (!raw) {
    emit('update:modelValue', null)
    return
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_MINUTES) return
  emit('update:modelValue', parsed)
}
</script>

<style scoped>
.dmf {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dmf-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.dmf-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dmf-preset {
  min-width: 44px;
  padding: 4px 10px;
  border: 1px solid var(--faint);
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}

.dmf-preset:hover {
  border-color: color-mix(in srgb, var(--mid) 40%, var(--surface));
  color: var(--dark);
}

.dmf-preset.active {
  background: var(--dark);
  border-color: var(--dark);
  color: var(--bg);
}

.dmf-clear {
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 10px;
}

.dmf-input {
  width: 140px;
  max-width: 100%;
  background: none;
  border: none;
  border-bottom: 1.5px solid var(--faint);
  outline: none;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--dark);
  padding: 4px 0;
  transition: border-color 0.15s;
}

.dmf-input:focus {
  border-color: var(--dark);
}

.dmf-input::placeholder {
  color: var(--muted);
  font-size: 11px;
}
</style>
