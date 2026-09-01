import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
  safeEqual,
  sha256Hex,
} from "../app/lib/crypto.server";

describe("credential encryption (AES-256-GCM)", () => {
  it("round-trips a secret", () => {
    const key = "sk-proj-abc123def456ghij8F3K";
    const encrypted = encryptSecret(key);
    expect(encrypted).not.toContain(key);
    expect(decryptSecret(encrypted)).toBe(key);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const key = "sk-same-key";
    expect(encryptSecret(key)).not.toBe(encryptSecret(key));
  });

  it("rejects tampered ciphertext (authenticated encryption)", () => {
    const encrypted = encryptSecret("sk-secret");
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptSecret(buf.toString("base64"))).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("dG9vc2hvcnQ=")).toThrow();
  });
});

describe("maskApiKey", () => {
  it("shows only prefix and last four characters", () => {
    const masked = maskApiKey("sk-proj-abcdefghijkl8F3K");
    expect(masked).toBe("sk-••••••••8F3K");
    expect(masked).not.toContain("abcdefghijkl");
  });

  it("hides the suffix of very short keys", () => {
    expect(maskApiKey("short")).toBe("sho••••••••");
  });
});

describe("hashing helpers", () => {
  it("sha256Hex is deterministic and hex-shaped", () => {
    expect(sha256Hex("token")).toBe(sha256Hex("token"));
    expect(sha256Hex("token")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("safeEqual compares correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
