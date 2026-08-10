import { Preferences } from '@capacitor/preferences';
import { isNativePlatform } from '@/shared/platform';

export const TOKEN_KEY = 'pl_token';

export async function getToken(): Promise<string | null> {
  if (isNativePlatform()) {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value;
  }
  return sessionStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.remove({ key: TOKEN_KEY });
    return;
  }
  sessionStorage.removeItem(TOKEN_KEY);
}
