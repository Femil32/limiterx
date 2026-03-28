/**
 * Pure BigInt IPv6 subnet masking helper.
 * No imports — compatible with Node.js, Next.js Edge Runtime, and browsers.
 * @internal
 */

/**
 * Returns true if the given IP string is an IPv6 address (contains ':').
 * @internal
 */
export function isIPv6(ip: string): boolean {
  return ip.includes(':');
}

/**
 * Apply a subnet prefix mask to an IPv6 address.
 * The top `prefixLength` bits are preserved; all remaining bits are zeroed.
 * IPv4 addresses (no ':') are returned unchanged.
 *
 * @param ip - An IPv4 or IPv6 address string
 * @param prefixLength - Number of leading bits to preserve (1–128)
 * @returns Masked IPv6 address in compressed notation, or original IPv4 string
 *
 * @example
 * ```typescript
 * maskIPv6('2001:db8::1', 56)   // '2001:db8::'
 * maskIPv6('192.168.1.1', 56)   // '192.168.1.1'  (IPv4 unchanged)
 * maskIPv6('::1', 56)           // '::'
 * ```
 * @internal
 */
export function maskIPv6(ip: string, prefixLength: number): string {
  if (!isIPv6(ip)) return ip;

  const expanded = expandIPv6(ip);
  if (expanded === null) return ip; // malformed — return unchanged

  const ipBig = groupsToBigInt(expanded);
  const mask = buildMask(prefixLength);
  const masked = ipBig & mask;
  return compressIPv6(bigIntToGroups(masked));
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Expand an IPv6 address (with possible '::' abbreviation) into 8 hex groups.
 * Returns null if the address is unparseable.
 */
function expandIPv6(ip: string): string[] | null {
  // Strip IPv6 zone ID (e.g. "fe80::1%eth0")
  const zoneIdx = ip.indexOf('%');
  const addr = zoneIdx !== -1 ? ip.slice(0, zoneIdx) : ip;

  const halves = addr.split('::');

  if (halves.length > 2) return null; // multiple '::' — invalid

  if (halves.length === 2) {
    // Has '::' abbreviation
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const middle = Array<string>(missing).fill('0000');
    return [...left, ...middle, ...right].map(normalizeGroup);
  }

  // No '::' — must be exactly 8 groups
  const groups = addr.split(':');
  if (groups.length !== 8) return null;
  return groups.map(normalizeGroup);
}

/** Pad a hex group to 4 characters. */
function normalizeGroup(g: string): string {
  return g.padStart(4, '0');
}

/** Convert 8 hex groups to a 128-bit BigInt. */
function groupsToBigInt(groups: string[]): bigint {
  let result = 0n;
  for (const group of groups) {
    result = (result << 16n) | BigInt(parseInt(group, 16));
  }
  return result;
}

/** Convert a 128-bit BigInt back to 8 hex groups (4 chars each). */
function bigIntToGroups(n: bigint): string[] {
  const groups: string[] = [];
  let remaining = n;
  for (let i = 0; i < 8; i++) {
    groups.unshift((remaining & 0xffffn).toString(16).padStart(4, '0'));
    remaining >>= 16n;
  }
  return groups;
}

/** Build a 128-bit mask with the top `prefixLength` bits set to 1. */
function buildMask(prefixLength: number): bigint {
  if (prefixLength <= 0) return 0n;
  if (prefixLength >= 128) return (1n << 128n) - 1n;
  return ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefixLength)) - 1n);
}

/**
 * Compress 8 hex groups into standard IPv6 notation.
 * Replaces the longest run of consecutive all-zero groups with '::'.
 */
function compressIPv6(groups: string[]): string {
  // Find the longest run of '0000' groups
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < 8; i++) {
    if (groups[i] === '0000') {
      if (curStart === -1) {
        curStart = i;
        curLen = 1;
      } else {
        curLen++;
      }
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  // Strip leading zeros from each group
  const parts = groups.map(g => parseInt(g, 16).toString(16));

  if (bestLen < 2) {
    // No compression worth applying
    return parts.join(':');
  }

  const left = parts.slice(0, bestStart).join(':');
  const right = parts.slice(bestStart + bestLen).join(':');

  if (left === '' && right === '') return '::';
  if (left === '') return `::${right}`;
  if (right === '') return `${left}::`;
  return `${left}::${right}`;
}
