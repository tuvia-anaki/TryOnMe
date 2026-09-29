// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableJavaScriptFileLoading":true,"disableCSSFileLoading":true,"disableIframePageLoading":true,"handleDisabledFileLoadingAsSuccess":true,"fetch":{"disableSameOriginPolicy":true}}}
/**
 * Compatibility report against real theme markup samples (not committed:
 * theme HTML belongs to its authors). Point PVI_THEME_SAMPLES at a folder of
 * <theme>.html + <theme>.product.json (the /products/<handle>.js payload):
 *   PVI_THEME_SAMPLES=/path/to/theme-samples npx vitest run tests/compat
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isColorOptionName } from "../../src/shared/product";
import { normalizeProduct, type SFProductRaw } from "../../src/storefront/data";
import { detectLists } from "../../src/storefront/gallery";
import { findNativeOptions } from "../../src/storefront/picker";

const dir = process.env.PVI_THEME_SAMPLES;

/** Real option value ids appear in the markup (value="123" or data-option-value-id); Liquid would give us the same ids. */
function valueIdsFromHtml(root: ParentNode): Map<string, number> {
  const ids = new Map<string, number>();
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>("input[type=radio], option, [data-option-value-id]"))) {
    const attrId = input.getAttribute("data-option-value-id");
    const value = input.getAttribute("value") ?? "";
    if (attrId && /^\d+$/.test(attrId) && value && !/^\d+$/.test(value)) ids.set(value.trim().toLowerCase(), Number(attrId));
    if (/^\d{6,}$/.test(value)) {
      const label =
        (input.id && root.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.closest("label") || input.nextElementSibling;
      const text = label?.textContent?.trim().toLowerCase();
      if (text) ids.set(text, Number(value));
    }
  }
  return ids;
}

function toRaw(json: any, htmlIds: Map<string, number>): SFProductRaw {
  let nextId = 900000000;
  const options = (json.options as any[]).map((o: any, i: number) => ({
    name: typeof o === "string" ? o : o.name,
    position: i + 1,
    values: (typeof o === "string" ? [] : o.values).map((name: string) => ({ id: htmlIds.get(name.trim().toLowerCase()) ?? ++nextId, name })),
  }));
  const variants = json.variants.map((v: any) => [v.id, v.available ? 1 : 0, v.option1, v.option2, v.option3, v.featured_media?.id ?? null]);
  const media = json.media.map((m: any) => ({ id: m.id, type: m.media_type, src: m.preview_image?.src ?? m.src }));
  // Config: each value of the first color-like option -> its variants' featured media.
  const colorIndex = Math.max(0, options.findIndex((o) => isColorOptionName(o.name)));
  const g: Record<string, number[]> = {};
  for (const value of options[colorIndex]?.values ?? []) {
    const ids = json.variants
      .filter((v: any) => v[`option${colorIndex + 1}`] === value.name && v.featured_media?.id)
      .map((v: any) => v.featured_media.id);
    if (ids.length) g[value.id] = [...new Set(ids)] as number[];
  }
  return { id: json.id, handle: json.handle, options, variants, media, selected: null, first: variants[0]?.[0] ?? null, config: { v: 1, g } };
}

const themes = dir ? readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")) : [];

describe.skipIf(!dir)("real theme samples", () => {
  const report: string[] = [];
  for (const theme of themes) {
    it(theme, () => {
      const html = readFileSync(join(dir!, `${theme}.html`), "utf8");
      const json = JSON.parse(readFileSync(join(dir!, `${theme}.product.json`), "utf8"));
      document.body.innerHTML = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");
      const product = normalizeProduct(toRaw(json, valueIdsFromHtml(document.body)));
      const lists = detectLists(document.body, product);
      const found = new Set<number>();
      lists.forEach((l) => l.items.forEach((item) => found.add(l.itemMedia.get(item)!)));
      const native = findNativeOptions(document.body, product);
      const describeEl = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id.slice(0, 30) : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
      report.push(
        `${theme.padEnd(11)} media ${String(found.size).padStart(2)}/${String(product.mediaIds.length).padEnd(2)} lists ${lists.length}: ` +
          lists.map((l) => `${describeEl(l.parent)}[${l.items.length}${l.thumbs ? " thumbs" : ""} ${l.adapter.name}]`).join(" | ") +
          `\n${" ".repeat(12)}options ${native.length}/${product.options.length}: ` +
          native.map((n) => `${product.options[n.index].name}=${n.kind}@${n.blocks.map(describeEl).join("+")} sel=${JSON.stringify(n.read())}`).join(" | "),
      );
      expect(lists.length).toBeGreaterThan(0);
    });
  }
  it("report", () => {
    writeFileSync(join(dir!, "_report.txt"), report.join("\n") + "\n");
  });
});
