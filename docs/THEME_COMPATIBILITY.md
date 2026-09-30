# Theme compatibility notes

The storefront script (`vc-cards.js`) needs no per-theme code:

1. **Cards** are the largest elements that link to exactly one product (`/products/<handle>`, also under `/collections/<x>/` or a market prefix); cards that share a parent form a grid. On collection and search pages the largest grid is used, on the home page every grid.
2. **Product data** comes from Shopify's `/products/<handle>.js` (the shopper's currency and language), cached in the browser for 10 minutes.
3. **Variant cards** are copies of the theme's own card. In each copy the product links get `?variant=`, the image switches to the variant's image (or the variant's slide moves first in themes that render every product image), the title and the price are rewritten, `input[name=id]` in quick-add forms points at the variant, and ids are made unique.
4. **Prices** are written in the store's own money format, learned from Shopify's `money` / `money_with_currency` output of a sample amount.
5. When the theme redraws the grid (filters, sorting, its own infinite scroll), the new cards are split again.

## Checked against real markup (September 2026)

The engine ran on saved collection pages (with the stores' real product data) of: Dawn 15, Dawn 2.5/5.0 (Sense, Refresh), Horizon, Savor, Atelier, Tinker, Pitch, Heritage, Dwell, Fabric, Vessel, Ritual, Prestige, Impulse, Impact, Focal, Warehouse, Symmetry, Motion, Broadcast, Be Yours, Enterprise, Expanse, Palo Alto, Empire, Stiletto, Minimog, Ella, Shrine, Pipeline, Streamline and Showcase — 33 themes. Every split card got the right link, image, title and price. It was also run in a real browser, with the themes' own JavaScript, on the Dawn and Savor demo stores.

Kalles draws its collection grid with JavaScript after the page loads; the script's observer splits those cards once they appear (not covered by the saved-page test).

## If cards aren't split

Settings → Advanced:

- **Product card selector** — a CSS selector matching one product card (e.g. `.product-card`).
- **Product grid selector** — limits the app to one grid (and is used by the anti-flash style).
