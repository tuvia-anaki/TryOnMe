/**
 * Slider adapters. Most theme galleries are either plain lists (stacked
 * images, CSS scroll-snap) where hiding items is enough, or JS sliders that
 * must be told about the change. Each adapter makes a list show exactly the
 * wanted items and can bring one item into view.
 */

export const HIDDEN_ATTR = "data-pvi-hidden";

/** Slider-generated copies of slides (loop modes). They are recreated by the slider. */
const CLONE_CLASSES = ["slick-cloned", "swiper-slide-duplicate", "is-clone", "splide__slide--clone", "glide__slide--clone", "tns-slide-cloned", "cloned"];

export function isClone(el: Element): boolean {
  return CLONE_CLASSES.some((name) => el.classList.contains(name));
}

export interface ListState {
  /** Element whose children are the gallery items. */
  parent: Element;
  /** All known items in original order (including ones a slider removed). */
  items: Element[];
  itemMedia: Map<Element, number>;
  adapter: SliderAdapter;
  thumbs: boolean;
  /** Last applied visible set (for idempotency). */
  lastKey?: string;
}

export interface SliderAdapter {
  name: string;
  /** True when the adapter removes hidden items from the DOM itself (keep them registered). */
  keepsDetached?: boolean;
  /** Make exactly `visible` items show. Must be idempotent. */
  apply(list: ListState, visible: Set<Element>): void;
  /** Bring the item into view / make it the active slide. */
  activate(list: ListState, item: Element): boolean;
}

type AnyObj = Record<string, any>;
const win = window as unknown as AnyObj;

const OWN_NATIVE_HIDDEN = "data-pvi-set-hidden";
const OWN_FILTER_CLASS = "data-pvi-set-filtered";

/**
 * Hide/show an item. Besides our own attribute (CSS display:none) we set the
 * native `hidden` attribute and the `is-filtered` class, which several themes'
 * sliders already understand (Horizon, Prestige, Impact, Clean Canvas themes,
 * Focal/Warehouse cellSelectors). We only ever remove what we added.
 */
function setHidden(el: Element, hidden: boolean): boolean {
  const has = el.hasAttribute(HIDDEN_ATTR);
  if (hidden && !has) {
    el.setAttribute(HIDDEN_ATTR, "");
    if (!el.hasAttribute("hidden")) {
      el.setAttribute("hidden", "");
      el.setAttribute(OWN_NATIVE_HIDDEN, "");
    }
    if (!el.classList.contains("is-filtered")) {
      el.classList.add("is-filtered");
      el.setAttribute(OWN_FILTER_CLASS, "");
    }
    return true;
  }
  if (!hidden && has) {
    el.removeAttribute(HIDDEN_ATTR);
    if (el.hasAttribute(OWN_NATIVE_HIDDEN)) {
      el.removeAttribute("hidden");
      el.removeAttribute(OWN_NATIVE_HIDDEN);
    }
    if (el.hasAttribute(OWN_FILTER_CLASS)) {
      el.classList.remove("is-filtered");
      el.removeAttribute(OWN_FILTER_CLASS);
    }
    return true;
  }
  // Re-assert native hiding if a theme re-render stripped it.
  if (hidden && has && !el.hasAttribute("hidden")) {
    el.setAttribute("hidden", "");
    el.setAttribute(OWN_NATIVE_HIDDEN, "");
  }
  return false;
}

let resizeTimer = 0;
/** Many sliders recalculate on resize; batch one synthetic resize per frame burst. */
export function nudgeLayout(): void {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
}

function scrollContainerOf(el: Element): HTMLElement | null {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) && (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth + 1) {
      return node as HTMLElement;
    }
  }
  return null;
}

/** Scroll a horizontal scroll-snap gallery so `item` is in view, without moving the page. */
function scrollIntoContainer(item: Element): boolean {
  const container = scrollContainerOf(item);
  if (!container) return false;
  const itemRect = item.getBoundingClientRect();
  const boxRect = container.getBoundingClientRect();
  const left = container.scrollLeft + (itemRect.left - boxRect.left);
  container.scrollTo({ left, behavior: "auto" });
  return true;
}

/**
 * Theme slider custom elements that need a nudge after items change:
 * Dawn family (slider-component), Clean Canvas themes (carousel-slider),
 * Focal (flickity-carousel, rebuilt with its `:not(.is-filtered)` cellSelector).
 */
function refreshCustomSlider(parent: Element): void {
  let node: Element | null = parent;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const el = node as AnyObj;
    const tag = node.tagName;
    try {
      if (tag === "FLICKITY-CAROUSEL" && typeof el.reload === "function") {
        el.reload();
        return;
      }
      if (tag === "CAROUSEL-SLIDER" && typeof el.refresh === "function") {
        el.refresh();
        return;
      }
      if (typeof el.resetPages === "function") {
        el.resetPages();
        return;
      }
      if (typeof el.initPages === "function") {
        el.initPages();
        return;
      }
    } catch {
      /* theme internals changed; the resize nudge below still helps */
      return;
    }
  }
}

