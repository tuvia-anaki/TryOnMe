import { UI_ATTR } from "./cards";
import { renderAddToCart } from "./cart";
import { isActivePage, readContext } from "./context";
import { Engine } from "./engine";
import { setupPaging, setupScrollTop } from "./paging";
import { HIDDEN_ATTR } from "./patch";
import { placePromos } from "./promo";
import { renderSwatches } from "./swatches";

/**
 * vc-cards.js — loaded by the app embed on collection, search and home pages.
 * Splits product cards into variant cards, adds swatches, add-to-cart,
 * "Load more" and promo tiles. Everything runs in the shopper's browser with
 * data Shopify already serves; there is no app server involved.
 */

const CSS = `
[${HIDDEN_ATTR}]{display:none!important}
.vc-badge{display:inline-block;margin:.4em .4em 0 0;padding:.15em .6em;border-radius:999px;font-size:.75em;line-height:1.6;background:rgba(127,127,127,.16);color:inherit;vertical-align:middle}
.vc-more{display:flex;justify-content:center;margin:2rem 0}
.vc-more button{font:inherit;color:inherit;padding:.8em 2.2em;border:1px solid currentColor;border-radius:999px;background:transparent;cursor:pointer;min-width:12em}
.vc-more button:disabled{opacity:.6;cursor:progress}
.vc-toast{position:fixed;z-index:2147483000;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;pointer-events:none;display:flex;gap:1em;align-items:center;padding:.8em 1.2em;border-radius:10px;background:#1a1a1a;color:#fff;font:inherit;font-size:.9em;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:opacity .2s,transform .2s}
.vc-toast.is-visible{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.vc-toast a{color:inherit;font-weight:600;text-decoration:underline}
.vc-top{position:fixed;z-index:2147482000;right:20px;bottom:20px;width:44px;height:44px;border-radius:50%;border:0;background:#1a1a1a;color:#fff;font-size:20px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s;box-shadow:0 4px 16px rgba(0,0,0,.2)}
.vc-top.is-visible{opacity:.9;pointer-events:auto}
.vc-promo-item--wide{grid-column:span 2}
`;

function injectCss(): void {
  if (document.getElementById("vc-cards-css")) return;
  const style = document.createElement("style");
  style.id = "vc-cards-css";
  style.textContent = CSS;
  document.head.append(style);
}

/** The app embed hides the grid until cards are split (no flash of the original cards). */
function reveal(): void {
  document.documentElement.classList.remove("vc-pending");
}

async function start(): Promise<void> {
  const ctx = readContext();
  if (!ctx || !ctx.settings.enabled) {
    reveal();
    // Promo cards work on their own (the embed may be off, or this page not enabled).
    if (!ctx) placePromos();
    return;
  }
  injectCss();
  const engine = new Engine(ctx);
  const active = isActivePage(ctx);
  if (active) {
    if (ctx.settings.swatches.enabled) engine.onRender((cards) => cards.forEach((c) => renderSwatches(c, ctx.settings, ctx.root)));
    if (ctx.settings.card.addToCart) engine.onRender((cards) => cards.forEach((c) => renderAddToCart(c, ctx.texts, ctx.root)));
    // Promo tiles count variant cards, and come back when the theme redraws the grid.
    engine.onRender(() => placePromos());
    try {
      await engine.run();
    } catch (error) {
      console.warn("[Variant Cards]", error);
    }
  }
  reveal();
  placePromos();
  if (active) {
    engine.observe();
    setupPaging(ctx, engine);
  }
  setupScrollTop(ctx);
  (window as any).VariantCards = { refresh: () => engine.run(), ui: UI_ATTR };
  document.dispatchEvent(new CustomEvent("vc:ready", { detail: { active } }));
}

function safeStart(): void {
  start().catch((error) => {
    reveal();
    console.warn("[Variant Cards]", error);
  });
}

// The embed and the Promo card block may both load this script.
if (!(window as any).__vcCards) {
  (window as any).__vcCards = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeStart, { once: true });
  else safeStart();
}

// Theme editor: sections re-render in place.
document.addEventListener("shopify:section:load", () => void (window as any).VariantCards?.refresh?.());
