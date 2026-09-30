import { readFileSync } from "node:fs";
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";

/**
 * The theme app extension's Liquid, rendered with liquidjs and Shopify-like
 * filters: the embed decides where the app runs and prints valid settings;
 * the sections split products into color cards.
 */

const DIR = "extensions/variant-cards";
const locale = JSON.parse(readFileSync(`${DIR}/locales/en.default.json`, "utf8"));
const read = (path: string) => readFileSync(`${DIR}/${path}`, "utf8").replace(/{%\s*schema\s*%}[\s\S]*?{%\s*endschema\s*%}/, "");

function engine(): Liquid {
  const liquid = new Liquid({ root: [`${DIR}/snippets`], extname: ".liquid", strictFilters: true });
  const money = (cents: number) => `$${(Number(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  liquid.registerFilter("money", money);
  liquid.registerFilter("money_with_currency", (cents: number) => `${money(cents)} USD`);
  liquid.registerFilter("t", (key: string) => key.split(".").reduce((o: any, k) => o?.[k], locale) ?? key);
  // Like Shopify's json filter, which escapes HTML-sensitive characters.
  liquid.registerFilter("json", (v: unknown) => JSON.stringify(v ?? null).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"));
  liquid.registerFilter("asset_url", (name: string) => `/cdn/assets/${name}`);
  liquid.registerFilter("image_url", (img: any) => (typeof img === "string" ? img : img?.src ?? "") + "?w");
  liquid.registerFilter("image_tag", (url: string, ...args: unknown[]) => `<img src="${url}" data-args="${args.length}">`);
  liquid.registerFilter("placeholder_svg_tag", () => "<svg></svg>");
  return liquid;
}

async function embed(ctx: Record<string, unknown>) {
  const html = await engine().parseAndRender(read("blocks/vc-app-embed.liquid"), {
    request: { design_mode: false },
    ...ctx,
  });
  const json = /<script type="application\/json" id="vc-config">([\s\S]*?)<\/script>/.exec(html)?.[1];
  return { html, config: json ? JSON.parse(json) : null };
}

const app = (settings: unknown) => ({ metafields: { variant_cards: { settings: { value: settings } } } });
const collection = (handle: string, own: unknown = null) => ({ handle, id: 42, metafields: { "$app:variant_cards": { settings: { value: own } } } });

describe("app embed", () => {
  it("runs on every collection with default (unsaved) settings", async () => {
    const { html, config } = await embed({ app: app(null), template: { name: "collection" }, collection: collection("summer") });
    expect(config).toMatchObject({ template: "collection", collection: { handle: "summer", id: 42 }, settings: null, money: { plain: "$1,234.56", withCurrency: "$1,234.56 USD" } });
    expect(config.texts).toMatchObject({ from: "From {price}", soldOut: "Sold out", addToCart: "Add to cart" });
    expect(html).toContain('id="vc-prehide"');
    expect(html).toContain("/cdn/assets/vc-cards.js");
  });

  it("respects selected collections, per-collection switches and the emergency switch", async () => {
    const selected = { collections: { mode: "selected", handles: ["sale"] } };
    expect((await embed({ app: app(selected), template: { name: "collection" }, collection: collection("summer") })).config).toBeNull();
    expect((await embed({ app: app(selected), template: { name: "collection" }, collection: collection("sale") })).config).not.toBeNull();
    expect((await embed({ app: app(null), template: { name: "collection" }, collection: collection("summer", { enabled: false }) })).config).toBeNull();
    expect((await embed({ app: app({ enabled: false }), template: { name: "collection" }, collection: collection("summer") })).config).toBeNull();
  });

  it("handles search, the all-products page and the home page", async () => {
    expect((await embed({ app: app(null), template: { name: "search" } })).config?.template).toBe("search");
    expect((await embed({ app: app({ pages: { search: false } }), template: { name: "search" } })).config).toBeNull();
    expect((await embed({ app: app({ pages: { allProducts: false } }), template: { name: "collection" }, collection: collection("all") })).config).toBeNull();
    expect((await embed({ app: app(null), template: { name: "index" } })).config).toBeNull();
    expect((await embed({ app: app({ pages: { home: true } }), template: { name: "index" } })).config).not.toBeNull();
    expect((await embed({ app: app(null), template: { name: "product" } })).html).not.toContain("vc-cards.js");
  });

  it("skips the anti-flash style when splitting is off and prints collection overrides", async () => {
    const { html, config } = await embed({ app: app({ split: { enabled: false } }), template: { name: "collection" }, collection: collection("summer", { split: true, order: ["1:Red"] }) });
    expect(html).toContain('id="vc-prehide"'); // the collection turns splitting back on
    expect(config.collectionSettings).toEqual({ split: true, order: ["1:Red"] });
    const off = await embed({ app: app({ split: { enabled: false } }), template: { name: "collection" }, collection: collection("summer") });
    expect(off.html).not.toContain('id="vc-prehide"');
  });

  it("keeps the settings JSON inside its script tag", async () => {
    const { config } = await embed({ app: app({ texts: { soldOut: "</script><b>" } }), template: { name: "collection" }, collection: collection("summer") });
    expect(config.settings.texts.soldOut).toBe("</script><b>");
  });
});

const variant = (id: number, color: string, size: string, available = true, price = 2500) => ({
  id,
  title: `${color} / ${size}`,
  option1: color,
  option2: size,
  available,
  price,
  compare_at_price: null,
  url: `/products/tee?variant=${id}`,
  featured_media: { id: id * 10, src: `https://cdn/${color}.jpg` },
});

