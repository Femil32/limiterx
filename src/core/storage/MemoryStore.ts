import type { StorageAdapter } from '../types.js';

interface MemoryEntry {
  data: Record<string, number>;
  expiresAt: number;
}

/**
 * In-memory storage adapter using a Map with LRU eviction and periodic TTL cleanup.
 * Default storage for all rate limiters in v1.0.
 *
 * @example
 * ```typescript
 * const store = new MemoryStore({ maxKeys: 10000, cleanupIntervalMs: 60000 });
 * await store.increment('user-123', 60000);
 * store.destroy(); // Stop cleanup timer
 * ```
 */
export class MemoryStore implements StorageAdapter {
  private readonly map = new Map<string, MemoryEntry>();
  private readonly maxKeys: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { maxKeys?: number; cleanupIntervalMs?: number }) {
    this.maxKeys = options?.maxKeys ?? 10_000;
    const cleanupIntervalMs = options?.cleanupIntervalMs ?? 60_000;

    this.timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Prevent timer from holding the event loop open in Node.js
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  /** @inheritdoc */
  async get(key: string): Promise<Record<string, number> | null> {
    const entry = this.map.get(key);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }

    // Move to end for LRU freshness
    this.map.delete(key);
    this.map.set(key, entry);

    return { ...entry.data };
  }

  /** @inheritdoc */
  async set(key: string, state: Record<string, number>, ttlMs: number): Promise<void> {
    this.evictIfNeeded(key);

    this.map.delete(key); // Remove to re-insert at end
    this.map.set(key, {
      data: { ...state },
      expiresAt: Date.now() + ttlMs,
    });
  }

  /** @inheritdoc */
  async increment(key: string, ttlMs: number): Promise<number> {
    const existing = this.map.get(key);
    const now = Date.now();

    if (existing && existing.expiresAt >= now) {
      existing.data['count'] = (existing.data['count'] ?? 0) + 1;
      // Move to end for LRU
      this.map.delete(key);
      this.map.set(key, existing);
      return existing.data['count'];
    }

    // New entry or expired
    if (existing) {
      this.map.delete(key);
    }
    this.evictIfNeeded(key);

    const entry: MemoryEntry = {
      data: { count: 1, windowStart: now },
      expiresAt: now + ttlMs,
    };
    this.map.set(key, entry);
    return 1;
  }

  /** @inheritdoc */
  async decrement(key: string, _ttlMs: number): Promise<void> {
    const entry = this.map.get(key);
    if (!entry || entry.expiresAt < Date.now()) return; // no-op if missing/expired
    if ((entry.data['count'] ?? 0) > 0) {
      entry.data['count'] = (entry.data['count'] ?? 1) - 1;
    }
  }

  /** @inheritdoc */
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  /** @inheritdoc */
  async clear(): Promise<void> {
    this.map.clear();
  }

  /**
   * Stop background cleanup timer and release resources.
   * Must be called when the store is no longer needed (e.g., in tests or server shutdown).
   *
   * @example
   * ```typescript
   * const store = new MemoryStore();
   * // ... use store ...
   * store.destroy();
   * ```
   */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Current number of keys in the store. */
  get size(): number {
    return this.map.size;
  }

  private evictIfNeeded(incomingKey: string): void {
    if (this.map.size >= this.maxKeys && !this.map.has(incomingKey)) {
      // Evict oldest (first key in Map iteration order)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt < now) {
        this.map.delete(key);
      }
    }
  }
}
