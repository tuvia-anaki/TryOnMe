import { isEmptyConfig } from "../shared/config";
import { resolveVisibleMedia } from "../shared/resolve";
import type { AppSettings } from "../shared/settings";
import type { SFProduct } from "./data";
import { activateMedia, activeMediaId, applyVisibility, detectLists } from "./gallery";
import { HIDDEN_ATTR, type ListState } from "./sliders";

/**
 * Keeps the product gallery in sync with the selected variant and re-applies
 * itself when the theme re-renders parts of the gallery.
 */
export class GalleryController {
  lists: ListState[] = [];
  private visible: Set<number> | null = null;
  private main: number | null = null;
  private observer: MutationObserver | null = null;
  private redetectTimer = 0;
  private redetects = 0;
  private windowStart = Date.now();
  private checkTimer = 0;
  /** Option value ids of the shopper's selection, for variants beyond Liquid's first 250. */
  selection: (() => number[] | null) | null = null;

  constructor(
    private readonly scope: Element,
    private readonly product: SFProduct,
    private readonly settings: AppSettings,
  ) {
    this.detect();
    this.observe();
  }

  get active(): boolean {
    return this.settings.gallery.enabled && !isEmptyConfig(this.product.config);
  }

  detect(): void {
    this.lists = detectLists(this.scope, this.product, this.lists, {
      itemSelector: this.settings.gallery.itemSelector || undefined,
    });
  }

  private valueIdsFor(variantId: number | null): number[] | null {
    const variant = variantId != null ? this.product.variantById.get(variantId) : null;
    if (variant) return variant.valueIds;
    if (variantId != null) {
      const picked = this.selection?.();
      if (picked?.length) return picked;
    }
    if (this.settings.gallery.noSelection === "all") return null;
    const fallback =
      this.product.variantById.get(this.product.first ?? -1) ??
      this.product.variants.find((v) => v.available) ??
      this.product.variants[0];
    return fallback ? fallback.valueIds : null;
  }

  /** Apply the gallery filter for a variant. */
  update(variantId: number | null, reason: "init" | "change" | "user"): void {
    if (!this.active) return;
    const result = resolveVisibleMedia(this.product.config, this.product.mediaIds, this.valueIdsFor(variantId), {
      hideUnassigned: this.settings.gallery.hideUnassigned,
    });
    this.visible = new Set(result.visible);
    this.main = result.main ?? result.visible[0] ?? null;
    this.apply();

    const target = this.main;
    if (target == null) return;
    const activeId = activeMediaId(this.lists);
    const activeHidden = activeId != null && !this.visible.has(activeId);
    if (activeHidden || (reason === "user" && this.settings.gallery.showMainFirst)) {
      activateMedia(this.lists, target);
      // Themes that fetch section HTML may re-select their own media afterwards.
      window.clearTimeout(this.checkTimer);
      this.checkTimer = window.setTimeout(() => {
        const now = activeMediaId(this.lists);
        if (now != null && this.visible && !this.visible.has(now)) activateMedia(this.lists, target);
      }, 450);
    }
  }

  private apply(): void {
    if (!this.visible) return;
    applyVisibility(this.lists, this.visible);
    // Our own DOM changes shouldn't trigger re-detection.
    this.observer?.takeRecords();
    document.getElementById("pvi-prehide")?.remove();
    document.documentElement.setAttribute("data-pvi-ready", "");
  }

  private observe(): void {
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === "attributes") {
          // Only care when a theme un-hides one of our hidden items.
          if (record.attributeName === "hidden") return (record.target as Element).hasAttribute(HIDDEN_ATTR) && !(record.target as Element).hasAttribute("hidden");
          return record.attributeName !== HIDDEN_ATTR;
        }
        return Array.from(record.addedNodes).some((node) => node.nodeType === 1);
      });
      if (!relevant) return;
      window.clearTimeout(this.redetectTimer);
      this.redetectTimer = window.setTimeout(() => this.onMutations(), 80);
    });
    this.observer.observe(this.scope, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "data-src", "data-media-id", "hidden"],
    });
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    window.clearTimeout(this.redetectTimer);
    window.clearTimeout(this.checkTimer);
  }

  private onMutations(): void {
    // Circuit breaker: never fight a theme in a tight loop.
    const now = Date.now();
    if (now - this.windowStart > 2000) {
      this.windowStart = now;
      this.redetects = 0;
    }
    if (++this.redetects > 12) {
      // Busy window: try once more when it ends instead of dropping the change.
      window.clearTimeout(this.redetectTimer);
      this.redetectTimer = window.setTimeout(() => this.onMutations(), Math.max(50, 2000 - (now - this.windowStart)));
      return;
    }
    this.detect();
    this.apply();
  }
}
