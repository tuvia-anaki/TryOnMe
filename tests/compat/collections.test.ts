// @vitest-environment happy-dom
/**
 * Real collection pages from 34 theme demos (not in the repo — set
 * VC_COLLECTION_SAMPLES to a folder with <theme>.html, _sources.tsv and
 * products/<theme>__<handle>.json from the demo stores).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { learnMoneyPattern } from "../../src/shared/money";
import { DEFAULT_SETTINGS, effectiveSettings, sanitizeSettings } from "../../src/shared/settings";
import { clearProductCache, findGrids, handleFromHref, mainScope } from "../../src/storefront/cards";
import type { PageContext } from "../../src/storefront/context";
import { Engine } from "../../src/storefront/engine";

const DIR = process.env.VC_COLLECTION_SAMPLES ?? "";
const run = DIR && existsSync(DIR) ? describe : describe.skip;
const report: string[] = [];
const missingByTheme: Record<string, { base: string; handles: string[] }> = {};

function themes(): { name: string; base: string }[] {
  if (!DIR || !existsSync(DIR)) return [];
  return readFileSync(join(DIR, "_sources.tsv"), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"))
    .map(([name, status]) => ({ name, base: /(https:\/\/[^/ ]+)/.exec(status)![1] }));
}

function fixtures(name: string): Map<string, any> {
  const out = new Map<string, any>();
  for (const file of readdirSync(join(DIR, "products"))) {
    if (!file.startsWith(`${name}__`)) continue;
    try {
      const product = JSON.parse(readFileSync(join(DIR, "products", file), "utf8"));
      if (product?.handle) out.set(product.handle, product);
    } catch {
      /* not JSON (404 page) */
    }
  }
  return out;
}

/** The store's money style, from a card price (the app embed prints a sample instead). */
function patternFrom(card: Element, cents: number) {
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = (walker.currentNode as Text).data.trim();
    const m = /[^\s\d]*\s?\d[\d.,\s ]*\d(?:\s?[A-Z]{3})?(?:\s?[^\s\d\w]+)?/.exec(text);
    if (!m) continue;
    const pattern = learnMoneyPattern(m[0].trim(), cents);
    if (pattern) return pattern;
  }
  return null;
}

