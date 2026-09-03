export type DownloadRecommendation = 'macos' | 'android' | 'unknown';

export const CANONICAL_DOWNLOAD_URL = 'https://plainlist.space/download';

export function recommendPlatform(userAgent: string): DownloadRecommendation {
  const ua = userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'unknown';
  if (/Mac OS X|Macintosh/i.test(ua) && !/Mobile/i.test(ua)) return 'macos';
  return 'unknown';
}

export function isInstalledDesktopClient(): boolean {
  return Boolean((window as Window & { plainlistDesktop?: unknown }).plainlistDesktop);
}

export function isInstalledNativeClient(): boolean {
  return document.documentElement.classList.contains('pl-native')
    || /CapacitorHttp|capacitor/i.test(navigator.userAgent);
}

export function productDownloadHref(input?: { desktop?: boolean; android?: boolean }): string {
  const desktop = input?.desktop ?? (typeof window !== 'undefined' && isInstalledDesktopClient());
  const android = input?.android ?? (typeof document !== 'undefined' && isInstalledNativeClient());
  if (desktop) return `${CANONICAL_DOWNLOAD_URL}?client=desktop`;
  if (android) return `${CANONICAL_DOWNLOAD_URL}?client=android`;
  return '/download';
}
