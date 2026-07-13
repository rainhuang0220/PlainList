<template>
  <div class="profile-settings">
    <div class="profile-hero">
      <div>
        <div class="profile-kicker">{{ t('profile.kicker', 'AI PROFILE') }}</div>
        <h3>{{ t('profile.title', '可解释的排程画像') }}</h3>
        <p>
          {{ t('profile.subtitle', '只读取你的日记/当日总结生成画像。每条画像都能展开查看日期、原文依据和影响比例。') }}
        </p>
      </div>
      <button type="button" class="profile-analyze" :disabled="profile.analyzing" @click="runAnalyze">
        {{ profile.analyzing ? t('profile.analyzing', '分析中…') : t('profile.analyze', '分析最近 60 天') }}
      </button>
    </div>

    <div v-if="profile.lastRun" class="profile-run">
      <span>{{ t('profile.last_run', '最近分析') }}</span>
      <strong>{{ profile.lastRun.fromDate }} → {{ profile.lastRun.toDate }}</strong>
      <span>{{ t('profile.evidence_count', '{n} 条证据', { n: profile.lastRun.evidenceCount }) }}</span>
      <span>{{ profile.lastRun.model }}</span>
    </div>

    <p v-if="profile.error" class="profile-error">{{ profile.error }}</p>
    <p v-if="message" class="profile-ok">{{ message }}</p>

    <div v-if="profile.loading" class="profile-empty">{{ t('app.loader', '加载中…') }}</div>
    <div v-else-if="profile.traits.length === 0" class="profile-empty">
      {{ t('profile.empty', '还没有画像。先写几天当日总结，再点击分析。') }}
    </div>

    <div v-else class="profile-list">
      <article
        v-for="trait in profile.traits"
        :key="trait.id"
        class="profile-card"
        :class="{ disabled: !trait.enabled }"
      >
        <header class="profile-card-head">
          <div>
            <input
              class="profile-title-input"
              :value="editFor(trait).title"
              maxlength="160"
              @input="editFor(trait).title = ($event.target as HTMLInputElement).value"
            />
            <div class="profile-card-meta">
              <span>{{ t('profile.support', '出现 {n} 次', { n: trait.supportCount }) }}</span>
              <span>{{ t('profile.confidence', '置信 {n}%', { n: percent(trait.confidence) }) }}</span>
              <span v-if="trait.lastEvidenceDate">{{ trait.lastEvidenceDate }}</span>
            </div>
          </div>
          <label class="profile-toggle">
            <input
              type="checkbox"
              :checked="trait.enabled"
              :disabled="profile.saving"
              @change="toggleTrait(trait, $event)"
            />
            <span>{{ trait.enabled ? t('profile.enabled', '启用') : t('profile.disabled', '停用') }}</span>
          </label>
        </header>

        <label class="profile-summary">
          <span>{{ t('profile.summary_label', '画像描述') }}</span>
          <textarea
            :value="editFor(trait).userSummary"
            rows="3"
            maxlength="2000"
            @input="editFor(trait).userSummary = ($event.target as HTMLTextAreaElement).value"
          ></textarea>
        </label>

        <div class="profile-impact">
          <div class="profile-impact-head">
            <span>{{ t('profile.impact', '影响比例') }}</span>
            <strong>{{ percent(editFor(trait).impactRatio) }}%</strong>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(editFor(trait).impactRatio * 100)"
            @input="editFor(trait).impactRatio = Number(($event.target as HTMLInputElement).value) / 100"
          />
        </div>

        <div class="profile-evidence-preview">
          <button type="button" class="profile-evidence-toggle" @click="toggleEvidence(trait)">
            {{ openTraitId === trait.id ? t('profile.hide_evidence', '收起依据') : t('profile.show_evidence', '查看依据') }}
          </button>
          <button type="button" class="profile-save" :disabled="profile.saving" @click="saveTrait(trait)">
            {{ profile.saving ? t('profile.saving', '保存中…') : t('plan.add_save', '保存') }}
          </button>
        </div>

        <div v-if="openTraitId === trait.id" class="profile-evidence">
          <div
            v-for="evidence in visibleEvidence(trait)"
            :key="evidence.id"
            class="profile-evidence-item"
          >
            <div class="profile-evidence-date">{{ evidence.reviewDate }}</div>
            <blockquote>{{ evidence.excerpt }}</blockquote>
            <p>{{ evidence.impactNote }}</p>
            <span>{{ t('profile.weight', '权重 {n}%', { n: percent(evidence.weight) }) }}</span>
          </div>
          <div v-if="evidenceLoading" class="profile-evidence-loading">{{ t('app.loader', '加载中…') }}</div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserProfileEvidenceRecord, UserProfileTraitRecord } from '@plainlist/shared';
import { onMounted, reactive, ref, watch } from 'vue';
import { useUserProfileStore } from '@/features/user-profile/model/useUserProfileStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

interface TraitEdit {
  title: string;
  userSummary: string;
  impactRatio: number;
}

const profile = useUserProfileStore();
const i18n = useI18nStore();
const edits = reactive<Record<number, TraitEdit>>({});
const openTraitId = ref<number | null>(null);
const fullEvidence = reactive<Record<number, UserProfileEvidenceRecord[]>>({});
const evidenceLoading = ref(false);
const message = ref('');

function t(key: string, fallback: string, params?: Record<string, string | number>) {
  return i18n.t(key, fallback, params);
}

