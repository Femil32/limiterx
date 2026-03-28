import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryStore } from '../../src/core/storage/MemoryStore.js'
import { TokenBucketLimiter } from '../../src/core/algorithms/TokenBucketLimiter.js'

describe('TokenBucketLimiter', () => {
  let store: MemoryStore
  let limiter: TokenBucketLimiter

  const WINDOW_MS = 1000 // 1 second refill window
  const MAX = 5

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    store = new MemoryStore({ maxKeys: 100, cleanupIntervalMs: 60_000 })
    limiter = new TokenBucketLimiter(store, MAX, WINDOW_MS)
  })

  afterEach(() => {
    store.destroy()
    vi.useRealTimers()
  })

  it('full bucket: max consecutive requests all allowed', async () => {
    for (let i = 0; i < MAX; i++) {
      const result = await limiter.check('key', 'key')
      expect(result.allowed).toBe(true)
    }
  })

  it('bucket exhausted: next request after max is denied', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }
    const result = await limiter.check('key', 'key')
    expect(result.allowed).toBe(false)
  })

  it('remaining reflects available tokens', async () => {
    const r1 = await limiter.check('key', 'key')
    expect(r1.remaining).toBe(MAX - 1)

    const r2 = await limiter.check('key', 'key')
    expect(r2.remaining).toBe(MAX - 2)
  })

  it('remaining is 0 when denied', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }
    const result = await limiter.check('key', 'key')
    expect(result.remaining).toBe(0)
  })

  it('retryAfter is 0 when allowed', async () => {
    const result = await limiter.check('key', 'key')
    expect(result.retryAfter).toBe(0)
  })

  it('retryAfter reflects time until 1 token refills', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }
    const result = await limiter.check('key', 'key')
    expect(result.retryAfter).toBeGreaterThan(0)
    // retryAfter should be at most one full window (ms per token)
    expect(result.retryAfter).toBeLessThanOrEqual(WINDOW_MS)
  })

  it('partial refill: allows requests after half-refill time', async () => {
    // Exhaust the bucket
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }

    // Advance half the refill window — refills floor(MAX * 0.5) = 2 tokens
    vi.advanceTimersByTime(WINDOW_MS / 2)

    const result = await limiter.check('key', 'key')
    expect(result.allowed).toBe(true)
  })

  it('max: 1 edge case — single request allowed, second denied until refill', async () => {
    const singleLimiter = new TokenBucketLimiter(store, 1, WINDOW_MS)
    const key = 'single-key'

    const r1 = await singleLimiter.check(key, key)
    expect(r1.allowed).toBe(true)

    const r2 = await singleLimiter.check(key, key)
    expect(r2.allowed).toBe(false)

    // Advance full window — 1 token refills
    vi.advanceTimersByTime(WINDOW_MS)

    const r3 = await singleLimiter.check(key, key)
    expect(r3.allowed).toBe(true)
  })

  it('result has correct limit field', async () => {
    const result = await limiter.check('key', 'key')
    expect(result.limit).toBe(MAX)
  })

  it('result has correct key field', async () => {
    const result = await limiter.check('k', 'user')
    expect(result.key).toBe('user')
  })

  it('different keys are tracked independently', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.check('keyA', 'keyA')
    }
    const deniedA = await limiter.check('keyA', 'keyA')
    expect(deniedA.allowed).toBe(false)

    const allowedB = await limiter.check('keyB', 'keyB')
    expect(allowedB.allowed).toBe(true)
  })

  it('full refill after one window period', async () => {
    // Exhaust
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }

    // Advance one full window
    vi.advanceTimersByTime(WINDOW_MS)

    // Should now allow MAX again
    for (let i = 0; i < MAX; i++) {
      const result = await limiter.check('key', 'key')
      expect(result.allowed).toBe(true)
    }
  })

  it('resetAt is a valid future Date', async () => {
    const result = await limiter.check('key', 'key')
    expect(result.resetAt).toBeInstanceOf(Date)
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now())
  })
})
