import type { AppSettings, Shape, SwatchSettings } from "../../shared/settings";
import { backgroundFor, colorsFor, radiusFor, SWATCH_CSS } from "../../storefront/swatches";
import { ColorMapEditor } from "../components/ColorMapEditor";
import { ErrorBanner, Loading } from "../components/common";
import { Disclosure } from "../components/Disclosure";
import { Card, Check, NumberInput, Select } from "../components/fields";
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
  // A form: saved with Shopify's save bar once something changes.
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
      <s-query-container>
        <s-grid gridTemplateColumns="@container (inline-size <= 640px) 1fr, 1fr 260px" gap="base" alignItems="start">
          <s-stack direction="block" gap="base">
            <Card heading={t("Swatches on cards")}>
              <Check
                label={t("Show color swatches under each card")}
                details={t("On collection and search pages. Shoppers click them to see the other colors.")}
                checked={s.enabled}
                onChange={(enabled) => set({ enabled })}
              />
            </Card>
            {s.enabled && (
              <>
                <Card heading={t("What they show")}>
                  <s-query-container>
                    <s-grid gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr" gap="base">
                      <Select
                        label={t("Options")}
                        value={s.options}
                        options={[
                          ["color", t("Only colors")],
                          ["all", t("All options"), t("One row each, up to 3")],
                        ]}
                        onChange={(options) => set({ options })}
                      />
                      <Select
                        label={t("Style")}
                        value={s.style}
                        options={[
                          ["auto", t("Dots for colors"), t("Buttons for other options")],
                          ["button", t("Buttons only")],
                        ]}
                        onChange={(style) => set({ style })}
                      />
                      <Select
                        label={t("Color dots show")}
                        value={s.source}
                        options={[
                          ["color", t("The color"), t("From its name or your color list")],
                          ["image", t("A tiny photo"), t("Of that color's variant")],
                        ]}
                        onChange={(source) => set({ source })}
                      />
                      <Select<"hover" | "click">
                        label={t("Switch the photo on")}
                        details={t("On cards that show a whole product.")}
                        value={s.trigger}
                        options={[
                          ["hover", t("Hover")],
                          ["click", t("Click")],
                        ]}
                        onChange={(trigger) => set({ trigger })}
                      />
                    </s-grid>
                  </s-query-container>
                </Card>
                <Card heading={t("Look")}>
                  <s-query-container>
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
                  </s-query-container>
                </Card>
                <Disclosure title={t("Color names")} summary={t("Teach the app names like “Ocean Mist”")} defaultOpen={Object.keys(s.colorMap).length > 0}>
                  <s-section>
                    <ColorMapEditor map={s.colorMap} onChange={(colorMap) => set({ colorMap })} />
                  </s-section>
                </Disclosure>
              </>
            )}
          </s-stack>
          <s-section heading={t("Preview")}>
            <Preview settings={draft} />
            {!s.enabled && <s-text color="subdued">{t("Turn swatches on to show them in your store.")}</s-text>}
          </s-section>
        </s-grid>
      </s-query-container>
    </s-page>
  );
}
