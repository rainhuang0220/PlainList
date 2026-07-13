<template>
  <form class="ai-settings-form" @submit.prevent="save">
    <div class="settings-note">
      {{ t('intake.settings_subtitle', '每人可填自己的 API Key（主流 BYOK 方案）。留空 Key 则使用服务端 apps/api/.env 里的默认配置。') }}
    </div>

    <div v-if="loading" class="settings-status">{{ t('app.loader', '加载中…') }}</div>
    <template v-else>
      <div class="settings-effective">
        {{ t('intake.settings_effective', '当前生效') }}：
        <strong>{{ effectiveLabel }}</strong>
      </div>

      <div class="settings-presets">
        <span class="settings-presets-label">{{ t('intake.settings_presets', '快速填充') }}</span>
        <button type="button" class="settings-preset-btn" @click="applyQwenPreset" :disabled="applyingPreset">
          {{ t('intake.settings_presets_qwen', '通义千问 qwen3.7-plus') }}
        </button>
      </div>

      <p class="settings-effective-sub" v-if="view">
        {{ t('intake.settings_intake_effective', '速记实际使用') }}：<strong>{{ view.effectiveIntakeModel }}</strong>
      </p>

      <p class="settings-provider-hint">{{ providerHint }}</p>

      <label class="settings-field">
        <span>{{ t('intake.settings_provider', '协议') }}</span>
        <select v-model="form.provider">
          <option value="openai">OpenAI 兼容（DashScope / SiliconFlow / DeepSeek / OpenRouter …）</option>
          <option value="anthropic">Anthropic 兼容（Claude …）</option>
        </select>
      </label>

      <label class="settings-field">
        <span>{{ t('intake.settings_base_url', '接口地址') }}</span>
        <input v-model="form.baseUrl" type="url" required placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
      </label>

      <label class="settings-field">
        <span>{{ t('intake.settings_model', '深度模型') }}</span>
        <input v-model="form.model" type="text" required placeholder="qwen3.7-plus" />
        <small class="settings-hint">复盘、深度推理等场景；速记可单独指定更快模型。</small>
      </label>

      <label class="settings-field">
        <span>{{ t('intake.settings_intake_model', '速记模型') }}</span>
        <input
          v-model="form.intakeModel"
          type="text"
          :placeholder="form.model"
        />
        <small class="settings-hint">
          {{ t('intake.settings_intake_model_hint', '留空则与深度模型相同。速记建议填更快模型（如 qwen3.7-plus）。') }}
        </small>
      </label>

      <label class="settings-field">
        <span>{{ t('intake.settings_api_key', 'API Key') }}</span>
        <input
          v-model="form.apiKey"
          type="password"
          autocomplete="off"
          :placeholder="apiKeyPlaceholder"
        />
        <small v-if="view?.apiKeyPreview" class="settings-hint">
          {{ t('intake.settings_saved_key', '已保存') }}: {{ view.apiKeyPreview }}
        </small>
      </label>

      <label class="settings-field">
        <span>{{ t('intake.settings_timeout', '超时 (ms)') }}</span>
        <input v-model.number="form.timeoutMs" type="number" min="3000" max="300000" step="1000" />
      </label>

      <label v-if="form.provider === 'anthropic'" class="settings-field">
        <span>Anthropic-Version</span>
        <input v-model="form.anthropicVersion" type="text" placeholder="2023-06-01" />
      </label>

      <p v-if="error" class="settings-error">{{ error }}</p>
      <p v-if="testMessage" :class="testOk ? 'settings-ok' : 'settings-error'">{{ testMessage }}</p>
      <p v-if="saved" class="settings-ok">{{ t('intake.settings_saved', '已保存') }}</p>

      <div class="settings-actions">
        <button type="button" class="settings-btn-secondary" @click="runConnectionTest('intake')" :disabled="testing || saving">
          {{ testing ? t('intake.settings_testing', '测试中…') : t('intake.settings_test_intake', '测试速记模型') }}
        </button>
        <button type="button" class="settings-btn-secondary" @click="runConnectionTest('deep')" :disabled="testing || saving">
          {{ t('intake.settings_test_deep', '测试深度模型') }}
        </button>
        <button type="button" class="settings-btn-secondary" @click="resetToServer">
          {{ t('intake.settings_clear', '清除个人配置') }}
        </button>
        <button type="submit" class="settings-btn-primary" :disabled="saving">
          {{ saving ? t('intake.settings_saving', '保存中…') : t('plan.add_save', '保存') }}
        </button>
      </div>
    </template>
  </form>
