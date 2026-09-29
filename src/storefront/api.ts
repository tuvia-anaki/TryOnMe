import type { AppSettings } from "../shared/settings";
import type { GalleryController } from "./controller";
import type { SFProduct } from "./data";
import type { NativeRegistry } from "./picker";
import type { SwatchStrings } from "./swatches";
import type { VariantWatcher } from "./variant";

/**
 * What pvi-product.js exposes for the optional pvi-swatches.js (and for
 * debugging). A new object is published (with a new `pvi:ready` event) when
 * the product section is re-rendered and everything re-binds.
 */
export interface ProductApi {
  scope: Element;
  product: SFProduct;
  settings: AppSettings;
  strings: SwatchStrings;
  gallery: GalleryController;
  watcher: VariantWatcher;
  native: NativeRegistry;
  /** Subscribe to variant changes. */
  onVariantChange(listener: (variantId: number) => void): void;
  /** Subscribe to teardown (section replaced, about to re-bind). */
  onDestroy(listener: () => void): void;
}

declare global {
  interface Window {
    __pviProduct?: ProductApi;
  }
}
