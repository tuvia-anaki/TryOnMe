/**
 * Shopify webhook handling with Web Crypto only, so the same code runs on
 * Cloudflare Workers, Deno, Bun, Node 20+ and in the Vite dev server.
 *
 * The app stores no customer data (variant image setups live in the
 * merchant's own store as product metafields), so the mandatory compliance
 * webhooks only need to be verified and acknowledged.
 */

const encoder = new TextEncoder();

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacBase64(secret: string, body: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(await crypto.subtle.sign("HMAC", key, body));
}

export async function verifyWebhook(secret: string, body: ArrayBuffer, header: string | null): Promise<boolean> {
  if (!secret || !header) return false;
  const expected = await hmacBase64(secret, body);
  return safeEqual(expected, header.trim());
}

const COMPLIANCE_TOPICS = new Set(["customers/data_request", "customers/redact", "shop/redact"]);

export interface WebhookEnv {
  SHOPIFY_API_SECRET?: string;
}

/** Handles POST /webhooks/* — 401 on a bad signature (Shopify's review checks this), 200 otherwise. */
export async function handleWebhook(request: Request, env: WebhookEnv): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const body = await request.arrayBuffer();
  const valid = await verifyWebhook(env.SHOPIFY_API_SECRET ?? "", body, request.headers.get("x-shopify-hmac-sha256"));
  if (!valid) return new Response("Unauthorized", { status: 401 });
  const topic = request.headers.get("x-shopify-topic") ?? "";
  // Nothing is stored about customers or shops, so there is nothing to export or erase.
  const known = COMPLIANCE_TOPICS.has(topic) || topic === "app/uninstalled" || topic === "app/scopes_update";
  return new Response(known ? "OK" : "Ignored", { status: 200 });
}

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/** Embedded apps must only be framable by the merchant's admin. */
export function frameAncestors(url: URL): string {
  const shop = url.searchParams.get("shop");
  const sources = ["https://admin.shopify.com"];
  if (shop && SHOP_RE.test(shop)) sources.unshift(`https://${shop}`);
  else sources.push("https://*.myshopify.com");
  return `frame-ancestors ${sources.join(" ")};`;
}

export function withDocumentHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", frameAncestors(url));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Cache-Control", "no-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
