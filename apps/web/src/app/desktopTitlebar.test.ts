import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(resolve(__dirname, 'App.vue'), 'utf8');
const css = readFileSync(resolve(__dirname, '../shared/styles/main.css'), 'utf8');
const main = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');

describe('macOS desktop titlebar', () => {
  it('keeps the web/mobile logo on the left by default', () => {
    expect(app).toContain('<div class="nav-logo">PL/</div>');
    expect(css).toMatch(/\.nav-logo \{[\s\S]*justify-self: start/);
    expect(css).not.toMatch(/html\.pl-native \.nav-logo \{[\s\S]*grid-column: 3/);
  });

  it('moves PL/ to the trailing edge only on macOS desktop and keeps controls clickable', () => {
    expect(main).toContain('pl-desktop-darwin');
    expect(css).toContain('html.pl-desktop-darwin .nav-logo');
    expect(css).toContain('grid-column: 3');
    expect(css).toContain('-webkit-app-region: drag');
    expect(css).toContain('-webkit-app-region: no-drag');
    expect(css).not.toContain('padding-left: 100px');
  });
});
