import { describe, expect, it } from "vitest";
import {
  isValidStorageKey,
  newStorageKey,
  signAssetPath,
  verifyAssetSignature,
} from "../app/lib/storage.server";

describe("storage keys", () => {
  it("generates valid, non-guessable keys", () => {
    const key = newStorageKey("shop123", "photo");
    expect(isValidStorageKey(key)).toBe(true);
    expect(key).toMatch(/^shop123\/photo\/[a-f0-9]{64}\.jpg$/);
    expect(newStorageKey("shop123", "photo")).not.toBe(key);
  });

  it("rejects traversal and malformed keys", () => {
    expect(isValidStorageKey("../etc/passwd")).toBe(false);
    expect(isValidStorageKey("shop/photo/short.jpg")).toBe(false);
    expect(isValidStorageKey("shop/other/" + "a".repeat(64) + ".jpg")).toBe(false);
    expect(isValidStorageKey("shop/photo/" + "a".repeat(64) + ".png")).toBe(false);
  });
});

describe("signed asset URLs", () => {
  const key = "shop1/result/" + "b".repeat(64) + ".jpg";

  it("verifies a fresh signature", () => {
    const { exp, sig } = signAssetPath(key, 60);
    expect(verifyAssetSignature(key, exp, sig)).toBe(true);
  });

  it("rejects expired signatures", () => {
    const { sig } = signAssetPath(key, 60);
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(verifyAssetSignature(key, past, sig)).toBe(false);
  });

  it("rejects signatures for a different key", () => {
    const { exp, sig } = signAssetPath(key, 60);
    const otherKey = "shop2/result/" + "c".repeat(64) + ".jpg";
    expect(verifyAssetSignature(otherKey, exp, sig)).toBe(false);
  });

  it("rejects tampered expiry", () => {
    const { exp, sig } = signAssetPath(key, 60);
    expect(verifyAssetSignature(key, exp + 9999, sig)).toBe(false);
  });
});
