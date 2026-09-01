# Virtual Try-On — AI try-on for Shopify product pages

A free Shopify app that adds an AI-powered **"Try It On"** button to product
pages. Shoppers upload (or take) a photo and see a realistic image of
themselves wearing the product. The merchant brings their own AI API key
(OpenAI first) and pays the provider directly — no Shopify billing, no markup.

Built on the official Shopify Remix template: TypeScript, Polaris, App Bridge,
Prisma, and a Theme App Extension (app embed + product app block).

---

## How it works

```
Storefront (theme extension)          App server (Remix)              AI provider
──────────────────────────           ─────────────────────           ───────────
tryon.js (tiny loader)      ──GET──► /proxy/config                  
  └─ click → lazy-loads              (via Shopify App Proxy,
tryon-modal.js                        signature-verified)
  ├─ upload photo           ──POST─► /proxy/upload  → private storage
  ├─ generate               ──POST─► /proxy/generate → TryOnJob ──► images/edits
  └─ poll                   ──POST─► /proxy/job     ◄─ result stored │ (merchant's
                                                       + signed URL  │  encrypted key)
```

- **Merchant API keys** are validated against the provider, encrypted with
  AES-256-GCM (`ENCRYPTION_KEY`), and only ever displayed masked
  (`sk-••••••••8F3K`). They never reach the storefront, Liquid, logs, or
  block settings.
- **All storefront traffic** goes through the Shopify App Proxy
  (`https://{shop}/apps/tryon/*`), so every request is signed by Shopify and
  scoped server-side to shop → visitor → product → job.
- **Prompts are built server-side only** (product-type-aware). The storefront
  can never supply a prompt, and product descriptions are wrapped as
  data so they can't override instructions.
- **Abuse protection**: per-visitor daily limits (merchant configurable,
  default 3), per-shop daily cap, per-IP sliding-window rate limits,
  duplicate-request coalescing, magic-byte MIME validation, size limits.
- **Privacy**: photos/results live in private storage under non-guessable
  keys, served via short-lived signed URLs. Shoppers can delete
  "my photos and try-ons" in one click; retention auto-cleanup, uninstall
  and GDPR webhooks remove everything else.

## Repository tour

```
app/
  lib/
    ai/                 Provider adapter system
      types.ts          AIProvider interface + capability metadata
      registry.ts       Central model + pricing registry (edit prices HERE)
      prompt.ts         Server-side try-on prompt builder (per product type)
      openai.server.ts  OpenAI Images API adapter (fully implemented)
      gemini.server.ts  Scaffolded, marked "coming soon"
      xai.server.ts     Scaffolded, marked "coming soon"
    crypto.server.ts    AES-256-GCM key encryption, masking, hashing
    storage.server.ts   Object storage (local disk w/ signed URLs, or S3/R2)
    jobs.server.ts      Async generation jobs (queued→processing→completed/failed)
    rate-limit.server.ts
    visitor.server.ts   Anonymous visitor identity (hashed tokens) + deletion
    products.server.ts  Server-side product validation via Admin GraphQL
    theme.server.ts     App embed/block detection + theme editor deep links
    retention.server.ts Automatic retention cleanup
  routes/
    app._index.tsx      Home (status, usage, small analytics, activity)
    app.onboarding.tsx  3-step onboarding with live theme detection
    app.design.tsx      Button/modal design + live preview
    app.settings.tsx    API key, model, limits, products, privacy
    proxy.*.tsx         Public storefront API (App Proxy)
    asset.$.tsx         Signed private asset serving (local storage driver)
    webhooks.*.tsx      Uninstall + GDPR compliance
extensions/virtual-try-on/
  blocks/tryon-embed.liquid    App embed (loads the tiny loader script)
  blocks/tryon-button.liquid   Product-page "Try It On" app block
  assets/tryon.js              ~3 KB loader; lazy-loads the modal on click
  assets/tryon-modal.(js|css)  Full modal: upload, camera, generate, result,
                               history, add-to-cart, feedback
prisma/schema.prisma
tests/                         Vitest suite (crypto, limits, isolation, …)
```

## Setup

### 1. Prerequisites

- Node 20.19+ / 22.12+
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) (`npm i -g @shopify/cli`)
- A Shopify Partner account + development store

### 2. Install & configure

```bash
npm install
cp .env.example .env
```

Generate the master encryption key (required — the app won't store AI keys
without it):

```bash
openssl rand -base64 32
```

Put the output in `.env` as `ENCRYPTION_KEY=...`.

### 3. Link to your Partner app

```bash
npm run config:link
```

This fills in `client_id` in `shopify.app.toml`. The required scopes
(`read_products,read_themes`), the app proxy (`/apps/tryon` → `/proxy`) and
webhooks are already configured in the toml and sync on deploy.

### 4. Run locally

```bash
npm run dev
```

The CLI starts a tunnel, updates the app/proxy URLs, runs Prisma migrations,
and offers to install the app on your dev store. Press `p` to open it.

> The dev database is SQLite (`prisma/dev.sqlite`) and uploads go to
> `.data/storage` — zero external services needed locally.

### 5. Deploy the theme extension + app config

```bash
npm run deploy
```

### 6. Merchant flow (what you'll see)

1. Open the app → 3-step onboarding.
2. Step 2 deep-links into the Theme Editor with the app embed pre-activated /
   the Try-On block pre-inserted on the product template — the merchant just
   clicks **Save**. The app polls the theme and flips the checkmarks
   automatically.
3. Step 3: paste an OpenAI API key (validated live, stored encrypted), pick
   **GPT Image 2 · Medium** (recommended, with estimated cost per try-on).
4. Done. The product page shows **✦ Try It On**.

## Production

- **Database**: switch `prisma/schema.prisma` datasource provider to
  `postgresql`, set `DATABASE_URL`, delete `prisma/migrations`, and run
  `npx prisma migrate dev --name init` once to create Postgres migrations.
- **Storage**: set `STORAGE_DRIVER=s3` plus `S3_BUCKET`, `S3_REGION`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and `S3_ENDPOINT` for
  Cloudflare R2 / MinIO). Keep the bucket private — the app uses presigned
  URLs.
- **Secrets**: `ENCRYPTION_KEY` must be set and must never change once
  credentials are stored (rotating it invalidates stored keys — merchants
  would reconnect). `SHOPIFY_API_KEY/SECRET/APP_URL` come from
  `shopify app env pull` or your host's env config.
- **Scale note**: the rate limiter and job runner are in-process (fine for a
  single instance). For multi-instance deployments back the limiter with
  Redis and move `runTryOnJob` onto a queue (BullMQ) — both are isolated
  behind small modules.

## Updating AI models & pricing

Everything lives in `app/lib/ai/registry.ts`: model ids, capability flags
(`supportsVirtualTryOn` etc.), quality options, estimated per-try-on costs,
pricing source + last-updated date. Models that can't do multi-image editing
are shown as **Not supported** — never silently broken. To add a provider,
implement the `AIProvider` interface in `app/lib/ai/<provider>.server.ts` and
register it in `index.server.ts`.

## Tests

```bash
npm test
```

Covers: credential encryption round-trip/tamper rejection, key masking,
rate-limit windows, model capability gating, pricing registry integrity,
prompt building/sanitization, theme embed+block detection, deep-link format,
storage key signing/expiry, product/visitor input validation, and DB
integration tests for shop isolation, visitor ownership, daily limits,
duplicate-request protection, job state transitions, and privacy deletion.
