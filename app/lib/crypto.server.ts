import crypto from "node:crypto";

/**
 * AES-256-GCM authenticated encryption for merchant API keys.
 *
 * The master key lives ONLY in the ENCRYPTION_KEY environment variable
 * (32 bytes, base64). Generate one with: openssl rand -base64 32
 *
 * Ciphertext format (base64): [12-byte IV][16-byte auth tag][ciphertext]
 */

function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes of base64 data.");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const data = Buffer.from(payload, "base64");
  if (data.length < 29) throw new Error("Invalid encrypted payload.");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Displayable masked form, e.g. "sk-••••••••8F3K". Never reveals the middle. */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  const prefix = trimmed.slice(0, Math.min(3, trimmed.length));
  const suffix = trimmed.length > 7 ? trimmed.slice(-4) : "";
  return `${prefix}••••••••${suffix}`;
}

/** SHA-256 hex digest, used for visitor token hashing (tokens never stored raw). */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** HMAC-SHA256 hex, used for signing local-storage asset URLs. */
export function hmacHex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
