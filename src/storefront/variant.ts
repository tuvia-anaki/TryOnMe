import { variantForOptions, type SFProduct } from "./data";
import { readSelection, type NativeOption } from "./picker";

/**
 * Tracks the selected variant without depending on any theme's events.
 *
 * Three sources are sampled: the product form's `id` input, the `?variant=`
 * URL parameter and the native option controls. Whichever source changes
 * last wins ("edge-triggered"), so a shopper's click is reflected instantly
 * even when the theme only updates its form after a network round trip.
 * Events (change/click/history/custom theme events) trigger an immediate
 * sample; a light poll is the safety net.
 *
 * Liquid only exposes the first 250 variants, so ids from the product form
 * are accepted even when unknown; the gallery then works from the option
 * values selected in the picker (see selectionValueIds).
 */

// Variant events observed across popular themes (Dawn, Horizon, Maestrooo,
// Archetype, Clean Canvas, Empire, Stiletto, Palo Alto, Broadcast, Pipeline…).
const THEME_EVENTS = [
  "variant:change",
  "variant:changed",
  "variantChange",
  "variantImageChange",
  "variant-change",
  "variant:update",
  "variant:selected",
  "on:variant:change",
  "product:variant-change",
  "product:rerender",
  "shopify:variant:change",
  "theme:variant:change",
  "theme:variant:prices-updated",
  "theme:media:select",
  "theme:image:change",
  "product-info:loaded",
  "theme:product-info:loaded",
];

type Listener = (variantId: number, userInitiated: boolean) => void;
type Source = "input" | "url" | "picker";

