import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/features/auth/model/useAuthStore';
import {
  apiRequestUrl,
  connectionErrorMessage,
  httpErrorMessage,
  resolveApiOrigin,
} from './apiRouting';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

declare const __API_BASE_URL__: string;

function getApiBaseUrl(): string {
  return resolveApiOrigin({
    configuredOrigin: typeof __API_BASE_URL__ === 'string' ? __API_BASE_URL__ : '',
    isNative: Capacitor.isNativePlatform(),
    protocol: typeof window === 'undefined' ? '' : window.location.protocol,
  });
}

const API_BASE = getApiBaseUrl();
const DEFAULT_TIMEOUT_MS = 20_000;
const LONG_TIMEOUT_MS = 180_000;

function timeoutForPath(path: string): number {
  if (
    path.startsWith('/ai-intake')
    || path.startsWith('/user-profile/analyze')
    || path.startsWith('/reviews/weekly-summary')
  ) {
    return LONG_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

function formatApiError(status: number, message: string, path: string): string {
  if (status === 503 && message.includes('未配置可用的大模型')) {
    return message;
  }

  if (status === 504) {
    return message || '大模型请求超时，请把超时调到 180000ms 以上（MiniMax-M3 较慢）并保存后重试。';
  }

  if (/aborted/i.test(message)) {
    return '请求已取消或超时。若在使用 MiniMax-M3，请将超时调至 180000ms 并保存后重试。';
  }

  if (status === 502) {
    if (message.includes('upstream failed')) {
      const detail = message.replace(/^openai upstream failed:\s*/i, '').replace(/^anthropic upstream failed:\s*/i, '');
      return `大模型接口错误：${detail}`;
    }
    if (message.includes('无法整理为日程') || message.includes('no items') || message.includes('JSON')) {
      return message;
    }
    return message || '大模型接口调用失败，请检查 API Key、Base URL 和模型名称。';
  }

  if (status === 500 && (message === 'Internal Server Error' || message.includes('Internal Server Error'))) {
    return '服务器暂时无响应（500）。请稍后重试；若持续失败，请检查服务是否在线。';
  }

  return httpErrorMessage(status, message, path);
}

function mergeTimeoutSignal(external: AbortSignal | undefined, ms: number): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

export function useApi() {
  async function request<T>(method: HttpMethod, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const auth = useAuthStore();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    const timeout = mergeTimeoutSignal(signal, timeoutForPath(path));
    let response: Response;
    try {
      response = await fetch(apiRequestUrl(API_BASE, path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout.signal,
      });
    } catch (error) {
      const timedOut = timeout.didTimeout();
      timeout.cleanup();
      if (!timedOut && error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      if (!timedOut && error instanceof Error && /aborted/i.test(error.message)) {
        throw new Error('请求已取消。');
      }
      throw new Error(connectionErrorMessage(timedOut));
    }
    timeout.cleanup();

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      const message = typeof error.error === 'string' ? error.error : response.statusText;
      throw new Error(formatApiError(response.status, message, path));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
    post: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>('POST', path, body, signal),
    put: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>('PUT', path, body, signal),
    patch: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>('PATCH', path, body, signal),
    del: <T>(path: string, signal?: AbortSignal) => request<T>('DELETE', path, undefined, signal),
  };
}
