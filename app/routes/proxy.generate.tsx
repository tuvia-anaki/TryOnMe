import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import {
  handleProxyError,
  jsonResponse,
  requireProxyShop,
} from "../lib/proxy.server";
import { LIMITS } from "../lib/rate-limit.server";
import { findOrCreateVisitor } from "../lib/visitor.server";
import { validateProduct } from "../lib/products.server";
import { isProductAvailable } from "../lib/shop.server";
import { createTryOnJob } from "../lib/jobs.server";

/**
 * POST /apps/tryon/generate  { visitor_token, photo_id, product_id, variant_id }
 * Creates an async try-on job. Everything is validated server-side:
 * the photo must belong to this visitor, the product must belong to this
 * shop, and all limits are enforced before any AI spend happens.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, admin } = await requireProxyShop(request, {
      rate: LIMITS.generatePerIp,
      scope: "generate",
    });
    if (!admin) return jsonResponse({ message: "Not available" }, 404);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonResponse({ message: "Invalid request." }, 400);

    const token = body.visitor_token;
    const photoId = body.photo_id;
    const productId = body.product_id;
    const variantId = body.variant_id ?? null;
    if (
      typeof token !== "string" ||
      typeof photoId !== "string" ||
      typeof productId !== "string" ||
      (variantId !== null && typeof variantId !== "string")
    ) {
      return jsonResponse({ message: "Invalid request." }, 400);
    }

    const visitor = await findOrCreateVisitor(shop.id, token);
    if (!visitor) return jsonResponse({ message: "Invalid request." }, 400);

    // Photo ownership: the photo must belong to this visitor in this shop.
    const photo = await prisma.visitorPhoto.findFirst({
      where: { id: photoId, visitorId: visitor.id, visitor: { shopId: shop.id } },
    });
    if (!photo) return jsonResponse({ message: "Photo not found." }, 404);

    if (shop.settings && !isProductAvailable(shop.settings, productId)) {
      return jsonResponse({ message: "Try-on isn't available for this product." }, 403);
    }

    const product = await validateProduct(admin, productId, variantId);
    if (!product) {
      return jsonResponse({ message: "Product not found." }, 404);
    }

    const result = await createTryOnJob({
      shopId: shop.id,
      visitorId: visitor.id,
      visitorPhotoId: photo.id,
      product,
    });

    if (!result.ok) {
      switch (result.error) {
        case "visitor_limit":
          return jsonResponse(
            { error: "visitor_limit", message: "You've reached today's try-on limit." },
            429,
          );
        case "shop_limit":
          return jsonResponse(
            { error: "shop_limit", message: "Virtual try-on is temporarily unavailable." },
            429,
          );
        default:
          return jsonResponse(
            { message: "Virtual try-on is temporarily unavailable." },
            503,
          );
      }
    }

    return jsonResponse({ jobId: result.jobId });
  } catch (error) {
    return handleProxyError(error);
  }
};
