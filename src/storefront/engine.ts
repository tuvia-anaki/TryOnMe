import { findMoney, type MoneyPattern } from "../shared/money";
import { arrangeCards, productCards, type VariantCard, type VcProduct } from "../shared/split";
import { findGrids, loadProduct, mainScope, type Grid, type ThemeCard } from "./cards";
import type { PageContext } from "./context";
import { copyCard, DONE_ATTR, HIDDEN_ATTR, renderCard, type RenderContext } from "./patch";
import { revealWhenVisible } from "./reveal";

export interface RenderedCard {
  el: Element;
  card: VariantCard;
}

export type Decorator = (rendered: RenderedCard[], grid: Element) => void;

/** The theme section an element is in ("shopify-section-template--123__main"), or null. */
function sectionOf(el: Element): string | null {
  return el.closest("[id^='shopify-section-']")?.id ?? null;
}

/**
 * Where the main grid sits, so a grid the theme redraws (filters, sorting) or adds (infinite
 * scroll) is recognized, but not another list in the same section (a carousel in the filters
 * drawer): its section, and the path to it — ids, or tags with their first (base) class, since
 * themes append state classes ("is-loading", "grid--loaded") that come and go.
 */
function signatureOf(grid: Element): string {
  const path: string[] = [];
  for (let node: Element | null = grid; node && path.length < 4 && !node.id.startsWith("shopify-section-"); node = node.parentElement) {
    path.unshift(node.id ? `#${node.id}` : `${node.tagName.toLowerCase()}.${node.classList[0] ?? ""}`);
    if (node.id) break;
  }
  return `${sectionOf(grid) ?? ""}|${path.join(">")}`;
}

/**
 * A product card shows the product's title or a price. Promo tiles in the grid that link to a
 * product ("Polar Ignite — save up to 50%") show neither, and are left alone.
 */
function isProductCard(el: Element, product: VcProduct, money: MoneyPattern[]): boolean {
  const text = (el.textContent ?? "").replace(/\s+/g, " ");
  const title = product.title.replace(/\s+/g, " ").trim().toLowerCase();
  return (!!title && text.toLowerCase().includes(title)) || (money.length > 0 && !!findMoney(text, money));
}

/**
 * The template's own collection/search section is keyed "main", "product-grid",
 * "collection-products", "main-search"… Sections merchants add (product sliders,
 * featured collections) get other keys, and may hold more cards than the main grid.
 */
const MAIN_SECTION = /__(main|product[-_]?grid|collection|search)/i;

/**
 * Splits the product cards of every grid on the page and keeps doing it when
 * the theme replaces the grid (filters, sorting, its own infinite scroll).
 */
export class Engine {
  private readonly render: RenderContext;
  private readonly decorators: Decorator[] = [];
  private observer: MutationObserver | null = null;
  private busy = false;
  private again = false;
  /** Where the main grid sits (see signatureOf); undefined until it's found. */
  private mainGrid: string | undefined = undefined;
  private readonly mainGrids = new WeakSet<Element>();

  constructor(private readonly ctx: PageContext) {
    this.render = { settings: ctx.settings, effective: ctx.effective, money: ctx.money, texts: ctx.texts };
  }

  onRender(fn: Decorator): void {
    this.decorators.push(fn);
  }

  /**
   * The grids to split: every grid on the home page; on collection and search pages only the
   * main one. It's remembered, so later cards count only when they're in that grid (or the grid
   * the theme redraws for filters, sorting and infinite scroll), never other product lists
   * ("Recently viewed", recommendations, a carousel in the filters drawer).
   */
  grids(scope: Element = mainScope()): Grid[] {
    const { gridSelector, cardSelector } = this.ctx.settings.advanced;
    let grids = findGrids(scope, { cardSelector, processed: DONE_ATTR });
    if (gridSelector) grids = grids.filter((g) => g.parent.matches(gridSelector) || !!g.parent.closest(gridSelector));
    if (this.ctx.template.split(".")[0] === "index") return grids;
    if (this.mainGrid === undefined) {
      const main = grids.find((g) => MAIN_SECTION.test(sectionOf(g.parent) ?? "")) ?? grids[0];
      if (!main) return [];
      this.mainGrid = signatureOf(main.parent);
      this.mainGrids.add(main.parent);
      return [main];
    }
    return grids.filter((g) => {
      if (!this.mainGrids.has(g.parent) && signatureOf(g.parent) !== this.mainGrid) return false;
      this.mainGrids.add(g.parent);
      return true;
    });
  }

