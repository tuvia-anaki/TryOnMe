import { useEffect, useRef, useState } from "preact/hooks";
import { colorsForName, rgbToHex, parseCssColor } from "../../shared/colors";
import { isColorOptionName } from "../../shared/product";
import { sanitizeSettings, type AppSettings } from "../../shared/settings";
import { normalizeText } from "../../shared/text";
import { backgroundFor, radiusFor, visualFor } from "../../storefront/swatch-style";
import { applySwatchState, createSwatchGroup } from "../../storefront/swatches";
import { gql } from "../api/graphql";
import { loadAppContext, saveSettings, type AppContext } from "../api/settings";
import { ErrorBanner, Loading } from "../components/common";
import { t } from "../i18n";
import { toast, useAsync, useSaveBar } from "../lib/hooks";

const DEMO_COLORS = ["Black", "Navy", "Heather Grey", "Sage", "Burgundy", "Black/White"];
const DEMO_SIZES = ["XS", "S", "M", "L", "XL"];

/** Renders real storefront swatches (same code, same CSS) with the draft settings. */
function LivePreview({ settings, colors }: { settings: AppSettings; colors: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ color: string; size: string }>({ color: colors[1] ?? colors[0], size: "M" });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = "";
    const strings = { soldOut: t("Sold out"), unavailable: t("Unavailable") };
    const colorDom = createSwatchGroup({
      optionName: t("Color"),
      values: colors.map((name) => ({ name, visual: visualFor({ name }, settings) })),
      settings,
      idPrefix: "pvi-preview-color",
    });
    const sizeDom = createSwatchGroup({
      optionName: t("Size"),
      values: DEMO_SIZES.map((name) => ({ name, visual: { kind: "text" as const } })),
      settings,
      idPrefix: "pvi-preview-size",
    });
    // The last color is sold out, and XL is sold out, so the sold-out style is visible.
    applySwatchState(colorDom, selected.color, (v) => (v === colors[colors.length - 1] ? "soldout" : "available"), settings, strings);
    applySwatchState(sizeDom, selected.size, (v) => (v === "XL" ? "soldout" : "available"), settings, strings);
    colorDom.buttons.forEach((b) => b.addEventListener("click", () => setSelected((s) => ({ ...s, color: b.dataset.value ?? s.color }))));
    sizeDom.buttons.forEach((b) => b.addEventListener("click", () => setSelected((s) => ({ ...s, size: b.dataset.value ?? s.size }))));
    root.appendChild(colorDom.host);
    if (settings.swatches.otherOptions === "pills") root.appendChild(sizeDom.host);
  }, [settings, colors, selected]);
  return <div class="pvi-swatch-preview" ref={ref} />;
}

function CardPreview({ settings, colors }: { settings: AppSettings; colors: string[] }) {
  const c = settings.cards;
  const shown = colors.slice(0, c.max);
  return (
    <div class="pvi-swatch-preview" style={{ maxWidth: "220px" }}>
      <div style={{ aspectRatio: "1", background: "#f2f2f2", borderRadius: "8px", marginBottom: "8px" }} />
      <div style={{ fontWeight: 500 }}>{t("Classic tee")}</div>
      <div style={{ fontSize: "13px", color: "#616161", marginBottom: "6px" }}>$29.00</div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", justifyContent: c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start" }}>
        {shown.map((name) => {
          const visual = visualFor({ name }, settings);
          return (
            <span
              key={name}
              title={name}
              style={{
                width: `${c.size}px`,
                height: `${c.size}px`,
                borderRadius: radiusFor(c.shape, c.size),
                background: visual.kind === "color" ? visual.background : visual.kind === "image" ? `center/cover url("${visual.image}")` : "#ddd",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)",
                display: "inline-block",
              }}
            />
          );
        })}
        {colors.length > shown.length && <span style={{ fontSize: "12px" }}>+{colors.length - shown.length}</span>}
      </div>
    </div>
  );
}

function num(event: Event, fallback: number): number {
  const value = Number((event.currentTarget as any)?.value);
  return Number.isFinite(value) ? value : fallback;
}

const val = (event: Event): string => String((event.currentTarget as any)?.value ?? "");
const checked = (event: Event): boolean => !!(event.currentTarget as any)?.checked;

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

