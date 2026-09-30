import { findMoney, formatMoney, type MoneyPattern } from "../shared/money";
import type { AppSettings, EffectiveSettings, Texts } from "../shared/settings";
import { formatTitle, type VariantCard } from "../shared/split";
import { handleFromHref, UI_ATTR } from "./cards";

/**
 * Turning a theme's product card into a variant card: the card is copied
 * (the theme's own design and components) and its link, image, title, price,
 * add-to-cart form and badges are pointed at the variant.
 */

export const DONE_ATTR = "data-vc-done";
export const HIDDEN_ATTR = "data-vc-hidden";

export interface RenderContext {
  settings: AppSettings;
  effective: EffectiveSettings;
  money: MoneyPattern[];
  texts: Texts;
}

const SKIP_TEXT = `script, style, template, noscript, [${UI_ATTR}]`;
const PRICE_SCOPE = "[class*='price' i], .money, product-price, [data-price], [data-product-price]";
const UNIT_PRICE = "[class*='unit' i]";
const COMPARE = "s, del, strike, [class*='compare' i], [class*='was-price' i], [class*='price--was' i], [class*='original-price' i], [class*='old-price' i], [class*='price-old' i]";
const THEME_SWATCHES = "swatches-component, variant-swatches, color-swatches, [class*='swatch' i], [class*='color-option' i], [class*='colour-option' i]";
const SALE_BADGES = "[class*='badge' i][class*='sale' i], [class*='sale-badge' i], [class*='badge--sale' i], [class*='badge' i][class*='discount' i], [class*='badge' i][class*='save' i], [class*='on-sale' i][class*='badge' i]";

let copies = 0;

/** The closest ancestor matching `selector` inside the card (the card's own classes don't count). */
function within(node: Element, selector: string, card: Element): Element | null {
  const match = node.closest(selector);
  return match && match !== card && card.contains(match) ? match : null;
}

/* ------------------------------------------------------------------ */
/* Copying                                                             */
/* ------------------------------------------------------------------ */

const ID_REFS = ["for", "form", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "list", "headers", "data-target", "data-bs-target"];

/** Copies need their own ids, and references to those ids must follow. */
function uniquifyIds(root: Element, suffix: string): void {
  const ids = new Map<string, string>();
  for (const el of [root, ...Array.from(root.querySelectorAll("[id]"))]) {
    const id = el.getAttribute("id");
    if (!id) continue;
    ids.set(id, `${id}${suffix}`);
    el.setAttribute("id", `${id}${suffix}`);
  }
  if (!ids.size) return;
  const map = (token: string) => {
    const hash = token.startsWith("#");
    const next = ids.get(hash ? token.slice(1) : token);
    return next ? `${hash ? "#" : ""}${next}` : token;
  };
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of ID_REFS) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const next = value.split(/\s+/).map(map).join(" ");
      if (next !== value) el.setAttribute(attr, next);
    }
    const href = el.getAttribute("href");
    if (href?.startsWith("#") && ids.has(href.slice(1))) el.setAttribute("href", map(href));
  }
}

export function copyCard(source: Element): Element {
  const copy = source.cloneNode(true) as Element;
  uniquifyIds(copy, `-vc${++copies}`);
  // Our own additions are rebuilt for every card.
  for (const ui of Array.from(copy.querySelectorAll(`[${UI_ATTR}]`))) ui.remove();
  return copy;
}

/* ------------------------------------------------------------------ */
/* Links, forms, title                                                 */
/* ------------------------------------------------------------------ */

export function withVariant(href: string, variantId: number): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("variant", String(variantId));
    return /^(https?:)?\/\//i.test(href) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

/** Point every link to the product in a card at one of its variants. */
export function linkCardTo(el: Element, handle: string, variantId: number): void {
  const update = (node: Element, attr: string) => {
    const value = node.getAttribute(attr);
    if (value && handleFromHref(value) === handle) node.setAttribute(attr, withVariant(value, variantId));
  };
  for (const a of Array.from(el.querySelectorAll("a[href]"))) update(a, "href");
  if (el.matches("a[href]")) update(el, "href");
  for (const attr of ["data-url", "data-product-url", "data-href", "data-product-link"]) {
    for (const node of Array.from(el.querySelectorAll(`[${attr}]`))) update(node, attr);
  }
}

