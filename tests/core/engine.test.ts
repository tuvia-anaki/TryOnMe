// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { learnMoneyPattern } from "../../src/shared/money";
import { DEFAULT_SETTINGS, effectiveSettings, sanitizeSettings } from "../../src/shared/settings";
import { clearProductCache } from "../../src/storefront/cards";
import type { PageContext } from "../../src/storefront/context";
import { Engine } from "../../src/storefront/engine";

const product = (id: number, handle: string) => ({
  id,
  handle,
  title: handle,
  vendor: "Acme",
  type: "",
  options: [{ name: "Color", position: 1, values: ["Red", "Blue"] }],
  images: [],
  media: [],
  variants: ["Red", "Blue"].map((color, i) => ({
    id: id * 10 + i,
    title: color,
    option1: color,
    option2: null,
    option3: null,
    available: true,
    price: 2500,
    compare_at_price: null,
    featured_media: null,
  })),
  price: 2500,
  available: true,
});

const card = (handle: string, variant?: number) =>
  `<li class="card"><a href="/products/${handle}${variant ? `?variant=${variant}` : ""}"><img src="/cdn/${handle}.jpg" alt=""></a><h3>${handle}</h3><span class="price">$25.00</span></li>`;

function context(): PageContext {
  const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, split: { enabled: true, by: "auto", title: "{product} - {value}" } });
  return {
    template: "collection",
    collection: { handle: "all", id: 1 },
    settings,
    effective: effectiveSettings(settings, null),
    money: [learnMoneyPattern("$1,234.56", 123456)!],
    texts: { from: "From {price}", soldOut: "Sold out" },
    designMode: false,
    root: "/",
  };
}

/**
 * Shopify's Horizon themes (Horizon, Savor, …): every product image is a slide; variant
 * images after the first are rendered with the `hidden` attribute until that variant is picked.
 */
function horizonCard(handle: string) {
  const slide = (id: number, file: string, extra: string) =>
    `<slideshow-slide ref="slides[]" slide-id="${id}" ${extra}><img src="/cdn/shop/files/${file}.png?width=800" alt=""></slideshow-slide>`;
  return `<li class="product-grid__item"><product-card><a href="/products/${handle}"><slideshow-component><slideshow-slides>${slide(101, "navy", 'aria-hidden="false" variant-image')}${slide(102, "burgundy", 'aria-hidden="true" variant-image hidden')}${slide(103, "olive", 'aria-hidden="true" variant-image hidden')}</slideshow-slides></slideshow-component></a><a href="/products/${handle}"><h3>${handle}</h3></a><span class="price">$25.00</span></product-card></li>`;
}

const hoodie = () => ({
  ...product(3, "hoodie"),
  options: [{ name: "Color", position: 1, values: ["Navy", "Burgundy", "Olive"] }],
  variants: ["Navy", "Burgundy", "Olive"].map((color, i) => ({
    id: 30 + i,
    title: color,
    option1: color,
    option2: null,
    option3: null,
    available: true,
    price: 2500,
    compare_at_price: null,
    featured_media: { id: 101 + i, preview_image: { src: `https://cdn.shopify.com/s/files/1/0001/files/${["navy", "burgundy", "olive"][i]}.png` } },
  })),
});

describe("engine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearProductCache();
    sessionStorage.clear();
  });

  it("never splits a product that another app already shows per variant", async () => {
    // "shirt" was split by another app (two cards); "hat" wasn't.
    document.body.innerHTML = `<main><ul class="grid">${card("shirt", 10)}${card("shirt", 11)}${card("hat")}</ul></main>`;
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const handle = /\/products\/([^/?#]+)\.js/.exec(String(url))![1];
      fetched.push(handle);
      return new Response(JSON.stringify(product(handle === "hat" ? 2 : 1, handle)));
    });

    const engine = new Engine(context());
    const [grid] = engine.grids();
    const rendered = await engine.processGrid(grid);

    expect(fetched).toEqual(["hat"]);
    expect(rendered.map((r) => r.card.key)).toEqual(["2:Red", "2:Blue"]);
    const hrefs = Array.from(document.querySelectorAll(".grid > li > a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/products/shirt?variant=10", "/products/shirt?variant=11", "/products/hat?variant=20", "/products/hat?variant=21"]);
  });

  it("shows each color's own photo in Horizon-style card slideshows (unhides it)", async () => {
    document.body.innerHTML = `<main><ul class="product-grid">${horizonCard("hoodie")}${horizonCard("other")}</ul></main>`;
    vi.stubGlobal("fetch", async (url: string) => {
      const handle = /\/products\/([^/?#]+)\.js/.exec(String(url))![1];
      return new Response(JSON.stringify(handle === "hoodie" ? hoodie() : product(4, "other")));
    });
    const engine = new Engine(context());
    const [grid] = engine.grids();
    const rendered = await engine.processGrid(grid);
    const hoodies = rendered.filter((r) => r.card.product.handle === "hoodie");
    expect(hoodies.map((r) => r.card.label)).toEqual(["Navy", "Burgundy", "Olive"]);
    for (const { el, card } of hoodies) {
      const first = el.querySelector("slideshow-slide");
      expect(first?.querySelector("img")?.getAttribute("src"), card.label!).toContain(card.label!.toLowerCase());
      // The photo shoppers see must not stay hidden.
      expect(first?.hasAttribute("hidden"), `${card.label} slide hidden`).toBe(false);
    }
  });
});