</template>

<script setup lang="ts">
import type { AiConnectionTestResult, AiProvider, AiUserSettingsView, AiUserSettingsViewWithKey } from '@plainlist/shared';
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const i18n = useI18nStore();
const { del, get, post, put } = useApi();

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const applyingPreset = ref(false);
const showApiKey = ref(true);
const saved = ref(false);
const error = ref('');
const testMessage = ref('');
const testOk = ref(false);
const view = ref<AiUserSettingsView | null>(null);
let loadController: AbortController | null = null;
let mounted = true;

const form = reactive({
  provider: 'openai' as AiProvider,
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.7-plus',
  intakeModel: '',
  apiKey: '',
  timeoutMs: 30000,
  anthropicVersion: '2023-06-01',
});

function t(key: string, fallback: string, params?: Record<string, string | number>) {
  return i18n.t(key, fallback, params);
}

const effectiveLabel = computed(() => {
  const source = view.value?.effectiveSource ?? 'none';
  if (source === 'user') return t('intake.settings_source_user', '你的个人 Key');
  if (source === 'server') return t('intake.settings_source_server', '服务端 .env 默认');
  return t('intake.settings_source_none', '未配置');
});

const apiKeyPlaceholder = computed(() => {
  if (view.value?.apiKeyConfigured) {
    return t('intake.settings_key_keep', '留空则保持已保存的 Key');
  }
  return 'sk-...';
});

const providerHint = computed(() => {
  if (form.provider === 'anthropic') {
    return 'Anthropic 兼容：Base URL 填官方/兼容网关地址，模型按网关支持的 Claude 系列填写。';
  }
  return '通义千问 qwen3.7-plus（推荐）：Base URL 填 https://dashscope.aliyuncs.com/compatible-mode/v1 ，模型 qwen3.7-plus。DashScope 兼容 OpenAI 协议，可直接使用 OpenAI SDK。';
});

function applyQwenPreset() {
  form.provider = 'openai';
  form.baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  form.model = 'qwen3.7-plus';
  form.intakeModel = 'qwen3.7-plus';
  form.timeoutMs = 60000;
  void applyServerDefault();
}

async function applyServerDefault() {
  applyingPreset.value = true;
  saved.value = false;
  error.value = '';
  testMessage.value = '';
  try {
    const next = await post<AiUserSettingsViewWithKey>('/ai-intake/settings/apply-default', {});
    applyView(next);
    // apply-default 接口一次性返回真实 Key，演示时直接显示在输入框里
    form.apiKey = next.apiKey ?? '';
    saved.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'apply default failed';
  } finally {
    applyingPreset.value = false;
  }
}

function applyView(next: AiUserSettingsView) {
  view.value = next;
  form.provider = next.provider;
  form.baseUrl = next.baseUrl;
  form.model = next.model;
  form.intakeModel = next.intakeModel ?? '';
  form.timeoutMs = next.timeoutMs;
  form.anthropicVersion = next.anthropicVersion ?? '2023-06-01';
  form.apiKey = '';
}

async function load() {
  loadController?.abort();
  loadController = new AbortController();
  const signal = loadController.signal;

  loading.value = true;
  error.value = '';
  try {
    applyView(await get<AiUserSettingsView>('/ai-intake/settings', signal));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }
    error.value = err instanceof Error ? err.message : 'load failed';
  } finally {
    if (mounted && !signal.aborted) {
      loading.value = false;
    }
  }
}

