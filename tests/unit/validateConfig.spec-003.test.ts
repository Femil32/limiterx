import { describe, it, expect } from 'vitest';
import { validateConfig } from '../../src/core/validateConfig.js';

const validBase = { max: 10, window: '1m' };

describe('validateConfig — spec-003 new fields', () => {
  // ── legacyHeaders (V-013) ──────────────────────────────────────────────────

  describe('legacyHeaders', () => {
    it('defaults to false when not provided', () => {
      const result = validateConfig(validBase);
      expect(result.legacyHeaders).toBe(false);
    });

    it('accepts true', () => {
      const result = validateConfig({ ...validBase, legacyHeaders: true });
      expect(result.legacyHeaders).toBe(true);
    });

    it('accepts false explicitly', () => {
      const result = validateConfig({ ...validBase, legacyHeaders: false });
      expect(result.legacyHeaders).toBe(false);
    });

    it('rejects non-boolean', () => {
      expect(() => validateConfig({ ...validBase, legacyHeaders: 'yes' as never }))
        .toThrow("'legacyHeaders' must be a boolean");
    });
  });

  // ── ipv6Subnet (V-014) ────────────────────────────────────────────────────

  describe('ipv6Subnet', () => {
    it('defaults to 56 when not provided', () => {
      const result = validateConfig(validBase);
      expect(result.ipv6Subnet).toBe(56);
    });

    it('accepts false to disable masking', () => {
      const result = validateConfig({ ...validBase, ipv6Subnet: false });
      expect(result.ipv6Subnet).toBe(false);
    });

    it('accepts integer 1', () => {
      const result = validateConfig({ ...validBase, ipv6Subnet: 1 });
      expect(result.ipv6Subnet).toBe(1);
    });

    it('accepts integer 128', () => {
      const result = validateConfig({ ...validBase, ipv6Subnet: 128 });
      expect(result.ipv6Subnet).toBe(128);
    });

    it('accepts 56', () => {
      const result = validateConfig({ ...validBase, ipv6Subnet: 56 });
      expect(result.ipv6Subnet).toBe(56);
    });

    it('rejects 0', () => {
      expect(() => validateConfig({ ...validBase, ipv6Subnet: 0 }))
        .toThrow("'ipv6Subnet' must be false or an integer between 1 and 128");
    });

    it('rejects 129', () => {
      expect(() => validateConfig({ ...validBase, ipv6Subnet: 129 }))
        .toThrow("'ipv6Subnet' must be false or an integer between 1 and 128");
    });

    it('rejects float', () => {
      expect(() => validateConfig({ ...validBase, ipv6Subnet: 56.5 }))
        .toThrow("'ipv6Subnet' must be false or an integer between 1 and 128");
    });

    it('rejects string', () => {
      expect(() => validateConfig({ ...validBase, ipv6Subnet: '56' as never }))
        .toThrow("'ipv6Subnet' must be false or an integer between 1 and 128");
    });
  });

  // ── requestPropertyName (V-015) ───────────────────────────────────────────

  describe('requestPropertyName', () => {
    it('defaults to "rateLimit"', () => {
      const result = validateConfig(validBase);
      expect(result.requestPropertyName).toBe('rateLimit');
    });

    it('accepts custom string', () => {
      const result = validateConfig({ ...validBase, requestPropertyName: 'quota' });
      expect(result.requestPropertyName).toBe('quota');
    });

    it('rejects empty string', () => {
      expect(() => validateConfig({ ...validBase, requestPropertyName: '' }))
        .toThrow("'requestPropertyName' must be a non-empty string");
    });

    it('rejects non-string', () => {
      expect(() => validateConfig({ ...validBase, requestPropertyName: 42 as never }))
        .toThrow("'requestPropertyName' must be a non-empty string");
    });
  });

  // ── passOnStoreError (V-016) ──────────────────────────────────────────────

  describe('passOnStoreError', () => {
    it('defaults to false', () => {
      const result = validateConfig(validBase);
      expect(result.passOnStoreError).toBe(false);
    });

    it('accepts true', () => {
      const result = validateConfig({ ...validBase, passOnStoreError: true });
      expect(result.passOnStoreError).toBe(true);
    });

    it('rejects non-boolean', () => {
      expect(() => validateConfig({ ...validBase, passOnStoreError: 1 as never }))
        .toThrow("'passOnStoreError' must be a boolean");
    });
  });

  // ── handler (V-017) ───────────────────────────────────────────────────────

  describe('handler', () => {
    it('accepts a function', () => {
      const handler = () => {};
      const result = validateConfig({ ...validBase, handler });
      expect(result.handler).toBe(handler);
    });

    it('accepts undefined (optional)', () => {
      const result = validateConfig(validBase);
      expect(result.handler).toBeUndefined();
    });

    it('rejects non-function', () => {
      expect(() => validateConfig({ ...validBase, handler: 'fn' as never }))
        .toThrow("'handler' must be a function");
    });
  });

  // ── message widened (V-012) ────────────────────────────────────────────────

  describe('message as function', () => {
    it('accepts a function', () => {
      const fn = () => 'custom error';
      const result = validateConfig({ ...validBase, message: fn });
      expect(result.message).toBe(fn);
    });

    it('still rejects array', () => {
      expect(() => validateConfig({ ...validBase, message: [] as never }))
        .toThrow("'message' must be a string, non-array object, or function");
    });

    it('still rejects number', () => {
      expect(() => validateConfig({ ...validBase, message: 42 as never }))
        .toThrow("'message' must be a string, non-array object, or function");
    });
  });

  // ── async keyGenerator / skip ─────────────────────────────────────────────

  describe('async keyGenerator accepted', () => {
    it('accepts async keyGenerator function', () => {
      const kg = async () => 'key';
      const result = validateConfig({ ...validBase, keyGenerator: kg });
      expect(result.keyGenerator).toBe(kg);
    });
  });

  describe('async skip accepted', () => {
    it('accepts async skip function', () => {
      const sk = async () => false;
      const result = validateConfig({ ...validBase, skip: sk });
      expect(result.skip).toBe(sk);
    });
  });

  // ── spec-002: algorithm union (V-004) ─────────────────────────────────────

  describe('algorithm extended union', () => {
    it("accepts 'sliding-window'", () => {
      expect(() => validateConfig({ ...validBase, algorithm: 'sliding-window' })).not.toThrow();
    });

    it("accepts 'token-bucket'", () => {
      expect(() => validateConfig({ ...validBase, algorithm: 'token-bucket' })).not.toThrow();
    });

    it('rejects unknown algorithm value', () => {
      expect(() => validateConfig({ ...validBase, algorithm: 'leaky-bucket' as never }))
        .toThrow("'algorithm' must be 'fixed-window', 'sliding-window', or 'token-bucket'");
    });
  });

  // ── spec-002: store field (V-018) ──────────────────────────────────────────

  describe('store field (V-018)', () => {
    const validStore = {
      get: async () => null,
      set: async () => undefined,
      increment: async () => 1,
      delete: async () => undefined,
      clear: async () => undefined,
    };

    it('accepts a valid StorageAdapter object', () => {
      expect(() => validateConfig({ ...validBase, store: validStore as never })).not.toThrow();
    });

    it('rejects a non-object store', () => {
      expect(() => validateConfig({ ...validBase, store: 'redis' as never }))
        .toThrow("'store' must be an object with get, set, increment, delete, and clear methods");
    });

    it('rejects store missing a required method', () => {
      const badStore = { get: async () => null, set: async () => undefined, increment: async () => 1, delete: async () => undefined };
      expect(() => validateConfig({ ...validBase, store: badStore as never }))
        .toThrow("'store' must be an object with get, set, increment, delete, and clear methods");
    });
  });

  // ── Phase B: dynamic max ───────────────────────────────────────────────────

  describe('dynamic max (Phase B)', () => {
    it('accepts a function for max', () => {
      const fn = () => 10;
      const result = validateConfig({ ...validBase, max: fn });
      expect(result.max).toBe(fn);
    });

    it('rejects zero as max', () => {
      expect(() => validateConfig({ ...validBase, max: 0 }))
        .toThrow("'max' must be a positive integer or function");
    });

    it('rejects non-integer number', () => {
      expect(() => validateConfig({ ...validBase, max: 1.5 as never }))
        .toThrow("'max' must be a positive integer or function");
    });

    it('rejects string as max', () => {
      expect(() => validateConfig({ ...validBase, max: 'ten' as never }))
        .toThrow("'max' must be a positive integer or function");
    });
  });

  // ── Phase B: standardHeaders (V-019) ──────────────────────────────────────

  describe('standardHeaders (V-019)', () => {
    it("defaults to 'draft-7' when not provided", () => {
      const result = validateConfig(validBase);
      expect(result.standardHeaders).toBe('draft-7');
    });

    it("accepts 'draft-6'", () => {
      const result = validateConfig({ ...validBase, standardHeaders: 'draft-6' });
      expect(result.standardHeaders).toBe('draft-6');
    });

    it("accepts 'draft-7'", () => {
      const result = validateConfig({ ...validBase, standardHeaders: 'draft-7' });
      expect(result.standardHeaders).toBe('draft-7');
    });

    it("accepts 'draft-8'", () => {
      const result = validateConfig({ ...validBase, standardHeaders: 'draft-8' });
      expect(result.standardHeaders).toBe('draft-8');
    });

    it('rejects invalid value', () => {
      expect(() => validateConfig({ ...validBase, standardHeaders: 'draft-5' as never }))
        .toThrow("'standardHeaders' must be 'draft-6', 'draft-7', or 'draft-8'");
    });
  });

  // ── Phase B: identifier (V-020) ────────────────────────────────────────────

  describe('identifier (V-020)', () => {
    it('accepts a string identifier', () => {
      const result = validateConfig({ ...validBase, identifier: 'api-v2' });
      expect(result.identifier).toBe('api-v2');
    });

    it('rejects non-string identifier', () => {
      expect(() => validateConfig({ ...validBase, identifier: 42 as never }))
        .toThrow("'identifier' must be a string");
    });
  });

  // ── Phase B: validate (V-021) ─────────────────────────────────────────────

  describe('validate (V-021)', () => {
    it('accepts true', () => {
      const result = validateConfig({ ...validBase, validate: true });
      expect(result.validate).toBe(true);
    });

    it('accepts false', () => {
      const result = validateConfig({ ...validBase, validate: false });
      expect(result.validate).toBe(false);
    });

    it('accepts an object', () => {
      const result = validateConfig({ ...validBase, validate: { windowMs: false } });
      expect(result.validate).toEqual({ windowMs: false });
    });

    it('rejects a number', () => {
      expect(() => validateConfig({ ...validBase, validate: 1 as never }))
        .toThrow("'validate' must be a boolean or object");
    });

    it('rejects an array', () => {
      expect(() => validateConfig({ ...validBase, validate: [] as never }))
        .toThrow("'validate' must be a boolean or object");
    });
  });

  // ── Phase B: skipSuccessfulRequests / skipFailedRequests ──────────────────

  describe('skipSuccessfulRequests (V-022)', () => {
    it('accepts true', () => {
      const result = validateConfig({ ...validBase, skipSuccessfulRequests: true });
      expect(result.skipSuccessfulRequests).toBe(true);
    });

    it('rejects non-boolean', () => {
      expect(() => validateConfig({ ...validBase, skipSuccessfulRequests: 1 as never }))
        .toThrow("'skipSuccessfulRequests' must be a boolean");
    });
  });

  describe('skipFailedRequests (V-023)', () => {
    it('accepts true', () => {
      const result = validateConfig({ ...validBase, skipFailedRequests: true });
      expect(result.skipFailedRequests).toBe(true);
    });

    it('rejects non-boolean', () => {
      expect(() => validateConfig({ ...validBase, skipFailedRequests: 1 as never }))
        .toThrow("'skipFailedRequests' must be a boolean");
    });
  });

  // ── Phase B: requestWasSuccessful (V-024) ─────────────────────────────────

  describe('requestWasSuccessful (V-024)', () => {
    it('accepts a function', () => {
      const fn = () => true;
      const result = validateConfig({ ...validBase, requestWasSuccessful: fn });
      expect(result.requestWasSuccessful).toBe(fn);
    });

    it('rejects non-function', () => {
      expect(() => validateConfig({ ...validBase, requestWasSuccessful: true as never }))
        .toThrow("'requestWasSuccessful' must be a function");
    });
  });
});
