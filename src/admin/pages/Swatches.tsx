import type { AppSettings, Shape, SwatchSettings } from "../../shared/settings";
import { backgroundFor, colorsFor, radiusFor, SWATCH_CSS } from "../../storefront/swatches";
import { ColorMapEditor } from "../components/ColorMapEditor";
import { ErrorBanner, Loading } from "../components/common";
import { Card, NumberInput, Select, Toggle } from "../components/fields";
import { t } from "../i18n";
import { useSettingsDraft } from "../lib/draft";

const DEMO_COLORS = ["Red", "Navy", "Heather Grey", "Black/White", "Olive", "Sand", "Burgundy", "Sky Blue"];

/** The swatches exactly as the storefront draws them (same CSS, same color logic). */
function Preview({ settings }: { settings: AppSettings }) {
  const s = settings.swatches;
  const names = [...new Set([...Object.keys(s.colorMap).slice(0, 3), ...DEMO_COLORS])].slice(0, 8);
  const shown = names.slice(0, s.max);
  const buttons = s.style === "button";
  const align = s.align === "center" ? "center" : s.align === "right" ? "flex-end" : "flex-start";
  return (
    <div class="vc-preview-card">
      <div class="vc-preview-card__image" style={{ background: backgroundFor(colorsFor(names[0], settings) ?? ["#ddd"]) }} />
      <div class="vc-preview-card__title">{t("Classic tee")}</div>
      <div class="vc-preview-card__price">$25.00</div>
      <div
        class="vc-preview-swatches"
        style={{ "--vc-size": `${s.size}px`, "--vc-radius": radiusFor(s.shape, s.size), "--vc-align": align } as Record<string, string>}
        ref={(host) => {
          if (!host) return;
          const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
          const row = shown
            .map((name, i) => {
              const colors = colorsFor(name, settings);
              const sold = i === 3;
              const cls = `${sold ? "sold" : ""} ${sold && s.soldOut === "cross" ? "cross" : ""} ${i === 0 ? "" : ""}`;
              if (s.soldOut === "hide" && sold) return "";
              if (buttons || !colors) return `<span class="btn ${cls}" ${i === 0 ? 'aria-current="true"' : ""}>${name}</span>`;
              return `<span class="sw ${cls}" title="${name}" ${i === 0 ? 'aria-current="true"' : ""}><span style="background:${backgroundFor(colors)}"></span></span>`;
            })
            .join("");
          const more = names.length > s.max ? `<span class="more">+${names.length - s.max}</span>` : "";
          root.innerHTML = `<style>${SWATCH_CSS}</style><div class="row">${row}${more}</div>`;
        }}
      />
    </div>
  );
}

export function Swatches() {
  const { context, draft, patch } = useSettingsDraft("vc-swatches-save-bar");
  if (context.error) {
    return (
      <s-page heading={t("Swatches")}>
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!draft) {
    return (
      <s-page heading={t("Swatches")}>
        <Loading />
      </s-page>
    );
  }
  const s = draft.swatches;
  const set = (values: Partial<SwatchSettings>) => patch("swatches", values);

  return (
    <s-page heading={t("Swatches")} inlineSize="base">
      <s-stack direction="block" gap="base">
        <s-query-container>
          <s-grid gridTemplateColumns="@container (inline-size <= 640px) 1fr, minmax(0, 1fr) 280px" gap="base" alignItems="start">
            <s-stack direction="block" gap="base">
              <Card heading={t("Swatches on product cards")} description={t("Color dots (or buttons) under each card on collection and search pages. On regular cards they preview each color's image; on variant cards they link to the other colors.")}>
                <Toggle label={t("Show swatches on cards")} checked={s.enabled} onChange={(enabled) => set({ enabled })} />
                <Select
                  label={t("Options")}
                  value={s.options}
                  options={[
                    ["color", t("Only the color option")],
                    ["all", t("Every option (one row each, up to 3)")],
                  ]}
                  onChange={(options) => set({ options })}
                />
                <Select
                  label={t("Style")}
                  value={s.style}
                  options={[
                    ["auto", t("Color dots for colors, buttons for other options")],
                    ["button", t("Buttons for every option")],
                  ]}
                  onChange={(style) => set({ style })}
                />
                <Select
                  label={t("Color dots show")}
                  value={s.source}
                  options={[
                    ["color", t("The color (from its name or your color list)")],
                    ["image", t("A tiny photo of the variant")],
                  ]}
                  onChange={(source) => set({ source })}
                />
                <Select<"hover" | "click">
                  label={t("On regular cards, show a color's image")}
                  value={s.trigger}
                  options={[
                    ["hover", t("On hover")],
                    ["click", t("On click")],
                  ]}
                  onChange={(trigger) => set({ trigger })}
                />
              </Card>
              <Card heading={t("Look")}>
                <s-grid gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr" gap="base">
                  <Select<Shape>
                    label={t("Shape")}
                    value={s.shape}
                    options={[
                      ["circle", t("Circle")],
                      ["rounded", t("Rounded square")],
                      ["square", t("Square")],
                    ]}
                    onChange={(shape) => set({ shape })}
                  />
                  <Select<"left" | "center" | "right">
                    label={t("Alignment")}
                    value={s.align}
                    options={[
                      ["left", t("Left")],
                      ["center", t("Center")],
                      ["right", t("Right")],
                    ]}
                    onChange={(align) => set({ align })}
                  />
                  <NumberInput label={t("Size")} value={s.size} min={12} max={48} suffix="px" onChange={(size) => set({ size })} />
                  <NumberInput label={t("Swatches per row")} value={s.max} min={1} max={20} details={t("More show as “+3”.")} onChange={(max) => set({ max })} />
                  <Select<"fade" | "cross" | "hide">
                    label={t("Sold-out colors")}
                    value={s.soldOut}
                    options={[
                      ["fade", t("Faded")],
                      ["cross", t("Crossed out")],
                      ["hide", t("Hidden")],
                    ]}
                    onChange={(soldOut) => set({ soldOut })}
                  />
                </s-grid>
              </Card>
              <Card heading={t("Colors")}>
                <ColorMapEditor map={s.colorMap} onChange={(colorMap) => set({ colorMap })} />
              </Card>
            </s-stack>
            <s-section heading={t("Preview")}>
              <Preview settings={draft} />
              {!s.enabled && <s-text color="subdued">{t("Swatches are off: turn them on to show them in your store.")}</s-text>}
            </s-section>
          </s-grid>
        </s-query-container>
      </s-stack>
    </s-page>
  );
}
