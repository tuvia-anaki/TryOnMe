import { HIDDEN_ATTR, productImages } from "./patch";

/**
 * Themes that reveal product cards as they scroll into view (a class or inline style set by
 * their IntersectionObserver: Symmetry's "cc-animate-in", AOS's "aos-animate", Dawn's
 * "scroll-trigger"…) only watch the cards that were on the page when it loaded. A copy made
 * before its card was revealed would stay invisible. So when a copy scrolls into view, its
 * hidden parts take the state the theme's own card has by then, or else are simply shown.
 */

const sources = new Map<Element, Element>();
let observer: IntersectionObserver | null = null;

function isHidden(el: Element): boolean {
  const style = getComputedStyle(el);
  return style.visibility === "hidden" || Number(style.opacity) < 0.05;
}

/** Running transitions/animations (e.g. the theme fading the card in) finish on their own. */
function animating(el: Element): boolean {
  return typeof el.getAnimations === "function" && el.getAnimations().some((a) => a.playState === "running");
}

/** The card itself, its main photo and title, and everything in between (never hover photos). */
function contentChain(card: Element): Element[] {
  const chain = new Set<Element>([card]);
  const photo = productImages(card).find((img) => !img.closest(`[${HIDDEN_ATTR}]`)) ?? null;
  const title = card.querySelector("h2, h3, h4, [class*='title' i]");
  for (const start of [photo, title]) {
    for (let node: Element | null = start; node && node !== card; node = node.parentElement) chain.add(node);
  }
  return [...chain];
}

function pathTo(node: Element, root: Element): number[] | null {
  const path: number[] = [];
  for (let n: Element = node; n !== root; ) {
    const parent = n.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, n));
    n = parent;
  }
  return path;
}

function nodeAt(root: Element, path: number[]): Element | null {
  let node: Element | null = root;
  for (const index of path) node = node?.children[index] ?? null;
  return node;
}

function stillHidden(copy: Element): Element[] {
  return contentChain(copy).filter((el) => !el.hasAttribute(HIDDEN_ATTR) && isHidden(el) && !animating(el));
}

function reveal(copy: Element, source: Element): void {
  const hidden = stillHidden(copy);
  if (!hidden.length) return;
  for (const el of hidden) {
    // The same element in the theme's own card: once the theme revealed it, take its state.
    const path = pathTo(el, copy);
    const twin = path && source.isConnected ? nodeAt(source, path) : null;
    if (!twin || twin.tagName !== el.tagName || isHidden(twin)) continue;
    el.setAttribute("class", twin.getAttribute("class") ?? "");
    const style = twin.getAttribute("style");
    if (style === null) el.removeAttribute("style");
    else el.setAttribute("style", style);
  }
  // Nothing to take it from (or it didn't help): show it, after the theme's own reveal had its chance.
  window.setTimeout(() => {
    for (const el of stillHidden(copy)) {
      const style = (el as HTMLElement).style;
      style.setProperty("opacity", "1", "important");
      style.setProperty("visibility", "visible", "important");
      if (getComputedStyle(el).transform !== "none") style.setProperty("transform", "none", "important");
    }
  }, 500);
}

/** Watch a copied card; `source` is the theme's own card it was copied from. */
export function revealWhenVisible(copy: Element, source: Element): void {
  if (typeof IntersectionObserver !== "function") return;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer!.unobserve(entry.target);
        const source = sources.get(entry.target);
        sources.delete(entry.target);
        if (source) reveal(entry.target, source);
      }
    },
    { rootMargin: "0px 0px 100px 0px" },
  );
  sources.set(copy, source);
  observer.observe(copy);
}
