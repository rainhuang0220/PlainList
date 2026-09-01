import { describe, expect, it } from 'vitest';
import {
  CANONICAL_API_ORIGIN,
  apiRequestUrl,
  connectionErrorMessage,
  httpErrorMessage,
  resolveApiOrigin,
} from './apiRouting';

describe('production API routing', () => {
  it('keeps the web app same-origin while routing packaged desktop and Android to the canonical HTTPS origin', () => {
    expect(resolveApiOrigin({ configuredOrigin: '', isNative: false, protocol: 'https:' })).toBe('');
    expect(resolveApiOrigin({ configuredOrigin: '', isNative: false, protocol: 'file:' })).toBe(CANONICAL_API_ORIGIN);
    expect(resolveApiOrigin({ configuredOrigin: '', isNative: true, protocol: 'capacitor:' })).toBe(CANONICAL_API_ORIGIN);
  });

  it('uses an explicitly configured development origin without changing the production fallback', () => {
    expect(resolveApiOrigin({ configuredOrigin: 'http://localhost:3000/', isNative: false, protocol: 'file:' })).toBe('http://localhost:3000');
  });

  it('builds account and health URLs that cannot resolve against file://', () => {
    expect(apiRequestUrl(CANONICAL_API_ORIGIN, '/auth/accounts')).toBe('https://plainlist.space/api/auth/accounts');
    expect(apiRequestUrl(CANONICAL_API_ORIGIN, '/health')).toBe('https://plainlist.space/api/health');
    expect(apiRequestUrl('', '/auth/login')).toBe('/api/auth/login');
  });

  it('keeps network failures neutral and distinguishes login authentication failures from server failures', () => {
    expect(connectionErrorMessage(false)).toContain('无法连接 PlainList 服务');
    expect(connectionErrorMessage(true)).toContain('请求 PlainList 服务超时');
    expect(connectionErrorMessage(false)).not.toMatch(/VPN|175\.24\.134\.228/);
    expect(httpErrorMessage(401, '用户名或密码错误', '/auth/login')).toBe('用户名或密码错误');
    expect(httpErrorMessage(503, '暂不可用', '/auth/login')).toBe('暂不可用');
  });
});
