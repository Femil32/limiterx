import type { StorageAdapter } from '../core/types.js';

/**
 * Duck-typed Redis client interface compatible with ioredis and node-redis.
 */
export interface RedisClientInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<string | null>;
  del(key: string): Promise<number>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  flushall(): Promise<string>;
}

const LUA_INCREMENT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;

/**
 * Redis-backed storage adapter for multi-process rate limiting.
 * Pass a RedisStore instance as `store` in your limiterx config.
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { RedisStore } from 'limiterx/redis';
 * const store = new RedisStore(new Redis());
 * ```
 */
export class RedisStore implements StorageAdapter {
  constructor(private readonly client: RedisClientInterface) {}

  async get(key: string): Promise<Record<string, number> | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return null;
    }
  }

  async set(key: string, state: Record<string, number>, ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(state), { ex: Math.ceil(ttlMs / 1000) });
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const ttlSec = Math.ceil(ttlMs / 1000);
    const count = Number(await this.client.eval(LUA_INCREMENT, [key], [String(ttlSec)]));
    return count;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async decrement(key: string, ttlMs: number): Promise<void> {
    const raw = await this.client.get(key);
    if (!raw) return;
    try {
      const state = JSON.parse(raw) as Record<string, number>;
      if ((state['count'] ?? 0) > 0) {
        state['count'] = (state['count'] ?? 1) - 1;
        await this.client.set(key, JSON.stringify(state), { ex: Math.max(1, Math.ceil(ttlMs / 1000)) });
      }
    } catch {
      // Ignore parse errors
    }
  }

  /**
   * Remove all keys in the connected Redis database.
   * WARNING: This calls FLUSHALL — use only in test environments or isolated Redis instances.
   */
  async clear(): Promise<void> {
    await this.client.flushall();
  }
}