run("collection pages of real themes", () => {
  afterAll(() => {
    console.log(`\n${report.join("\n")}\n`);
    if (process.env.VC_MISSING_OUT) require("node:fs").writeFileSync(process.env.VC_MISSING_OUT, JSON.stringify(missingByTheme, null, 1));
  });

  // Grids these themes draw with JavaScript after the page loads (the live script's observer handles them).
  const SCRIPT_RENDERED = new Set(["kalles"]);
  for (const { name, base } of themes()) {
    (SCRIPT_RENDERED.has(name) ? it.skip : it)(`${name}: finds the grid and splits cards`, async () => {
      clearProductCache();
      sessionStorage.clear();
      (window as any).happyDOM.setURL(`${base}/collections/all`);
      // Stylesheets, scripts and frames aren't needed (and happy-dom would try to download them).
      const html = readFileSync(join(DIR, `${name}.html`), "utf8")
        .replace(/<!doctype[^>]*>/i, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
        // happy-dom's parser stops at some inline SVG icons (browsers don't); icons don't matter here.
        .replace(/<svg[\s\S]*?<\/svg>/gi, "");
      document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/i, "").replace(/<\/html>[\s\S]*$/i, "");
      const products = fixtures(name);
      vi.stubGlobal("fetch", async (url: string) => {
        const handle = decodeURIComponent(/\/products\/([^/?#]+)\.js/.exec(String(url))?.[1] ?? "");
        const product = products.get(handle);
        return product ? new Response(JSON.stringify(product)) : new Response("", { status: 404 });
      });

      const grids = findGrids(mainScope());
      expect(grids.length, "no product grid found").toBeGreaterThan(0);
      const grid = grids[0];
      const firstKnown = grid.cards.find((c) => products.has(c.handle));
      const money = firstKnown ? patternFrom(firstKnown.el, products.get(firstKnown.handle).price) : null;
      const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, split: { enabled: true, by: "auto", title: "{product} - {value}" } });
      const ctx: PageContext = {
        template: "collection",
        collection: { handle: "all", id: 1 },
        settings,
        effective: effectiveSettings(settings, null),
        money: money ? [money] : [],
        texts: { from: "From {price}", soldOut: "Sold out" },
        designMode: false,
        root: "/",
      };
      const before = grid.cards.length;
      const missing = grid.cards.map((c) => c.handle).filter((h) => !products.has(h));
      missingByTheme[name] = { base, handles: missing };
      const engine = new Engine(ctx);
      const rendered = await engine.processGrid(grid);
      const split = rendered.filter((r) => r.card.split);

      const problems: string[] = [];
      let titled = 0;
      let imaged = 0;
      let priced = 0;
      let debugged = 0;
      for (const { el, card } of split) {
        const links = Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((a) => handleFromHref(a.getAttribute("href")) === card.product.handle);
        if (!links.length || !links.every((a) => a.getAttribute("href")!.includes(`variant=${card.variant.id}`))) problems.push(`${card.key}: links`);
        const squash = (text: string) => text.replace(/\s+/g, " ");
        if (squash(el.textContent ?? "").includes(squash(`${card.product.title} - ${card.label}`))) titled++;
        const file = card.image?.split("/").pop()?.split("?")[0]?.replace(/\.\w+$/, "") ?? "";
        const matches = Array.from(el.querySelectorAll("img")).filter((img) => (img.getAttribute("src") ?? "").includes(file) || (img.getAttribute("data-src") ?? "").includes(file));
        // The photo must also be visible: not inside something the theme hides (e.g. <slideshow-slide hidden>).
        const visible = (img: Element) => {
          for (let node: Element | null = img; node && node !== el.parentElement; node = node.parentElement) if (node.hasAttribute("hidden")) return false;
          return true;
        };
        const imageOk = matches.some(visible);
        if (card.ownImage && file && imageOk) imaged++;
        if (card.ownImage && file && matches.length && !imageOk) problems.push(`${card.key}: image hidden`);
        if (process.env.VC_DEBUG === name && card.ownImage && file && !imageOk && debugged++ < 2) {
          console.log(`IMAGE MISS ${card.key} want ${file}\n` + Array.from(el.querySelectorAll("img, [data-bgset], [style*='background']")).slice(0, 4).map((n) => n.outerHTML.slice(0, 400)).join("\n"));
        }
        if (process.env.VC_DEBUG === name && !squash(el.textContent ?? "").includes(squash(`${card.product.title} - ${card.label}`)) && debugged++ < 4) {
          console.log(`TITLE MISS ${card.key} title=${JSON.stringify(card.product.title)} text=${JSON.stringify((el.textContent ?? "").replace(/\s+/g, " ").slice(0, 300))}`);
        }
        if (process.env.VC_DEBUG === name && links.some((a) => !a.getAttribute("href")!.includes(`variant=${card.variant.id}`)) && debugged++ < 6) {
          console.log(`LINK MISS ${card.key} ` + links.map((a) => a.outerHTML.slice(0, 200)).join(" | "));
        }
        if (money && el.textContent?.includes(money.prefix.trim() || money.suffix.trim())) priced++;
      }
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const duplicates = ids.length - new Set(ids).size;
      report.push(
        `${name.padEnd(11)} cards ${String(before).padStart(2)} → ${String(rendered.length).padStart(3)} (split ${String(split.length).padStart(2)})` +
          `  title ${titled}/${split.length}  image ${imaged}/${split.filter((r) => r.card.ownImage).length}  price ${money ? `${priced}/${split.length}` : "n/a"}` +
          `${missing.length ? `  no data: ${missing.length}` : ""}` +
          `${problems.length ? `  PROBLEMS: ${problems.slice(0, 3).join(", ")}` : ""}`,
      );
      expect(problems).toEqual([]);
      expect(duplicates, "duplicate ids after copying cards").toBeLessThanOrEqual(ids.length - new Set(ids).size);
      vi.unstubAllGlobals();
    });
  }
});
