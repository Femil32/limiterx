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

  it('handler replaces built-in 429 on deny', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const middleware = rateLimitKoa({ max: 1, window: '1m', keyGenerator: () => 'koa-handler', handler });
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(makeMockCtx(), next); // allowed
    const ctx = makeMockCtx();
    await middleware(ctx, next); // denied — handler should fire

    expect(handler).toHaveBeenCalledOnce();
    expect(ctx.status).toBe(200); // handler did not set 429 in mock
  });

  it('skipSuccessfulRequests: successful request decrements counter', async () => {
    // Use a mock ctx with res.on for finish event
    function makeMockCtxWithRes(ip = '127.0.0.1') {
      const setHeaders: Record<string, string> = {};
      const finishListeners: Array<() => void> = [];
      const res = {
        on(_event: string, listener: () => void) { finishListeners.push(listener); },
        _emit() { finishListeners.forEach(fn => fn()); },
      };
      return {
        ip,
        status: 200,
        body: undefined as unknown,
        set(name: string, value: string) { setHeaders[name.toLowerCase()] = value; },
        res,
        _headers: setHeaders,
        _res: res,
      };
    }

    const middleware = rateLimitKoa({ max: 2, window: '1m', keyGenerator: () => 'koa-skip-ok', skipSuccessfulRequests: true });
    const next = vi.fn().mockResolvedValue(undefined);

    // Send 4 allowed requests — each should decrement after finish
    for (let i = 0; i < 4; i++) {
      const ctx = makeMockCtxWithRes();
      await middleware(ctx, next);
      ctx._res._emit(); // simulate finish event
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Counter should still be 0 (all decremented), so still allowed
    const ctx = makeMockCtxWithRes();
    await middleware(ctx, next);
    expect(ctx.status).toBe(200); // not 429
  });
});
