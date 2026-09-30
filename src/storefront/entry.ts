import { UI_ATTR } from "./cards";
import { isActivePage, readContext } from "./context";
import { Engine } from "./engine";
import { HIDDEN_ATTR } from "./patch";

/**
 * vc-cards.js — loaded by the app embed on collection, search and home pages.
 * Splits product cards into variant cards. Everything runs in the shopper's
 * browser with data Shopify already serves; there is no app server involved.
 */

const CSS = `
[${HIDDEN_ATTR}]{display:none!important}
.vc-badge{display:inline-block;margin:.4em .4em 0 0;padding:.15em .6em;border-radius:999px;font-size:.75em;line-height:1.6;background:rgba(127,127,127,.16);color:inherit;vertical-align:middle}
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
    return;
  }
  injectCss();
  const engine = new Engine(ctx);
  const active = isActivePage(ctx);
  if (active) {
    try {
      await engine.run();
    } catch (error) {
      console.warn("[Variant Cards]", error);
    }
  }
  reveal();
  if (active) engine.observe();
  (window as any).VariantCards = { refresh: () => engine.run(), ui: UI_ATTR };
  document.dispatchEvent(new CustomEvent("vc:ready", { detail: { active } }));
}

function safeStart(): void {
  start().catch((error) => {
    reveal();
    console.warn("[Variant Cards]", error);
  });
}

if (!(window as any).__vcCards) {
  (window as any).__vcCards = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeStart, { once: true });
  else safeStart();
}

// Theme editor: sections re-render in place.
document.addEventListener("shopify:section:load", () => void (window as any).VariantCards?.refresh?.());
