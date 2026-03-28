# Spec: express-rate-limit Feature Parity

**Feature**: `003-express-rate-limit-parity`
**Version target**: v1.2.0
**Based on**: `research.md` gap analysis vs express-rate-limit v7.x
**Depends on**: spec-002 (algorithm extensibility — can ship independently)

---

## Summary

Close 12 feature gaps between limiterx and express-rate-limit so that developers migrating from express-rate-limit lose no functionality. All gaps are additive config fields — no breaking changes to existing behaviour.

---

## User Stories

### US1 (P0) — IPv6 Subnet Protection

**As a** backend developer deploying a public API,
**I want** the default rate limiter key to group a full IPv6 /56 subnet under a single key,
**so that** an attacker with a standard /64 IPv6 allocation cannot bypass per-IP limits by cycling through the ~18 quintillion addresses in their subnet.

**Acceptance scenarios:**

- `GIVEN` a default Express rate limiter with `ipv6Subnet: 56` (default)
  `WHEN` requests arrive from `2001:db8::1` and `2001:db8::2` (same /56)
  `THEN` both requests share one rate limit counter

- `GIVEN` `ipv6Subnet: false`
  `WHEN` requests arrive from `2001:db8::1` and `2001:db8::2`
  `THEN` each address has its own separate counter

- `GIVEN` a pure IPv4 address `203.0.113.42`
  `WHEN` the default keyGenerator runs
  `THEN` the key is `203.0.113.42` unchanged (no masking applied)

**Edge cases:**
- IPv4-mapped IPv6 (`::ffff:203.0.113.42`) treated as IPv6 (contains `:`), masked at the configured prefix
- Loopback `::1` masked to `::` at /56
- Custom `keyGenerator` — `ipv6Subnet` is ignored entirely

---

### US2 (P1) — X-RateLimit-\* Header Compatibility

**As a** developer building a client that reads `X-RateLimit-Remaining`,
**I want** limiterx to emit the legacy `X-RateLimit-*` headers,
**so that** existing clients, dashboards, and monitoring tools that pre-date IETF standardization keep working without changes.

**Acceptance scenarios:**

- `GIVEN` `legacyHeaders: true`
  `WHEN` a request is processed (allowed or denied)
  `THEN` `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` are present
  AND `X-RateLimit-Reset` is a Unix epoch timestamp in integer seconds (not relative offset)

- `GIVEN` `legacyHeaders: false` (default)
  `WHEN` a request is processed
  `THEN` no `X-RateLimit-*` headers are sent
  AND `RateLimit-*` IETF headers are sent as before

- `GIVEN` both `headers: true` and `legacyHeaders: true`
  `WHEN` a request is processed
  `THEN` both `RateLimit-*` and `X-RateLimit-*` header sets are present simultaneously

---

### US3 (P1) — Async Key Generation

**As a** developer implementing session-based rate limiting,
**I want** the `keyGenerator` to support async functions,
**so that** I can look up a user ID from a database or session store and use it as the rate limit key without wrapping the middleware.

**Acceptance scenarios:**

- `GIVEN` `keyGenerator: async (ctx) => { const user = await db.getUser(ctx.req); return user.id; }`
  `WHEN` a request arrives
  `THEN` the resolved user ID is used as the rate limit key

- `GIVEN` `skip: async (ctx) => { return await allowlist.has(ctx.req.ip); }`
  `WHEN` a request arrives from an allowlisted IP
  `THEN` the request passes without incrementing the counter

- `GIVEN` an async `keyGenerator` that rejects (throws)
  `WHEN` a request arrives
  `THEN` the error propagates to Express's `next(err)` (same as sync error — FR-019)

---

### US4 (P2) — Downstream Rate Limit Access

**As a** developer writing Express handlers,
**I want** the rate limit result to be attached to `req.rateLimit`,
**so that** downstream middleware can read `req.rateLimit.remaining` to add warnings or adaptive behaviour without re-checking the limiter.

**Acceptance scenarios:**

- `GIVEN` default `requestPropertyName: 'rateLimit'`
  `WHEN` the middleware runs and the request is allowed
  `THEN` `req.rateLimit` contains `{ allowed, remaining, limit, retryAfter, resetAt, key }`

- `GIVEN` `requestPropertyName: 'rateLimitInfo'`
  `WHEN` the middleware runs
  `THEN` `req.rateLimitInfo` is set instead

- `GIVEN` the middleware is skipped via `skip: () => true`
  `THEN` `req.rateLimit` is not attached (skip bypasses the limiter)

---

### US5 (P2) — High-Availability Fail-Open

**As a** backend engineer running Redis-backed rate limiting,
**I want** the option to allow traffic through when the store is unavailable,
**so that** a Redis outage does not take down the entire API.

**Acceptance scenarios:**

- `GIVEN` `passOnStoreError: false` (default)
  `WHEN` the store throws during `check()`
  `THEN` Express receives `next(err)` — request is blocked

- `GIVEN` `passOnStoreError: true`
  `WHEN` the store throws during `check()`
  `THEN` the request is allowed through (next() called without error)

- `GIVEN` `passOnStoreError: true` and a store error
  `WHEN` a request is allowed through
  `THEN` no rate limit headers are set on the response

---

### US6 (P2) — Custom Deny Response

**As a** developer building a SaaS product,
**I want** to fully control the response sent when a request is denied,
**so that** I can redirect to an upgrade page, return a branded JSON error, or send a custom HTTP status other than 429.

**Acceptance scenarios:**

- `GIVEN` `handler: (result, ctx) => { ctx.res.redirect('/upgrade'); }`
  `WHEN` a request exceeds the limit
  `THEN` the response is a redirect, not a 429

