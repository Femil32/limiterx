# limiterx

[![CI](https://github.com/Femil32/limiterx/actions/workflows/ci.yml/badge.svg)](https://github.com/Femil32/limiterx/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/limiterx.svg)](https://www.npmjs.com/package/limiterx)
[![npm downloads](https://img.shields.io/npm/dw/limiterx.svg)](https://www.npmjs.com/package/limiterx)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/limiterx)](https://bundlephobia.com/package/limiterx)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.npmjs.com/package/limiterx)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

Universal production-ready rate limiting for JavaScript/TypeScript. Works in Node.js, browsers, edge runtimes, and Bun.

---

## Why limiterx?

| Feature | limiterx | express-rate-limit | rate-limiter-flexible |
|---|---|---|---|
| Algorithms | fixed window, sliding window, token bucket | fixed window only | many |
| Adapters | Express, Koa, Node HTTP, Next.js (API + Edge), React, fetch, Axios | Express only | manual integration |
| Edge Runtime support | ✅ (Next.js middleware, no Node built-ins) | ❌ | ❌ |
| React / browser | ✅ hook + fetch + Axios | ❌ | ❌ |
| Redis built-in | ✅ (`limiterx/redis`) | via plugin | ✅ |
| Dynamic `max` per request | ✅ async function | ✅ | manual |
| Zero runtime dependencies | ✅ | ✅ | ❌ |
| IETF `RateLimit-*` headers | ✅ (draft-6/7/8) | ✅ | manual |
| TypeScript-first | ✅ strict types | partial | partial |
| Tree-shakeable | ✅ subpath imports | ❌ | ❌ |

---

## Features

- Three algorithms: fixed window, sliding window, and token bucket
- Zero runtime dependencies in core
- Backend adapters: Express, Node HTTP, Next.js (API + Edge), Koa
- Frontend adapters: React hook, fetch wrapper, Axios interceptor
- In-memory store with LRU eviction (default **10,000** keys)
- Optional Redis store (`limiterx/redis`) for multi-process deployments
- Standard `RateLimit-*` headers (IETF draft-6, draft-7, draft-8 selectable)
- Optional legacy `X-RateLimit-*` headers for GitHub/Twitter API compatibility
- Dynamic `max` as async function — per-user tier limits
- `skipSuccessfulRequests` / `skipFailedRequests` — only count what matters
- Custom `handler` — replace built-in 429 response entirely
- IPv6 subnet masking (default /56) for fair per-user tracking
- Tree-shakeable subpath exports (`sideEffects: false`)
- Dual ESM/CJS output
- TypeScript-first with strict types

---

## Installation

```bash
npm install limiterx
```

---

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

### Koa

```typescript
import Koa from 'koa';
import { rateLimitKoa } from 'limiterx/koa';

const app = new Koa();

app.use(rateLimitKoa({
  max: 100,
  window: '15m',
}));

app.use((ctx) => {
  ctx.body = { message: 'Hello!' };
});

app.listen(3000);
```

### Node HTTP

```typescript
import http from 'http';
import { rateLimitNode } from 'limiterx/node';

const limiter = rateLimitNode({ max: 100, window: '15m' });

http.createServer(async (req, res) => {
  const result = await limiter(req, res);
  if (!result.allowed) {
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end('Too many requests');
    return;
  }
  res.writeHead(200);
  res.end('Hello!');
}).listen(3000);
```

### Next.js API Route

```typescript
import { rateLimitNext } from 'limiterx/next';

const limiter = rateLimitNext({ max: 20, window: '1m' });

export async function GET(req: Request) {
  const result = await limiter.check(req);
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

### Axios Interceptor

```typescript
import axios from 'axios';
import { rateLimitAxios } from 'limiterx/axios';

const client = axios.create();

rateLimitAxios(client, {
  max: 10,
  window: '1m',
});

// Throws RateLimitError when limit exceeded
const res = await client.get('https://api.example.com/data');
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

---

## Adapters

| Adapter | Import | Type | Default key |
|---------|--------|------|-------------|
| Express | `limiterx/express` | Backend middleware | `req.ip` (IPv6 /56) |
| Node HTTP | `limiterx/node` | Backend (developer-controlled response) | `req.socket.remoteAddress` |
| Next.js API | `limiterx/next` | Backend (API routes) | `req.ip` or `x-forwarded-for` |
| Next.js Edge | `limiterx/next` | Backend (Edge middleware) | `req.ip` or `x-forwarded-for` |
| Koa | `limiterx/koa` | Backend middleware | `ctx.ip` (IPv6 /56) |
| React | `limiterx/react` | Frontend hook | key param |
| Fetch | `limiterx/fetch` | Frontend wrapper | `'global'` |
| Axios | `limiterx/axios` | Frontend interceptor | `'global'` |

---

## Configuration

All adapters share the same configuration shape:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number \| (ctx) => number \| Promise<number>` | *required* | Max requests per window. Pass a function for per-user tiers. |
| `window` | `number \| string` | *required* | Duration: `'30s'`, `'5m'`, `'1h'`, `'1d'`, or milliseconds |
| `algorithm` | `'fixed-window' \| 'sliding-window' \| 'token-bucket'` | `'fixed-window'` | Rate limiting algorithm |
| `store` | `StorageAdapter` | `new MemoryStore()` | Custom storage backend |
| `keyGenerator` | `(ctx) => string \| Promise<string>` | IP (backend) / `'global'` (frontend) | Custom key resolver (supports async) |
| `skip` | `(ctx) => boolean \| Promise<boolean>` | - | Bypass rate limiting for certain requests (supports async) |
| `onLimit` | `(result, ctx) => void` | - | Callback when limit exceeded |
| `handler` | `(result, ctx) => void \| Promise<void>` | - | Replaces built-in 429 response entirely; `onLimit` fires first |
| `message` | `string \| object \| (result, ctx) => string \| object \| Promise<…>` | `'Too many requests'` | Response body on 429 (backend) |
| `statusCode` | `number` | `429` | HTTP status on deny (backend) |
| `headers` | `boolean` | `true` | Master gate for all rate limit headers |
| `standardHeaders` | `'draft-6' \| 'draft-7' \| 'draft-8'` | `'draft-6'` | IETF `RateLimit-*` header format |
| `legacyHeaders` | `boolean` | `false` | Also emit `X-RateLimit-*` headers (epoch timestamp for Reset) |
| `requestPropertyName` | `string` | `'rateLimit'` | Property on `req`/`ctx` where result is attached for downstream middleware |
| `skipSuccessfulRequests` | `boolean` | `false` | Don't count requests with 2xx/3xx responses |
| `skipFailedRequests` | `boolean` | `false` | Don't count requests with 4xx/5xx responses |
| `requestWasSuccessful` | `(ctx) => boolean \| Promise<boolean>` | status < 400 | Custom success predicate for skip* options |
| `passOnStoreError` | `boolean` | `false` | Allow requests through on storage errors (fail-open) |
| `ipv6Subnet` | `number \| false` | `56` | IPv6 subnet prefix length for masking; `false` to disable |
| `maxKeys` | `number` | `10000` | Max distinct keys in memory (LRU eviction) |
| `debug` | `boolean` | `false` | Console diagnostics |
| `validate` | `boolean \| Record<string, boolean>` | `true` | Runtime config validation warnings; `false` to silence all |

---

## Algorithms

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

---

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

`RateLimit-Reset` is a **relative** countdown in seconds (IETF standard).

### Legacy headers

Enable `X-RateLimit-*` headers for compatibility with clients expecting the GitHub/Twitter convention:

```typescript
rateLimitExpress({ max: 100, window: '15m', legacyHeaders: true });
// X-RateLimit-Limit: 100
// X-RateLimit-Remaining: 95
// X-RateLimit-Reset: 1711234567   ← absolute Unix epoch (seconds)
```

Set `headers: false` to suppress **all** rate limit headers.

---

## Advanced Usage

### Dynamic max (per-user tier limits)

```typescript
app.use(rateLimitExpress({
  max: async (ctx) => {
    const user = await getUserFromDb(ctx.req.user?.id);
    return user?.isPro ? 1000 : 100;
  },
  window: '15m',
}));
```

### skipSuccessfulRequests / skipFailedRequests

```typescript
// Only count failed login attempts (4xx/5xx), not successful ones
app.use('/login', rateLimitExpress({
  max: 5,
  window: '15m',
  skipSuccessfulRequests: true,
}));

// Custom success predicate
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  skipSuccessfulRequests: true,
  requestWasSuccessful: (ctx) => ctx.res.statusCode < 400,
}));
```

### Custom handler

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  handler: (result, ctx) => {
    ctx.res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfter,
      resetAt: result.resetAt,
    });
  },
}));
```

### Async keyGenerator

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  keyGenerator: async (ctx) => {
    const apiKey = ctx.req.headers['x-api-key'];
    if (apiKey) return `api:${apiKey}`;
    return ctx.req.ip;
  },
}));
```

### Async skip

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  skip: async (ctx) => {
    return isInternalIp(ctx.req.ip);
  },
}));
```

