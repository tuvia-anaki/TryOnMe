/** Where the app keeps its data (metafields) and the handles of its theme blocks. */

/** Shop settings: app-data metafield on the app installation (Liquid: app.metafields.variant_cards.settings). */
export const SETTINGS_NAMESPACE = "variant_cards";
export const SETTINGS_KEY = "settings";

/** Per-collection overrides: app-owned collection metafield (Liquid: collection.metafields['$app:variant_cards'].settings). */
export const COLLECTION_NAMESPACE = "$app:variant_cards";
export const COLLECTION_KEY = "settings";

/** Block file names in extensions/variant-cards/blocks. */
export const EMBED_HANDLE = "app-embed";

export type SectionHandle = "featured-collection" | "best-sellers" | "hand-picked" | "related-products" | "promo-card";

/** The app's sections and the template they're added to from the admin. */
export const SECTIONS: { handle: SectionHandle; template: string }[] = [
  { handle: "featured-collection", template: "index" },
  { handle: "best-sellers", template: "index" },
  { handle: "hand-picked", template: "index" },
  { handle: "related-products", template: "product" },
  { handle: "promo-card", template: "collection" },
];
