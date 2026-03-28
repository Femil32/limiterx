import type { LimiterxConfig } from './types.js';
import { parseWindow } from './parseWindow.js';

/**
 * Validate all fields of a LimiterxConfig object.
 * Throws descriptive errors naming the invalid field.
 *
 * @param config - The configuration to validate
 * @returns The validated configuration with defaults applied
 * @throws Error with `[limiterx] Invalid config: ...` message on invalid input
 *
 * @example
 * ```typescript
 * const validated = validateConfig({ max: 100, window: '15m' });
 * ```
 */
export function validateConfig(config: LimiterxConfig): Required<
  Pick<LimiterxConfig, 'algorithm' | 'maxKeys' | 'debug' | 'headers' | 'message' | 'statusCode' | 'legacyHeaders' | 'ipv6Subnet' | 'requestPropertyName' | 'passOnStoreError' | 'standardHeaders'>
> & LimiterxConfig {
  // V-001: max — accept number or function
  if (typeof config.max !== 'function') {
    if (!Number.isInteger(config.max) || (config.max as number) <= 0) {
      throw new Error(
        `[limiterx] Invalid config: 'max' must be a positive integer or function, received: ${config.max}`,
      );
    }
  }

  // V-002 / V-003: window
  parseWindow(config.window);

  // V-004: algorithm
  const validAlgorithms = ['fixed-window', 'sliding-window', 'token-bucket'];
  if (config.algorithm !== undefined && !validAlgorithms.includes(config.algorithm)) {
    throw new Error(
      `[limiterx] Invalid config: 'algorithm' must be 'fixed-window', 'sliding-window', or 'token-bucket', received: ${String(config.algorithm)}`,
    );
  }

  // V-005: keyGenerator
  if (config.keyGenerator !== undefined && typeof config.keyGenerator !== 'function') {
    throw new Error(
      `[limiterx] Invalid config: 'keyGenerator' must be a function, received: ${typeof config.keyGenerator}`,
    );
  }

  // V-006: skip
  if (config.skip !== undefined && typeof config.skip !== 'function') {
    throw new Error(
      `[limiterx] Invalid config: 'skip' must be a function, received: ${typeof config.skip}`,
    );
  }

  // V-007: onLimit
  if (config.onLimit !== undefined && typeof config.onLimit !== 'function') {
    throw new Error(
      `[limiterx] Invalid config: 'onLimit' must be a function, received: ${typeof config.onLimit}`,
    );
  }

  // V-008: statusCode
  if (config.statusCode !== undefined) {
    if (!Number.isInteger(config.statusCode) || config.statusCode < 100 || config.statusCode > 599) {
      throw new Error(
        `[limiterx] Invalid config: 'statusCode' must be an integer between 100-599, received: ${config.statusCode}`,
      );
    }
  }

  // V-009: headers
  if (config.headers !== undefined && typeof config.headers !== 'boolean') {
    throw new Error(
      `[limiterx] Invalid config: 'headers' must be a boolean, received: ${typeof config.headers}`,
    );
  }

  // V-010: maxKeys
  if (config.maxKeys !== undefined) {
    if (!Number.isInteger(config.maxKeys) || config.maxKeys <= 0) {
      throw new Error(
        `[limiterx] Invalid config: 'maxKeys' must be a positive integer, received: ${config.maxKeys}`,
      );
    }
  }

  // V-011: debug
  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
    throw new Error(
      `[limiterx] Invalid config: 'debug' must be a boolean, received: ${typeof config.debug}`,
    );
  }

  // V-012: message
  if (config.message !== undefined) {
    if (
      typeof config.message !== 'string' &&
      typeof config.message !== 'function' &&
      (typeof config.message !== 'object' || config.message === null || Array.isArray(config.message))
    ) {
      throw new Error(
        `[limiterx] Invalid config: 'message' must be a string, non-array object, or function, received: ${typeof config.message}`,
      );
    }
  }

  // V-013: legacyHeaders
  if (config.legacyHeaders !== undefined && typeof config.legacyHeaders !== 'boolean') {
    throw new Error(
      `[limiterx] Invalid config: 'legacyHeaders' must be a boolean, received: ${typeof config.legacyHeaders}`,
    );
  }

  // V-014: ipv6Subnet
  if (config.ipv6Subnet !== undefined && config.ipv6Subnet !== false) {
    if (!Number.isInteger(config.ipv6Subnet) || (config.ipv6Subnet as number) < 1 || (config.ipv6Subnet as number) > 128) {
      throw new Error(
        `[limiterx] Invalid config: 'ipv6Subnet' must be false or an integer between 1 and 128, received: ${String(config.ipv6Subnet)}`,
      );
    }
  }

  // V-015: requestPropertyName
  if (config.requestPropertyName !== undefined) {
    if (typeof config.requestPropertyName !== 'string' || config.requestPropertyName.length === 0) {
      throw new Error(
        `[limiterx] Invalid config: 'requestPropertyName' must be a non-empty string, received: ${JSON.stringify(config.requestPropertyName)}`,
      );
    }
  }

  // V-016: passOnStoreError
  if (config.passOnStoreError !== undefined && typeof config.passOnStoreError !== 'boolean') {
    throw new Error(
      `[limiterx] Invalid config: 'passOnStoreError' must be a boolean, received: ${typeof config.passOnStoreError}`,
    );
  }

  // V-017: handler
  if (config.handler !== undefined && typeof config.handler !== 'function') {
    throw new Error(
      `[limiterx] Invalid config: 'handler' must be a function, received: ${typeof config.handler}`,
    );
  }

  // V-018: store
  if (config.store !== undefined) {
    const s = config.store as unknown as Record<string, unknown>;
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof s['get'] !== 'function' ||
      typeof s['set'] !== 'function' ||
      typeof s['increment'] !== 'function' ||
      typeof s['delete'] !== 'function' ||
      typeof s['clear'] !== 'function'
    ) {
      throw new Error(
        `[limiterx] Invalid config: 'store' must be an object with get, set, increment, delete, and clear methods`,
      );
    }
  }

  // V-019: standardHeaders
  if (config.standardHeaders !== undefined) {
    const valid = ['draft-6', 'draft-7', 'draft-8'];
    if (!valid.includes(config.standardHeaders as string)) {
      throw new Error(
        `[limiterx] Invalid config: 'standardHeaders' must be 'draft-6', 'draft-7', or 'draft-8', received: ${String(config.standardHeaders)}`,
      );
    }
  }

  // V-020: identifier
  if (config.identifier !== undefined && typeof config.identifier !== 'string') {
    throw new Error(
      `[limiterx] Invalid config: 'identifier' must be a string, received: ${typeof config.identifier}`,
    );
  }

  // V-021: validate
  if (config.validate !== undefined) {
    if (typeof config.validate !== 'boolean' && (typeof config.validate !== 'object' || config.validate === null || Array.isArray(config.validate))) {
      throw new Error(
        `[limiterx] Invalid config: 'validate' must be a boolean or object, received: ${typeof config.validate}`,
      );
    }
  }

  // V-022: skipSuccessfulRequests
  if (config.skipSuccessfulRequests !== undefined && typeof config.skipSuccessfulRequests !== 'boolean') {
    throw new Error(
      `[limiterx] Invalid config: 'skipSuccessfulRequests' must be a boolean, received: ${typeof config.skipSuccessfulRequests}`,
    );
  }

  // V-023: skipFailedRequests
  if (config.skipFailedRequests !== undefined && typeof config.skipFailedRequests !== 'boolean') {
    throw new Error(
      `[limiterx] Invalid config: 'skipFailedRequests' must be a boolean, received: ${typeof config.skipFailedRequests}`,
    );
  }

  // V-024: requestWasSuccessful
  if (config.requestWasSuccessful !== undefined && typeof config.requestWasSuccessful !== 'function') {
    throw new Error(
      `[limiterx] Invalid config: 'requestWasSuccessful' must be a function, received: ${typeof config.requestWasSuccessful}`,
    );
  }

  return {
    ...config,
    algorithm: config.algorithm ?? 'fixed-window',
    maxKeys: config.maxKeys ?? 10_000,
    debug: config.debug ?? false,
    headers: config.headers ?? true,
    message: config.message ?? 'Too many requests',
    statusCode: config.statusCode ?? 429,
    legacyHeaders: config.legacyHeaders ?? false,
    ipv6Subnet: config.ipv6Subnet !== undefined ? config.ipv6Subnet : 56,
    requestPropertyName: config.requestPropertyName ?? 'rateLimit',
    passOnStoreError: config.passOnStoreError ?? false,
    standardHeaders: config.standardHeaders ?? 'draft-7',
  };
}
