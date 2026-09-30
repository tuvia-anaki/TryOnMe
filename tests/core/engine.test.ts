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

  it("only splits the main grid's section: its later cards yes, carousels further down no", async () => {
    document.body.innerHTML = `<main><div id="shopify-section-main"><ul class="grid">${card("a")}${card("b")}</ul></div><div id="shopify-section-recent"></div></main>`;
    vi.stubGlobal("fetch", async (url: string) => {
      const handle = /\/products\/([^/?#]+)\.js/.exec(String(url))![1];
      return new Response(JSON.stringify(product(handle.charCodeAt(0), handle)));
    });
    const engine = new Engine(context());
    await engine.run();
    // Infinite scroll adds cards to the main grid; a "Recently viewed" carousel loads below.
    document.querySelector("#shopify-section-main ul")!.insertAdjacentHTML("beforeend", card("c") + card("d"));
    document.querySelector("#shopify-section-recent")!.innerHTML = `<ul class="carousel">${card("x")}${card("y")}</ul>`;
    // A product carousel inside the main section (e.g. in the filters drawer) doesn't count either.
    document.querySelector("#shopify-section-main")!.insertAdjacentHTML("beforeend", `<div class="drawer"><ul class="grid swiper-wrapper sidebar-list">${card("p")}${card("q")}</ul></div>`);
    await engine.run();
    const split = (selector: string) => Array.from(document.querySelectorAll(`${selector} [data-vc-card]`)).map((el) => el.getAttribute("data-vc-card"));
    expect(split("#shopify-section-main")).toEqual(["97:Red", "97:Blue", "98:Red", "98:Blue", "99:Red", "99:Blue", "100:Red", "100:Blue"]);
    expect(split("#shopify-section-recent")).toEqual([]);
    expect(split(".drawer")).toEqual([]);
    // Filters: the theme redraws the main grid (now with a state class).
    document.querySelector("#shopify-section-main > ul")!.outerHTML = `<ul class="grid grid--loaded">${card("e")}${card("f")}</ul>`;
    await engine.run();
    expect(split("#shopify-section-main > ul")).toEqual(["101:Red", "101:Blue", "102:Red", "102:Blue"]);
  });

  it("finds the template's main grid even when a product slider above it has more cards", async () => {
    document.body.innerHTML = `<main><div id="shopify-section-template--1__7f3a-slider"><ul class="slider">${card("s1")}${card("s2")}${card("s3")}</ul></div><div id="shopify-section-template--1__collection-products"><ul class="grid">${card("m1")}${card("m2")}</ul></div></main>`;
    vi.stubGlobal("fetch", async (url: string) => {
      const handle = /\/products\/([^/?#]+)\.js/.exec(String(url))![1];
      return new Response(JSON.stringify(product(handle.charCodeAt(1), handle)));
    });
    const engine = new Engine(context());
    await engine.run();
    const split = (selector: string) => document.querySelectorAll(`${selector} [data-vc-card]`).length;
    expect(split("#shopify-section-template--1__collection-products")).toBe(4);
    expect(split("#shopify-section-template--1__7f3a-slider")).toBe(0);
  });

  it("leaves promo tiles alone (they link to a product but show neither its title nor a price)", async () => {
    const promo = `<li class="promo"><a href="/products/hat"><img src="/cdn/promo.jpg" alt=""><h5>Summer hats</h5><p>Save up to 50%</p></a></li>`;
    document.body.innerHTML = `<main><ul class="grid">${card("shirt")}${promo}</ul></main>`;
    vi.stubGlobal("fetch", async (url: string) => {
      const handle = /\/products\/([^/?#]+)\.js/.exec(String(url))![1];
      return new Response(JSON.stringify(handle === "hat" ? { ...product(2, "hat"), title: "Panama hat" } : product(1, handle)));
    });
    const engine = new Engine(context());
    const [grid] = engine.grids();
    const rendered = await engine.processGrid(grid);
    expect(rendered.map((r) => r.card.key)).toEqual(["1:Red", "1:Blue"]);
    expect(document.querySelectorAll(".promo")).toHaveLength(1);
    expect(document.querySelector(".promo a")!.getAttribute("href")).toBe("/products/hat");
  });

  it("points a card's links at its color, but links to other colors keep their target", async () => {
    // A quick view inside the card lists every color as a link (outside any swatch container).
    document.body.innerHTML = `<main><ul class="grid"><li class="card"><a href="/products/tee2"><img src="/cdn/tee2.jpg" alt=""></a><a class="title" href="/products/tee2">tee2</a><span class="price">$25.00</span><div class="quick-view"><a href="/products/tee2?variant=20">Red</a> <a href="/products/tee2?variant=21">Blue</a></div></li>${card("hat")}</ul></main>`;
    vi.stubGlobal("fetch", async (url: string) => {
      const handle = /\/products\/([^/?#]+)\.js/.exec(String(url))![1];
      return new Response(JSON.stringify(product(handle === "tee2" ? 2 : 3, handle)));
    });
    const engine = new Engine(context());
    const [grid] = engine.grids();
    const rendered = await engine.processGrid(grid);
    const links = (key: string) => Array.from(rendered.find((r) => r.card.key === key)!.el.querySelectorAll("a")).map((a) => `${a.textContent!.trim() || "img"} ${a.getAttribute("href")}`);
    expect(links("2:Red")).toEqual(["img /products/tee2?variant=20", "tee2 - Red /products/tee2?variant=20", "Red /products/tee2?variant=20", "Blue /products/tee2?variant=21"]);
    expect(links("2:Blue")).toEqual(["img /products/tee2?variant=21", "tee2 - Blue /products/tee2?variant=21", "Red /products/tee2?variant=20", "Blue /products/tee2?variant=21"]);
  });

  it("says Sold out once: the theme's label if it has one, else the app's badge", async () => {
    const themeCard = (handle: string, label: string) =>
      `<li class="card"><a href="/products/${handle}"><img src="/cdn/${handle}.jpg" alt=""></a><h3>${handle}</h3><span class="price">$25.00</span>${label}</li>`;
    document.body.innerHTML = `<main><ul class="grid">${themeCard("gone", '<span class="price__badge">Sold out</span>')}${themeCard("some", "")}${themeCard("mixed", '<span class="badge">Sold out</span>')}</ul></main>`;
    const soldOut = (id: number, handle: string, available: boolean[]) => {
      const p = product(id, handle);
      p.variants.forEach((v, i) => (v.available = available[i]));
      p.available = available.some(Boolean);
      return p;
    };
    vi.stubGlobal("fetch", async (url: string) => {
      const handle = /\/products\/([^/?#]+)\.js/.exec(String(url))![1];
      const data = { gone: soldOut(5, "gone", [false, false]), some: soldOut(6, "some", [true, false]), mixed: soldOut(7, "mixed", [true, false]) }[handle];
      return new Response(JSON.stringify(data));
    });
    const engine = new Engine(context());
    const [grid] = engine.grids();
    const rendered = await engine.processGrid(grid);
    const card = (key: string) => rendered.find((r) => r.card.key === key)!.el;
    const labels = (el: Element) => Array.from(el.querySelectorAll(".price__badge, .badge, .vc-badge")).filter((b) => !b.hasAttribute("data-vc-hidden")).map((b) => b.textContent);
    // Whole product sold out: the theme already says it, no second badge.
    expect(labels(card("5:Red"))).toEqual(["Sold out"]);
    expect(labels(card("5:Blue"))).toEqual(["Sold out"]);
    // The theme says nothing: the sold-out color gets the app's badge, the other doesn't.
    expect(labels(card("6:Red"))).toEqual([]);
    expect(labels(card("6:Blue"))).toEqual(["Sold out"]);
    // A theme label on a color that can be bought is about the product, so it's hidden there.
    expect(labels(card("7:Red"))).toEqual([]);
    expect(labels(card("7:Blue"))).toEqual(["Sold out"]);
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
