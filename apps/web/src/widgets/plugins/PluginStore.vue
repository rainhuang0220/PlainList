<template>
  <div id="plugin-view" class="open">
    <div class="pv-sidebar">
      <div class="pv-header">
        <span class="pv-title">{{ t('plugins.title', 'Plugins') }}</span>
        <button id="pv-close" @click="$emit('close')">×</button>
      </div>
      <input id="pv-search" v-model="filterQ" placeholder="Search plugins…" autocomplete="off" />
      <div id="pv-tabs">
        <button v-for="cat in categories" :key="cat.key"
                :class="['pv-tab', filterCat === cat.key ? 'active' : '']"
                @click="filterCat = cat.key">{{ cat.label }}</button>
      </div>
      <div id="pv-list">
        <div v-for="p in filtered" :key="p.id"
             :class="['pv-item', activeId === p.id ? 'active' : '']"
             @click="activeId = p.id">
          <div class="pv-item-name">{{ p.name }}</div>
          <div class="pv-item-desc">{{ p.description }}</div>
          <span v-if="plugins.installedIds.has(p.id)" class="pv-item-badge">{{ t('plugins.installed', 'Installed') }}</span>
        </div>
        <div v-if="!filtered.length" style="padding:20px 16px;font-size:12px;color:var(--muted)">No plugins found</div>
      </div>
    </div>

    <div class="pv-detail">
      <div v-if="!activePlugin" class="pv-detail-empty">Select a plugin</div>
      <template v-else>
        <div class="pv-detail-name">{{ activePlugin.name }}</div>
        <div class="pv-detail-meta">
          <span>v{{ activePlugin.version }}</span>
          <span>{{ activePlugin.author }}</span>
          <span>{{ activePlugin.category }}</span>
        </div>
        <div class="pv-detail-desc">{{ activePlugin.longDescription || activePlugin.description }}</div>

        <!-- Theme plugin -->
        <template v-if="activePlugin.category === 'theme' && activePlugin.themes">
          <div class="pv-section-label">Themes</div>
          <div class="pv-theme-grid">
            <div v-for="theme in activePlugin.themes" :key="theme.id"
                 :class="['pv-swatch', selectedThemeId === theme.id ? 'active' : '']"
                 @click="onSwatchClick(theme)">
              <div class="pv-swatch-colors">
                <span v-for="v in ['--bg','--surface','--dark','--mid','--muted']" :key="v"
                      :style="{ background: theme.vars[v] }"></span>
              </div>
              <div class="pv-swatch-name">{{ theme.name }}</div>
            </div>
          </div>
          <div class="pv-preview-area">
            <div v-if="previewTheme" class="pv-preview-cards">
              <div class="pv-card" :style="cardStyle(previewTheme.vars)">
                <div class="pv-card-title" :style="{ color: previewTheme.vars['--dark'] }">Preview</div>
                <div class="pv-card-body" :style="{ color: previewTheme.vars['--mid'] }">Sample text in this theme</div>
                <div class="pv-card-muted" :style="{ color: previewTheme.vars['--muted'] }">Muted text</div>
                <div class="pv-card-tag" :style="{ background: previewTheme.vars['--faint'], color: previewTheme.vars['--muted'] }">tag</div>
              </div>
            </div>
          </div>
        </template>

        <!-- Language plugin -->
        <template v-else-if="activePlugin.category === 'language' && activePlugin.features">
          <div class="pv-section-label">Features</div>
          <ul class="pv-feature-list">
            <li v-for="f in activePlugin.features" :key="f">{{ f }}</li>
          </ul>
        </template>

        <!-- Actions -->
        <div class="pv-actions">
          <template v-if="plugins.installedIds.has(activePlugin.id)">
            <button v-if="activePlugin.category === 'theme'" class="pv-btn" :disabled="saving" @click="applyTheme">Apply</button>
            <button v-else class="pv-btn" disabled>Up to date</button>
            <button class="pv-btn" :disabled="saving" @click="uninstall">{{ t('plugins.uninstall', 'Uninstall') }}</button>
          </template>
          <template v-else>
            <button class="pv-btn primary" :disabled="saving" @click="install">{{ t('plugins.install', 'Install') }}</button>
          </template>
        </div>
        <div class="pv-hint">{{ t('plugins.restart_hint', 'Changes take effect after re-login') }}</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore'
import { useI18nStore } from '@/shared/i18n/useI18nStore'

const _emit = defineEmits(['close'])
const plugins = usePluginsStore()
const i18n = useI18nStore()
function t(key, fallback) { return i18n.t(key, fallback) }

const filterQ = ref('')
const filterCat = ref('all')
const activeId = ref(null)
const selectedThemeId = ref(null)
const previewTheme = ref(null)
const saving = ref(false)

const categories = computed(() => [
  { key: 'all', label: t('plugins.tab.all', 'All') },
  { key: 'theme', label: t('plugins.tab.theme', 'Theme') },
  { key: 'language', label: t('plugins.tab.language', 'Language') },
])

const filtered = computed(() => {
  return plugins.available.filter(p => {
    const matchCat = filterCat.value === 'all' || p.category === filterCat.value
    const q = filterQ.value.toLowerCase()
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
    return matchCat && matchQ
  })
})

const activePlugin = computed(() => plugins.available.find(p => p.id === activeId.value) || null)

// When switching to a new plugin, set selectedThemeId to active theme
watch(activePlugin, async p => {
  if (!p) return
  if (p.category === 'theme' && p.themes) {
    // Load the saved active theme id from server
    try {
      const { themeId } = await plugins.getActiveThemeId()
      selectedThemeId.value = themeId || p.themes[0]?.id || null
    } catch {
      selectedThemeId.value = p.themes[0]?.id || null
    }
    previewTheme.value = p.themes.find(t => t.id === selectedThemeId.value) || p.themes[0] || null
  }
})

function onSwatchClick(theme) {
  selectedThemeId.value = theme.id
  previewTheme.value = theme
  plugins.previewTheme(theme.vars)
}

function cardStyle(vars) {
  return {
    background: vars['--surface'],
    border: `1px solid ${vars['--faint']}`,
    borderRadius: '6px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '280px',
  }
}

async function install() {
  saving.value = true
  try { await plugins.install(activeId.value) } catch(e) { console.error(e) }
  saving.value = false
}

async function uninstall() {
  saving.value = true
  try { await plugins.uninstall(activeId.value) } catch(e) { console.error(e) }
  saving.value = false
}

async function applyTheme() {
  if (!selectedThemeId.value) return
  saving.value = true
  try { await plugins.saveTheme(selectedThemeId.value) } catch(e) { console.error(e) }
  saving.value = false
}

onMounted(async () => {
  await Promise.all([plugins.loadAvailable(), plugins.loadInstalled()])
})
</script>
