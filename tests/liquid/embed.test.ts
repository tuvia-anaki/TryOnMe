import { readFileSync } from "node:fs";
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";

/**
 * Renders the app embed with liquidjs and Shopify-like objects to check the
 * template logic: valid JSON payloads, which scripts load, and the pre-hide
 * CSS for the initial variant. (Shopify's Liquid may differ in details; this
 * guards our own logic.)
 */

const template = readFileSync("extensions/variant-images/blocks/variant-images-embed.liquid", "utf8").replace(
  /{%\s*schema\s*%}[\s\S]*?{%\s*endschema\s*%}/,
  "",
);
const locale = JSON.parse(readFileSync("extensions/variant-images/locales/en.default.json", "utf8"));

function engine() {
  const liquid = new Liquid();
  // Like Shopify's json filter: HTML-significant characters are unicode-escaped,
  // so JSON can sit inside <script> tags.
  liquid.registerFilter("json", (v: unknown) =>
    JSON.stringify(v ?? null)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026"),
  );
  liquid.registerFilter("image_url", (img: any, ...args: unknown[]) => {
    const src = typeof img === "string" ? img : img?.src ?? "";
    return `//shop.test/cdn/shop/${src}?width=${JSON.stringify(args)}`;
  });
  liquid.registerFilter("asset_url", (name: string) => `//cdn.test/extensions/assets/${name}`);
  liquid.registerFilter("t", (key: string) => key.split(".").reduce((o: any, k) => o?.[k], locale) ?? key);
  return liquid;
}

const RED = 501;
const BLUE = 502;
const S = 511;

function productDrop(config: unknown, selectedValueIds = [RED, S]) {
  const media = [301, 302, 303, 304, 305].map((id, i) => ({
    id,
    media_type: "image",
    preview_image: { src: `files/img-${i}.jpg` },
  }));
  return {
    id: 1,
    handle: "tee",
    url: "/products/tee",
    selected_variant: null,
    selected_or_first_available_variant: { id: 11 },
    metafields: { "$app:variant_images": { data: { value: config } } },
    options_with_values: [
      {
        name: "Color",
        position: 1,
        values: [
          { id: RED, name: "Red", selected: selectedValueIds.includes(RED), swatch: { color: { rgb: "255 0 0" } } },
          { id: BLUE, name: "Blue \"Navy\"", selected: selectedValueIds.includes(BLUE), swatch: null },
        ],
      },
      { name: "Size", position: 2, values: [{ id: S, name: "S", selected: true, swatch: null }] },
    ],
    variants: [
      { id: 11, available: true, option1: "Red", option2: "S", option3: null, featured_media: { id: 302 } },
      { id: 12, available: false, option1: 'Blue "Navy"', option2: "S", option3: null, featured_media: null },
    ],
    media,
    images: media.map((m, i) => ({ id: 700 + i, src: m.preview_image.src })),
  };
}

async function render(opts: { config?: unknown; settings?: unknown; template?: string; selected?: number[] } = {}) {
  const config = opts.config === undefined ? { v: 1, g: { [RED]: [302, 303], [BLUE]: [304] }, s: [301] } : opts.config;
  const html = await engine().parseAndRender(template, {
    template: { name: opts.template ?? "product" },
    product: opts.template && opts.template !== "product" ? null : productDrop(config, opts.selected),
    app: { metafields: { variant_images: { settings: { value: opts.settings ?? null } } } },
  });
  const json = (id: string) => {
    const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(html);
    return m ? JSON.parse(m[1]) : undefined;
  };
  return { html, json };
}

describe("app embed (Liquid)", () => {
  it("renders valid product JSON and loads the product script", async () => {
    const { html, json } = await render();
    const product = json("pvi-product");
    expect(product.id).toBe(1);
    expect(product.selected).toBeNull();
    expect(product.first).toBe(11);
    expect(product.config).toEqual({ v: 1, g: { [RED]: [302, 303], [BLUE]: [304] }, s: [301] });
    expect(product.options[0].values[0]).toMatchObject({ id: RED, name: "Red", color: "rgb(255 0 0)" });
    expect(product.options[0].values[1].name).toBe('Blue "Navy"');
    expect(product.variants).toEqual([
      [11, 1, "Red", "S", null, 302],
      [12, 0, 'Blue "Navy"', "S", null, null],
    ]);
    expect(product.media).toHaveLength(5);
    expect(product.images[0]).toEqual([700, "files/img-0.jpg"]);
    expect(json("pvi-settings")).toBeNull();
    expect(json("pvi-i18n")).toEqual({ soldOut: "Sold out", unavailable: "Unavailable" });
    expect(html).toContain("pvi-product.js");
    expect(html).not.toContain("pvi-swatches.js");
    expect(html).not.toContain("pvi-cards.js");
  });

  it("pre-hides other variants' media for the initial variant", async () => {
    const { html } = await render();
    const css = /<style id="pvi-prehide">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    // Red selected: 304 (Blue) is hidden; shared 301, Red 302/303 and unassigned 305 stay.
    expect(css).toContain('[data-media-id="304"]');
    for (const id of [301, 302, 303, 305]) expect(css).not.toContain(`"${id}"`);
  });

  it("hides unassigned media when the product says so", async () => {
    const { html } = await render({ config: { v: 1, g: { [RED]: [302, 303], [BLUE]: [304] }, s: [301], h: 1 } });
    const css = /<style id="pvi-prehide">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    expect(css).toContain('[data-media-id="305"]');
    expect(css).toContain('[data-media-id="304"]');
  });

  it("uses the selected variant's values", async () => {
    const { html } = await render({ selected: [BLUE, S] });
    const css = /<style id="pvi-prehide">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    expect(css).toContain('[data-media-id="302"]');
    expect(css).toContain('[data-media-id="303"]');
    expect(css).not.toContain('"304"');
  });

  it("does nothing on products without a setup unless swatches are on", async () => {
    const plain = await render({ config: null });
    expect(plain.html).not.toContain("pvi-product.js");
    const swatches = await render({ config: null, settings: { swatches: { enabled: true } } });
    expect(swatches.html).toContain("pvi-product.js");
    expect(swatches.html).toContain("pvi-swatches.js");
    expect(swatches.html).not.toContain("pvi-prehide");
  });

  it("respects the gallery switch and the flicker setting", async () => {
    const off = await render({ settings: { gallery: { enabled: false } } });
    expect(off.html).not.toContain("pvi-product.js");
    const noFlash = await render({ settings: { gallery: { preventFlash: false } } });
    expect(noFlash.html).toContain("pvi-product.js");
    expect(noFlash.html).not.toContain("pvi-prehide");
  });

  it("loads card swatches on collection pages only when enabled", async () => {
    const off = await render({ template: "collection" });
    expect(off.html.trim()).toBe("");
    const on = await render({ template: "collection", settings: { cards: { enabled: true } } });
    expect(on.html).toContain("pvi-cards.js");
    expect(on.html).not.toContain("pvi-product.js");
  });

  it("custom CSS can't break out of its style tag", async () => {
    for (const payload of ["a{color:red}</style><script>alert(1)</script>", "a{}<<//style><img src=x onerror=alert(1)>"]) {
      const { html } = await render({ settings: { customCss: payload } });
      const css = /<style id="pvi-custom">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
      expect(css).not.toContain("<");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<script>alert");
    }
  });

  it("renders media without a preview image as valid JSON", async () => {
    const liquid = await render();
    expect(liquid.json("pvi-product").media[0].thumb).toContain("width");
  });
});
