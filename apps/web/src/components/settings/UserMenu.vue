<template>
  <div ref="rootEl" class="user-menu">
    <button
      type="button"
      class="user-menu-trigger"
      :class="{ open: menuOpen }"
      :aria-expanded="menuOpen"
      @click="toggleMenu"
    >
      <span class="user-menu-avatar">{{ avatarLetter }}</span>
      <span class="user-menu-name">{{ username }}</span>
      <span class="user-menu-chevron" aria-hidden="true">▾</span>
    </button>

    <Transition name="user-menu-pop">
      <div v-if="menuOpen" class="user-menu-dropdown">
        <div class="user-menu-dropdown-head">
          <span class="user-menu-dropdown-label">{{ t('settings.signed_in_as', '已登录') }}</span>
          <span class="user-menu-dropdown-user">{{ username }}</span>
        </div>
        <button type="button" class="user-menu-item" @click="openSettings('ai')">
          {{ t('settings.menu_settings', '用户设置') }}
        </button>
        <button type="button" class="user-menu-item" @click="openSettings('profile')">
          {{ t('settings.menu_profile', 'AI 画像') }}
        </button>
        <button type="button" class="user-menu-item" @click="openSettings('account')">
          {{ t('settings.menu_account', '账户信息') }}
        </button>
        <div class="user-menu-divider" />
        <button type="button" class="user-menu-item user-menu-item-danger" @click="emit('logout')">
          {{ t('nav.lock', '锁定') }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18nStore } from '@/shared/i18n/useI18nStore';

const props = defineProps<{
  username: string;
}>();

const emit = defineEmits<{
  logout: [];
  openSettings: [section: 'account' | 'ai' | 'profile'];
}>();

const i18n = useI18nStore();
const menuOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const avatarLetter = computed(() => (props.username?.[0] ?? '?').toUpperCase());

function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function openSettings(section: 'account' | 'ai' | 'profile') {
  closeMenu();
  emit('openSettings', section);
}

function onDocumentClick(event: MouseEvent) {
  if (!menuOpen.value || !rootEl.value) {
    return;
  }

  if (!rootEl.value.contains(event.target as Node)) {
    closeMenu();
  }
}

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onEscape);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onEscape);
});
</script>

<style scoped>
.user-menu {
  position: relative;
}

.user-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.user-menu-trigger:hover,
.user-menu-trigger.open {
  border-color: var(--faint);
  background: color-mix(in srgb, var(--surface) 80%, var(--bg));
}

.user-menu-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--dark);
  color: var(--surface);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
}

.user-menu-name {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dark);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-chevron {
  font-size: 10px;
  color: var(--muted);
  transition: transform 0.15s;
}

.user-menu-trigger.open .user-menu-chevron {
  transform: rotate(180deg);
}

.user-menu-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--faint);
  border-radius: calc(var(--r) + 2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  z-index: 200;
}

.user-menu-dropdown-head {
  padding: 10px 12px 8px;
}

.user-menu-dropdown-label {
  display: block;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.user-menu-dropdown-user {
  display: block;
  margin-top: 2px;
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--dark);
}

.user-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border: none;
  border-radius: var(--r);
  background: transparent;
  font-size: 13px;
  color: var(--dark);
  cursor: pointer;
}

.user-menu-item:hover {
  background: var(--faint2);
}

.user-menu-item-danger {
  color: #9b1c1c;
}

.user-menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--faint2);
}

.user-menu-pop-enter-active,
.user-menu-pop-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.user-menu-pop-enter-from,
.user-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
