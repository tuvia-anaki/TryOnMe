import { placePromos } from "./promo";

/**
 * vc-promo.js — loaded by the Promo card block. When the app embed is active
 * on the page, vc-cards.js places promos after splitting the cards (so the
 * position counts variant cards); otherwise this places them on its own.
 */
function start(): void {
  if (document.getElementById("vc-config")) return;
  placePromos();
  const grid = document.querySelector("main") ?? document.body;
  let timer: number | undefined;
  new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(placePromos, 150);
  }).observe(grid, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
document.addEventListener("shopify:section:load", () => placePromos());
