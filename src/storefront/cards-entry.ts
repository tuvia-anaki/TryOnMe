import { isColorOptionName } from "../shared/product";
import type { AppSettings } from "../shared/settings";
import { readJson, readSettings } from "./data";
import { backgroundFor, radiusFor, visualFor } from "./swatch-style";

/**
 * Color swatches on product cards (collections, search, home page, product
 * recommendations). Product data comes from Shopify's own storefront
 * endpoint (/products/<handle>.js) — served by Shopify, free, cached.
 */

interface JsVariant {
  id: number;
  available: boolean;
  options?: string[];
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  featured_image?: { src: string } | null;
  featured_media?: { preview_image?: { src: string } } | null;
}

interface JsProduct {
  id: number;
  handle: string;
  url?: string;
  options: ({ name: string; position: number; values: string[] } | string)[];
  variants: JsVariant[];
}

const HOST_ATTR = "data-pvi-ui";
const EXCLUDE = "header, footer, nav, [role='navigation'], .header, .footer, cart-drawer, .cart-drawer, #CartDrawer, [id*='cart-drawer'], predictive-search, [data-pvi-ui]";
const cache = new Map<string, Promise<JsProduct | null>>();
let active = 0;
const queue: (() => void)[] = [];

function runLimited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      task()
        .then(resolve, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < 4) run();
    else queue.push(run);
  });
}

function root(): string {
  const r = (window as any).Shopify?.routes?.root;
  return typeof r === "string" && r ? r : "/";
}

function loadProduct(handle: string): Promise<JsProduct | null> {
  const key = `pvi:p:${handle}`;
  const cached = cache.get(handle);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Date.now() - parsed.t < 10 * 60 * 1000) return parsed.p as JsProduct;
      }
    } catch {
      /* storage unavailable */
    }
    return runLimited(async () => {
      const res = await fetch(`${root()}products/${encodeURIComponent(handle)}.js`, { credentials: "same-origin" });
      if (!res.ok) return null;
      const product = (await res.json()) as JsProduct;
      try {
        sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), p: product }));
      } catch {
        /* quota */
      }
      return product;
    }).catch(() => null);
  })();
  cache.set(handle, promise);
  return promise;
}

function handleFromHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const m = /\/products\/([^/?#]+)/.exec(url.pathname);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Product cards = largest ancestors that link to exactly one product. */
function findCards(scope: ParentNode, exclude: Element | null): Map<Element, string> {
  const links = Array.from(scope.querySelectorAll<HTMLAnchorElement>("a[href*='/products/']")).filter(
    (a) => !a.closest(EXCLUDE) && !(exclude && exclude.contains(a)),
  );
  const under = new Map<Element, Set<string>>();
  const matches: { el: Element; handle: string }[] = [];
  for (const link of links) {
    const handle = handleFromHref(link.getAttribute("href"));
    if (!handle) continue;
    matches.push({ el: link, handle });
    let node: Element | null = link;
    while (node && node !== document.body) {
      let set = under.get(node);
      if (!set) under.set(node, (set = new Set()));
      if (set.has(handle)) break;
      set.add(handle);
      node = node.parentElement;
    }
  }
  const cards = new Map<Element, string>();
  for (const { el, handle } of matches) {
    let node = el;
    while (node.parentElement && node.parentElement !== document.body && under.get(node.parentElement)?.size === 1) {
      node = node.parentElement;
    }
    // Only real grids: siblings that are cards for other products, and an image inside.
    const parent = node.parentElement;
    if (!parent || (under.get(parent)?.size ?? 0) < 2) continue;
    if (!node.querySelector("img")) continue;
    if (!cards.has(node)) cards.set(node, handle);
  }
  return cards;
}

function colorOptionIndex(product: JsProduct): number {
  return product.options.findIndex((o) => isColorOptionName(typeof o === "string" ? o : o.name));
}

function optionValues(product: JsProduct, index: number): string[] {
  const option = product.options[index];
  if (option && typeof option !== "string" && Array.isArray(option.values)) return option.values;
  const values: string[] = [];
  for (const v of product.variants) {
    const name = v.options?.[index] ?? (v as any)[`option${index + 1}`];
    if (name != null && !values.includes(name)) values.push(name);
  }
  return values;
}

function variantImage(v: JsVariant | undefined): string | null {
  return v?.featured_image?.src ?? v?.featured_media?.preview_image?.src ?? null;
}

function sized(src: string, width: number): string {
  const url = src.startsWith("//") ? `https:${src}` : src;
  return url + (url.includes("?") ? "&" : "?") + `width=${width}`;
}

function mainImage(card: Element): HTMLImageElement | null {
  const imgs = Array.from(card.querySelectorAll<HTMLImageElement>("img")).filter((img) => !img.closest(`[${HOST_ATTR}]`));
  let best: HTMLImageElement | null = null;
  let bestArea = -1;
  for (const img of imgs) {
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = img;
    }
  }
  return best;
}

function insertionPoint(card: Element): { parent: Element; before: Element | null } {
  const price = card.querySelector("[class*='price']:not([class*='price__'] *), .price, product-price");
  let anchor: Element = price ?? card.querySelector("h2, h3, h4, [class*='title'], [class*='heading']") ?? card.lastElementChild ?? card;
  // Never inside a link (clicks would navigate).
  const link = anchor.closest("a");
  if (link && card.contains(link)) anchor = link;
  if (anchor === card) return { parent: card, before: null };
  return { parent: anchor.parentElement ?? card, before: anchor.nextSibling as Element | null };
}

const CARD_CSS = `
:host{display:block;position:relative;z-index:3;margin:.5rem 0 0}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:var(--pvi-align,flex-start)}
.sw{all:unset;box-sizing:border-box;cursor:pointer;width:var(--pvi-size,20px);height:var(--pvi-size,20px);border-radius:var(--pvi-radius,50%);padding:2px;border:1.5px solid transparent;display:inline-flex}
.sw span{display:block;width:100%;height:100%;border-radius:inherit;background-size:cover;background-position:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.sw[aria-pressed=true],.sw:hover{border-color:currentColor}
.sw:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.sw.sold span{opacity:.45}
.more{font-size:12px;line-height:1;color:inherit;text-decoration:none;opacity:.8}
.more:hover{text-decoration:underline}
`;

function renderCard(card: Element, product: JsProduct, settings: AppSettings): void {
  if (card.querySelector(`[${HOST_ATTR}='card']`)) return;
  const index = colorOptionIndex(product);
  if (index < 0) return;
  const values = optionValues(product, index);
  if (values.length < 2) return;
  const img = mainImage(card);
  const links = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href*='/products/']"));
  // Snapshot the card image when a swatch first takes it over (not at render
  // time: lazy-loaded images may still be placeholders then).
  let original: { src: string | null; srcset: string | null; sizes: string | null } | null = null;
  const originalHrefs = links.map((a) => a.getAttribute("href") ?? "");
  const productUrl = product.url || `${root()}products/${product.handle}`;

  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "card");
  const c = settings.cards;
  host.setAttribute(
    "style",
    `--pvi-size:${c.size}px;--pvi-radius:${radiusFor(c.shape, c.size)};--pvi-align:${c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start"}`,
  );
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CARD_CSS;
  const row = document.createElement("div");
  row.className = "row";
  shadow.append(style, row);

  const show = (variant: JsVariant | undefined) => {
    const src = variantImage(variant);
    if (img && src) {
      if (!original) original = { src: img.getAttribute("src"), srcset: img.getAttribute("srcset"), sizes: img.getAttribute("sizes") };
      img.setAttribute("src", sized(src, 720));
      img.setAttribute("srcset", [360, 533, 720, 940, 1066].map((w) => `${sized(src, w)} ${w}w`).join(", "));
      if (!img.getAttribute("sizes") || img.getAttribute("sizes") === "auto") img.setAttribute("sizes", `${Math.round(img.getBoundingClientRect().width) || 360}px`);
      img.removeAttribute("loading");
    }
  };
  const restore = () => {
    if (!img || !original) return;
    if (original.src != null) img.setAttribute("src", original.src);
    if (original.srcset != null) img.setAttribute("srcset", original.srcset);
    else img.removeAttribute("srcset");
    if (original.sizes != null) img.setAttribute("sizes", original.sizes);
    original = null;
  };
  const setLinks = (variant: JsVariant | undefined) => {
    links.forEach((a, i) => {
      if (!variant) a.setAttribute("href", originalHrefs[i]);
      else {
        const url = new URL(originalHrefs[i] || productUrl, window.location.origin);
        url.searchParams.set("variant", String(variant.id));
        a.setAttribute("href", url.pathname + url.search);
      }
    });
  };

  let pinned: HTMLButtonElement | null = null;
  const visibleValues = values.slice(0, c.max);
  for (const value of visibleValues) {
    const variants = product.variants.filter((v) => (v.options?.[index] ?? (v as any)[`option${index + 1}`]) === value);
    const variant = variants.find((v) => v.available) ?? variants[0];
    const visual = visualFor({ name: value, variantImage: variantImage(variant) ? sized(variantImage(variant)!, 80) : null }, settings);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sw${variants.some((v) => v.available) ? "" : " sold"}`;
    button.setAttribute("aria-label", value);
    button.setAttribute("aria-pressed", "false");
    button.title = value;
    const fill = document.createElement("span");
    if (visual.kind === "image" && visual.image) fill.style.backgroundImage = `url("${visual.image.replace(/"/g, "%22")}")`;
    else fill.style.background = visual.background ?? backgroundFor(["#ccc"]);
    button.appendChild(fill);
    if (c.trigger === "hover") {
      button.addEventListener("mouseenter", () => show(variant));
      button.addEventListener("focus", () => show(variant));
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (variant) window.location.href = `${productUrl}?variant=${variant.id}`;
      });
    } else {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pinned) pinned.setAttribute("aria-pressed", "false");
        pinned = button;
        button.setAttribute("aria-pressed", "true");
        show(variant);
        setLinks(variant);
      });
    }
    row.appendChild(button);
  }
  if (c.trigger === "hover") row.addEventListener("mouseleave", restore);
  if (values.length > visibleValues.length) {
    const more = document.createElement("a");
    more.className = "more";
    more.href = productUrl;
    more.textContent = `+${values.length - visibleValues.length}`;
    row.appendChild(more);
  }
  const { parent, before } = insertionPoint(card);
  parent.insertBefore(host, before);
}

function start(): void {
  const settings = readSettings();
  if (!settings.cards.enabled) return;
  const productScope = readJson<{ id: number }>("pvi-product") ? document.querySelector("[data-pvi-product-scope]") : null;
  const seen = new WeakSet<Element>();

  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              io!.unobserve(entry.target);
              const handle = (entry.target as HTMLElement).dataset.pviHandle;
              if (!handle) continue;
              loadProduct(handle).then((product) => {
                if (product && entry.target.isConnected) renderCard(entry.target, product, settings);
              });
            }
          },
          { rootMargin: "300px 0px" },
        )
      : null;

  const scan = () => {
    const cards = findCards(document, productScope);
    for (const [card, handle] of cards) {
      if (seen.has(card)) continue;
      seen.add(card);
      (card as HTMLElement).dataset.pviHandle = handle;
      if (io) io.observe(card);
      else loadProduct(handle).then((product) => product && renderCard(card, product, settings));
    }
  };
  scan();
  // Infinite scroll, filters and "load more" add cards later.
  let timer = 0;
  new MutationObserver((records) => {
    if (!records.some((r) => Array.from(r.addedNodes).some((n) => n.nodeType === 1 && !(n as Element).hasAttribute?.(HOST_ATTR)))) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(scan, 150);
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
