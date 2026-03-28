# Contract: New Configuration Fields

**Feature**: `003-express-rate-limit-parity`
**Type**: Normative specification

This document defines the invariants, defaults, and validation rules for each new `LimiterxConfig` field introduced in spec-003.

---

## Phase A Fields

---

### `legacyHeaders`

| Property | Value |
|---|---|
| Type | `boolean` |
| Default | `false` |
| Applies to | All backend adapters (Express, Node, Koa, Next.js) |

**Behaviour:**
- When `true`: emit `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response (allowed or denied).
- When `false` (default): no `X-RateLimit-*` headers are sent. This preserves v1.0.x behaviour per spec-001 FR-009.
- Setting `legacyHeaders: true` does NOT disable the IETF standard `RateLimit-*` headers. Both sets are sent simultaneously.

**Invariants:**
1. `X-RateLimit-Reset` MUST be a Unix epoch timestamp in integer seconds — `Math.floor(result.resetAt.getTime() / 1000)`. It is NOT a relative countdown.
2. `X-RateLimit-Limit` and `X-RateLimit-Remaining` MUST equal their `RateLimit-*` counterparts.
3. Setting `headers: false` with `legacyHeaders: true` suppresses BOTH header sets (since `headers` gates all HTTP header emission).

**Validation:** Must be a boolean. Error: `[limiterx] Invalid config: 'legacyHeaders' must be a boolean`.

---

### `ipv6Subnet`

| Property | Value |
|---|---|
| Type | `number \| false` |
| Default | `56` |
| Applies to | Default `keyGenerator` in Express, Node, Koa, Next.js |

**Behaviour:**
- When a number `N` (1–128): applies a `/N` subnet mask to IPv6 addresses in the default `keyGenerator`. The top N bits are preserved; the remaining bits are zeroed. The masked address is used as the rate limit key.
- When `false`: no masking; raw `req.ip` (or equivalent) is used as the key.
- Has NO effect when a custom `keyGenerator` is provided — the masking logic lives in the default keyGenerator only.
- Has NO effect on IPv4 addresses (detected by absence of `:`). IPv4 addresses are returned unchanged.

**Invariants:**
1. IPv4 addresses MUST pass through unchanged regardless of `ipv6Subnet` value.
2. Two IPv6 addresses in the same `/N` subnet MUST produce the same key.
3. Two IPv6 addresses in different `/N` subnets MUST produce different keys.
4. `ipv6Subnet: false` MUST produce the same key as v1.0.x (verbatim `req.ip`).
5. The masking function MUST use only BigInt arithmetic — no `net` module, compatible with Edge Runtime.

**Validation:** Must be `false` or an integer in range `[1, 128]`. Error: `[limiterx] Invalid config: 'ipv6Subnet' must be false or an integer between 1 and 128`.

**Migration note:** Changing from v1.0.x to v1.2.x with the default `ipv6Subnet: 56` will produce different storage keys for IPv6 clients. Counters reset on deploy. This is intentional — it is a security fix.

---

### `requestPropertyName`

| Property | Value |
|---|---|
| Type | `string` |
| Default | `'rateLimit'` |
| Applies to | Express (on `req`), Koa (on `ctx`), Next.js API (on `req`). NOT `rateLimitEdge`. |

**Behaviour:**
- After `limiter.check(key)` resolves, the `RateLimiterResult` object is attached to the request context as `(req as any)[requestPropertyName]`.
- Skipped requests (where `skip()` returns true) do NOT get the property attached — no check was performed.
- Downstream middleware/handlers can safely read `req[requestPropertyName]` synchronously after this middleware runs.

**Invariants:**
1. The attached value MUST be the full `RateLimiterResult` object (all fields: `allowed`, `remaining`, `limit`, `retryAfter`, `resetAt`, `key`).
2. The property is attached regardless of whether the request was allowed or denied.
3. Setting an empty string is a validation error.

**Validation:** Must be a non-empty string. Error: `[limiterx] Invalid config: 'requestPropertyName' must be a non-empty string`.

---

### `passOnStoreError`

| Property | Value |
|---|---|
| Type | `boolean` |
| Default | `false` |
| Applies to | All adapters |

**Behaviour:**
- When `false` (default): if the storage layer throws during `check()`, the error propagates to `next(err)` (Express) / is thrown (Koa/Node) / is rethrown (fetch/axios). Request is blocked.
- When `true`: if the storage layer throws during `check()`, the error is silently swallowed and the request is allowed through as if the check succeeded. No rate limit headers are set.

**Invariants:**
1. When `passOnStoreError: true` and a store error occurs: `next()` is called WITHOUT an error argument. The response flows normally.
2. No rate limit headers are set on pass-through responses from store errors.
3. `onLimit` is NOT called on a store-error pass-through (no `result` is available).
4. The original store error is silently discarded — no logging, no propagation. Users who need error visibility should wrap their store with error-logging middleware.

**Validation:** Must be a boolean. Error: `[limiterx] Invalid config: 'passOnStoreError' must be a boolean`.

---

### `handler`

| Property | Value |
|---|---|
| Type | `(result: RateLimiterResult, ctx: RequestContext) => void \| Promise<void>` |
| Default | `undefined` |
| Applies to | All adapters |

**Behaviour:**
- When defined, `handler` is called instead of the adapter's built-in 429 response when a request is denied.
- `handler` is responsible for sending a response. If it does not, the request hangs.
- `onLimit` still fires before `handler`. This ordering is guaranteed.
- `handler` can be async; the adapter `await`s it.

**Invariants:**
1. When `handler` is defined: NO built-in 429 response is sent by the adapter.
2. `onLimit` (if also defined) fires BEFORE `handler`. Both are wrapped in try/catch; errors in either are silently swallowed.
3. `handler` receives the same `(result, ctx)` as `onLimit`.
4. When `handler` is `undefined`: built-in 429 behaviour is unchanged (backward compatible).

**Validation:** Must be a function. Error: `[limiterx] Invalid config: 'handler' must be a function`.

---

### Widened: `keyGenerator` and `skip`

**Before:**
```typescript
keyGenerator?: (ctx: RequestContext) => string
skip?: (ctx: RequestContext) => boolean
```

**After:**
```typescript
keyGenerator?: (ctx: RequestContext) => string | Promise<string>
skip?: (ctx: RequestContext) => boolean | Promise<boolean>
```

**Invariants:**
1. Sync functions continue to work without change.
2. Async functions are `await`-ed. The adapter's outer function is already async in all cases.
3. A rejected keyGenerator promise propagates to `next(err)` (same as a throwing sync keyGenerator — maintains FR-019).
4. A rejected skip promise propagates to `next(err)` as well.

---

### Widened: `message`

**Before:** `string | object`
**After:** `string | object | ((result: RateLimiterResult, ctx: RequestContext) => string | object | Promise<string | object>)`

**Invariants:**
1. String value: sent as `Content-Type: text/plain`.
2. Object value: sent as `Content-Type: application/json`.
3. Function value: called with `(result, ctx)`, awaited, and the resolved value is sent using the same rules (1 or 2 above).
4. Errors thrown by the message function propagate to `next(err)`.

---

## Phase B Fields

---

### `max` (widened)

**Before:** `number`
**After:** `number | ((ctx: RequestContext) => number | Promise<number>)`

**Invariants:**
1. When a function, it is resolved per-request before calling the algorithm.
2. The resolved value MUST be a positive integer at check time (not validated eagerly — checked at call time only in debug mode).
3. At core level, `ctx` only contains `{ key }`. Richer context requires custom keyGenerator-embedding or adapter-level `max` functions.
4. A throwing `max` function propagates to `next(err)`.

---

### `skipSuccessfulRequests` / `skipFailedRequests`

| Property | Value |
|---|---|
| `skipSuccessfulRequests` | `boolean`, default `false` |
| `skipFailedRequests` | `boolean`, default `false` |
| `requestWasSuccessful` | `(ctx: RequestContext) => boolean \| Promise<boolean>`, default: `statusCode < 400` |

**Invariants:**
1. The counter is first incremented (at middleware time), then optionally decremented (at response finish time). The net effect of decrement is "request was not counted."
2. Decrement fires on `res.on('finish')` (Express/Node) or `ctx.res.on('finish')` (Koa).
3. If the rate limit window has already rolled over when `finish` fires, `decrement` on a missing/expired key is a no-op.
4. If the request was denied (counter not incremented), no `finish` hook is registered.
5. Not supported in `rateLimitEdge` — explicit documentation and no silent failure.

---

### `standardHeaders`

| Value | Header format |
|---|---|
| `'draft-7'` (default) | Separate `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` |
| `'draft-6'` | Single `RateLimit: limit=N, remaining=N, reset=T` |
| `'draft-8'` | draft-7 + `RateLimit-Policy` |

---

### `identifier`

| Property | Value |
|---|---|
| Type | `string \| ((ctx: RequestContext) => string)` |
| Default | Auto-generated: `"{limit};w={windowSec}"` |
| Applies to | `standardHeaders: 'draft-8'` only |

---

### `validate`

| Property | Value |
|---|---|
| Type | `boolean \| Record<string, boolean>` |
| Default | `true` |

Named check IDs: `'windowMs'`, `'trustProxy'`, `'positiveHits'`.
Each check fires `console.warn('[limiterx:validate] …')` at most once per check name per process.