export const hideAdapter: SliderAdapter = {
  name: "hide",
  apply(list, visible) {
    let changed = false;
    for (const item of list.items) changed = setHidden(item, !visible.has(item)) || changed;
    if (changed) {
      refreshCustomSlider(list.parent);
      nudgeLayout();
    }
  },
  activate(_list, item) {
    return scrollIntoContainer(item);
  },
};

function swiperOf(parent: Element): AnyObj | null {
  const host = parent.closest(".swiper, .swiper-container, swiper-container") as AnyObj | null;
  return host && host.swiper && typeof host.swiper.update === "function" ? host.swiper : null;
}

/**
 * Swiper counts hidden slides in its indexes but not in its snap grid, so
 * CSS-hidden slides break navigation. Hidden slides are detached instead and
 * Swiper re-reads the wrapper on update().
 */
function swiperAdapter(parent: Element): SliderAdapter {
  return {
    name: "swiper",
    keepsDetached: true,
    apply(list, visible) {
      const swiper = swiperOf(parent);
      if (!swiper) return hideAdapter.apply(list, visible);
      const originals = list.items.filter((item) => !isClone(item));
      const wanted = originals.filter((item) => visible.has(item));
      const current = originals.filter((item) => item.parentElement === list.parent);
      if (current.length === wanted.length && current.every((el, i) => el === wanted[i])) return;
      const active: Element | undefined = swiper.slides?.[swiper.activeIndex];
      const loop = !!swiper.params?.loop && typeof swiper.loopDestroy === "function" && typeof swiper.loopCreate === "function";
      try {
        if (loop) swiper.loopDestroy();
        placeItems(list, wanted);
        if (loop) swiper.loopCreate();
        swiper.update();
        const slides: Element[] = Array.from(swiper.slides || []);
        const keep = active ? slides.indexOf(active) : -1;
        swiper.slideTo(keep >= 0 ? keep : 0, 0);
        if (swiper.thumbs?.swiper?.update) swiper.thumbs.swiper.update();
      } catch {
        hideAdapter.apply(list, visible);
      }
    },
    activate(_list, item) {
      const swiper = swiperOf(parent);
      if (!swiper) return false;
      const slides: Element[] = Array.from(swiper.slides || []);
      const index = slides.indexOf(item);
      if (index < 0) return false;
      try {
        if (swiper.params?.loop && typeof swiper.slideToLoop === "function") {
          const real = Number((item as HTMLElement).dataset.swiperSlideIndex);
          swiper.slideToLoop(Number.isFinite(real) ? real : index, 0);
        } else {
          swiper.slideTo(index, 0);
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Put exactly `wanted` items (in original order) into the list, before any trailing non-item children. Returns true if the DOM changed. */
function placeItems(list: ListState, wanted: Element[]): boolean {
  const itemSet = new Set(list.items);
  let anchor: ChildNode | null = null;
  const connected = list.items.filter((item) => item.parentElement === list.parent);
  const last = connected[connected.length - 1];
  if (last) {
    let next = last.nextSibling;
    while (next && itemSet.has(next as Element)) next = next.nextSibling;
    anchor = next;
  }
  const current = connected.filter((item) => !isClone(item));
  if (current.length === wanted.length && current.every((el, i) => el === wanted[i])) return false;
  const wantedSet = new Set(wanted);
  for (const item of connected) if (!wantedSet.has(item) && !isClone(item)) item.remove();
  for (const item of wanted) list.parent.insertBefore(item, anchor);
  return true;
}

function flickityOf(parent: Element): AnyObj | null {
  const host = parent.closest(".flickity-enabled");
  if (!host) return null;
  let instance: AnyObj | null = null;
  for (const lib of [win.Flickity, win.ThemeFlickity, win.theme?.Flickity, win.themeVendor?.Flickity]) {
    if (lib && typeof lib.data === "function") {
      instance = lib.data(host);
      if (instance) break;
    }
  }
  const own = (host as AnyObj).flickity ?? (host as AnyObj).flkty;
  if (!instance && own && typeof own.reloadCells === "function") instance = own;
  if (!instance && win.jQuery) {
    try { instance = win.jQuery(host).data("flickity"); } catch { /* ignore */ }
  }
  return instance && typeof instance.reloadCells === "function" ? instance : null;
}

/**
 * Flickity lays cells out absolutely, so hidden cells must be removed from the
 * slider. Cells that aren't gallery items (promo tiles, undetected media) are
 * left exactly where they are.
 */
function flickityAdapter(parent: Element): SliderAdapter {
  return {
    name: "flickity",
    keepsDetached: true,
    apply(list, visible) {
      const flkty = flickityOf(parent);
      if (!flkty) return hideAdapter.apply(list, visible);
      try {
        const itemSet = new Set(list.items);
        const cells = (): Element[] => (flkty.getCellElements ? flkty.getCellElements() : []);
        const selected = flkty.selectedElement as Element | undefined;
        let changed = false;
        const remove = cells().filter((cell) => itemSet.has(cell) && !visible.has(cell));
        if (remove.length) {
          flkty.remove(remove);
          changed = true;
        }
        list.items.forEach((item, index) => {
          if (!visible.has(item) || isClone(item)) return;
          const now = cells();
          if (now.includes(item)) return;
          // Insert after the closest earlier item that is present (or before the next one).
          let at = -1;
          for (let j = index - 1; j >= 0 && at < 0; j--) {
            const pos = now.indexOf(list.items[j]);
            if (pos >= 0) at = pos + 1;
          }
          for (let j = index + 1; j < list.items.length && at < 0; j++) {
            const pos = now.indexOf(list.items[j]);
            if (pos >= 0) at = pos;
          }
          flkty.insert(item, at < 0 ? now.length : at);
          changed = true;
        });
        if (!changed) return;
        const keep = selected ? cells().indexOf(selected) : -1;
        flkty.select(keep >= 0 ? keep : 0, false, true);
        flkty.resize();
      } catch {
        hideAdapter.apply(list, visible);
      }
    },
    activate(_list, item) {
      const flkty = flickityOf(parent);
      if (!flkty) return false;
      const cells: Element[] = flkty.getCellElements ? flkty.getCellElements() : [];
      const index = cells.indexOf(item);
      if (index < 0) return false;
      flkty.select(index, false, true);
      return true;
    },
  };
}

function slickHost(parent: Element): AnyObj | null {
  const $ = win.jQuery;
  const host = parent.closest(".slick-initialized");
  if (!$ || !host) return null;
  const $host = $(host);
  return typeof $host.slick === "function" ? $host : null;
}

/** Slick has its own filtering that also handles its cloned slides. */
function slickAdapter(parent: Element): SliderAdapter {
  return {
    name: "slick",
    keepsDetached: true,
    apply(list, visible) {
      const $host = slickHost(parent);
      if (!$host) return hideAdapter.apply(list, visible);
      const wanted = list.items.filter((item) => visible.has(item) && !isClone(item));
      // Key on media ids: slick recreates its clones, so element identity changes every time.
      const key = [...new Set(wanted.map((item) => list.itemMedia.get(item)))].sort().join(",");
      if (list.lastKey === key) return;
      list.lastKey = key;
      try {
        $host.slick("slickUnfilter");
        if (wanted.length !== list.items.length) {
          $host.slick("slickFilter", function (this: Element) {
            return wanted.some((item) => item === this || item.contains(this) || this.contains(item));
          });
        }
        $host.slick("slickGoTo", 0, true);
      } catch {
        hideAdapter.apply(list, visible);
      }
    },
    activate(_list, item) {
      const $host = slickHost(parent);
      if (!$host) return false;
      try {
        const slides: Element[] = Array.from(parent.querySelectorAll(":scope > .slick-slide:not(.slick-cloned)"));
        const index = slides.findIndex((slide) => slide === item || slide.contains(item) || item.contains(slide));
        if (index < 0) return false;
        $host.slick("slickGoTo", index, true);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function splideOf(parent: Element): AnyObj | null {
  const host = parent.closest(".splide") as AnyObj | null;
  if (!host) return null;
  const instance = host.splide || host._splide || host.__splide;
  return instance && typeof instance.refresh === "function" ? instance : null;
}

/** Splide: remove hidden slides from the track and refresh — only when something changed. */
function splideAdapter(parent: Element): SliderAdapter {
  return {
    name: "splide",
    keepsDetached: true,
    apply(list, visible) {
      const splide = splideOf(parent);
      if (!splide) return hideAdapter.apply(list, visible);
      const changed = placeItems(list, list.items.filter((item) => visible.has(item) && !isClone(item)));
      if (!changed) return;
      try {
        splide.refresh();
      } catch {
        /* ignore */
      }
    },
    activate(list, item) {
      const splide = splideOf(parent);
      if (!splide) return false;
      const index = list.items.filter((el) => el.isConnected && !isClone(el)).indexOf(item);
      if (index < 0) return false;
      try {
        splide.go(index);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function detectAdapter(parent: Element): SliderAdapter {
  if (parent.closest(".swiper, .swiper-container, swiper-container") || parent.classList.contains("swiper-wrapper")) {
    return swiperAdapter(parent);
  }
  if (parent.closest(".flickity-enabled") || parent.classList.contains("flickity-slider")) return flickityAdapter(parent);
  if (parent.closest(".slick-initialized") || parent.classList.contains("slick-track")) return slickAdapter(parent);
  if (parent.closest(".splide")) return splideAdapter(parent);
  // Owl, Glide, keen-slider, tiny-slider, Embla… keep internal references to
  // their slides; hiding (plus a resize nudge) is the least disruptive option.
  return hideAdapter;
}
