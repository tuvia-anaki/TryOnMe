/**
 * Node server for hosts like Render: serves the static admin build (dist/),
 * adds the frame-ancestors security header to HTML documents, verifies and
 * acknowledges Shopify webhooks, and answers /healthz. No database, no state.
 * (src/worker/index.ts does the same job on Cloudflare Workers.)
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { frameAncestors, handleWebhook } from "../worker/webhooks";

const ROOT = join(process.cwd(), "dist");
const PORT = Number(process.env.PORT || 3000);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

async function readBody(req: IncomingMessage): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const buffer = Buffer.concat(chunks);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function fileFor(pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const path = normalize(join(ROOT, decoded));
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return null;
  try {
    const info = await stat(path);
    return info.isFile() ? path : null;
  } catch {
    return null;
  }
}

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname.startsWith("/webhooks")) {
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
    const response = await handleWebhook(new Request(url, { method: req.method, headers, body }), {
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
    });
    send(res, response.status, await response.text());
    return;
  }

  if (url.pathname === "/healthz") return send(res, 200, "ok", { "Cache-Control": "no-store" });
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", { Allow: "GET, HEAD" });

  const file = (await fileFor(url.pathname)) ?? (await fileFor(url.pathname.replace(/\/?$/, ".html")));
  // A missing script or image is a 404 (e.g. a tab still open from before a redeploy), not the app page.
  const ext = extname(url.pathname);
  if (!file && ext && ext !== ".html") return send(res, 404, "Not found", { "Cache-Control": "no-store" });
  const path = file ?? join(ROOT, "index.html");
  const type = TYPES[extname(path)] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": type, "X-Content-Type-Options": "nosniff" };
  if (type.startsWith("text/html")) {
    // Embedded apps may only be framed by the merchant's admin.
    headers["Content-Security-Policy"] = frameAncestors(url);
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Cache-Control"] = "no-cache";
  } else if (url.pathname.startsWith("/assets/")) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  } else {
    headers["Cache-Control"] = "public, max-age=3600";
  }
  // Other unknown paths are client-side routes of the admin (single-page app).
  res.writeHead(200, headers);
  if (req.method === "HEAD") return void res.end();
  createReadStream(path)
    .on("error", () => res.destroy())
    .pipe(res);
}

createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) send(res, 500, "Internal error");
    else res.destroy();
  });
}).listen(PORT, "0.0.0.0", () => console.log(`Prism Variant Images admin on port ${PORT}`));
