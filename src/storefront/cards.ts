import { fromAjaxProduct, type AjaxProduct, type VcProduct } from "../shared/split";

/**
 * Finding product cards in any theme without per-theme code: a card is the
 * largest element that links to exactly one product, and cards sharing a
 * parent form a grid. Product data comes from Shopify's storefront endpoint
 * /products/<handle>.js (served and cached by Shopify, prices in the
 * shopper's currency).
 */

export const UI_ATTR = "data-vc-ui";
/** Never product grids: navigation, cart drawers, search popups, the app's own sections. */
const EXCLUDE =
  "header, footer, nav, [role='navigation'], .header, .footer, cart-drawer, .cart-drawer, #CartDrawer, [id*='cart-drawer'], [id*='CartDrawer'], predictive-search, .predictive-search, [data-vc-section], [data-vc-ui], dialog, [role='dialog']";

export interface ThemeCard {
  el: Element;
  handle: string;
}

export interface Grid {
  parent: Element;
  cards: ThemeCard[];
}

export function handleFromHref(href: string | null, origin = window.location.origin): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    // /products/<handle>, optionally under a market/language prefix or a collection; never CDN files.
    const m = /^(?:\/[a-z]{2}(?:-[a-z0-9]{2,4})?)?(?:\/collections\/[^/]+)?\/products\/([^/.]+)\/?$/i.exec(url.pathname);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function productLinks(scope: ParentNode): { el: Element; handle: string }[] {
  const out: { el: Element; handle: string }[] = [];
  for (const a of Array.from(scope.querySelectorAll<HTMLAnchorElement>("a[href*='/products/']"))) {
    if (a.closest(EXCLUDE)) continue;
    const handle = handleFromHref(a.getAttribute("href"));
    if (handle) out.push({ el: a, handle });
  }
  return out;
}

/** Cards grouped into grids (parents with 2+ cards), largest grid first. */
export function findGrids(scope: Element, options: { cardSelector?: string; processed?: string } = {}): Grid[] {
  const cards: ThemeCard[] = [];
  if (options.cardSelector) {
    for (const el of Array.from(scope.querySelectorAll(options.cardSelector))) {
      if (el.closest(EXCLUDE)) continue;
      const link = productLinks(el)[0];
      if (link) cards.push({ el, handle: link.handle });
    }
  } else {
    const links = productLinks(scope);
    // For every element: the product handles linked from inside it.
    const under = new Map<Element, Set<string>>();
    for (const { el, handle } of links) {
      let node: Element | null = el;
      while (node && node !== scope.parentElement) {
        let set = under.get(node);
        if (!set) under.set(node, (set = new Set()));
        if (set.has(handle)) break;
        set.add(handle);
        node = node.parentElement;
      }
    }
    const seen = new Set<Element>();
    for (const { el, handle } of links) {
      let node = el;
      while (node.parentElement && node.parentElement !== scope && under.get(node.parentElement)?.size === 1) node = node.parentElement;
      if (seen.has(node)) continue;
      seen.add(node);
      const parent = node.parentElement;
      if (!parent || (under.get(parent)?.size ?? 0) < 2) continue;
      // Real product cards show an image (or will, once lazy loading kicks in).
      if (!node.querySelector("img, picture, [data-src], [data-bgset], [style*='background-image']")) continue;
      cards.push({ el: node, handle });
    }
  }
  const byParent = new Map<Element, ThemeCard[]>();
  for (const card of cards) {
    if (options.processed && card.el.hasAttribute(options.processed)) continue;
    const parent = card.el.parentElement;
    if (!parent) continue;
    const list = byParent.get(parent);
    if (list) list.push(card);
    else byParent.set(parent, [card]);
  }
  return [...byParent]
    .filter(([, list]) => list.length >= 2 || options.cardSelector)
    .map(([parent, list]) => ({ parent, cards: list }))
    .sort((a, b) => b.cards.length - a.cards.length);
}

/** Where to look for product grids: the page's main content. */
export function mainScope(doc: Document = document): Element {
  return doc.querySelector("main, #MainContent, #main, [role='main']") ?? doc.body;
}

/* ------------------------------------------------------------------ */
/* Product data                                                        */
/* ------------------------------------------------------------------ */

const memory = new Map<string, Promise<VcProduct | null>>();

/** Tests and theme previews switch stores. */
export function clearProductCache(): void {
  memory.clear();
}
const MAX_AGE = 10 * 60 * 1000;
let active = 0;
const waiting: (() => void)[] = [];

function limited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      task()
        .then(resolve, reject)
        .finally(() => {
          active--;
          waiting.shift()?.();
        });
    };
    if (active < 6) run();
    else waiting.push(run);
  });
}

export function loadProduct(handle: string, root: string): Promise<VcProduct | null> {
  const cached = memory.get(handle);
  if (cached) return cached;
  const key = `vc:p:${root}${handle}`;
  const promise = (async () => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Date.now() - parsed.t < MAX_AGE) return fromAjaxProduct(parsed.p as AjaxProduct);
      }
    } catch {
      /* storage unavailable */
    }
    return limited(async () => {
      const res = await fetch(`${root}products/${encodeURIComponent(handle)}.js`, { credentials: "same-origin" });
      if (!res.ok) return null;
      const raw = (await res.json()) as AjaxProduct;
      try {
        sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), p: raw }));
      } catch {
        /* quota full */
      }
      return fromAjaxProduct(raw);
    }).catch(() => null);
  })();
  memory.set(handle, promise);
  return promise;
}
