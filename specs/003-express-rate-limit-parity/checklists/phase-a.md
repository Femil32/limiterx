# Checklist: Phase A Verification Gates

**Feature**: `003-express-rate-limit-parity`
**Phase**: A — P0 (Security) + P1 (Compatibility) + P2 (DX)

Run these checks before merging Phase A to `main`.

---

## Build

- [ ] `npm run build` — exits 0, no errors
- [ ] `npm run typecheck` — zero TypeScript errors
- [ ] `npm run lint` — zero ESLint warnings or errors
- [ ] `npm pack --dry-run` — unpacked size < 300 KB (was 621 KB in v1.0.1)
- [ ] Build output: `splitting: true` shared chunk exists in `dist/`
- [ ] Build output: no `.map` files (sourcemap: false)

## Test Coverage

- [ ] `npm run test` — all tests pass
- [ ] Coverage: statements ≥ 90%
- [ ] Coverage: branches ≥ 85%
- [ ] Coverage: functions ≥ 95%
- [ ] New test files exist: `tests/unit/ipv6.test.ts`
- [ ] New test files exist: `tests/unit/resolveMessage.test.ts`
- [ ] New test files exist: `tests/unit/validateConfig.spec-003.test.ts`
- [ ] New test files exist: `tests/integration/express.spec-003.test.ts`
- [ ] New test files exist: `tests/integration/legacy-headers.test.ts`

## GAP-7: IPv6 Subnet Masking

- [ ] IPv4 address passes through unchanged
- [ ] Two IPv6 addresses in the same /56 produce the same rate limit key
- [ ] Two IPv6 addresses in different /56 subnets produce different keys
- [ ] `ipv6Subnet: false` produces raw verbatim key (same as v1.0.x)
- [ ] Custom `keyGenerator` ignores `ipv6Subnet`
- [ ] `maskIPv6` imports only BigInt (no `net` module in bundle)

## GAP-4: Legacy X-RateLimit-* Headers

- [ ] `legacyHeaders: true` → `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` present
- [ ] `x-ratelimit-reset` is a Unix epoch integer (not relative seconds)
- [ ] `legacyHeaders: false` (default) → no `x-ratelimit-*` headers
- [ ] Both `RateLimit-*` and `X-RateLimit-*` headers present simultaneously when both options are true
- [ ] `headers: false` suppresses both header sets

## GAP-11: Async keyGenerator and skip

- [ ] Async `keyGenerator` resolves and uses the resolved key
- [ ] Async `skip` returning `Promise<true>` skips the request
- [ ] Rejected async `keyGenerator` → `next(err)` in Express
- [ ] Rejected async `skip` → `next(err)` in Express

## GAP-8: requestPropertyName

- [ ] `req.rateLimit` is set after allowed request (default name)
- [ ] `req[customName]` is set when `requestPropertyName: 'customName'`
- [ ] Contains full `RateLimiterResult` object
- [ ] Not set when `skip()` returns true

## GAP-9: passOnStoreError

- [ ] `passOnStoreError: false` (default) — store error → `next(err)`
- [ ] `passOnStoreError: true` — store error → `next()` without error
- [ ] No rate limit headers set on pass-through
- [ ] `onLimit` is NOT called on pass-through

## GAP-12: handler callback

- [ ] `handler` replaces built-in 429 response
- [ ] `onLimit` fires before `handler`
- [ ] `handler` not defined → built-in 429 unchanged
- [ ] Async `handler` is awaited

## GAP-3: message as function

- [ ] Sync message function resolves and body is sent
- [ ] Async message function resolves and body is sent
- [ ] Object returned by message function is sent as JSON
- [ ] String returned by message function is sent as text

## Backward Compatibility

- [ ] Existing `max: 100, window: '15m'` config works without any changes
- [ ] Existing `headers: true` still sends IETF headers
- [ ] Existing `skip`, `keyGenerator`, `onLimit` (sync) still work
- [ ] Existing `message: 'Too many requests'` still works
- [ ] Express adapter: existing `req.ip` key generation still works for IPv4
