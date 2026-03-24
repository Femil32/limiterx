# Quickstart: Limiterx

**Feature Branch**: `001-production-readiness`  
**Date**: 2026-03-23

## Prerequisites

- Node.js ≥ 18.0.0
- npm, yarn, or pnpm

## Installation

```bash
npm install limiterx
```

## 1. Express API Protection (Backend)

Protect your Express API with rate limiting in 3 lines:

```typescript
import express from 'express';
import { rateLimitExpress } from 'limiterx/express';

const app = express();

app.use(rateLimitExpress({
  max: 100,
  window: '15m'
}));

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello!' });
});

app.listen(3000);
```

Every response includes rate limit headers:
```
RateLimit-Limit: 100
RateLimit-Remaining: 99
RateLimit-Reset: 900
```

When the limit is exceeded, clients receive:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 540
Content-Type: text/plain

Too many requests
```

## 2. Next.js API Route (Backend)

```typescript
// app/api/data/route.ts
import { rateLimitNext } from 'limiterx/next';

const limiter = rateLimitNext({ max: 20, window: '1m' });

export async function GET(req, res) {
  const result = await limiter.check(req, res);
  if (!result.allowed) return;
  return Response.json({ data: 'ok' });
}
```

## 3. Next.js Edge Middleware (Backend)

```typescript
// middleware.ts
import { rateLimitEdge } from 'limiterx/next';

export const middleware = rateLimitEdge({
  max: 10,
  window: '30s'
});

export const config = { matcher: ['/api/:path*'] };
```

## 4. React Hook (Frontend)

Limit user actions client-side with reactive state:

```typescript
import { useRateLimit } from 'limiterx/react';

function SubmitButton() {
  const { allowed, remaining, attempt } = useRateLimit('form-submit', {
    max: 5,
    window: '1m'
  });

  return (
    <button onClick={() => attempt() && submitForm()} disabled={!allowed}>
      Submit ({remaining} left)
    </button>
  );
}
```

## 5. Fetch Wrapper (Frontend)

Guard outgoing fetch requests:

```typescript
import { rateLimitFetch } from 'limiterx/fetch';

const guardedFetch = rateLimitFetch(fetch, {
  max: 10,
  window: '1m'
});

const res = await guardedFetch('https://api.example.com/data');
```

## Configuration Options

All adapters share the same config shape:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number` | *required* | Max requests per window |
| `window` | `number \| string` | *required* | Window duration (`'30s'`, `'5m'`, `'1h'`, or ms) |
| `keyGenerator` | `function` | IP (backend) / `'global'` (frontend) | Custom key for identifying requesters |
| `onLimit` | `function` | — | Callback when limit is exceeded |
| `maxKeys` | `number` | `10000` | Max distinct keys for internal LRU (memory safety) |
| `debug` | `boolean` | `false` | Console diagnostics when `true` (`spec.md` FR-018) |
| `skip` | `function` | — | Bypass rate limiting for certain requests |
| `message` | `string \| object` | `'Too many requests'` | Response body on 429 (backend only) |
| `statusCode` | `number` | `429` | HTTP status on deny (backend only) |
| `headers` | `boolean` | `true` | Send rate limit headers (backend only) |

v1.0 always uses the built-in in-memory store; custom storage backends are not configurable (see `spec.md`).

## Custom Key Generation

Rate limit by user ID instead of IP:

```typescript
app.use(rateLimitExpress({
  max: 100,
  window: '15m',
  keyGenerator: (ctx) => ctx.req.user?.id || ctx.req.ip
}));
```

## Handling Limit Events

Log or alert when limits are hit:

```typescript
const limiter = createRateLimiter({
  max: 10,
  window: '1m',
  onLimit: (result) => {
    console.warn(`Rate limit hit for ${result.key}`);
    console.warn(`Retry in ${Math.ceil(result.retryAfter / 1000)}s`);
  }
});
```

## TypeScript

Full TypeScript support with strict types — all config options are autocompleted in your IDE:

```typescript
import type { LimiterxConfig, RateLimiterResult } from 'limiterx';
```

## Next Steps

- See the [full API documentation](./contracts/core-api.md) for detailed method signatures
- Check [backend adapters](./contracts/backend-adapters.md) for Express, Node HTTP, Next.js, and Koa details
- Check [frontend adapters](./contracts/frontend-adapters.md) for React hook, fetch, and Axios details
