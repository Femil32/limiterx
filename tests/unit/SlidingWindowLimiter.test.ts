import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryStore } from '../../src/core/storage/MemoryStore.js'
import { SlidingWindowLimiter } from '../../src/core/algorithms/SlidingWindowLimiter.js'

describe('SlidingWindowLimiter', () => {
  let store: MemoryStore
  let limiter: SlidingWindowLimiter

  const WINDOW_MS = 60_000 // 1 minute
  const MAX = 5

  beforeEach(() => {
    vi.useFakeTimers()
    store = new MemoryStore({ maxKeys: 100, cleanupIntervalMs: 60_000 })
    limiter = new SlidingWindowLimiter(store, MAX, WINDOW_MS)
  })

  afterEach(() => {
    store.destroy()
    vi.useRealTimers()
  })

  it('allows up to max requests in a window', async () => {
    for (let i = 0; i < MAX; i++) {
      const result = await limiter.check('key', 'key')
      expect(result.allowed).toBe(true)
    }
  })

  it('denies on max + 1', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }
    const result = await limiter.check('key', 'key')
    expect(result.allowed).toBe(false)
  })

  it('remaining decrements correctly', async () => {
    const r1 = await limiter.check('key', 'key')
    expect(r1.remaining).toBe(MAX - 1)

    const r2 = await limiter.check('key', 'key')
    expect(r2.remaining).toBe(MAX - 2)
  })

  it('retryAfter is 0 when allowed', async () => {
    const result = await limiter.check('key', 'key')
    expect(result.retryAfter).toBe(0)
  })

  it('retryAfter is > 0 when denied', async () => {
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }
    const result = await limiter.check('key', 'key')
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('result has correct limit and key fields', async () => {
    const result = await limiter.check('limiterx:sw:user', 'user')
    expect(result.limit).toBe(MAX)
    expect(result.key).toBe('user')
  })

  it('count fully decays after two windows', async () => {
    vi.setSystemTime(0)
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }
    const denied = await limiter.check('key', 'key')
    expect(denied.allowed).toBe(false)

    // Advance two full windows — prev weight drops to 0
    vi.advanceTimersByTime(WINDOW_MS * 2)

    const result = await limiter.check('key', 'key')
    expect(result.allowed).toBe(true)
  })

  it('boundary burst: combined prev + curr cannot exceed max', async () => {
    vi.setSystemTime(0) // start at exact window boundary for determinism
    // Fill the window to max - 1 in the first window
    for (let i = 0; i < MAX - 1; i++) {
      await limiter.check('key', 'key')
    }

    // Move to exact start of next window (elapsed = 0 → prev weight = 1.0)
    vi.advanceTimersByTime(WINDOW_MS)

    // effectiveCount = (MAX-1) * 1.0 + 0 = MAX-1 < MAX → allowed
    const r1 = await limiter.check('key', 'key')
    expect(r1.allowed).toBe(true)

    // effectiveCount = (MAX-1) * 1.0 + 1 = MAX → denied
    const r2 = await limiter.check('key', 'key')
    expect(r2.allowed).toBe(false)
  })

  it('prev weight decreases as time passes in the current window', async () => {
    vi.setSystemTime(0) // start at exact window boundary for determinism
    // Fill exactly max requests in the first window
    for (let i = 0; i < MAX; i++) {
      await limiter.check('key', 'key')
    }

    // Move to 50% into the next window (elapsed = WINDOW_MS / 2)
    // prev weight = 1 - 0.5 = 0.5, effectiveCount = MAX * 0.5 + 0 = 2.5 < 5 → allow
    vi.advanceTimersByTime(WINDOW_MS + WINDOW_MS / 2)

    const result = await limiter.check('key', 'key')
    expect(result.allowed).toBe(true)
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

  it('resetAt is always a future Date', async () => {
    const result = await limiter.check('key', 'key')
    expect(result.resetAt).toBeInstanceOf(Date)
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now())
  })
})