const tee = {
  title: "Tee",
  url: "/products/tee",
  vendor: "Acme",
  type: "Shirt",
  has_only_default_variant: false,
  available: true,
  price: 2500,
  price_min: 2500,
  price_varies: false,
  options_with_values: [
    { name: "Color", position: 1, values: [{ name: "Red", swatch: { color: "#f00" } }, { name: "Blue", swatch: null }, { name: "Green", swatch: null }] },
    { name: "Size", position: 2, values: [{ name: "S" }, { name: "M" }] },
  ],
  variants: [variant(1, "Red", "S", false), variant(2, "Red", "M"), variant(3, "Blue", "S", false), variant(4, "Blue", "M", false), variant(5, "Green", "S"), variant(6, "Green", "M")],
  featured_media: { id: 1, src: "https://cdn/main.jpg" },
  media: [],
};
const mugVariant = variant(9, "Default Title", "");
const mug = { ...tee, title: "Mug", url: "/products/mug", has_only_default_variant: true, options_with_values: [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }], variants: [mugVariant], selected_or_first_available_variant: mugVariant };

async function grid(settings: Record<string, unknown>) {
  const html = await engine().parseAndRender(`{% render 'vc-grid', products: products, s: s, block: block, view_all_url: '' %}`, {
    products: [tee, mug],
    s: { split: true, limit: 12, columns_desktop: 4, columns_mobile: 2, show_swatches: true, show_add_to_cart: true, ...settings },
    block: { id: "b1" },
    app: app({ split: { title: "{product} - {value}" } }),
    routes: { cart_add_url: "/cart/add" },
    request: { design_mode: false },
  });
  const titles = [...html.matchAll(/class="vc-card__title" href="([^"]+)">([^<]+)</g)].map((m) => `${m[2]} → ${m[1]}`);
  return { html, titles };
}

describe("app sections (vc-grid)", () => {
  it("shows each color as its own card, linked to its first available variant", async () => {
    const { titles, html } = await grid({});
    expect(titles).toEqual(["Tee - Red → /products/tee?variant=2", "Tee - Blue → /products/tee?variant=3", "Tee - Green → /products/tee?variant=5", "Mug → /products/mug"]);
    // Colors with sizes to pick open the product; the single-variant mug adds to cart.
    expect(html).toContain("Choose options");
    expect(html).toContain('name="id" value="9"');
    expect(html).toContain("background: #f00");
  });

  it("hides sold-out colors, respects the limit and can keep products whole", async () => {
    expect((await grid({ hide_sold_out: true })).titles.map((t) => t.split(" → ")[0])).toEqual(["Tee - Red", "Tee - Green", "Mug"]);
    expect((await grid({ limit: 2 })).titles).toHaveLength(2);
    expect((await grid({ split: false })).titles.map((t) => t.split(" → ")[0])).toEqual(["Tee", "Mug"]);
  });
});
