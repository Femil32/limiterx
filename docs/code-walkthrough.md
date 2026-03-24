# Limiterx - Code Walkthrough & Security Guide

A complete guide to understand the Limiterx codebase, its architecture, and security considerations.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [Core Layer Deep Dive](#core-layer-deep-dive)
4. [Adapter Layer Deep Dive](#adapter-layer-deep-dive)
5. [Data Flow](#data-flow)
6. [Security Analysis](#security-analysis)
7. [Testing Strategy](#testing-strategy)
8. [Key Design Decisions](#key-design-decisions)

---

## Architecture Overview

Limiterx follows a **core + adapters** pattern:

```
+-------------------------------------------------+
|                   User Code                      |
+----------+----------+----------+----------------+
| Express  |  React   |  Next.js |  Fetch/Axios   |  <-- Adapters
| Adapter  |  Hook    |  Adapter |  Wrappers      |      (thin glue)
+----------+----------+----------+----------------+
|              createRateLimiter()                  |  <-- Factory
+-------------------------------------------------+
|  FixedWindowLimiter  |  MemoryStore  |  Config   |  <-- Core
+-------------------------------------------------+
```

**Key principle:** The core is framework-agnostic. Adapters are thin wrappers that translate framework-specific APIs (Express req/res, React hooks, etc.) into core calls.

---

## Directory Structure

```
src/
├── core/
│   ├── types.ts                    # All TypeScript interfaces and types
│   ├── parseWindow.ts              # Duration string parser ("30s" -> 30000)
│   ├── validateConfig.ts           # Config validation (V-001 to V-012)
│   ├── createRateLimiter.ts        # Main factory function
│   ├── RateLimitError.ts           # Custom error class
│   ├── storage/
│   │   └── MemoryStore.ts          # In-memory store with LRU eviction
│   └── algorithms/
│       └── FixedWindowLimiter.ts   # Fixed window rate limiting algorithm
├── adapters/
│   ├── internal/
│   │   └── rate-limit-headers.ts   # Shared header helpers
│   ├── express.ts                  # Express middleware
│   ├── node.ts                     # Node HTTP adapter
│   ├── next.ts                     # Next.js API + Edge middleware
│   ├── koa.ts                      # Koa middleware
│   ├── react.ts                    # React hook
│   ├── fetch.ts                    # Fetch wrapper
│   └── axios.ts                    # Axios interceptor
└── index.ts                        # Barrel exports
```

---

## Core Layer Deep Dive

### `types.ts` - The Type Foundation

This file defines every interface used in the library. Key types:

- **`LimiterxConfig`** - What users pass in: `max`, `window`, `keyGenerator`, `skip`, `onLimit`, `message`, `statusCode`, `headers`, `debug`
- **`RateLimiterResult`** - What comes back from `check()`: `allowed`, `remaining`, `retryAfter`, `limit`, `resetTime`
- **`StorageAdapter`** - Internal interface for storage backends: `get()`, `set()`, `delete()`, `clear()`, `destroy()`
- **`FixedWindowState`** - The stored state per key: `{ count, windowStart, windowMs }`

### `parseWindow.ts` - Duration Parser

Converts human-readable duration strings to milliseconds:

```
"30s"  -> 30000
"5m"   -> 300000
"1h"   -> 3600000
100    -> 100 (raw milliseconds)
```

**Pattern:** `/^(\d+)(ms|s|m|h|d)$/`

**Security note:** Rejects `0ms`, negative values, `NaN`, `Infinity`, and non-numeric input. This prevents misconfigured rate limits that could either block all requests or allow unlimited requests.

### `validateConfig.ts` - Configuration Validator

Validates all config fields with specific error codes (V-001 through V-012):

| Code | Validates | Example Error |
|------|-----------|---------------|
| V-001 | `max` is a positive integer | `max must be a positive integer` |
| V-002 | `window` is valid duration | `window must be a positive duration` |
| V-003 | `keyGenerator` is a function | `keyGenerator must be a function` |
| V-004 | `skip` is a function | `skip must be a function` |
| V-005 | `onLimit` is a function | `onLimit must be a function` |
| V-006 | `message` is string/object | `message must be a string or object` |
| V-007 | `statusCode` is valid HTTP code | `statusCode must be 400-599` |
| V-008 | `headers` is boolean | `headers must be a boolean` |
| V-009 | `debug` is boolean | `debug must be a boolean` |
| V-010 | No unknown keys | `Unknown config keys: foo, bar` |
| V-011 | Config is a plain object | `Config must be a plain object` |
| V-012 | `message` constraints | Various message validations |

All errors are prefixed with `[limiterx] Invalid config:` for easy identification.

### `MemoryStore.ts` - In-Memory Storage

A `Map`-based store that tracks rate limit state per key.

**How LRU eviction works:**
- JavaScript `Map` preserves insertion order
- When `maxKeys` (default: 10,000) is exceeded, the oldest entry (first in iteration order) is deleted
- On each `set()`, the key is deleted and re-inserted to move it to the end (most recently used)

**TTL cleanup:**
- A `setInterval` runs every 60 seconds (timer is `unref()`'d so it won't keep Node alive)
- Iterates all entries and deletes expired ones
- `destroy()` clears the interval and all data

**Key insight:** The namespace prefix `limiterx:` is added by `createRateLimiter`, not by MemoryStore. The store is namespace-agnostic.

### `FixedWindowLimiter.ts` - The Algorithm

Implements fixed-window rate limiting with wall-clock alignment:

```
Window start = Math.floor(Date.now() / windowMs) * windowMs
```

This means all clients share the same window boundaries. For a 30-second window starting at time 0, windows are `[0-30s)`, `[30-60s)`, etc.

**The check flow:**
1. Read current state from storage for the key
2. If no state or window has expired -> start a new window with count=1
3. If within current window -> increment count
4. If count > max -> return `{ allowed: false, retryAfter: msUntilWindowEnd }`
5. Otherwise -> return `{ allowed: true, remaining: max - count }`

### `createRateLimiter.ts` - The Factory

This is the main entry point that wires everything together:

```ts
const limiter = createRateLimiter({ max: 5, window: '30s' });
```

**What it does:**
1. Validates config via `validateConfig()`
2. Creates a `MemoryStore` instance
3. Creates a `FixedWindowLimiter` instance
4. Returns `{ check, reset, clear, destroy }`

**Key behaviors:**
- Empty key (`""`) falls back to `"global"`
- Keys are namespaced: `"my-key"` becomes `"limiterx:my-key"`
- `onLimit` callback errors are silently swallowed (logged in debug mode)
- `keyGenerator` errors propagate up (FR-019)

### `RateLimitError.ts` - Custom Error

```ts
class RateLimitError extends Error {
  name = 'RateLimitError';
  result: RateLimiterResult;
}
```

Used by the fetch and axios adapters to throw when a request is blocked client-side. The `result` property gives access to `remaining`, `retryAfter`, etc.

---

## Adapter Layer Deep Dive

### Shared: `rate-limit-headers.ts`

Helper that sets standard `RateLimit-*` headers on responses:

```
RateLimit-Limit: 5
RateLimit-Remaining: 3
RateLimit-Reset: 27        (seconds until window reset)
Retry-After: 27            (only on 429 responses)
```

**Important:** Only standard headers are used. No `X-RateLimit-*` prefixed headers.

### Express Adapter (`express.ts`)

Returns Express middleware `(req, res, next)`:

```
Request -> skip? -> keyGenerator -> limiter.check() -> allowed? -> next() or 429
```

- **skip:** If `skip(req)` returns true, calls `next()` immediately without touching the limiter
- **FR-019:** `keyGenerator` errors are caught and passed to `next(err)` for Express error handling
- **onLimit:** Called when denied, but errors in onLimit are swallowed
- Passes `onLimit: undefined` to `createRateLimiter` to prevent double-firing

### Node HTTP Adapter (`node.ts`)

Returns `{ check(req, res) }` -- the developer controls the response:

```ts
const result = await limiter.check(req, res);
if (!result.allowed) {
  res.writeHead(429);
  res.end('Too many requests');
  return;
}
```

Headers are set automatically, but the response is your responsibility.

### Next.js Adapter (`next.ts`)

Two functions:

1. **`rateLimitNext()`** - For API routes. Returns `null` (allowed) or a `NextResponse` (429).
2. **`rateLimitEdge()`** - For Edge middleware. Returns `undefined` (allowed, continue to route) or a `Response` (429).

### Koa Adapter (`koa.ts`)

Koa middleware that sets `ctx.status = 429` and `ctx.body` on deny.

### React Hook (`react.ts`)

```ts
const { allowed, remaining, retryAfter, attempt, reset } = useRateLimit('key', config);
```

- Uses `useState` for reactive UI updates
- Uses `useRef` for the limiter instance (persists across renders)
- Uses `useEffect` for cleanup (calls `destroy()` on unmount)
- `attempt()` calls `check()` and updates state
- Auto-reset timer fires when the current window expires

### Fetch Wrapper (`fetch.ts`)

Wraps the global `fetch` function:

```ts
const limitedFetch = rateLimitFetch(fetch, { max: 5, window: '30s' });
const response = await limitedFetch('https://api.example.com/data');
```

Throws `RateLimitError` if the rate limit is exceeded (request is never sent).

### Axios Interceptor (`axios.ts`)

Adds a request interceptor to an Axios instance:

```ts
rateLimitAxios(client, { max: 5, window: '30s', key: 'api' });
```

The interceptor runs before each request. If denied, it rejects with `RateLimitError` (request is never sent).

---

## Data Flow

### Backend Request (Express Example)

```
HTTP Request
  |
  v
Express Middleware
  |
  +-- skip(req)? --yes--> next() (no rate limit check)
  |
  +-- keyGenerator(req) -> "user:123"
  |
  v
createRateLimiter.check("user:123")
  |
  +-- Namespace: "limiterx:user:123"
  |
  v
FixedWindowLimiter.check()
  |
  +-- MemoryStore.get("limiterx:user:123")
  |   Returns { count: 4, windowStart: 1711234560000, windowMs: 30000 }
  |
  +-- count++ -> 5 (within max)
  |
  +-- MemoryStore.set("limiterx:user:123", { count: 5, ... })
  |
  Returns { allowed: true, remaining: 0, retryAfter: 0 }
        |
        v
  Set headers: RateLimit-Remaining: 0
  Call next()
```

### Frontend Request (React Example)

```
User clicks button
  |
  v
attempt()
  |
  v
createRateLimiter.check("demo")
  |
  +-- MemoryStore (in-browser memory)
  |
  Returns { allowed: false, remaining: 0, retryAfter: 15000 }
        |
        v
  setState({ allowed: false, remaining: 0, retryAfter: 15000 })
  |
  v
  onLimit callback fires -> alert("Rate limited!")
  |
  v
  setTimeout(auto-reset, 15000)
```

---

## Security Analysis

### What Limiterx Protects Against

1. **Brute force attacks** - Limits login attempts, API calls per user/IP
2. **DoS from individual clients** - Prevents single clients from overwhelming your server
3. **Resource exhaustion** - Caps memory usage via `maxKeys` with LRU eviction

### What Limiterx Does NOT Protect Against

1. **Distributed DoS (DDoS)** - In-memory store is per-process; use Redis-backed solutions for distributed rate limiting
2. **IP spoofing** - The default key is `req.ip`; ensure your reverse proxy sets `X-Forwarded-For` correctly
3. **Multi-process environments** - Each Node.js process has its own MemoryStore; use a shared store (e.g., Redis) in production clusters

### Security Properties of the Code

#### Input Validation (Strong)
- All config is validated at creation time with specific error codes
- Duration strings are parsed with a strict regex -- no `eval()` or `new Function()`
- `max` must be a positive integer (rejects `0`, negatives, floats, `Infinity`)
- `statusCode` is bounded to 400-599
- Unknown config keys are rejected (V-010) to catch typos

#### Memory Safety (Strong)
- **LRU eviction** prevents unbounded memory growth (default cap: 10,000 keys)
- **TTL cleanup** removes expired entries every 60 seconds
- **`destroy()`** clears all state and stops the cleanup timer
- Timer is `unref()`'d -- won't prevent Node from exiting

#### Error Handling (Deliberate)
- **`keyGenerator` errors propagate** (FR-019): If your key function throws, the error reaches your error handler. This is intentional -- a broken key function means you can't rate limit, so it's better to fail loudly.
- **`onLimit` errors are swallowed**: The rate limiting decision is already made. Crashing because a notification callback failed would be worse than silently dropping the notification.

#### No Eval or Dynamic Code
- Zero use of `eval()`, `new Function()`, or dynamic `require()`
- No string interpolation in any security-sensitive context
- No prototype pollution vectors -- config is validated as a plain object

#### Header Safety
- Only standard `RateLimit-*` headers are set
- Header values are numeric (coerced via `Math.ceil`) -- no user input in headers
- No `X-RateLimit-*` headers (avoids header injection vectors in legacy proxies)

#### Dependency Security
- **Zero runtime dependencies** in core
- Peer dependencies (express, react, etc.) are optional
- Dev dependencies are standard, well-maintained packages

### Security Checklist for Your Deployment

- [ ] **Set a proper `keyGenerator`** -- the default uses IP, but behind a proxy you may need `req.headers['x-forwarded-for']`
- [ ] **Configure `trust proxy`** in Express if behind a load balancer
- [ ] **Set appropriate `max` and `window`** -- too generous defeats the purpose
- [ ] **Monitor rate limit hits** via the `onLimit` callback (log, alert, etc.)
- [ ] **Use HTTPS** -- rate limiting by IP is meaningless if IPs can be spoofed via unencrypted connections
- [ ] **Consider distributed rate limiting** for multi-process/multi-server deployments (Limiterx v1 is single-process only)
- [ ] **Don't expose rate limit internals** to clients beyond standard headers

---

## Testing Strategy

### Test Pyramid

```
                      Perf       1 test  (latency guard)
                   Integration   ~80 tests (adapters, headers, errors)
                    Contract     20 tests (createRateLimiter API)
                      Unit       ~120 tests (parseWindow, validate, store, limiter)
```

### Key Testing Techniques

- **Fake timers** (`vi.useFakeTimers()`): Used in FixedWindowLimiter and React tests to control time without waiting
- **Supertest**: Express integration tests make real HTTP requests to an in-memory server
- **jsdom**: React hook tests run in a simulated browser environment
- **Mock functions**: Axios and fetch tests use mocked instances to avoid real HTTP calls

### Coverage Thresholds

| Metric | Threshold | Actual |
|--------|-----------|--------|
| Statements | 90% | ~98% |
| Branches | 85% | ~94% |
| Functions | 95% | ~98% |

---

## Key Design Decisions

### Why Fixed Window (Not Sliding)?

Fixed window is simpler, uses less memory (one counter per key vs. a list of timestamps), and is sufficient for most use cases. The trade-off is that a burst at the window boundary can allow up to 2x the rate momentarily. For v1, simplicity wins.

### Why In-Memory Storage Only?

For a v1 release, in-memory storage covers the most common single-process use case without adding a Redis/external dependency. The `StorageAdapter` interface exists internally, making it straightforward to add Redis/Memcached adapters in v2.

### Why `onLimit` Errors Are Swallowed

The rate limiting decision has already been made when `onLimit` fires. If the callback throws (e.g., a logging service is down), crashing the request would be worse than silently continuing. Debug mode logs these errors for troubleshooting.

### Why `keyGenerator` Errors Propagate

Unlike `onLimit`, a broken `keyGenerator` means you cannot identify the client. Rate limiting without knowing who to limit is meaningless, so it's better to fail fast and let your error handler respond with a 500.

### Why No `X-RateLimit-*` Headers

The standard `RateLimit-*` headers (RFC draft) are sufficient. Legacy `X-` prefixed headers add confusion, increase response size, and some proxies treat `X-` headers differently. Clean break for a new library.

### Why `sideEffects: false`

Enables bundlers (webpack, Rollup, esbuild) to tree-shake unused adapters. If you only import `limiterx/express`, the React hook and Axios interceptor code are eliminated from your bundle.
