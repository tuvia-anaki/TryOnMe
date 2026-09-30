import { readFileSync } from "node:fs";
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";

/**
 * The theme app extension's Liquid, rendered with liquidjs and Shopify-like
 * filters: the embed decides where the app runs and prints valid settings.
 */

const DIR = "extensions/variant-cards";
const locale = JSON.parse(readFileSync(`${DIR}/locales/en.default.json`, "utf8"));
const read = (path: string) => readFileSync(`${DIR}/${path}`, "utf8").replace(/{%\s*schema\s*%}[\s\S]*?{%\s*endschema\s*%}/, "");

function engine(): Liquid {
  const liquid = new Liquid({ strictFilters: true });
  const money = (cents: number) => `$${(Number(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  liquid.registerFilter("money", money);
  liquid.registerFilter("money_with_currency", (cents: number) => `${money(cents)} USD`);
  liquid.registerFilter("t", (key: string) => key.split(".").reduce((o: any, k) => o?.[k], locale) ?? key);
  // Like Shopify's json filter, which escapes HTML-sensitive characters.
  liquid.registerFilter("json", (v: unknown) => JSON.stringify(v ?? null).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"));
  liquid.registerFilter("asset_url", (name: string) => `/cdn/assets/${name}`);
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
    expect(config.texts).toEqual({ from: "From {price}", soldOut: "Sold out" });
    expect(html).toContain('id="vc-prehide"');
    expect(html).toContain("/cdn/assets/vc-cards.js");
  });

  it("respects selected collections, per-collection switches and the pause switch", async () => {
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
    const { config } = await embed({ app: app({ split: { title: "</script><b>" } }), template: { name: "collection" }, collection: collection("summer") });
    expect(config.settings.split.title).toBe("</script><b>");
  });
});
