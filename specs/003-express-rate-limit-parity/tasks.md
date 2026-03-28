# Tasks: express-rate-limit Parity

**Feature**: `003-express-rate-limit-parity`
**Convention**: Write tests first (test file → implementation file)

---

## Phase A — P0 / P1 / P2

### Setup

- [x] **T001** — Create branch `003-express-rate-limit-parity` from `main`
- [x] **T002** — Apply tsup build fixes: `sourcemap: false`, `splitting: true` in `tsup.config.ts`; verify `npm run build` succeeds

### Core Types

- [x] **T003** — `src/core/types.ts`: widen `keyGenerator`, `skip`, `onLimit` to async; widen `message` to function; add `legacyHeaders`, `ipv6Subnet`, `requestPropertyName`, `passOnStoreError`, `handler`

### Validation

- [x] **T004** — Write test: `tests/unit/validateConfig.spec-003.test.ts` — covers V-013 through V-017, message function acceptance, new defaults
- [x] **T005** — `src/core/validateConfig.ts`: add V-013–V-017, update V-012, add new defaults, update return type annotation

### IPv6 Helper

- [x] **T006** — Write test: `tests/unit/ipv6.test.ts` — IPv4 passthrough, /56 mask, /48, /64, `false` disable, `::1`, IPv4-mapped `::ffff:a.b.c.d`, full address mask, prefix=128 (no masking)
- [x] **T007** — `src/adapters/internal/ipv6.ts`: implement `isIPv6` and `maskIPv6` using BigInt arithmetic

### Message Resolver

- [x] **T008** — Write test: `tests/unit/resolveMessage.test.ts` — string passthrough, object passthrough, sync function, async function, function returning object
- [x] **T009** — `src/adapters/internal/resolve-message.ts`: implement `resolveMessage`

### Header Helper

- [x] **T010** — Write test: `tests/integration/legacy-headers.test.ts` — `legacyHeaders: true` sets X-RateLimit-* with epoch seconds; `legacyHeaders: false` does not; both standard + legacy headers present simultaneously when both enabled
- [x] **T011** — `src/adapters/internal/rate-limit-headers.ts`: add `setRateLimitHeaders(setHeader, result, { standard, legacyHeaders })` + keep `setRateLimitHeadersFull` alias

### Express Adapter

- [x] **T012** — Write test: `tests/integration/express.spec-003.test.ts` — test each new feature:
  - `legacyHeaders: true` emits `x-ratelimit-*` headers
  - `requestPropertyName` attaches result to `req`
  - `passOnStoreError: true` allows through on store error
  - `handler` replaces 429 response; `onLimit` still fires
  - async `keyGenerator` resolves correctly
  - async `skip` resolves correctly
  - IPv6 key masking: `::1` and `::2` share same key at /56
  - async `message` function returns dynamic body
- [x] **T013** — `src/adapters/express.ts`: apply all Phase A changes (GAP-3/4/7/8/9/11/12)

### Node Adapter

- [x] **T014** — `src/adapters/node.ts`: apply all Phase A changes (no `requestPropertyName` on `req` — result is returned directly)

### Koa Adapter

- [x] **T015** — `src/adapters/koa.ts`: apply all Phase A changes (attach to `ctx[requestPropertyName]`)

### Next.js Adapter

- [x] **T016** — `src/adapters/next.ts`: apply all Phase A changes for both `rateLimitNext` and `rateLimitEdge`; `rateLimitEdge` header path must use the new `setRateLimitHeaders` helper

### Frontend Adapters

- [x] **T017** — `src/adapters/fetch.ts`: async skip/keyGenerator, passOnStoreError, resolveMessage
- [x] **T018** — `src/adapters/axios.ts`: async skip/keyGenerator, passOnStoreError, resolveMessage

### Phase A Gate

- [x] **T019** — `npm run typecheck` — zero errors
- [x] **T020** — `npm run lint` — zero warnings
- [x] **T021** — `npm run test` — all tests pass, coverage ≥ 90% statements
- [x] **T022** — `npm run build && npm pack --dry-run` — unpacked < 300 KB

