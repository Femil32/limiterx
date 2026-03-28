# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-03-28

### Added

- **Algorithm extensibility** — `algorithm: 'sliding-window' | 'token-bucket'` config option alongside the existing `'fixed-window'` default
  - `SlidingWindowLimiter` — rolling window with no boundary burst (spec-002 US1)
  - `TokenBucketLimiter` — burst-friendly with steady token refill (spec-002 US2)
- **RedisStore** — multi-process storage adapter via `limiterx/redis` (spec-002 US3)
  - Duck-typed `RedisClientInterface` compatible with ioredis and node-redis
  - Atomic Lua INCR + EXPIRE to prevent race conditions
  - `RedisStore.decrement()` for skipSuccessfulRequests support
- **Custom store** — `store?: StorageAdapter` config field to plug in any backend (spec-002)
- **Dynamic `max`** — `max` now accepts `(ctx: RequestContext) => number | Promise<number>` for per-request tier limits (spec-003 GAP-1)
- **`skipSuccessfulRequests`** — decrement counter on 2xx responses; finish-event hook on Express/Koa/Next (spec-003 GAP-2a)
- **`skipFailedRequests`** — decrement counter on 4xx/5xx responses (spec-003 GAP-2b)
- **`requestWasSuccessful`** — custom predicate `(ctx) => boolean | Promise<boolean>` for skip options (spec-003 GAP-2c)
- **`RateLimiter.decrement(key)`** — public API to manually decrement a counter
- **IETF draft selector** — `standardHeaders: 'draft-6' | 'draft-7' | 'draft-8'` (default: `'draft-7'`) (spec-003 GAP-5)
  - `draft-6`: single combined `RateLimit` header
  - `draft-8`: draft-7 fields + `RateLimit-Policy: {limit};w={windowSec}`
- **`identifier`** — custom `RateLimit-Policy` name for draft-8 (spec-003 GAP-6)
- **`validate`** — `boolean | Record<string, boolean>` to suppress runtime warnings (spec-003 GAP-10)
  - Warns when `windowMs > 2_147_483_647` (max safe setTimeout); deduped per process
- **IPv6 subnet masking** — `ipv6Subnet?: number | false` (default: `/56`) on all backend adapters (spec-003 GAP-7)
- **Legacy headers** — `legacyHeaders?: boolean` emits `X-RateLimit-*` with epoch-second Reset (spec-003 GAP-4)
- **Async `keyGenerator` and `skip`** — both now accept `async (ctx) => ...` (spec-003 GAP-11)
- **`requestPropertyName`** — customise the property set on `req`/`ctx` (default: `'rateLimit'`) (spec-003 GAP-8)
- **`passOnStoreError`** — fail-open mode on storage errors (spec-003 GAP-9)
- **`handler`** — replace built-in 429 response with a custom callback (spec-003 GAP-12)
- **`message`** — now accepts sync/async function `(result, ctx) => string | object` (spec-003 GAP-3)
- `MemoryStore.decrement(key, ttlMs)` — no-op if key missing or expired, floor at 0

### Changed

- `max` type widened from `number` to `number | ((ctx: RequestContext) => number | Promise<number>)` — fully backwards-compatible
- `StorageAdapter` interface gains `decrement(key: string, ttlMs: number): Promise<void>`
- `RateLimiter` interface gains `decrement(key: string): Promise<void>`
- Package size: 179.5 kB unpacked (down from 621 kB in v1.0.1 — `splitting: true`, `sourcemap: false`)

---

## [1.0.1] - 2026-03-24

### Changed

- **BREAKING**: npm package name is now `limiterx` (unscoped). Subpath imports use `limiterx/express`, `limiterx/react`, etc.
- **BREAKING**: `FlowGuardConfig` renamed to `LimiterxConfig`.
- Error and debug log prefixes use `[limiterx]`; internal storage key namespace is `limiterx:`.

## [1.0.0] - Unreleased

### Added

- Core rate limiting engine with fixed window algorithm
- `createRateLimiter()` factory function with unified configuration
- `parseWindow()` for human-readable duration strings ('30s', '5m', '1h', '1d')
- `MemoryStore` with LRU eviction (default 10,000 keys) and periodic TTL cleanup
- Express middleware adapter (`limiterx/express`)
- Raw Node.js HTTP adapter (`limiterx/node`)
- Next.js API route and Edge middleware adapter (`limiterx/next`)
- Koa middleware adapter (`limiterx/koa`)
- React hook `useRateLimit` (`limiterx/react`)
- Fetch wrapper `rateLimitFetch` (`limiterx/fetch`)
- Axios interceptor `rateLimitAxios` (`limiterx/axios`)
- `RateLimitError` class for frontend adapter rejections
- Standard `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers
- `Retry-After` header on denied responses
- Config validation with descriptive `[limiterx]` error messages
- `skip` function for bypassing rate limiting
- `onLimit` callback for limit exceeded events
- `debug` flag for console diagnostics
- `keyGenerator` for custom key resolution
- Tree-shakeable subpath exports with `sideEffects: false`
- Dual ESM/CJS output
- TypeScript strict mode with full type exports
- CI/CD pipeline with Node 18/20/22 matrix and Bun testing
- Automated npm publishing on `v*` tags with provenance
