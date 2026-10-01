# App Store listing (draft)

> Shopify's naming rule: the app name must lead with a distinctive brand and be ≤ 30 characters.
> "Variant Cards" is a working name — check that it's unique in the App Store before submitting.

**App name:** Variant Cards: Show Variants (28 characters)

**App card subtitle (≤62 chars):** Show variants on collection page as products, with swatches

**App introduction (≤100 chars):**
Show variants on collection pages as separate products, with variant swatches on every card.

**App details (≤500 chars):**
Show variants as separate products on your collection and search pages. Each color, material or scent gets its own card with its own photo, title and link, in your theme’s own design, while sizes stay together. Add swatches so shoppers switch variants on the card itself. Choose which collections, hide sold-out variants, and drag cards into your own order per collection. Works with your theme’s filters and sorting. No code, no duplicate products, and you can pause anytime.

**Feature list (≤80 chars each):**
- Show variants as separate products on collection and search pages
- Variant swatches on every card: color or photo, round or square, 3 sizes
- Each color, material or scent gets its own card, while sizes stay together
- Drag-and-drop card order and hidden cards for each collection
- Hide sold-out variants or show them last; works with your filters and sorting

**Pricing:** Free

**Categories:** Product variants (Selling products) · Collections (Store design)

**Search terms (5, ≤20 chars each):** show variants, split variants, separate variants, variants as products, color swatches

## Test instructions for reviewers (≤2800 chars)

No login, account or billing needed: the app is free.

Setup
1. Install the app. It opens on Home.
2. On Home, click "Turn on in theme editor". The theme editor opens with the "Variant Cards" app embed turned on. Click Save, go back to the app and click "Check again". Home shows "Live on [theme]".
3. You need a product with variants. If the store has none, create "Test Tee" with option Color (Red, Blue, Green) and Size (S, M), give each color its own image, and make it available on the Online Store.

Main feature: one card per variant
4. On Home, click "Preview store" (enter the store password if there is one). On /collections/all, each color is its own product card ("Test Tee - Red", "Test Tee - Blue"...) with its own image, price and link (?variant=...). Sizes stay together on one card.
5. On Home, under "What gets its own card", choose "Pick an option" > Size, or "One card per product". Click Save in the save bar and reload the storefront page.

Swatches
6. Home > Swatches: turn on "Swatches on product cards", pick Color or Photo, Round or Square and a size (the preview uses the store's products), then Save.
7. On the storefront, swatches show under each card. Clicking one switches that card's photo, title, price and link without leaving the page.

Per collection
8. Home > Collections > open a collection. Drag cards to reorder them, or point at a card to use its up/down/Hide buttons, then Save. The storefront collection shows the new order without the hidden cards. The switch at the top turns variant cards off for that collection only.

Other settings
9. More settings: card title, price format, card order, hide sold-out cards, "Sold out" badge, search results and home page grids.
10. Home > Pause > confirm: the storefront goes back to the theme's normal cards. "Turn back on" restores them.

Notes
- Access scopes: read_products (products and collections for the admin preview and card order), write_products (only to save per-collection card order in an app-owned collection metafield; products are never changed), read_themes (to check whether the app embed is on).
- Settings are stored in app-owned metafields. The storefront script reads Shopify's own product data and sends nothing to an app server. No customer data is used.
- If you edit a product after viewing the storefront, open a new tab: product data is cached in the browser for 10 minutes.
- The chat bubble in the admin is our support chat (Tidio).

## Screenshots (ideas)

1. A collection page before/after: one card per product vs. one card per color.
2. Home: "What gets its own card" picture choices.
3. A collection's card order editor (drag and drop).
