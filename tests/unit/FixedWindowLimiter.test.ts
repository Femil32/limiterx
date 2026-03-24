import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FixedWindowLimiter } from '../../src/core/algorithms/FixedWindowLimiter.js'
import { MemoryStore } from '../../src/core/storage/MemoryStore.js'

describe('FixedWindowLimiter', () => {
  let store: MemoryStore
  let limiter: FixedWindowLimiter

  const windowMs = 60_000 // 1 minute
  const max = 5

  beforeEach(() => {
    vi.useFakeTimers()
    // Align to a clean window boundary
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
    store = new MemoryStore({ maxKeys: 1000, cleanupIntervalMs: 300_000 })
    limiter = new FixedWindowLimiter(store, max, windowMs)
  })

  afterEach(() => {
    store.destroy()
    vi.useRealTimers()
  })

  describe('wall-clock alignment', () => {
    it('resetAt aligns to window boundary', async () => {
      const now = Date.now()
      const expectedWindowEnd = Math.floor(now / windowMs) * windowMs + windowMs
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.resetAt.getTime()).toBe(expectedWindowEnd)
    })

    it('two requests in the same window share the same resetAt', async () => {
      const r1 = await limiter.check('flowguard:user', 'user')
      const r2 = await limiter.check('flowguard:user', 'user')
      expect(r1.resetAt.getTime()).toBe(r2.resetAt.getTime())
    })
  })

  describe('allow/deny transitions', () => {
    it('allows the first 5 requests (up to max)', async () => {
      for (let i = 0; i < max; i++) {
        const result = await limiter.check('flowguard:user', 'user')
        expect(result.allowed).toBe(true)
      }
    })

    it('denies the 6th request (exceeds max)', async () => {
      for (let i = 0; i < max; i++) {
        await limiter.check('flowguard:user', 'user')
      }
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.allowed).toBe(false)
    })

    it('remaining decreases with each allowed request', async () => {
      const expectedRemaining = [4, 3, 2, 1, 0]
      for (const expected of expectedRemaining) {
        const result = await limiter.check('flowguard:user', 'user')
        expect(result.remaining).toBe(expected)
      }
    })

    it('remaining is 0 when denied', async () => {
      for (let i = 0; i < max; i++) {
        await limiter.check('flowguard:user', 'user')
      }
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.remaining).toBe(0)
    })
  })

  describe('retryAfter', () => {
    it('retryAfter is 0 when request is allowed', async () => {
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.retryAfter).toBe(0)
    })

    it('retryAfter is positive when request is denied', async () => {
      for (let i = 0; i < max; i++) {
        await limiter.check('flowguard:user', 'user')
      }
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('retryAfter equals ms remaining in the window when denied', async () => {
      const now = Date.now()
      const windowEnd = Math.floor(now / windowMs) * windowMs + windowMs

      for (let i = 0; i < max; i++) {
        await limiter.check('flowguard:user', 'user')
      }
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.retryAfter).toBe(windowEnd - now)
    })
  })

  describe('result fields', () => {
    it('limit reflects the configured max', async () => {
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.limit).toBe(max)
    })

    it('key reflects the displayKey passed in', async () => {
      const result = await limiter.check('flowguard:user-123', 'user-123')
      expect(result.key).toBe('user-123')
    })

    it('resetAt is a valid Date object', async () => {
      const result = await limiter.check('flowguard:user', 'user')
      expect(result.resetAt).toBeInstanceOf(Date)
      expect(result.resetAt.getTime()).toBeGreaterThan(Date.now())
    })
  })

  describe('window reset', () => {
    it('resets counter after the window elapses', async () => {
      for (let i = 0; i < max; i++) {
        await limiter.check('flowguard:user', 'user')
      }

      // Should be denied
      const denied = await limiter.check('flowguard:user', 'user')
      expect(denied.allowed).toBe(false)

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 1)

      // Should be allowed in the new window
      const allowed = await limiter.check('flowguard:user', 'user')
      expect(allowed.allowed).toBe(true)
      expect(allowed.remaining).toBe(max - 1)
    })

    it('new window starts fresh count at 1', async () => {
      await limiter.check('flowguard:user', 'user')
      vi.advanceTimersByTime(windowMs + 1)

      const result = await limiter.check('flowguard:user', 'user')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(max - 1)
    })
  })

  describe('independent keys', () => {
    it('different keys are tracked independently', async () => {
      for (let i = 0; i < max; i++) {
        await limiter.check('flowguard:userA', 'userA')
      }
      const deniedA = await limiter.check('flowguard:userA', 'userA')
      expect(deniedA.allowed).toBe(false)

      // userB should still be allowed
      const allowedB = await limiter.check('flowguard:userB', 'userB')
      expect(allowedB.allowed).toBe(true)
    })
  })
})
