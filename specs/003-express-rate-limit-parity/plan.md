# Implementation Plan: express-rate-limit Parity

**Feature**: `003-express-rate-limit-parity`
**Target**: v1.2.0 (Phase A) → v1.3.0 (Phase B)
**Branch**: `003-express-rate-limit-parity`
**Depends on**: none (self-contained; spec-002 can merge independently)

---

## Architecture Summary

All 12 gaps are configuration-surface or adapter-lifecycle changes. No new algorithm implementations. Three layers touched:

| Layer | Changes |
|---|---|
| `src/core/` | Types, validation defaults, dynamic max wiring, decrement method (Phase B) |
| `src/adapters/internal/` | New IPv6 helper, new message resolver, refactored header function |
| `src/adapters/` | All 6 backend/frontend adapters updated |

---

## Phase A — P0 + P1 + P2 (ship as v1.2.0)

**Gaps covered:** GAP-3, GAP-4, GAP-7, GAP-8, GAP-9, GAP-11, GAP-12

### Step 1: Core types (`src/core/types.ts`)

Add to `LimiterxConfig`:
- Widen `keyGenerator`, `skip`, `onLimit` to accept async (return `| Promise<…>`)
- Widen `message` to `string | object | ((result, ctx) => string | object | Promise<…>)`
- Add `legacyHeaders?: boolean` (default `false`)
- Add `ipv6Subnet?: number | false` (default `56`)
- Add `requestPropertyName?: string` (default `'rateLimit'`)
- Add `passOnStoreError?: boolean` (default `false`)
- Add `handler?: (result, ctx) => void | Promise<void>`

### Step 2: Validation (`src/core/validateConfig.ts`)

- V-012: extend message check to allow `typeof === 'function'`
- V-013 through V-017: validate 5 new fields
- Defaults: `legacyHeaders ?? false`, `ipv6Subnet ?? 56`, `requestPropertyName ?? 'rateLimit'`, `passOnStoreError ?? false`
- Update `Required<Pick<…>>` return type annotation

### Step 3: IPv6 helper (`src/adapters/internal/ipv6.ts`) [NEW FILE]

```
export function isIPv6(ip: string): boolean          // ip.includes(':')
export function maskIPv6(ip: string, prefix: number): string
```

Algorithm:
1. Return unchanged if not IPv6
2. Expand `::` abbreviation → 8 full 4-hex groups
3. Parse to 128-bit BigInt
4. Build bitmask: top `prefix` bits = 1, rest = 0
5. Apply: `ipBigInt & mask`
6. Convert back → compress longest zero run to `::`

**No imports.** BigInt only. ~60 lines. Works in Edge Runtime and browsers.

### Step 4: Message resolver (`src/adapters/internal/resolve-message.ts`) [NEW FILE]

```
export async function resolveMessage(message, result, ctx): Promise<string | object>
```

If message is a function, await and return. Otherwise return as-is.

### Step 5: Header helper refactor (`src/adapters/internal/rate-limit-headers.ts`)

New export alongside existing `setRateLimitHeadersFull` (kept as alias):

```
export function setRateLimitHeaders(setHeader, result, options: {
  standard: boolean
  legacyHeaders: boolean
}): void
```

Legacy branch (when `legacyHeaders: true`):
- `X-RateLimit-Limit` = `result.limit` (integer)
- `X-RateLimit-Remaining` = `result.remaining` (integer)
- `X-RateLimit-Reset` = `Math.floor(result.resetAt.getTime() / 1000)` ← **epoch timestamp, not relative**
- `Retry-After` already set by standard branch

### Step 6: Backend adapters (express, node, koa, next)

Per adapter, in order:
1. `await keyGenerator!(ctx)` — async support
2. `await skip(ctx)` — async support
3. `setRateLimitHeaders(…, { standard, legacyHeaders })` — legacy headers
4. Default keyGenerator: `maskIPv6(ip, ipv6Subnet)` when `ipv6Subnet !== false`
5. `(req as any)[requestPropertyName] = result` — attach to request object
6. `passOnStoreError` try/catch around `limiter.check(key)` — fail-open
7. `if (handler) { await handler(result, ctx); return; }` — response replacement
8. `await resolveMessage(message, result, ctx)` — dynamic message
9. `await onLimit(result, ctx)` — async onLimit

