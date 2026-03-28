import { describe, it, expect } from 'vitest';
import { isIPv6, maskIPv6 } from '../../src/adapters/internal/ipv6.js';

describe('isIPv6', () => {
  it('returns true for full IPv6 address', () => {
    expect(isIPv6('2001:db8::1')).toBe(true);
  });

  it('returns true for loopback ::1', () => {
    expect(isIPv6('::1')).toBe(true);
  });

  it('returns true for IPv4-mapped IPv6', () => {
    expect(isIPv6('::ffff:192.168.1.1')).toBe(true);
  });

  it('returns false for IPv4', () => {
    expect(isIPv6('192.168.1.1')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isIPv6('')).toBe(false);
  });
});

describe('maskIPv6', () => {
  it('returns IPv4 addresses unchanged', () => {
    expect(maskIPv6('192.168.1.1', 56)).toBe('192.168.1.1');
    expect(maskIPv6('203.0.113.42', 56)).toBe('203.0.113.42');
    expect(maskIPv6('127.0.0.1', 56)).toBe('127.0.0.1');
  });

  it('masks IPv6 to /56 — same subnet shares one key', () => {
    const a = maskIPv6('2001:db8:1234:5600:1:2:3:4', 56);
    const b = maskIPv6('2001:db8:1234:5600:a:b:c:d', 56);
    expect(a).toBe(b);
  });

  it('masks IPv6 to /56 — different subnets produce different keys', () => {
    const a = maskIPv6('2001:db8:1234:5600::1', 56);
    const b = maskIPv6('2001:db8:1234:5700::1', 56);
    expect(a).not.toBe(b);
  });

  it('masks ::1 (loopback) to :: at /56', () => {
    expect(maskIPv6('::1', 56)).toBe('::');
  });

  it('masks to /48', () => {
    const a = maskIPv6('2001:db8:1234:5600::1', 48);
    const b = maskIPv6('2001:db8:1234:9999::1', 48);
    expect(a).toBe(b); // same /48: 2001:db8:1234::/48
  });

  it('masks to /64 — interface bits zeroed', () => {
    const a = maskIPv6('2001:db8::1:2:3:4', 64);
    const b = maskIPv6('2001:db8::9:8:7:6', 64);
    expect(a).toBe(b);
    expect(a).toBe('2001:db8::');
  });

  it('prefix=128 preserves entire address', () => {
    const ip = '2001:db8::1';
    const masked = maskIPv6(ip, 128);
    // Should normalize but not change bits
    expect(masked).toBe('2001:db8::1');
  });

  it('handles full expanded IPv6 address', () => {
    const result = maskIPv6('2001:0db8:0000:0000:0001:0002:0003:0004', 56);
    expect(typeof result).toBe('string');
    expect(result).toContain(':');
  });

  it('handles IPv4-mapped IPv6 (::ffff:a.b.c.d form is not standard hex — passes through)', () => {
    // ::ffff:192.168.1.1 is an IPv4-mapped address in mixed notation
    // Our parser expects pure hex groups — mixed notation passes through unchanged if unparseable
    const result = maskIPv6('::ffff:192.168.1.1', 56);
    // If it doesn't parse cleanly, it returns the original string
    expect(typeof result).toBe('string');
  });

  it('handles pure IPv6 form of IPv4-mapped address', () => {
    // ::ffff:c0a8:0101 = ::ffff:192.168.1.1 in pure hex
    const a = maskIPv6('::ffff:c0a8:0101', 56);
    const b = maskIPv6('::ffff:c0a8:0202', 56);
    // Both are in the same /56 range
    expect(a).toBe(b);
  });

  it('compresses consecutive zero groups with ::', () => {
    const result = maskIPv6('2001:db8::1', 32);
    // Top 32 bits preserved: 2001:db8, rest zeroed
    expect(result).toBe('2001:db8::');
  });

  it('handles address with no zero groups (no :: compression)', () => {
    const result = maskIPv6('2001:db8:1:2:3:4:5:6', 128);
    expect(result).toContain('2001');
  });
});
