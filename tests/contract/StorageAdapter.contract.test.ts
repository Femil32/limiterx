import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../src/core/storage/MemoryStore.js';
import { RedisStore, type RedisClientInterface } from '../../src/adapters/redis.js';
import type { StorageAdapter } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// MockRedisClient — in-memory implementation of RedisClientInterface for tests
// ---------------------------------------------------------------------------

class MockRedisClient implements RedisClientInterface {
  private map = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry || (entry.expiresAt !== Infinity && entry.expiresAt < Date.now())) return null;
    return entry.value;
  }

  async set(key: string, value: string, options?: { ex?: number }): Promise<string | null> {
    const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : Infinity;
    this.map.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.map.delete(key) ? 1 : 0;
  }

  async eval(_script: string, keys: string[], args: string[]): Promise<unknown> {
    const key = keys[0]!;
    const ttlSec = Number(args[0]);
    const existing = this.map.get(key);
    let count: number;
    if (existing && (existing.expiresAt === Infinity || existing.expiresAt >= Date.now())) {
      try {
        const parsed = JSON.parse(existing.value) as Record<string, unknown>;
        count = ((parsed['count'] as number) ?? 0) + 1;
        this.map.set(key, { value: JSON.stringify({ count }), expiresAt: existing.expiresAt });
      } catch {
        count = 2;
      }
    } else {
      count = 1;
      this.map.set(key, {
        value: JSON.stringify({ count: 1 }),
        expiresAt: ttlSec === 0 ? Infinity : Date.now() + ttlSec * 1000,
      });
    }
    return count;
  }

  async flushall(): Promise<string> {
    this.map.clear();
    return 'OK';
  }
}

// ---------------------------------------------------------------------------
// Shared contract tests
// ---------------------------------------------------------------------------

function runStorageAdapterContract(name: string, factory: () => { store: StorageAdapter; destroy?: () => void }) {
  describe(`StorageAdapter contract — ${name}`, () => {
    let store: StorageAdapter;
    let destroyFn: (() => void) | undefined;

    beforeEach(() => {
      const result = factory();
      store = result.store;
      destroyFn = result.destroy;
    });

    // We don't have a global afterEach that calls destroyFn here, but MemoryStore
    // cleanup is not strictly required for short-lived tests. We call it inline
    // in the last test of the MemoryStore block via the factory teardown approach.

    it('get returns null for a missing key', async () => {
      const result = await store.get('no-such-key');
      expect(result).toBeNull();
      destroyFn?.();
    });

    it('set then get returns the stored state', async () => {
      await store.set('key1', { count: 42, windowStart: 1000 }, 60_000);
      const result = await store.get('key1');
      expect(result).not.toBeNull();
      expect(result!['count']).toBe(42);
      expect(result!['windowStart']).toBe(1000);
      destroyFn?.();
    });

    it('increment returns 1 on first call for a new key', async () => {
      const count = await store.increment('incr-key-1', 60_000);
      expect(count).toBe(1);
      destroyFn?.();
    });

    it('increment returns 2 on second call for the same key', async () => {
      await store.increment('incr-key-2', 60_000);
      const count = await store.increment('incr-key-2', 60_000);
      expect(count).toBe(2);
      destroyFn?.();
    });

    it('delete removes a key (get returns null after)', async () => {
      await store.set('del-key', { count: 5 }, 60_000);
      await store.delete('del-key');
      const result = await store.get('del-key');
      expect(result).toBeNull();
      destroyFn?.();
    });

    it('clear removes all keys', async () => {
      await store.set('clear-key-a', { count: 1 }, 60_000);
      await store.set('clear-key-b', { count: 2 }, 60_000);
      await store.clear();
      const a = await store.get('clear-key-a');
      const b = await store.get('clear-key-b');
      expect(a).toBeNull();
      expect(b).toBeNull();
      destroyFn?.();
    });

    it('decrement reduces count by 1 after increment', async () => {
      await store.increment('decr-key', 60_000);
      await store.increment('decr-key', 60_000); // count = 2
      await store.decrement('decr-key', 60_000);
      const result = await store.get('decr-key');
      expect(result).not.toBeNull();
      expect(result!['count']).toBe(1);
      destroyFn?.();
    });

    it('decrement is a no-op for missing key', async () => {
      await expect(store.decrement('no-such-key', 60_000)).resolves.toBeUndefined();
      destroyFn?.();
    });

    it('decrement does not go below 0', async () => {
      await store.increment('floor-key', 60_000); // count = 1
      await store.decrement('floor-key', 60_000); // count = 0
      await store.decrement('floor-key', 60_000); // should floor at 0
      const result = await store.get('floor-key');
      expect(result).not.toBeNull();
      expect(result!['count']).toBe(0);
      destroyFn?.();
    });
  });
}

// ---------------------------------------------------------------------------
// Run contract against MemoryStore
// ---------------------------------------------------------------------------

runStorageAdapterContract('MemoryStore', () => {
  const store = new MemoryStore({ maxKeys: 100 });
  return { store, destroy: () => store.destroy() };
});

// ---------------------------------------------------------------------------
// Run contract against RedisStore (using MockRedisClient)
// ---------------------------------------------------------------------------

runStorageAdapterContract('RedisStore (MockRedisClient)', () => {
  const client = new MockRedisClient();
  const store = new RedisStore(client);
  return { store };
});
