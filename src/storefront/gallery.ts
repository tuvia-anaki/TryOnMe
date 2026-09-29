import { domImageKeys, srcsetUrls } from "../shared/text";
import type { SFProduct } from "./data";
import { detectAdapter, isClone, type ListState } from "./sliders";

/**
 * Theme-agnostic gallery detection.
 *
 * 1. Find every element in the product section that points at one of the
 *    product's media — by id attributes (data-media-id="section-123", ids,
 *    data-target…) or by image URL (file name match, incl. legacy _800x URLs).
 * 2. For each match, climb to the largest ancestor that contains only that
 *    one media: that's the gallery "item" (slide, <li>, thumbnail button…).
 * 3. Items sharing a parent form a list (main slider, thumbnails, zoom modal).
 *    Lists need at least two different media.
 */

const ID_ATTRS = [
  "data-media-id",
  "data-image-id",
  "data-media",
  "data-target",
  "data-slide-id",
  "data-thumbnail-id",
  "data-product-media-id",
  "data-media-item-id",
  "data-mediaid",
  "data-id",
  "data-image",
  "data-variant-image",
  "data-thumb-id",
  "data-index-id",
  "data-media-item-id",
  "data-mdid",
  "data-photoswipe-trigger-for",
  "data-photoswipe-id",
  "data-video-id",
  "aria-controls",
  "id",
];

const URL_ATTRS = [
  "src",
  "data-src",
  "data-original",
  "data-lazy",
  "data-lazy-src",
  "data-zoom",
  "data-zoom-src",
  "data-zoom-image",
  "data-large",
  "data-large-image",
  "data-full",
  "data-full-src",
  "data-image",
  "data-photoswipe-src",
  "data-pswp-src",
  "data-mfp-src",
  "data-master",
  "data-media-src",
  "data-image-src",
  "data-full-size",
  "data-zoom-url",
  "data-poster",
  "poster",
  "href",
];

const SRCSET_ATTRS = ["srcset", "data-srcset", "data-lazy-srcset", "data-bgset"];

const CANDIDATES = [
  ...ID_ATTRS.map((a) => `[${a}]`),
  "img",
  "picture source",
  "video",
  "model-viewer",
  "a[href]",
  "[data-src]",
  "[data-srcset]",
  "[data-bgset]",
  "[data-zoom]",
  "[data-zoom-image]",
  "[style*='background']",
  "[class*='media_id_']",
].join(",");

// Never treat the theme's own variant picker (its swatches often show variant
// images) or our own UI as a gallery.
const IGNORE_WITHIN = [
  "script",
  "template",
  "noscript",
  "style",
  "[data-pvi-ui]",
  "[data-pvi-native-hidden]",
  "label",
  "fieldset",
  "select",
  "option",
  "[role='radiogroup']",
  "[role='listbox']",
  "variant-selects",
  "variant-radios",
  "variant-picker",
  "variant-selection",
  "variant-swatch-king",
  ".product-form__input",
  ".variant-picker",
  ".product-options",
].join(",");

/** Items that are form controls (or wrap them) are picker parts, not gallery slides. */
function isControlItem(item: Element): boolean {
  if (item.matches("label, option, input, select, textarea")) return true;
  return !!item.querySelector("input[type='radio'], input[type='checkbox'], select");
}

function idFromText(value: string | null, product: SFProduct): number | null {
  if (!value) return null;
  const numbers = value.match(/\d{5,}/g);
  if (!numbers) return null;
  for (let i = numbers.length - 1; i >= 0; i--) {
    const n = Number(numbers[i]);
    if (product.mediaById.has(n)) return n;
    const viaImage = product.mediaByImageId.get(n);
    if (viaImage != null) return viaImage;
  }
  return null;
}

function idFromUrl(url: string | null, product: SFProduct): number | null {
  if (!url || url.startsWith("data:")) return null;
  for (const key of domImageKeys(url)) {
    const id = product.mediaByKey.get(key);
    if (id != null) return id;
  }
  return null;
}

/** Which product media (if any) an element refers to. */
export function mediaIdOf(el: Element, product: SFProduct): number | null {
  for (const attr of ID_ATTRS) {
    const id = idFromText(el.getAttribute(attr), product);
    if (id != null) return id;
  }
  for (const attr of URL_ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    if (attr === "href" && !/\.(jpe?g|png|gif|webp|avif)|\/cdn\/shop\/|cdn\.shopify\.com/i.test(value)) continue;
    const id = idFromUrl(value, product);
    if (id != null) return id;
  }
  for (const attr of SRCSET_ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    for (const url of srcsetUrls(value)) {
      const id = idFromUrl(url, product);
      if (id != null) return id;
    }
  }
  const cls = el.getAttribute("class");
  if (cls && cls.includes("media_id_")) {
    const id = idFromText(/media_id_(\d+)/.exec(cls)?.[1] ?? null, product);
    if (id != null) return id;
  }
  const style = el.getAttribute("style");
  if (style && style.includes("url(")) {
    const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(style);
    if (m) return idFromUrl(m[1], product);
  }
  return null;
}

