import { describe, expect, it } from "vitest";
import { testedThemeFor } from "../src/shared/themes";
import { appNameFromHandle, embedStateFromSettings, otherVariantAppsFromSettings } from "../src/admin/api/theme";

// Shopify names the app part after the app (here its earlier name), not the app handle.
const APP = "prism-variant-images";
const block = (app: string, handle: string, extra: Record<string, unknown> = {}) => ({ type: `shopify://apps/${app}/blocks/${handle}/01a0ec75-5a60-7969-b17c-4fc09d328c6f`, settings: {}, ...extra });

describe("theme status", () => {
  it("reads the app embed state from settings_data.json", () => {
    const data = (blocks: Record<string, unknown>) => `/* banner */ ${JSON.stringify({ current: { blocks } })}`;
    expect(embedStateFromSettings(data({ a: block(APP, "vc-app-embed") }))).toBe("enabled");
    expect(embedStateFromSettings(data({ a: block("variant-cards", "vc-app-embed") }))).toBe("enabled");
    expect(embedStateFromSettings(data({ a: block(APP, "vc-app-embed", { disabled: true }) }))).toBe("disabled");
    expect(embedStateFromSettings(data({}))).toBe("missing");
    // Other apps' embeds (often simply called "app-embed") don't count.
    expect(embedStateFromSettings(data({ a: block("other-app", "app-embed") }))).toBe("missing");
    expect(embedStateFromSettings("not json")).toBe("missing");
  });

  it("finds other variant apps that are on in the theme", () => {
    const data = JSON.stringify({
      current: {
        blocks: {
          a: block("variant-cards", "vc-app-embed"),
          b: block("variants-on-collection", "app-embed"),
          c: block("color-swatch-king", "swatches", { disabled: true }),
          d: block("prism-variant-images", "variant-images-embed"),
          e: block("reviews-app", "stars"),
        },
      },
    });
    // This app itself ("variant-cards") isn't another variant app.
    expect(otherVariantAppsFromSettings(data)).toEqual(["variants-on-collection"]);
    expect(otherVariantAppsFromSettings("not json")).toEqual([]);
    expect(appNameFromHandle("variants-on-collection")).toBe("Variants on collection");
    expect(appNameFromHandle("tryon-69")).toBe("Tryon");
  });

  it("recognizes tested themes, also renamed copies", () => {
    expect(testedThemeFor("Savor")).toBe("Savor");
    expect(testedThemeFor("Copy of Savor - Sept")).toBe("Savor");
    expect(testedThemeFor("Be Yours 8.5")).toBe("Be Yours");
    expect(testedThemeFor("Dawnlight custom")).toBeNull();
  });
});
