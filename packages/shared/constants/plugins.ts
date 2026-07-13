import type { ThemeVars } from '../types';

export const USER_SETTING_KEYS = {
  activeTheme: 'active_theme',
  installedPlugins: 'installed_plugins',
  aiSettings: 'ai_settings',
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