function settingsPayload(testTarget: 'deep' | 'intake' = 'deep') {
  return {
    provider: form.provider,
    baseUrl: form.baseUrl,
    model: form.model,
    intakeModel: form.intakeModel,
    apiKey: form.apiKey,
    timeoutMs: form.timeoutMs,
    anthropicVersion: form.provider === 'anthropic' ? form.anthropicVersion : undefined,
    testTarget,
  };
}

async function runConnectionTest(testTarget: 'deep' | 'intake' = 'deep') {
  testing.value = true;
  saved.value = false;
  error.value = '';
  testMessage.value = '';
  testOk.value = false;

  try {
    const result = await post<AiConnectionTestResult>('/ai-intake/settings/test', settingsPayload(testTarget));
    testOk.value = true;
    testMessage.value = t(
      'intake.settings_test_ok',
      '连通成功：{model} · {latency}ms · 来源 {source}',
      {
        model: result.model,
        latency: String(result.latencyMs),
        source: result.source === 'user'
          ? t('intake.settings_source_user', '你的个人 Key')
          : t('intake.settings_source_server', '服务端 .env 默认'),
      },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }
    testOk.value = false;
    testMessage.value = err instanceof Error ? err.message : t('intake.settings_test_fail', '连通失败');
  } finally {
    testing.value = false;
  }
}

async function save() {
  saving.value = true;
  saved.value = false;
  error.value = '';
  testMessage.value = '';
  try {
    applyView(await put<AiUserSettingsView>('/ai-intake/settings', settingsPayload()));
    saved.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'save failed';
  } finally {
    saving.value = false;
  }
}

async function resetToServer() {
  saving.value = true;
  error.value = '';
  try {
    applyView(await del<AiUserSettingsView>('/ai-intake/settings'));
    saved.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'clear failed';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  mounted = true;
  void load();
});

onUnmounted(() => {
  mounted = false;
  loadController?.abort();
});
</script>

<style scoped>
.ai-settings-form {
  max-width: 520px;
}

.settings-note {
  margin-bottom: 20px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mid);
}

.settings-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.settings-presets-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.settings-preset-btn {
  border: 1px solid var(--faint);
  background: var(--faint2);
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--r);
}

.settings-provider-hint {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}

.settings-status {
  font-size: 13px;
  color: var(--muted);
}

.settings-effective {
  margin-bottom: 18px;
  padding: 10px 12px;
  background: var(--faint2);
  font-size: 13px;
}

.settings-effective-sub {
  margin: -8px 0 16px;
  font-size: 12px;
  color: var(--muted);
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.settings-field input,
.settings-field select {
  padding: 10px 12px;
  border: 1px solid var(--faint);
  background: var(--bg);
  color: var(--dark);
  font: inherit;
  font-size: 14px;
  letter-spacing: normal;
  text-transform: none;
  border-radius: var(--r);
}

.settings-hint {
  font-size: 12px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--muted);
}

.settings-key-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.settings-key-input {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--mono);
  font-size: 13px;
}

.settings-key-toggle {
  flex: 0 0 auto;
  padding: 0 10px;
  border: 1px solid var(--faint);
  background: var(--faint2);
  color: var(--mid);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: var(--r);
}

.settings-key-toggle:hover {
  color: var(--dark);
  border-color: var(--mid);
}

.settings-error {
  color: #b42318;
  font-size: 13px;
}

.settings-ok {
  color: #067647;
  font-size: 13px;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--faint2);
}

.settings-actions .settings-btn-secondary:first-child {
  margin-right: auto;
}

.settings-btn-primary,
.settings-btn-secondary {
  border: 1px solid var(--faint);
  padding: 8px 14px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: var(--r);
}

.settings-btn-primary {
  background: var(--dark);
  color: var(--surface);
  border-color: var(--dark);
}

.settings-btn-secondary {
  background: transparent;
  color: var(--mid);
}
</style>
