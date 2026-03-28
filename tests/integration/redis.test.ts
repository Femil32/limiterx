import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisStore } from '../../src/adapters/redis.js';
import { createRateLimiter } from '../../src/core/createRateLimiter.js';

const REDIS_AVAILABLE = process.env['REDIS_AVAILABLE'] === 'true';

// Run with: REDIS_AVAILABLE=true npx vitest run tests/integration/redis.test.ts
// Requires Redis running on localhost:6379

describe.skipIf(!REDIS_AVAILABLE)('Redis integration (requires Redis on localhost:6379)', () => {
  let ioredis: typeof import('ioredis');
  let client: InstanceType<(typeof ioredis)['default']>;

  beforeAll(async () => {
    ioredis = await import('ioredis');
    client = new ioredis.default({ host: 'localhost', port: 6379 });
  });

  afterAll(async () => {
    await client.quit();
  });

  it('shares counter across two limiter instances', async () => {
    const store = new RedisStore(client as never);
    const limiter1 = createRateLimiter({ max: 5, window: '10s', store });
    const limiter2 = createRateLimiter({ max: 5, window: '10s', store });

    for (let i = 0; i < 5; i++) {
      const r = await (i % 2 === 0 ? limiter1 : limiter2).check('shared-key');
      expect(r.allowed).toBe(true);
    }
    const denied = await limiter1.check('shared-key');
    expect(denied.allowed).toBe(false);

    limiter1.destroy();
    limiter2.destroy();
  });

  it('limiter.reset clears Redis key', async () => {
    const store = new RedisStore(client as never);
    const limiter = createRateLimiter({ max: 2, window: '10s', store });
    await limiter.check('reset-key');
    await limiter.check('reset-key');
    await limiter.reset('reset-key');
    const r = await limiter.check('reset-key');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
    limiter.destroy();
  });
});
