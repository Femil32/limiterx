import { describe, it, expect, vi } from 'vitest';
import { rateLimitAxios } from '../../src/adapters/axios.js';
import { RateLimitError } from '../../src/core/RateLimitError.js';

function createMockAxios() {
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
      return { data: 'ok', status: 200, config: current };
    },
  };
  return { instance, interceptors };
}

describe('rateLimitAxios', () => {
  it('interceptor allows requests within limit', async () => {
    const { instance } = createMockAxios();
    rateLimitAxios(instance, { max: 5, window: '1m' });

    const res = await instance.request({ url: '/api/data', method: 'GET' });

    expect(res.status).toBe(200);
    expect(res.data).toBe('ok');
  });

  it('interceptor rejects with RateLimitError when denied', async () => {
    const { instance } = createMockAxios();
    rateLimitAxios(instance, { max: 1, window: '1m' });

    await instance.request({ url: '/api/data', method: 'GET' }); // allowed

    await expect(
      instance.request({ url: '/api/data', method: 'GET' }),
    ).rejects.toThrow(RateLimitError);
  });

  it('RateLimitError has name="RateLimitError" and result property', async () => {
    const { instance } = createMockAxios();
    rateLimitAxios(instance, { max: 1, window: '1m' });

    await instance.request({ url: '/api/data', method: 'GET' }); // allowed

    let caught: unknown;
    try {
      await instance.request({ url: '/api/data', method: 'GET' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RateLimitError);
    const error = caught as RateLimitError;
    expect(error.name).toBe('RateLimitError');
    expect(error.result).toBeDefined();
    expect(error.result.allowed).toBe(false);
    expect(error.result.remaining).toBe(0);
    expect(error.result.retryAfter).toBeGreaterThan(0);
  });

  it('onLimit callback fires when denied', async () => {
    const onLimit = vi.fn();
    const { instance } = createMockAxios();
    rateLimitAxios(instance, { max: 1, window: '1m', onLimit });

    await instance.request({ url: '/api/data', method: 'GET' }); // allowed
    await expect(
      instance.request({ url: '/api/data', method: 'GET' }),
    ).rejects.toThrow(RateLimitError);

    expect(onLimit).toHaveBeenCalledOnce();
    expect(onLimit.mock.calls[0][0]).toMatchObject({ allowed: false });
  });

  it('network request is never made when denied', async () => {
    const networkSpy = vi.fn().mockResolvedValue({ data: 'ok', status: 200 });
    const interceptors: Array<(config: any) => Promise<any>> = [];

    // Mock instance that tracks whether network layer is reached
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
        // Only reaches here if all interceptors pass
        return networkSpy(current);
      },
    };

    rateLimitAxios(instance, { max: 2, window: '1m' });

    await instance.request({ url: '/api/data' }); // allowed
    await instance.request({ url: '/api/data' }); // allowed (uses up limit)

    // Denied — should not reach network
    await expect(instance.request({ url: '/api/data' })).rejects.toThrow(RateLimitError);

    expect(networkSpy).toHaveBeenCalledTimes(2);
  });
});
