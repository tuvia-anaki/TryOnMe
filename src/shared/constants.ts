/** Where the app keeps its data (metafields) and the name of its theme block. */

/** Shop settings: app-data metafield on the app installation (Liquid: app.metafields.variant_cards.settings). */
export const SETTINGS_NAMESPACE = "variant_cards";
export const SETTINGS_KEY = "settings";

/** Per-collection overrides: app-owned collection metafield (Liquid: collection.metafields['$app:variant_cards'].settings). */
export const COLLECTION_NAMESPACE = "$app:variant_cards";
export const COLLECTION_KEY = "settings";

/**
 * The app embed's file name in extensions/variant-cards/blocks. Theme files refer to it as
 * "shopify://apps/<app>/blocks/vc-app-embed/<extension id>", where <app> is a name Shopify
 * picks (not the app handle), so the "vc-" name is what makes it recognizable.
 */
export const EMBED_HANDLE = "vc-app-embed";
