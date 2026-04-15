<template>
  <section class="showcase-home">
    <div class="showcase-topbar">
      <div class="showcase-mark">PL/</div>
      <button
        class="showcase-locale"
        type="button"
        :title="t('nav.language', 'Language')"
        @click="localeStore.toggleLocale()"
      >
        {{ localeStore.switchLabel }}
      </button>
    </div>

    <div class="showcase-grid">
      <div class="showcase-copy">
        <div class="showcase-kicker">{{ t('showcase.kicker', 'PlainList showcase') }}</div>
        <h1 class="showcase-title">{{ t('showcase.title', 'PlainList helps you see time across multiple scales.') }}</h1>
        <p class="showcase-summary">
          {{ t('showcase.summary', 'A personal habit tracker and planning workspace for daily execution, monthly patterns, yearly context, and reflective weekly review.') }}
        </p>

        <div class="showcase-problem">
          <div class="showcase-label">{{ t('showcase.problem_label', 'Why it exists') }}</div>
          <p>
            {{ t('showcase.problem', 'Most todo lists only show the next item. PlainList connects your current actions with longer-term rhythm, consistency, and review.') }}
          </p>
        </div>

        <div class="showcase-actions">
          <button class="showcase-btn primary" type="button" @click="$emit('demo')">
            {{ t('showcase.try_demo', 'Try demo account') }}
          </button>
          <button class="showcase-btn" type="button" @click="$emit('login')">
            {{ t('showcase.enter_terminal', 'Open terminal login') }}
          </button>
        </div>

        <div class="showcase-demo-note">
          {{ t('showcase.demo_note', 'Demo account: {username} / {password}', demoParams) }}
        </div>
      </div>

      <div class="showcase-panel">
        <div class="showcase-label">{{ t('showcase.features_label', 'Core strengths') }}</div>
        <div class="showcase-feature-list">
          <article class="showcase-feature-card">
            <div class="showcase-feature-title">{{ t('showcase.feature.time_title', 'Multi-scale time views') }}</div>
            <p>{{ t('showcase.feature.time_body', 'Move between Now, Day, Month, Year, and Week to understand both execution and trend.') }}</p>
          </article>
          <article class="showcase-feature-card">
            <div class="showcase-feature-title">{{ t('showcase.feature.ai_title', 'AI reviews') }}</div>
            <p>{{ t('showcase.feature.ai_body', 'Review completion rate, streaks, best plans, and weak spots from your actual check history.') }}</p>
          </article>
          <article class="showcase-feature-card">
            <div class="showcase-feature-title">{{ t('showcase.feature.plugin_title', 'Plugin themes') }}</div>
            <p>{{ t('showcase.feature.plugin_body', 'Adjust language and theme through manifest-driven plugins without runtime script execution.') }}</p>
          </article>
        </div>

        <div class="showcase-preview">
          <div class="showcase-preview-head">
            <span>PL/</span>
            <span>{{ t('showcase.preview_label', 'preview flow') }}</span>
          </div>
          <div class="showcase-preview-body">
            <div class="showcase-preview-section">
              <div class="showcase-preview-tag">{{ t('nav.day', 'Day') }}</div>
              <div class="showcase-preview-line long"></div>
              <div class="showcase-preview-line short"></div>
            </div>
            <div class="showcase-preview-section">
              <div class="showcase-preview-tag">{{ t('nav.month', 'Month') }}</div>
              <div class="showcase-preview-dots">
                <span v-for="index in 8" :key="index"></span>
              </div>
            </div>
            <div class="showcase-preview-section">
              <div class="showcase-preview-tag">{{ t('plan.ai.title', 'AI Review') }}</div>
              <div class="showcase-preview-line long"></div>
              <div class="showcase-preview-line medium"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { computed } from 'vue';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const emit = defineEmits<{
  login: [];
  demo: [];
}>();
void emit;

const localeStore = useLocaleStore();
const i18n = useI18nStore();

const demoParams = computed(() => ({
  username: DEMO_ACCOUNT.username,
  password: DEMO_ACCOUNT.password,
}));

function t(key: string, fallback: string, params?: Record<string, string | number>) {
  return i18n.t(key, fallback, params);
}
</script>

