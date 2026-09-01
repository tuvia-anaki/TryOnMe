import { describe, expect, it } from "vitest";
import {
  detectBlockInProductTemplate,
  detectEmbedInSettings,
  themeEditorLinks,
} from "../app/lib/theme.server";

const EMBED_TYPE = "shopify://apps/virtual-try-on/blocks/tryon-embed/1234-abcd";
const BLOCK_TYPE = "shopify://apps/virtual-try-on/blocks/tryon-button/1234-abcd";

describe("app embed detection (settings_data.json)", () => {
  it("detects an enabled embed", () => {
    const json = JSON.stringify({
      current: { blocks: { abc: { type: EMBED_TYPE, disabled: false } } },
    });
    expect(detectEmbedInSettings(json)).toBe(true);
  });

  it("treats a disabled embed as not enabled", () => {
    const json = JSON.stringify({
      current: { blocks: { abc: { type: EMBED_TYPE, disabled: true } } },
    });
    expect(detectEmbedInSettings(json)).toBe(false);
  });

  it("handles preset-name current values and comment banners", () => {
    expect(detectEmbedInSettings(JSON.stringify({ current: "Default" }))).toBe(false);
    const withComment =
      "/* comment banner */" +
      JSON.stringify({ current: { blocks: { a: { type: EMBED_TYPE } } } });
    expect(detectEmbedInSettings(withComment)).toBe(true);
  });

  it("ignores other apps' embeds and invalid JSON", () => {
    const other = JSON.stringify({
      current: { blocks: { a: { type: "shopify://apps/other/blocks/widget/xyz" } } },
    });
    expect(detectEmbedInSettings(other)).toBe(false);
    expect(detectEmbedInSettings("{ not json")).toBe(false);
  });
});

describe("app block detection (product.json)", () => {
  it("detects our block inside any section", () => {
    const json = JSON.stringify({
      sections: {
        main: {
          type: "main-product",
          blocks: { b1: { type: "title" }, b2: { type: BLOCK_TYPE } },
        },
      },
    });
    expect(detectBlockInProductTemplate(json)).toBe(true);
  });

  it("returns false when absent", () => {
    const json = JSON.stringify({
      sections: { main: { type: "main-product", blocks: { b1: { type: "title" } } } },
    });
    expect(detectBlockInProductTemplate(json)).toBe(false);
  });
});

describe("theme editor deep links", () => {
  it("builds official activateAppId / addAppBlockId links", () => {
    process.env.SHOPIFY_API_KEY = "test-api-key";
    const links = themeEditorLinks("demo.myshopify.com");
    expect(links.enableEmbed).toBe(
      "https://demo.myshopify.com/admin/themes/current/editor?context=apps&template=product&activateAppId=test-api-key/tryon-embed",
    );
    expect(links.addBlock).toBe(
      "https://demo.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=test-api-key/tryon-button&target=mainSection",
    );
  });
});
