// Local storefront harness: serves theme-like pages that embed the built
// storefront scripts, plus fake images and /products/<handle>.js.
// Usage: npm run build:storefront && npm run harness  (PORT env, default 4455)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "../harness/pages.mjs";
import { ajaxProduct, colorOf } from "../harness/fixture.mjs";

const port = Number(process.env.PORT || 4455);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "extensions/variant-images/assets");

function svg(label, color) {
  const text = label.replace(/[<&>]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="${color}"/><text x="400" y="410" font-family="sans-serif" font-size="44" fill="#fff" text-anchor="middle" stroke="#000" stroke-width="1">${text}</text></svg>`;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const path = url.pathname;
  try {
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset=utf-8><title>Harness</title><body style="font-family:system-ui;padding:20px"><h1>Variant images harness</h1><ul>${Object.keys(SCENARIOS)
        .map((k) => `<li><a href="/s/${k}">${k}</a></li>`)
        .join("")}</ul></body>`);
      return;
    }
    const scenario = /^\/s\/([a-z-]+)$/.exec(path);
    if (scenario && SCENARIOS[scenario[1]]) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(SCENARIOS[scenario[1]]());
      return;
    }
    if (path.startsWith("/assets/")) {
      const file = normalize(join(assetsDir, path.slice("/assets/".length)));
      if (!file.startsWith(assetsDir)) throw new Error("bad path");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": extname(file) === ".css" ? "text/css" : "text/javascript", "cache-control": "no-store" });
      res.end(body);
      return;
    }
    const product = /^\/products\/([^/]+)\.js$/.exec(path);
    if (product) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(ajaxProduct(decodeURIComponent(product[1]))));
      return;
    }
    if (/\.(jpe?g|png|webp|gif)$/i.test(path)) {
      const name = decodeURIComponent(path.split("/").pop()).replace(/\.\w+$/, "");
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=3600" });
      res.end(svg(name, colorOf(name)));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
}).listen(port, () => console.log(`Harness on http://localhost:${port}`));
