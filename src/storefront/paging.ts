import { findGrids, mainScope, UI_ATTR } from "./cards";
import type { PageContext } from "./context";
import type { Engine } from "./engine";
import { HIDDEN_ATTR } from "./patch";

/**
 * "Load more" and infinite scroll: the next page is fetched like a shopper
 * would open it, and its cards are appended to the grid (then split).
 */

const PAGINATION = "[class*='pagination' i], [data-pagination], nav[aria-label*='pag' i], .paginate, [class*='load-more' i]";

function currentPage(url: URL): number {
  return Number(url.searchParams.get("page") ?? "1") || 1;
}

/** The next page's URL from a document's pagination links. */
export function nextPageUrl(doc: Document, from: URL): string | null {
  const scope = mainScope(doc);
  const rel = scope.querySelector<HTMLAnchorElement>("a[rel='next']") ?? doc.querySelector<HTMLLinkElement>("link[rel='next']");
  if (rel?.getAttribute("href")) return new URL(rel.getAttribute("href")!, from).toString();
  const want = currentPage(from) + 1;
  for (const a of Array.from(scope.querySelectorAll<HTMLAnchorElement>("a[href*='page=']"))) {
    try {
      const url = new URL(a.getAttribute("href")!, from);
      if (url.pathname === from.pathname && currentPage(url) === want) return url.toString();
    } catch {
      /* not a URL */
    }
  }
  return null;
}

function paginationAfter(grid: Element): Element | null {
  const scope = mainScope();
  return (
    Array.from(scope.querySelectorAll(PAGINATION)).find(
      (el) => !el.closest(`[${UI_ATTR}]`) && !grid.contains(el) && !!(grid.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !!el.querySelector("a[href*='page=']"),
    ) ?? null
  );
}

export function setupPaging(ctx: PageContext, engine: Engine): void {
  const mode = ctx.settings.paging.mode;
  const type = ctx.template.split(".")[0];
  if (mode === "theme" || (type !== "collection" && type !== "search")) return;
  const grid = document.querySelector("[data-vc-grid]") ?? engine.grids()[0]?.parent;
  if (!grid) return;
  let next = nextPageUrl(document, new URL(window.location.href));
  if (!next) return;
  const pagination = paginationAfter(grid);
  pagination?.setAttribute(HIDDEN_ATTR, "");

  const wrap = document.createElement("div");
  wrap.className = "vc-more";
  wrap.setAttribute(UI_ATTR, "paging");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = ctx.texts.loadMore || "Load more";
  wrap.append(button);
  (pagination ?? grid).after(wrap);

  let loading = false;
  const load = async () => {
    if (loading || !next) return;
    loading = true;
    button.disabled = true;
    button.textContent = ctx.texts.loading || "Loading…";
    try {
      const res = await fetch(next, { credentials: "same-origin" });
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const from = new URL(next);
      const incoming = findGrids(mainScope(doc))[0];
      if (incoming) {
        const cards = incoming.cards.map((c) => ({ el: document.importNode(c.el, true), handle: c.handle }));
        const last = Array.from(grid.children).filter((child) => child.hasAttribute("data-vc-card") || child.hasAttribute("data-vc-done")).pop();
        let anchor: Element | null = last ?? null;
        for (const c of cards) {
          if (anchor) anchor.after(c.el);
          else grid.append(c.el);
          anchor = c.el;
        }
        await engine.processGrid({ parent: grid, cards });
      }
      next = nextPageUrl(doc, from);
    } catch {
      /* keep the button so the shopper can retry */
    } finally {
      loading = false;
      button.disabled = false;
      button.textContent = ctx.texts.loadMore || "Load more";
      if (!next) {
        wrap.remove();
        observer?.disconnect();
      }
    }
  };
  button.addEventListener("click", () => void load());

  let observer: IntersectionObserver | null = null;
  if (mode === "infinite" && typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void load();
    }, { rootMargin: "600px 0px" });
    observer.observe(wrap);
  }
}

export function setupScrollTop(ctx: PageContext): void {
  if (!ctx.settings.paging.scrollTop) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vc-top";
  button.setAttribute(UI_ATTR, "top");
  button.setAttribute("aria-label", "↑");
  button.textContent = "↑";
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.body.append(button);
  const update = () => button.classList.toggle("is-visible", window.scrollY > window.innerHeight * 1.5);
  window.addEventListener("scroll", update, { passive: true });
  update();
}
