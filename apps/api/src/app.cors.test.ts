import { afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';

describe('browser CORS policy', () => {
  const server = createApp().listen(0);
  const port = (server.address() as AddressInfo).port;

  afterAll(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  it('does not authorize a file renderer Origin null', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'null' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).not.toBe('null');
  });
});