function patchLinks(el: Element, card: VariantCard): void {
  linkCardTo(el, card.product.handle, card.variant.id);
}

function patchForms(el: Element, card: VariantCard): void {
  const id = String(card.variant.id);
  for (const input of Array.from(el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name='id'], select[name='id']"))) {
    if (input instanceof HTMLSelectElement && !Array.from(input.options).some((o) => o.value === id)) continue;
    input.value = id;
    input.setAttribute("value", id);
  }
  for (const node of Array.from(el.querySelectorAll("[data-variant-id]"))) node.setAttribute("data-variant-id", id);
  // Sold-out variants can't be added.
  if (!card.variant.available) {
    for (const button of Array.from(el.querySelectorAll<HTMLButtonElement>("button[type='submit'][name='add'], button[name='add']"))) button.disabled = true;
  }
}

function patchTitle(el: Element, card: VariantCard, template: string): void {
  const original = card.product.title.trim();
  const title = formatTitle(template, card);
  if (!original || title === original) return;
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.data.trim() === original && !node.parentElement?.closest(SKIP_TEXT)) nodes.push(node);
  }
  for (const node of nodes) node.data = node.data.replace(original, title);
  for (const attr of ["aria-label", "alt", "title", "data-product-title", "data-title"]) {
    for (const node of [el, ...Array.from(el.querySelectorAll(`[${attr}]`))]) {
      if (node.getAttribute(attr)?.trim() === original) node.setAttribute(attr, title);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

export function sizedImage(src: string, width: number): string {
  const url = src.startsWith("//") ? `https:${src}` : src;
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

function srcsetWidths(srcset: string | null): number[] {
  if (!srcset) return [];
  return srcset
    .split(",")
    .map((part) => /\s(\d+)w\s*$/.exec(part.trim())?.[1])
    .filter((w): w is string => !!w)
    .map(Number);
}

function widthOf(src: string | null): number | null {
  if (!src) return null;
  const param = /[?&]width=(\d+)/.exec(src)?.[1] ?? /_(\d+)x(\d*)?(?:@\dx)?\.\w+(?:\?|$)/.exec(src)?.[1];
  return param ? Number(param) : null;
}

export function swapImage(img: HTMLImageElement, src: string): void {
  const widths = [...new Set([...srcsetWidths(img.getAttribute("srcset")), ...srcsetWidths(img.getAttribute("data-srcset"))])];
  const main = widthOf(img.getAttribute("src")) ?? widthOf(img.getAttribute("data-src")) ?? (widths.length ? Math.max(...widths) : 800);
  const srcset = (widths.length ? widths : [360, 540, 720, 900, 1080]).map((w) => `${sizedImage(src, w)} ${w}w`).join(", ");
  img.setAttribute("src", sizedImage(src, main));
  if (img.hasAttribute("srcset") || !img.hasAttribute("data-srcset")) img.setAttribute("srcset", srcset);
  if (img.hasAttribute("data-src")) img.setAttribute("data-src", sizedImage(src, main));
  if (img.hasAttribute("data-srcset")) img.setAttribute("data-srcset", srcset);
  const picture = img.parentElement?.tagName === "PICTURE" ? img.parentElement : null;
  if (picture) {
    for (const source of Array.from(picture.querySelectorAll("source"))) {
      const w = srcsetWidths(source.getAttribute("srcset"));
      source.setAttribute("srcset", (w.length ? w : [720]).map((x) => `${sizedImage(src, x)} ${x}w`).join(", "));
    }
  }
}

/**
 * Images that aren't the product photo: swatches, badges, icons… A gallery is never one of
 * them, even with a "badge" modifier (Horizon themes: "card-gallery--badge-top-left").
 */
const GALLERY = ":not([class*='gallery' i]):not([class*='media' i])";
const NOT_PRODUCT_IMAGE = `[class*='swatch' i], [class*='badge' i]${GALLERY}, [class*='icon' i]${GALLERY}, [class*='logo' i], [class*='vendor' i], [class*='rating' i], [${UI_ATTR}]`;

export function productImages(el: Element): HTMLImageElement[] {
  return Array.from(el.querySelectorAll<HTMLImageElement>("img")).filter((img) => !within(img, NOT_PRODUCT_IMAGE, el));
}

function patchImages(el: Element, card: VariantCard, settings: AppSettings): void {
  if (!card.ownImage || !card.image) return;
  // Themes that render every product image with its media id (sliders): show the variant's first.
  if (card.mediaId) {
    const id = card.mediaId;
    const target = Array.from(el.querySelectorAll(`[slide-id="${id}"], [data-media-id="${id}"], [data-image-id="${id}"], [data-media="${id}"]`)).find(
      (node) => !within(node, NOT_PRODUCT_IMAGE, el) && (node.matches("img, picture") || !!node.querySelector("img, picture")),
    );
    if (target) {
      let slide: Element = target;
      while (slide.parentElement && slide.parentElement !== el && slide.parentElement.children.length < 2) slide = slide.parentElement;
      const container = slide.parentElement;
      // A slider: siblings that also hold product images.
      const slider = container && container !== el && Array.from(container.children).filter((child) => child.querySelector("img, picture") || child.matches("img, picture")).length > 1;
      if (container && slider) {
        container.prepend(slide);
        const siblings = Array.from(container.children).filter((child) => child !== slide);
        if (!settings.card.secondImage) for (const other of siblings) other.remove();
        else for (const other of siblings) other.setAttribute("aria-hidden", "true");
        // Themes keep the variant images they don't show hidden until that variant is picked
        // (Shopify's Horizon themes: <slideshow-slide variant-image hidden>). This card shows it.
        for (let node: Element | null = target; node && node !== container; node = node.parentElement) node.removeAttribute("hidden");
        slide.removeAttribute("aria-hidden");
        for (const img of Array.from(slide.querySelectorAll("img"))) img.setAttribute("loading", "eager");
        return;
      }
    }
  }
  const images = productImages(el);
  const main = images[0];
  if (!main) return;
  swapImage(main, card.image);
  // The theme's hover image would show another variant.
  let group: Element | null = main.parentElement;
  while (group && group !== el && productImages(group).length < 2) group = group.parentElement;
  if (group) {
    for (const other of productImages(group)) {
      if (other === main) continue;
      if (settings.card.secondImage) continue;
      other.setAttribute(HIDDEN_ATTR, "");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

interface MoneyNode {
  node: Text;
  pattern: MoneyPattern;
  compare: boolean;
}

function moneyNodes(el: Element, patterns: MoneyPattern[]): MoneyNode[] {
  if (!patterns.length) return [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: MoneyNode[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || !/\d/.test(node.data) || parent.closest(SKIP_TEXT) || within(parent, UNIT_PRICE, el)) continue;
    const inPrice = !!within(parent, PRICE_SCOPE, el) || parent === el;
    const match = findMoney(node.data, patterns, inPrice);
    if (!match) continue;
    out.push({ node, pattern: match.pattern, compare: !!within(parent, COMPARE, el) });
  }
  return out;
}

function priceText(card: VariantCard, pattern: MoneyPattern, ctx: RenderContext): string | null {
  const f = (cents: number) => formatMoney(pattern, cents);
  const varies = card.minPrice !== card.maxPrice;
  if (!card.split) {
    if (!varies || ctx.effective.price === "theme") return null;
  } else if (!varies) {
    return f(card.variant.price);
  }
  if (ctx.effective.price === "range") return `${f(card.minPrice)} – ${f(card.maxPrice)}`;
  const from = ctx.texts.from || "From {price}";
  return from.includes("{price}") ? from.replace("{price}", f(card.minPrice)) : `${from} ${f(card.minPrice)}`;
}

function setSaleState(el: Element, onSale: boolean): void {
  for (const node of Array.from(el.querySelectorAll("[class*='price--on-sale'], .price"))) {
    if (!(node instanceof HTMLElement) || node.closest(`[${UI_ATTR}]`)) continue;
    if (onSale && node.classList.contains("price")) node.classList.add("price--on-sale");
    if (!onSale) node.classList.remove("price--on-sale");
  }
  for (const badge of Array.from(el.querySelectorAll(SALE_BADGES))) {
    if (badge.closest(`[${UI_ATTR}]`)) continue;
    if (onSale) badge.removeAttribute(HIDDEN_ATTR);
    else badge.setAttribute(HIDDEN_ATTR, "");
  }
}

function patchPrice(el: Element, card: VariantCard, ctx: RenderContext): void {
  const nodes = moneyNodes(el, ctx.money);
  if (!nodes.length) return;
  for (const { node, pattern, compare } of nodes) {
    if (compare) continue;
    const text = priceText(card, pattern, ctx);
    if (text !== null) node.data = node.data.match(/^\s*/)![0] + text + node.data.match(/\s*$/)![0];
  }
  if (!card.split) return;
  const compareAt = card.minPrice === card.maxPrice ? card.variant.compareAtPrice : null;
  for (const { node, pattern, compare } of nodes) {
    if (!compare) continue;
    const holder = within(node.parentElement!, COMPARE, el) ?? node.parentElement!;
    if (compareAt) {
      node.data = formatMoney(pattern, compareAt);
      holder.removeAttribute(HIDDEN_ATTR);
    } else {
      holder.setAttribute(HIDDEN_ATTR, "");
    }
  }
  setSaleState(el, !!compareAt);
}

/* ------------------------------------------------------------------ */
/* Badges and swatches                                                 */
/* ------------------------------------------------------------------ */

/** Where extra lines go in a card: after the price (never inside a link). */
export function insertionPoint(el: Element): { parent: Element; before: Node | null } {
  const price = Array.from(el.querySelectorAll(PRICE_SCOPE)).find((node) => !node.closest(`[${UI_ATTR}]`) && !node.closest(COMPARE));
  let anchor: Element = price ?? el.querySelector("h2, h3, h4, [class*='title' i], [class*='heading' i]") ?? el.lastElementChild ?? el;
  // The outermost price wrapper, so the line doesn't end up inside the price layout.
  while (anchor.parentElement && anchor.parentElement !== el && anchor.parentElement.matches(PRICE_SCOPE)) anchor = anchor.parentElement;
  const link = anchor.closest("a");
  if (link && el.contains(link) && link !== el) anchor = link;
  if (anchor === el) return { parent: el, before: null };
  return { parent: anchor.parentElement ?? el, before: anchor.nextSibling };
}

function addBadge(el: Element, text: string): void {
  const badge = el.ownerDocument.createElement("span");
  badge.setAttribute(UI_ATTR, "badge");
  badge.className = "vc-badge";
  badge.textContent = text;
  const { parent, before } = insertionPoint(el);
  parent.insertBefore(badge, before);
}

function hideThemeSwatches(el: Element): void {
  for (const node of Array.from(el.querySelectorAll(THEME_SWATCHES))) {
    if (node.closest(`[${UI_ATTR}]`) || node.parentElement?.closest(THEME_SWATCHES)) continue;
    // Never the card's own image or title.
    if (node.querySelector("h2, h3, h4, [class*='title' i]") || productImages(node).length > 2) continue;
    node.setAttribute(HIDDEN_ATTR, "");
  }
}

/* ------------------------------------------------------------------ */
/* Putting it together                                                 */
/* ------------------------------------------------------------------ */

/** Turn `el` (the theme card, or a copy of it) into the card for `card`. */
export function renderCard(el: Element, card: VariantCard, ctx: RenderContext): Element {
  el.setAttribute(DONE_ATTR, "");
  el.setAttribute("data-vc-card", card.key);
  if (card.split) {
    patchLinks(el, card);
    patchImages(el, card, ctx.settings);
    patchTitle(el, card, ctx.effective.title);
    patchForms(el, card);
    if (ctx.settings.card.hideThemeSwatches) hideThemeSwatches(el);
  }
  patchPrice(el, card, ctx);
  if (card.split && !card.available && ctx.settings.card.soldOutBadge) addBadge(el, ctx.texts.soldOut || "Sold out");
  return el;
}
