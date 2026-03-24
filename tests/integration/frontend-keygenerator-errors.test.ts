import { describe, it, expect, vi } from 'vitest';
import { rateLimitFetch } from '../../src/adapters/fetch.js';
import { rateLimitAxios } from '../../src/adapters/axios.js';
import { RateLimitError } from '../../src/core/RateLimitError.js';

const keyGenError = new Error('keyGenerator exploded');

function throwingKeyGenerator(): string {
  throw keyGenError;
}

describe('FR-019: keyGenerator errors propagate in frontend adapters', () => {
  describe('rateLimitFetch', () => {
    it('error from keyGenerator propagates (not RateLimitError, not silent)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
      const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
        max: 5,
        window: '1m',
        keyGenerator: throwingKeyGenerator,
      });

      await expect(guarded('https://example.com/api')).rejects.toThrow(keyGenError);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('the error is the original error from keyGenerator, not a rate limit error', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
      const guarded = rateLimitFetch(fetchFn as unknown as typeof fetch, {
        max: 5,
        window: '1m',
        keyGenerator: throwingKeyGenerator,
      });

      let caught: unknown;
      try {
        await guarded('https://example.com/api');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBe(keyGenError);
      expect(caught).not.toBeInstanceOf(RateLimitError);
    });
  });

  describe('rateLimitAxios', () => {
    it('error from keyGenerator propagates (not RateLimitError, not silent)', async () => {
      const interceptors: Array<(config: any) => Promise<any>> = [];
      const instance = {
        interceptors: {
          request: {
            use(onFulfilled: (config: any) => Promise<any>) {
              interceptors.push(onFulfilled);
              return interceptors.length - 1;
            },
          },
        },
        async request(config: any) {
          let current = config;
          for (const interceptor of interceptors) {
            current = await interceptor(current);
          }
          return { data: 'ok', status: 200 };
        },
      };

      rateLimitAxios(instance, {
        max: 5,
        window: '1m',
        keyGenerator: throwingKeyGenerator,
      });

      await expect(instance.request({ url: '/api/data' })).rejects.toThrow(keyGenError);
    });

    it('the error is the original error from keyGenerator, not a rate limit error', async () => {
      const interceptors: Array<(config: any) => Promise<any>> = [];
      const instance = {
        interceptors: {
          request: {
            use(onFulfilled: (config: any) => Promise<any>) {
              interceptors.push(onFulfilled);
              return interceptors.length - 1;
            },
          },
        },
        async request(config: any) {
          let current = config;
          for (const interceptor of interceptors) {
            current = await interceptor(current);
          }
          return { data: 'ok', status: 200 };
        },
      };

      rateLimitAxios(instance, {
        max: 5,
        window: '1m',
        keyGenerator: throwingKeyGenerator,
      });

      let caught: unknown;
      try {
        await instance.request({ url: '/api/data' });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBe(keyGenError);
      expect(caught).not.toBeInstanceOf(RateLimitError);
    });
  });
});
