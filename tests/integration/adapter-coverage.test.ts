import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import http from 'http';
import { rateLimitExpress } from '../../src/adapters/express.js';
import { rateLimitNode } from '../../src/adapters/node.js';
import { rateLimitNext, rateLimitEdge } from '../../src/adapters/next.js';
import { rateLimitKoa } from '../../src/adapters/koa.js';
import { rateLimitFetch } from '../../src/adapters/fetch.js';
import { rateLimitAxios } from '../../src/adapters/axios.js';
import { parseWindow } from '../../src/core/parseWindow.js';
import { FixedWindowLimiter } from '../../src/core/algorithms/FixedWindowLimiter.js';
import { RateLimitError } from '../../src/core/RateLimitError.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockKoaCtx(ip = '127.0.0.1') {
  const headers: Record<string, string> = {};
  return {
    ip,
    status: 200,
    body: null as unknown,
    set(name: string, value: string) {
      headers[name] = value;
    },
    _headers: headers,
  };
}

function createMockNextReqRes() {
  const headers: Record<string, string> = {};
  const req = {
    headers: { 'x-forwarded-for': '1.2.3.4' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  let statusCode = 200;
  let body: unknown;
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
    },
    send(data: string) {
      body = data;
    },
    end() {},
    _headers: headers,
    _statusCode: () => statusCode,
    _body: () => body,
  };
  return { req, res };
}

function createMockEdgeRequest(ip?: string, forwardedFor?: string) {
  const headerMap: Record<string, string> = {};
  if (forwardedFor) headerMap['x-forwarded-for'] = forwardedFor;
  return {
    ip,
    headers: {
      get(name: string): string | null {
        return headerMap[name.toLowerCase()] ?? null;
      },
    },
  };
}

