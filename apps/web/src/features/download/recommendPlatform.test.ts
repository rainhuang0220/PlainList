import { describe, expect, it } from 'vitest';
import { productDownloadHref, recommendPlatform } from './recommendPlatform';

describe('recommendPlatform', () => {
  it('recommends Android from an Android UA without forcing a redirect', () => {
    expect(recommendPlatform(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
    )).toBe('android');
  });

  it('recommends macOS from a Mac UA and does not pretend to know the chip', () => {
    expect(recommendPlatform(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    )).toBe('macos');
  });

  it('returns unknown for Windows and generic UAs', () => {
    expect(recommendPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('unknown');
    expect(recommendPlatform('curl/8.0')).toBe('unknown');
  });

  it('returns unknown for iPhone so the page can recommend Web instead of a Mac package', () => {
    expect(recommendPlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    )).toBe('unknown');
  });
});

describe('productDownloadHref', () => {
  it('keeps the web app on a same-origin public route', () => {
    expect(productDownloadHref({ desktop: false, android: false })).toBe('/download');
  });

  it('sends installed clients to the canonical download URL with a client hint', () => {
    expect(productDownloadHref({ desktop: true })).toBe('https://plainlist.space/download?client=desktop');
    expect(productDownloadHref({ android: true })).toBe('https://plainlist.space/download?client=android');
  });
});
