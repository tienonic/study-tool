import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import { imgProxyPlugin, publicImageLookup } from '../vite-plugins/img-proxy.ts';

afterEach(() => vi.restoreAllMocks());

describe('image proxy redirects', () => {
  it.each(['http://127.0.0.1:8766/private', 'http://[::ffff:127.0.0.1]:8766/private'])('rejects a public image redirect to %s', async (target) => {
    const requested: string[] = [];
    vi.spyOn(http, 'get').mockImplementation(((url: string, _options: unknown, callback: (response: unknown) => void) => {
      requested.push(url);
      const response = Object.assign(new EventEmitter(), {
        statusCode: 302, headers: { location: target }, resume() {},
      });
      callback(response);
      return new EventEmitter();
    }) as typeof http.get);
    let middleware!: (req: unknown, res: unknown, next: () => void) => Promise<void>;
    imgProxyPlugin().configureServer({ middlewares: { use(handler: typeof middleware) { middleware = handler; } } });
    const response = { statusCode: 0, end: vi.fn(), setHeader: vi.fn() };
    await middleware({ url: '/__img?url=http%3A%2F%2Fexample.com%2Fimage.png' }, response, vi.fn());
    expect(requested).toEqual(['http://example.com/image.png']);
    expect(response.statusCode).toBe(400);
    expect(response.end).toHaveBeenCalledWith('Invalid image url');
  });
});

it('rejects hostnames whose DNS result includes a private address', () => {
  vi.spyOn(dns, 'lookup').mockImplementation(((_hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
    callback(null, [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  }) as typeof dns.lookup);
  const callback = vi.fn();
  publicImageLookup('example.com', { all: true }, callback);
  expect(callback).toHaveBeenCalledWith(expect.any(Error));
});

it('pins the validated DNS result to the outbound connection', () => {
  const addresses = [{ address: '93.184.216.34', family: 4 }];
  vi.spyOn(dns, 'lookup').mockImplementation(((_hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
    callback(null, addresses);
  }) as typeof dns.lookup);
  const callback = vi.fn();
  publicImageLookup('example.com', { all: true }, callback);
  expect(callback).toHaveBeenCalledWith(null, addresses);
});
