import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(resolve(__dirname, 'App.vue'), 'utf8');
const css = readFileSync(resolve(__dirname, '../shared/styles/main.css'), 'utf8');
const main = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');
const electronMain = readFileSync(resolve(__dirname, '../../electron/main.cjs'), 'utf8');

const darwinLogo = css.match(/html\.pl-desktop-darwin \.nav-logo \{[^}]*\}/)?.[0] ?? '';
const darwinRight = css.match(/html\.pl-desktop-darwin \.nav-right \{[^}]*\}/)?.[0] ?? '';
const darwinLinks = css.match(/html\.pl-desktop-darwin \.nav-links \{[^}]*\}/)?.[0] ?? '';

describe('macOS desktop titlebar', () => {
  it('keeps a 3-column header: logo | center nav | right actions', () => {
    expect(app).toContain('<div class="nav-logo">PL/</div>');
    expect(app).toContain('<div class="nav-links">');
    expect(app).toContain('<div class="nav-right">');
    expect(css).toMatch(/nav \{[\s\S]*grid-template-columns:\s*1fr auto 1fr/);
    expect(css).toMatch(/\.nav-logo \{[\s\S]*justify-self: start/);
    expect(css).toMatch(/\.nav-links \{[\s\S]*justify-self: center/);
    expect(css).toMatch(/\.nav-right \{[\s\S]*justify-self: end/);
  });

  it('does not steal the center column on Darwin by parking logo and actions in column 3', () => {
    expect(darwinLogo).not.toContain('grid-column: 3');
    expect(darwinRight).not.toContain('grid-column: 3');
    expect(darwinLinks).toBe('');
  });

  it('insets only the Darwin side clusters so traffic lights and right actions do not move the center nav', () => {
    expect(main).toContain('pl-desktop-darwin');
    expect(electronMain).toContain("titleBarStyle: process.platform === 'darwin' ? 'hiddenInset'");
    expect(darwinLogo).toMatch(/padding-left:\s*40px/);
    expect(darwinRight).toMatch(/padding-right:\s*20px/);
    expect(darwinLogo).not.toMatch(/transform|translate|top:\s*-/);
    expect(darwinRight).not.toMatch(/transform|translate|top:\s*-/);
    expect(css).toContain('-webkit-app-region: drag');
    expect(css).toContain('-webkit-app-region: no-drag');
  });
});
