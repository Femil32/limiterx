# Checklist: Phase A Verification Gates

**Feature**: `003-express-rate-limit-parity`
**Phase**: A — P0 (Security) + P1 (Compatibility) + P2 (DX)

Run these checks before merging Phase A to `main`.

---

## Build

- [x] `npm run build` — exits 0, no errors
- [x] `npm run typecheck` — zero TypeScript errors
- [x] `npm run lint` — zero ESLint warnings or errors
- [x] `npm pack --dry-run` — unpacked size < 300 KB (was 621 KB in v1.0.1)
- [x] Build output: `splitting: true` shared chunk exists in `dist/`
- [x] Build output: no `.map` files (sourcemap: false)

## Test Coverage

- [x] `npm run test` — all tests pass
- [x] Coverage: statements ≥ 90%
- [x] Coverage: branches ≥ 85%
- [x] Coverage: functions ≥ 95%
- [x] New test files exist: `tests/unit/ipv6.test.ts`
- [x] New test files exist: `tests/unit/resolveMessage.test.ts`
- [x] New test files exist: `tests/unit/validateConfig.spec-003.test.ts`
- [x] New test files exist: `tests/integration/express.spec-003.test.ts`
- [x] New test files exist: `tests/integration/legacy-headers.test.ts`

## GAP-7: IPv6 Subnet Masking

- [x] IPv4 address passes through unchanged
- [x] Two IPv6 addresses in the same /56 produce the same rate limit key
- [x] Two IPv6 addresses in different /56 subnets produce different keys
- [x] `ipv6Subnet: false` produces raw verbatim key (same as v1.0.x)
- [x] Custom `keyGenerator` ignores `ipv6Subnet`
- [x] `maskIPv6` imports only BigInt (no `net` module in bundle)

## GAP-4: Legacy X-RateLimit-* Headers

- [x] `legacyHeaders: true` → `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` present
- [x] `x-ratelimit-reset` is a Unix epoch integer (not relative seconds)
- [x] `legacyHeaders: false` (default) → no `x-ratelimit-*` headers
- [x] Both `RateLimit-*` and `X-RateLimit-*` headers present simultaneously when both options are true
- [x] `headers: false` suppresses both header sets

## GAP-11: Async keyGenerator and skip

- [x] Async `keyGenerator` resolves and uses the resolved key
- [x] Async `skip` returning `Promise<true>` skips the request
- [x] Rejected async `keyGenerator` → `next(err)` in Express
- [x] Rejected async `skip` → `next(err)` in Express

## GAP-8: requestPropertyName

- [x] `req.rateLimit` is set after allowed request (default name)
- [x] `req[customName]` is set when `requestPropertyName: 'customName'`
- [x] Contains full `RateLimiterResult` object
- [x] Not set when `skip()` returns true

## GAP-9: passOnStoreError

- [x] `passOnStoreError: false` (default) — store error → `next(err)`
- [x] `passOnStoreError: true` — store error → `next()` without error
- [x] No rate limit headers set on pass-through
- [x] `onLimit` is NOT called on pass-through

## GAP-12: handler callback

- [x] `handler` replaces built-in 429 response
- [x] `onLimit` fires before `handler`
- [x] `handler` not defined → built-in 429 unchanged
- [x] Async `handler` is awaited

## GAP-3: message as function

- [x] Sync message function resolves and body is sent
- [x] Async message function resolves and body is sent
- [x] Object returned by message function is sent as JSON
- [x] String returned by message function is sent as text

## Backward Compatibility

- [x] Existing `max: 100, window: '15m'` config works without any changes
- [x] Existing `headers: true` still sends IETF headers
- [x] Existing `skip`, `keyGenerator`, `onLimit` (sync) still work
- [x] Existing `message: 'Too many requests'` still works
- [x] Express adapter: existing `req.ip` key generation still works for IPv4
