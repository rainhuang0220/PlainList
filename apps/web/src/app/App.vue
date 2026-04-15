<template>
  <div id="app-root" :class="{ 'dashboard-ready': dashboardReady }">
    <template v-if="!auth.isLoggedIn">
      <ShowcaseHome v-if="entryMode === 'showcase'" @login="openTerminal" @demo="loginDemo" />
      <AuthTerminal v-else @login="onLogin" @demo="loginDemo" @back="openShowcase" />
    </template>
    <template v-else>
      <Transition name="loader-fade">
        <div v-if="isDashboardLoading" class="app-loader">
          <div class="app-loader-panel">
            <div class="app-loader-label">PL/ SYNC</div>
            <div class="app-loader-track">
              <div class="app-loader-fill"></div>
            </div>
            <div class="app-loader-text">{{ loaderText }}</div>
          </div>
        </div>
      </Transition>

      <nav class="app-nav">
        <div class="nav-logo">PL/</div>
        <div class="nav-links">
          <a
            v-for="section in sections"
            :key="section.id"
            :href="`#${section.id}`"
            :class="{ active: activeSection === section.id }"
            @click.prevent="scrollTo(section.id)"
          >
            {{ section.label }}
          </a>
        </div>
        <div class="nav-right">
          <span id="nav-user">{{ auth.currentUser }}</span>
          <button
            id="nav-locale"
            :title="t('nav.language', 'Language')"
            @click="localeStore.toggleLocale()"
          >
            {{ localeStore.switchLabel }}
          </button>
          <button
            id="nav-plugins"
            :title="t('plugins.title', 'Plugins')"
            @click="pluginStoreOpen = true"
          >
            ::
          </button>
          <button id="nav-logout" @click="logout">
            {{ t('nav.lock', 'lock') }}
          </button>
        </div>
      </nav>

      <ClockSection id="s1" class="app-section" style="--section-delay: 0ms" />
      <PlansSection id="s2" class="app-section" style="--section-delay: 70ms" />
      <WeekSection id="s3" class="app-section" style="--section-delay: 140ms" />
      <TrackerSection id="s4" class="app-section" style="--section-delay: 210ms" />
      <CalendarSection id="s5" class="app-section" style="--section-delay: 280ms" />

      <PluginStore v-if="pluginStoreOpen" @close="onPluginStoreClose" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AuthAccount, AuthSuccessResponse } from '@plainlist/shared';
import { DEMO_ACCOUNT } from '@plainlist/shared';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
import AuthTerminal from '@/widgets/auth/AuthTerminal.vue';
import ShowcaseHome from '@/widgets/auth/ShowcaseHome.vue';
import PluginStore from '@/widgets/plugins/PluginStore.vue';
import CalendarSection from '@/widgets/sections/CalendarSection.vue';
import ClockSection from '@/widgets/sections/ClockSection.vue';
import PlansSection from '@/widgets/sections/PlansSection.vue';
import TrackerSection from '@/widgets/sections/TrackerSection.vue';
import WeekSection from '@/widgets/sections/WeekSection.vue';

const auth = useAuthStore();
const plans = usePlansStore();
const checks = useChecksStore();
const localeStore = useLocaleStore();
const pluginsStore = usePluginsStore();
const i18n = useI18nStore();
const { get, post } = useApi();

const pluginStoreOpen = ref(false);
const entryMode = ref<'showcase' | 'terminal'>('showcase');
const activeSection = ref('s1');
const isDashboardLoading = ref(false);
const dashboardReady = ref(false);

watch(
  () => localeStore.locale,
  (locale) => {
    i18n.setLocale(locale);
  },
  { immediate: true },
);

const sections = computed(() => [
  { id: 's1', label: i18n.t('nav.now', 'Now') },
  { id: 's2', label: i18n.t('nav.day', 'Day') },
  { id: 's3', label: i18n.t('nav.week', 'Week') },
  { id: 's4', label: i18n.t('nav.month', 'Month') },
  { id: 's5', label: i18n.t('nav.year', 'Year') },
]);

const loaderText = computed(() => i18n.t('app.loader', 'Loading your dashboard...'));

function t(key: string, fallback: string) {
  return i18n.t(key, fallback);
}

function openTerminal() {
  entryMode.value = 'terminal';
}

function openShowcase() {
  entryMode.value = 'showcase';
}

async function loginDemo() {
  try {
    const response = await post<AuthSuccessResponse>('/auth/login', {
      username: DEMO_ACCOUNT.username,
      password: DEMO_ACCOUNT.password,
    });
    auth.setAuth(response.token, response.username, response.isAdmin);
    await loadDashboard();
  } catch {
    entryMode.value = 'terminal';
  }
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  activeSection.value = id;
}

let scrollTimer: number | null = null;
function onScroll() {
  if (scrollTimer !== null) {
    window.clearTimeout(scrollTimer);
  }

  scrollTimer = window.setTimeout(() => {
    for (const section of [...sections.value].reverse()) {
      const element = document.getElementById(section.id);
      if (element && element.getBoundingClientRect().top <= 80) {
        activeSection.value = section.id;
        return;
      }
    }

    activeSection.value = 's1';
  }, 50);
}

async function loadDashboard() {
  isDashboardLoading.value = true;
  dashboardReady.value = false;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    await pluginsStore.loadAvailable();
    await Promise.all([
      plans.fetch(),
      checks.fetchMonth(year, month),
      checks.fetchMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1),
      pluginsStore.loadInstalled(),
    ]);
    await pluginsStore.loadActiveTheme();
  } finally {
    window.setTimeout(() => {
      isDashboardLoading.value = false;
      window.requestAnimationFrame(() => {
        dashboardReady.value = true;
      });
    }, 220);
  }
}

async function onLogin() {
  await loadDashboard();
}

async function logout() {
  dashboardReady.value = false;
  isDashboardLoading.value = false;
  plans.clear();
  checks.clear();
  pluginsStore.clear();
  auth.logout();
  entryMode.value = 'showcase';
}

function onPluginStoreClose() {
  pluginStoreOpen.value = false;
  if (pluginsStore.previewing) {
    pluginsStore.revertTheme();
  }
}

onMounted(async () => {
  window.addEventListener('scroll', onScroll);
  if (auth.token) {
    try {
      const me = await get<AuthAccount>('/auth/me');
      auth.setAuth(auth.token, me.username, me.isAdmin);
      await loadDashboard();
    } catch {
      dashboardReady.value = false;
      isDashboardLoading.value = false;
      auth.logout();
      entryMode.value = 'showcase';
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
});
</script>