<style scoped>
.showcase-home {
  min-height: 100vh;
  padding: 32px;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(17,17,17,.05), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 84%, var(--bg)) 0%, var(--bg) 100%);
}
.showcase-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.showcase-mark {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -.03em;
}
.showcase-locale {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--faint);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  font-family: var(--mono);
  font-size: 10px;
  color: var(--mid);
  cursor: pointer;
}
.showcase-locale:hover {
  border-color: color-mix(in srgb, var(--mid) 45%, var(--surface));
  color: var(--dark);
}
.showcase-grid {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr);
  gap: 28px;
  align-items: center;
  width: min(1180px, 100%);
  margin: 0 auto;
}
.showcase-copy,
.showcase-panel {
  border: 1px solid var(--faint);
  border-radius: 24px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 24px 56px rgba(17,17,17,.06);
  backdrop-filter: blur(12px);
}
.showcase-copy {
  padding: 42px;
}
.showcase-panel {
  padding: 28px;
}
.showcase-kicker,
.showcase-label,
.showcase-preview-head,
.showcase-preview-tag {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: .12em;
}
.showcase-kicker,
.showcase-label {
  font-size: 11px;
  color: var(--muted);
}
.showcase-title {
  margin-top: 18px;
  font-size: clamp(38px, 5vw, 62px);
  line-height: .98;
  letter-spacing: -.05em;
  max-width: 9ch;
}
.showcase-summary,
.showcase-problem p,
.showcase-feature-card p {
  color: var(--mid);
  line-height: 1.7;
}
.showcase-summary {
  margin-top: 18px;
  max-width: 620px;
  font-size: 15px;
}
.showcase-problem {
  margin-top: 28px;
  max-width: 620px;
}
.showcase-problem p {
  margin-top: 10px;
  font-size: 14px;
}
.showcase-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}
.showcase-btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--faint);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: var(--dark);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  cursor: pointer;
}
.showcase-btn.primary {
  background: var(--dark);
  border-color: var(--dark);
  color: var(--surface);
}
.showcase-btn:hover {
  border-color: color-mix(in srgb, var(--mid) 45%, var(--surface));
}
.showcase-btn.primary:hover {
  background: var(--mid);
  border-color: var(--mid);
}
.showcase-demo-note {
  margin-top: 14px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}
.showcase-feature-list {
  margin-top: 14px;
  display: grid;
  gap: 12px;
}
.showcase-feature-card {
  padding: 16px 18px;
  border: 1px solid var(--faint2);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 94%, var(--bg));
}
.showcase-feature-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -.01em;
}
.showcase-feature-card p {
  margin-top: 6px;
  font-size: 12px;
}
.showcase-preview {
  margin-top: 18px;
  padding: 18px;
  border-radius: 18px;
  background: var(--dark);
  color: var(--surface);
}
.showcase-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  color: color-mix(in srgb, var(--surface) 64%, transparent);
}
.showcase-preview-body {
  margin-top: 14px;
  display: grid;
  gap: 12px;
}
.showcase-preview-section {
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 8%, transparent);
}
.showcase-preview-tag {
  font-size: 9px;
  color: color-mix(in srgb, var(--surface) 62%, transparent);
}
.showcase-preview-line {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 22%, transparent);
  margin-top: 10px;
}
.showcase-preview-line.long { width: 100%; }
.showcase-preview-line.medium { width: 78%; }
.showcase-preview-line.short { width: 58%; }
.showcase-preview-dots {
  display: flex;
  gap: 6px;
  margin-top: 12px;
}
.showcase-preview-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 20%, transparent);
}
.showcase-preview-dots span:nth-child(2n) {
  background: color-mix(in srgb, var(--surface) 34%, transparent);
}
.showcase-preview-dots span:nth-child(3n) {
  background: color-mix(in srgb, var(--surface) 54%, transparent);
}
@media (max-width: 900px) {
  .showcase-home {
    padding: 20px;
  }
  .showcase-grid {
    grid-template-columns: 1fr;
    align-items: start;
    margin-top: 18px;
  }
  .showcase-copy,
  .showcase-panel {
    padding: 22px;
  }
  .showcase-title {
    max-width: none;
    font-size: clamp(34px, 10vw, 52px);
  }
}
</style>
