import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkRateLimit, clientIp } from "./rate-limit.server";

/**
 * Shared plumbing for app-proxy (public storefront) routes.
 * Every request arrives via https://{shop}/apps/tryon/* and is
 * signature-verified by Shopify; we additionally scope everything to the
 * Shop row and rate-limit by IP.
 */

export class ProxyResponseError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(`proxy_error_${status}`);
    this.status = status;
    this.body = body;
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function requireProxyShop(
  request: Request,
  options?: { rate?: { limit: number; windowMs: number }; scope?: string },
) {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session?.shop) {
    throw new ProxyResponseError(401, { message: "Unauthorized" });
  }

  if (options?.rate) {
    const ip = clientIp(request);
    const key = `${options.scope ?? "api"}:ip:${ip}`;
    const result = checkRateLimit(key, options.rate.limit, options.rate.windowMs);
    if (!result.allowed) {
      throw new ProxyResponseError(429, {
        error: "rate_limited",
        message: "Too many requests. Please slow down.",
      });
    }
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { settings: true, widgetSettings: true, credentials: true },
  });
  if (!shop || !shop.installed) {
    throw new ProxyResponseError(404, { message: "Not available" });
  }

  return { shop, admin, shopDomain: session.shop };
}

export function handleProxyError(error: unknown): Response {
  if (error instanceof ProxyResponseError) {
    return jsonResponse(error.body, error.status);
  }
  if (error instanceof Response) return error;
  console.error("Proxy route error:", (error as Error)?.message);
  return jsonResponse({ message: "Something went wrong." }, 500);
}
