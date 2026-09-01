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
 * POST /apps/tryon/event  { visitor_token?, product_id, type }
 * Lightweight funnel events ("view" | "add_to_cart") powering conversion
 * analytics. `triedOn` is resolved server-side from the visitor's history so
 * the storefront can't spoof it.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop } = await requireProxyShop(request, {
      rate: LIMITS.readPerIp,
      scope: "event",
    });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const token = typeof body?.visitor_token === "string" ? body.visitor_token : null;
    const productId = body?.product_id;
    const type = body?.type;
    if (
      typeof productId !== "string" ||
      !/^\d{1,20}$/.test(productId) ||
      (type !== "view" && type !== "add_to_cart")
    ) {
      return jsonResponse({ message: "Invalid request." }, 400);
    }

    const visitor = token ? await findVisitor(shop.id, token) : null;
    const triedOn = visitor
      ? (await prisma.tryOn.count({
          where: { shopId: shop.id, visitorId: visitor.id, productId },
        })) > 0
      : false;

    await prisma.analyticsEvent.create({
      data: {
        shopId: shop.id,
        visitorId: visitor?.id ?? null,
        productId,
        type,
        triedOn,
      },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleProxyError(error);
  }
};
