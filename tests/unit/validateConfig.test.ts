import { describe, it, expect } from 'vitest'
import { validateConfig } from '../../src/core/validateConfig.js'

const baseConfig = { max: 10, window: '1m' }

describe('validateConfig', () => {
  describe('V-001: max must be positive integer', () => {
    it('accepts a valid positive integer', () => {
      expect(() => validateConfig({ max: 100, window: '1m' })).not.toThrow()
    })

    it('throws for max = 0', () => {
      expect(() => validateConfig({ ...baseConfig, max: 0 })).toThrow('[flowguard]')
    })

    it('throws for negative max', () => {
      expect(() => validateConfig({ ...baseConfig, max: -5 })).toThrow('[flowguard]')
    })

    it('throws for float max', () => {
      expect(() => validateConfig({ ...baseConfig, max: 1.5 })).toThrow('[flowguard]')
    })

    it('throws for NaN max', () => {
      expect(() => validateConfig({ ...baseConfig, max: NaN })).toThrow('[flowguard]')
    })

    it('throws for string max', () => {
      expect(() => validateConfig({ ...baseConfig, max: 'string' as unknown as number })).toThrow('[flowguard]')
    })
  })

  describe('V-002/V-003: window validation', () => {
    it('accepts valid string window', () => {
      expect(() => validateConfig({ max: 10, window: '30s' })).not.toThrow()
    })

    it('accepts valid numeric window', () => {
      expect(() => validateConfig({ max: 10, window: 60000 })).not.toThrow()
    })

    it('throws for invalid window string', () => {
      expect(() => validateConfig({ max: 10, window: 'invalid' })).toThrow('[flowguard]')
    })

    it('throws for window = 0', () => {
      expect(() => validateConfig({ max: 10, window: 0 })).toThrow('[flowguard]')
    })

    it('throws for negative window', () => {
      expect(() => validateConfig({ max: 10, window: -1000 })).toThrow('[flowguard]')
    })
  })

  describe('V-004: algorithm must be fixed-window or undefined', () => {
    it('accepts undefined algorithm', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it("accepts 'fixed-window' algorithm", () => {
      expect(() => validateConfig({ ...baseConfig, algorithm: 'fixed-window' })).not.toThrow()
    })

    it('throws for unknown algorithm', () => {
      expect(() => validateConfig({ ...baseConfig, algorithm: 'sliding-window' as 'fixed-window' })).toThrow('[flowguard]')
    })
  })

  describe('V-005: keyGenerator must be function or undefined', () => {
    it('accepts undefined keyGenerator', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it('accepts function keyGenerator', () => {
      expect(() => validateConfig({ ...baseConfig, keyGenerator: () => 'key' })).not.toThrow()
    })

    it('throws for non-function keyGenerator', () => {
      expect(() => validateConfig({ ...baseConfig, keyGenerator: 'not-a-function' as unknown as () => string })).toThrow('[flowguard]')
    })
  })

  describe('V-006: skip must be function or undefined', () => {
    it('accepts undefined skip', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it('accepts function skip', () => {
      expect(() => validateConfig({ ...baseConfig, skip: () => false })).not.toThrow()
    })

    it('throws for non-function skip', () => {
      expect(() => validateConfig({ ...baseConfig, skip: true as unknown as () => boolean })).toThrow('[flowguard]')
    })
  })

  describe('V-007: onLimit must be function or undefined', () => {
    it('accepts undefined onLimit', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it('accepts function onLimit', () => {
      expect(() => validateConfig({ ...baseConfig, onLimit: () => {} })).not.toThrow()
    })

    it('throws for non-function onLimit', () => {
      expect(() => validateConfig({ ...baseConfig, onLimit: 'callback' as unknown as () => void })).toThrow('[flowguard]')
    })
  })

  describe('V-008: statusCode integer 100-599', () => {
    it('accepts 429', () => {
      expect(() => validateConfig({ ...baseConfig, statusCode: 429 })).not.toThrow()
    })

    it('accepts 100 (boundary)', () => {
      expect(() => validateConfig({ ...baseConfig, statusCode: 100 })).not.toThrow()
    })

    it('accepts 599 (boundary)', () => {
      expect(() => validateConfig({ ...baseConfig, statusCode: 599 })).not.toThrow()
    })

    it('throws for statusCode = 99 (below min)', () => {
      expect(() => validateConfig({ ...baseConfig, statusCode: 99 })).toThrow('[flowguard]')
    })

    it('throws for statusCode = 600 (above max)', () => {
      expect(() => validateConfig({ ...baseConfig, statusCode: 600 })).toThrow('[flowguard]')
    })

    it('throws for float statusCode', () => {
      expect(() => validateConfig({ ...baseConfig, statusCode: 429.5 })).toThrow('[flowguard]')
    })
  })

  describe('V-009: headers must be boolean or undefined', () => {
    it('accepts undefined headers', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it('accepts true headers', () => {
      expect(() => validateConfig({ ...baseConfig, headers: true })).not.toThrow()
    })

    it('accepts false headers', () => {
      expect(() => validateConfig({ ...baseConfig, headers: false })).not.toThrow()
    })

    it('throws for string headers', () => {
      expect(() => validateConfig({ ...baseConfig, headers: 'yes' as unknown as boolean })).toThrow('[flowguard]')
    })
  })

  describe('V-010: maxKeys must be positive integer or undefined', () => {
    it('accepts undefined maxKeys', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it('accepts positive integer maxKeys', () => {
      expect(() => validateConfig({ ...baseConfig, maxKeys: 5000 })).not.toThrow()
    })

    it('throws for maxKeys = 0', () => {
      expect(() => validateConfig({ ...baseConfig, maxKeys: 0 })).toThrow('[flowguard]')
    })

    it('throws for negative maxKeys', () => {
      expect(() => validateConfig({ ...baseConfig, maxKeys: -1 })).toThrow('[flowguard]')
    })

    it('throws for float maxKeys', () => {
      expect(() => validateConfig({ ...baseConfig, maxKeys: 1000.5 })).toThrow('[flowguard]')
    })
  })

  describe('V-011: debug must be boolean or undefined', () => {
    it('accepts undefined debug', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it('accepts false debug', () => {
      expect(() => validateConfig({ ...baseConfig, debug: false })).not.toThrow()
    })

    it('accepts true debug', () => {
      expect(() => validateConfig({ ...baseConfig, debug: true })).not.toThrow()
    })

    it('throws for string debug', () => {
      expect(() => validateConfig({ ...baseConfig, debug: 'true' as unknown as boolean })).toThrow('[flowguard]')
    })
  })

  describe('V-012: message must be string or non-array object or undefined', () => {
    it('accepts undefined message', () => {
      expect(() => validateConfig({ ...baseConfig })).not.toThrow()
    })

    it('accepts string message', () => {
      expect(() => validateConfig({ ...baseConfig, message: 'Rate limit exceeded' })).not.toThrow()
    })

    it('accepts non-array object message', () => {
      expect(() => validateConfig({ ...baseConfig, message: { error: 'rate limited' } })).not.toThrow()
    })

    it('throws for array message', () => {
      expect(() => validateConfig({ ...baseConfig, message: ['not', 'allowed'] as unknown as string })).toThrow('[flowguard]')
    })

    it('throws for number message', () => {
      expect(() => validateConfig({ ...baseConfig, message: 42 as unknown as string })).toThrow('[flowguard]')
    })
  })

  describe('defaults applied', () => {
    it("defaults algorithm to 'fixed-window'", () => {
      const result = validateConfig(baseConfig)
      expect(result.algorithm).toBe('fixed-window')
    })

    it('defaults maxKeys to 10000', () => {
      const result = validateConfig(baseConfig)
      expect(result.maxKeys).toBe(10000)
    })

    it('defaults debug to false', () => {
      const result = validateConfig(baseConfig)
      expect(result.debug).toBe(false)
    })

    it('defaults headers to true', () => {
      const result = validateConfig(baseConfig)
      expect(result.headers).toBe(true)
    })

    it("defaults message to 'Too many requests'", () => {
      const result = validateConfig(baseConfig)
      expect(result.message).toBe('Too many requests')
    })

    it('defaults statusCode to 429', () => {
      const result = validateConfig(baseConfig)
      expect(result.statusCode).toBe(429)
    })

    it('preserves explicitly set values over defaults', () => {
      const result = validateConfig({ ...baseConfig, statusCode: 503, headers: false, debug: true })
      expect(result.statusCode).toBe(503)
      expect(result.headers).toBe(false)
      expect(result.debug).toBe(true)
    })
  })

  describe('error message prefix', () => {
    it("error messages contain '[flowguard]' prefix", () => {
      try {
        validateConfig({ ...baseConfig, max: -1 })
      } catch (err) {
        expect((err as Error).message).toMatch(/^\[flowguard\]/)
      }
    })
  })
})
