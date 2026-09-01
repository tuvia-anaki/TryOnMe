# Deploying Virtual Try-On

Production runs on three services:

| Piece | What it does | Recommended |
| --- | --- | --- |
| Web service | Runs the Remix app | Render (Node) |
| PostgreSQL | Shops, settings, encrypted keys, try-on jobs | Render Postgres |
| Object storage | Shopper photos + generated images | Cloudflare R2 (S3-compatible) |

Object storage is **not optional**: Render's disk is wiped on every deploy, so
storing images locally would delete every shopper's try-on history.

---

## 1. Push the code to GitHub

Render deploys from a git repo.

```bash
gh repo create virtual-try-on --private --source=. --push
```

`.env` is gitignored — secrets go in Render's dashboard, never in the repo.

## 2. Create the object storage bucket (Cloudflare R2)

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `virtual-try-on`).
   Keep it **private** — the app serves images through short-lived signed URLs.
2. **Manage R2 API Tokens** → create a token with **Object Read & Write**.
3. Note these four values:
   - Bucket name
   - Access Key ID
   - Secret Access Key
   - Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

## 3. Create the Render services

Render Dashboard → **New** → **Blueprint** → pick this repo. It reads
[`render.yaml`](render.yaml) and creates the web service + Postgres together
(`DATABASE_URL` is wired automatically).

Render will prompt for the secrets below. Set them in
**Web service → Environment**:

| Variable | Value |
| --- | --- |
| `SHOPIFY_API_KEY` | Partner app → API key |
| `SHOPIFY_API_SECRET` | Partner app → API secret key |
| `SHOPIFY_APP_URL` | Your Render URL, e.g. `https://virtual-try-on.onrender.com` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — see the warning below |
| `S3_BUCKET` | R2 bucket name |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | R2 token key id |
| `S3_SECRET_ACCESS_KEY` | R2 token secret |

> **⚠️ `ENCRYPTION_KEY` is unrecoverable.** It decrypts every merchant's stored
> AI API key. If it's lost or changed, every merchant must reconnect their
> provider. Generate it once, store it in a password manager, never rotate it
> casually.

The first deploy runs `prisma migrate deploy`, creating all tables. Check
`https://<your-app>.onrender.com/healthz` returns `ok` — it verifies the app
can reach the database.

## 4. Point the Shopify app at production

In `shopify.app.tryon.toml`, replace the dev tunnel URLs with your Render URL:

```toml
application_url = "https://virtual-try-on.onrender.com"

[app_proxy]
url = "https://virtual-try-on.onrender.com/proxy"
subpath = "tryon"
prefix = "apps"

[auth]
redirect_urls = [ "https://virtual-try-on.onrender.com/auth/callback" ]

[build]
automatically_update_urls_on_dev = false   # stop dev from overwriting these
```

Then push the config and the theme extension to Shopify:

```bash
npm run deploy
```

Install the app on a store and confirm: onboarding loads, a key connects, and a
storefront try-on generates end to end.

## 5. Submit to the Shopify App Store

Partner Dashboard → your app → **Distribution** → Public app. You'll need:

- Listing copy, screenshots, and an app icon
- A privacy policy URL and a support email
- Pricing: **Free** (merchants pay their AI provider directly)
- Test instructions telling reviewers the app is bring-your-own-API-key, and
  ideally a test key so they can generate a try-on

The mandatory GDPR webhooks (`customers/data_request`, `customers/redact`,
`shop/redact`) are already implemented.

---

## Local development after switching to Postgres

The app no longer uses SQLite. For local dev, put your Render database's
**External** connection string in `.env` as `DATABASE_URL`, then:

```bash
npm run dev
```

For a separate dev database, create a second (free) Postgres on Render or Neon
and point `.env` at that instead — safer than sharing production data.

## Operational notes

- **Single instance only.** Rate limiting and the retention sweep keep state in
  memory (`numInstances: 1` in `render.yaml`). Before scaling out, move both to
  Redis — otherwise limits apply per-instance and are trivially bypassed.
- **Generation runs in-process.** A deploy mid-generation interrupts jobs; they
  are auto-failed after 10 minutes so shoppers see a real error and can retry.
  At higher volume, move generation to a queue (BullMQ) with its own worker.
- **Free-tier sleeping.** On Render's free plan the service sleeps when idle,
  which stalls storefront try-ons on first request. Use a paid instance for a
  live store — `render.yaml` defaults to `starter`.
- **Retention.** Shopper photos and results are deleted automatically after each
  shop's retention window (default 90 days); shoppers can also delete their own
  data from the try-on window.
