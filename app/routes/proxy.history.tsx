import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import {
  handleProxyError,
  jsonResponse,
  requireProxyShop,
} from "../lib/proxy.server";
import { LIMITS } from "../lib/rate-limit.server";
import { findVisitor } from "../lib/visitor.server";
import { storage } from "../lib/storage.server";

/**
 * POST /apps/tryon/history  { visitor_token }
 * The visitor's previous try-ons on this shop (this browser only), plus
 * their most recent photo so it can be reused for another product.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop } = await requireProxyShop(request, {
      rate: LIMITS.readPerIp,
      scope: "history",
    });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.visitor_token;
    if (typeof token !== "string") return jsonResponse({ message: "Invalid request." }, 400);

    const visitor = await findVisitor(shop.id, token);
    if (!visitor) return jsonResponse({ items: [], latestPhoto: null });

    const [tryOns, latestPhoto] = await Promise.all([
      prisma.tryOn.findMany({
        where: { shopId: shop.id, visitorId: visitor.id, status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.visitorPhoto.findFirst({
        where: { visitorId: visitor.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const items = await Promise.all(
      tryOns
        .filter((t) => t.generatedImageStorageKey)
        .map(async (t) => ({
          id: t.id,
          productId: t.productId,
          productTitle: t.productTitle,
          productImageUrl: t.productImageUrl,
          createdAt: t.createdAt.toISOString(),
          resultUrl: await storage().signedUrl(t.generatedImageStorageKey!),
        })),
    );

    return jsonResponse({
      items,
      latestPhoto: latestPhoto
        ? {
            id: latestPhoto.id,
            url: await storage().signedUrl(latestPhoto.storageKey),
          }
        : null,
    });
  } catch (error) {
    return handleProxyError(error);
  }
};