function createMockMemoryStore() {
  const store = new Map<string, { count: number; windowStart: number; expireAt: number }>();
  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry || Date.now() > entry.expireAt) return null;
      return { count: entry.count, windowStart: entry.windowStart };
    },
    async set(key: string, state: { count: number; windowStart: number }, ttlMs: number) {
      store.set(key, { ...state, expireAt: Date.now() + ttlMs });
    },
    async increment(key: string, ttlMs: number) {
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || now > entry.expireAt) {
        store.set(key, { count: 1, windowStart: now, expireAt: now + ttlMs });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async delete(key: string) {
      store.delete(key);
    },
    async clear() {
      store.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Express adapter — coverage-boosting tests
// ---------------------------------------------------------------------------

describe('rateLimitExpress — coverage', () => {
  it('debug mode logs ALLOW and DENY without errors', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = express();
    app.use(
      rateLimitExpress({
        max: 2,
        window: '1m',
        debug: true,
        keyGenerator: () => 'debug-express-key',
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    // ALLOW path
    const res1 = await request(app).get('/');
    expect(res1.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:express] ALLOW'),
    );

    await request(app).get('/');

    // DENY path
    const res3 = await request(app).get('/');
    expect(res3.status).toBe(429);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:express] DENY'),
    );

    consoleSpy.mockRestore();
  });

  it('skip function: skipped request passes through without counting', async () => {
    const app = express();
    app.use(
      rateLimitExpress({
        max: 1,
        window: '1m',
        keyGenerator: () => 'skip-express-key',
        skip: () => true,
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    // All requests should pass because skip always returns true
    const res1 = await request(app).get('/');
    const res2 = await request(app).get('/');
    const res3 = await request(app).get('/');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);
  });

  it('custom object message: returns JSON body on deny', async () => {
    const app = express();
    app.use(
      rateLimitExpress({
        max: 1,
        window: '1m',
        message: { error: 'rate limited' },
        keyGenerator: () => 'obj-msg-express-key',
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    await request(app).get('/');
    const res = await request(app).get('/');

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'rate limited' });
  });

  it('onLimit callback that throws does not crash the server', async () => {
    const app = express();
    app.use(
      rateLimitExpress({
        max: 1,
        window: '1m',
        keyGenerator: () => 'onlimit-throw-express-key',
        onLimit: () => {
          throw new Error('onLimit explosion');
        },
      }),
    );
    app.get('/', (_req, res) => res.send('ok'));

    await request(app).get('/');
    const res = await request(app).get('/');

    // Should still return 429, not 500
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Node adapter — coverage-boosting tests
// ---------------------------------------------------------------------------

describe('rateLimitNode — coverage', () => {
  it('skip function: skipped requests get synthetic allowed result', async () => {
    const limiter = rateLimitNode({
      max: 1,
      window: '1m',
      skip: () => true,
    });

    const result = await new Promise<{ allowed: boolean; remaining: number }>((resolve) => {
      const server = http.createServer(async (req, res) => {
        const r = await limiter.check(req, res);
        res.writeHead(200);
        res.end(JSON.stringify({ allowed: r.allowed, remaining: r.remaining }));
      });
      server.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        http.get(`http://127.0.0.1:${port}/`, (response) => {
          let data = '';
          response.on('data', (chunk) => (data += chunk));
          response.on('end', () => {
            server.close();
            resolve(JSON.parse(data));
          });
        });
      });
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1); // max=1
  });

  it('debug mode logs without errors', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const limiter = rateLimitNode({
      max: 5,
      window: '1m',
      debug: true,
    });

    await new Promise<void>((resolve) => {
      const server = http.createServer(async (req, res) => {
        await limiter.check(req, res);
        res.writeHead(200);
        res.end('ok');
      });
      server.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        http.get(`http://127.0.0.1:${port}/`, (response) => {
          response.resume();
          response.on('end', () => {
            server.close();
            resolve();
          });
        });
      });
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[limiterx:node]'));
    consoleSpy.mockRestore();
  });

  it('onLimit callback that throws does not crash', async () => {
    const limiter = rateLimitNode({
      max: 1,
      window: '1m',
      keyGenerator: () => 'onlimit-node-key',
      onLimit: () => {
        throw new Error('node onLimit explosion');
      },
    });

    const results: boolean[] = [];

    await new Promise<void>((resolve) => {
      let done = 0;
      const server = http.createServer(async (req, res) => {
        const r = await limiter.check(req, res);
        results.push(r.allowed);
        res.writeHead(200);
        res.end('ok');
        done++;
        if (done === 2) {
          server.close();
          resolve();
        }
      });
      server.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        http.get(`http://127.0.0.1:${port}/`);
        http.get(`http://127.0.0.1:${port}/`);
      });
    });

    expect(results[0]).toBe(true);
    expect(results[1]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Next.js adapter — coverage-boosting tests
// ---------------------------------------------------------------------------

describe('rateLimitNext — coverage', () => {
  it('skip function: returns synthetic allowed result without counting', async () => {
    const limiter = rateLimitNext({
      max: 1,
      window: '1m',
      skip: () => true,
    });
    const { req, res } = createMockNextReqRes();

    // Both calls should be allowed because skip always returns true
    const r1 = await limiter.check(req, res);
    const r2 = await limiter.check(req, res);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('debug mode logs ALLOW path', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const limiter = rateLimitNext({
      max: 5,
      window: '1m',
      debug: true,
      keyGenerator: () => 'next-debug-allow-key',
    });
    const { req, res } = createMockNextReqRes();

    await limiter.check(req, res);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:next] ALLOW'),
    );
    consoleSpy.mockRestore();
  });

  it('debug mode logs DENY path', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const limiter = rateLimitNext({
      max: 1,
      window: '1m',
      debug: true,
      keyGenerator: () => 'next-debug-deny-key',
    });
    const { req, res } = createMockNextReqRes();

    await limiter.check(req, res);
    await limiter.check(req, res);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:next] DENY'),
    );
    consoleSpy.mockRestore();
  });

  it('custom object message: returns JSON on deny', async () => {
    const limiter = rateLimitNext({
      max: 1,
      window: '1m',
      message: { error: 'rate limited' },
      keyGenerator: () => 'next-obj-msg-key',
    });
    const { req, res } = createMockNextReqRes();

    await limiter.check(req, res);
    await limiter.check(req, res);

    expect(res._statusCode()).toBe(429);
    expect(res._body()).toMatchObject({ error: 'rate limited' });
  });

  it('onLimit callback that throws does not crash', async () => {
    const limiter = rateLimitNext({
      max: 1,
      window: '1m',
      keyGenerator: () => 'next-onlimit-throw-key',
      onLimit: () => {
        throw new Error('next onLimit explosion');
      },
    });
    const { req, res } = createMockNextReqRes();

    await limiter.check(req, res);
    const r2 = await limiter.check(req, res);

    expect(r2.allowed).toBe(false);
    expect(res._statusCode()).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Next.js Edge adapter — coverage-boosting tests
// ---------------------------------------------------------------------------

describe('rateLimitEdge — coverage', () => {
  it('skip function: returns undefined (pass-through) when skipped', async () => {
    const middleware = rateLimitEdge({
      max: 1,
      window: '1m',
      skip: () => true,
    });
    const req = createMockEdgeRequest('1.2.3.4');

    const r1 = await middleware(req as unknown as Request);
    const r2 = await middleware(req as unknown as Request);

    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
  });

  it('debug mode logs ALLOW path', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const middleware = rateLimitEdge({
      max: 5,
      window: '1m',
      debug: true,
      keyGenerator: () => 'edge-debug-allow-key',
    });
    const req = createMockEdgeRequest('1.2.3.4');

    const result = await middleware(req as unknown as Request);

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:edge] ALLOW'),
    );
    consoleSpy.mockRestore();
  });

  it('debug mode logs DENY path', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const middleware = rateLimitEdge({
      max: 1,
      window: '1m',
      debug: true,
      keyGenerator: () => 'edge-debug-deny-key',
    });
    const req = createMockEdgeRequest('1.2.3.4');

    await middleware(req as unknown as Request);
    const result = await middleware(req as unknown as Request);

    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(429);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:edge] DENY'),
    );
    consoleSpy.mockRestore();
  });

  it('object message returns application/json body', async () => {
    const middleware = rateLimitEdge({
      max: 1,
      window: '1m',
      message: { error: 'rate limited' },
      keyGenerator: () => 'edge-obj-msg-key',
    });
    const req = createMockEdgeRequest('1.2.3.4');

    await middleware(req as unknown as Request);
    const result = await middleware(req as unknown as Request);

    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(429);
    expect(result?.headers.get('content-type')).toBe('application/json');
    const body = await result?.json();
    expect(body).toMatchObject({ error: 'rate limited' });
  });

  it('headers:false omits RateLimit-* headers on deny', async () => {
    const middleware = rateLimitEdge({
      max: 1,
      window: '1m',
      headers: false,
      keyGenerator: () => 'edge-no-headers-key',
    });
    const req = createMockEdgeRequest('1.2.3.4');

    await middleware(req as unknown as Request);
    const result = await middleware(req as unknown as Request);

    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(429);
    expect(result?.headers.get('ratelimit-limit')).toBeNull();
    expect(result?.headers.get('ratelimit-remaining')).toBeNull();
    expect(result?.headers.get('retry-after')).toBeNull();
  });

  it('onLimit callback that throws does not crash', async () => {
    const middleware = rateLimitEdge({
      max: 1,
      window: '1m',
      keyGenerator: () => 'edge-onlimit-throw-key',
      onLimit: () => {
        throw new Error('edge onLimit explosion');
      },
    });
    const req = createMockEdgeRequest('1.2.3.4');

    await middleware(req as unknown as Request);
    const result = await middleware(req as unknown as Request);

    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Koa adapter — coverage-boosting tests
// ---------------------------------------------------------------------------

describe('rateLimitKoa — coverage', () => {
  it('skip function: calls next() without counting', async () => {
    const middleware = rateLimitKoa({
      max: 1,
      window: '1m',
      skip: () => true,
    });

    let nextCallCount = 0;
    const next = async () => {
      nextCallCount++;
    };

    const ctx1 = createMockKoaCtx();
    const ctx2 = createMockKoaCtx();
    const ctx3 = createMockKoaCtx();

    await middleware(ctx1 as unknown as Parameters<typeof middleware>[0], next);
    await middleware(ctx2 as unknown as Parameters<typeof middleware>[0], next);
    await middleware(ctx3 as unknown as Parameters<typeof middleware>[0], next);

    expect(nextCallCount).toBe(3);
    expect(ctx1.status).toBe(200); // unchanged
  });

  it('debug mode logs ALLOW and DENY paths', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const middleware = rateLimitKoa({
      max: 1,
      window: '1m',
      debug: true,
      keyGenerator: () => 'koa-debug-key',
    });

    const next = async () => {};
    const allowCtx = createMockKoaCtx();
    await middleware(allowCtx as unknown as Parameters<typeof middleware>[0], next);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:koa] ALLOW'),
    );

    const denyCtx = createMockKoaCtx();
    await middleware(denyCtx as unknown as Parameters<typeof middleware>[0], next);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:koa] DENY'),
    );

    consoleSpy.mockRestore();
  });

  it('onLimit callback that throws does not crash', async () => {
    const middleware = rateLimitKoa({
      max: 1,
      window: '1m',
      keyGenerator: () => 'koa-onlimit-throw-key',
      onLimit: () => {
        throw new Error('koa onLimit explosion');
      },
    });

    const next = async () => {};
    const ctx1 = createMockKoaCtx();
    const ctx2 = createMockKoaCtx();

    await middleware(ctx1 as unknown as Parameters<typeof middleware>[0], next);
    await middleware(ctx2 as unknown as Parameters<typeof middleware>[0], next);

    expect(ctx2.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Fetch adapter — coverage-boosting tests
// ---------------------------------------------------------------------------

describe('rateLimitFetch — coverage', () => {
  it('debug mode logs ALLOW and DENY paths', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max: 1,
      window: '1m',
      debug: true,
    });

    // ALLOW path
    await guarded('https://example.com/api');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:fetch] ALLOW'),
    );

    // DENY path
    await expect(guarded('https://example.com/api')).rejects.toThrow(RateLimitError);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:fetch] DENY'),
    );

    consoleSpy.mockRestore();
  });

  it('skip function: fetch is called even when limit would be exceeded', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max: 1,
      window: '1m',
      skip: () => true,
    });

    await guarded('https://example.com/api');
    await guarded('https://example.com/api');
    await guarded('https://example.com/api');

    // All calls should have gone through to underlying fetch
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Axios adapter — coverage-boosting tests
// ---------------------------------------------------------------------------

describe('rateLimitAxios — coverage', () => {
  function createMockAxiosInstance() {
    let interceptorFn: ((cfg: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null;
    return {
      interceptors: {
        request: {
          use(fn: (cfg: Record<string, unknown>) => Promise<Record<string, unknown>>) {
            interceptorFn = fn;
            return 0;
          },
        },
      },
      async request(config: Record<string, unknown>) {
        if (interceptorFn) {
          return interceptorFn(config);
        }
        return config;
      },
      _getInterceptor() {
        return interceptorFn;
      },
    };
  }

  it('debug mode logs ALLOW path', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const instance = createMockAxiosInstance();
    rateLimitAxios(instance as unknown as Parameters<typeof rateLimitAxios>[0], {
      max: 5,
      window: '1m',
      debug: true,
      keyGenerator: () => 'axios-debug-allow-key',
    });

    const interceptor = instance._getInterceptor()!;
    await interceptor({ url: '/test', method: 'GET' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:axios] ALLOW'),
    );
    consoleSpy.mockRestore();
  });

  it('debug mode logs DENY path', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const instance = createMockAxiosInstance();
    rateLimitAxios(instance as unknown as Parameters<typeof rateLimitAxios>[0], {
      max: 1,
      window: '1m',
      debug: true,
      keyGenerator: () => 'axios-debug-deny-key',
    });

    const interceptor = instance._getInterceptor()!;
    await interceptor({ url: '/test', method: 'GET' });

    await expect(interceptor({ url: '/test', method: 'GET' })).rejects.toThrow(RateLimitError);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx:axios] DENY'),
    );
    consoleSpy.mockRestore();
  });

  it('skip function: interceptor returns config without rate limiting', async () => {
    const instance = createMockAxiosInstance();
    rateLimitAxios(instance as unknown as Parameters<typeof rateLimitAxios>[0], {
      max: 1,
      window: '1m',
      skip: () => true,
      keyGenerator: () => 'axios-skip-key',
    });

    const interceptor = instance._getInterceptor()!;
    const cfg = { url: '/test', method: 'GET' };

    // Should not throw even though max=1 and we're calling multiple times
    const r1 = await interceptor(cfg);
    const r2 = await interceptor(cfg);
    const r3 = await interceptor(cfg);

    expect(r1).toBe(cfg);
    expect(r2).toBe(cfg);
    expect(r3).toBe(cfg);
  });
});

