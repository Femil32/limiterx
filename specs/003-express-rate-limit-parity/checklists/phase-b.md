# Checklist: Phase B Verification Gates

**Feature**: `003-express-rate-limit-parity`
**Phase**: B — P3 (Advanced) + P4 (Ops)

Run these checks before merging Phase B to `main`.

---

## Build

- [ ] `npm run build` — exits 0, no errors
- [ ] `npm run typecheck` — zero TypeScript errors
- [ ] `npm run lint` — zero ESLint warnings or errors
- [ ] `npm pack --dry-run` — unpacked size still < 300 KB

## GAP-1: Dynamic max

- [ ] `max` as number still works (unchanged)
- [ ] `max` as sync function — different keys get different limits
- [ ] `max` as async function — resolved correctly
- [ ] Throwing `max` function → `next(err)`
- [ ] `RateLimiterResult.limit` reflects the resolved max (not a stale config value)

## GAP-2: skipSuccessfulRequests

- [ ] `skipSuccessfulRequests: true` — 200 response does NOT consume quota (counter decremented on finish)
- [ ] `skipSuccessfulRequests: true` — 401 response DOES consume quota (no decrement)
- [ ] `skipFailedRequests: true` — 401 response does NOT consume quota
- [ ] `skipFailedRequests: true` — 200 response DOES consume quota
- [ ] `requestWasSuccessful` custom predicate used when provided
- [ ] Denied request (429 already sent) — no finish hook registered
- [ ] `decrement` on an expired/missing key — no-op, no error
- [ ] Both options true simultaneously — effectively disables counting (documented edge case)
- [ ] `rateLimitEdge` with these options — `console.warn` emitted at construction, options silently ignored

## GAP-5: standardHeaders

- [ ] `standardHeaders: 'draft-7'` (default) — same output as Phase A
- [ ] `standardHeaders: 'draft-6'` — single `RateLimit` header, no separate fields
- [ ] `standardHeaders: 'draft-8'` — draft-7 fields + `RateLimit-Policy`
- [ ] `RateLimit-Policy` format: `"{limit};w={windowSec}"`

## GAP-6: identifier

- [ ] `identifier: 'my-policy'` → `RateLimit-Policy: my-policy` (with draft-8)
- [ ] `identifier: (ctx) => 'dynamic-' + ctx.key` → dynamic policy name
- [ ] `identifier` without `standardHeaders: 'draft-8'` → silently ignored (no header emitted)

## GAP-10: validate

- [ ] `validate: false` — no warnings emitted
- [ ] `validate: true` (default) — warnings enabled
- [ ] `validate: { windowMs: false }` — windowMs check suppressed, others active
- [ ] `windowMs > 2_147_483_647` → `console.warn('[limiterx:validate] …')`
- [ ] Same warning fires only once per process (not per request)
- [ ] `validate` field itself validates correctly (must be boolean or Record)

## StorageAdapter.decrement

- [ ] `MemoryStore.decrement` exists and subtracts 1 (floor at 0)
- [ ] `MemoryStore.decrement` on missing key — no-op
- [ ] `MemoryStore.decrement` on expired key — deletes key, no-op
- [ ] `RateLimiter.decrement` properly namespaces key

## Backward Compatibility (Phase B additions)

- [ ] Static `max` number still works unchanged
- [ ] `skipSuccessfulRequests` absent → no finish hook registered (zero overhead)
- [ ] `standardHeaders` absent → defaults to 'draft-7' (same as Phase A)
- [ ] `validate` absent → defaults to `true` but no warnings on valid configs
