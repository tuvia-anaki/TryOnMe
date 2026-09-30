import { findGrids, mainScope } from "./cards";

/**
 * Promo cards: the "Promo card" app block renders its tile anywhere on the
 * page; here it moves into the product grid at the position the merchant
 * chose, dressed as a grid item so it takes one (or two) columns. When the
 * theme redraws the grid (filters, sorting) the tile is put back.
 */

const known: HTMLElement[] = [];

function currentGrid(): Element | null {
  return document.querySelector("[data-vc-grid]") ?? findGrids(mainScope())[0]?.parent ?? null;
}

export function placePromos(): void {
  for (const promo of Array.from(document.querySelectorAll<HTMLElement>("[data-vc-promo]"))) {
    if (!known.includes(promo)) known.push(promo);
  }
  if (!known.length) return;
  const grid = currentGrid();
  for (const promo of known) {
    const item = promo.parentElement?.hasAttribute("data-vc-promo-item") ? promo.parentElement : null;
    if (item?.isConnected && item.parentElement === grid) continue;
    const handles = (promo.dataset.collections ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    if (handles.length && !handles.includes(promo.dataset.here ?? "")) {
      promo.hidden = true;
      continue;
    }
    if (!grid) continue;
    const cards = Array.from(grid.children).filter((child) => !child.hasAttribute("data-vc-promo-item") && !!child.querySelector("a[href*='/products/']"));
    const sample = cards[0];
    const wrapper = item ?? document.createElement(sample?.tagName.toLowerCase() === "li" ? "li" : "div");
    wrapper.setAttribute("data-vc-promo-item", "");
    // Same grid-item classes as the cards, so the tile sits in the grid like one of them.
    wrapper.className = `${sample?.className ?? ""} vc-promo-item`.trim();
    if (promo.dataset.span === "2") wrapper.classList.add("vc-promo-item--wide");
    if (promo.parentElement !== wrapper) wrapper.append(promo);
    const position = Math.max(1, Number(promo.dataset.position) || 1);
    const before = cards[position - 1] ?? null;
    if (before) grid.insertBefore(wrapper, before);
    else grid.append(wrapper);
  }
  // The blocks' own section wrappers are empty now.
  for (const section of Array.from(document.querySelectorAll<HTMLElement>("[data-vc-promo-section]"))) {
    if (!section.querySelector("[data-vc-promo]")) section.hidden = true;
  }
}
