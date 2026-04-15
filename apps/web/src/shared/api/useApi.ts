import { useAuthStore } from '@/features/auth/model/useAuthStore';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export function useApi() {
  async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const auth = useAuthStore();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    const response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
  };
}
