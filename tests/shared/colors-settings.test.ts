import { describe, expect, it } from "vitest";
import { colorsForName, hexToRgb, isVeryLight, parseCssColor, rgbToLab } from "../../src/shared/colors";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../../src/shared/settings";

describe("colorsForName", () => {
  it("knows CSS and apparel color names", () => {
    expect(colorsForName("Black")).toEqual(["#000000"]);
    expect(colorsForName("Navy")).toEqual(["#1f2a44"]);
    expect(colorsForName("Heather Grey")).toEqual(["#a8a8a8"]);
    expect(colorsForName("Off-White")).toEqual(["#f4f1e8"]);
    expect(colorsForName("Schwarz")).toEqual(["#000000"]);
  });

  it("handles modifiers, suffixes and multi-color values", () => {
    expect(colorsForName("Light Pink")?.[0]).toMatch(/^#/);
    expect(colorsForName("Vintage Washed Navy")).toEqual(["#1f2a44"]);
    expect(colorsForName("Black/White")).toEqual(["#000000", "#ffffff"]);
    expect(colorsForName("Navy & Red")).toEqual(["#1f2a44", "#d0312d"]);
    expect(colorsForName("Black-White")).toEqual(["#000000", "#ffffff"]);
    expect(colorsForName("Multicolor")).toEqual(["gradient"]);
  });

  it("returns null for unknown names", () => {
    expect(colorsForName("Galaxy Explorer")).toBeNull();
    expect(colorsForName("")).toBeNull();
  });
});

describe("color math", () => {
  it("parses CSS colors", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(parseCssColor("rgb(51 79 180)")).toEqual([51, 79, 180]);
    expect(parseCssColor("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3]);
    expect(parseCssColor("nope")).toBeNull();
  });
  it("converts to Lab", () => {
    const [l] = rgbToLab([255, 255, 255]);
    expect(l).toBeCloseTo(100, 0);
    expect(isVeryLight("#fdfdfd")).toBe(true);
    expect(isVeryLight("#1f2a44")).toBe(false);
  });
});

describe("sanitizeSettings", () => {
  it("returns defaults for garbage", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("{bad json")).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial settings and clamps values", () => {
    const s = sanitizeSettings({
      gallery: { hideUnassigned: true, noSelection: "weird" },
      swatches: { size: 999, shape: "circle", borderColor: "red; background:url(x)", colorMap: { Navy: "#000080", bad: "url(x)" } },
      cards: { max: 0 },
    });
    expect(s.gallery.hideUnassigned).toBe(true);
    expect(s.gallery.noSelection).toBe("first");
    expect(s.swatches.size).toBe(120);
    expect(s.swatches.borderColor).toBe(DEFAULT_SETTINGS.swatches.borderColor);
    expect(s.swatches.colorMap).toEqual({ navy: "#000080" });
    expect(s.cards.max).toBe(1);
  });

  it("keeps the setup guide's 'images assigned' flag (off by default)", () => {
    expect(sanitizeSettings(null).admin.assigned).toBe(false);
    expect(sanitizeSettings({ admin: { assigned: true } }).admin.assigned).toBe(true);
    expect(sanitizeSettings({ admin: { assigned: "yes" } }).admin.assigned).toBe(false);
  });

  it("accepts split colors and https image URLs only", () => {
    const s = sanitizeSettings({
      swatches: {
        colorMap: { "black white": "#000/#fff" },
        imageMap: { leopard: "https://cdn.shopify.com/x.png", bad: "javascript:alert(1)" },
      },
    });
    expect(s.swatches.colorMap).toEqual({ "black white": "#000/#fff" });
    expect(s.swatches.imageMap).toEqual({ leopard: "https://cdn.shopify.com/x.png" });
  });
});
