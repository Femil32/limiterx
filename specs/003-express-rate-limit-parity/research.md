# Research: express-rate-limit Feature Parity Analysis

**Feature**: `003-express-rate-limit-parity`
**Phase**: 0 — Research
**Date**: 2026-03-27
**Source**: https://github.com/express-rate-limit/express-rate-limit (v7.x)

---

## Overview

`express-rate-limit` is the most widely adopted Express rate limiting library (~519k dependent packages, 3.2k GitHub stars). This document performs a full feature gap analysis — every option and behaviour it provides, cross-referenced against what `limiterx` currently ships or has on its roadmap.

---

## Feature Gap Table

| # | Feature | express-rate-limit | limiterx current | limiterx roadmap | Gap? |
|---|---|---|---|---|---|
| 1 | Fixed window algorithm | ✅ | ✅ | — | None |
| 2 | Sliding window algorithm | ❌ (fixed only) | ❌ | ✅ spec-002 | None (we're ahead) |
| 3 | Token bucket algorithm | ❌ | ❌ | ✅ spec-002 | None (we're ahead) |
| 4 | Static `max`/`limit` per window | ✅ | ✅ | — | None |
| 5 | **Dynamic `limit` (function/async)** | ✅ | ❌ | ❌ | **GAP** |
| 6 | Custom `keyGenerator` (sync/async) | ✅ | ✅ sync only | — | Partial (no async) |
| 7 | `skip` function (conditional bypass) | ✅ sync/async | ✅ sync only | — | **Partial (no async)** |
| 8 | **`skipSuccessfulRequests`** | ✅ | ❌ | ❌ | **GAP** |
| 9 | **`skipFailedRequests`** | ✅ | ❌ | ❌ | **GAP** |
| 10 | **`requestWasSuccessful` custom fn** | ✅ | ❌ | ❌ | **GAP** |
| 11 | `onLimit` / `handler` callback | ✅ full `handler(req, res, next, opts)` | ✅ `onLimit(result, ctx)` only | — | Partial (`handler` is richer) |
| 12 | `message` as string or object | ✅ | ✅ | — | None |
| 13 | **`message` as function (sync/async)** | ✅ | ❌ | ❌ | **GAP** |
| 14 | Custom `statusCode` | ✅ | ✅ | — | None |
| 15 | **`legacyHeaders` (X-RateLimit-\*)** | ✅ default on | ❌ | ❌ | **GAP** |
| 16 | Standard IETF headers (draft-6/7/8) | ✅ all three drafts | ✅ one format | — | Partial (only one draft) |
| 17 | **`identifier` (RateLimit-Policy name)** | ✅ draft-8 | ❌ | ❌ | **GAP** |
| 18 | **`ipv6Subnet` masking** | ✅ default 56-bit | ❌ | ❌ | **GAP** |
| 19 | **`requestPropertyName`** (attach info to req) | ✅ default `req.rateLimit` | ❌ | ❌ | **GAP** |
| 20 | **`passOnStoreError` (fail-open mode)** | ✅ | ❌ (always fail-closed) | ❌ | **GAP** |
| 21 | Custom external store (Redis, etc.) | ✅ | ❌ | ✅ spec-002 | Roadmapped |
| 22 | **`validate` config (named runtime checks)** | ✅ per-check toggles | ❌ | ❌ | **GAP** |
| 23 | **`windowMs` bounds documentation** | ✅ 28.4-day max | ❌ not documented | ❌ | **GAP (docs/validation)** |
| 24 | TypeScript support | ✅ 100% TS | ✅ 100% TS | — | None |
| 25 | ESM + CJS dual output | ✅ | ✅ | — | None |
| 26 | Distributed store support | ✅ | Roadmap | ✅ spec-002 | Roadmapped |
| 27 | React / frontend adapter | ❌ Express-only | ✅ | — | None (we're ahead) |
| 28 | Koa / Next.js adapters | ❌ Express-only | ✅ | — | None (we're ahead) |
| 29 | fetch / axios adapters | ❌ | ✅ | — | None (we're ahead) |
| 30 | **Async `onLimit`/`handler`** | ✅ | ❌ | ❌ | **GAP** |

**Summary: 11 confirmed gaps, 2 partial gaps, 5 areas where limiterx is ahead.**

---

## Detailed Gap Analysis

### GAP-1: Dynamic `limit` (per-request function)

**express-rate-limit behaviour:**
```typescript
rateLimit({
  limit: async (req, res) => {
    const user = await getUser(req);
    return user.isPremium ? 1000 : 100;
  }
})
```
`limit` can be a sync or async function receiving `(req, res)`. Evaluated on every request.

**limiterx current behaviour:** `max` is validated as a positive integer at construction time. The value is fixed for the lifetime of the limiter instance.

**Impact:** Cannot implement per-user tiers, API key based quotas, or A/B-tested limits without creating multiple limiter instances and routing manually.

**R&D notes:**
- The simplest implementation: change `max` to accept `number | (ctx: RequestContext) => number | Promise<number>`.
- `validateConfig` would need to handle the function case; validation of the resolved value happens at check time.
- The algorithm's `check()` receives `max` from the limiter, so `FixedWindowLimiter` needs to accept per-call `max` or limiter needs to resolve before calling.
- **Design question:** Should dynamic max be per-call (stored alongside the key) or resolved once and fixed per limiter instance? express-rate-limit resolves per-call.
- **Risk:** Dynamic max can create inconsistency when max changes mid-window. Document this.

---

### GAP-2: `skipSuccessfulRequests` / `skipFailedRequests`

**express-rate-limit behaviour:**
- `skipSuccessfulRequests: true` — After response is sent, if status < 400, decrement the counter (i.e., don't count it).
- `skipFailedRequests: true` — After response, if status >= 400 or connection error, decrement.
- `requestWasSuccessful: (req, res) => boolean` — Override the success determination.

**How it works technically:** express-rate-limit hooks `res.on('finish')` (or `res.on('close')`) to check the final status code after the response is written, then decrements the store counter if the request matched the skip condition.

**limiterx current behaviour:** All requests are counted at the point the middleware runs — no post-response decrement exists.

**Impact:** Cannot implement "only rate limit failed login attempts" or "don't penalise health-check 200s" patterns.

**R&D notes:**
- Implementation requires a post-response hook. In Express this is `res.on('finish', cb)`.
- The `StorageAdapter` needs a `decrement(key, ttlMs): Promise<void>` method (or reuse `set` with `count - 1`).
- This is Express-specific (the `node.ts` adapter could also support it via a callback). Koa uses `ctx.res.on('finish')`.
- **Design question:** Should this be in `LimiterxConfig` (cross-adapter) or Express-adapter-only? Since it depends on response status, it's inherently HTTP-response-aware. Cross-adapter makes sense if `RequestContext` is extended with a `getStatusCode()` accessor.
- **Risk:** Race condition if `res.finish` fires after window resets. Increment and decrement must be within the same window.

---

### GAP-3: `message` as function (dynamic response body)

**express-rate-limit behaviour:**
```typescript
rateLimit({
  message: async (req, res) => ({
    error: 'Rate limited',
    resetAt: new Date(res.getHeader('RateLimit-Reset') as number * 1000)
  })
})
```

**limiterx current behaviour:** `message` must be a `string | object`. Validated as such in `validateConfig`.

**Impact:** Cannot build dynamic error responses that include request-specific context (e.g., user name, retry time formatted by locale).

**R&D notes:**
- Type change: `message?: string | object | ((result: RateLimiterResult, ctx: RequestContext) => string | object | Promise<string | object>)`.
- `validateConfig` check: `typeof message === 'function'` is valid.
- Adapter resolution: each backend adapter calls `resolveMessage(message, result, ctx)` before sending.
- Low complexity, isolated change.

---

### GAP-4: `legacyHeaders` (X-RateLimit-\* headers)

**express-rate-limit behaviour:**
- `legacyHeaders: true` (default) sends `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix timestamp seconds), and `Retry-After` (seconds) on rate-limited responses.
- These are the de-facto headers used by GitHub API, Twitter API, and most documented rate limiting integrations.

**limiterx current behaviour:** `setRateLimitHeadersFull` sends `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After` — these are IETF standard headers, not legacy `X-RateLimit-*`.

**Impact:** Clients and monitoring tools that parse `X-RateLimit-*` headers (the vast majority) get no data. Many API clients use `X-RateLimit-Remaining` by convention.

**R&D notes:**
- `rate-limit-headers.ts` needs a second export or an option flag: `legacyHeaders: boolean`.
- When true, also set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (as Unix seconds integer).
- `Retry-After` is already sent on denied responses; this is correct for both header styles.
- **Config addition:** `legacyHeaders?: boolean` (default `true` for compatibility, or `false` to match current behaviour — this decision has a compatibility trade-off).
- Low risk, self-contained change to `rate-limit-headers.ts`.

---

### GAP-5: IETF `standardHeaders` draft versions (draft-6/7/8)

**express-rate-limit behaviour:**
- `standardHeaders: 'draft-6'` → single `RateLimit` header (object form)
- `standardHeaders: 'draft-7'` → separate `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- `standardHeaders: 'draft-8'` → same as draft-7 + `RateLimit-Policy` header

**limiterx current behaviour:** Sends draft-7-style headers unconditionally (separate `RateLimit-*` fields). No `RateLimit-Policy`.

**Impact:** Consumers targeting draft-6 clients or needing `RateLimit-Policy` for policy auditing cannot configure the format.

**R&D notes:**
- Add `standardHeaders?: 'draft-6' | 'draft-7' | 'draft-8'` config option.
- `rate-limit-headers.ts` branches on the format.
- draft-8 needs `identifier` (GAP-6) for `RateLimit-Policy`.
- Medium complexity; mostly header formatting logic.

---

### GAP-6: `identifier` (RateLimit-Policy header name)

**express-rate-limit behaviour:**
```
RateLimit-Policy: 100;w=900
```
The `identifier` names the quota policy. Default is `{limit}-in-{window}ms` format.

**limiterx current behaviour:** No `RateLimit-Policy` header is sent.

**R&D notes:**
- New config field: `identifier?: string | ((ctx: RequestContext) => string)`.
- Only relevant when `standardHeaders: 'draft-8'`.
- Default: auto-generate from `max` and `windowMs` (e.g., `"100;w=900"`).

---

### GAP-7: `ipv6Subnet` masking

**express-rate-limit behaviour:**
- Default: `ipv6Subnet: 56` — masks the last 8 bits of the 64-bit interface portion of IPv6 addresses.
- Prevents attackers from cycling through `/128` addresses in the same `/56` subnet to bypass per-IP limits.
- Can be disabled with `false` or set to any 32–64 bit value.
- Applied in the default `keyGenerator`; if a custom `keyGenerator` is provided, `ipv6Subnet` is ignored.

**limiterx current behaviour:** The default key generator uses `req.ip` verbatim. A full `/128` IPv6 address becomes the key, making subnet cycling trivially exploitable.

**Impact:** Security gap — an attacker with a standard /64 IPv6 allocation (~18 quintillion addresses) can bypass any per-IP rate limit.

**R&D notes:**
- New config field: `ipv6Subnet?: number | false` (default `56`).
- Implementation: detect if IP is IPv6, apply bitwise mask using Node's `net` module (or manual bit manipulation for edge runtimes).
- Apply only in the default `keyGenerator` — if the user supplies a custom `keyGenerator`, leave it to them.
- **Edge runtime concern:** `net.isIPv6()` is Node-specific. For Next.js/edge, use regex detection.
- **Important:** This is a security feature and should be in the next release.

---

### GAP-8: `requestPropertyName` (attach rate limit info to `req`)

**express-rate-limit behaviour:**
```typescript
// After middleware runs, downstream handlers can read:
app.get('/', (req, res) => {
  console.log(req.rateLimit.remaining); // e.g. 42
});
```
`requestPropertyName: 'rateLimit'` (default) — attaches the `RateLimiterResult` to `req[requestPropertyName]`.

**limiterx current behaviour:** Rate limit info is only in response headers and the `onLimit` callback. Not accessible in downstream middleware.

**Impact:** Developers cannot build adaptive logic (e.g., return 200 with a warning when remaining < 5) without duplicating the rate limit check.

**R&D notes:**
- Express-only feature (req object is Express-specific).
- New config: `requestPropertyName?: string` (default `'rateLimit'`).
- Implementation: `(req as any)[requestPropertyName] = result` after check.
- TypeScript: augment `express.Request` with the property via module augmentation.
- Low risk, isolated to `express.ts` adapter.

---

### GAP-9: `passOnStoreError` (fail-open mode)

**express-rate-limit behaviour:**
- `passOnStoreError: false` (default) — if the store throws, the request is blocked ("fail closed").
- `passOnStoreError: true` — if the store throws, the request is allowed through ("fail open").

**limiterx current behaviour:** Store errors propagate as exceptions and reach `next(err)` in Express (fail closed, which is correct). No fail-open option exists.

**Impact:** In high-availability systems where Redis outages should not take down the entire API, there is no way to configure fail-open behaviour without wrapping the middleware.

**R&D notes:**
- New config: `passOnStoreError?: boolean` (default `false`).
- Implementation: wrap `limiter.check(key)` in a try/catch. On store error with `passOnStoreError: true`, call `next()` and return instead of `next(err)`.
- The error should still be logged (or passed to an `onStoreError` callback — an additional option worth considering).
- Applies to all backend adapters, not just Express.

---

### GAP-10: `validate` config (named runtime validation checks)

**express-rate-limit behaviour:**
- `validate: true/false` globally enables/disables all validation warnings.
- `validate: { ip: false, trustProxy: true }` disables/enables individual checks by name.
- Checks include: `ip`, `trustProxy`, `xForwardedForHeader`, `forwardedHeader`, `positiveHits`, `unsharedStore`, `singleCount`, `limit`, `windowMs` etc.
- Warnings are emitted to `console.warn` once (not on every request).

**limiterx current behaviour:** `validateConfig` runs only at construction time and throws hard errors on invalid values. No runtime warnings, no named toggles, no "warn once" mechanism.

**Impact:** Developers cannot be warned about common misconfigurations (e.g., using `req.ip` behind a proxy without `trust proxy` set) without a hard failure.

**R&D notes:**
- `validateConfig` could be extended with a `warn(message)` function that logs once per warning ID.
- `LimiterxConfig` gets `validate?: boolean | Record<string, boolean>`.
- Specific warnings to add:
  - `trustProxy`: warn if `req.ip` looks like a private IP (`10.x`, `172.x`, `192.168.x`) suggesting un-proxied setup.
  - `positiveHits`: warn if counter goes negative (store decrement bug).
  - `windowMs`: warn if `windowMs > 2_147_483_647` (safe-integer overflow for `setTimeout`).
- Medium complexity.

---

### GAP-11: Async `skip` and `keyGenerator`

**express-rate-limit behaviour:** Both `skip` and `keyGenerator` can be async functions (return a Promise).

**limiterx current behaviour:** Both are defined as sync functions. The type signature is `(ctx: RequestContext) => string` / `(ctx: RequestContext) => boolean` — no `Promise` return type.

**Impact:** Cannot perform async operations for key generation (e.g., look up a user ID from a session store) or async skip logic (e.g., check an allowlist in Redis).

**R&D notes:**
- Type change: `keyGenerator?: (ctx: RequestContext) => string | Promise<string>`.
- Type change: `skip?: (ctx: RequestContext) => boolean | Promise<boolean>`.
- Adapter call sites: `await resolvedConfig.keyGenerator!(ctx)` and `await skip(ctx)` — already in an async function, so trivial.
- `validateConfig` still checks `typeof === 'function'`, unchanged.
- Minimal risk.

---

### GAP-12 (Partial): `handler` vs `onLimit`

**express-rate-limit behaviour:**
```typescript
handler: (req, res, next, options) => {
  res.status(options.statusCode).json({ error: options.message, limit: options.limit });
}
```
`handler` completely replaces the default 429 response logic. It receives `req`, `res`, `next`, and the full resolved `options` object.

**limiterx current behaviour:** `onLimit(result, ctx)` is a side-effect callback — it fires but cannot replace the response. The response is always sent by the adapter.

**Impact:** Cannot fully customise the denied-response format (e.g., return JSON with custom schema, redirect to a paywall page) without forking the adapter.

**R&D notes:**
- Rename or extend `onLimit` to support a `handler` mode: if the callback returns `true` (or a Response), the adapter skips its built-in response.
- Alternatively, add a separate `handler` config key that, when present, replaces the adapter's denial logic entirely.
- The second approach is cleaner. `handler?: (result: RateLimiterResult, ctx: RequestContext) => void | Promise<void>` where the handler is responsible for sending the response.
- `onLimit` would remain as the non-response callback.

---

## Priority Matrix

| Priority | Gap | Effort | Impact |
|---|---|---|---|
| P0 — Security | GAP-7: `ipv6Subnet` | Medium | High (security fix) |
| P1 — Compatibility | GAP-4: `legacyHeaders` | Low | High (ecosystem compat) |
| P1 — Compatibility | GAP-11: Async `skip`/`keyGenerator` | Low | Medium |
| P2 — DX | GAP-8: `requestPropertyName` | Low | Medium |
| P2 — DX | GAP-9: `passOnStoreError` | Low | Medium |
| P2 — DX | GAP-12: `handler` callback | Medium | Medium |
| P2 — DX | GAP-3: Dynamic `message` function | Low | Low |
| P3 — Advanced | GAP-1: Dynamic `limit` function | Medium | High |
| P3 — Advanced | GAP-2: `skipSuccessfulRequests` | Medium | High |
| P3 — Advanced | GAP-5: IETF header drafts | Medium | Low |
| P3 — Advanced | GAP-6: `identifier`/RateLimit-Policy | Low | Low |
| P4 — Ops | GAP-10: `validate` named checks | High | Medium |

---

## Features Where limiterx is Ahead

| Feature | express-rate-limit | limiterx |
|---|---|---|
| Sliding window algorithm | ❌ | Roadmap (spec-002) |
| Token bucket algorithm | ❌ | Roadmap (spec-002) |
| React / browser hook | ❌ | ✅ `useRateLimit` |
| Koa adapter | ❌ | ✅ |
| Next.js adapter | ❌ | ✅ |
| fetch/axios adapter | ❌ | ✅ |
| Universal (non-Express) core | ❌ | ✅ |
| LRU key eviction | Limited | ✅ configurable `maxKeys` |
| ESM + CJS dual output | ✅ | ✅ |

express-rate-limit is Express-only by design. limiterx's universal architecture is a genuine differentiator.

---

## External Store Ecosystem (Context)

express-rate-limit has a well-known ecosystem of third-party stores:

| Store package | Backend |
|---|---|
| `rate-limit-redis` | Redis (ioredis or node-redis) |
| `rate-limit-memcached` | Memcached |
| `rate-limit-postgresql` | PostgreSQL |
| `rate-limit-mongo` | MongoDB |
| `@express-rate-limit/preciselimiter` | Redis (sliding window) |

limiterx's spec-002 will ship a Redis adapter. Other stores (Postgres, Mongo, Memcached) are not on the roadmap but the `StorageAdapter` interface allows community adapters.

---

## Conclusion

The most impactful gaps to close for production adoption are:
1. **`ipv6Subnet` masking** (security — exploitable without it)
2. **`legacyHeaders`** (compatibility — most clients expect `X-RateLimit-*`)
3. **Async `skip`/`keyGenerator`** (DX — needed for real-world session-based limiting)
4. **Dynamic `limit` function** (DX — enables tiered rate limiting without multiple instances)
5. **`passOnStoreError`** (ops — needed for HA deployments once Redis adapter ships)

Gaps 2, 3, and 4 on this list are all low-medium effort and can be bundled into a `v1.2` milestone after spec-002 ships.
