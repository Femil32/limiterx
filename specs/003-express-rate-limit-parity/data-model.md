# Data Model: express-rate-limit Parity

**Feature**: `003-express-rate-limit-parity`
**Phase**: 0 — Research / Design

---

## LimiterxConfig — Before / After

### Phase A additions (v1.2.0)

```typescript
// BEFORE (v1.0.x)
interface LimiterxConfig {
  max: number;
  window: number | string;
  algorithm?: 'fixed-window';
  keyGenerator?: (ctx: RequestContext) => string;
  onLimit?: (result: RateLimiterResult, ctx: RequestContext) => void;
  maxKeys?: number;
  debug?: boolean;
  headers?: boolean;
  skip?: (ctx: RequestContext) => boolean;
  message?: string | object;
  statusCode?: number;
}

// AFTER Phase A (v1.2.0) — new/changed fields marked with ★
interface LimiterxConfig {
  max: number;
  window: number | string;
  algorithm?: 'fixed-window';

  // ★ widened: async support
  keyGenerator?: (ctx: RequestContext) => string | Promise<string>;
  onLimit?: (result: RateLimiterResult, ctx: RequestContext) => void | Promise<void>;
  skip?: (ctx: RequestContext) => boolean | Promise<boolean>;

  // ★ widened: function overload
  message?: string | object | ((result: RateLimiterResult, ctx: RequestContext) => string | object | Promise<string | object>);

  // ★ new — GAP-4: X-RateLimit-* headers
  legacyHeaders?: boolean;             // default: false

  // ★ new — GAP-7: IPv6 subnet masking
  ipv6Subnet?: number | false;         // default: 56 (bits)

  // ★ new — GAP-8: attach result to req object
  requestPropertyName?: string;        // default: 'rateLimit'

  // ★ new — GAP-9: fail-open on store error
  passOnStoreError?: boolean;           // default: false

  // ★ new — GAP-12: full response-replacement callback
  handler?: (result: RateLimiterResult, ctx: RequestContext) => void | Promise<void>;

  // unchanged
  maxKeys?: number;
  debug?: boolean;
  headers?: boolean;
  statusCode?: number;
}
```

### Phase B additions (v1.3.0)

```typescript
interface LimiterxConfig {
  // ★ widened: dynamic per-request limit — GAP-1
  max: number | ((ctx: RequestContext) => number | Promise<number>);

  // ★ new — GAP-2: post-response counter decrement
  skipSuccessfulRequests?: boolean;     // default: false
  skipFailedRequests?: boolean;         // default: false
  requestWasSuccessful?: (ctx: RequestContext) => boolean | Promise<boolean>;
  // default: ctx.res.statusCode < 400 (Express/Node), ctx.status < 400 (Koa)

  // ★ new — GAP-5: IETF header draft selector
  standardHeaders?: 'draft-6' | 'draft-7' | 'draft-8'; // default: 'draft-7'

  // ★ new — GAP-6: RateLimit-Policy header name
  identifier?: string | ((ctx: RequestContext) => string);
  // auto-default: "{limit};w={windowSec}"

  // ★ new — GAP-10: runtime config validation
  validate?: boolean | Record<string, boolean>;  // default: true
  // named checks: 'windowMs', 'trustProxy', 'positiveHits'

  // all Phase A fields retained unchanged
}
```

---

## StorageAdapter — Before / After

### Phase B addition

```typescript
// BEFORE
interface StorageAdapter {
  get(key: string): Promise<FixedWindowState | null>;
  set(key: string, state: FixedWindowState, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// AFTER Phase B — ★ new method for skipSuccessfulRequests
interface StorageAdapter {
  get(key: string): Promise<Record<string, number> | null>;    // generalized (spec-002)
  set(key: string, state: Record<string, number>, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  // ★ new — GAP-2
  decrement(key: string, ttlMs: number): Promise<void>;
}
```

`decrement` subtracts 1 from the counter for `key`, flooring at 0. If the key does not exist or is expired, it is a no-op.

---

## RateLimiter — Before / After

### Phase B addition