function ColorMapEditor({ settings, onChange }: { settings: AppSettings; onChange: (map: Record<string, string>) => void }) {
  const map = settings.swatches.colorMap;
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
                    <span class="pvi-chip" key={v.name} title={v.name}>
                      <span class="pvi-dot" style={{ background: backgroundFor(colors) }} />
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
        <table class="pvi-color-table">
          <tbody>
            {entries.map(([key, color]) => {
              const first = color.split("/")[0];
              const rgb = parseCssColor(first);
              return (
                <tr key={key}>
                  <td style={{ width: "32px" }}>
                    <span class="pvi-dot" style={{ background: backgroundFor(color.split("/")) }} />
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

function SwatchesForm({ context }: { context: AppContext }) {
  const [draft, setDraft] = useState<AppSettings>(context.settings);
  const [saved, setSaved] = useState<AppSettings>(context.settings);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const s = draft.swatches;
  const c = draft.cards;

  const update = (patch: Partial<AppSettings["swatches"]>) => setDraft((d) => sanitizeSettings({ ...d, swatches: { ...d.swatches, ...patch } }));
  const updatePill = (patch: Partial<AppSettings["swatches"]["pill"]>) => update({ pill: { ...s.pill, ...patch } });
  const updateCards = (patch: Partial<AppSettings["cards"]>) => setDraft((d) => sanitizeSettings({ ...d, cards: { ...d.cards, ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const clean = await saveSettings(context, draft);
      setDraft(clean);
      setSaved(clean);
      toast(t("Saved"));
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  useSaveBar("pvi-swatches-save-bar", dirty, saving, { onSave: () => void save(), onDiscard: () => setDraft(saved) }, { save: t("Save"), discard: t("Discard") });

  const previewColors = [...new Set([...Object.keys(s.colorMap).slice(0, 3), ...DEMO_COLORS])].slice(0, 7);

  return (
    <s-page heading={t("Swatches")} inlineSize="base">
      <s-button slot="primary-action" variant="primary" disabled={!dirty || saving} loading={saving} onClick={() => void save()}>
        {t("Save")}
      </s-button>

      <s-section heading={t("Product page swatches")}>
        <s-stack direction="block" gap="base">
          <s-switch
            label={t("Show swatches instead of the theme's option picker")}
            checked={s.enabled}
            onChange={(event) => update({ enabled: checked(event) })}
          />
          <s-paragraph color="subdued">
            {t("Swatches drive your theme's own picker behind the scenes, so price, stock and the add-to-cart button keep working exactly as before.")}
          </s-paragraph>
          <LivePreview settings={draft} colors={previewColors} />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-select label={t("Options that get visual swatches")} value={s.applyTo} onChange={(event) => update({ applyTo: val(event) as any })}>
              <s-option value="color">{t("Color options (Color, Colour, Farbe…)")}</s-option>
              <s-option value="all">{t("All options")}</s-option>
              <s-option value="custom">{t("Options I name")}</s-option>
            </s-select>
            <s-select label={t("Other options (like Size)")} value={s.otherOptions} onChange={(event) => update({ otherOptions: val(event) as any })}>
              <s-option value="pills">{t("Buttons")}</s-option>
              <s-option value="native">{t("Keep the theme's picker")}</s-option>
            </s-select>
          </s-grid>
          {s.applyTo === "custom" && (
            <s-text-field
              label={t("Option names (comma separated)")}
              value={s.customOptions.join(", ")}
              onChange={(event) => update({ customOptions: val(event).split(",").map((x) => x.trim()).filter(Boolean) })}
            />
          )}
          <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
            <s-select label={t("Swatch shows")} value={s.source} onChange={(event) => update({ source: val(event) as any })}>
              <s-option value="auto">{t("Automatic")}</s-option>
              <s-option value="color">{t("Color")}</s-option>
              <s-option value="image">{t("Variant image")}</s-option>
            </s-select>
            <s-select label={t("Shape")} value={s.shape} onChange={(event) => update({ shape: val(event) as any })}>
              <s-option value="circle">{t("Circle")}</s-option>
              <s-option value="rounded">{t("Rounded square")}</s-option>
              <s-option value="square">{t("Square")}</s-option>
            </s-select>
            <s-select label={t("Sold out values")} value={s.soldOut} onChange={(event) => update({ soldOut: val(event) as any })}>
              <s-option value="cross">{t("Cross out")}</s-option>
              <s-option value="fade">{t("Fade")}</s-option>
              <s-option value="hide">{t("Hide")}</s-option>
            </s-select>
          </s-grid>
          <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
            <s-number-field label={t("Size (px)")} value={String(s.size)} min={16} max={120} onChange={(event) => update({ size: num(event, s.size) })} />
            <s-number-field label={t("Spacing (px)")} value={String(s.gap)} min={0} max={40} onChange={(event) => update({ gap: num(event, s.gap) })} />
            <s-number-field label={t("Border (px)")} value={String(s.borderWidth)} min={0} max={6} onChange={(event) => update({ borderWidth: num(event, s.borderWidth) })} />
          </s-grid>
          <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
            <s-color-field label={t("Border color")} value={s.borderColor} onChange={(event) => update({ borderColor: val(event) })} />
            <s-color-field label={t("Selected ring")} value={s.selectedColor} onChange={(event) => update({ selectedColor: val(event) })} />
            <s-number-field label={t("Ring gap (px)")} value={String(s.ringOffset)} min={0} max={8} onChange={(event) => update({ ringOffset: num(event, s.ringOffset) })} />
          </s-grid>
          <s-stack direction="inline" gap="large">
            <s-checkbox label={t("Show option name and selected value")} checked={s.showLabel} onChange={(event) => update({ showLabel: checked(event) })} />
            <s-checkbox label={t("Show value name on hover")} checked={s.tooltip} onChange={(event) => update({ tooltip: checked(event) })} />
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading={t("Buttons (text options)")}>
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          <s-number-field label={t("Corner radius (px)")} value={String(s.pill.radius)} min={0} max={40} onChange={(event) => updatePill({ radius: num(event, s.pill.radius) })} />
          <s-color-field label={t("Background")} value={s.pill.background} onChange={(event) => updatePill({ background: val(event) })} />
          <s-color-field label={t("Text")} value={s.pill.text} onChange={(event) => updatePill({ text: val(event) })} />
          <s-color-field label={t("Border")} value={s.pill.border} onChange={(event) => updatePill({ border: val(event) })} />
          <s-color-field label={t("Selected background")} value={s.pill.selectedBackground} onChange={(event) => updatePill({ selectedBackground: val(event) })} />
          <s-color-field label={t("Selected text")} value={s.pill.selectedText} onChange={(event) => updatePill({ selectedText: val(event) })} />
        </s-grid>
      </s-section>

      <s-section heading={t("Colors")}>
        <ColorMapEditor settings={draft} onChange={(colorMap) => update({ colorMap })} />
      </s-section>

      <s-section heading={t("Collection page swatches")}>
        <s-stack direction="block" gap="base">
          <s-switch label={t("Show color swatches on product cards")} checked={c.enabled} onChange={(event) => updateCards({ enabled: checked(event) })} />
          <s-paragraph color="subdued">
            {t("Adds small color dots under products in collections, search results and product lists. Hovering (or clicking) a dot shows that color's image.")}
          </s-paragraph>
          <s-grid gridTemplateColumns="auto 1fr" gap="large" alignItems="start">
            <CardPreview settings={draft} colors={previewColors} />
            <s-stack direction="block" gap="base">
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-number-field label={t("Size (px)")} value={String(c.size)} min={12} max={48} onChange={(event) => updateCards({ size: num(event, c.size) })} />
                <s-number-field label={t("Show at most")} value={String(c.max)} min={1} max={20} onChange={(event) => updateCards({ max: num(event, c.max) })} />
              </s-grid>
              <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                <s-select label={t("Shape")} value={c.shape} onChange={(event) => updateCards({ shape: val(event) as any })}>
                  <s-option value="circle">{t("Circle")}</s-option>
                  <s-option value="rounded">{t("Rounded square")}</s-option>
                  <s-option value="square">{t("Square")}</s-option>
                </s-select>
                <s-select label={t("Image changes on")} value={c.trigger} onChange={(event) => updateCards({ trigger: val(event) as any })}>
                  <s-option value="hover">{t("Hover")}</s-option>
                  <s-option value="click">{t("Click")}</s-option>
                </s-select>
                <s-select label={t("Alignment")} value={c.align} onChange={(event) => updateCards({ align: val(event) as any })}>
                  <s-option value="left">{t("Left")}</s-option>
                  <s-option value="center">{t("Center")}</s-option>
                  <s-option value="right">{t("Right")}</s-option>
                </s-select>
              </s-grid>
            </s-stack>
          </s-grid>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export function Swatches() {
  const context = useAsync(() => loadAppContext(), []);
  if (context.error) {
    return (
      <s-page heading={t("Swatches")}>
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!context.data) {
    return (
      <s-page heading={t("Swatches")}>
        <Loading />
      </s-page>
    );
  }
  return <SwatchesForm context={context.data} />;
}

