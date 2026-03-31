import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID } from '@plainlist/shared';
import { resolveInstalledPluginManifests, resolveThemeId } from './service';

describe('plugin manifest service', () => {
  it('maps installed plugin ids to built-in manifests', () => {
    const manifests = resolveInstalledPluginManifests([
      { id: 'lang-zh', enabled: true, installedAt: '2026-03-31T00:00:00.000Z' },
      { id: 'missing-plugin', enabled: true, installedAt: '2026-03-31T00:00:00.000Z' },
    ]);

    expect(manifests.map((item) => item.id)).toEqual(['lang-zh']);
  });

  it('falls back to the default theme when theme plugin is not installed', () => {
    expect(resolveThemeId([], 'dark')).toBe(DEFAULT_THEME_ID);
  });

  it('keeps a valid theme when theme pack is installed', () => {
    expect(resolveThemeId([{ id: 'theme-pack', enabled: true, installedAt: '2026-03-31T00:00:00.000Z' }], 'dark')).toBe('dark');
  });
});
