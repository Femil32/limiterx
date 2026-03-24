/**
 * Parse a human-readable duration string or number into milliseconds.
 *
 * @param window - Duration as a number (milliseconds) or string ('500ms', '30s', '5m', '1h', '1d')
 * @returns Duration in milliseconds
 * @throws Error if the input is not a valid duration
 *
 * @example
 * ```typescript
 * parseWindow('30s');  // 30000
 * parseWindow('5m');   // 300000
 * parseWindow(1000);   // 1000
 * ```
 */
export function parseWindow(window: string | number): number {
  if (typeof window === 'number') {
    if (!Number.isFinite(window) || window <= 0) {
      throw new Error(
        `[flowguard] Invalid config: 'window' must be a positive number (ms) or duration string ('30s', '5m', '1h'), received: ${window}`,
      );
    }
    return window;
  }

  if (typeof window !== 'string') {
    throw new Error(
      `[flowguard] Invalid config: 'window' must be a positive number (ms) or duration string ('30s', '5m', '1h'), received: ${typeof window}`,
    );
  }

  const trimmed = window.trim();
  const match = trimmed.match(/^(\d+)(ms|s|m|h|d)$/);

  if (!match) {
    throw new Error(
      `[flowguard] Invalid config: 'window' string '${window}' is not a valid duration format. Expected: '500ms', '30s', '5m', '1h', '1d'`,
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  const ms = value * multipliers[unit];

  if (ms < 1) {
    throw new Error(
      `[flowguard] Invalid config: 'window' string '${window}' is not a valid duration format. Expected: '500ms', '30s', '5m', '1h', '1d'`,
    );
  }

  return ms;
}
