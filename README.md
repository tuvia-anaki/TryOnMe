# Variant Cards

A **100% free** Shopify app that shows every product variant as its own product card on collection and search pages — each color gets its own card with its own image, title, price and link. A free alternative to paid apps like *Stamp Show Variants Collection* ($12–$24/month).

- **Variant cards** — one card per color (the color option is found automatically, in any language), per variant, or per value of any other option (Size, Material, Scent…). Cards reuse the theme's own card design, so they look native. Custom titles (`{product} - {value}`, `{vendor}`, `{option1}`…), price formats (theme / "From $X" / "$X – $Y"), sale prices and sold-out badges per variant.
- **Where it runs** — all collections or the ones you choose, the all-products page, search results and (optionally) home page product grids. Works with the theme's filters, sorting and its own infinite scroll.
- **Hide and sort** — hide sold-out variants or variants without their own image, mix variants of different products, sold-out cards last.
- **Per-collection settings** — turn cards on or off for one collection, **drag-and-drop the order** of its variant cards, hide individual cards, or override any setting.
- **Home is the control center** — a status card with the one action that matters ("Turn on in theme editor", "Pause", "Turn back on"), the main settings right there (what gets its own card, the title, where cards show), your collections with their on/off state, and "More settings" for everything else. A warning shows when another variant app is also on in the theme.
- **Simple admin** — big titles, switches and clickable rows, picture choices instead of jargon, the app's own dropdowns, Shopify's collection picker, advanced settings folded away, and Shopify's save bar only on form pages (Home, More settings, a collection) and only while there are unsaved changes.
- **Admin in 19 languages** (follows the Shopify admin, with an in-app language picker); storefront texts ("Sold out", "From $10") in 30 languages.

The app deliberately does one thing: earlier versions also had sections, swatches, add-to-cart buttons and "Load more"; they were removed to keep variant cards fully reliable.

## Why it can be free forever

Nothing runs on a server when shoppers browse:

| Piece | Where it runs | Cost |
|---|---|---|
| Settings | App-data metafield (`app.metafields.variant_cards.settings`) | Free (Shopify) |
| Per-collection settings & card order | App-owned collection metafield (`$app:variant_cards.settings`) | Free (Shopify) |
| Storefront script | Theme app extension (Shopify CDN); product data from Shopify's `/products/<handle>.js` | Free (Shopify) |
| Admin UI | Static files; Admin API calls go straight from the browser to Shopify (App Bridge **Direct API access**) | Any static host |
| Privacy webhooks | One small handler that verifies the HMAC | No per-use cost |

No database, no stored tokens, no per-shop or per-shopper server work. (Click analytics would need a server that grows with traffic, so they're intentionally left out.)

## Project layout

```
extensions/variant-cards/    Theme app extension
  blocks/vc-app-embed.liquid   settings + page context for the script, anti-flash style
  assets/vc-cards.js           the built storefront script
  locales/                     storefront texts (30 languages)
src/shared/                  Pure logic: settings, splitting products into cards, money formats
src/storefront/              Storefront scripts → extensions/variant-cards/assets
  cards.ts                     finds product grids/cards in any theme, loads product data
  patch.ts                     turns a theme card into a variant card (link, image, title, price, forms, badges)
  engine.ts                    splits grids, arranges cards, re-runs when the theme redraws the grid
  context.ts, entry.ts         reads the embed's settings, starts the engine
src/admin/                   Embedded admin (Preact + Polaris web components + App Bridge)
src/server/node.ts           Node server (Render): serves dist/, security headers, webhooks, /healthz
src/worker/                  Webhook verification + the same server as a Cloudflare Worker (alternative host)
tests/                       Vitest: core logic, Liquid (liquidjs), theme status, real-theme compatibility;
                             tests/browser: the real-browser check on theme demo stores
```

## Run it on a development store

This project is linked to the existing Shopify app (client id `de2bb6df4fa93a082338e0276869c84f`) and to the dev store `www-makeit.myshopify.com`.

```bash
npm install
```

```bash
npm run dev
```

The CLI installs a development preview on the dev store (the theme extension runs from your machine; a watcher rebuilds the storefront scripts). Because `automatically_update_urls_on_dev` is `false`, the app's admin pages still come from the deployed site. When you stop, run `shopify app dev clean --store www-makeit.myshopify.com` so the store goes back to the released version.

Variant cards need products with variants (for example a color option with a photo per color).

### Without a store

- Admin UI with fake data: `npx vite --port 5199` → open http://localhost:5199/mock.html (reset the demo data with `vcMockReset()` in the console).
- Real-theme compatibility: `VC_COLLECTION_SAMPLES=/path/to/samples npx vitest run tests/compat` runs the storefront engine on saved collection pages of 34 themes (samples are not in the repo).

## Deploy (production)

The admin runs on the Render web service at `https://tryonme.onrender.com` (repo `tuvia-anaki/TryOnMe`), which redeploys on every push to `main` (build `npm ci && npm run build`, start `npm run setup && npm run start`, health check `/healthz`; `render.yaml` is the service's original Blueprint and intentionally unchanged). The only environment variable used is `SHOPIFY_API_SECRET`.

Push the Shopify side (app name, scopes, webhooks, theme extension):

```bash
npm run deploy
```

**Other hosts.** The admin is static files in `dist/` plus one request handler; any host works if the HTML response carries `Content-Security-Policy: frame-ancestors https://<shop> https://admin.shopify.com`. Cloudflare Workers: `npx wrangler login`, `npx wrangler secret put SHOPIFY_API_SECRET`, `npm run deploy:worker`, then update `application_url` and run `npm run deploy`.

## Checks

```bash
npm run check   # typecheck + tests + production build
```

Real-browser check (needs Google Chrome and internet): loads Shopify's theme demo stores through a local proxy that adds the storefront script, in headless Chrome, and checks every variant card — its own color's photo actually visible, links, title, price, one "Sold out" label, no duplicates:

```bash
npm run test:browser                                # every theme demo
node tests/browser/run.mjs dawn "horizon@/search?q=shirt"   # some themes / pages
```

## Storefront events (for developers)

```js
document.addEventListener("vc:ready", (e) => {});     // e.detail.active: the app splits cards on this page
document.addEventListener("vc:render", (e) => {});    // e.detail: { grid, cards: [{ element, key, variantId }] }
window.VariantCards.refresh();                         // split cards added by other scripts
```

## Data format

Shop settings (`app.metafields.variant_cards.settings`, JSON): see `AppSettings` in `src/shared/settings.ts`. `split.by` is `"auto"` (each color), `"all"` (each variant) or `"option:<name>"` (each value of the option with that name, e.g. `"option:Scent"`).
Collection overrides (`collection.metafields['$app:variant_cards'].settings`, JSON): `CollectionSettings` — `null` fields follow the shop settings; `order` and `hidden` hold card keys like `"8123456789:Red"` (product id + split value) or `"8123456789"` (the whole product).
