import { describe, it, expect } from 'vitest'
import { parseWindow } from '../../src/core/parseWindow.js'

describe('parseWindow', () => {
  describe('valid string durations', () => {
    it("parses '500ms' → 500", () => {
      expect(parseWindow('500ms')).toBe(500)
    })

    it("parses '30s' → 30000", () => {
      expect(parseWindow('30s')).toBe(30000)
    })

    it("parses '5m' → 300000", () => {
      expect(parseWindow('5m')).toBe(300000)
    })

    it("parses '1h' → 3600000", () => {
      expect(parseWindow('1h')).toBe(3600000)
    })

    it("parses '1d' → 86400000", () => {
      expect(parseWindow('1d')).toBe(86400000)
    })

    it("parses '1ms' → 1", () => {
      expect(parseWindow('1ms')).toBe(1)
    })

    it("parses '2h' → 7200000", () => {
      expect(parseWindow('2h')).toBe(7200000)
    })

    it("parses '10m' → 600000", () => {
      expect(parseWindow('10m')).toBe(600000)
    })
  })

  describe('numeric milliseconds', () => {
    it('passes through 1000 as 1000', () => {
      expect(parseWindow(1000)).toBe(1000)
    })

    it('passes through 5000 as 5000', () => {
      expect(parseWindow(5000)).toBe(5000)
    })

    it('passes through 1 as 1', () => {
      expect(parseWindow(1)).toBe(1)
    })
  })

  describe('whitespace trimming', () => {
    it("trims ' 30s ' → 30000", () => {
      expect(parseWindow(' 30s ')).toBe(30000)
    })

    it("trims '  5m  ' → 300000", () => {
      expect(parseWindow('  5m  ')).toBe(300000)
    })
  })

  describe('invalid string inputs', () => {
    it("throws for 'invalid'", () => {
      expect(() => parseWindow('invalid')).toThrow('[limiterx]')
    })

    it("throws for '2x' (unknown unit)", () => {
      expect(() => parseWindow('2x')).toThrow('[limiterx]')
    })

    it('throws for empty string', () => {
      expect(() => parseWindow('')).toThrow('[limiterx]')
    })

    it("throws for '0ms' (zero duration)", () => {
      expect(() => parseWindow('0ms')).toThrow('[limiterx]')
    })

    it("throws for 'mins' (plural unit)", () => {
      expect(() => parseWindow('mins')).toThrow('[limiterx]')
    })

    it("throws for 'hrs' (plural unit)", () => {
      expect(() => parseWindow('hrs')).toThrow('[limiterx]')
    })

    it("throws for '30 s' (space before unit)", () => {
      expect(() => parseWindow('30 s')).toThrow('[limiterx]')
    })

    it("throws for 'abc30s' (leading letters)", () => {
      expect(() => parseWindow('abc30s')).toThrow('[limiterx]')
    })
  })

  describe('invalid numeric inputs', () => {
    it('throws for negative numbers', () => {
      expect(() => parseWindow(-1000)).toThrow('[limiterx]')
    })

    it('throws for 0', () => {
      expect(() => parseWindow(0)).toThrow('[limiterx]')
    })

    it('throws for NaN', () => {
      expect(() => parseWindow(NaN)).toThrow('[limiterx]')
    })

    it('throws for Infinity', () => {
      expect(() => parseWindow(Infinity)).toThrow('[limiterx]')
    })

    it('throws for -Infinity', () => {
      expect(() => parseWindow(-Infinity)).toThrow('[limiterx]')
    })
  })
})
