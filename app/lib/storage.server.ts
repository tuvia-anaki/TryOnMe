import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { S3Client as S3ClientType } from "@aws-sdk/client-s3";
import { hmacHex, safeEqual } from "./crypto.server";

/**
 * Private object storage for shopper photos and generated try-on results.
 *
 * Two drivers:
 *  - "local": files on disk under STORAGE_LOCAL_DIR, served through the
 *    /asset route with short-lived HMAC-signed URLs. Zero-setup for dev.
 *  - "s3": any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) with
 *    presigned GET URLs. Set STORAGE_DRIVER=s3 plus the S3_* variables.
 *
 * Keys are non-guessable (32 random bytes) and always namespaced by shop,
 * so assets are never enumerable and never publicly readable.
 */

export interface StoredObject {
  key: string;
}

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** URL a browser can load for a limited time. */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

const SIGNED_URL_TTL = 60 * 60; // 1 hour

export function newStorageKey(shopId: string, kind: "photo" | "result"): string {
  const random = crypto.randomBytes(32).toString("hex");
  return `${shopId}/${kind}/${random}.jpg`;
}

function assetSigningSecret(): string {
  const secret =
    process.env.ASSET_SIGNING_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ASSET_SIGNING_SECRET or ENCRYPTION_KEY must be set.");
  return secret;
}

export function signAssetPath(key: string, expiresInSeconds = SIGNED_URL_TTL) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = hmacHex(assetSigningSecret(), `${key}:${exp}`);
  return { exp, sig };
}

export function verifyAssetSignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = hmacHex(assetSigningSecret(), `${key}:${exp}`);
  return safeEqual(expected, sig);
}

/** Reject path traversal / malformed keys before touching the filesystem. */
export function isValidStorageKey(key: string): boolean {
  return /^[a-zA-Z0-9_-]+\/(photo|result)\/[a-f0-9]{64}\.jpg$/.test(key);
}

class LocalDriver implements StorageDriver {
  private baseDir: string;

  constructor() {
    this.baseDir =
      process.env.STORAGE_LOCAL_DIR ||
      path.join(process.cwd(), ".data", "storage");
  }

  private resolve(key: string): string {
    if (!isValidStorageKey(key)) throw new Error("Invalid storage key.");
    return path.join(this.baseDir, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async signedUrl(key: string, expiresInSeconds = SIGNED_URL_TTL): Promise<string> {
    const { exp, sig } = signAssetPath(key, expiresInSeconds);
    const base = process.env.SHOPIFY_APP_URL || "";
    return `${base}/asset/${key}?exp=${exp}&sig=${sig}`;
  }
}

class S3Driver implements StorageDriver {
  private clientPromise: Promise<{
    client: S3ClientType;
    bucket: string;
  }> | null = null;

  private async setup() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        const bucket = process.env.S3_BUCKET;
        if (!bucket) throw new Error("S3_BUCKET must be set for the s3 storage driver.");
        const client = new S3Client({
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
          credentials:
            process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
              ? {
                  accessKeyId: process.env.S3_ACCESS_KEY_ID,
                  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
                }
              : undefined,
        });
        return { client, bucket };
      })();
    }
    return this.clientPromise;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const { client, bucket } = await this.setup();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const { client, bucket } = await this.setup();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    const { client, bucket } = await this.setup();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async signedUrl(key: string, expiresInSeconds = SIGNED_URL_TTL): Promise<string> {
    const { client, bucket } = await this.setup();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (!driver) {
    driver = process.env.STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();
  }
  return driver;
}
