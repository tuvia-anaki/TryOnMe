import { describe, expect, it } from "vitest";
import { isProductAvailable } from "../app/lib/shop.server";
import { isNumericId, isShopifyCdnUrl } from "../app/lib/products.server";
import { isValidVisitorToken } from "../app/lib/visitor.server";

describe("product availability modes", () => {
  const base = { productAvailabilityMode: "all", productSelectionJson: "[]" };

  it("all: every product is available", () => {
    expect(isProductAvailable(base, "123")).toBe(true);
  });

  it("include: only selected products", () => {
    const s = { productAvailabilityMode: "include", productSelectionJson: '["123","456"]' };
    expect(isProductAvailable(s, "123")).toBe(true);
    expect(isProductAvailable(s, "789")).toBe(false);
  });

  it("exclude: everything except selected", () => {
    const s = { productAvailabilityMode: "exclude", productSelectionJson: '["123"]' };
    expect(isProductAvailable(s, "123")).toBe(false);
    expect(isProductAvailable(s, "789")).toBe(true);
  });

  it("survives corrupted selection JSON", () => {
    const s = { productAvailabilityMode: "include", productSelectionJson: "{broken" };
    expect(isProductAvailable(s, "123")).toBe(false);
  });
});

describe("input validation", () => {
  it("accepts only numeric Shopify ids", () => {
    expect(isNumericId("8123456789")).toBe(true);
    expect(isNumericId("gid://shopify/Product/1")).toBe(false);
    expect(isNumericId("1; DROP TABLE")).toBe(false);
    expect(isNumericId("")).toBe(false);
  });

  it("only fetches product images from Shopify CDN hosts", () => {
    expect(isShopifyCdnUrl("https://cdn.shopify.com/s/files/1/img.jpg")).toBe(true);
    expect(isShopifyCdnUrl("https://evil.example.com/img.jpg")).toBe(false);
    expect(isShopifyCdnUrl("http://cdn.shopify.com/img.jpg")).toBe(false);
    expect(isShopifyCdnUrl("not a url")).toBe(false);
  });

  it("validates visitor tokens", () => {
    expect(isValidVisitorToken("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidVisitorToken("short")).toBe(false);
    expect(isValidVisitorToken("has spaces in it which are not allowed!")).toBe(false);
    expect(isValidVisitorToken(123 as unknown as string)).toBe(false);
  });
});
