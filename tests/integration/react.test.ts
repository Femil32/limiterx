// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRateLimit } from '../../src/adapters/react.js';

describe('useRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state: allowed=true, remaining=max, retryAfter=0, resetAt=null', () => {
    const { result } = renderHook(() =>
      useRateLimit('test', { max: 5, window: '1m' }),
    );

    expect(result.current.allowed).toBe(true);
    expect(result.current.remaining).toBe(5);
    expect(result.current.retryAfter).toBe(0);
    expect(result.current.resetAt).toBeNull();
  });

  it('attempt() returns true when allowed, updates remaining', () => {
    const { result } = renderHook(() =>
      useRateLimit('test', { max: 5, window: '1m' }),
    );

    let returned: boolean;
    act(() => {
      returned = result.current.attempt();
    });

    expect(returned!).toBe(true);
    expect(result.current.remaining).toBe(4);
  });

  it('after max attempts, attempt() returns false and allowed becomes false', () => {
    const { result } = renderHook(() =>
      useRateLimit('test', { max: 3, window: '1m' }),
    );

    act(() => {
      result.current.attempt();
      result.current.attempt();
      result.current.attempt();
    });

    // At this point we've used all 3; next attempt should be denied
    let returned: boolean;
    act(() => {
      returned = result.current.attempt();
    });

    expect(returned!).toBe(false);
    expect(result.current.allowed).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('reset() returns to initial state', () => {
    const { result } = renderHook(() =>
      useRateLimit('test', { max: 3, window: '1m' }),
    );

    act(() => {
      result.current.attempt();
      result.current.attempt();
      result.current.attempt();
      result.current.attempt(); // denied
    });

    expect(result.current.allowed).toBe(false);

    act(() => {
      result.current.reset();
    });

    expect(result.current.allowed).toBe(true);
    expect(result.current.remaining).toBe(3);
    expect(result.current.retryAfter).toBe(0);
    expect(result.current.resetAt).toBeNull();
  });

  it('onLimit callback fires when denied', () => {
    const onLimit = vi.fn();
    const { result } = renderHook(() =>
      useRateLimit('test', { max: 2, window: '1m', onLimit }),
    );

    act(() => {
      result.current.attempt();
      result.current.attempt();
      // window exhausted; next call triggers onLimit
      result.current.attempt();
    });

    expect(onLimit).toHaveBeenCalledOnce();
    expect(onLimit.mock.calls[0][0]).toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it('after window expires state resets automatically', async () => {
    const windowMs = 1000;
    const { result } = renderHook(() =>
      useRateLimit('test', { max: 2, window: windowMs }),
    );

    act(() => {
      result.current.attempt();
      result.current.attempt();
      result.current.attempt(); // denied — schedules reset timer
    });

    expect(result.current.allowed).toBe(false);

    // Advance time past the window boundary
    await act(async () => {
      vi.advanceTimersByTime(windowMs + 1);
    });

    expect(result.current.allowed).toBe(true);
    expect(result.current.remaining).toBe(2);
    expect(result.current.retryAfter).toBe(0);
    expect(result.current.resetAt).toBeNull();
  });
});
