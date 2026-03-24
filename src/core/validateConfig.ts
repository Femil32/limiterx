import type { FlowGuardConfig } from './types.js';
import { parseWindow } from './parseWindow.js';

/**
 * Validate all fields of a FlowGuardConfig object.
 * Throws descriptive errors naming the invalid field.
 *
 * @param config - The configuration to validate
 * @returns The validated configuration with defaults applied
 * @throws Error with `[flowguard] Invalid config: ...` message on invalid input
 *
 * @example
 * ```typescript
 * const validated = validateConfig({ max: 100, window: '15m' });
 * ```
 */
export function validateConfig(config: FlowGuardConfig): Required<
  Pick<FlowGuardConfig, 'max' | 'window' | 'algorithm' | 'maxKeys' | 'debug' | 'headers' | 'message' | 'statusCode'>
> & FlowGuardConfig {
  // V-001: max
  if (!Number.isInteger(config.max) || config.max <= 0) {
    throw new Error(
      `[flowguard] Invalid config: 'max' must be a positive integer, received: ${config.max}`,
    );
  }

  // V-002 / V-003: window
  parseWindow(config.window);

  // V-004: algorithm
  if (config.algorithm !== undefined && config.algorithm !== 'fixed-window') {
    throw new Error(
      `[flowguard] Invalid config: 'algorithm' must be 'fixed-window', received: ${String(config.algorithm)}`,
    );
  }

  // V-005: keyGenerator
  if (config.keyGenerator !== undefined && typeof config.keyGenerator !== 'function') {
    throw new Error(
      `[flowguard] Invalid config: 'keyGenerator' must be a function, received: ${typeof config.keyGenerator}`,
    );
  }

  // V-006: skip
  if (config.skip !== undefined && typeof config.skip !== 'function') {
    throw new Error(
      `[flowguard] Invalid config: 'skip' must be a function, received: ${typeof config.skip}`,
    );
  }

  // V-007: onLimit
  if (config.onLimit !== undefined && typeof config.onLimit !== 'function') {
    throw new Error(
      `[flowguard] Invalid config: 'onLimit' must be a function, received: ${typeof config.onLimit}`,
    );
  }

  // V-008: statusCode
  if (config.statusCode !== undefined) {
    if (!Number.isInteger(config.statusCode) || config.statusCode < 100 || config.statusCode > 599) {
      throw new Error(
        `[flowguard] Invalid config: 'statusCode' must be an integer between 100-599, received: ${config.statusCode}`,
      );
    }
  }

  // V-009: headers
  if (config.headers !== undefined && typeof config.headers !== 'boolean') {
    throw new Error(
      `[flowguard] Invalid config: 'headers' must be a boolean, received: ${typeof config.headers}`,
    );
  }

  // V-010: maxKeys
  if (config.maxKeys !== undefined) {
    if (!Number.isInteger(config.maxKeys) || config.maxKeys <= 0) {
      throw new Error(
        `[flowguard] Invalid config: 'maxKeys' must be a positive integer, received: ${config.maxKeys}`,
      );
    }
  }

  // V-011: debug
  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
    throw new Error(
      `[flowguard] Invalid config: 'debug' must be a boolean, received: ${typeof config.debug}`,
    );
  }

  // V-012: message
  if (config.message !== undefined) {
    if (typeof config.message !== 'string' && (typeof config.message !== 'object' || config.message === null || Array.isArray(config.message))) {
      throw new Error(
        `[flowguard] Invalid config: 'message' must be a string or non-array object, received: ${typeof config.message}`,
      );
    }
  }

  return {
    ...config,
    algorithm: config.algorithm ?? 'fixed-window',
    maxKeys: config.maxKeys ?? 10_000,
    debug: config.debug ?? false,
    headers: config.headers ?? true,
    message: config.message ?? 'Too many requests',
    statusCode: config.statusCode ?? 429,
  };
}