  async run(): Promise<void> {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.again = false;
        for (const grid of this.grids()) await this.processGrid(grid);
      } while (this.again);
    } finally {
      this.busy = false;
    }
  }

  /** Split the cards of one grid (also used for cards appended by "Load more"). */
  async processGrid(grid: Grid): Promise<RenderedCard[]> {
    const { effective } = this.ctx;
    const fresh = grid.cards.filter((c) => c.el.isConnected && !c.el.hasAttribute(DONE_ATTR));
    if (!fresh.length) return [];
    for (const c of fresh) c.el.setAttribute(DONE_ATTR, "");
    // A collection lists each product once, so a product with several cards is already shown
    // per variant (by the theme or another app): leave those as they are, never split twice.
    const count = new Map<string, number>();
    for (const c of grid.cards) count.set(c.handle, (count.get(c.handle) ?? 0) + 1);
    const cards = fresh.filter((c) => count.get(c.handle) === 1);
    const products = await Promise.all(cards.map((c) => loadProduct(c.handle, this.ctx.root)));

    const managed: { source: ThemeCard; product: VcProduct; cards: VariantCard[] }[] = [];
    cards.forEach((source, i) => {
      const product = products[i];
      if (!product || !isProductCard(source.el, product, this.ctx.money)) return;
      managed.push({
        source,
        product,
        cards: productCards(product, { split: effective.split, by: effective.by, hideSoldOut: effective.hideSoldOut, hideNoImage: effective.hideNoImage }),
      });
    });
    const order = arrangeCards(
      managed.map((m) => m.cards),
      { mix: effective.mix, soldOutLast: effective.soldOutLast, order: effective.order, hidden: effective.hidden },
    );
    const sourceOf = new Map<VariantCard, ThemeCard>();
    for (const m of managed) for (const card of m.cards) sourceOf.set(card, m.source);

    // The theme's own card becomes the product's first card; the others are copies of the
    // card as the theme drew it (taken before the first card is changed).
    const pristine = new Map<Element, Element>();
    for (const m of managed) if (m.cards.length > 1) pristine.set(m.source.el, m.source.el.cloneNode(true) as Element);
    const used = new Set<Element>();
    const rendered: RenderedCard[] = [];
    for (const card of order) {
      const source = sourceOf.get(card)!;
      const reuse = !used.has(source.el);
      used.add(source.el);
      const el = reuse ? source.el : copyCard(pristine.get(source.el) ?? source.el);
      rendered.push({ el: renderCard(el, card, this.render), card });
    }

    this.place(grid.parent, managed.map((m) => m.source.el), rendered);
    // Copies made before the theme revealed their card (reveal-on-scroll themes) must not stay invisible.
    for (const { el, card } of rendered) {
      const source = sourceOf.get(card)!.el;
      if (el !== source) revealWhenVisible(el, source);
    }
    // Products that are hidden entirely in this collection.
    for (const m of managed) if (!used.has(m.source.el)) m.source.el.setAttribute(HIDDEN_ATTR, "");
    for (const decorate of this.decorators) decorate(rendered, grid.parent);
    grid.parent.setAttribute("data-vc-grid", "");
    document.dispatchEvent(new CustomEvent("vc:render", { detail: { grid: grid.parent, cards: rendered.map((r) => ({ element: r.el, key: r.card.key, variantId: r.card.variant.id })) } }));
    return rendered;
  }

  /**
   * Put the cards in place. Without reordering, each product's cards take
   * its original slot (theme banners between cards stay put); with mixing or
   * a manual order they're laid out from the first card's slot.
   */
  private place(parent: Element, sources: Element[], rendered: RenderedCard[]): void {
    const e = this.ctx.effective;
    const reorders = e.mix || e.soldOutLast || e.order.length > 0;
    if (!reorders) {
      // Cards come product by product, and each product's first card is the theme's own.
      let previous: Element | null = null;
      for (const { el } of rendered) {
        if (!sources.includes(el)) previous?.after(el);
        previous = el;
      }
      return;
    }
    const first = sources.find((s) => s.parentElement === parent);
    if (!first) return;
    const marker = parent.ownerDocument.createComment("vc");
    parent.insertBefore(marker, first);
    for (const s of sources) s.remove();
    for (const { el } of rendered) parent.insertBefore(el, marker);
    marker.remove();
  }

  /** Split new cards when the theme swaps the grid (filters, sorting, pagination). */
  observe(): void {
    if (this.observer) return;
    let timer: number | undefined;
    this.observer = new MutationObserver((mutations) => {
      const added = mutations.some((m) => Array.from(m.addedNodes).some((n) => n instanceof Element && !n.hasAttribute(DONE_ATTR)));
      if (!added) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void this.run(), 120);
    });
    this.observer.observe(mainScope(), { childList: true, subtree: true });
  }
}
