// Real-browser check of variant cards on Shopify theme demo stores: headless Chrome (a normally
// rendering page, so the themes' scroll triggers and animations behave as for a shopper) loads each
// demo through a local proxy that adds the app's storefront script, then audit.js checks every card:
// visible photo of its own color, links, title, price, sold-out label, no duplicates.
// Usage: npm run build:storefront && node tests/browser/run.mjs [theme | theme@/path ...]
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
/** Theme demo stores (theme → store). */
const DEMOS = {
  "atelier": "theme-atelier-demo.myshopify.com",
  "be-yours": "beyours-theme-clothing.myshopify.com",
  "broadcast": "broadcast-motif.myshopify.com",
  "dawn": "theme-dawn-demo.myshopify.com",
  "dwell": "theme-dwell-demo.myshopify.com",
  "ella": "new-ella-demo-07.myshopify.com",
  "empire": "empire-theme-supply.myshopify.com",
  "enterprise": "enterprise-theme-digital.myshopify.com",
  "expanse": "expanse-theme-furniture.myshopify.com",
  "fabric": "theme-fabric-demo.myshopify.com",
  "focal": "focal-theme-carbon.myshopify.com",
  "heritage": "theme-heritage-demo.myshopify.com",
  "horizon": "theme-horizon-demo.myshopify.com",
  "impact": "impact-theme-sound.myshopify.com",
  "impulse": "impulse-theme-apparel.myshopify.com",
  "kalles": "kalles-demo-2.myshopify.com",
  "minimog": "demo.minimog.co",
  "motion": "motion-theme-adventure.myshopify.com",
  "palo-alto": "palo-alto-theme-main.myshopify.com",
  "pipeline": "pipeline-botanical.myshopify.com",
  "pitch": "theme-pitch-demo.myshopify.com",
  "prestige": "prestige-theme-vogue.myshopify.com",
  "refresh": "theme-refresh-demo.myshopify.com",
  "ritual": "theme-ritual-demo.myshopify.com",
  "savor": "savor-theme-demo.myshopify.com",
  "sense": "theme-sense-demo.myshopify.com",
  "showcase": "luna-theme.myshopify.com",
  "shrine": "shrine-regular-demo.myshopify.com",
  "stiletto": "stiletto-theme-stiletto.myshopify.com",
  "streamline": "streamline-theme-core.myshopify.com",
  "symmetry": "chantilly.myshopify.com",
  "tinker": "theme-tinker-demo.myshopify.com",
  "vessel": "theme-vessel-demo.myshopify.com",
  "warehouse": "warehouse-theme-metal.myshopify.com"
};
const only = process.argv.slice(2).filter((a) => !a.startsWith("--expr="));
const EXPR = process.argv.find((a) => a.startsWith("--expr="))?.slice(7);
const themes = only.length ? only : Object.keys(DEMOS);

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "vc-audit-"))}`, "--window-size=1280,900", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proxy = spawn(process.execPath, [fileURLToPath(new URL("./proxy.mjs", import.meta.url))], { env: { ...process.env, PORT: "4600" }, stdio: "ignore" });
await sleep(800);

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome didn't start");
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const waiting = new Map();
const events = [];
ws.addEventListener("message", (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && waiting.has(data.id)) {
    waiting.get(data.id)(data);
    waiting.delete(data.id);
  } else if (data.method) events.push(data);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
const results = [];
for (const arg of themes) {
  // "dawn" or "dawn@/search?q=shirt" (another page of that demo store).
  const [theme, path = "/collections/all"] = arg.split("@");
  const host = DEMOS[theme];
  if (!host) continue;
  events.length = 0;
  // VC_SETTINGS='{"swatches":{"enabled":true}}' checks with those app settings.
  const settings = process.env.VC_SETTINGS ? `&settings=${encodeURIComponent(process.env.VC_SETTINGS)}` : "";
  await send("Page.navigate", { url: `http://localhost:4600/__demo/${host}?to=${encodeURIComponent(path)}${settings}` });
  // Wait for the collection page's load event, then give the theme and the app time to run.
  const start = Date.now();
  while (Date.now() - start < 30000 && !events.some((e) => e.method === "Page.loadEventFired" && Date.now() - start > 1500)) await sleep(250);
  await sleep(5000);
  const errors = events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails?.exception?.description?.split("\n")[0] ?? e.params.exceptionDetails?.text);
  const res = await Promise.race([
    send("Runtime.evaluate", {
      expression: EXPR ?? `(async () => { (0, eval)(await (await fetch('/__vc/audit.js', { cache: 'no-store' })).text()); return await window.__vcAudit(60000); })()`,
      awaitPromise: true,
      returnByValue: true,
    }),
    sleep(90000).then(() => ({ result: { value: JSON.stringify({ timeout: true }) } })),
  ]);
  let value;
  try {
    value = JSON.parse(res.result?.result?.value ?? res.result?.value ?? "{}");
  } catch {
    value = { raw: String(res.result?.result?.value ?? JSON.stringify(res.result?.exceptionDetails?.exception?.description ?? res.result?.exceptionDetails ?? res.result)).slice(0, 800) };
  }
  const appErrors = errors.filter((e) => /vc-cards|Variant Cards/i.test(e ?? ""));
  results.push({ theme: arg, ...value, appErrors });
  const swatched = value.swatched ? ` swatches ${String(value.swatched).padStart(2)}` : "";
  console.log(`${arg.padEnd(11)} cards ${String(value.cards ?? "?").padStart(3)} split ${String(value.split ?? "?").padStart(3)}${swatched} issues ${String(value.issueCount ?? "?").padStart(3)}${appErrors.length ? `  APP ERRORS: ${appErrors.join(" | ")}` : ""}`);
  for (const issue of value.issues ?? []) console.log(`      ${issue}`);
  if (EXPR) console.log(JSON.stringify(value, null, 1));
}
ws.close();
chrome.kill();
proxy.kill();
