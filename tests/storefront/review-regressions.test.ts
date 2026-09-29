// @vitest-environment happy-dom
/**
 * Regression tests for issues found in code review (each describes the
 * failure it guards against).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeSettings } from "../../src/shared/settings";
import { GalleryController } from "../../src/storefront/controller";
import { normalizeProduct, type SFProductRaw } from "../../src/storefront/data";
import { findNativeOptions } from "../../src/storefront/picker";
import { findProductScope } from "../../src/storefront/scope";
import { detectAdapter, type ListState } from "../../src/storefront/sliders";

const RED = 501;
const BLUE = 502;
const S = 511;
const M = 512;
const media = [
  { id: 300001, file: "hero" },
  { id: 300002, file: "red-front" },
  { id: 300003, file: "red-back" },
  { id: 300004, file: "blue-front" },
  { id: 300005, file: "size-chart" },
];

function raw(overrides: Partial<SFProductRaw> = {}): SFProductRaw {
  return {
    id: 1,
    handle: "tee",
    options: [
      { name: "Color", position: 1, values: [{ id: RED, name: "Red" }, { id: BLUE, name: "Blue" }] },
      { name: "Size", position: 2, values: [{ id: S, name: "S" }, { id: M, name: "M" }] },
    ],
    variants: [
      [11, 1, "Red", "S", null, 300002],
      [12, 1, "Red", "M", null, 300002],
      [13, 1, "Blue", "S", null, 300004],
      [14, 0, "Blue", "M", null, 300004],
    ],
    media: media.map((m) => ({ id: m.id, type: "image", src: `files/${m.file}.jpg` })),
    images: [],
    selected: null,
    first: 11,
    config: { v: 1, g: { [RED]: [300002, 300003], [BLUE]: [300004] }, s: [300001] },
    ...overrides,
  };
}
const product = (overrides: Partial<SFProductRaw> = {}) => normalizeProduct(raw(overrides));
const galleryHtml = (sec = "template--1__main") =>
  `<ul class="product__media-list">${media
    .map((m) => `<li class="product__media-item" data-media-id="${sec}-${m.id}"><img src="/cdn/shop/files/${m.file}.jpg?width=1946"></li>`)
    .join("")}</ul>`;

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete (window as any).__pviProduct;
  vi.resetModules();
});

describe("product scope (Dawn wraps the form in <product-form data-section-id>)", () => {
  it("uses the Shopify section, which contains gallery and picker", () => {
    document.body.innerHTML = `<div id="shopify-section-x" class="shopify-section"><section>
      ${galleryHtml()}
      <variant-selects><fieldset><legend>Color</legend>
        <input type="radio" id="c1" name="Color-1" value="Red" form="pf" checked><label for="c1">Red</label>
        <input type="radio" id="c2" name="Color-1" value="Blue" form="pf"><label for="c2">Blue</label>
      </fieldset></variant-selects>
      <product-form class="product-form" data-section-id="template--1__main">
        <form method="post" action="/cart/add" id="pf"><input type="hidden" name="id" value="11"><button type="submit" name="add">Add</button></form>
      </product-form>
    </section></div>`;
    const p = product();
    const { scope, form } = findProductScope(p);
    expect(scope.classList.contains("shopify-section")).toBe(true);
    expect(form?.id).toBe("pf");
    const gallery = new GalleryController(scope, p, sanitizeSettings({}));
    expect(gallery.lists).toHaveLength(1);
    expect(findNativeOptions(scope, p).length).toBeGreaterThan(0);
  });

  it("climbs from the form when there is no section wrapper (page builders)", () => {
    document.body.innerHTML = `<div class="pb-root"><div class="pb-row">${galleryHtml()}</div>
      <div class="pb-row"><form action="/cart/add"><input type="hidden" name="id" value="11"></form></div></div>`;
    const { scope } = findProductScope(product());
    expect(scope.classList.contains("pb-root")).toBe(true);
  });
});

describe("theme swatches are never treated as a gallery", () => {
  it("keeps swatch labels that show variant images visible", () => {
    document.body.innerHTML = `<section class="shopify-section" id="sec">
      ${galleryHtml()}
      <form action="/cart/add">
        <fieldset class="swatches"><legend>Color</legend>
          <input type="radio" id="c1" name="Color" value="Red" checked><label for="c1" class="swatch"><img src="/cdn/shop/files/red-front.jpg?width=80" alt="Red"></label>
          <input type="radio" id="c2" name="Color" value="Blue"><label for="c2" class="swatch" style="--swatch--background: url(/cdn/shop/files/blue-front.jpg?width=80)"></label>
        </fieldset>
        <div class="swatch-list"><button type="button" data-value="Red"><img src="/cdn/shop/files/red-front.jpg?width=60"><input type="radio" name="x"></button><button type="button" data-value="Blue"><img src="/cdn/shop/files/blue-front.jpg?width=60"><input type="radio" name="x"></button></div>
        <input type="hidden" name="id" value="11">
      </form>
    </section>`;
    const scope = document.getElementById("sec")!;
    const gallery = new GalleryController(scope, product(), sanitizeSettings({}));
    expect(gallery.lists.map((l) => l.parent.className)).toEqual(["product__media-list"]);
    gallery.update(11, "init");
    expect(scope.querySelector("label[for=c2]")!.hasAttribute("data-pvi-hidden")).toBe(false);
    expect(scope.querySelectorAll(".swatch-list [data-pvi-hidden]")).toHaveLength(0);
    expect(scope.querySelectorAll(".product__media-list [data-pvi-hidden]")).toHaveLength(1);
  });
});

describe("option blocks never swallow other options or the buy button", () => {
  it("hides only the Color controls when Color and Size share a wrapper", () => {
    document.body.innerHTML = `<section id="sec"><form action="/cart/add"><div class="product-options">
      <label for="sel-c">Color</label><select id="sel-c" name="options[Color]"><option>Red</option><option>Blue</option></select>
      <label for="sel-s">Size</label><select id="sel-s" name="options[Size]"><option>S</option><option>M</option></select>
    </div><input type="hidden" name="id" value="11"><button type="submit">Add</button></form></section>`;
    const options = findNativeOptions(document.getElementById("sec")!, product());
    const color = options.find((o) => o.index === 0)!;
    const size = options.find((o) => o.index === 1)!;
    expect(color.blocks.some((b) => b.contains(document.getElementById("sel-s")!))).toBe(false);
    expect(color.blocks.some((b) => b.id === "sel-c")).toBe(true);
    expect(color.blocks.some((b) => b.getAttribute("for") === "sel-c")).toBe(true);
    expect(size.blocks.some((b) => b.contains(document.getElementById("sel-c")!))).toBe(false);
  });

  it("never picks the form itself when radios sit directly inside it", () => {
    document.body.innerHTML = `<section id="sec"><form action="/cart/add" id="f">
      <input type="radio" id="r1" name="Color" value="Red" checked><label for="r1">Red</label>
      <input type="radio" id="r2" name="Color" value="Blue"><label for="r2">Blue</label>
      <input type="radio" id="s1" name="Size" value="S" checked><label for="s1">S</label>
      <input type="radio" id="s2" name="Size" value="M"><label for="s2">M</label>
      <input type="hidden" name="id" value="11"><button type="submit" name="add">Add</button></form></section>`;
    const options = findNativeOptions(document.getElementById("sec")!, product());
    for (const option of options) {
      expect(option.blocks.some((b) => b.tagName === "FORM")).toBe(false);
      expect(option.blocks.some((b) => b.querySelector("button[name=add]"))).toBe(false);
    }
    // Color: each radio and its label, nothing from Size.
    const colorBlocks = options[0].blocks;
    for (const id of ["r1", "r2"]) {
      expect(colorBlocks).toContain(document.getElementById(id));
      expect(colorBlocks).toContain(document.querySelector(`label[for=${id}]`));
    }
    expect(colorBlocks.some((b) => b.id === "s1" || b.getAttribute("for") === "s1")).toBe(false);
  });

  it("ignores stale picker copies a theme keeps hidden during transitions", () => {
    document.body.innerHTML = `<section id="sec">
      <variant-selects style="display: none"><fieldset><input type="radio" name="Color-1" value="Red" checked><input type="radio" name="Color-1" value="Blue"></fieldset></variant-selects>
      <variant-selects><fieldset><input type="radio" name="Color-1" value="Red"><input type="radio" name="Color-1" value="Blue" checked></fieldset></variant-selects>
    </section>`;
    const options = findNativeOptions(document.getElementById("sec")!, product());
    expect(options[0].read()).toBe("Blue");
    expect(options[0].controls).toHaveLength(2);
  });
});

function fakeFlickityList(): { list: ListState; host: HTMLElement; calls: string[]; cells: () => Element[] } {
  document.body.innerHTML = `<div class="flickity-enabled"><div class="flickity-viewport"><div class="flickity-slider">
    <div class="cell promo">promo</div>${media.map((m) => `<div class="cell" data-m="${m.id}"></div>`).join("")}
  </div></div></div>`;
  const host = document.querySelector(".flickity-enabled") as HTMLElement;
  const slider = host.querySelector(".flickity-slider")!;
  const calls: string[] = [];
  const flkty = {
    selectedElement: undefined as Element | undefined,
    getCellElements: () => Array.from(slider.children),
    reloadCells() {},
    remove(elems: Element[]) {
      calls.push("remove");
      elems.forEach((e) => e.remove());
    },
    insert(elem: Element, index: number) {
      calls.push(`insert@${index}`);
      slider.insertBefore(elem, slider.children[index] ?? null);
    },
    select() {
      calls.push("select");
    },
    resize() {},
  };
  (window as any).Flickity = { data: (el: Element) => (el === host ? flkty : null) };
  const items = Array.from(slider.querySelectorAll("[data-m]"));
  const list: ListState = {
    parent: slider,
    items,
    itemMedia: new Map(items.map((el) => [el, Number(el.getAttribute("data-m"))])),
    adapter: detectAdapter(slider),
    thumbs: false,
  };
  return { list, host, calls, cells: () => Array.from(slider.children) };
}

describe("slider adapters", () => {
  it("Flickity keeps cells that aren't gallery items and restores order", () => {
    const { list, cells, calls } = fakeFlickityList();
    const byId = (id: number) => list.items.find((el) => list.itemMedia.get(el) === id)!;
    list.adapter.apply(list, new Set([byId(300001), byId(300004)]));
    expect(cells().map((c) => c.getAttribute("data-m") ?? "promo")).toEqual(["promo", "300001", "300004"]);
    list.adapter.apply(list, new Set(list.items));
    expect(cells().map((c) => c.getAttribute("data-m") ?? "promo")).toEqual(["promo", "300001", "300002", "300003", "300004", "300005"]);
    // Idempotent: nothing to do the second time.
    calls.length = 0;
    list.adapter.apply(list, new Set(list.items));
    expect(calls).toEqual([]);
  });

  it("Splide refreshes only when slides actually change", () => {
    document.body.innerHTML = `<div class="splide"><div class="splide__track"><ul class="splide__list">${media
      .map((m) => `<li class="splide__slide" data-m="${m.id}"></li>`)
      .join("")}<li class="splide__slide splide__slide--clone" data-m="300001"></li></ul></div></div>`;
    const calls: string[] = [];
    (document.querySelector(".splide") as any).splide = { refresh: () => calls.push("refresh"), go: (i: number) => calls.push(`go${i}`) };
    const parent = document.querySelector(".splide__list")!;
    const items = Array.from(parent.children);
    const list: ListState = { parent, items, itemMedia: new Map(items.map((el) => [el, Number(el.getAttribute("data-m"))])), adapter: detectAdapter(parent), thumbs: false };
    const visible = new Set(items.filter((el) => el.getAttribute("data-m") !== "300004"));
    list.adapter.apply(list, visible);
    expect(calls).toEqual(["refresh"]);
    list.adapter.apply(list, visible);
    expect(calls).toEqual(["refresh"]);
  });
});

describe("gallery: 'show all images until a variant is picked'", () => {
  it("doesn't filter on load when no variant is selected", async () => {
    document.head.innerHTML = `<script type="application/json" id="pvi-settings">${JSON.stringify({ gallery: { noSelection: "all" } })}</script>
      <script type="application/json" id="pvi-product">${JSON.stringify(raw())}</script>`;
    document.body.innerHTML = `<div class="shopify-section">${galleryHtml()}<form action="/cart/add"><input type="hidden" name="id" value="11"></form></div>`;
    await import("../../src/storefront/product-entry");
    expect((window as any).__pviProduct).toBeTruthy();
    expect(document.querySelectorAll("[data-pvi-hidden]")).toHaveLength(0);
  });

  it("filters on load when a variant is selected (?variant=)", async () => {
    document.head.innerHTML = `<script type="application/json" id="pvi-settings">${JSON.stringify({ gallery: { noSelection: "all" } })}</script>
      <script type="application/json" id="pvi-product">${JSON.stringify(raw({ selected: 13 }))}</script>`;
    document.body.innerHTML = `<div class="shopify-section">${galleryHtml()}<form action="/cart/add"><input type="hidden" name="id" value="13"></form></div>`;
    await import("../../src/storefront/product-entry");
    // Blue selected: red-front and red-back hidden.
    expect(document.querySelectorAll("[data-pvi-hidden]")).toHaveLength(2);
  });
});
