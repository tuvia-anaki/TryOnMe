/**
 * In-memory sliding-window rate limiter for the public storefront endpoints.
 *
 * Suitable for a single-instance deployment (the MVP). For multi-instance
 * production, back this with Redis — the interface stays the same.
 * Daily per-visitor and per-shop limits are enforced separately against the
 * database (see jobs.server.ts) so they survive restarts.
 */

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  // Periodically drop stale buckets so the map doesn't grow forever.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Sliding-window check. `key` should combine scope + identifier,
 * e.g. `gen:ip:1.2.3.4` or `api:visitor:<hash>`.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  sweep(now, windowMs);
  const entry = windows.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  if (entry.timestamps.length >= limit) {
    windows.set(key, entry);
    return { allowed: false, remaining: 0 };
  }
  entry.timestamps.push(now);
  windows.set(key, entry);
  return { allowed: true, remaining: limit - entry.timestamps.length };
}

/** Test hook. */
export function _resetRateLimits() {
  windows.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// Tuning knobs, centralized.
export const LIMITS = {
  // Expensive generation endpoint: per IP.
  generatePerIp: { limit: 8, windowMs: 10 * 60_000 },
  // Photo uploads: per IP.
  uploadPerIp: { limit: 15, windowMs: 10 * 60_000 },
  // Cheap endpoints (config/status/history): per IP.
  readPerIp: { limit: 240, windowMs: 60_000 },
};
