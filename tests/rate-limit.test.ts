import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimits, checkRateLimit } from "../app/lib/rate-limit.server";

describe("sliding-window rate limiter", () => {
  beforeEach(() => _resetRateLimits());

  it("allows up to the limit and then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k", 3, 60_000, now + i).allowed).toBe(true);
    }
    expect(checkRateLimit("k", 3, 60_000, now + 10).allowed).toBe(false);
  });

  it("frees capacity as the window slides", () => {
    const now = 1_000_000;
    checkRateLimit("k", 2, 60_000, now);
    checkRateLimit("k", 2, 60_000, now + 1);
    expect(checkRateLimit("k", 2, 60_000, now + 2).allowed).toBe(false);
    expect(checkRateLimit("k", 2, 60_000, now + 60_001).allowed).toBe(true);
  });

  it("keeps keys independent", () => {
    const now = 1_000_000;
    expect(checkRateLimit("a", 1, 60_000, now).allowed).toBe(true);
    expect(checkRateLimit("a", 1, 60_000, now + 1).allowed).toBe(false);
    expect(checkRateLimit("b", 1, 60_000, now + 1).allowed).toBe(true);
  });
});
