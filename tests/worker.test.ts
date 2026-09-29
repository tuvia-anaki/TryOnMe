import { describe, expect, it } from "vitest";
import { frameAncestors, handleWebhook, hmacBase64 } from "../src/worker/webhooks";

const SECRET = "shpss_test_secret";

async function signed(body: string, topic = "customers/redact", secret = SECRET) {
  const bytes = new TextEncoder().encode(body);
  const hmac = await hmacBase64(secret, bytes.buffer as ArrayBuffer);
  return new Request("https://app.example/webhooks/compliance", {
    method: "POST",
    headers: { "x-shopify-hmac-sha256": hmac, "x-shopify-topic": topic, "content-type": "application/json" },
    body: bytes,
  });
}

describe("webhooks", () => {
  it("accepts correctly signed compliance webhooks", async () => {
    for (const topic of ["customers/data_request", "customers/redact", "shop/redact"]) {
      const res = await handleWebhook(await signed('{"shop_domain":"x.myshopify.com"}', topic), { SHOPIFY_API_SECRET: SECRET });
      expect(res.status).toBe(200);
    }
  });

  it("rejects bad or missing signatures with 401", async () => {
    const forged = await signed("{}", "shop/redact", "wrong-secret");
    expect((await handleWebhook(forged, { SHOPIFY_API_SECRET: SECRET })).status).toBe(401);
    const unsigned = new Request("https://app.example/webhooks/compliance", { method: "POST", body: "{}" });
    expect((await handleWebhook(unsigned, { SHOPIFY_API_SECRET: SECRET })).status).toBe(401);
    // No secret configured: never accept.
    expect((await handleWebhook(await signed("{}"), {})).status).toBe(401);
  });

  it("rejects a tampered body", async () => {
    const req = await signed('{"a":1}');
    const tampered = new Request(req.url, { method: "POST", headers: req.headers, body: '{"a":2}' });
    expect((await handleWebhook(tampered, { SHOPIFY_API_SECRET: SECRET })).status).toBe(401);
  });

  it("only allows POST", async () => {
    expect((await handleWebhook(new Request("https://app.example/webhooks/x"), { SHOPIFY_API_SECRET: SECRET })).status).toBe(405);
  });
});

describe("frame-ancestors", () => {
  it("allows the shop and the admin only", () => {
    expect(frameAncestors(new URL("https://app.example/?shop=demo.myshopify.com"))).toBe(
      "frame-ancestors https://demo.myshopify.com https://admin.shopify.com;",
    );
    expect(frameAncestors(new URL("https://app.example/?shop=evil.com"))).toBe(
      "frame-ancestors https://admin.shopify.com https://*.myshopify.com;",
    );
  });
});
