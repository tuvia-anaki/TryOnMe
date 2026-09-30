import { addToCart } from "./cart";
import { swapImage } from "./patch";

/**
 * vc-sections.js — behaviour for the app's own sections (Featured collection,
 * Best sellers, Hand-picked, Related products). The cards themselves are
 * rendered by Liquid, so they work (and are indexed) without this script.
 */

interface SectionTexts {
  addToCart: string;
  added: string;
  viewCart: string;
  soldOut: string;
}

function texts(root: Element): SectionTexts {
  const el = root.closest<HTMLElement>("[data-vc-section]");
  return {
    addToCart: el?.dataset.textAdd ?? "Add to cart",
    added: el?.dataset.textAdded ?? "Added to cart",
    viewCart: el?.dataset.textViewCart ?? "View cart",
    soldOut: el?.dataset.textSoldOut ?? "Sold out",
  };
}

function shopRoot(): string {
  const r = (window as any).Shopify?.routes?.root;
  return typeof r === "string" && r ? r : "/";
}

/** Related products come from Shopify's recommendations, rendered by the section itself. */
async function loadRelated(section: HTMLElement): Promise<void> {
  const url = section.dataset.vcRelatedUrl;
  const id = section.dataset.vcRelated;
  if (!url || !id || section.dataset.vcLoaded) return;
  section.dataset.vcLoaded = "true";
  try {
    const res = await fetch(url);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const fresh = doc.querySelector<HTMLElement>(`[data-vc-related="${CSS.escape(id)}"]`);
    if (fresh && fresh.querySelector("[data-vc-own-card]")) {
      section.innerHTML = fresh.innerHTML;
      section.hidden = false;
      bind(section);
    } else {
      section.closest<HTMLElement>("[data-vc-section]")?.setAttribute("hidden", "");
    }
  } catch {
    section.closest<HTMLElement>("[data-vc-section]")?.setAttribute("hidden", "");
  }
}

function bind(scope: ParentNode): void {
  // Add to cart without leaving the page (the form still works without JavaScript).
  for (const form of Array.from(scope.querySelectorAll<HTMLFormElement>("form[data-vc-add]:not([data-vc-bound])"))) {
    form.dataset.vcBound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = Number(new FormData(form).get("id"));
      const button = form.querySelector<HTMLButtonElement>("button");
      const label = button?.querySelector("span") ?? button;
      const t = texts(form);
      if (button) button.disabled = true;
      const ok = await addToCart(id, shopRoot(), t);
      if (label) label.textContent = ok ? t.added : t.addToCart;
      window.setTimeout(() => {
        if (label) label.textContent = t.addToCart;
        if (button) button.disabled = false;
      }, 1800);
    });
  }
  // Swatches preview their variant's image and link.
  for (const swatch of Array.from(scope.querySelectorAll<HTMLElement>("[data-vc-swatch]:not([data-vc-bound])"))) {
    swatch.dataset.vcBound = "true";
    const card = swatch.closest<HTMLElement>("[data-vc-own-card]");
    const img = card?.querySelector<HTMLImageElement>(".vc-card__img:not(.vc-card__img--hover)");
    const links = card ? Array.from(card.querySelectorAll<HTMLAnchorElement>("a.vc-card__media, a.vc-card__title")) : [];
    if (!card || !img) continue;
    const original = { src: img.getAttribute("src"), srcset: img.getAttribute("srcset"), href: links[0]?.getAttribute("href") ?? null };
    const show = () => {
      if (swatch.dataset.image) swapImage(img, swatch.dataset.image);
      if (swatch.dataset.url) for (const a of links) a.setAttribute("href", swatch.dataset.url);
    };
    const reset = () => {
      if (original.src) img.setAttribute("src", original.src);
      if (original.srcset) img.setAttribute("srcset", original.srcset);
      if (original.href) for (const a of links) a.setAttribute("href", original.href);
    };
    swatch.addEventListener("mouseenter", show);
    swatch.addEventListener("focus", show);
    swatch.addEventListener("mouseleave", reset);
    swatch.addEventListener("blur", reset);
  }
  // Carousel arrows scroll by one card.
  for (const carousel of Array.from(scope.querySelectorAll<HTMLElement>("[data-vc-carousel]:not([data-vc-bound])"))) {
    carousel.dataset.vcBound = "true";
    const track = carousel.querySelector<HTMLElement>(".vc-grid");
    if (!track) continue;
    const step = () => (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? track.clientWidth;
    const update = () => {
      const prev = carousel.querySelector<HTMLButtonElement>("[data-vc-prev]");
      const next = carousel.querySelector<HTMLButtonElement>("[data-vc-next]");
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    };
    carousel.querySelector("[data-vc-prev]")?.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
    carousel.querySelector("[data-vc-next]")?.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
    track.addEventListener("scroll", update, { passive: true });
    update();
  }
}

function start(): void {
  bind(document);
  for (const related of Array.from(document.querySelectorAll<HTMLElement>("[data-vc-related-url]"))) void loadRelated(related);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
document.addEventListener("shopify:section:load", start);