// (No regex lookbehind: it crashes Safari < 16.4.)
const THUMB_HINT = /thumb|dots|pagination|(^|[-_\s])nav([-_\s]|$)|navigation/i;

function hintText(el: Element | null): string {
  if (!el) return "";
  // "product__images--no-thumbs" says there are no thumbnails.
  return `${typeof el.className === "string" ? el.className : ""} ${el.id} ${el.tagName}`.replace(/no-thumbs?/gi, "");
}

function averageWidth(items: Element[]): number {
  const widths = items.map((item) => item.getBoundingClientRect().width).filter((w) => w > 0);
  return widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;
}

/**
 * Mark thumbnail lists. Rendered sizes decide when available (thumbnails are
 * much smaller than the main gallery); otherwise class/tag hints on the list,
 * its wrapper and its items.
 */
function classifyThumbs(lists: ListState[]): void {
  const widths = lists.map((list) => averageWidth(list.items.filter((item) => item.isConnected)));
  const max = Math.max(0, ...widths);
  lists.forEach((list, i) => {
    if (max > 0 && widths[i] > 0) {
      list.thumbs = lists.length > 1 ? widths[i] < max * 0.5 || widths[i] < 110 : widths[i] < 110;
      return;
    }
    // A lone list is the gallery itself.
    if (lists.length === 1) {
      list.thumbs = false;
      return;
    }
    const first = list.items[0] ?? null;
    list.thumbs = [list.parent, first].some((el) => THUMB_HINT.test(hintText(el)));
  });
  // Never classify every list as thumbnails when one of them is clearly bigger/main-like.
  if (lists.length > 1 && lists.every((list) => list.thumbs)) {
    const biggest = widths.indexOf(max);
    if (max > 0 && biggest >= 0) lists[biggest].thumbs = false;
  }
}

export interface DetectOptions {
  /** Merchant-provided selector for items when auto-detection fails. */
  itemSelector?: string;
}

/** Detect gallery lists inside `scope`. Existing list state is reused by parent element. */
export function detectLists(
  scope: Element,
  product: SFProduct,
  previous: ListState[] = [],
  options: DetectOptions = {},
): ListState[] {
  const matches: { el: Element; id: number }[] = [];
  let customItems: Element[] = [];
  if (options.itemSelector) {
    try {
      customItems = Array.from(scope.querySelectorAll(options.itemSelector));
    } catch {
      customItems = [];
    }
  }

  const candidates = scope.querySelectorAll(CANDIDATES);
  for (const el of Array.from(candidates)) {
    if (el.closest(IGNORE_WITHIN)) continue;
    const id = mediaIdOf(el, product);
    if (id != null) matches.push({ el, id });
  }

  const itemMedia = new Map<Element, number>();
  if (customItems.length) {
    for (const item of customItems) {
      const id = mediaIdOf(item, product) ?? matches.find((m) => item.contains(m.el))?.id ?? null;
      if (id != null) itemMedia.set(item, id);
    }
  } else {
    // Media ids found beneath each ancestor.
    const under = new Map<Element, Set<number>>();
    for (const { el, id } of matches) {
      let node: Element | null = el;
      while (node) {
        let set = under.get(node);
        if (!set) under.set(node, (set = new Set()));
        if (set.has(id)) break;
        set.add(id);
        if (node === scope) break;
        node = node.parentElement;
      }
    }
    for (const { el, id } of matches) {
      let node = el;
      while (node.parentElement && node.parentElement !== scope && under.get(node.parentElement)?.size === 1) {
        node = node.parentElement;
      }
      if (node !== scope) itemMedia.set(node, id);
    }
  }

  // Group items by parent.
  const byParent = new Map<Element, Element[]>();
  for (const item of itemMedia.keys()) {
    const parent = item.parentElement;
    if (!parent) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(item);
  }

  const lists: ListState[] = [];
  const seenParents = new Set<Element>();
  for (const [parent, all] of byParent) {
    // Items that are (or wrap) picker controls are never hidden; the rest of the list still counts.
    const found = all.filter((item) => !isControlItem(item));
    if (!found.length) continue;
    const distinct = new Set(found.map((item) => itemMedia.get(item)));
    const old = previous.find((list) => list.parent === parent);
    if (distinct.size < 2 && !old) continue;
    seenParents.add(parent);
    // Keep items a slider adapter removed earlier (still ours, just detached).
    const merged: Element[] = [];
    const mergedMedia = new Map<Element, number>();
    if (old) {
      const keepDetached = !!old.adapter.keepsDetached;
      for (const item of old.items) {
        if (isControlItem(item)) continue;
        if (item.parentElement === parent || (keepDetached && !item.isConnected && !isClone(item))) {
          merged.push(item);
          mergedMedia.set(item, old.itemMedia.get(item)!);
        }
      }
    }
    for (const item of found) {
      if (!mergedMedia.has(item)) {
        merged.push(item);
        mergedMedia.set(item, itemMedia.get(item)!);
      }
    }
    // Keep DOM order for connected items; detached items stay where they were.
    const ordered = orderItems(parent, merged);
    lists.push({
      parent,
      items: ordered,
      itemMedia: mergedMedia,
      adapter: old?.adapter ?? detectAdapter(parent),
      thumbs: false,
      lastKey: old?.lastKey,
    });
  }
  // Lists whose parent vanished from the DOM are dropped.
  for (const old of previous) {
    if (!seenParents.has(old.parent) && old.parent.isConnected && old.adapter.keepsDetached && old.items.some((item) => !item.isConnected)) {
      lists.push(old);
    }
  }
  classifyThumbs(lists);
  return lists;
}