### requestPropertyName

```typescript
// Access rate limit result in downstream middleware/routes
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  requestPropertyName: 'rateLimit',  // default
}));

app.get('/status', (req, res) => {
  res.json({ remaining: req.rateLimit.remaining });
});
```

### IPv6 subnet masking

```typescript
// Default: /56 mask groups IPv6 addresses into subnets
// Increase to /48 for broader grouping, or disable entirely
rateLimitExpress({ max: 100, window: '15m', ipv6Subnet: 48 });
rateLimitExpress({ max: 100, window: '15m', ipv6Subnet: false }); // exact match
```

---

## Redis Store

For multi-process or multi-server deployments, use `RedisStore` to share counters:

```typescript
import Redis from 'ioredis';
import { rateLimitExpress } from 'limiterx/express';
import { RedisStore } from 'limiterx/redis';

const client = new Redis({ host: 'localhost', port: 6379 });
const store = new RedisStore(client);

app.use(rateLimitExpress({ max: 100, window: '15m', store }));
```

`RedisStore` is compatible with both **ioredis** and **node-redis** (v4+). It uses a Lua script for atomic `INCR + EXPIRE` operations, ensuring correctness under concurrent load.

---

## Custom Storage Adapter

Implement the `StorageAdapter` interface to use any storage backend:

