import { describe, it, expect, vi } from 'vitest';
import { rateLimitFetch } from '../../src/adapters/fetch.js';
import { RateLimitError } from '../../src/core/RateLimitError.js';

function mockResponse(): Response {
  return new Response('ok', { status: 200 });
}

describe('rateLimitFetch', () => {
  it('calls underlying fetch when allowed', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse());
    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max: 5,
      window: '1m',
    });

    const res = await guarded('https://example.com/api');

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith('https://example.com/api', undefined);
    expect(res.status).toBe(200);
  });

  it('does NOT call fetch when denied — throws RateLimitError', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse());
    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max: 1,
      window: '1m',
    });

    await guarded('https://example.com/api'); // allowed

    await expect(guarded('https://example.com/api')).rejects.toThrow(RateLimitError);
    // fetch should only have been called once (the allowed request)
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('RateLimitError has name="RateLimitError" and result property', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse());
    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max: 1,
      window: '1m',
    });

    await guarded('https://example.com/api'); // allowed

    let caught: unknown;
    try {
      await guarded('https://example.com/api');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RateLimitError);
    const error = caught as RateLimitError;
    expect(error.name).toBe('RateLimitError');
    expect(error.result).toBeDefined();
    expect(error.result.allowed).toBe(false);
    expect(error.result.remaining).toBe(0);
    expect(typeof error.result.retryAfter).toBe('number');
    expect(error.result.retryAfter).toBeGreaterThan(0);
  });

  it('onLimit callback fires on deny', async () => {
    const onLimit = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue(mockResponse());
    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max: 1,
      window: '1m',
      onLimit,
    });

    await guarded('https://example.com/api'); // allowed
    await expect(guarded('https://example.com/api')).rejects.toThrow(RateLimitError);

    expect(onLimit).toHaveBeenCalledOnce();
    expect(onLimit.mock.calls[0][0]).toMatchObject({ allowed: false });
  });

  it('after max requests, subsequent calls throw', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse());
    const max = 3;
    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max,
      window: '1m',
    });

    for (let i = 0; i < max; i++) {
      await guarded('https://example.com/api');
    }

    await expect(guarded('https://example.com/api')).rejects.toThrow(RateLimitError);
    await expect(guarded('https://example.com/api')).rejects.toThrow(RateLimitError);
    expect(fetchFn).toHaveBeenCalledTimes(max);
  });

  it('custom keyGenerator works', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse());
    let keyGenCallCount = 0;

    const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
      max: 5,
      window: '1m',
      keyGenerator: (ctx) => {
        keyGenCallCount++;
        // Key based on URL pathname
        const url = ctx['input'] as string;
        return url.includes('admin') ? 'admin' : 'public';
      },
    });

    await guarded('https://example.com/admin/action');
    await guarded('https://example.com/public/data');

    expect(keyGenCallCount).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