// ---------------------------------------------------------------------------
// parseWindow — coverage for non-string, non-number types
// ---------------------------------------------------------------------------

describe('parseWindow — invalid types', () => {
  it('throws for boolean input', () => {
    expect(() => parseWindow(true as unknown as string)).toThrow(
      /window.*must be a positive number.*duration string/i,
    );
  });

  it('throws for null input', () => {
    expect(() => parseWindow(null as unknown as string)).toThrow(
      /window.*must be a positive number.*duration string/i,
    );
  });

  it('throws for object input', () => {
    expect(() => parseWindow({} as unknown as string)).toThrow(
      /window.*must be a positive number.*duration string/i,
    );
  });

  it('throws for array input', () => {
    expect(() => parseWindow([] as unknown as string)).toThrow(
      /window.*must be a positive number.*duration string/i,
    );
  });
});

// ---------------------------------------------------------------------------
// FixedWindowLimiter — debug mode coverage
// ---------------------------------------------------------------------------

describe('FixedWindowLimiter — debug mode', () => {
  it('logs ALLOW on first request (new window)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockMemoryStore();
    const limiter = new FixedWindowLimiter(store, 5, 60_000, true);

    const result = await limiter.check('limiterx:debug-allow-key', 'debug-allow-key');

    expect(result.allowed).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx] ALLOW'),
    );
    consoleSpy.mockRestore();
  });

  it('logs ALLOW on subsequent allowed request in same window', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockMemoryStore();
    const limiter = new FixedWindowLimiter(store, 5, 60_000, true);

    await limiter.check('limiterx:debug-same-window-key', 'debug-same-window-key');
    consoleSpy.mockClear();
    await limiter.check('limiterx:debug-same-window-key', 'debug-same-window-key');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx] ALLOW'),
    );
    consoleSpy.mockRestore();
  });

  it('logs DENY when limit is exceeded', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockMemoryStore();
    const limiter = new FixedWindowLimiter(store, 1, 60_000, true);

    await limiter.check('limiterx:debug-deny-key', 'debug-deny-key');
    consoleSpy.mockClear();
    const result = await limiter.check('limiterx:debug-deny-key', 'debug-deny-key');

    expect(result.allowed).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx] DENY'),
    );
    consoleSpy.mockRestore();
  });

  it('does NOT log when debug=false', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockMemoryStore();
    const limiter = new FixedWindowLimiter(store, 5, 60_000, false);

    await limiter.check('limiterx:nodebug-key', 'nodebug-key');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
