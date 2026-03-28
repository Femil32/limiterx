# Contract: Rate Limit Header Formats

**Feature**: `003-express-rate-limit-parity`
**Type**: Normative specification

---

## Current Headers (v1.0.x — unchanged)

All backend adapters emit these when `headers: true` (default):

| Header | Value | When |
|---|---|---|
| `RateLimit-Limit` | `Math.ceil(result.limit)` — integer | Every response |
| `RateLimit-Remaining` | `Math.ceil(result.remaining)` — integer | Every response |
| `RateLimit-Reset` | `Math.ceil((result.resetAt - now) / 1000)` — **relative seconds** | Every response |
| `Retry-After` | Same as `RateLimit-Reset` | Denied responses only |

These are IETF draft-7-style headers. `RateLimit-Reset` is a **relative countdown** (seconds until window resets).

---

## New: Legacy Headers (v1.2.0 — `legacyHeaders: true`)

When `legacyHeaders: true`, the following headers are added **in addition to** the standard IETF headers:

| Header | Value | When |
|---|---|---|
| `X-RateLimit-Limit` | `Math.ceil(result.limit)` — integer | Every response |
| `X-RateLimit-Remaining` | `Math.ceil(result.remaining)` — integer | Every response |
| `X-RateLimit-Reset` | `Math.floor(result.resetAt.getTime() / 1000)` — **Unix epoch timestamp** | Every response |

### Critical Distinction: Reset Values

```
RateLimit-Reset: 57          ← relative: "57 seconds until reset"
X-RateLimit-Reset: 1743184457  ← absolute: "reset at Unix time 1743184457"
```

- `RateLimit-Reset` is a **relative offset** in integer seconds (IETF standard).
- `X-RateLimit-Reset` is an **absolute Unix epoch timestamp** in integer seconds (legacy convention established by GitHub, Twitter, Stripe APIs).

This distinction is NOT a bug — it is intentional and must be preserved for compatibility with clients that expect the epoch format.

### Computation

```typescript
// Standard (relative — existing behaviour)
const resetSeconds = result.allowed
  ? Math.ceil(Math.max(0, result.resetAt.getTime() - Date.now()) / 1000)
  : Math.ceil(result.retryAfter / 1000);
setHeader('RateLimit-Reset', String(resetSeconds));

// Legacy (absolute epoch — new)
const epochSeconds = Math.floor(result.resetAt.getTime() / 1000);
setHeader('X-RateLimit-Reset', String(epochSeconds));
```

---

## Phase B: IETF Header Drafts

### `standardHeaders: 'draft-7'` (current default)

Separate fields, relative reset:
```
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 857
Retry-After: 857        ← denied only
```

### `standardHeaders: 'draft-6'`

Single combined header (structured dictionary):
```
RateLimit: limit=100, remaining=42, reset=857
Retry-After: 857        ← denied only
```

No separate `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` fields with draft-6.

### `standardHeaders: 'draft-8'`

Same as draft-7, plus policy header:
```
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 857
RateLimit-Policy: 100;w=900    ← new: "{limit};w={windowSeconds}"
Retry-After: 857               ← denied only
```

`RateLimit-Policy` format: `{limit};w={windowSec}` where `windowSec = Math.floor(windowMs / 1000)`.

When `identifier` is set to a string value, it replaces the auto-generated policy:
```
identifier: 'pro-tier'  →  RateLimit-Policy: pro-tier
```

When `identifier` is a function: `const id = identifier(ctx); setHeader('RateLimit-Policy', id)`.

---

## Header Interaction Matrix

| `headers` | `legacyHeaders` | `standardHeaders` | IETF headers | X-RateLimit-* |
|---|---|---|---|---|
| `true` (default) | `false` (default) | `'draft-7'` | ✅ | ❌ |
| `true` | `true` | `'draft-7'` | ✅ | ✅ |
| `false` | `false` | any | ❌ | ❌ |
| `false` | `true` | any | ❌ | ❌ (headers: false gates all) |

`headers: false` suppresses all rate limit header emission regardless of `legacyHeaders`.

---

## `setRateLimitHeaders` Helper Signature

```typescript
// src/adapters/internal/rate-limit-headers.ts
export function setRateLimitHeaders(
  setHeader: (name: string, value: string) => void,
  result: RateLimiterResult,
  options: {
    standard: boolean;        // emit IETF RateLimit-* headers
    legacyHeaders: boolean;   // emit X-RateLimit-* headers
    // Phase B:
    // standardHeaders?: 'draft-6' | 'draft-7' | 'draft-8';
    // identifier?: string;
    // windowMs?: number;
  },
): void

// Backward-compatible alias (Phase A migration target)
export function setRateLimitHeadersFull(
  setHeader: (name: string, value: string) => void,
  result: RateLimiterResult,
): void
// Equivalent to: setRateLimitHeaders(setHeader, result, { standard: true, legacyHeaders: false })
```