```typescript
import type { StorageAdapter } from 'limiterx';

class MyStore implements StorageAdapter {
  async get(key: string) { /* ... */ }
  async set(key: string, state: Record<string, number>, ttlMs: number) { /* ... */ }
  async increment(key: string, ttlMs: number): Promise<number> { /* ... */ }
  async decrement(key: string, ttlMs: number): Promise<void> { /* ... */ }
  async delete(key: string) { /* ... */ }
  async clear() { /* ... */ }
}
```

---

## Public API — `decrement()`

The `RateLimiter` object returned by `createRateLimiter` exposes a `decrement()` method. Use it when you want to "un-count" a request after the fact — for example, implementing `skipSuccessfulRequests` manually in Node HTTP where the response status is only known after the handler runs:

```typescript
const limiter = createRateLimiter({ max: 100, window: '15m' });

const result = await limiter.check('user-123');
if (!result.allowed) { /* send 429 */ return; }

// ... run handler, then check response status
if (responseWasSuccessful) {
  await limiter.decrement('user-123');
}
```

`decrement` is a no-op if the key is missing or expired (floor at 0).

---

## Window Strings

| Format | Example | Milliseconds |
|--------|---------|-------------|
| Milliseconds | `'500ms'` | 500 |
| Seconds | `'30s'` | 30,000 |
| Minutes | `'5m'` | 300,000 |
| Hours | `'1h'` | 3,600,000 |
| Days | `'1d'` | 86,400,000 |

---

## Error Handling

If `keyGenerator` throws, the error propagates:
- Backend adapters: 5xx response or framework error handler
- Frontend adapters: error thrown to caller
- The request is **not** treated as allowed or denied (429)

If `onLimit` throws, the error is silently swallowed.

---

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

---

## TypeScript

Full TypeScript support with strict types:

```typescript
import type { LimiterxConfig, RateLimiterResult, RateLimiter, StorageAdapter } from 'limiterx';
```

---

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0 (for type consumers)

---

## License

MIT
