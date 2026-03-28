# Limiterx

Universal production-ready rate limiting for JavaScript/TypeScript. Works in Node.js, browsers, edge runtimes, and Bun.

## Features

- Three algorithms: fixed window, sliding window, and token bucket
- Zero runtime dependencies in core
- Backend adapters: Express, Node HTTP, Next.js (API + Edge), Koa
- Frontend adapters: React hook, fetch wrapper, Axios interceptor
- In-memory store with LRU eviction (default **10,000** keys)
- Optional Redis store (`limiterx/redis`) for multi-process deployments
- Standard `RateLimit-*` headers (RFC draft compliant)
- Tree-shakeable subpath exports (`sideEffects: false`)
- Dual ESM/CJS output
- TypeScript-first with strict types

## Installation

```bash
npm install limiterx
```

## Quick Start

### Express

```typescript
import express from 'express';
import { rateLimitExpress } from 'limiterx/express';

const app = express();

app.use(rateLimitExpress({
  max: 100,
  window: '15m',
}));

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello!' });
});

app.listen(3000);
```

### Next.js API Route

```typescript
import { rateLimitNext } from 'limiterx/next';

const limiter = rateLimitNext({ max: 20, window: '1m' });

export async function GET(req, res) {
  const result = await limiter.check(req, res);
  if (!result.allowed) return;
  return Response.json({ data: 'ok' });
}
```

### Next.js Edge Middleware

```typescript
import { rateLimitEdge } from 'limiterx/next';

export const middleware = rateLimitEdge({
  max: 10,
  window: '30s',
});

export const config = { matcher: ['/api/:path*'] };
```

### React Hook

```typescript
import { useRateLimit } from 'limiterx/react';

function SubmitButton() {
  const { allowed, remaining, attempt } = useRateLimit('form-submit', {
    max: 5,
    window: '1m',
  });

  return (
    <button onClick={() => attempt() && submitForm()} disabled={!allowed}>
      Submit ({remaining} left)
    </button>
  );
}
```

### Fetch Wrapper

```typescript
import { rateLimitFetch } from 'limiterx/fetch';

const guardedFetch = rateLimitFetch(fetch, {
  max: 10,
  window: '1m',
});

const res = await guardedFetch('https://api.example.com/data');
```

### Core API (No Framework)

```typescript
import { createRateLimiter } from 'limiterx';

const limiter = createRateLimiter({
  max: 100,
  window: '15m',
  onLimit: (result) => console.log(`Blocked: ${result.key}`),
});

const result = await limiter.check('user-123');
// { allowed: true, remaining: 99, limit: 100, retryAfter: 0, resetAt: Date, key: 'user-123' }
```

## Adapters

| Adapter | Import | Type |
|---------|--------|------|
| Express | `limiterx/express` | Backend middleware |
| Node HTTP | `limiterx/node` | Backend (developer-controlled response) |
| Next.js API | `limiterx/next` | Backend (API routes) |
| Next.js Edge | `limiterx/next` | Backend (Edge middleware) |
| Koa | `limiterx/koa` | Backend middleware |
| React | `limiterx/react` | Frontend hook |
| Fetch | `limiterx/fetch` | Frontend wrapper |
| Axios | `limiterx/axios` | Frontend interceptor |

## Configuration

All adapters share the same configuration shape:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number` | *required* | Max requests per window |
| `window` | `number \| string` | *required* | Duration: `'30s'`, `'5m'`, `'1h'`, `'1d'`, or milliseconds |
| `algorithm` | `'fixed-window' \| 'sliding-window' \| 'token-bucket'` | `'fixed-window'` | Rate limiting algorithm |
| `store` | `StorageAdapter` | `new MemoryStore()` | Custom storage backend |
| `keyGenerator` | `function` | IP (backend) / `'global'` (frontend) | Custom key resolver |
| `onLimit` | `function` | - | Callback when limit exceeded |
| `maxKeys` | `number` | `10000` | Max distinct keys in memory (LRU eviction) |
| `debug` | `boolean` | `false` | Console diagnostics |
| `skip` | `function` | - | Bypass rate limiting for certain requests |
| `message` | `string \| object \| function` | `'Too many requests'` | Response body on 429 (backend) |
| `statusCode` | `number` | `429` | HTTP status on deny (backend) |
| `headers` | `boolean` | `true` | Send rate limit headers (backend) |
| `legacyHeaders` | `boolean` | `false` | Also emit `X-RateLimit-*` headers |
| `passOnStoreError` | `boolean` | `false` | Allow requests through on storage errors (fail-open) |

### Algorithms

Use the `algorithm` option to select a rate limiting strategy:

```typescript
// Fixed window (default) — simple counter, resets on aligned wall-clock boundaries
app.use(rateLimitExpress({ max: 100, window: '15m', algorithm: 'fixed-window' }));

