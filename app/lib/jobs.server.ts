import prisma from "../db.server";
import { decryptSecret } from "./crypto.server";
import { getProvider } from "./ai/index.server";
import { ProviderError } from "./ai/types";
import { estimatedCost, getModel, isModelSelectable } from "./ai/registry";
import { buildTryOnPrompt } from "./ai/prompt";
import { newStorageKey, storage } from "./storage.server";
import { isShopifyCdnUrl, type ValidatedProduct } from "./products.server";

/**
 * Asynchronous try-on generation jobs.
 *
 * `createTryOnJob` enforces limits, creates a queued TryOn record and starts
 * processing in the background (fire-and-forget in-process runner — fine for
 * the MVP; swap for a queue like BullMQ at scale). The storefront polls the
 * job status endpoint for the result.
 */

export type CreateJobResult =
  | { ok: true; jobId: string; existing: boolean }
  | { ok: false; error: "visitor_limit" | "shop_limit" | "not_configured" | "model_unsupported" };

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function createTryOnJob(params: {
  shopId: string;
  visitorId: string;
  visitorPhotoId: string;
  product: ValidatedProduct;
}): Promise<CreateJobResult> {
  const { shopId, visitorId, visitorPhotoId, product } = params;

  const [settings, credentialCount] = await Promise.all([
    prisma.shopSettings.findUnique({ where: { shopId } }),
    prisma.aIProviderCredential.count({ where: { shopId } }),
  ]);
  if (!settings?.provider || !settings.model || credentialCount === 0) {
    return { ok: false, error: "not_configured" };
  }
  if (!isModelSelectable(settings.provider as any, settings.model)) {
    return { ok: false, error: "model_unsupported" };
  }

  // Duplicate request protection: reuse an active identical job.
  const active = await prisma.tryOn.findFirst({
    where: {
      shopId,
      visitorId,
      visitorPhotoId,
      productId: product.productId,
      variantId: product.variantId,
      status: { in: ["queued", "processing"] },
    },
  });
  if (active) return { ok: true, jobId: active.id, existing: true };

  const today = startOfToday();
  const [visitorCountToday, shopCountToday] = await Promise.all([
    prisma.tryOn.count({ where: { visitorId, createdAt: { gte: today } } }),
    prisma.tryOn.count({ where: { shopId, createdAt: { gte: today } } }),
  ]);
  if (settings.visitorDailyLimit > 0 && visitorCountToday >= settings.visitorDailyLimit) {
    return { ok: false, error: "visitor_limit" };
  }
  if (settings.shopDailyLimit > 0 && shopCountToday >= settings.shopDailyLimit) {
    return { ok: false, error: "shop_limit" };
  }

  const cost = estimatedCost(settings.provider as any, settings.model, settings.quality);
  const tryOn = await prisma.tryOn.create({
    data: {
      shopId,
      visitorId,
      visitorPhotoId,
      productId: product.productId,
      variantId: product.variantId,
      productTitle: product.title,
      productImageUrl: product.imageUrl,
      productImageUrlsJson: JSON.stringify(product.imageUrls ?? [product.imageUrl]),
      provider: settings.provider,
      model: settings.model,
      quality: settings.quality,
      status: "queued",
      estimatedCost: cost,
    },
  });

  // Fire and forget — errors are recorded on the job itself.
  void runTryOnJob(tryOn.id, {
    productType: product.productType,
    vendor: product.vendor,
    variantTitle: product.variantTitle,
    description: product.description,
  }).catch((error) => {
    console.error(`Try-on job ${tryOn.id} crashed:`, error?.message ?? error);
  });

  return { ok: true, jobId: tryOn.id, existing: false };
}

const JOB_TIMEOUT_MS = 3 * 60_000;
/** A job older than this can only be a casualty of a restart/crash. */
const STALE_JOB_MS = 10 * 60_000;
const STALE_SWEEP_INTERVAL_MS = 60_000;

let lastStaleSweep = 0;

/**
 * Generation runs in-process, so a deploy or crash mid-generation would leave
 * a job stuck in "queued"/"processing" forever and the shopper's modal would
 * spin. Fail those out so the UI shows a real error and they can retry.
 * Cheap enough to call opportunistically from the polling endpoint.
 */