export class VariantWatcher {
  private last: Record<Source, number | null> = { input: null, url: null, picker: null };
  current: number | null = null;
  private timers: number[] = [];
  private pollHandle = 0;
  private interacted = false;
  private destroyed = false;
  private readonly ids: Set<number>;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly scope: Element,
    private readonly product: SFProduct,
    private readonly getNativeOptions: () => NativeOption[],
    private readonly onChange: Listener,
    /** The product's main add-to-cart form (the only place unknown ids are trusted). */
    private readonly form: HTMLFormElement | null = null,
  ) {
    this.ids = new Set(product.variants.map((v) => v.id));
    this.last.input = this.readInput();
    this.last.url = this.readUrl();
    this.last.picker = this.readPicker();
    this.current = this.last.input ?? this.last.url ?? this.product.selected ?? null;
    this.listen();
  }

  /** Known variant ids only. */
  private known(id: number | null): number | null {
    return id != null && this.ids.has(id) ? id : null;
  }

  /** Any plausible variant id (products with more than 250 variants). */
  private plausible(id: number | null): number | null {
    if (id == null || !Number.isSafeInteger(id) || id <= 0) return null;
    return this.ids.has(id) || this.product.variants.length >= 250 ? id : null;
  }

  readInput(): number | null {
    if (this.form?.isConnected) {
      const field = this.form.querySelector<HTMLInputElement | HTMLSelectElement>("[name='id']");
      const id = field ? this.plausible(Number(field.value)) : null;
      if (id != null) return id;
    }
    const fields = this.scope.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "form[action*='/cart/add'] [name='id'], [name='id'][form]",
    );
    for (const field of Array.from(fields)) {
      const id = this.known(Number(field.value));
      if (id != null) return id;
    }
    // Some themes render the product form outside the section (sticky bars, page builders).
    const anywhere = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("form[action*='/cart/add'] [name='id']");
    for (const field of Array.from(anywhere)) {
      const id = this.known(Number(field.value));
      if (id != null) return id;
    }
    return null;
  }

  readUrl(): number | null {
    try {
      return this.plausible(Number(new URLSearchParams(window.location.search).get("variant")));
    } catch {
      return null;
    }
  }

  /** Option value names currently selected in the theme's picker (null = unknown). */
  private selectedNames(): (string | null)[] | null {
    const native = this.getNativeOptions();
    if (!native.length) return null;
    const names = readSelection(native, this.product.options.length);
    if (names.some((n) => n == null)) {
      // Options without a detected control: fill from the current variant.
      const current = this.current != null ? this.product.variantById.get(this.current) : null;
      if (current) names.forEach((n, i) => (names[i] = n ?? current.names[i] ?? null));
    }
    return names;
  }

  readPicker(): number | null {
    const names = this.selectedNames();
    if (!names || names.some((n) => n == null)) return null;
    return variantForOptions(this.product, names)?.id ?? null;
  }

  /**
   * Option value ids of the shopper's current selection, read from the
   * picker. Used when the selected variant isn't among the first 250.
   */
  selectionValueIds(): number[] | null {
    const names = this.selectedNames();
    if (!names || names.some((n) => n == null)) return null;
    const ids: number[] = [];
    names.forEach((name, i) => {
      const id = this.product.options[i]?.values.find((v) => v.name === name)?.id;
      if (id != null) ids.push(id);
    });
    return ids.length ? ids : null;
  }

  /** Sample every source; the one that changed since the last sample wins. */
  sample = (): void => {
    if (this.destroyed) return;
    const next: Record<Source, number | null> = { input: this.readInput(), url: this.readUrl(), picker: this.readPicker() };
    let candidate: number | null = null;
    // Picker first: it reflects the shopper's click before the theme catches up.
    for (const key of ["picker", "input", "url"] as const) {
      if (next[key] !== this.last[key] && next[key] != null && candidate == null) candidate = next[key];
    }
    this.last = next;
    if (candidate != null && candidate !== this.current) {
      this.current = candidate;
      this.onChange(candidate, this.interacted);
    }
  };

  private schedule = (): void => {
    if (this.destroyed) return;
    this.timers.forEach((t) => window.clearTimeout(t));
    // Now, and again once themes that fetch section HTML have updated the form.
    this.timers = [window.setTimeout(this.sample, 0), window.setTimeout(this.sample, 120)];
  };

  private onUserEvent = (event: Event): void => {
    const target = event.target as Element | null;
    if (target && target instanceof Element && (this.scope.contains(target) || target.closest("form[action*='/cart/add']"))) {
      this.interacted = true;
      this.schedule();
    }
  };

  private listen(): void {
    const on = (target: EventTarget, type: string, handler: EventListener, capture = true) => {
      target.addEventListener(type, handler, capture);
      this.cleanups.push(() => target.removeEventListener(type, handler, capture));
    };
    for (const type of ["change", "input", "click"]) on(document, type, this.onUserEvent);
    for (const type of THEME_EVENTS) on(document, type, this.schedule);
    on(window, "popstate", this.schedule, false);
    this.cleanups.push(onHistoryChange(this.schedule));
    // Setting .value on a hidden input updates its value attribute: react immediately.
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(this.schedule);
      observer.observe(this.scope, { attributes: true, attributeFilter: ["value"], subtree: true });
      this.cleanups.push(() => observer.disconnect());
    }
    const poll = () => {
      window.clearInterval(this.pollHandle);
      if (!this.destroyed && document.visibilityState === "visible") this.pollHandle = window.setInterval(this.sample, 400);
    };
    on(document, "visibilitychange", poll, false);
    poll();
  }

  destroy(): void {
    this.destroyed = true;
    window.clearInterval(this.pollHandle);
    this.timers.forEach((t) => window.clearTimeout(t));
    this.cleanups.splice(0).forEach((fn) => fn());
  }
}

const historyListeners = new Set<() => void>();
let historyPatched = false;

/** Notify on history.pushState/replaceState (themes update ?variant= this way). Returns an unsubscribe. */
function onHistoryChange(listener: () => void): () => void {
  historyListeners.add(listener);
  if (!historyPatched) {
    historyPatched = true;
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method];
      history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const result = original.apply(this, args);
        historyListeners.forEach((fn) => fn());
        return result;
      } as History["pushState"];
    }
  }
  return () => historyListeners.delete(listener);
}
