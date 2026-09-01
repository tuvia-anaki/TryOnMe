import type { ActionFunctionArgs } from "@remix-run/node";
import {
  handleProxyError,
  jsonResponse,
  requireProxyShop,
} from "../lib/proxy.server";
import { LIMITS } from "../lib/rate-limit.server";
import { deleteVisitorData } from "../lib/visitor.server";

/**
 * POST /apps/tryon/visitor/delete  { visitor_token }
 * Shopper-initiated privacy action: removes their photos, try-ons and
 * stored assets for this shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop } = await requireProxyShop(request, {
      rate: LIMITS.readPerIp,
      scope: "delete",
    });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.visitor_token;
    if (typeof token !== "string") return jsonResponse({ message: "Invalid request." }, 400);

    const result = await deleteVisitorData(shop.id, token);
    return jsonResponse({ ok: true, deleted: result.deleted });
  } catch (error) {
    return handleProxyError(error);
  }
};