// Sliding window — weighted blend of previous and current window counts
// Eliminates burst-at-boundary spikes; higher memory usage (2 keys per tracked identity)
app.use(rateLimitExpress({ max: 100, window: '15m', algorithm: 'sliding-window' }));

// Token bucket — bucket starts full and refills at max/window rate
// Best for APIs with bursty-but-bounded traffic patterns
app.use(rateLimitExpress({ max: 100, window: '15m', algorithm: 'token-bucket' }));
```

| Algorithm | Burst allowance | Memory per key | Boundary spikes |
|-----------|----------------|----------------|-----------------|
| `fixed-window` | Full burst at window start | 1 key | Yes |
| `sliding-window` | Weighted blend | 2 keys | No |
| `token-bucket` | Burst up to `max`, then steady | 1 key | No |

### Custom Store

By default limiterx uses an in-memory LRU store. For multi-process or multi-server deployments, use Redis:

```typescript
import Redis from 'ioredis';
import { rateLimitExpress } from 'limiterx/express';
import { RedisStore } from 'limiterx/redis';

const client = new Redis({ host: 'localhost', port: 6379 });
const store = new RedisStore(client);

app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  store,
}));
```

`RedisStore` is compatible with both **ioredis** and **node-redis** (v4+). It uses a Lua script for atomic `INCR + EXPIRE` operations, ensuring correctness under concurrent load.

You can also provide any custom storage backend by implementing the `StorageAdapter` interface:

```typescript
import type { StorageAdapter } from 'limiterx';

class MyStore implements StorageAdapter {
  async get(key: string) { /* ... */ }
  async set(key: string, state: Record<string, number>, ttlMs: number) { /* ... */ }
  async increment(key: string, ttlMs: number): Promise<number> { /* ... */ }
  async delete(key: string) { /* ... */ }
  async clear() { /* ... */ }
}
```

### Window Strings

| Format | Example | Milliseconds |
|--------|---------|-------------|
| Milliseconds | `'500ms'` | 500 |
| Seconds | `'30s'` | 30,000 |
| Minutes | `'5m'` | 300,000 |
| Hours | `'1h'` | 3,600,000 |
| Days | `'1d'` | 86,400,000 |

## HTTP Headers

Backend adapters set standard rate limit headers on every response:

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 540
```

When denied (429), the `Retry-After` header is also set:

```
Retry-After: 540
```

Headers use integer values only. No `X-RateLimit-*` headers are emitted.

## Custom Key Generation

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  keyGenerator: (ctx) => ctx.req.user?.id || ctx.req.ip,
}));
```

## Error Handling

If `keyGenerator` throws, the error propagates:
- Backend adapters: 5xx response or framework error handler
- Frontend adapters: error thrown to caller
- The request is **not** treated as allowed or denied (429)

If `onLimit` throws, the error is silently swallowed.

## Debug Mode

> **Warning**: Debug output may include keys and IP addresses. Only enable in trusted environments.

```typescript
const limiter = createRateLimiter({
  max: 10,
  window: '1m',
  debug: true,
});
// Console: [limiterx] ALLOW key="user-123" count=1 remaining=9 (new window)
// Console: [limiterx] DENY key="user-123" count=10 max=10 retryAfter=45000ms
```

## TypeScript

Full TypeScript support with strict types:

```typescript
import type { LimiterxConfig, RateLimiterResult, RateLimiter } from 'limiterx';
```

## Publishing

This package is published to npm with provenance. To publish a new version:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit and tag: `git tag vX.Y.Z` (match `package.json`)
4. Push tag: `git push origin vX.Y.Z`
5. CI will publish automatically (requires `NPM_TOKEN` secret)

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0 (for type consumers)

## License

MIT
