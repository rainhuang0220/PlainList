<template>
  <div class="user-settings-overlay" @click.self="emit('close')">
    <div class="user-settings-shell">
      <aside class="user-settings-sidebar">
        <div class="user-settings-sidebar-head">
          <div class="user-settings-kicker">{{ t('settings.kicker', 'Settings') }}</div>
          <div class="user-settings-username">{{ username }}</div>
        </div>

        <nav class="user-settings-nav">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            :class="['user-settings-nav-item', { active: activeSection === item.id }]"
            @click="activeSection = item.id"
          >
            {{ item.label }}
          </button>
        </nav>

        <button type="button" class="user-settings-close-side" @click="emit('close')">
          {{ t('settings.close', '关闭') }}
        </button>
      </aside>

      <main class="user-settings-main">
        <header class="user-settings-main-head">
          <h2 class="user-settings-title">{{ activeTitle }}</h2>
          <button type="button" class="user-settings-close" aria-label="close" @click="emit('close')">×</button>
        </header>

        <section v-if="activeSection === 'account'" class="user-settings-content">
          <div class="settings-account-card">
            <div class="settings-account-row">
              <span class="settings-account-label">{{ t('settings.account_name', '用户名') }}</span>
              <span class="settings-account-value">{{ username }}</span>
            </div>
            <div class="settings-account-row">
              <span class="settings-account-label">{{ t('settings.account_role', '角色') }}</span>
              <span class="settings-account-value">
                {{ isAdmin ? t('settings.role_admin', '管理员') : t('settings.role_user', '普通用户') }}
              </span>
            </div>
          </div>
          <p class="settings-account-hint">
            {{ t('settings.account_hint', '更多账户选项（密码修改、语言偏好等）待后续版本。') }}
          </p>
        </section>

        <section v-else-if="activeSection === 'ai'" class="user-settings-content">
          <AiSettingsForm />
        </section>

        <section v-else class="user-settings-content">
          <UserProfileSettings />
        </section>
      </main>
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

onMounted(() => {
  document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
  document.body.style.overflow = '';
});
</script>

<style scoped>
.user-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: max(52px, 8vh) 24px 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(6px);
}

.user-settings-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: minmax(0, 1fr);
  width: min(860px, 100%);
  height: min(640px, calc(100vh - max(52px, 8vh) - 24px));
  max-height: min(640px, calc(100vh - max(52px, 8vh) - 24px));
  background: var(--surface);
  border: 1px solid var(--faint);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

.user-settings-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px 0;
  background: var(--faint2);
  border-right: 1px solid var(--faint);
  overflow-y: auto;
}

.user-settings-sidebar-head {
  padding: 0 18px 16px;
  border-bottom: 1px solid var(--faint);
}

.user-settings-kicker {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.user-settings-username {
  margin-top: 6px;
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--dark);
}

.user-settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  flex: 1;
}

.user-settings-nav-item {
  text-align: left;
  padding: 10px 12px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--mid);
  cursor: pointer;
  border-radius: var(--r);
  transition: background 0.15s, color 0.15s;
}

.user-settings-nav-item:hover {
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: var(--dark);
}

.user-settings-nav-item.active {
  background: var(--surface);
  color: var(--dark);
  font-weight: 600;
  box-shadow: 0 1px 0 var(--faint);
}

.user-settings-close-side {
  margin: 0 14px;
  padding: 8px 10px;
  border: 1px solid var(--faint);
  background: transparent;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--r);
}

.user-settings-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.user-settings-main-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--faint2);
}

.user-settings-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.user-settings-close {
  border: none;
  background: transparent;
  font-size: 26px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
}

.user-settings-content {
  flex: 1;
  min-height: 0;
  padding: 18px 24px 24px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.settings-account-card {
  border: 1px solid var(--faint);
  border-radius: var(--r);
  overflow: hidden;
}

.settings-account-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  font-size: 14px;
}

.settings-account-row + .settings-account-row {
  border-top: 1px solid var(--faint2);
}

.settings-account-label {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.settings-account-value {
  color: var(--dark);
  font-family: var(--mono);
}

.settings-account-hint {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

@media (max-width: 720px) {
  .user-settings-overlay {
    padding: 56px 12px 12px;
  }

  .user-settings-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    height: min(640px, calc(100vh - 68px));
    max-height: min(640px, calc(100vh - 68px));
  }

  .user-settings-sidebar {
    flex-shrink: 0;
    max-height: none;
    overflow: visible;
    border-right: none;
    border-bottom: 1px solid var(--faint);
    padding-bottom: 10px;
  }

  .user-settings-nav {
    flex-direction: row;
    flex-wrap: wrap;
    padding: 8px 12px;
  }

  .user-settings-close-side {
    display: none;
  }
}
</style>
