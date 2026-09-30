import type { PriceFormat } from "../../shared/settings";
import { ChoiceCards } from "../components/ChoiceCards";
import { CollectionPicker } from "../components/CollectionPicker";
import { SplitPicker, TitlePicker } from "../components/choices";
import { ErrorBanner, Loading } from "../components/common";
import { Disclosure } from "../components/Disclosure";
import { Area, Card, Check, Select, Text } from "../components/fields";
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

export function Settings() {
  // A form: changes are saved with Shopify's save bar, which appears once something changes.
  const { context, draft, patch } = useSettingsDraft("vc-settings-save-bar");

  if (context.error) {
    return (
      <s-page heading={t("Settings")}>
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!draft) {
    return (
      <s-page heading={t("Settings")}>
        <Loading />
      </s-page>
    );
  }
  const s = draft;

  return (
    <s-page heading={t("Settings")} inlineSize="base">
      <s-stack direction="block" gap="base">
        <Card heading={t("Cards")}>
          <SplitPicker enabled={s.split.enabled} by={s.split.by} onChange={(split) => patch("split", split)} />
          {s.split.enabled && <TitlePicker title={s.split.title} by={s.split.by} onChange={(title) => patch("split", { title })} />}
        </Card>

        <Card heading={t("Where cards show")}>
          <ChoiceCards<"all" | "selected">
            label={t("Collections")}
            value={s.collections.mode}
            minWidth={220}
            choices={[
              { value: "all", title: t("All collections"), description: t("Every collection page in your store.") },
              { value: "selected", title: t("Only some collections"), description: t("Choose them below.") },
            ]}
            onChange={(mode) => patch("collections", { mode })}
          />
          {s.collections.mode === "selected" && <CollectionPicker handles={s.collections.handles} onChange={(handles) => patch("collections", { handles })} />}
          <s-stack direction="block" gap="small-200">
            <span class="vc-field__label">{t("Also on")}</span>
            <Check label={t("All products page")} checked={s.pages.allProducts} onChange={(allProducts) => patch("pages", { allProducts })} />
            <Check label={t("Search results")} checked={s.pages.search} onChange={(search) => patch("pages", { search })} />
            <Check label={t("Product grids on the home page")} checked={s.pages.home} onChange={(home) => patch("pages", { home })} />
          </s-stack>
        </Card>

        <Card heading={t("Sold out and missing photos")}>
          <Check label={t("Hide sold-out cards")} details={t("A product that's completely sold out keeps one card.")} checked={s.hide.soldOut} onChange={(soldOut) => patch("hide", { soldOut })} />
          <Check
            label={t("Hide cards without their own photo")}
            details={t("Cards that would show the product's main photo instead.")}
            checked={s.hide.noImage}
            onChange={(noImage) => patch("hide", { noImage })}
          />
          <Check label={t("Show sold-out cards last")} checked={s.order.soldOutLast} onChange={(soldOutLast) => patch("order", { soldOutLast })} />
        </Card>

        <Card heading={t("On each card")}>
          <s-query-container>
            <s-grid gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr 1fr" gap="base">
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
            </s-grid>
          </s-query-container>
          <Check label={t("“Sold out” badge")} checked={s.card.soldOutBadge} onChange={(soldOutBadge) => patch("card", { soldOutBadge })} />
          <Check
            label={t("Hide the theme's color swatches")}
            details={t("They would list every color on a card that shows one.")}
            checked={s.card.hideThemeSwatches}
            onChange={(hideThemeSwatches) => patch("card", { hideThemeSwatches })}
          />
          <Check
            label={t("Second photo on hover")}
            details={t("Often another color's photo, so it's off by default.")}
            checked={s.card.secondImage}
            onChange={(secondImage) => patch("card", { secondImage })}
          />
        </Card>

        <Disclosure title={t("Advanced")}>
          <s-section>
            <s-stack direction="block" gap="base">
            <Check
              label={t("Hide the product grid until variant cards are ready")}
              details={t("Prevents a flash of the original cards on slower themes (never longer than 2.5 seconds).")}
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
            </s-stack>
          </s-section>
        </Disclosure>
      </s-stack>
    </s-page>
  );
}
