<template>
  <div class="us-overlay" @click.self="emit('close')">
    <div class="us-modal" role="dialog" aria-label="用户设置">
      <!-- 左侧导航栏：永远在左侧，不再受任何响应式断点影响 -->
      <aside class="us-side">
        <div class="us-side-head">
          <div class="us-kicker">设置</div>
          <div class="us-username">{{ username }}</div>
        </div>
        <div class="us-side-body">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            class="us-nav-item"
            :class="{ 'us-nav-active': activeSection === item.id }"
            @click="switchSection(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="us-side-foot">
          <button type="button" class="us-close-btn" @click="emit('close')">关闭</button>
        </div>
      </aside>

      <!-- 右侧主区域 -->
      <section class="us-main">
        <header class="us-main-head">
          <h2 class="us-main-title">{{ activeTitle }}</h2>
          <button type="button" class="us-main-x" aria-label="close" @click="emit('close')">×</button>
        </header>
        <div class="us-main-body">
          <AiSettingsForm v-if="activeSection === 'ai'" :key="formKey" />
          <UserProfileSettings v-else-if="activeSection === 'profile'" :key="formKey" />
          <div v-else class="us-account">
            <div class="us-account-card">
              <div class="us-account-row">
                <span class="us-account-label">{{ t('settings.account_name', '用户名') }}</span>
                <span class="us-account-value">{{ username }}</span>
              </div>
              <div class="us-account-row">
                <span class="us-account-label">{{ t('settings.account_role', '角色') }}</span>
                <span class="us-account-value">
                  {{ isAdmin ? t('settings.role_admin', '管理员') : t('settings.role_user', '普通用户') }}
                </span>
              </div>
            </div>
            <p class="us-account-hint">
              {{ t('settings.account_hint', '更多账户选项（密码修改、语言偏好等）待后续版本。') }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
import AiSettingsForm from '@/widgets/settings/AiSettingsForm.vue';
import UserProfileSettings from '@/widgets/settings/UserProfileSettings.vue';

const props = defineProps<{
  username: string;
  isAdmin: boolean;
  initialSection?: 'account' | 'ai' | 'profile';
}>();

const emit = defineEmits<{ close: [] }>();

const i18n = useI18nStore();
const activeSection = ref<'account' | 'ai' | 'profile'>(props.initialSection ?? 'ai');
// 切换 tab 时强制重置子组件，避免不同 tab 状态污染
const formKey = ref(0);

function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

const navItems = computed(() => [
  { id: 'account' as const, label: t('settings.nav_account', '账户') },
  { id: 'ai' as const, label: t('settings.nav_ai', 'AI 速记') },
  { id: 'profile' as const, label: t('settings.nav_profile', 'AI 画像') },
]);

const activeTitle = computed(() => {
  if (activeSection.value === 'account') {
    return t('settings.title_account', '账户');
  }
  if (activeSection.value === 'profile') {
    return t('profile.title', '可解释的排程画像');
  }
  return t('intake.settings_title', '大模型设置');
});

// 切 tab 时子组件重新挂载，避免表单 / 画像状态残留
function switchSection(id: 'account' | 'ai' | 'profile') {
  activeSection.value = id;
  formKey.value += 1;
}

onMounted(() => {
  document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
  document.body.style.overflow = '';
});
</script>

<style scoped>
/* 命名空间全部加 us- 前缀，避免和别的组件冲突 */

/* 遮罩层 */
.us-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(6px);
  overflow: auto;
}

/* 模态框本体：固定 flex 两列 */
.us-modal {
  display: flex;
  flex-direction: row;
  width: 860px;
  max-width: 100%;
  height: 640px;
  max-height: calc(100vh - 48px);
  background: var(--surface);
  border: 1px solid var(--faint);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

/* 左侧导航：固定 220px，永远在左 */
.us-side {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  background: var(--faint2);
  border-right: 1px solid var(--faint);
  min-height: 0;
}

.us-side-head {
  padding: 20px 18px 16px;
  border-bottom: 1px solid var(--faint);
}

.us-kicker {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.us-username {
  margin-top: 6px;
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--dark);
  word-break: break-all;
}

/* 中段：导航列表，纵向排列 */
.us-side-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  overflow-y: auto;
  min-height: 0;
}

.us-nav-item {
  text-align: left;
  padding: 10px 12px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--mid);
  cursor: pointer;
  border-radius: var(--r);
  font-family: inherit;
}

.us-nav-item:hover {
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: var(--dark);
}

.us-nav-active {
  background: var(--surface);
  color: var(--dark);
  font-weight: 600;
}

.us-side-foot {
  padding: 12px 14px 16px;
  border-top: 1px solid var(--faint);
}

.us-close-btn {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--faint);
  background: transparent;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--r);
  font-family: inherit;
}

.us-close-btn:hover {
  color: var(--dark);
  border-color: var(--mid);
}

/* 右侧主区域：flex column，body 内部滚动 */
.us-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.us-main-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--faint2);
}

.us-main-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--dark);
}

.us-main-x {
  border: none;
  background: transparent;
  font-size: 26px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 8px;
}

.us-main-x:hover {
  color: var(--dark);
}

.us-main-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding: 18px 24px 24px;
}

/* 账户面板 */
.us-account-card {
  border: 1px solid var(--faint);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--surface);
}

.us-account-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  font-size: 14px;
}

.us-account-row + .us-account-row {
  border-top: 1px solid var(--faint2);
}

.us-account-label {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.us-account-value {
  color: var(--dark);
  font-family: var(--mono);
}

.us-account-hint {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
</style>
