# Quickstart: express-rate-limit Parity Features

Manual smoke tests for each new feature. Run these after `npm run build`.

---

## 1. Legacy X-RateLimit-* Headers (GAP-4)

```typescript
import express from 'express';
import { rateLimitExpress } from 'limiterx/express';

const app = express();
app.use(rateLimitExpress({
  max: 5,
  window: '1m',
  legacyHeaders: true,   // ← new
}));
app.get('/', (_req, res) => res.send('ok'));
app.listen(3000);
```

```bash
curl -i http://localhost:3000/
# Expected headers:
# RateLimit-Limit: 5
# RateLimit-Remaining: 4
# RateLimit-Reset: 57          ← relative seconds
# X-RateLimit-Limit: 5
# X-RateLimit-Remaining: 4
# X-RateLimit-Reset: 1743184457  ← Unix epoch (absolute)
```

---

## 2. IPv6 Subnet Masking (GAP-7)

```typescript
// Default ipv6Subnet: 56 — two addresses in the same /56 share one counter
const app = express();
app.use(rateLimitExpress({ max: 3, window: '1m' }));
app.get('/', (_req, res) => res.send('ok'));
app.listen(3000);
```

```bash
# Simulate IPv6 requests from same /56 subnet
curl -i http://localhost:3000/ -H "X-Forwarded-For: 2001:db8:1234:5600::1"
curl -i http://localhost:3000/ -H "X-Forwarded-For: 2001:db8:1234:5600::2"
curl -i http://localhost:3000/ -H "X-Forwarded-For: 2001:db8:1234:5600::3"
# 4th request should be 429 — all share key "2001:db8:1234:5600::"

# Disable masking:
app.use(rateLimitExpress({ max: 3, window: '1m', ipv6Subnet: false }));
# Now each address has its own counter
```

---

## 3. Async keyGenerator (GAP-11)

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  keyGenerator: async (ctx) => {
    // Look up user from session store
    const session = await sessionStore.get(ctx.req.cookies.sessionId);
    return session?.userId ?? ctx.req.ip;
  },
}));
```

```bash
# Verify: two requests with same session ID share one counter
# Two requests with different session IDs have separate counters
```

---

## 4. Async skip (GAP-11)

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '1m',
  skip: async (ctx) => {
    // Bypass rate limiting for allowlisted IPs
    return await allowlistCache.has(ctx.req.ip);
  },
}));
```

```bash
# Allowlisted IP: passes without counter increment
# Non-allowlisted IP: counted normally
```

---

## 5. requestPropertyName — Downstream Access (GAP-8)

```typescript
app.use(rateLimitExpress({ max: 100, window: '1m' }));
app.get('/', (req, res) => {
  const info = (req as any).rateLimit;
  if (info.remaining < 10) {
    res.setHeader('X-Rate-Limit-Warning', 'approaching limit');
  }
  res.json({ remaining: info.remaining });
});
```

```bash
curl http://localhost:3000/
# {"remaining":99}
# Headers: X-Rate-Limit-Warning: approaching limit  (when remaining < 10)
```

Custom property name:
```typescript
app.use(rateLimitExpress({ max: 100, window: '1m', requestPropertyName: 'quota' }));
// Now access via req.quota.remaining
```

---

## 6. passOnStoreError — Fail-Open (GAP-9)

```typescript
import { createRateLimiter } from 'limiterx';

// Simulate a broken store
const brokenStore = {
  async get() { throw new Error('Redis unavailable'); },
  async set() { throw new Error('Redis unavailable'); },
  async increment() { throw new Error('Redis unavailable'); },
  async delete() {},
  async clear() {},
};

app.use(rateLimitExpress({
  max: 100,
  window: '1m',
  // store: brokenStore,   ← once store config lands in spec-002
  passOnStoreError: true,   // ← fail-open: allow traffic through
}));
```

```bash
# With passOnStoreError: true and a broken store:
# Request passes through (200) instead of 500
# No rate limit headers set
```

---

## 7. handler — Custom Deny Response (GAP-12)

```typescript
app.use(rateLimitExpress({
  max: 5,
  window: '1m',
  handler: async (result, ctx) => {
    const res = ctx.res as Response;
    res.status(429).json({
      error: 'quota_exceeded',
      limit: result.limit,
      resetAt: result.resetAt.toISOString(),
      upgrade: 'https://example.com/pricing',
    });
  },
}));
```

```bash
# After limit exceeded:
# HTTP 429
# {"error":"quota_exceeded","limit":5,"resetAt":"...","upgrade":"..."}
```

---

## 8. Dynamic message function (GAP-3)

```typescript
app.use(rateLimitExpress({
  max: 5,
  window: '1m',
  message: (result, _ctx) => ({
    error: 'Too Many Requests',
    retryInSeconds: Math.ceil(result.retryAfter / 1000),
    resetAt: result.resetAt.toISOString(),
  }),
}));
```

```bash
# After limit exceeded:
# {"error":"Too Many Requests","retryInSeconds":57,"resetAt":"2026-03-27T10:15:00.000Z"}
```

---

## 9. Dynamic max — Tiered Limits (GAP-1, Phase B)

```typescript
app.use(rateLimitExpress({
  max: async (ctx) => {
    const apiKey = ctx.req?.headers?.['x-api-key'] as string;
    const tier = await apiKeyStore.getTier(apiKey);
    return tier === 'pro' ? 10_000 : 100;
  },
  window: '1h',
}));
```

---

## 10. skipSuccessfulRequests — Login Protection (GAP-2, Phase B)

```typescript
app.use('/auth/login', rateLimitExpress({
  max: 10,
  window: '15m',
  skipSuccessfulRequests: true,  // successful logins don't count
}));
app.post('/auth/login', async (req, res) => {
  const ok = await verifyCredentials(req.body);
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials' });
  } else {
    res.json({ token: generateToken() });
  }
});
```

```bash
# 10 failed logins → 11th denied (429)
# Successful login doesn't consume quota — attacker can't block legitimate users
```

---

## 11. standardHeaders: 'draft-8' + identifier (GAP-5/6, Phase B)

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  standardHeaders: 'draft-8',
  identifier: 'public-api',
}));
```

```bash
curl -i http://localhost:3000/
# RateLimit-Limit: 100
# RateLimit-Remaining: 99
# RateLimit-Reset: 900
# RateLimit-Policy: public-api
```

---

## Verification Checklist

```bash
npm run typecheck   # no errors
npm run lint        # no warnings
npm run test        # all pass, ≥90% coverage
npm run build
npm pack --dry-run  # unpacked < 300 KB
```
