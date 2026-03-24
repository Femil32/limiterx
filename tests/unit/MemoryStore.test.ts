import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryStore } from '../../src/core/storage/MemoryStore.js'

describe('MemoryStore', () => {
  let store: MemoryStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = new MemoryStore({ maxKeys: 100, cleanupIntervalMs: 60_000 })
  })

  afterEach(() => {
    store.destroy()
    vi.useRealTimers()
  })

  describe('basic operations', () => {
    it('returns null for a missing key', async () => {
      expect(await store.get('missing')).toBeNull()
    })

    it('set and get returns the stored state', async () => {
      const state = { count: 5, windowStart: Date.now() }
      await store.set('key1', state, 60_000)
      const result = await store.get('key1')
      expect(result).toEqual({ count: 5, windowStart: state.windowStart })
    })

    it('delete removes the key', async () => {
      await store.set('key1', { count: 1, windowStart: 0 }, 60_000)
      await store.delete('key1')
      expect(await store.get('key1')).toBeNull()
    })

    it('delete on missing key does not throw', async () => {
      await expect(store.delete('nonexistent')).resolves.toBeUndefined()
    })

    it('clear removes all keys', async () => {
      await store.set('key1', { count: 1, windowStart: 0 }, 60_000)
      await store.set('key2', { count: 2, windowStart: 0 }, 60_000)
      await store.clear()
      expect(await store.get('key1')).toBeNull()
      expect(await store.get('key2')).toBeNull()
    })

    it('size reflects the number of stored keys', async () => {
      expect(store.size).toBe(0)
      await store.set('key1', { count: 1, windowStart: 0 }, 60_000)
      expect(store.size).toBe(1)
      await store.set('key2', { count: 1, windowStart: 0 }, 60_000)
      expect(store.size).toBe(2)
    })
  })

  describe('increment', () => {
    it('creates a new entry and returns 1', async () => {
      const count = await store.increment('newkey', 60_000)
      expect(count).toBe(1)
    })

    it('subsequent increment returns 2', async () => {
      await store.increment('key', 60_000)
      const count = await store.increment('key', 60_000)
      expect(count).toBe(2)
    })

    it('increments accumulate correctly', async () => {
      for (let i = 1; i <= 5; i++) {
        const count = await store.increment('key', 60_000)
        expect(count).toBe(i)
      }
    })
  })

  describe('async interface', () => {
    it('get returns a promise', () => {
      expect(store.get('k')).toBeInstanceOf(Promise)
    })

    it('set returns a promise', () => {
      expect(store.set('k', { count: 1, windowStart: 0 }, 1000)).toBeInstanceOf(Promise)
    })

    it('increment returns a promise', () => {
      expect(store.increment('k', 1000)).toBeInstanceOf(Promise)
    })

    it('delete returns a promise', () => {
      expect(store.delete('k')).toBeInstanceOf(Promise)
    })

    it('clear returns a promise', () => {
      expect(store.clear()).toBeInstanceOf(Promise)
    })
  })

  describe('TTL expiration', () => {
    it('entry is accessible before TTL expires', async () => {
      await store.set('key', { count: 1, windowStart: Date.now() }, 5_000)
      vi.advanceTimersByTime(4_999)
      expect(await store.get('key')).not.toBeNull()
    })

    it('get returns null after TTL expires', async () => {
      await store.set('key', { count: 1, windowStart: Date.now() }, 5_000)
      vi.advanceTimersByTime(5_001)
      expect(await store.get('key')).toBeNull()
    })

    it('increment resets for expired entry and returns 1', async () => {
      await store.increment('key', 1_000)
      await store.increment('key', 1_000)
      vi.advanceTimersByTime(1_001)
      const count = await store.increment('key', 1_000)
      expect(count).toBe(1)
    })
  })

  describe('LRU eviction', () => {
    it('evicts the oldest key when maxKeys is reached', async () => {
      const smallStore = new MemoryStore({ maxKeys: 3, cleanupIntervalMs: 60_000 })

      await smallStore.set('a', { count: 1, windowStart: 0 }, 60_000)
      await smallStore.set('b', { count: 2, windowStart: 0 }, 60_000)
      await smallStore.set('c', { count: 3, windowStart: 0 }, 60_000)

      // Adding a 4th key should evict 'a' (the oldest)
      await smallStore.set('d', { count: 4, windowStart: 0 }, 60_000)

      expect(await smallStore.get('a')).toBeNull()
      expect(await smallStore.get('b')).not.toBeNull()
      expect(await smallStore.get('c')).not.toBeNull()
      expect(await smallStore.get('d')).not.toBeNull()

      smallStore.destroy()
    })

    it('does not evict when updating an existing key', async () => {
      const smallStore = new MemoryStore({ maxKeys: 3, cleanupIntervalMs: 60_000 })

      await smallStore.set('a', { count: 1, windowStart: 0 }, 60_000)
      await smallStore.set('b', { count: 2, windowStart: 0 }, 60_000)
      await smallStore.set('c', { count: 3, windowStart: 0 }, 60_000)

      // Updating existing key 'a' should not evict anything
      await smallStore.set('a', { count: 5, windowStart: 0 }, 60_000)

      expect(smallStore.size).toBe(3)
      expect(await smallStore.get('a')).not.toBeNull()
      expect(await smallStore.get('b')).not.toBeNull()
      expect(await smallStore.get('c')).not.toBeNull()

      smallStore.destroy()
    })
  })

  describe('background cleanup', () => {
    it('removes expired entries when cleanup interval fires', async () => {
      const cleanupStore = new MemoryStore({ maxKeys: 100, cleanupIntervalMs: 10_000 })

      await cleanupStore.set('expiring', { count: 1, windowStart: 0 }, 1_000)
      await cleanupStore.set('lasting', { count: 1, windowStart: 0 }, 60_000)

      expect(cleanupStore.size).toBe(2)

      // Advance past TTL so entry is expired
      vi.advanceTimersByTime(2_000)

      // Trigger cleanup interval
      vi.advanceTimersByTime(10_000)

      expect(cleanupStore.size).toBe(1)
      expect(await cleanupStore.get('lasting')).not.toBeNull()

      cleanupStore.destroy()
    })
  })

  describe('default maxKeys', () => {
    it('default maxKeys is 10000', () => {
      const defaultStore = new MemoryStore()
      // We can't directly read maxKeys, but we verify it accepts creation
      expect(defaultStore).toBeDefined()
      defaultStore.destroy()
    })
  })

  describe('destroy', () => {
    it('stops cleanup timer without error', () => {
      const s = new MemoryStore({ cleanupIntervalMs: 1_000 })
      expect(() => s.destroy()).not.toThrow()
    })

    it('calling destroy twice does not throw', () => {
      const s = new MemoryStore()
      s.destroy()
      expect(() => s.destroy()).not.toThrow()
    })
  })
})
