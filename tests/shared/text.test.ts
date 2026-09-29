import { describe, expect, it } from "vitest";
import { containsPhrase, domImageKeys, fileNameFromUrl, firstSrcsetUrl, mediaFileKey, normalizeText } from "../../src/shared/text";

describe("normalizeText", () => {
  it("lowercases, strips accents and separators", () => {
    expect(normalizeText("Crème_Brûlée--Light #2")).toBe("creme brulee light 2");
    expect(normalizeText("  #color_Red  ")).toBe("color red");
    expect(normalizeText(null)).toBe("");
  });
  it("keeps non-latin letters", () => {
    expect(normalizeText("カラー")).toBe("カラー");
    expect(normalizeText("צבע")).toBe("צבע");
  });
});

describe("containsPhrase", () => {
  it("matches whole-word sequences only", () => {
    expect(containsPhrase("shirt light blue front", "light blue")).toBe(true);
    expect(containsPhrase("blueberry shirt", "blue")).toBe(false);
    expect(containsPhrase("red", "red")).toBe(true);
  });
});

describe("image URL keys", () => {
  it("extracts file names from modern and legacy Shopify CDN URLs", () => {
    expect(fileNameFromUrl("//shop.com/cdn/shop/files/Red-Shirt.jpg?v=1700&width=800")).toBe("Red-Shirt.jpg");
    expect(mediaFileKey("https://cdn.shopify.com/s/files/1/0012/files/Red-Shirt.jpg?v=1")).toBe("red-shirt");
    expect(mediaFileKey("files/My%20Photo.png")).toBe("my photo");
  });

  it("offers a size-stripped candidate for legacy resized URLs", () => {
    expect(domImageKeys("//cdn.shopify.com/s/files/1/products/red-shirt_800x.jpg?v=1")).toEqual(["red-shirt_800x", "red-shirt"]);
    expect(domImageKeys("//cdn.shopify.com/s/files/1/products/red-shirt_800x800_crop_center@2x.progressive.jpg")).toEqual([
      "red-shirt_800x800_crop_center@2x",
      "red-shirt",
    ]);
    expect(domImageKeys("//cdn.shopify.com/s/files/1/products/red-shirt_{width}x.jpg")).toEqual(["red-shirt_{width}x", "red-shirt"]);
    expect(domImageKeys("//cdn.shopify.com/s/files/1/products/red-shirt_grande.jpg")).toEqual(["red-shirt_grande", "red-shirt"]);
    expect(domImageKeys("//shop.com/cdn/shop/files/red-shirt.jpg?width=400")).toEqual(["red-shirt"]);
    expect(domImageKeys("")).toEqual([]);
  });

  it("reads the first srcset candidate", () => {
    expect(firstSrcsetUrl("//a.com/x.jpg?width=100 100w, //a.com/x.jpg?width=200 200w")).toBe("//a.com/x.jpg?width=100");
  });
});
