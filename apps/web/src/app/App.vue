<template>
  <div id="app-root" :class="{ 'dashboard-ready': dashboardReady }">
    <template v-if="!auth.isLoggedIn">
      <AuthTerminal
        v-if="authMode === 'terminal'"
        @login="onLogin"
        @graphic="authMode = 'graphic'"
      />
      <AuthGraphic
        v-else
        @login="onLogin"
        @terminal="authMode = 'terminal'"
      />
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
          <button
            v-for="widget in installedWidgets"
            :key="widget.id"
            class="nav-widget-btn"
            :title="widget.name"
            @click="activeWidget = widget.id"
          >
            {{ widget.name }}
          </button>
          <button
            id="nav-marketplace"
            :title="t('marketplace.title', 'Marketplace')"
            @click="marketplaceOpen = true"
          >
            ⊞
          </button>
          <UserMenu
            :username="auth.currentUser ?? ''"
            @open-settings="openUserSettings"
            @logout="logout"
          />
        </div>
      </nav>

      <ClockSection id="s1" class="app-section" style="--section-delay: 0ms" />
      <PlansSection id="s2" class="app-section" style="--section-delay: 70ms" />
      <WeekSection id="s3" class="app-section" style="--section-delay: 140ms" />
      <TrackerSection id="s4" class="app-section" style="--section-delay: 210ms" />
      <CalendarSection id="s5" class="app-section" style="--section-delay: 280ms" />

      <Marketplace v-if="marketplaceOpen" @close="marketplaceOpen = false" />
      <UserSettingsPanel
        v-if="userSettingsOpen"
        :username="auth.currentUser ?? ''"
        :is-admin="auth.isAdmin"
        :initial-section="userSettingsSection"
        @close="userSettingsOpen = false"
      />
      <template v-for="widget in installedWidgets" :key="widget.id">
        <WidgetPanel
          v-if="activeWidget === widget.id && widget.widgetUrl"
          :title="widget.name"
          :src="widget.widgetUrl"
          @close="activeWidget = null"
        />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AuthAccount } from '@plainlist/shared';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import { useChecksStore } from '@/features/checks/model/useChecksStore';
import { useLocaleStore } from '@/features/locale/model/useLocaleStore';
import { usePlansStore } from '@/features/plans/model/usePlansStore';
import { useReviewsStore } from '@/features/reviews/model/useReviewsStore';
import { useUserProfileStore } from '@/features/user-profile/model/useUserProfileStore';
import { useMarketplaceStore } from '@/features/plugins/model/useMarketplaceStore';
import { useApi } from '@/shared/api/useApi';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
import UserMenu from '@/widgets/settings/UserMenu.vue';
import UserSettingsPanel from '@/widgets/settings/UserSettingsPanel.vue';
import AuthTerminal from '@/widgets/auth/AuthTerminal.vue';
import AuthGraphic from '@/widgets/auth/AuthGraphic.vue';
import Marketplace from '@/widgets/plugins/Marketplace.vue';
import WidgetPanel from '@/widgets/plugins/WidgetPanel.vue';
import CalendarSection from '@/widgets/sections/CalendarSection.vue';
import ClockSection from '@/widgets/sections/ClockSection.vue';
import PlansSection from '@/widgets/sections/PlansSection.vue';
import TrackerSection from '@/widgets/sections/TrackerSection.vue';
import WeekSection from '@/widgets/sections/WeekSection.vue';

const auth = useAuthStore();
const plans = usePlansStore();
const checks = useChecksStore();
const reviews = useReviewsStore();
const userProfile = useUserProfileStore();
const localeStore = useLocaleStore();
const marketplace = useMarketplaceStore();
const i18n = useI18nStore();
const { get } = useApi();

const authMode = ref<'terminal' | 'graphic'>('terminal');
const marketplaceOpen = ref(false);
const userSettingsOpen = ref(false);
const userSettingsSection = ref<'account' | 'ai' | 'profile'>('ai');
const activeWidget = ref<string | null>(null);

const installedWidgets = computed(() => marketplace.installedWidgets);
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
    await Promise.all([
      plans.fetch(),
      checks.fetchMonth(year, month),
      checks.fetchMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1),
      marketplace.loadMyPlugins(),
      marketplace.loadAvailableManifests(),
    ]);
    await marketplace.loadActiveTheme();
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
  reviews.clear();
  userProfile.clear();
  marketplace.clear();
  auth.logout();
}

function openUserSettings(section: 'account' | 'ai' | 'profile') {
  userSettingsSection.value = section;
  userSettingsOpen.value = true;
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
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
});
</script>
