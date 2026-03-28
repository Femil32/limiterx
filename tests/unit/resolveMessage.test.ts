import { describe, it, expect } from 'vitest';
import { resolveMessage } from '../../src/adapters/internal/resolve-message.js';
import type { RateLimiterResult, RequestContext } from '../../src/core/types.js';

const mockResult: RateLimiterResult = {
  allowed: false,
  remaining: 0,
  limit: 10,
  retryAfter: 60000,
  resetAt: new Date(Date.now() + 60000),
  key: 'test-key',
};

const mockCtx: RequestContext = { key: 'test-key' };

describe('resolveMessage', () => {
  it('returns string message unchanged', async () => {
    const result = await resolveMessage('Too many requests', mockResult, mockCtx);
    expect(result).toBe('Too many requests');
  });

  it('returns object message unchanged', async () => {
    const msg = { error: 'rate_limited', code: 429 };
    const result = await resolveMessage(msg, mockResult, mockCtx);
    expect(result).toEqual(msg);
  });

  it('returns default message when undefined', async () => {
    const result = await resolveMessage(undefined, mockResult, mockCtx);
    expect(result).toBe('Too many requests');
  });

  it('calls sync function and returns its result', async () => {
    const fn = (r: RateLimiterResult) => `retry in ${Math.ceil(r.retryAfter / 1000)}s`;
    const result = await resolveMessage(fn, mockResult, mockCtx);
    expect(result).toBe('retry in 60s');
  });

  it('calls async function and returns its resolved value', async () => {
    const fn = async (r: RateLimiterResult) => ({ retryAfter: r.retryAfter });
    const result = await resolveMessage(fn, mockResult, mockCtx);
    expect(result).toEqual({ retryAfter: 60000 });
  });

  it('function receives result and ctx', async () => {
    let receivedResult: RateLimiterResult | undefined;
    let receivedCtx: RequestContext | undefined;
    const fn = (r: RateLimiterResult, c: RequestContext) => {
      receivedResult = r;
      receivedCtx = c;
      return 'msg';
    };
    await resolveMessage(fn, mockResult, mockCtx);
    expect(receivedResult).toBe(mockResult);
    expect(receivedCtx).toBe(mockCtx);
  });

  it('function returning object — object is returned as-is', async () => {
    const fn = () => ({ code: 'QUOTA_EXCEEDED' });
    const result = await resolveMessage(fn, mockResult, mockCtx);
    expect(result).toEqual({ code: 'QUOTA_EXCEEDED' });
  });
});
