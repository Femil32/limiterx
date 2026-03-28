# Quickstart Validation Scenarios

**Feature**: `002-algo-storage-size`
**Purpose**: Manual smoke-test scenarios to verify each user story end-to-end after implementation.

---

## US1 — Sliding Window

```typescript
import { createRateLimiter } from 'limiterx';

const limiter = createRateLimiter({
  algorithm: 'sliding-window',
  max: 5,
  window: '10s',
});

// Fire 5 requests → all should be allowed
for (let i = 0; i < 5; i++) {
  const r = await limiter.check('user-1');
  console.assert(r.allowed === true, `Request ${i + 1} should be allowed`);
}

// 6th request → denied
const denied = await limiter.check('user-1');
console.assert(denied.allowed === false, '6th request should be denied');
console.assert(denied.retryAfter > 0, 'retryAfter should be positive');

// Clean up
limiter.destroy();
```

**Expected**: 5 allowed, 1 denied, `retryAfter > 0`.

---

## US2 — Token Bucket

```typescript
import { createRateLimiter } from 'limiterx';

const limiter = createRateLimiter({
  algorithm: 'token-bucket',
  max: 3,
  window: '6s',  // refill rate: 1 token per 2 seconds
});

// Burst: 3 requests immediately → all allowed (full bucket)
for (let i = 0; i < 3; i++) {
  const r = await limiter.check('burst-user');
  console.assert(r.allowed === true, `Burst request ${i + 1} should be allowed`);
}

// 4th request immediately → denied (bucket empty)
const denied = await limiter.check('burst-user');
console.assert(denied.allowed === false, '4th immediate request should be denied');
console.assert(denied.retryAfter > 0, 'retryAfter should indicate refill wait');

// After 2 seconds → 1 token refilled → 1 request allowed
await new Promise(r => setTimeout(r, 2100));
const refilled = await limiter.check('burst-user');
console.assert(refilled.allowed === true, 'Request after refill should be allowed');

limiter.destroy();
```

**Expected**: Burst of 3 allowed, immediate 4th denied, request after refill allowed.

---

## US3 — Redis Shared State

```typescript
import { createRateLimiter } from 'limiterx';
import { RedisStore } from 'limiterx/redis';
import { createClient } from 'redis';

const client = createClient();
await client.connect();
const store = new RedisStore(client);

// Two independent limiter instances sharing same Redis store
const limiterA = createRateLimiter({ max: 5, window: '1m', store });
const limiterB = createRateLimiter({ max: 5, window: '1m', store });

// 3 requests through A
for (let i = 0; i < 3; i++) await limiterA.check('shared-user');

// 2 requests through B → should be allowed (total 5)
for (let i = 0; i < 2; i++) {
  const r = await limiterB.check('shared-user');
  console.assert(r.allowed === true);
}

// 6th request through either → denied
const denied = await limiterA.check('shared-user');
console.assert(denied.allowed === false, 'Shared limit should be enforced across instances');

await client.disconnect();
```

**Expected**: Shared counter enforced across two instances — 6th request denied regardless of which instance handles it.

---

## US4 — Package Size

```bash
# In repo root after running: npm run build
npm pack --dry-run 2>&1 | grep "unpacked size"
# Expected: unpacked size < 300 kB

# Verify no Redis code in express-only bundle
node -e "
  const fs = require('fs');
  const code = fs.readFileSync('./dist/adapters/express.js', 'utf8');
  console.assert(!code.includes('RedisStore'), 'express bundle must not contain Redis code');
  console.assert(!code.includes('useRateLimit'), 'express bundle must not contain React code');
  console.log('Tree-shake check passed');
"
```

**Expected**: Unpacked size < 300 kB, no Redis or React code in `dist/adapters/express.js`.

---

## Config Validation Smoke Tests

```typescript
import { createRateLimiter } from 'limiterx';

// Invalid algorithm
try {
  createRateLimiter({ max: 10, window: '1m', algorithm: 'invalid' as any });
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.assert(e.message.includes('[limiterx] Invalid config:'));
  console.assert(e.message.includes("'algorithm'"));
}

// Default still works (no algorithm field)
const def = createRateLimiter({ max: 10, window: '1m' });
const r = await def.check('k');
console.assert(r.allowed === true);
def.destroy();
```
