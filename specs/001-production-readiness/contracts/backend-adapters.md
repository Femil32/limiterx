# Contract: Backend Adapters

**Feature Branch**: `001-production-readiness`  
**Date**: 2026-03-23

## Common Backend Adapter Behavior

All backend adapters share these guarantees:

1. **Config shape**: Accept `LimiterxConfig` (same as core) with adapter-specific defaults for `keyGenerator`.
2. **HTTP headers on every response** (when `config.headers !== false`):
   - `RateLimit-Limit: {max}` (integer)
   - `RateLimit-Remaining: {remaining}` (integer, >= 0)
   - `RateLimit-Reset: {seconds}` (integer, seconds until window resets)
3. **On limit exceeded** (when `allowed === false`):
   - Response status: `config.statusCode` (default `429`)
   - Response header: `Retry-After: {seconds}` (integer)
   - Response body: `config.message` (default `'Too many requests'`)
   - `config.onLimit` callback fires (errors caught and swallowed)
4. **Key generation default**: `req.ip` or equivalent IP extraction (adapter-specific)
5. **Skip support**: If `config.skip(context)` returns `true`, request passes through **without** incrementing count and **`onLimit` does not fire** for that request. Rate limit headers are still set when `config.headers !== false` (same as `spec.md` Session 2026-03-23 (b)).
6. **Header value safety**: All header values coerced via `Math.ceil()` to integers; no string interpolation from user input

---

## `limiterx/express` — Express Middleware

### `rateLimitExpress(config: LimiterxConfig): express.RequestHandler`

**Signature**:
```typescript
import { rateLimitExpress } from 'limiterx/express';

function rateLimitExpress(config: LimiterxConfig): (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => Promise<void>;
```

**Behavior**:
- Default `keyGenerator`: `(ctx) => ctx.req.ip || '127.0.0.1'`
- Calls `next()` when request is allowed
- Sends response and does NOT call `next()` when request is denied
- Sets headers on `res` before calling `next()` or sending 429

**Example**:
```typescript
import express from 'express';
import { rateLimitExpress } from 'limiterx/express';

const app = express();
app.use(rateLimitExpress({ max: 100, window: '15m' }));
```

---

## `limiterx/node` — Raw Node.js HTTP

### `rateLimitNode(config: LimiterxConfig): NodeRateLimiter`

**Signature**:
```typescript
import { rateLimitNode } from 'limiterx/node';

interface NodeRateLimiter {
  check(req: http.IncomingMessage, res: http.ServerResponse): Promise<RateLimiterResult>;
}

function rateLimitNode(config: LimiterxConfig): NodeRateLimiter;
```

**Behavior**:
- Returns an object with `check()` instead of middleware — the developer controls the response flow
- `check()` sets rate limit headers on `res` automatically
- Does NOT send 429 response — the developer decides how to respond based on `result.allowed`
- Default `keyGenerator`: extracts IP from `req.socket.remoteAddress`

**Example**:
```typescript
import http from 'http';
import { rateLimitNode } from 'limiterx/node';

const limiter = rateLimitNode({ max: 50, window: '1m' });

http.createServer(async (req, res) => {
  const result = await limiter.check(req, res);
  if (!result.allowed) {
    res.writeHead(429);
    res.end('Too Many Requests');
    return;
  }
  res.end('OK');
}).listen(3000);
```

---

## `limiterx/next` — Next.js API Routes + Edge Middleware

### `rateLimitNext(config: LimiterxConfig): NextRateLimiter`

For API routes (Pages Router and App Router):

**Signature**:
```typescript
import { rateLimitNext } from 'limiterx/next';

interface NextRateLimiter {
  check(req: NextApiRequest, res: NextApiResponse): Promise<RateLimiterResult>;
}

function rateLimitNext(config: LimiterxConfig): NextRateLimiter;
```

**Behavior**:
- `check()` sets rate limit headers and sends 429 response when denied
- When denied, returns `result` with `allowed: false` — the handler should `return` immediately
- Default `keyGenerator`: extracts IP from `req.headers['x-forwarded-for']` or `req.socket.remoteAddress`

### `rateLimitEdge(config: LimiterxConfig): (request: NextRequest) => Promise<Response | undefined>`

For Edge Middleware:

**Signature**:
```typescript
import { rateLimitEdge } from 'limiterx/next';

function rateLimitEdge(config: LimiterxConfig): (
  request: NextRequest
) => Promise<Response | undefined>;
```

**Behavior**:
- Returns `undefined` when request is allowed (middleware continues to origin)
- Returns a `Response` with 429 status when request is denied
- Rate limit headers set on the returned Response
- Default `keyGenerator`: `request.ip || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'`
- Uses `MemoryStore` by default (state is per-isolate in edge runtime — documented limitation)

---

## `limiterx/koa` — Koa Middleware

### `rateLimitKoa(config: LimiterxConfig): koa.Middleware`

**Signature**:
```typescript
import { rateLimitKoa } from 'limiterx/koa';

function rateLimitKoa(config: LimiterxConfig): (
  ctx: koa.Context,
  next: koa.Next
) => Promise<void>;
```

**Behavior**:
- Default `keyGenerator`: `(context) => context.ctx.ip`
- Sets headers on `ctx.response`
- On deny: sets `ctx.status = 429`, `ctx.body = config.message`, does NOT call `next()`
- On allow: calls `await next()`

**Example**:
```typescript
import Koa from 'koa';
import { rateLimitKoa } from 'limiterx/koa';

const app = new Koa();
app.use(rateLimitKoa({ max: 60, window: '1m' }));
```
