# Checklist: Phase B Verification Gates

**Feature**: `003-express-rate-limit-parity`
**Phase**: B — P3 (Advanced) + P4 (Ops)

Run these checks before merging Phase B to `main`.

---

## Build

- [x] `npm run build` — exits 0, no errors
- [x] `npm run typecheck` — zero TypeScript errors
- [x] `npm run lint` — zero ESLint warnings or errors
- [x] `npm pack --dry-run` — unpacked size still < 300 KB

## GAP-1: Dynamic max

- [x] `max` as number still works (unchanged)
- [x] `max` as sync function — different keys get different limits
- [x] `max` as async function — resolved correctly
- [x] Throwing `max` function → `next(err)`
- [x] `RateLimiterResult.limit` reflects the resolved max (not a stale config value)

## GAP-2: skipSuccessfulRequests

- [x] `skipSuccessfulRequests: true` — 200 response does NOT consume quota (counter decremented on finish)
- [x] `skipSuccessfulRequests: true` — 401 response DOES consume quota (no decrement)
- [x] `skipFailedRequests: true` — 401 response does NOT consume quota
- [x] `skipFailedRequests: true` — 200 response DOES consume quota
- [x] `requestWasSuccessful` custom predicate used when provided
- [x] Denied request (429 already sent) — no finish hook registered
- [x] `decrement` on an expired/missing key — no-op, no error
- [x] Both options true simultaneously — effectively disables counting (documented edge case)
- [x] `rateLimitEdge` with these options — `console.warn` emitted at construction, options silently ignored

## GAP-5: standardHeaders

- [x] `standardHeaders: 'draft-7'` (default) — same output as Phase A
- [x] `standardHeaders: 'draft-6'` — single `RateLimit` header, no separate fields
- [x] `standardHeaders: 'draft-8'` — draft-7 fields + `RateLimit-Policy`
- [x] `RateLimit-Policy` format: `"{limit};w={windowSec}"`

## GAP-6: identifier

- [x] `identifier: 'my-policy'` → `RateLimit-Policy: my-policy` (with draft-8)
- [x] `identifier: (ctx) => 'dynamic-' + ctx.key` → dynamic policy name
- [x] `identifier` without `standardHeaders: 'draft-8'` → silently ignored (no header emitted)

## GAP-10: validate

- [x] `validate: false` — no warnings emitted
- [x] `validate: true` (default) — warnings enabled
- [x] `validate: { windowMs: false }` — windowMs check suppressed, others active
- [x] `windowMs > 2_147_483_647` → `console.warn('[limiterx:validate] …')`
- [x] Same warning fires only once per process (not per request)
- [x] `validate` field itself validates correctly (must be boolean or Record)

## StorageAdapter.decrement

- [x] `MemoryStore.decrement` exists and subtracts 1 (floor at 0)
- [x] `MemoryStore.decrement` on missing key — no-op
- [x] `MemoryStore.decrement` on expired key — deletes key, no-op
- [x] `RateLimiter.decrement` properly namespaces key

## Backward Compatibility (Phase B additions)

- [x] Static `max` number still works unchanged
- [x] `skipSuccessfulRequests` absent → no finish hook registered (zero overhead)
- [x] `standardHeaders` absent → defaults to 'draft-7' (same as Phase A)
- [x] `validate` absent → defaults to `true` but no warnings on valid configs
