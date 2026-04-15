import type { PluginManifest, ThemeDefinition, ThemeVars } from '../types';

export const THEME_PLUGIN_ID = 'theme-pack';

export const USER_SETTING_KEYS = {
  activeTheme: 'active_theme',
  installedPlugins: 'installed_plugins',
} as const;

export const DEFAULT_THEME_ID = 'default';

export const DEFAULT_THEME_VARS: ThemeVars = {
  '--bg': '#F7F7F7',
  '--surface': '#FFFFFF',
  '--dark': '#111111',
  '--mid': '#555555',
  '--muted': '#999999',
  '--faint': '#E4E4E4',
  '--faint2': '#EFEFEF',
};

const themePackThemes: ThemeDefinition[] = [
  {
    id: 'default',
    name: 'Default',
    vars: DEFAULT_THEME_VARS,
  },
  {
    id: 'dark',
    name: 'Dark',
    vars: {
      '--bg': '#0F0F0F',
      '--surface': '#1A1A1A',
      '--dark': '#EFEFEF',
      '--mid': '#AAAAAA',
      '--muted': '#666666',
      '--faint': '#2C2C2C',
      '--faint2': '#222222',
    },
  },
  {
    id: 'warm',
    name: 'Warm',
    vars: {
      '--bg': '#F5F0E8',
      '--surface': '#FDFAF4',
      '--dark': '#2C1F0E',
      '--mid': '#6B5744',
      '--muted': '#A08C78',
      '--faint': '#E2D8CC',
      '--faint2': '#EDE8DF',
    },
  },
  {
    id: 'cool',
    name: 'Cool',
    vars: {
      '--bg': '#EEF2F7',
      '--surface': '#F8FAFD',
      '--dark': '#0D1B2A',
      '--mid': '#3D5A80',
      '--muted': '#7A9BBF',
      '--faint': '#D4DDE8',
      '--faint2': '#E4EBF2',
    },
  },
  {
    id: 'hc',
    name: 'High Contrast',
    vars: {
      '--bg': '#FFFFFF',
      '--surface': '#FFFFFF',
      '--dark': '#000000',
      '--mid': '#000000',
      '--muted': '#444444',
      '--faint': '#BBBBBB',
      '--faint2': '#EEEEEE',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    vars: {
      '--bg': '#FDF6E3',
      '--surface': '#EEE8D5',
      '--dark': '#073642',
      '--mid': '#586E75',
      '--muted': '#93A1A1',
      '--faint': '#D3CBB8',
      '--faint2': '#E8E2D0',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    vars: {
      '--bg': '#2E3440',
      '--surface': '#3B4252',
      '--dark': '#ECEFF4',
      '--mid': '#D8DEE9',
      '--muted': '#7B88A1',
      '--faint': '#434C5E',
      '--faint2': '#3B4252',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    vars: {
      '--bg': '#FDF2F4',
      '--surface': '#FFF8F9',
      '--dark': '#3D0A14',
      '--mid': '#8B3A4A',
      '--muted': '#C4849A',
      '--faint': '#F0D4DA',
      '--faint2': '#F7E5E9',
    },
  },
];

export const PLUGIN_CATALOG: PluginManifest[] = [
  {
    id: THEME_PLUGIN_ID,
    name: 'Theme Pack',
    version: '2.0.0',
    category: 'theme',
    author: 'PlainList',
    description: 'Curated color themes with config-driven preview and persistence.',
    longDescription:
      'All theme variants now live in the manifest catalog and are resolved without executing plugin JavaScript.',
    themes: themePackThemes,
    features: [
      'Preview and save built-in themes',
      'Theme selection persists per user',
      'No arbitrary runtime script execution',
    ],
    runtime: 'manifest',
  },
];

export function findPluginManifest(pluginId: string): PluginManifest | undefined {
  return PLUGIN_CATALOG.find((plugin) => plugin.id === pluginId);
}

export function getThemeDefinitions(): ThemeDefinition[] {
  return findPluginManifest(THEME_PLUGIN_ID)?.themes ?? themePackThemes;
}

export function findThemeById(themeId: string): ThemeDefinition | undefined {
  return getThemeDefinitions().find((theme) => theme.id === themeId);
}
