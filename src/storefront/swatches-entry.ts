import type { ProductApi } from "./api";
import { SwatchController } from "./swatches";

/** Optional swatches add-on, loaded after pvi-product.js when swatches are enabled. */

let mounted: ProductApi | null = null;

function mount(api: ProductApi | undefined): void {
  if (!api || api === mounted || !api.settings.swatches.enabled) return;
  mounted = api;
  const swatches = new SwatchController(api.scope, api.product, api.settings, api.strings, () => api.watcher.current, api.native);
  swatches.start();
  api.onVariantChange(() => swatches.sync());
  api.onDestroy(() => swatches.destroy());
}

function start(): void {
  mount(window.__pviProduct);
  // Every (re)bind of the product script publishes a new API.
  document.addEventListener("pvi:ready", () => mount(window.__pviProduct));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
