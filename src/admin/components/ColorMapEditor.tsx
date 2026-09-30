import { useState } from "preact/hooks";
import { colorsForName, parseCssColor, rgbToHex } from "../../shared/colors";
import { isColorOptionName } from "../../shared/product";
import { normalizeText } from "../../shared/text";
import { backgroundFor } from "../../storefront/swatches";
import { gql } from "../api/graphql";
import { t, tn } from "../i18n";
import { toast } from "../lib/hooks";

/** Colors for option value names: found in the store's products, or added by hand. */

const val = (event: Event): string => String((event.currentTarget as any)?.value ?? "");

async function scanColorValues(onProgress: (n: number) => void): Promise<{ name: string; color: string | null }[]> {
  const found = new Map<string, { name: string; color: string | null }>();
  let after: string | null = null;
  let pages = 0;
  for (;;) {
    const data: any = await gql(
      `#graphql
      query ColorValues($after: String) {
        products(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { options { name optionValues { name swatch { color image { image { url(transform: { maxWidth: 80 }) } } } } } }
        }
      }`,
      { after },
    );
    for (const product of data.products.nodes) {
      for (const option of product.options) {
        if (!isColorOptionName(option.name)) continue;
        for (const value of option.optionValues) {
          const key = normalizeText(value.name);
          if (!key || found.has(key)) continue;
          found.set(key, { name: value.name, color: value.swatch?.color ?? null });
        }
      }
    }
    pages += 1;
    onProgress(found.size);
    if (!data.products.pageInfo.hasNextPage || pages >= 40) break;
    after = data.products.pageInfo.endCursor;
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function ColorMapEditor({ map, onChange }: { map: Record<string, string>; onChange: (map: Record<string, string>) => void }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#000000");
  const [scan, setScan] = useState<{ running: boolean; count: number; found: { name: string; color: string | null }[] | null }>({
    running: false,
    count: 0,
    found: null,
  });

  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  const setColor = (key: string, color: string) => onChange({ ...map, [key]: color });
  const remove = (key: string) => {
    const next = { ...map };
    delete next[key];
    onChange(next);
  };

  const runScan = async () => {
    setScan({ running: true, count: 0, found: null });
    try {
      const found = await scanColorValues((count) => setScan((s) => ({ ...s, count })));
      setScan({ running: false, count: found.length, found });
    } catch (error) {
      toast((error as Error).message, true);
      setScan({ running: false, count: 0, found: null });
    }
  };

  const unresolved = (scan.found ?? []).filter((v) => !map[normalizeText(v.name)] && !v.color && !colorsForName(v.name));
  const resolved = (scan.found ?? []).filter((v) => !unresolved.includes(v));
  // The storefront script can't see Shopify's swatch colors: copy them into the app's color list.
  const importable = (scan.found ?? []).filter((v) => v.color && map[normalizeText(v.name)] !== v.color);
  const importAll = () => {
    const next = { ...map };
    for (const v of importable) next[normalizeText(v.name)] = v.color!;
    onChange(next);
  };

  return (
    <s-stack direction="block" gap="base">
      <s-paragraph color="subdued">
        {t("Common color names (Black, Navy, Heather grey, Black/White…) and Shopify's own swatch colors work automatically. Add a color here to override one or to teach the app a custom name like “Ocean Mist”.")}
      </s-paragraph>

      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-button onClick={() => void runScan()} loading={scan.running} disabled={scan.running}>
          {t("Find color names in my products")}
        </s-button>
        {scan.running && <s-text color="subdued">{t("{count} found so far…", { count: scan.count })}</s-text>}
      </s-stack>

      {scan.found && (
        <s-box padding="base" border="base" borderRadius="base">
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">
              {t("{total} color names in your products · {unknown} need a color", { total: scan.found.length, unknown: unresolved.length })}
            </s-text>
            {importable.length > 0 && (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text color="subdued">{tn(importable.length, "{count} color is set in Shopify's swatches.", "{count} colors are set in Shopify's swatches.")}</s-text>
                <s-button onClick={importAll}>{t("Use them on cards")}</s-button>
              </s-stack>
            )}
            {unresolved.length > 0 && (
              <s-stack direction="block" gap="small-200">
                {unresolved.map((v) => (
                  <s-grid key={v.name} gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                    <s-text>{v.name}</s-text>
                    <input
                      type="color"
                      aria-label={t("Color for {name}", { name: v.name })}
                      value="#cccccc"
                      onChange={(event) => setColor(normalizeText(v.name), (event.currentTarget as HTMLInputElement).value)}
                    />
                  </s-grid>
                ))}
              </s-stack>
            )}
            {resolved.length > 0 && (
              <s-stack direction="inline" gap="small-200">
                {resolved.slice(0, 60).map((v) => {
                  const colors = map[normalizeText(v.name)]?.split("/") ?? (v.color ? [v.color] : colorsForName(v.name) ?? []);
                  return (
                    <span class="vc-chip" key={v.name} title={v.name}>
                      <span class="vc-dot" style={{ background: backgroundFor(colors) }} />
                      {v.name}
                    </span>
                  );
                })}
              </s-stack>
            )}
          </s-stack>
        </s-box>
      )}

      {entries.length > 0 && (
        <table class="vc-color-table">
          <tbody>
            {entries.map(([key, color]) => {
              const first = color.split("/")[0];
              const rgb = parseCssColor(first);
              return (
                <tr key={key}>
                  <td style={{ width: "32px" }}>
                    <span class="vc-dot" style={{ background: backgroundFor(color.split("/")) }} />
                  </td>
                  <td>{key}</td>
                  <td style={{ width: "60px" }}>
                    <input
                      type="color"
                      aria-label={t("Color for {name}", { name: key })}
                      value={rgb ? rgbToHex(rgb) : "#000000"}
                      onChange={(event) => setColor(key, (event.currentTarget as HTMLInputElement).value)}
                    />
                  </td>
                  <td style={{ width: "90px", textAlign: "right" }}>
                    <s-button variant="tertiary" tone="critical" onClick={() => remove(key)}>
                      {t("Remove")}
                    </s-button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <s-grid gridTemplateColumns="1fr auto auto" gap="base" alignItems="end">
        <s-text-field label={t("Color name")} placeholder={t("e.g. Ocean Mist")} value={newName} onInput={(event) => setNewName(val(event))} />
        <input type="color" aria-label={t("New color")} value={newColor} onInput={(event) => setNewColor((event.currentTarget as HTMLInputElement).value)} style={{ height: "36px", width: "48px" }} />
        <s-button
          disabled={!normalizeText(newName)}
          onClick={() => {
            setColor(normalizeText(newName), newColor);
            setNewName("");
          }}
        >
          {t("Add")}
        </s-button>
      </s-grid>
    </s-stack>
  );
}

