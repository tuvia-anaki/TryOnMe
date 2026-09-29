# Prism Variant Images

A **100% free** Shopify app that shows only the selected variant's images in the product gallery, with color/image swatches — a free alternative to paid apps like Rubik Variant Images & Swatch ($25–$75/month).

- **Multiple images per variant** — assign any number of images, videos or 3D models to each color (or any option / combination). Unassigned images (size charts, lifestyle shots) can stay visible for every variant, or be hidden.
- **Automatic assignment, unlimited** — by variant image order, alt text (incl. `#color_red` conventions from other themes/apps), file names, or by the colors in the photos (analyzed in the merchant's browser — no AI bills).
- **Bulk auto-assign** the whole catalog, then fine-tune any product with a click / drag-and-drop editor and a live "what shoppers will see" preview.
- **Works with themes automatically** — detects galleries (main slider, thumbnails, zoom/lightbox) by media ids *and* image file names; adapters for Swiper, Flickity, Slick, Splide, Dawn/Horizon/Clean Canvas/Maestrooo custom elements. Verified against markup from 25 popular themes.
- **Swatches** — color, image or button swatches that drive the theme's own picker (price, stock and add-to-cart keep working), sold-out styles, tooltips, keyboard accessible, fully styleable with a live preview.
- **Collection swatches** — color dots on product cards that swap the card image.
- **Syncs Shopify's variant image** to each variant's main image, so cart, checkout and product feeds match.
- **Inside Shopify's own screens** — a "Variant images" block on every product page (status + one-click auto-assign) and an "Auto-assign variant images" bulk action in the product list. Both are Shopify-hosted extensions.
- **Admin in 19 languages** (follows the merchant's Shopify admin language); storefront accessibility labels in 30.

## Why it can be free forever

Nothing runs on a server when shoppers browse:

| Piece | Where it runs | Cost |
|---|---|---|
| Variant image setup | Product metafield (`$app:variant_images.data`) in the merchant's store | Free (Shopify) |
| Shop settings | App-data metafield (`app.metafields.variant_images.settings`) | Free (Shopify) |
| Storefront scripts | Theme app extension assets on Shopify's CDN, data rendered by Liquid | Free (Shopify) |
| Admin UI | Static files; GraphQL calls go straight from the browser to Shopify via App Bridge **Direct API access** | Any static host (runs on the existing Render service; free on Cloudflare Workers) |
| Product page block + bulk action | Admin UI extensions hosted by Shopify | Free (Shopify) |
| Mandatory privacy webhooks | One small handler that verifies the HMAC (same server as the admin) | No per-use cost (webhooks are rare) |

No database, no access tokens to store, no AI API keys. Image matching runs on the merchant's computer. The admin server only hands out static files, so it never grows with the number of shops or shoppers.

## Project layout

```
extensions/variant-images/   Theme app extension (app embed + built storefront scripts + locales)
extensions/product-block/    Admin block on the product page (Shopify-hosted, Preact)
extensions/bulk-action/      Bulk action in the product list (Shopify-hosted, Preact)
src/shared/                  Pure logic shared by admin and storefront (data model, resolution, auto-assign, colors, settings)
src/storefront/              Storefront scripts → built into extensions/variant-images/assets/
  product-entry.ts             gallery filtering + variant tracking (pvi-product.js, ~10 KB gzip)
  swatches-entry.ts            optional swatches add-on (pvi-swatches.js, ~8 KB gzip)
  cards-entry.ts               optional collection-card swatches (pvi-cards.js, ~9 KB gzip)
src/admin/                   Embedded admin (Preact + Polaris web components + App Bridge)
src/server/node.ts           Node server (Render): serves dist/, security headers, webhooks, /healthz
src/worker/                  Webhook verification + the same server as a Cloudflare Worker (alternative host)
harness/ + scripts/harness.mjs  Local theme-like pages for testing the storefront scripts
tests/                       Vitest (unit + DOM tests)
```

## Requirements

- Node.js 20.19+ and npm
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) and a Shopify Partner / Dev Dashboard account with a development store

## Run it on a development store

This project is linked to the **existing Shopify app** that used to be the try-on app ("tryon", client id `de2bb6df4fa93a082338e0276869c84f`) and to the dev store `www-makeit.myshopify.com` — no new app is created.

```bash
npm install
```

```bash
npm run dev
```

The CLI installs a development preview on the dev store: the theme embed, the product block and the bulk action run from your machine, and a watcher rebuilds the storefront scripts. In the app, click **Turn on in theme editor** and save the theme, then assign images to a product and open it in your store.

Because `automatically_update_urls_on_dev` is `false` (Shopify's recommendation for live apps), the app's own pages in the admin still come from the deployed site during `npm run dev`. To work on them inside Shopify, set it to `true` while developing — configuration changes made by `app dev` apply to the development store only — or use the mock admin below.

### Without a store

- Storefront scripts: `npm run build:storefront && npm run harness` → open http://localhost:4455 (Dawn-like, Swiper, Flickity, Slick, legacy, lazy grid and collection pages).
- Admin UI with fake data: `npx vite --port 5199` → open http://localhost:5199/mock.html.

## Deploy (production)

The admin runs on the Render web service that hosted the try-on app (`https://tryonme.onrender.com`, repo `tuvia-anaki/TryOnMe`). Render redeploys on every push to `main`:

- build `npm ci && npm run build`, start `npm run setup && npm run start`, health check `/healthz` — the commands of the service's existing Blueprint ([`render.yaml`](render.yaml)). `setup` does nothing; it exists because that start command calls it.
- The only environment variable used is `SHOPIFY_API_SECRET` (verifies webhooks). The try-on variables (`DATABASE_URL`, `S3_*`, `ENCRYPTION_KEY`, …) are ignored.
- `render.yaml` is intentionally left as the try-on Blueprint: editing it makes Render re-sync the Blueprint, including the old database. The app doesn't use that database — delete it from the Render dashboard when you like.

Push the Shopify side (app name, scopes, URLs, webhooks, theme + admin extensions):

```bash
npm run deploy
```

It refuses to run while `application_url` in `shopify.app.toml` is a placeholder. `automatically_update_urls_on_dev` is off, so `npm run dev` never repoints the live app at a tunnel.

**Other hosts.** The admin is plain static files in `dist/` plus one request handler, so any host works; the HTML response needs the `Content-Security-Policy: frame-ancestors https://<shop> https://admin.shopify.com` header. Cloudflare Workers (free, no cold starts): `npx wrangler login`, `npx wrangler secret put SHOPIFY_API_SECRET`, `npm run deploy:worker`, then put the printed URL in `application_url` and `auth.redirect_urls` and run `npm run deploy`.

## Publishing on the Shopify App Store

- Listing copy, test instructions and screenshot ideas: [`docs/APP_STORE_LISTING.md`](docs/APP_STORE_LISTING.md)
- Privacy policy: served by the app at `/privacy.html` (edit `public/privacy.html`, including the contact address)
- Pricing: choose **Free** in the listing (no Billing API needed)
- Compliance webhooks are verified with HMAC and answered (the app stores no personal data)
- Installation uses Shopify **managed installation** (scopes declared in `shopify.app.toml`): Shopify runs the authorization before the app opens and after reinstalls, so the app contains no OAuth code; the admin authenticates every API call through App Bridge (session tokens / Direct API access)
- Theme changes only through the theme app extension; onboarding shows the app embed status and a deep link that turns it on

## Checks

```bash
npm run check   # typecheck + tests + production build
```

Real-theme compatibility report (needs a folder of theme HTML samples — not included):

```bash
PVI_THEME_SAMPLES=/path/to/theme-samples npx vitest run tests/compat
```

## Storefront events (for developers)

```js
document.addEventListener("pvi:ready", (e) => {});            // product script bound (again after section re-renders)
document.addEventListener("pvi:variant-change", (e) => {});   // e.detail: { productId, variantId, userInitiated }
document.addEventListener("pvi:swatch-click", (e) => {        // e.detail: { productId, option, value }
  // e.preventDefault() stops the swatch from selecting the value in the theme picker
});
window.__pviProduct; // { product, settings, gallery, watcher, … } for debugging
```

## Data format

Product metafield `$app:variant_images` / `data` (type `json`):

```json
{ "v": 1, "g": { "5000000001": [3000000002, 3000000003] }, "s": [3000000001], "h": 1 }
```

- `g`: groups keyed by option-value ids (sorted, `.`-joined for combinations) → media ids; the first media is the group's main image. The most specific matching group(s) win.
- `s`: shared media (always visible). `h`: per-product "hide unassigned" override.

Uninstalling removes app-owned data automatically after a while; **Settings → Remove all data** deletes it immediately.
