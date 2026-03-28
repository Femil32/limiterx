# express-rate-limit Parity — Gap Checklist

**Reference**: `specs/003-express-rate-limit-parity/research.md`
**Source**: express-rate-limit v7.x

---

## P0 — Security

- [x] **GAP-7**: `ipv6Subnet` masking in default key generator (default: 56-bit mask) ✅ Phase A (v1.1.0)

## P1 — Compatibility / Ecosystem

- [x] **GAP-4**: `legacyHeaders` option → emit `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` ✅ Phase A (v1.1.0)
- [x] **GAP-11a**: Async `keyGenerator` — `(ctx) => string | Promise<string>` ✅ Phase A (v1.1.0)
- [x] **GAP-11b**: Async `skip` — `(ctx) => boolean | Promise<boolean>` ✅ Phase A (v1.1.0)

## P2 — Developer Experience

- [x] **GAP-8**: `requestPropertyName` — attach `RateLimiterResult` to `req[name]` (Express adapter) ✅ Phase A (v1.1.0)
- [x] **GAP-9**: `passOnStoreError` — fail-open mode when storage throws ✅ Phase A (v1.1.0)
- [x] **GAP-12**: `handler` callback — full response replacement for denied requests ✅ Phase A (v1.1.0)
- [x] **GAP-3**: `message` as function — `(result, ctx) => string | object | Promise<string | object>` ✅ Phase A (v1.1.0)

## P3 — Advanced Features

- [x] **GAP-1**: Dynamic `limit` — `max` as `number | (ctx) => number | Promise<number>`
- [x] **GAP-2a**: `skipSuccessfulRequests` — decrement counter if response status < 400
- [x] **GAP-2b**: `skipFailedRequests` — decrement counter if response status >= 400
- [x] **GAP-2c**: `requestWasSuccessful` — custom success predicate for skip options
- [x] **GAP-5**: `standardHeaders` draft selector (`'draft-6' | 'draft-7' | 'draft-8'`)
- [x] **GAP-6**: `identifier` config + `RateLimit-Policy` header (draft-8)

## P4 — Operational

- [x] **GAP-10**: `validate` named checks — runtime config warnings with per-check toggle

---

## Already Covered / Not Applicable

| Item | Status |
|---|---|
| Fixed window algorithm | ✅ limiterx v1.0 |
| Static `max` + `window` config | ✅ limiterx v1.0 |
| `skip` function (sync) | ✅ limiterx v1.0 |
| `onLimit` callback | ✅ limiterx v1.0 |
| `message` string or object | ✅ limiterx v1.0 |
| `statusCode` config | ✅ limiterx v1.0 |
| `headers` toggle | ✅ limiterx v1.0 |
| IETF draft-7 standard headers | ✅ limiterx v1.0 |
| TypeScript support | ✅ limiterx v1.0 |
| ESM + CJS dual output | ✅ limiterx v1.0 |
| Sliding window algorithm | 🗓 spec-002 |
| Token bucket algorithm | 🗓 spec-002 |
| Redis storage adapter | 🗓 spec-002 |
| React adapter | ✅ limiterx v1.0 (express-rate-limit lacks this) |
| Koa / Next.js / fetch / axios adapters | ✅ limiterx v1.0 (express-rate-limit lacks these) |