---

## Phase B — P3 / P4

### Dynamic max (GAP-1)

- [x] **T101** — Write test: dynamic `max` function — premium key gets 1000, free key gets 100; async max function resolves; throwing max propagates error
- [x] **T102** — `src/core/types.ts`: `max: number | ((ctx) => number | Promise<number>)`
- [x] **T103** — `src/core/validateConfig.ts`: accept function for `max`
- [x] **T104** — `src/core/algorithms/FixedWindowLimiter.ts`: add `maxOverride?: number` to `check()`
- [x] **T105** — `src/core/createRateLimiter.ts`: resolve max per-call before algorithm.check

### skipSuccessfulRequests (GAP-2)

- [x] **T106** — Write test: `skipSuccessfulRequests: true` — 200 response does not consume quota; 401 does; `skipFailedRequests: true` — reverse behaviour; `requestWasSuccessful` custom predicate
- [x] **T107** — `src/core/types.ts`: add `decrement` to `StorageAdapter`; add to `RateLimiter`
- [x] **T108** — `src/core/storage/MemoryStore.ts`: implement `decrement(key, ttlMs)` (floor at 0, no-op if missing)
- [x] **T109** — `src/core/createRateLimiter.ts`: expose `decrement(key)` on returned `RateLimiter`
- [x] **T110** — `src/adapters/express.ts`: add `res.on('finish', …)` hook for skip options
- [x] **T111** — `src/adapters/koa.ts`: add `ctx.res.on('finish', …)` hook
- [x] **T112** — `src/adapters/node.ts`: document as developer-managed (no auto-hook since developer controls response)
- [x] **T113** — `src/adapters/next.ts`: `rateLimitEdge` — document as unsupported; `rateLimitNext` add finish hook

### IETF draft selector (GAP-5) + identifier (GAP-6)

- [x] **T114** — Write test: draft-6 emits single `RateLimit` header; draft-8 emits `RateLimit-Policy`; `identifier` string overrides auto-generated policy name
- [x] **T115** — `src/core/types.ts`: add `standardHeaders`, `identifier`
- [x] **T116** — `src/core/validateConfig.ts`: validate `standardHeaders` enum, `identifier` type
- [x] **T117** — `src/adapters/internal/rate-limit-headers.ts`: add draft-6 and draft-8 branches

### Runtime validation (GAP-10)

- [x] **T118** — Write test: `validate: false` suppresses all warnings; `validate: { windowMs: false }` suppresses only that check; `windowMs` warning fires when > 2147483647; warning fires only once per process
- [x] **T119** — `src/core/types.ts`: add `validate`
- [x] **T120** — `src/core/validateConfig.ts`: implement `runRuntimeValidation(config, windowMs)` with module-level dedup Set

### Phase B Gate

- [x] **T121** — `npm run typecheck` — zero errors
- [x] **T122** — `npm run lint` — zero warnings
- [x] **T123** — `npm run test` — all tests pass, coverage ≥ 90% statements
- [x] **T124** — `npm run build && npm pack --dry-run` — unpacked < 300 KB

---

## Parallel Opportunities

```
T006, T008, T010 — can be written in parallel (unit tests, no deps)
T007, T009, T011 — can be implemented in parallel after their tests
T013–T018 — can be implemented in parallel after T011
T101, T106, T114, T118 — Phase B test files can be written in parallel
```

---

## Dependencies

```
T003 must precede T005, T007, T009, T011, T013–T018
T005 must precede T013 (validation changes used in adapters)
T007 must precede T013–T016 (IPv6 helper used in default keyGenerators)
T009 must precede T013–T018 (resolveMessage used in all adapters)
T011 must precede T013–T016 (setRateLimitHeaders used in all backend adapters)
T013–T018 can proceed in parallel once T003–T011 are done
T107 must precede T108, T109
T109 must precede T110–T113
```
