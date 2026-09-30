/** Where the app keeps its data (metafields) and the handles of its theme blocks. */

/** Shop settings: app-data metafield on the app installation (Liquid: app.metafields.variant_cards.settings). */
export const SETTINGS_NAMESPACE = "variant_cards";
export const SETTINGS_KEY = "settings";

/** Per-collection overrides: app-owned collection metafield (Liquid: collection.metafields['$app:variant_cards'].settings). */
export const COLLECTION_NAMESPACE = "$app:variant_cards";
export const COLLECTION_KEY = "settings";

/**
 * Block file names in extensions/variant-cards/blocks. Theme files refer to them as
 * "shopify://apps/<app>/blocks/<block>/<extension id>", where <app> is a name Shopify picks
 * (not the app handle), so the "vc-" prefix is what makes the app's blocks recognizable.
 */
export const EMBED_HANDLE = "vc-app-embed";

export type SectionHandle = "featured-collection" | "best-sellers" | "hand-picked" | "related-products" | "promo-card";

/** The app's sections: block file name and the template they're added to from the admin. */
export const SECTIONS: { handle: SectionHandle; block: string; template: string }[] = [
  { handle: "featured-collection", block: "vc-featured-collection", template: "index" },
  { handle: "best-sellers", block: "vc-best-sellers", template: "index" },
  { handle: "hand-picked", block: "vc-hand-picked", template: "index" },
  { handle: "related-products", block: "vc-related-products", template: "product" },
  { handle: "promo-card", block: "vc-promo-card", template: "collection" },
];

/** Every block file name of the app. */
export const BLOCK_HANDLES = [EMBED_HANDLE, ...SECTIONS.map((s) => s.block)];
