import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../src/core/createRateLimiter.js';
import { validateConfig } from '../../src/core/validateConfig.js';

describe('dynamic max', () => {
  it('accepts a number (existing behaviour)', () => {
    expect(() => createRateLimiter({ max: 10, window: '1m' })).not.toThrow();
  });

  it('accepts a sync function for max', () => {
    expect(() => createRateLimiter({ max: () => 10, window: '1m' })).not.toThrow();
  });

  it('accepts an async function for max', () => {
    expect(() => createRateLimiter({ max: async () => 10, window: '1m' })).not.toThrow();
  });

  it('throws for invalid max (zero)', () => {
    expect(() => createRateLimiter({ max: 0, window: '1m' })).toThrow('[limiterx] Invalid config:');
  });

  it('throws for invalid max (non-function non-number)', () => {
    expect(() => createRateLimiter({ max: 'bad' as never, window: '1m' })).toThrow('[limiterx] Invalid config:');
  });

  it('sync function max is used per-request', async () => {
    let callCount = 0;
    const limiter = createRateLimiter({
      max: () => { callCount++; return 2; },
      window: '1m',
    });
    await limiter.check('k1');
    await limiter.check('k1');
    const r = await limiter.check('k1');
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(2);
    expect(callCount).toBeGreaterThanOrEqual(3);
    limiter.destroy();
  });

  it('async function max resolves per-request', async () => {
    const limiter = createRateLimiter({
      max: async (_ctx) => 1,
      window: '1m',
    });
    const r1 = await limiter.check('k2');
    expect(r1.allowed).toBe(true);
    const r2 = await limiter.check('k2');
    expect(r2.allowed).toBe(false);
    expect(r2.limit).toBe(1);
    limiter.destroy();
  });

  it('premium key gets higher limit via dynamic max', async () => {
    const premiumKeys = new Set(['premium-user']);
    const limiter = createRateLimiter({
      max: (ctx) => premiumKeys.has(ctx.key) ? 100 : 5,
      window: '1m',
    });
    // Free user exhausted at 5
    for (let i = 0; i < 5; i++) await limiter.check('free-user');
    const denied = await limiter.check('free-user');
    expect(denied.allowed).toBe(false);
    expect(denied.limit).toBe(5);

    // Premium user has 100
    const r = await limiter.check('premium-user');
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(100);
    limiter.destroy();
  });
});
