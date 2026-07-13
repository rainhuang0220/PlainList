import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/features/auth/model/useAuthStore';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

declare const __API_BASE_URL__: string;

function getApiBaseUrl(): string {
  if (typeof __API_BASE_URL__ === 'string' && __API_BASE_URL__) {
    return __API_BASE_URL__;
  }
  if (Capacitor.isNativePlatform()) {
    console.warn('[PlainList] Running on native platform without VITE_API_BASE_URL. Set it before building.');
    return '';
  }
  return '';
}

const API_BASE = getApiBaseUrl();

function formatApiError(status: number, message: string): string {
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
    return '后端 API 无响应（500）。请确认已在项目根目录运行 npm run dev，且 MySQL 已启动。';
  }

  if (status === 401) {
    return '登录已过期，请重新登录。';
  }

  return message || `请求失败（HTTP ${status}）`;
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

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      if (error instanceof Error && /aborted/i.test(error.message)) {
        throw new Error('请求已取消。');
      }
      throw new Error('无法连接后端 API。请确认 npm run dev 已启动且端口 3000 可用。');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      const message = typeof error.error === 'string' ? error.error : response.statusText;
      throw new Error(formatApiError(response.status, message));
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
