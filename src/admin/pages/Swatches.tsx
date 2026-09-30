import { useState } from "preact/hooks";
import { ErrorBanner, Loading } from "../components/common";
import { TEE } from "../components/SplitVisual";
import { PageHeader, Panel, ToggleRow } from "../components/ui";
import { msg, t } from "../i18n";
import { useSettingsDraft } from "../lib/draft";

const COLORS: [string, string][] = [
  [msg("Red"), "#d0312d"],
  [msg("Blue"), "#2f6fdf"],
  [msg("Green"), "#2e8b57"],
];

/** A product card as shoppers see it, with swatches that work. */
function Preview({ on }: { on: boolean }) {
  const [picked, setPicked] = useState(0);
  const [name, color] = COLORS[picked];
  return (
    <div class="vc-preview">
      <div class="vc-preview__card">
        <div class="vc-preview__photo">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={TEE} fill={color} stroke="rgba(0,0,0,.18)" stroke-width="0.5" />
          </svg>
        </div>
        <div class="vc-preview__title">
          {t("T-shirt")} - {t(name)}
        </div>
        <div class="vc-preview__price">$25.00</div>
        {on && (
          <div class="vc-preview__swatches" role="group" aria-label={t("Color")}>
            {COLORS.map(([value, hex], i) => (
              <button key={value} type="button" class="vc-preview__swatch" aria-pressed={i === picked} aria-label={t(value)} title={t(value)} onClick={() => setPicked(i)}>
                <span style={{ background: hex }} />
              </button>
            ))}
          </div>
        )}
      </div>
      <p class="vc-muted">{on ? t("Try it: pick a color.") : t("Turn swatches on to see them here.")}</p>
    </div>
  );
}

/** Swatches: one switch, a card that shows what it does, and what to expect. */
export function Swatches() {
  // A form: changes are saved with Shopify's save bar, which appears once something changes.
  const { context, draft, patch } = useSettingsDraft("vc-swatches-save-bar");
  const header = (
    <PageHeader
      title={t("Swatches")}
      subtitle={t("Color dots under each product card. Shoppers pick one, and the card shows that color: its photo, name, price and link.")}
      back={{ label: t("Home"), to: "/" }}
    />
  );

  if (context.error) {
    return (
      <s-page inlineSize="base">
        {header}
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!draft) {
    return (
      <s-page inlineSize="base">
        {header}
        <Loading />
      </s-page>
    );
  }

  return (
    <s-page inlineSize="base">
      {header}
      <div class="vc-stack">
        <Panel>
          <ToggleRow
            title={t("Swatches on product cards")}
            description={t("On every page that shows variant cards.")}
            checked={draft.swatches.enabled}
            onChange={(enabled) => patch("swatches", { enabled })}
          />
          <Preview on={draft.swatches.enabled} />
        </Panel>

        <Panel title={t("Good to know")}>
          <ul class="vc-bullets">
            <li>{t("Each dot shows the color in the variant's name, like Navy, or else a small photo of that variant.")}</li>
            <li>{t("Sold-out colors look faded. Shoppers can still pick them to see the photo.")}</li>
            <li>{t("With “One card per product” on Home, swatches are how shoppers pick a color.")}</li>
          </ul>
        </Panel>
      </div>
    </s-page>
  );
}
