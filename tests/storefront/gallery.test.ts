// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { normalizeProduct, type SFProductRaw } from "../../src/storefront/data";
import { applyVisibility, detectLists, mediaIdOf } from "../../src/storefront/gallery";
import { findNativeOptions, readSelection } from "../../src/storefront/picker";

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

function product(): ReturnType<typeof normalizeProduct> {
  const raw: SFProductRaw = {
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
    images: media.map((m, i) => [700000 + i, `files/${m.file}.jpg`] as [number, string]),
    selected: null,
    first: 11,
    config: { v: 1, g: { [RED]: [300002, 300003], [BLUE]: [300004] }, s: [300001] },
  };
  return normalizeProduct(raw);
}

const visibleMedia = (root: Element, selector: string) =>
  Array.from(root.querySelectorAll(selector))
    .filter((el) => !el.hasAttribute("data-pvi-hidden"))
    .map((el) => el.getAttribute("data-check"));

describe("gallery detection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("matches media by id attributes, image ids and file names", () => {
    const p = product();
    const el = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild!;
    };
    expect(mediaIdOf(el(`<li data-media-id="template--9__main-300003"></li>`), p)).toBe(300003);
    expect(mediaIdOf(el(`<div data-image-id="700001"></div>`), p)).toBe(300002);
    expect(mediaIdOf(el(`<img src="//shop.com/cdn/shop/files/blue-front.jpg?v=1&width=400">`), p)).toBe(300004);
    expect(mediaIdOf(el(`<img srcset="//cdn.shopify.com/s/files/1/products/red-back_360x.jpg 360w">`), p)).toBe(300003);
    expect(mediaIdOf(el(`<img src="data:image/gif;base64,R0" data-src="//cdn.shopify.com/s/files/1/products/hero_{width}x.jpg">`), p)).toBe(300001);
    expect(mediaIdOf(el(`<a href="/collections/all">x</a>`), p)).toBeNull();
    expect(mediaIdOf(el(`<div data-media-id="999999"></div>`), p)).toBeNull();
  });

  it("finds the main list, thumbnails and filters both", () => {
    document.body.innerHTML = `<section class="shopify-section">
      <ul class="main">${media.map((m) => `<li data-check="${m.id}"><div class="wrap"><img src="/cdn/shop/files/${m.file}.jpg?width=900"></div></li>`).join("")}</ul>
      <div class="thumbnails">${media.map((m) => `<button data-check="${m.id}"><img src="/cdn/shop/files/${m.file}.jpg?width=100"></button>`).join("")}</div>
      <div class="featured"><img src="/cdn/shop/files/red-front.jpg?width=900"></div>
    </section>`;
    const scope = document.querySelector("section")!;
    const lists = detectLists(scope, product());
    expect(lists).toHaveLength(2);
    expect(lists.map((l) => l.thumbs).sort()).toEqual([false, true]);
    applyVisibility(lists, new Set([300001, 300004, 300005]));
    expect(visibleMedia(scope, "ul.main > li")).toEqual(["300001", "300004", "300005"]);
    expect(visibleMedia(scope, ".thumbnails > button")).toEqual(["300001", "300004", "300005"]);
    // A lone featured image is never hidden.
    expect(scope.querySelector(".featured")!.hasAttribute("data-pvi-hidden")).toBe(false);
  });

  it("never blanks a list and restores items", () => {
    document.body.innerHTML = `<div id="s"><div class="g">${media
      .map((m) => `<div data-check="${m.id}" data-media-id="${m.id}"></div>`)
      .join("")}</div></div>`;
    const scope = document.getElementById("s")!;
    const lists = detectLists(scope, product());
    applyVisibility(lists, new Set([424242]));
    expect(visibleMedia(scope, ".g > div")).toHaveLength(media.length);
    applyVisibility(lists, new Set([300002]));
    expect(visibleMedia(scope, ".g > div")).toEqual(["300002"]);
    applyVisibility(lists, new Set(media.map((m) => m.id)));
    expect(visibleMedia(scope, ".g > div")).toHaveLength(media.length);
  });

  it("honors a merchant item selector", () => {
    document.body.innerHTML = `<div id="s"><div class="odd">${media
      .map((m) => `<figure class="pic" data-check="${m.id}"><span><img src="/cdn/shop/files/${m.file}.jpg"></span></figure>`)
      .join("")}</div></div>`;
    const scope = document.getElementById("s")!;
    const lists = detectLists(scope, product(), [], { itemSelector: "figure.pic" });
    expect(lists).toHaveLength(1);
    expect(lists[0].items.every((item) => item.matches("figure.pic"))).toBe(true);
  });
});

describe("native picker detection", () => {
  it("finds radio groups and selects and drives them", () => {
    document.body.innerHTML = `<form action="/cart/add" id="f">
      <fieldset class="opt"><legend>Color</legend>
        <input type="radio" id="c1" name="Color-1" value="Red" checked><label for="c1">Red</label>
        <input type="radio" id="c2" name="Color-1" value="Blue"><label for="c2">Blue</label>
      </fieldset>
      <div class="opt-size"><label for="sz">Size</label><select id="sz" name="options[Size]"><option>S</option><option>M</option></select></div>
      <input type="hidden" name="id" value="11"><button type="submit" name="add">Add</button></form>`;
    const scope = document.body;
    const native = findNativeOptions(scope, product());
    expect(native.map((n) => n.kind)).toEqual(["radio", "select"]);
    expect(native[0].blocks.map((b) => b.matches("fieldset.opt"))).toEqual([true]);
    expect(native[1].blocks.map((b) => b.matches(".opt-size"))).toEqual([true]);
    expect(readSelection(native, 2)).toEqual(["Red", "S"]);
    let changes = 0;
    document.addEventListener("change", () => changes++);
    native[0].choose("Blue");
    native[1].choose("M");
    expect(readSelection(native, 2)).toEqual(["Blue", "M"]);
    expect(changes).toBeGreaterThanOrEqual(2);
  });
});
