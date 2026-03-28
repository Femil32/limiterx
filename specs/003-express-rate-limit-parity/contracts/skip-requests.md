# Contract: skipSuccessfulRequests / skipFailedRequests

**Feature**: `003-express-rate-limit-parity`
**Type**: Normative specification (Phase B)

---

## Purpose

`skipSuccessfulRequests` and `skipFailedRequests` allow the rate limiter to post-hoc "undo" counting a request after the response status is known. This is commonly used for:

- **Login protection**: count only failed logins, not successful ones (prevents penalising legitimate users)
- **Error budgets**: count only 5xx errors toward a limit (protect against backend failures)

---

## Lifecycle

```
Request arrives
  1. keyGenerator resolves → key
  2. skip() → false (not skipped)
  3. limiter.check(key) → result.allowed = true, count incremented
  4. Headers set on response
  5. If skipSuccessfulRequests || skipFailedRequests:
       res.on('finish', decrementCallback) registered
  6. next() called

  ... downstream handler runs, sets status code, calls res.end() ...

  7. 'finish' event fires
  8. decrementCallback evaluates requestWasSuccessful(ctx):
       - default: res.statusCode < 400
       - custom: requestWasSuccessful option
  9. If condition met → limiter.decrement(key)
     Else → no-op

Net effect:
  - Successful request (status 200): count goes N→N+1→N (net: not counted)
  - Failed request (status 401): count goes N→N+1 (net: counted)
```

---

## Decrement Invariants

1. **Only on allowed requests.** If `result.allowed = false` (request was already at the limit), no finish hook is registered. The counter was not incremented for a denied request.

2. **Floor at zero.** `decrement` never goes below 0. If the counter is already 0 when `finish` fires, the decrement is a no-op.

3. **No-op on expired keys.** If the window has rolled over before `finish` fires (slow downstream handler, long timeout), `decrement` on a missing or expired key is silently ignored. This is correct — the new window has already started fresh.

4. **At most once per request.** The `finish` event fires exactly once per response. The decrement fires at most once per allowed request.

5. **Does not affect `remaining` already sent.** The `RateLimit-Remaining` header was set before `next()` was called and is already in the response. The decrement only affects the storage counter for the NEXT request's check.

6. **Error safety.** Any error thrown by `limiter.decrement` inside the `finish` callback is silently swallowed. The response has already been sent; errors must not interfere.

---

## `requestWasSuccessful` Default Behaviour

| Adapter | Default predicate |
|---|---|
| Express | `res.statusCode < 400` |
| Koa | `ctx.status < 400` |
| Next.js (API) | `res.statusCode < 400` |
| rateLimitEdge | **Not supported** |

When both `skipSuccessfulRequests: true` and `skipFailedRequests: true` are set simultaneously, the behaviour is:

- successful response (status < 400): decrement (from `skipSuccessfulRequests`)
- failed response (status ≥ 400): decrement (from `skipFailedRequests`)
- result: **every** request is decremented → rate limiting is effectively disabled

This edge case should be documented with a warning in JSDoc.

---

## `rateLimitEdge` Limitation

Edge middleware returns a `Response` object immediately. There is no `finish` event on a `Response`. `skipSuccessfulRequests` and `skipFailedRequests` are **not supported** in `rateLimitEdge`.

If set, a `console.warn` is emitted at construction time:
```
[limiterx:validate] 'skipSuccessfulRequests' is not supported in rateLimitEdge.
```

---

## `StorageAdapter.decrement` Contract

```typescript
decrement(key: string, ttlMs: number): Promise<void>
```

- Subtracts 1 from the count for `key`.
- If count would go below 0, floor at 0.
- If `key` does not exist or has expired: no-op (do not create a new entry).
- `ttlMs` is passed for consistency but MAY be ignored in the default `MemoryStore` implementation since the TTL is already set on the existing entry.

### MemoryStore implementation

```typescript
async decrement(key: string, _ttlMs: number): Promise<void> {
  const entry = this.map.get(key);
  if (!entry) return;
  if (entry.expiresAt < Date.now()) {
    this.map.delete(key);
    return;
  }
  entry.count = Math.max(0, entry.count - 1);
  // No LRU reorder — this is not a fresh access
}
```

---

## `RateLimiter.decrement` Contract

```typescript
decrement(key: string): Promise<void>
```

Exposed on the public `RateLimiter` interface to allow adapters to call it with the user-facing key (not the namespaced key). `createRateLimiter` implements it as:

```typescript
async decrement(key: string): Promise<void> {
  const resolvedKey = key === '' ? 'global' : key;
  await store.decrement(`${KEY_PREFIX}${resolvedKey}`, windowMs);
}
```