```typescript
// BEFORE
interface RateLimiter {
  check(key: string): Promise<RateLimiterResult>;
  reset(key: string): Promise<void>;
  clear(): Promise<void>;
  destroy(): void;
}

// AFTER Phase B — ★ new method
interface RateLimiter {
  check(key: string): Promise<RateLimiterResult>;
  reset(key: string): Promise<void>;
  clear(): Promise<void>;
  destroy(): void;
  // ★ new — exposed for skipSuccessfulRequests in adapters
  decrement(key: string): Promise<void>;
}
```

---

## Header Output Format — Before / After

### Phase A (legacyHeaders: true)

When `legacyHeaders: true` is added alongside the existing `headers: true`:

```
# Existing IETF headers (unchanged)
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 857          ← seconds until window resets (relative)
Retry-After: 857              ← on denied responses only

# New legacy headers (when legacyHeaders: true)
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1743184457 ← Unix epoch timestamp (absolute), NOT relative
```

**Critical distinction:** `RateLimit-Reset` is a relative countdown (seconds until reset). `X-RateLimit-Reset` is an absolute Unix timestamp (seconds since epoch). This matches the historical convention established by GitHub, Twitter, and other APIs.

### Phase B (standardHeaders: 'draft-6')

```
# draft-6: single combined header
RateLimit: limit=100, remaining=42, reset=857
```

### Phase B (standardHeaders: 'draft-8')

```
# draft-8: draft-7 headers + policy
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 857
RateLimit-Policy: 100;w=900   ← "{limit};w={windowSeconds}"
```

---

## Key Generation — Before / After

### Phase A (ipv6Subnet: 56, default)

```
# IPv4 addresses — unchanged
req.ip: "203.0.113.42"   →   key: "203.0.113.42"

# IPv6 addresses — masked to /56 subnet representative
req.ip: "2001:db8:1234:5600:1:2:3:4"   →   key: "2001:db8:1234:5600::"
req.ip: "2001:db8:1234:5600:a:b:c:d"   →   key: "2001:db8:1234:5600::"  (same key)
req.ip: "2001:db8:1234:5700:1:2:3:4"   →   key: "2001:db8:1234:5700::"  (different /56)

# Loopback — masked
req.ip: "::1"   →   key: "::"
```

### ipv6Subnet: false

```
req.ip: "2001:db8::1"   →   key: "2001:db8::1"   (verbatim, no masking)
```

### Custom keyGenerator — ipv6Subnet ignored

```typescript
// When this is set, ipv6Subnet has no effect:
keyGenerator: (ctx) => ctx.req.headers['x-api-key'] as string
```

---

## New Internal Helpers

### `src/adapters/internal/ipv6.ts`

```typescript
// Pure BigInt arithmetic, no imports
export function isIPv6(ip: string): boolean
export function maskIPv6(ip: string, prefixLength: number): string
```

Called by: `express.ts`, `node.ts`, `koa.ts`, `next.ts` default keyGenerators.

Not called by: `fetch.ts`, `axios.ts`, `react.ts` (use `'global'` key by default).

### `src/adapters/internal/resolve-message.ts`

```typescript
export async function resolveMessage(
  message: LimiterxConfig['message'],
  result: RateLimiterResult,
  ctx: RequestContext,
): Promise<string | object>
```

Called by: all backend adapter deny branches (replaces direct `config.message` reference).

---

## State Transitions — skipSuccessfulRequests

```
Request arrives
  → counter incremented (count: N → N+1)
  → result.allowed = true (N+1 ≤ max)
  → next() called, response flows downstream

Response finishes (res.on('finish'))
  → evaluate requestWasSuccessful(ctx) → true (status 200)
  → skipSuccessfulRequests = true → decrement
  → counter decremented (count: N+1 → N)
  → net effect: request was never counted

Response finishes (res.on('finish'))
  → evaluate requestWasSuccessful(ctx) → false (status 401)
  → skipSuccessfulRequests = true, request was a failure → no decrement
  → net effect: request was counted (persists)

Edge case: window rolls over before finish fires
  → decrement targets a key that has been reset or expired
  → store.decrement is a no-op on missing/expired keys
  → no error, no stale state
```
