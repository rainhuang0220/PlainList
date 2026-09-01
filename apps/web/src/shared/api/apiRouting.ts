export const CANONICAL_API_ORIGIN = 'https://plainlist.space';

interface ApiRuntime {
  configuredOrigin: string;
  isNative: boolean;
  protocol: string;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

export function resolveApiOrigin({ configuredOrigin, isNative, protocol }: ApiRuntime): string {
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin);
  }

  if (isNative || protocol === 'file:') {
    return CANONICAL_API_ORIGIN;
  }

  return '';
}

export function apiRequestUrl(apiOrigin: string, path: string): string {
  return `${apiOrigin}/api${path}`;
}

export function connectionErrorMessage(timedOut: boolean): string {
  return timedOut
    ? '请求 PlainList 服务超时，请检查网络连接后重试。服务地址：https://plainlist.space'
    : '无法连接 PlainList 服务，请检查网络连接后重试。服务地址：https://plainlist.space';
}

export function httpErrorMessage(status: number, message: string, path: string): string {
  if (status === 401 && path === '/auth/login') {
    return message || '用户名或密码错误。';
  }

  if (status === 401) {
    return '登录已过期，请重新登录。';
  }

  return message || `请求失败（HTTP ${status}）`;
}
