import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../../src/core/createRateLimiter.js';

describe('runtime validation warnings', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when windowMs exceeds max setTimeout value (2147483647ms)', () => {
    const limiter = createRateLimiter({ max: 5, window: 2147483648 });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[limiterx]'),
    );
    limiter.destroy();
  });

  it('does not warn when windowMs is within safe range', () => {
    const limiter = createRateLimiter({ max: 5, window: '1h' });
    expect(console.warn).not.toHaveBeenCalled();
    limiter.destroy();
  });

  it('validate: false suppresses warnings', () => {
    const limiter = createRateLimiter({ max: 5, window: 2147483648, validate: false });
    expect(console.warn).not.toHaveBeenCalled();
    limiter.destroy();
  });

  it('validate: { windowMs: false } suppresses only windowMs warning', () => {
    const limiter = createRateLimiter({ max: 5, window: 2147483648, validate: { windowMs: false } });
    expect(console.warn).not.toHaveBeenCalled();
    limiter.destroy();
  });
});