### Step 7: Frontend adapters (fetch, axios)

- Async `skip`/`keyGenerator`
- `passOnStoreError` try/catch
- `resolveMessage` for dynamic message

`ipv6Subnet` and `requestPropertyName` do not apply (no req object, global key).

---

## Phase B — P3 + P4 (ship as v1.3.0)

**Gaps covered:** GAP-1, GAP-2, GAP-5, GAP-6, GAP-10

### B1: Dynamic `max` (GAP-1)

- `types.ts`: `max: number | ((ctx) => number | Promise<number>)`
- `validateConfig.ts`: allow function for `max` (skip integer check)
- `FixedWindowLimiter.check(ns, key, maxOverride?)`: use `maxOverride ?? this.max`
- `createRateLimiter`: resolve max per-call before calling `algorithm.check`

### B2: skipSuccessfulRequests (GAP-2)

- `StorageAdapter` + `MemoryStore`: add `decrement(key, ttlMs)` method
- `RateLimiter` interface + `createRateLimiter`: expose `decrement(key)`
- Backend adapters: register `res.on('finish', …)` after `next()` when either skip option is true
  - Evaluate `requestWasSuccessful` or fallback `statusCode < 400`
  - Call `await limiter.decrement(result.key)` if condition met
- `rateLimitEdge`: explicitly unsupported (no `finish` event on `Response`)

### B3: IETF draft selector (GAP-5) + identifier (GAP-6)

- `types.ts`: `standardHeaders?: 'draft-6' | 'draft-7' | 'draft-8'`; `identifier?`
- `rate-limit-headers.ts`: add draft-6 (single `RateLimit` header) and draft-8 (`RateLimit-Policy`) branches
- Default `identifier`: `"{limit};w={windowSec}"`

### B4: Runtime validation (GAP-10)

- `types.ts`: `validate?: boolean | Record<string, boolean>`
- `validateConfig.ts`: `runRuntimeValidation(config, windowMs)` — `console.warn` once per check via module-level `Set<string>`
- Initial checks: `windowMs > 2_147_483_647`, `trustProxy` detection

---

## Dependency Graph

```
Phase A:
  types (A1) ──┬── validateConfig (A2)
               ├── ipv6.ts (A3) — no deps, parallel
               ├── resolve-message.ts (A4) — no deps, parallel
               └── rate-limit-headers.ts (A5)
                     └── express/node/koa/next (A6) ── all depend on A1–A5
  fetch/axios (A7) ── depends on A1, A4

Phase B:
  types (B1) ──┬── MemoryStore (B2)
               ├── FixedWindowLimiter (B3) ── createRateLimiter (B4) ── adapters (B5)
               └── validateConfig (B6)
  rate-limit-headers (B7) ── depends on A5 only
```

---

## Backward Compatibility

All new fields are optional. Defaults replicate v1.0.x behaviour with one documented exception:

| Field | v1.0.x behaviour | v1.2.x default | Change? |
|---|---|---|---|
| `legacyHeaders` | No X-RateLimit-* | `false` (same) | None |
| `ipv6Subnet` | Raw `req.ip` verbatim | `56` (masked) | **Yes — security fix** |
| `requestPropertyName` | Not attached | Attached to `req.rateLimit` | Additive only |
| `passOnStoreError` | Always throw | `false` (same) | None |
| `handler` | Not available | No-op when absent | None |

The `ipv6Subnet` default change is documented in `CHANGELOG.md` as a security fix. IPv4 addresses are unaffected.

---

## Build Impact

`tsup.config.ts` changes (apply alongside Phase A):
```typescript
sourcemap: false,  // removes ~494 KB from published package
splitting: true,   // removes ~50 KB of duplicated core bundles
```

Phase A code additions: ~730 bytes minified.
Phase A + B total: ~1.18 KB minified.
Projected published size: < 100 KB unpacked (was 621 KB).
