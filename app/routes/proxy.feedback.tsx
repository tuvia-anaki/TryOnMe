import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import {
  handleProxyError,
  jsonResponse,
  requireProxyShop,
} from "../lib/proxy.server";
import { LIMITS } from "../lib/rate-limit.server";
import { findVisitor } from "../lib/visitor.server";

/**
 * POST /apps/tryon/feedback  { visitor_token, try_on_id, rating }
 * Stores 👍/👎 on a try-on the visitor owns. Upserts so repeat clicks
 * just update the rating.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop } = await requireProxyShop(request, {
      rate: LIMITS.readPerIp,
      scope: "feedback",
    });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.visitor_token;
    const tryOnId = body?.try_on_id;
    const rating = body?.rating;
    if (
      typeof token !== "string" ||
      typeof tryOnId !== "string" ||
      (rating !== "up" && rating !== "down")
    ) {
      return jsonResponse({ message: "Invalid request." }, 400);
    }

    const visitor = await findVisitor(shop.id, token);
    if (!visitor) return jsonResponse({ message: "Not found." }, 404);

    const tryOn = await prisma.tryOn.findFirst({
      where: { id: tryOnId, shopId: shop.id, visitorId: visitor.id },
    });
    if (!tryOn) return jsonResponse({ message: "Not found." }, 404);

    await prisma.tryOnFeedback.upsert({
      where: { tryOnId: tryOn.id },
      create: { tryOnId: tryOn.id, rating },
      update: { rating },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleProxyError(error);
  }
};