- `GIVEN` a `handler` and an `onLimit` callback both configured
  `WHEN` a request is denied
  `THEN` `onLimit` fires first (side effect), then `handler` sends the response

- `GIVEN` no `handler`
  `WHEN` a request is denied
  `THEN` the built-in 429 response is sent as before (backward compatible)

---

### US7 (P3) — Tiered Rate Limits

**As a** developer running a freemium API,
**I want** the `max` limit to be a function evaluated per-request,
**so that** premium users automatically get a higher quota without requiring multiple limiter instances.

**Acceptance scenarios:**

- `GIVEN` `max: async (ctx) => { const tier = await getTier(ctx.key); return tier === 'premium' ? 1000 : 100; }`
  `WHEN` a premium user makes a request
  `THEN` their window allows up to 1000 requests

- `GIVEN` the same config
  `WHEN` a free user makes a request
  `THEN` their window allows up to 100 requests

- `GIVEN` a dynamic `max` function that throws
  `WHEN` a request arrives
  `THEN` the error propagates (same as a throwing `keyGenerator`)

---

### US8 (P3) — Selective Request Counting

**As a** developer implementing login rate limiting,
**I want** failed login attempts to count toward the rate limit but successful ones not to,
**so that** legitimate users who log in successfully don't exhaust their quota.

**Acceptance scenarios:**

- `GIVEN` `skipSuccessfulRequests: true`
  `WHEN` a request results in a 200 response
  `THEN` the counter is decremented (net effect: the request was not counted)

- `GIVEN` `skipFailedRequests: true`
  `WHEN` a request results in a 401 response
  `THEN` the counter is decremented

- `GIVEN` `requestWasSuccessful: (ctx) => ctx.res.statusCode < 500`
  `WHEN` a request results in a 403
  `THEN` the custom predicate determines whether to decrement (403 < 500 = success by this predicate)

- `GIVEN` `skipSuccessfulRequests: true` and a denied request (429 already sent)
  `THEN` no finish hook is registered (the counter was not incremented for this request)

- `GIVEN` `rateLimitEdge` in Next.js
  `THEN` `skipSuccessfulRequests` and `skipFailedRequests` are explicitly unsupported (documented limitation)

---

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-P03-001 | `ipv6Subnet` defaults to `56`. Applied only when `keyGenerator` is not customized. IPv4 addresses are returned unchanged. |
| FR-P03-002 | `legacyHeaders` defaults to `false`. When `true`, sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix epoch seconds). |
| FR-P03-003 | `X-RateLimit-Reset` MUST be the Unix epoch timestamp (seconds since 1970-01-01T00:00:00Z), NOT a relative offset. |
| FR-P03-004 | `keyGenerator` and `skip` MUST accept async functions returning `Promise<string>` and `Promise<boolean>` respectively. |
| FR-P03-005 | `requestPropertyName` defaults to `'rateLimit'`. Applies to Express, Koa, and Next.js API adapter. Does not apply to `rateLimitEdge`. |
| FR-P03-006 | When `passOnStoreError: true` and the store throws, the request is allowed through and no rate limit headers are set. The error is silently swallowed. |
| FR-P03-007 | When `handler` is defined, it is called with `(result, ctx)` instead of sending the built-in 429. The `onLimit` callback still fires before `handler`. |
| FR-P03-008 | `message` MAY be a function `(result, ctx) => string \| object \| Promise<string \| object>`. The resolved value is sent identically to a static string or object. |
| FR-P03-009 | `max` MAY be a function `(ctx) => number \| Promise<number>`. Resolved per-request. The resolved value must be a positive integer at check time. |
| FR-P03-010 | `skipSuccessfulRequests` and `skipFailedRequests` register a `finish` event listener on the response. Counter is decremented at most once per request. Not supported in `rateLimitEdge`. |
| FR-P03-011 | `standardHeaders` defaults to `'draft-7'` (existing behaviour). `'draft-6'` emits a single combined `RateLimit` header. `'draft-8'` adds `RateLimit-Policy`. |
| FR-P03-012 | `identifier` is used only when `standardHeaders: 'draft-8'`. Auto-generated default: `"{limit};w={windowSec}"`. |
| FR-P03-013 | `validate` defaults to `true`. Accepts `boolean` or `Record<string, boolean>` for per-check toggle. Warnings use `console.warn` and fire at most once per process per check name. |

## Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-P03-001 | Phase A additions total ≤ 800 bytes minified across all files. |
| NFR-P03-002 | All new fields are optional. Default values preserve v1.0.x behaviour exactly (except `ipv6Subnet` which changes IPv6 key generation — documented breaking security change). |
| NFR-P03-003 | IPv6 masking uses only `BigInt` arithmetic. No `net` module import. Compatible with Next.js Edge Runtime and browser environments. |
| NFR-P03-004 | `skipSuccessfulRequests` finish hook must not throw or interfere with the response even if the window has already rolled over when `finish` fires. |

---

## Success Criteria

1. A developer sets `legacyHeaders: true` and their existing client that reads `X-RateLimit-Remaining` works without changes.
2. An attacker with a full /64 IPv6 subnet hits the limit after `max` requests, not after `max × 2^72` requests.
3. A developer passes an async `keyGenerator` that reads from Redis — no wrapper code needed.
4. A downstream handler reads `req.rateLimit.remaining` and adds a warning header when remaining < 5.
5. A Redis outage with `passOnStoreError: true` — API stays up, no 429s from store failures.
6. A custom `handler` sends a branded JSON error instead of the plain-text 429.
7. `npm run test` passes with ≥90% statement coverage after all Phase A changes.
8. `npm run build && npm pack --dry-run` shows unpacked size < 300 KB.
