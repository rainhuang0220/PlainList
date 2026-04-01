/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="D:/jisuanjisheji/PlainList/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { usePluginsStore } from '@/features/plugins/model/usePluginsStore';
import { useI18nStore } from '@/shared/i18n/useI18nStore';
const __VLS_emit = defineEmits(['close']);
const plugins = usePluginsStore();
const i18n = useI18nStore();
const filterQ = ref('');
const filterCat = ref('all');
const activeId = ref(null);
const selectedThemeId = ref(null);
const previewTheme = ref(null);
const saving = ref(false);
function t(key, fallback) {
    return i18n.t(key, fallback);
}
const categories = computed(() => {
    const base = [
        { key: 'all', label: t('plugins.tab.all', 'All') },
    ];
    if (plugins.available.some((plugin) => plugin.category === 'theme')) {
        base.push({ key: 'theme', label: t('plugins.tab.theme', 'Theme') });
    }
    return base;
});
const filtered = computed(() => (plugins.available.filter((plugin) => {
    const matchesCategory = filterCat.value === 'all' || plugin.category === filterCat.value;
    const keyword = filterQ.value.toLowerCase();
    const matchesQuery = !keyword
        || plugin.name.toLowerCase().includes(keyword)
        || (plugin.description || '').toLowerCase().includes(keyword);
    return matchesCategory && matchesQuery;
})));
const activePlugin = computed(() => plugins.available.find((plugin) => plugin.id === activeId.value) || null);
watch(activePlugin, async (plugin) => {
    if (!plugin || plugin.category !== 'theme' || !plugin.themes) {
        previewTheme.value = null;
        return;
    }
    try {
        const { themeId } = await plugins.getActiveThemeId();
        selectedThemeId.value = themeId || plugin.themes[0]?.id || null;
    }
    catch {
        selectedThemeId.value = plugin.themes[0]?.id || null;
    }
    previewTheme.value = plugin.themes.find((theme) => theme.id === selectedThemeId.value) || plugin.themes[0] || null;
});
function onSwatchClick(theme) {
    selectedThemeId.value = theme.id;
    previewTheme.value = theme;
    plugins.previewTheme(theme.vars);
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
    };
}
async function install() {
    if (!activeId.value) {
        return;
    }
    saving.value = true;
    try {
        await plugins.install(activeId.value);
    }
    finally {
        saving.value = false;
    }
}
async function uninstall() {
    if (!activeId.value) {
        return;
    }
    saving.value = true;
    try {
        await plugins.uninstall(activeId.value);
    }
    finally {
        saving.value = false;
    }
}
async function applyTheme() {
    if (!selectedThemeId.value) {
        return;
    }
    saving.value = true;
    try {
        await plugins.saveTheme(selectedThemeId.value);
    }
    finally {
        saving.value = false;
    }
}
onMounted(async () => {
    await Promise.all([plugins.loadAvailable(), plugins.loadInstalled()]);
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "plugin-view",
    ...{ class: "open" },
});
/** @type {__VLS_StyleScopedClasses['open']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "pv-sidebar" },
});
/** @type {__VLS_StyleScopedClasses['pv-sidebar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "pv-header" },
});
/** @type {__VLS_StyleScopedClasses['pv-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "pv-title" },
});
/** @type {__VLS_StyleScopedClasses['pv-title']} */ ;
(__VLS_ctx.t('plugins.title', 'Plugins'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('close');
            // @ts-ignore
            [t, $emit,];
        } },
    id: "pv-close",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    id: "pv-search",
    placeholder: (__VLS_ctx.t('plugins.search', 'Search plugins')),
    autocomplete: "off",
});
(__VLS_ctx.filterQ);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "pv-tabs",
});
for (const [category] of __VLS_vFor((__VLS_ctx.categories))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.filterCat = category.key;
                // @ts-ignore
                [t, filterQ, categories, filterCat,];
            } },
        key: (category.key),
        ...{ class: (['pv-tab', __VLS_ctx.filterCat === category.key ? 'active' : '']) },
    });
    /** @type {__VLS_StyleScopedClasses['pv-tab']} */ ;
    (category.label);
    // @ts-ignore
    [filterCat,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "pv-list",
});
for (const [plugin] of __VLS_vFor((__VLS_ctx.filtered))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.activeId = plugin.id;
                // @ts-ignore
                [filtered, activeId,];
            } },
        key: (plugin.id),
        ...{ class: (['pv-item', __VLS_ctx.activeId === plugin.id ? 'active' : '']) },
    });
    /** @type {__VLS_StyleScopedClasses['pv-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-item-name" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-item-name']} */ ;
    (plugin.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-item-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-item-desc']} */ ;
    (plugin.description);
    if (__VLS_ctx.plugins.installedIds.has(plugin.id)) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "pv-item-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['pv-item-badge']} */ ;
        (__VLS_ctx.t('plugins.installed', 'Installed'));
    }
    // @ts-ignore
    [t, activeId, plugins,];
}
if (!__VLS_ctx.filtered.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    (__VLS_ctx.t('plugins.empty', 'No plugins found'));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "pv-detail" },
});
/** @type {__VLS_StyleScopedClasses['pv-detail']} */ ;
if (!__VLS_ctx.activePlugin) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-detail-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-detail-empty']} */ ;
    (__VLS_ctx.t('plugins.select', 'Select a plugin'));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-detail-name" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-detail-name']} */ ;
    (__VLS_ctx.activePlugin.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-detail-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-detail-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.activePlugin.version);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.activePlugin.author);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.activePlugin.category);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-detail-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-detail-desc']} */ ;
    (__VLS_ctx.activePlugin.longDescription || __VLS_ctx.activePlugin.description);
    if (__VLS_ctx.activePlugin.category === 'theme' && __VLS_ctx.activePlugin.themes) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pv-section-label" },
        });
        /** @type {__VLS_StyleScopedClasses['pv-section-label']} */ ;
        (__VLS_ctx.t('plugins.themes', 'Themes'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pv-theme-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['pv-theme-grid']} */ ;
        for (const [theme] of __VLS_vFor((__VLS_ctx.activePlugin.themes))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.activePlugin))
                            return;
                        if (!(__VLS_ctx.activePlugin.category === 'theme' && __VLS_ctx.activePlugin.themes))
                            return;
                        __VLS_ctx.onSwatchClick(theme);
                        // @ts-ignore
                        [t, t, t, filtered, activePlugin, activePlugin, activePlugin, activePlugin, activePlugin, activePlugin, activePlugin, activePlugin, activePlugin, activePlugin, onSwatchClick,];
                    } },
                key: (theme.id),
                ...{ class: (['pv-swatch', __VLS_ctx.selectedThemeId === theme.id ? 'active' : '']) },
            });
            /** @type {__VLS_StyleScopedClasses['pv-swatch']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-swatch-colors" },
            });
            /** @type {__VLS_StyleScopedClasses['pv-swatch-colors']} */ ;
            for (const [colorKey] of __VLS_vFor((['--bg', '--surface', '--dark', '--mid', '--muted']))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    key: (colorKey),
                    ...{ style: ({ background: theme.vars[colorKey] }) },
                });
                // @ts-ignore
                [selectedThemeId,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-swatch-name" },
            });
            /** @type {__VLS_StyleScopedClasses['pv-swatch-name']} */ ;
            (theme.name);
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pv-preview-area" },
        });
        /** @type {__VLS_StyleScopedClasses['pv-preview-area']} */ ;
        if (__VLS_ctx.previewTheme) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-preview-cards" },
            });
            /** @type {__VLS_StyleScopedClasses['pv-preview-cards']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-card" },
                ...{ style: (__VLS_ctx.cardStyle(__VLS_ctx.previewTheme.vars)) },
            });
            /** @type {__VLS_StyleScopedClasses['pv-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-card-title" },
                ...{ style: ({ color: __VLS_ctx.previewTheme.vars['--dark'] }) },
            });
            /** @type {__VLS_StyleScopedClasses['pv-card-title']} */ ;
            (__VLS_ctx.t('plugins.preview', 'Preview'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-card-body" },
                ...{ style: ({ color: __VLS_ctx.previewTheme.vars['--mid'] }) },
            });
            /** @type {__VLS_StyleScopedClasses['pv-card-body']} */ ;
            (__VLS_ctx.t('plugins.preview_text', 'Sample text in this theme'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-card-muted" },
                ...{ style: ({ color: __VLS_ctx.previewTheme.vars['--muted'] }) },
            });
            /** @type {__VLS_StyleScopedClasses['pv-card-muted']} */ ;
            (__VLS_ctx.t('plugins.preview_muted', 'Muted text'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "pv-card-tag" },
                ...{ style: ({ background: __VLS_ctx.previewTheme.vars['--faint'], color: __VLS_ctx.previewTheme.vars['--muted'] }) },
            });
            /** @type {__VLS_StyleScopedClasses['pv-card-tag']} */ ;
            (__VLS_ctx.t('plugins.preview_tag', 'tag'));
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-actions']} */ ;
    if (__VLS_ctx.plugins.installedIds.has(__VLS_ctx.activePlugin.id)) {
        if (__VLS_ctx.activePlugin.category === 'theme') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (__VLS_ctx.applyTheme) },
                ...{ class: "pv-btn" },
                disabled: (__VLS_ctx.saving),
            });
            /** @type {__VLS_StyleScopedClasses['pv-btn']} */ ;
            (__VLS_ctx.t('plugins.apply', 'Apply'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.uninstall) },
            ...{ class: "pv-btn" },
            disabled: (__VLS_ctx.saving),
        });
        /** @type {__VLS_StyleScopedClasses['pv-btn']} */ ;
        (__VLS_ctx.t('plugins.uninstall', 'Uninstall'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.install) },
            ...{ class: "pv-btn primary" },
            disabled: (__VLS_ctx.saving),
        });
        /** @type {__VLS_StyleScopedClasses['pv-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        (__VLS_ctx.t('plugins.install', 'Install'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pv-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['pv-hint']} */ ;
    (__VLS_ctx.t('plugins.restart_hint', 'Changes take effect after re-login'));
}
// @ts-ignore
[t, t, t, t, t, t, t, t, plugins, activePlugin, activePlugin, previewTheme, previewTheme, previewTheme, previewTheme, previewTheme, previewTheme, previewTheme, cardStyle, applyTheme, saving, saving, saving, uninstall, install,];
const __VLS_export = (await import('vue')).defineComponent({
    emits: {},
});
export default {};
