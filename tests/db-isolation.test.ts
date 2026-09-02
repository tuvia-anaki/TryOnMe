import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../app/db.server";
import { encryptSecret, sha256Hex } from "../app/lib/crypto.server";
import {
  deleteVisitorData,
  findOrCreateVisitor,
  findVisitor,
} from "../app/lib/visitor.server";
import { createTryOnJob } from "../app/lib/jobs.server";
import type { ValidatedProduct } from "../app/lib/products.server";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);

/**
 * Integration tests against a scratch PostgreSQL database (see global-setup):
 * shop isolation, visitor ownership, usage limits, duplicate protection,
 * job state transitions and privacy deletion.
 */

const product: ValidatedProduct = {
  productId: "111",
  variantId: null,
  title: "Test Hoodie",
  productType: "Hoodie",
  vendor: "Test",
  description: "",
  variantTitle: null,
  imageUrl: "https://cdn.shopify.com/s/files/1/does-not-exist.jpg",
  imageUrls: ["https://cdn.shopify.com/s/files/1/does-not-exist.jpg"],
};

async function makeShop(domain: string, visitorDailyLimit = 3) {
  const shop = await prisma.shop.create({ data: { shopDomain: domain } });
  await prisma.shopSettings.create({
    data: { shopId: shop.id, provider: "openai", model: "gpt-image-2-medium", visitorDailyLimit },
  });
  await prisma.aIProviderCredential.create({
    data: {
      shopId: shop.id,
      provider: "openai",
      encryptedApiKey: encryptSecret("sk-test"),
      maskedKey: "sk-••••••••test",
    },
  });
  return shop;
}

async function makePhoto(visitorId: string) {
  return prisma.visitorPhoto.create({
    data: {
      visitorId,
      storageKey: `x/photo/${"d".repeat(64)}.jpg`.replace("x", visitorId.slice(0, 8)),
    },
  });
}

const TOKEN_A = "550e8400-e29b-41d4-a716-446655440000";
const TOKEN_B = "660e8400-e29b-41d4-a716-446655440111";

let shop1: Awaited<ReturnType<typeof makeShop>>;
let shop2: Awaited<ReturnType<typeof makeShop>>;

beforeAll(async () => {
  await prisma.shop.deleteMany();
  shop1 = await makeShop("one.myshopify.com");
  shop2 = await makeShop("two.myshopify.com");
});

describe.skipIf(!HAS_DB)("visitor identity and shop isolation", () => {
  it("stores only a token hash", async () => {
    const visitor = await findOrCreateVisitor(shop1.id, TOKEN_A);
    expect(visitor).not.toBeNull();
    expect(visitor!.anonymousTokenHash).toBe(sha256Hex(TOKEN_A));
    expect(visitor!.anonymousTokenHash).not.toContain(TOKEN_A.slice(0, 8));
  });

  it("the same token maps to different visitors per shop", async () => {
    const v1 = await findOrCreateVisitor(shop1.id, TOKEN_A);
    const v2 = await findOrCreateVisitor(shop2.id, TOKEN_A);
    expect(v1!.id).not.toBe(v2!.id);
  });

  it("cannot look up another shop's visitor", async () => {
    await findOrCreateVisitor(shop1.id, TOKEN_B);
    const crossShop = await findVisitor(shop2.id, TOKEN_B);
    expect(crossShop).toBeNull();
  });

  it("rejects malformed tokens outright", async () => {
    expect(await findOrCreateVisitor(shop1.id, "tiny")).toBeNull();
  });
});

describe.skipIf(!HAS_DB)("try-on job creation", () => {
  it("requires a configured provider", async () => {
    const bare = await prisma.shop.create({ data: { shopDomain: "bare.myshopify.com" } });
    await prisma.shopSettings.create({ data: { shopId: bare.id } });
    const visitor = await findOrCreateVisitor(bare.id, TOKEN_A);
    const photo = await makePhoto(visitor!.id);
    const result = await createTryOnJob({
      shopId: bare.id,
      visitorId: visitor!.id,
      visitorPhotoId: photo.id,
      product,
    });
    expect(result).toEqual({ ok: false, error: "not_configured" });
  });

  it("creates a job, transitions out of queued, and dedupes concurrent requests", async () => {
    const visitor = await findOrCreateVisitor(shop1.id, TOKEN_A);
    const photo = await makePhoto(visitor!.id);
    const params = {
      shopId: shop1.id,
      visitorId: visitor!.id,
      visitorPhotoId: photo.id,
      product,
    };
    const first = await createTryOnJob(params);
    expect(first.ok).toBe(true);

    // Duplicate protection: identical active request returns the same job.
    const dup = await createTryOnJob(params);
    expect(dup.ok && dup.existing).toBe(true);
    if (first.ok && dup.ok) expect(dup.jobId).toBe(first.jobId);

    // The background runner should fail this job fast (unreachable image),
    // exercising queued -> processing -> failed.
    if (first.ok) {
      let job = await prisma.tryOn.findUnique({ where: { id: first.jobId } });
      for (let i = 0; i < 50 && job?.status !== "failed"; i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = await prisma.tryOn.findUnique({ where: { id: first.jobId } });
      }
      expect(job?.status).toBe("failed");
      expect(job?.completedAt).not.toBeNull();
      expect(job?.errorCode).toBeTruthy();
    }
  });

  it("enforces the per-visitor daily limit", async () => {
    const limited = await makeShop("limited.myshopify.com", 1);
    const visitor = await findOrCreateVisitor(limited.id, TOKEN_A);
    const photo = await makePhoto(visitor!.id);
    const params = {
      shopId: limited.id,
      visitorId: visitor!.id,
      visitorPhotoId: photo.id,
      product,
    };
    const first = await createTryOnJob(params);
    expect(first.ok).toBe(true);
    // Wait for the first job to leave the active state so dedupe doesn't kick in.
    if (first.ok) {
      let job = await prisma.tryOn.findUnique({ where: { id: first.jobId } });
      for (let i = 0; i < 50 && job?.status !== "failed"; i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = await prisma.tryOn.findUnique({ where: { id: first.jobId } });
      }
    }
    const second = await createTryOnJob({
      ...params,
      product: { ...product, productId: "222" },
    });
    expect(second).toEqual({ ok: false, error: "visitor_limit" });
  });
});

describe.skipIf(!HAS_DB)("privacy deletion", () => {
  it("removes a visitor's photos and try-ons", async () => {
    const visitor = await findOrCreateVisitor(shop2.id, TOKEN_B);
    await makePhoto(visitor!.id);
    const before = await prisma.visitorPhoto.count({ where: { visitorId: visitor!.id } });
    expect(before).toBeGreaterThan(0);

    const result = await deleteVisitorData(shop2.id, TOKEN_B);
    expect(result.deleted).toBeGreaterThan(0);
    expect(await findVisitor(shop2.id, TOKEN_B)).toBeNull();
    expect(await prisma.visitorPhoto.count({ where: { visitorId: visitor!.id } })).toBe(0);
  });

  it("does not touch other shops' data", async () => {
    const other = await findVisitor(shop1.id, TOKEN_A);
    expect(other).not.toBeNull();
  });
});
