import { describe, it, expect } from 'vitest';
import { validateConfig } from '../../src/core/validateConfig.js';

describe('validateConfig edge cases (T042)', () => {
  const validBase = { max: 10, window: '1m' };

  describe('max edge cases', () => {
    it('rejects max=0', () => {
      expect(() => validateConfig({ ...validBase, max: 0 })).toThrow("'max' must be a positive integer");
    });

    it('rejects max=-1', () => {
      expect(() => validateConfig({ ...validBase, max: -1 })).toThrow("'max' must be a positive integer");
    });

    it('rejects max=1.5', () => {
      expect(() => validateConfig({ ...validBase, max: 1.5 })).toThrow("'max' must be a positive integer");
    });

    it('rejects max=Infinity', () => {
      expect(() => validateConfig({ ...validBase, max: Infinity })).toThrow("'max' must be a positive integer");
    });

    it('rejects max=NaN', () => {
      expect(() => validateConfig({ ...validBase, max: NaN })).toThrow("'max' must be a positive integer");
    });
  });

  describe('window edge cases', () => {
    it('rejects window="0ms"', () => {
      expect(() => validateConfig({ ...validBase, window: '0ms' })).toThrow();
    });

    it('rejects window=-100', () => {
      expect(() => validateConfig({ ...validBase, window: -100 })).toThrow();
    });

    it('rejects window="2x"', () => {
      expect(() => validateConfig({ ...validBase, window: '2x' })).toThrow();
    });

    it('rejects window="mins"', () => {
      expect(() => validateConfig({ ...validBase, window: 'mins' })).toThrow();
    });
  });

  describe('callback type edge cases', () => {
    it('rejects keyGenerator="not a function"', () => {
      expect(() => validateConfig({ ...validBase, keyGenerator: 'fn' as never })).toThrow("'keyGenerator' must be a function");
    });

    it('rejects onLimit=42', () => {
      expect(() => validateConfig({ ...validBase, onLimit: 42 as never })).toThrow("'onLimit' must be a function");
    });

    it('rejects skip=true', () => {
      expect(() => validateConfig({ ...validBase, skip: true as never })).toThrow("'skip' must be a function");
    });
  });

  describe('message (V-012) edge cases', () => {
    it('accepts string message', () => {
      expect(() => validateConfig({ ...validBase, message: 'Rate limited!' })).not.toThrow();
    });

    it('accepts object message', () => {
      expect(() => validateConfig({ ...validBase, message: { error: 'nope' } })).not.toThrow();
    });

    it('rejects array message', () => {
      expect(() => validateConfig({ ...validBase, message: ['error'] as never })).toThrow("'message' must be a string or non-array object");
    });

    it('rejects null message', () => {
      expect(() => validateConfig({ ...validBase, message: null as never })).toThrow("'message' must be a string or non-array object");
    });

    it('rejects number message', () => {
      expect(() => validateConfig({ ...validBase, message: 42 as never })).toThrow("'message' must be a string or non-array object");
    });

    it('rejects boolean message', () => {
      expect(() => validateConfig({ ...validBase, message: true as never })).toThrow("'message' must be a string or non-array object");
    });
  });

  describe('debug edge cases', () => {
    it('rejects debug="true"', () => {
      expect(() => validateConfig({ ...validBase, debug: 'true' as never })).toThrow("'debug' must be a boolean");
    });

    it('accepts debug=true', () => {
      const result = validateConfig({ ...validBase, debug: true });
      expect(result.debug).toBe(true);
    });
  });
});