export async function recoverStuckJobs(): Promise<void> {
  const now = Date.now();
  if (now - lastStaleSweep < STALE_SWEEP_INTERVAL_MS) return;
  lastStaleSweep = now;
  try {
    await prisma.tryOn.updateMany({
      where: {
        status: { in: ["queued", "processing"] },
        createdAt: { lt: new Date(now - STALE_JOB_MS) },
      },
      data: {
        status: "failed",
        errorCode: "internal",
        errorMessage: "Generation was interrupted before it finished.",
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Stuck-job sweep failed:", (error as Error)?.message);
  }
}

async function fetchProductImage(url: string): Promise<{ data: Buffer; contentType: string }> {
  if (!isShopifyCdnUrl(url)) throw new Error("Refusing to fetch non-Shopify product image URL.");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch product image (${res.status}).`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { data: Buffer.from(await res.arrayBuffer()), contentType };
}

export async function runTryOnJob(
  tryOnId: string,
  productInfo: {
    productType: string;
    vendor: string;
    variantTitle: string | null;
    description: string;
  },
): Promise<void> {
  const claimed = await prisma.tryOn.updateMany({
    where: { id: tryOnId, status: "queued" },
    data: { status: "processing" },
  });
  if (claimed.count === 0) return; // already claimed or not queued

  const fail = async (code: string, message: string) => {
    await prisma.tryOn.update({
      where: { id: tryOnId },
      data: {
        status: "failed",
        errorCode: code,
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
      },
    });
  };

  try {
    const tryOn = await prisma.tryOn.findUniqueOrThrow({
      where: { id: tryOnId },
      include: { photo: true },
    });

    const credential = await prisma.aIProviderCredential.findUnique({
      where: { shopId_provider: { shopId: tryOn.shopId, provider: tryOn.provider } },
    });
    if (!credential) return fail("invalid_key", "No credential stored for provider.");

    const provider = getProvider(tryOn.provider);
    if (!provider?.implemented) return fail("provider_error", "Provider not implemented.");

    const apiKey = decryptSecret(credential.encryptedApiKey);
    // Every stored view of the product, so the model can see the design from
    // more than one angle. Falls back to the primary image for older jobs.
    let productImageUrls: string[] = [];
    try {
      const parsed = JSON.parse(tryOn.productImageUrlsJson || "[]");
      if (Array.isArray(parsed)) productImageUrls = parsed.filter((u) => typeof u === "string");
    } catch {
      productImageUrls = [];
    }
    if (productImageUrls.length === 0) productImageUrls = [tryOn.productImageUrl];

    const [personImage, ...productImages] = await Promise.all([
      storage()
        .get(tryOn.photo.storageKey)
        .then((data) => ({ data, contentType: "image/jpeg" })),
      ...productImageUrls.map((url) => fetchProductImage(url)),
    ]);

    const prompt = buildTryOnPrompt({
      title: tryOn.productTitle,
      productType: productInfo.productType,
      vendor: productInfo.vendor,
      variantTitle: productInfo.variantTitle ?? undefined,
      description: productInfo.description,
      referenceImageCount: productImages.length,
    });

    const result = await Promise.race([
      provider.generateTryOn({
        apiKey,
        modelId: getModel(tryOn.provider as any, tryOn.model)?.apiModelId ?? tryOn.model,
        quality: tryOn.quality,
        personImage,
        productImages,
        prompt,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ProviderError("provider_error", "Generation timed out.")), JOB_TIMEOUT_MS),
      ),
    ]);

    const resultKey = newStorageKey(tryOn.shopId, "result");
    await storage().put(resultKey, result.imageData, result.contentType);

    await prisma.tryOn.update({
      where: { id: tryOnId },
      data: {
        status: "completed",
        generatedImageStorageKey: resultKey,
        completedAt: new Date(),
      },
    });

    await prisma.usageEvent.create({
      data: {
        shopId: tryOn.shopId,
        visitorId: tryOn.visitorId,
        tryOnId: tryOn.id,
        provider: tryOn.provider,
        model: tryOn.model,
        estimatedCost: tryOn.estimatedCost,
      },
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      await fail(error.code, error.message);
    } else {
      console.error(`Try-on job ${tryOnId} failed:`, (error as Error)?.message);
      await fail("internal", (error as Error)?.message ?? "Unknown error");
    }
  }
}

/** Shopper-safe error messages, keyed by errorCode. */
export function shopperErrorMessage(errorCode: string | null): string {
  switch (errorCode) {
    case "invalid_key":
    case "quota":
      return "Virtual try-on is temporarily unavailable.";
    case "content_rejected":
      return "We couldn't use this photo. Please try another one.";
    default:
      return "We couldn't create this try-on. Please try again.";
  }
}
