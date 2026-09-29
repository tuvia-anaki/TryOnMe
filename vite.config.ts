import preact from "@preact/preset-vite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vite";
import { frameAncestors, handleWebhook } from "./src/worker/webhooks.ts";

function tomlClientId(): string {
  const tomls = readdirSync(".").filter((f) => /^shopify\.app(\..+)?\.toml$/.test(f));
  for (const file of ["shopify.app.toml", ...tomls]) {
    if (!existsSync(file)) continue;
    const match = /^\s*client_id\s*=\s*"([^"]+)"/m.exec(readFileSync(file, "utf8"));
    if (match && !match[1].startsWith("YOUR_")) return match[1];
  }
  return "";
}

/**
 * The API key (client id) is public. In development it comes from the env the
 * Shopify CLI sets for the selected app config; production builds take it from
 * shopify.app.toml, so a stale SHOPIFY_API_KEY on the host can't break App Bridge.
 */
function apiKey(command: "build" | "serve"): string {
  const env = process.env.SHOPIFY_API_KEY ?? "";
  return command === "build" ? tomlClientId() || env : env || tomlClientId();
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function shopifyApp(): Plugin {
  let key = "";
  return {
    name: "prism-shopify-app",
    configResolved(config) {
      key = apiKey(config.command);
    },
    transformIndexHtml(html) {
      if (!key && html.includes("%SHOPIFY_API_KEY%")) {
        this.warn?.("SHOPIFY_API_KEY is not set and no client_id was found in shopify.app.toml — App Bridge won't load.");
      }
      return html.replace("%SHOPIFY_API_KEY%", key);
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        // Webhooks in development (e.g. `shopify app webhook trigger`).
        if (url.pathname.startsWith("/webhooks")) {
          const raw = req.method === "POST" ? await readBody(req) : undefined;
          const body = raw ? new Uint8Array(raw).buffer : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const response = await handleWebhook(new Request(url, { method: req.method, headers, body }), {
            SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
          });
          res.statusCode = response.status;
          res.end(await response.text());
          return;
        }
        // Placeholder product photos for mock.html.
        if (url.pathname.startsWith("/mock-img/")) {
          const label = (url.searchParams.get("l") ?? "").replace(/[<&>]/g, "");
          const color = /^#[0-9a-f]{3,6}$/i.test(url.searchParams.get("c") ?? "") ? url.searchParams.get("c") : "#bbb";
          res.setHeader("Content-Type", "image/svg+xml");
          res.end(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#f4f4f4"/><rect x="90" y="70" width="220" height="260" rx="30" fill="${color}"/><text x="200" y="380" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#333">${label}</text></svg>`,
          );
          return;
        }
        if (req.headers.accept?.includes("text/html")) res.setHeader("Content-Security-Policy", frameAncestors(url));
        next();
      });
    },
  };
}

// Shopify CLI runs the dev server behind a tunnel; HMR must go through it.
const appUrl = process.env.SHOPIFY_APP_URL || process.env.HOST || "";
const host = appUrl ? new URL(appUrl).hostname : "localhost";
const hmr =
  host === "localhost"
    ? { protocol: "ws", host: "localhost", port: 64999, clientPort: 64999 }
    : { protocol: "wss", host, port: Number(process.env.FRONTEND_PORT) || 8002, clientPort: 443 };

export default defineConfig({
  plugins: [preact(), shopifyApp()],
  server: {
    host: "localhost",
    port: Number(process.env.PORT || process.env.FRONTEND_PORT || 3000),
    strictPort: true,
    allowedHosts: [host, "localhost"],
    hmr,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: { index: "index.html" } },
  },
});
