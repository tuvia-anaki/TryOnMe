import type { PriceFormat } from "../../shared/settings";
import { TitlePicker } from "../components/choices";
import { ErrorBanner, Loading } from "../components/common";
import { Disclosure } from "../components/Disclosure";
import { Area, Select, Text } from "../components/fields";
import { PageHeader, Panel, ToggleList, ToggleRow } from "../components/ui";
import { t } from "../i18n";
import { useSettingsDraft } from "../lib/draft";

/** Price choices: [value, label, example]. */
export function priceChoices(): [PriceFormat, string, string][] {
  return [
    ["theme", t("Like your theme"), t("Your theme's usual price")],
    ["from", t("Lowest price"), t("From {price}", { price: "$10" })],
    ["range", t("Price range"), "$10 – $15"],
  ];
}

/** Card order choices: [value, label, example]. */
export function orderChoices(): ["together" | "mix", string, string][] {
  return [
    ["together", t("Keep each product's cards together"), t("Red tee, blue tee, red hoodie…")],
    ["mix", t("Mix products"), t("Red tee, red hoodie, blue tee…")],
  ];
}

/** The settings most stores never change (the main ones are on Home). */
export function Settings() {
  // A form: changes are saved with Shopify's save bar, which appears once something changes.
  const { context, draft, patch } = useSettingsDraft("vc-settings-save-bar");
  const header = <PageHeader title={t("More settings")} back={{ label: t("Home"), to: "/" }} />;

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
  const s = draft;

  return (
    <s-page inlineSize="base">
      {header}
      <div class="vc-stack">
        <Panel title={t("Cards")}>
          <div class="vc-columns">
            {s.split.enabled && (
              <TitlePicker title={s.split.title} by={s.split.by} onChange={(title) => patch("split", { title })} />
            )}
            <Select<PriceFormat>
              label={t("Price")}
              details={t("When a card's sizes cost different amounts.")}
              value={s.price.format}
              options={priceChoices()}
              onChange={(format) => patch("price", { format })}
            />
            <Select<"together" | "mix">
              label={t("Card order")}
              value={s.order.mix ? "mix" : "together"}
              options={orderChoices()}
              onChange={(order) => patch("order", { mix: order === "mix" })}
            />
          </div>
        </Panel>

        <Panel title={t("Sold out and missing photos")}>
          <ToggleList>
            <ToggleRow
              title={t("Hide sold-out cards")}
              description={t("A product that's completely sold out keeps one card.")}
              checked={s.hide.soldOut}
              onChange={(soldOut) => patch("hide", { soldOut })}
            />
            <ToggleRow title={t("Show sold-out cards last")} checked={s.order.soldOutLast} onChange={(soldOutLast) => patch("order", { soldOutLast })} />
            <ToggleRow title={t("“Sold out” badge")} checked={s.card.soldOutBadge} onChange={(soldOutBadge) => patch("card", { soldOutBadge })} />
            <ToggleRow
              title={t("Hide cards without their own photo")}
              description={t("Cards that would show the product's main photo instead.")}
              checked={s.hide.noImage}
              onChange={(noImage) => patch("hide", { noImage })}
            />
          </ToggleList>
        </Panel>

        <Panel title={t("Also show cards on")}>
          <ToggleList>
            <ToggleRow title={t("All products page")} checked={s.pages.allProducts} onChange={(allProducts) => patch("pages", { allProducts })} />
            <ToggleRow title={t("Search results")} checked={s.pages.search} onChange={(search) => patch("pages", { search })} />
            <ToggleRow title={t("Product grids on the home page")} checked={s.pages.home} onChange={(home) => patch("pages", { home })} />
          </ToggleList>
        </Panel>

        <Disclosure title={t("Advanced")} summary={t("For themes where cards aren't found on their own")}>
          <ToggleRow
            title={t("Hide the product grid until variant cards are ready")}
            description={t("Prevents a flash of the original cards on slower themes (never longer than 2.5 seconds).")}
            checked={s.advanced.preventFlash}
            onChange={(preventFlash) => patch("advanced", { preventFlash })}
          />
          <Text
            label={t("Product grid selector")}
            value={s.advanced.gridSelector}
            placeholder="#product-grid"
            details={t("Only if the app doesn't find your theme's product grid on its own.")}
            onChange={(gridSelector) => patch("advanced", { gridSelector })}
          />
          <Text
            label={t("Product card selector")}
            value={s.advanced.cardSelector}
            placeholder=".product-card"
            details={t("Only if cards aren't detected: a CSS selector matching one product card.")}
            onChange={(cardSelector) => patch("advanced", { cardSelector })}
          />
          <Area label={t("Custom CSS")} value={s.advanced.customCss} placeholder=".vc-badge { background: #000; color: #fff; }" onChange={(customCss) => patch("advanced", { customCss })} />
        </Disclosure>
      </div>
    </s-page>
  );
}