function orderItems(parent: Element, items: Element[]): Element[] {
  const connected = items.filter((item) => item.parentElement === parent);
  const children = Array.from(parent.children);
  connected.sort((a, b) => children.indexOf(a) - children.indexOf(b));
  const detached = items.filter((item) => item.parentElement !== parent);
  if (!detached.length) return connected;
  // Re-insert detached items at their previous relative positions.
  const result = [...connected];
  for (const item of detached) {
    const originalIndex = items.indexOf(item);
    result.splice(Math.min(originalIndex, result.length), 0, item);
  }
  return result;
}

export function applyVisibility(lists: ListState[], visibleIds: Set<number>): void {
  for (const list of lists) {
    const visible = new Set<Element>();
    for (const item of list.items) {
      if (visibleIds.has(list.itemMedia.get(item)!)) visible.add(item);
    }
    // Never blank a list.
    if (!visible.size) list.items.forEach((item) => visible.add(item));
    list.adapter.apply(list, visible);
  }
}

const ACTIVE_HINT =
  ".is-active,.active,.is-selected,.is-current,.selected,.swiper-slide-active,.slick-current,.flickity-cell.is-selected,[aria-current='true'],[aria-selected='true']";

function isActive(item: Element): boolean {
  return item.matches(ACTIVE_HINT) || !!item.querySelector(":scope > " + ACTIVE_HINT.split(",").join(",:scope > "));
}

/** Current active media of the main list, if the theme marks one. */
export function activeMediaId(lists: ListState[]): number | null {
  for (const list of lists) {
    if (list.thumbs) continue;
    const active = list.items.find((item) => item.isConnected && isActive(item));
    if (active) return list.itemMedia.get(active) ?? null;
  }
  return null;
}

/** Make `mediaId` the shown media: slider APIs first, then thumbnail clicks, then scrolling. */
export function activateMedia(lists: ListState[], mediaId: number): void {
  let handled = false;
  for (const list of lists) {
    if (list.thumbs) continue;
    const item = list.items.find((el) => list.itemMedia.get(el) === mediaId && el.isConnected);
    if (item && list.adapter.activate(list, item)) handled = true;
  }
  if (handled) return;
  // Classic "featured image + thumbnails" galleries: clicking a thumbnail swaps the main image.
  if (lists.some((list) => !list.thumbs)) return;
  for (const list of lists) {
    if (!list.thumbs) continue;
    const item = list.items.find((el) => list.itemMedia.get(el) === mediaId && el.isConnected);
    if (!item) continue;
    const clickable =
      (item.matches("button,a,[role='button'],[tabindex]") ? item : null) ||
      item.querySelector("button,a,[role='button'],[tabindex],img");
    if (clickable instanceof HTMLElement) {
      safeClick(clickable);
      return;
    }
  }
}

/** Click without letting an unhandled link navigate away (thumbnails are often <a href="big.jpg">). */
function safeClick(el: HTMLElement): void {
  const guard = (event: Event) => {
    if (event.target === el || el.contains(event.target as Node)) event.preventDefault();
  };
  window.addEventListener("click", guard);
  try {
    el.click();
  } finally {
    window.removeEventListener("click", guard);
  }
}
