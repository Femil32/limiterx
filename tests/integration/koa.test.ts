import { describe, it, expect, vi } from 'vitest';
import { rateLimitKoa } from '../../src/adapters/koa.js';

// Minimal Koa context mock
function makeMockCtx(ip = '127.0.0.1') {
  const setHeaders: Record<string, string> = {};
  return {
    ip,
    status: 200,
    body: undefined as unknown,
    set(name: string, value: string) {
      setHeaders[name.toLowerCase()] = value;
    },
    _headers: setHeaders,
  };
}

describe('rateLimitKoa', () => {
  it('calls next() when request is allowed', async () => {
    const middleware = rateLimitKoa({ max: 10, window: '1m' });
    const ctx = makeMockCtx();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('does NOT call next() when request is denied', async () => {
    const middleware = rateLimitKoa({ max: 1, window: '1m', keyGenerator: () => 'koa-deny' });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(makeMockCtx(), next); // allowed — consumes the 1 request
    next.mockClear();

    const ctx2 = makeMockCtx();
    await middleware(ctx2, next); // denied

    expect(next).not.toHaveBeenCalled();
  });

  it('sets rate limit headers on ctx', async () => {
    const middleware = rateLimitKoa({ max: 10, window: '1m', keyGenerator: () => 'koa-headers' });
    const ctx = makeMockCtx();
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(ctx._headers['ratelimit-limit']).toBeDefined();
    expect(ctx._headers['ratelimit-remaining']).toBeDefined();
    expect(ctx._headers['ratelimit-reset']).toBeDefined();
  });

  it('sets ctx.status=429 and ctx.body on deny', async () => {
    const middleware = rateLimitKoa({ max: 1, window: '1m', keyGenerator: () => 'koa-status' });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(makeMockCtx(), next); // consume the 1 allowed request

    const ctx = makeMockCtx();
    await middleware(ctx, next); // denied

    expect(ctx.status).toBe(429);
    expect(ctx.body).toBeDefined();
  });
});
