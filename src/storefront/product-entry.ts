import type { ProductApi } from "./api";
import { GalleryController } from "./controller";
import { readJson, readProduct, readSettings } from "./data";
import { NativeRegistry } from "./picker";
import { findProductScope } from "./scope";
import type { SwatchStrings } from "./swatches";
import { VariantWatcher } from "./variant";

/**
 * Product page entry (gallery filtering + variant tracking). Loaded deferred,
 * only on product pages, by the app embed. Reads data rendered by Liquid —
 * never calls an app server. Swatches live in pvi-swatches.js, loaded only
 * when enabled.
 */

let rebindTimer = 0;

function removePrehide(): void {
  document.getElementById("pvi-prehide")?.remove();
}

function start(): void {
  if (window.__pviProduct) return;
  const product = readProduct();
  if (!product) return;
  const settings = readSettings();
  const strings = readJson<SwatchStrings>("pvi-i18n") ?? { soldOut: "Sold out", unavailable: "Unavailable" };
  const { scope, form } = findProductScope(product);
  scope.setAttribute("data-pvi-product-scope", "");

  const gallery = new GalleryController(scope, product, settings);
  if (!gallery.active && !settings.swatches.enabled) {
    gallery.destroy();
    removePrehide();
    return;
  }

  const native = new NativeRegistry(scope, product);
  const listeners: ((variantId: number) => void)[] = [];
  const destroyListeners: (() => void)[] = [];
  const watcher = new VariantWatcher(
    scope,
    product,
    () => native.get(),
    (variantId, userInitiated) => {
      gallery.update(variantId, userInitiated ? "user" : "change");
      for (const listener of listeners) listener(variantId);
      // Public event for theme/app integrations.
      document.dispatchEvent(new CustomEvent("pvi:variant-change", { detail: { productId: product.id, variantId, userInitiated } }));
    },
    form,
  );
  gallery.selection = () => watcher.selectionValueIds();
  // "Show all images until a variant is picked": themes pre-fill the form with
  // the first variant, so only a real selection (URL/click) filters.
  const showAllFirst = product.selected == null && settings.gallery.noSelection === "all";
  gallery.update(showAllFirst ? null : watcher.current, "init");

  const api: ProductApi = {
    scope,
    product,
    settings,
    strings,
    gallery,
    watcher,
    native,
    onVariantChange: (listener) => void listeners.push(listener),
    onDestroy: (listener) => void destroyListeners.push(listener),
  };
  window.__pviProduct = api;

  // The theme editor (and some themes) replace the whole product section:
  // tear down and bind again to the new markup.
  const checkScope = () => {
    if (scope.isConnected || window.__pviProduct !== api) return;
    window.clearInterval(rebindTimer);
    document.removeEventListener("shopify:section:load", onSectionLoad);
    watcher.destroy();
    gallery.destroy();
    destroyListeners.forEach((fn) => fn());
    window.__pviProduct = undefined;
    safeStart();
  };
  const onSectionLoad = () => window.setTimeout(checkScope, 0);
  document.addEventListener("shopify:section:load", onSectionLoad);
  window.clearInterval(rebindTimer);
  rebindTimer = window.setInterval(checkScope, 1000);

  document.dispatchEvent(new CustomEvent("pvi:ready", { detail: { productId: product.id } }));
}

/** Never leave the anti-flicker CSS behind if something unexpected throws. */
function safeStart(): void {
  try {
    start();
  } catch (error) {
    removePrehide();
    console.warn("[variant images]", error);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeStart);
else safeStart();