function percent(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function syncEdits() {
  for (const trait of profile.traits) {
    edits[trait.id] = {
      title: trait.title,
      userSummary: trait.userSummary ?? trait.generatedSummary,
      impactRatio: trait.impactRatio,
    };
  }
}

function editFor(trait: UserProfileTraitRecord): TraitEdit {
  if (!edits[trait.id]) {
    edits[trait.id] = {
      title: trait.title,
      userSummary: trait.userSummary ?? trait.generatedSummary,
      impactRatio: trait.impactRatio,
    };
  }
  return edits[trait.id];
}

async function runAnalyze() {
  message.value = '';
  const result = await profile.analyze(60);
  message.value = t(
    'profile.analyze_done',
    '分析完成：生成 {evidence} 条证据，覆盖 {traits} 条画像。',
    { evidence: result.evidenceCount, traits: result.traitCount },
  );
}

async function saveTrait(trait: UserProfileTraitRecord) {
  message.value = '';
  const edit = editFor(trait);
  await profile.updateTrait(trait.id, {
    title: edit.title.trim(),
    userSummary: edit.userSummary.trim() || null,
    impactRatio: edit.impactRatio,
  });
  message.value = t('profile.saved', '画像已保存。');
}

async function toggleTrait(trait: UserProfileTraitRecord, event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  await profile.updateTrait(trait.id, { enabled });
}

async function toggleEvidence(trait: UserProfileTraitRecord) {
  if (openTraitId.value === trait.id) {
    openTraitId.value = null;
    return;
  }

  openTraitId.value = trait.id;
  if (fullEvidence[trait.id]) {
    return;
  }

  evidenceLoading.value = true;
  try {
    fullEvidence[trait.id] = await profile.fetchEvidence(trait.id);
  } finally {
    evidenceLoading.value = false;
  }
}

function visibleEvidence(trait: UserProfileTraitRecord) {
  return fullEvidence[trait.id] ?? trait.evidence ?? [];
}

watch(() => profile.traits, syncEdits, { deep: true });

onMounted(async () => {
  await profile.fetch();
  syncEdits();
});
</script>

<style scoped>
.profile-settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-hero {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--faint);
  border-radius: calc(var(--r) + 4px);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 88%, var(--faint2)), var(--surface)),
    var(--surface);
}

.profile-kicker {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--muted);
}

.profile-hero h3 {
  margin: 6px 0 8px;
  font-size: 20px;
  color: var(--dark);
}

.profile-hero p {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mid);
}

.profile-analyze,
.profile-save,
.profile-evidence-toggle {
  border: 1px solid var(--dark);
  border-radius: var(--r);
  background: var(--dark);
  color: var(--surface);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.profile-analyze {
  align-self: flex-start;
  padding: 10px 14px;
  white-space: nowrap;
}

.profile-save,
.profile-evidence-toggle {
  padding: 8px 11px;
}

.profile-evidence-toggle {
  background: transparent;
  color: var(--dark);
}

.profile-analyze:disabled,
.profile-save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.profile-run,
.profile-ok,
.profile-error,
.profile-empty {
  padding: 10px 12px;
  border: 1px solid var(--faint);
  border-radius: var(--r);
  font-size: 12px;
}

.profile-run {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
  background: var(--faint2);
}

.profile-run strong {
  color: var(--dark);
}

.profile-ok {
  color: #166534;
  background: rgba(22, 101, 52, 0.08);
}

.profile-error {
  color: #9b1c1c;
  background: rgba(155, 28, 28, 0.08);
}

.profile-empty {
  color: var(--muted);
  background: var(--faint2);
}

.profile-list {
  display: grid;
  gap: 12px;
}

.profile-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--faint);
  border-radius: calc(var(--r) + 2px);
  background: var(--surface);
  box-shadow: 0 1px 0 var(--faint2);
}

.profile-card.disabled {
  opacity: 0.62;
}

.profile-card-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.profile-title-input {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--dark);
  font-size: 16px;
  font-weight: 700;
  outline: none;
}

.profile-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
}

.profile-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--mid);
}

.profile-summary {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.profile-summary textarea {
  width: 100%;
  resize: vertical;
  min-height: 74px;
  padding: 10px;
  border: 1px solid var(--faint);
  border-radius: var(--r);
  background: var(--faint2);
  color: var(--dark);
  line-height: 1.5;
}

.profile-impact {
  display: grid;
  gap: 6px;
}

.profile-impact-head,
.profile-evidence-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.profile-impact-head {
  font-size: 12px;
  color: var(--muted);
}

.profile-impact-head strong {
  color: var(--dark);
}

.profile-impact input {
  width: 100%;
  accent-color: var(--dark);
}

.profile-evidence {
  display: grid;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--faint2);
}

.profile-evidence-item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--faint2);
  border-radius: var(--r);
  background: color-mix(in srgb, var(--faint2) 70%, transparent);
}

.profile-evidence-date {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.profile-evidence blockquote {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--dark);
  color: var(--dark);
  font-size: 13px;
  line-height: 1.5;
}

.profile-evidence p {
  margin: 0;
  font-size: 12px;
  color: var(--mid);
}

.profile-evidence span,
.profile-evidence-loading {
  font-size: 11px;
  color: var(--muted);
}

@media (max-width: 720px) {
  .profile-hero,
  .profile-card-head {
    flex-direction: column;
  }

  .profile-analyze {
    align-self: stretch;
  }
}
</style>
