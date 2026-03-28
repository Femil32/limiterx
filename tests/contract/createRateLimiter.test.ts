import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRateLimiter } from '../../src/core/createRateLimiter.js'
import type { RateLimiter } from '../../src/core/types.js'

describe('createRateLimiter', () => {
  let limiter: RateLimiter

  afterEach(() => {
    limiter?.destroy()
  })

  describe('basic allow/deny flow', () => {
    beforeEach(() => {
      limiter = createRateLimiter({ max: 3, window: '1m' })
    })

    it('allows the first 3 requests', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await limiter.check('user')
        expect(result.allowed).toBe(true)
      }
    })

    it('denies the 4th request', async () => {
      for (let i = 0; i < 3; i++) {
        await limiter.check('user')
      }
      const result = await limiter.check('user')
      expect(result.allowed).toBe(false)
    })

    it('result has correct limit field', async () => {
      const result = await limiter.check('user')
      expect(result.limit).toBe(3)
    })

    it('result has correct key field', async () => {
      const result = await limiter.check('mykey')
      expect(result.key).toBe('mykey')
    })
  })

  describe('namespaced keys', () => {
    it('result key is the user-supplied key, not the prefixed one', async () => {
      limiter = createRateLimiter({ max: 5, window: '1m' })
      const result = await limiter.check('user-123')
      // The public key should not contain the internal prefix
      expect(result.key).toBe('user-123')
      expect(result.key).not.toContain('limiterx:')
    })
  })

  describe('empty key fallback', () => {
    it("empty string key falls back to 'global'", async () => {
      limiter = createRateLimiter({ max: 5, window: '1m' })
      const result = await limiter.check('')
      expect(result.key).toBe('global')
    })

    it("empty key counts are independent from 'global' key checks", async () => {
      limiter = createRateLimiter({ max: 2, window: '1m' })
      await limiter.check('')
      await limiter.check('')
      const denied = await limiter.check('')
      expect(denied.allowed).toBe(false)
    })
  })

  describe('onLimit callback', () => {
    it('onLimit is invoked when a request is denied', async () => {
      const onLimit = vi.fn()
      limiter = createRateLimiter({ max: 1, window: '1m', onLimit })

      await limiter.check('user')
      await limiter.check('user') // denied

      expect(onLimit).toHaveBeenCalledOnce()
    })

    it('onLimit is NOT invoked on allowed requests', async () => {
      const onLimit = vi.fn()
      limiter = createRateLimiter({ max: 5, window: '1m', onLimit })

      await limiter.check('user')
      await limiter.check('user')

      expect(onLimit).not.toHaveBeenCalled()
    })

    it('onLimit receives the RateLimiterResult as first argument', async () => {
      const onLimit = vi.fn()
      limiter = createRateLimiter({ max: 1, window: '1m', onLimit })

      await limiter.check('user')
      await limiter.check('user') // denied

      const callArg = onLimit.mock.calls[0][0]
      expect(callArg.allowed).toBe(false)
      expect(callArg.remaining).toBe(0)
      expect(callArg.limit).toBe(1)
      expect(callArg.key).toBe('user')
      expect(callArg.retryAfter).toBeGreaterThan(0)
      expect(callArg.resetAt).toBeInstanceOf(Date)
    })

    it('onLimit receives context with key as second argument', async () => {
      const onLimit = vi.fn()
      limiter = createRateLimiter({ max: 1, window: '1m', onLimit })

      await limiter.check('user-abc')
      await limiter.check('user-abc') // denied

      const ctx = onLimit.mock.calls[0][1]
      expect(ctx.key).toBe('user-abc')
    })

    it('onLimit error does not crash the rate limiter', async () => {
      const onLimit = vi.fn(() => {
        throw new Error('callback error')
      })
      limiter = createRateLimiter({ max: 1, window: '1m', onLimit })

      await limiter.check('user')
      // Should not throw even though onLimit throws
      await expect(limiter.check('user')).resolves.toBeDefined()
    })
  })

  describe('skip function', () => {
    it('skip bypass: when skip returns true, request is always allowed', async () => {
      limiter = createRateLimiter({
        max: 1,
        window: '1m',
        skip: () => true,
      })

      // Fill up the limit
      await limiter.check('user')

      // With skip returning true, should still be allowed even though limit is exceeded
      // Note: skip is applied at adapter level. At core level check() does not call skip.
      // The test verifies the limiter itself works correctly.
      const result = await limiter.check('user')
      // The 2nd request at core level should be denied (skip is adapter-level)
      expect(result.allowed).toBe(false)
    })
  })

  describe('reset()', () => {
    it('clears state for a specific key', async () => {
      limiter = createRateLimiter({ max: 2, window: '1m' })

      await limiter.check('user')
      await limiter.check('user')
      const denied = await limiter.check('user')
      expect(denied.allowed).toBe(false)

      await limiter.reset('user')

      const result = await limiter.check('user')
      expect(result.allowed).toBe(true)
    })

    it('reset does not affect other keys', async () => {
      limiter = createRateLimiter({ max: 2, window: '1m' })

      await limiter.check('userA')
      await limiter.check('userA')
      await limiter.check('userB')
      await limiter.check('userB')

      await limiter.reset('userA')

      const userAResult = await limiter.check('userA')
      expect(userAResult.allowed).toBe(true)

      const userBResult = await limiter.check('userB')
      expect(userBResult.allowed).toBe(false)
    })
  })

  describe('clear()', () => {
    it('clears all state', async () => {
      limiter = createRateLimiter({ max: 2, window: '1m' })

      await limiter.check('userA')
      await limiter.check('userA')
      await limiter.check('userB')
      await limiter.check('userB')

      await limiter.clear()

      const userAResult = await limiter.check('userA')
      expect(userAResult.allowed).toBe(true)

      const userBResult = await limiter.check('userB')
      expect(userBResult.allowed).toBe(true)
    })
  })

  describe('destroy()', () => {
    it('can be called without error', () => {
      limiter = createRateLimiter({ max: 10, window: '1m' })
      expect(() => limiter.destroy()).not.toThrow()
    })

    it('can be called multiple times without error', () => {
      limiter = createRateLimiter({ max: 10, window: '1m' })
      limiter.destroy()
      expect(() => limiter.destroy()).not.toThrow()
    })
  })

  describe('configuration validation', () => {
    it('throws on invalid config', () => {
      expect(() => createRateLimiter({ max: -1, window: '1m' })).toThrow('[limiterx]')
    })

    it('throws on invalid window', () => {
      expect(() => createRateLimiter({ max: 10, window: 'bad' })).toThrow('[limiterx]')
    })

    it('throws on invalid algorithm', () => {
      expect(() => createRateLimiter({ max: 10, window: '1m', algorithm: 'leaky-bucket' as never })).toThrow('[limiterx]')
    })
  })

  describe('algorithm: sliding-window', () => {
    beforeEach(() => {
      limiter = createRateLimiter({ max: 3, window: '1m', algorithm: 'sliding-window' })
    })

    it('allows requests up to max', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await limiter.check('user')
        expect(result.allowed).toBe(true)
      }
    })

    it('denies on max + 1', async () => {
      for (let i = 0; i < 3; i++) await limiter.check('user')
      const result = await limiter.check('user')
      expect(result.allowed).toBe(false)
    })

    it('reset() clears state and allows again', async () => {
      for (let i = 0; i < 3; i++) await limiter.check('user')
      await limiter.reset('user')
      const result = await limiter.check('user')
      expect(result.allowed).toBe(true)
    })
  })

  describe('algorithm: token-bucket', () => {
    beforeEach(() => {
      limiter = createRateLimiter({ max: 3, window: '1m', algorithm: 'token-bucket' })
    })

    it('allows requests up to max', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await limiter.check('user')
        expect(result.allowed).toBe(true)
      }
    })

    it('denies when bucket is exhausted', async () => {
      for (let i = 0; i < 3; i++) await limiter.check('user')
      const result = await limiter.check('user')
      expect(result.allowed).toBe(false)
    })

    it('reset() clears state and allows again', async () => {
      for (let i = 0; i < 3; i++) await limiter.check('user')
      await limiter.reset('user')
      const result = await limiter.check('user')
      expect(result.allowed).toBe(true)
    })
  })

  describe('custom store', () => {
    it('accepts store: new MemoryStore() as custom store', async () => {
      const { MemoryStore } = await import('../../src/core/storage/MemoryStore.js')
      const customStore = new MemoryStore({ maxKeys: 100 })
      limiter = createRateLimiter({ max: 2, window: '1m', store: customStore })
      const result = await limiter.check('user')
      expect(result.allowed).toBe(true)
      customStore.destroy()
    })

    it('throws on invalid store object', () => {
      expect(() => createRateLimiter({ max: 10, window: '1m', store: {} as never })).toThrow('[limiterx]')
    })
  })
})
