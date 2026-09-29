/**
 * Cloudflare Worker (free plan) for the admin app:
 * - serves the static admin build from `dist/` (Workers static assets),
 * - adds the frame-ancestors security header to HTML documents,
 * - verifies and acknowledges Shopify webhooks.
 * Storefront traffic never reaches this worker.
 */
import { handleWebhook, withDocumentHeaders, type WebhookEnv } from "./webhooks";

interface Env extends WebhookEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/webhooks")) return handleWebhook(request, env);
    if (url.pathname === "/healthz") return new Response("ok");
    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get("content-type") ?? "";
    return type.includes("text/html") ? withDocumentHeaders(response, url) : response;
  },
};
