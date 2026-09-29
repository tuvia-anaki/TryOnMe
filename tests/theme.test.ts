import { describe, expect, it } from "vitest";
import { conflictsFromProductTemplate, embedStateFromSettings, themeEditorUrl } from "../src/admin/api/theme";

const EMBED = "shopify://apps/prism/blocks/variant-images-embed/0123-abcd";

describe("theme status", () => {
  it("reads the app embed state from settings_data.json", () => {
    expect(embedStateFromSettings(JSON.stringify({ current: { blocks: { a: { type: EMBED, disabled: false } } } }))).toBe("enabled");
    expect(embedStateFromSettings(JSON.stringify({ current: { blocks: { a: { type: EMBED, disabled: true } } } }))).toBe("disabled");
    expect(embedStateFromSettings(JSON.stringify({ current: { blocks: { a: { type: "shopify://apps/x/blocks/y/1" } } } }))).toBe("missing");
    expect(embedStateFromSettings("/* banner */" + JSON.stringify({ current: { blocks: { a: { type: EMBED } } } }))).toBe("enabled");
    expect(embedStateFromSettings(JSON.stringify({ current: "Default" }))).toBe("missing");
    expect(embedStateFromSettings("{broken")).toBe("missing");
  });

  it("detects themes that already filter media by variant", () => {
    const dawn = JSON.stringify({ sections: { main: { type: "main-product", settings: { hide_variants: true } } } });
    expect(conflictsFromProductTemplate(dawn)).toEqual([{ id: "hide-variant-media", section: "main-product" }]);
    const block = JSON.stringify({ sections: { main: { type: "product-information", blocks: { m: { settings: { enable_media_grouping: true } } } } } });
    expect(conflictsFromProductTemplate(block)).toHaveLength(1);
    const off = JSON.stringify({ sections: { main: { type: "main-product", settings: { hide_variants: false, gallery_layout: "stacked" } } } });
    expect(conflictsFromProductTemplate(off)).toEqual([]);
  });

  it("builds the theme editor deep link that activates the embed", () => {
    expect(themeEditorUrl("demo.myshopify.com", "abc123")).toBe(
      "https://demo.myshopify.com/admin/themes/current/editor?context=apps&template=product&activateAppId=abc123%2Fvariant-images-embed",
    );
  });
});
