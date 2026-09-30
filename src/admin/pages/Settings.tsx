import { TITLE_PRESETS, type PagingMode, type PriceFormat, type Texts } from "../../shared/settings";
import { ErrorBanner, Loading } from "../components/common";
import { Area, Card, Check, Select, Text, Toggle } from "../components/fields";
import { msg, t } from "../i18n";
import { useSettingsDraft } from "../lib/draft";
import { splitByOptions, titleOptions } from "./Dashboard";

const CUSTOM = "__custom__";

const TEXT_FIELDS: [keyof Texts, string, string][] = [
  ["from", msg("Price when variants cost different amounts"), "From {price}"],
  ["soldOut", msg("Sold out"), "Sold out"],
  ["sale", msg("Sale badge"), "Sale"],
  ["addToCart", msg("Add to cart button"), "Add to cart"],
  ["added", msg("After adding to cart"), "Added to cart"],
  ["viewCart", msg("View cart link"), "View cart"],
  ["loadMore", msg("Load more button"), "Load more"],
  ["loading", msg("While loading"), "Loading…"],
];

interface PickedCollection {
  handle: string;
  title?: string;
}

export function Settings() {
  const { context, draft, patch, saving, save } = useSettingsDraft("vc-settings-save-bar");

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
  const isPreset = (TITLE_PRESETS as readonly string[]).includes(s.split.title);

  const pickCollections = async () => {
    const picker = window.shopify?.resourcePicker;
    if (!picker) return;
    const picked = (await picker({ type: "collection", multiple: true, action: "select" })) as PickedCollection[] | undefined;
    if (!picked?.length) return;
    const handles = [...new Set([...s.collections.handles, ...picked.map((c) => c.handle).filter(Boolean)])];
    patch("collections", { handles });
  };

  return (
    <s-page heading={t("Settings")} inlineSize="base">
      <s-button slot="primary-action" variant="primary" loading={saving} onClick={() => void save()}>
        {t("Save")}
      </s-button>
      <s-stack direction="block" gap="base">
        <Card heading={t("Where variant cards show")}>
          <Select
            label={t("Collections")}
            value={s.collections.mode}
            options={[
              ["all", t("All collections")],
              ["selected", t("Only the collections I choose")],
            ]}
            onChange={(mode) => patch("collections", { mode })}
          />
          {s.collections.mode === "selected" && (
            <s-stack direction="block" gap="small-200">
              {s.collections.handles.length ? (
                <s-stack direction="inline" gap="small-200">
                  {s.collections.handles.map((handle) => (
                    <s-chip key={handle} removable onRemove={() => patch("collections", { handles: s.collections.handles.filter((h) => h !== handle) })}>
                      {handle}
                    </s-chip>
                  ))}
                </s-stack>
              ) : (
                <s-text color="subdued">{t("No collections chosen yet.")}</s-text>
              )}
              <s-stack direction="inline">
                <s-button onClick={() => void pickCollections()}>{t("Choose collections")}</s-button>
              </s-stack>
            </s-stack>
          )}
          <Check label={t("All products page (/collections/all)")} checked={s.pages.allProducts} onChange={(allProducts) => patch("pages", { allProducts })} />
          <Check label={t("Search results")} checked={s.pages.search} onChange={(search) => patch("pages", { search })} />
          <Check
            label={t("Product grids on the home page")}
            details={t("Featured collection sections of your theme.")}
            checked={s.pages.home}
            onChange={(home) => patch("pages", { home })}
          />
        </Card>

        <Card heading={t("Variant cards")} description={t("Each variant card shows its own image, title, price and link, in your theme's own card design.")}>
          <Toggle label={t("Show each variant as its own card")} checked={s.split.enabled} onChange={(enabled) => patch("split", { enabled })} />
          <Select
            label={t("Split products by")}
            value={s.split.by}
            options={splitByOptions()}
            details={t("Color (automatic) finds the color option in any language; products without one stay as one card.")}
            disabled={!s.split.enabled}
            onChange={(by) => patch("split", { by })}
          />
          <Select
            label={t("Card title")}
            value={isPreset ? s.split.title : CUSTOM}
            options={[...titleOptions(isPreset ? s.split.title : TITLE_PRESETS[0]), [CUSTOM, t("Custom…")]]}
            disabled={!s.split.enabled}
            onChange={(value) => patch("split", { title: value === CUSTOM ? "{product} · {value}" : value })}
          />
          {!isPreset && (
            <Text
              label={t("Custom title")}
              value={s.split.title}
              details={t("Use {product}, {value} (the color), {variant}, {option1}, {option2}, {option3}, {vendor} and {type}.")}
              onChange={(title) => patch("split", { title })}
            />
          )}
          <Select<PriceFormat>
            label={t("Price when a card's variants cost different amounts")}
            value={s.price.format}
            options={[
              ["theme", t("Like the theme (From $10)")],
              ["from", t("From the lowest price")],
              ["range", t("Price range ($10 – $15)")],
            ]}
            onChange={(format) => patch("price", { format })}
          />
        </Card>

        <Card heading={t("Hide and sort")}>
          <Check label={t("Hide sold-out variants")} details={t("A product whose variants are all sold out keeps one card.")} checked={s.hide.soldOut} onChange={(soldOut) => patch("hide", { soldOut })} />
          <Check
            label={t("Hide variants without their own image")}
            details={t("Variants that would show the product's main image instead of their own.")}
            checked={s.hide.noImage}
            onChange={(noImage) => patch("hide", { noImage })}
          />
          <Check
            label={t("Mix variants of different products")}
            details={t("Show every product's first color, then every product's second color… instead of keeping a product's colors together.")}
            checked={s.order.mix}
            onChange={(mix) => patch("order", { mix })}
          />
          <Check label={t("Show sold-out cards last")} checked={s.order.soldOutLast} onChange={(soldOutLast) => patch("order", { soldOutLast })} />
        </Card>

        <Card heading={t("On each card")}>
          <Check
            label={t("Hide the theme's color swatches on variant cards")}
            details={t("They'd list every color on a card that shows one.")}
            checked={s.card.hideThemeSwatches}
            onChange={(hideThemeSwatches) => patch("card", { hideThemeSwatches })}
          />
          <Check
            label={t("Keep the theme's second image on hover")}
            details={t("Usually another color's photo, so it's off by default.")}
            checked={s.card.secondImage}
            onChange={(secondImage) => patch("card", { secondImage })}
          />
          <Check label={t("Show a “Sold out” badge on sold-out variant cards")} checked={s.card.soldOutBadge} onChange={(soldOutBadge) => patch("card", { soldOutBadge })} />
          <Check
            label={t("Add to cart button")}
            details={t("Cards with sizes to choose from get “Choose options”, which opens the product with the color selected.")}
            checked={s.card.addToCart}
            onChange={(addToCart) => patch("card", { addToCart })}
          />
        </Card>

        <Card heading={t("Loading more products")}>
          <Select<PagingMode>
            label={t("On collection and search pages")}
            value={s.paging.mode}
            options={[
              ["theme", t("Theme's pagination")],
              ["load-more", t("“Load more” button")],
              ["infinite", t("Infinite scroll")],
            ]}
            onChange={(mode) => patch("paging", { mode })}
          />
          <Check label={t("“Back to top” button")} checked={s.paging.scrollTop} onChange={(scrollTop) => patch("paging", { scrollTop })} />
        </Card>

        <Card heading={t("Storefront texts")} description={t("Leave a field empty to use the default in your store's language.")}>
          <s-query-container>
            <s-grid gridTemplateColumns="@container (inline-size <= 520px) 1fr, 1fr 1fr" gap="base">
              {TEXT_FIELDS.map(([key, label, placeholder]) => (
                <Text key={key} label={t(label)} value={s.texts[key]} placeholder={placeholder} maxLength={80} onChange={(value) => patch("texts", { [key]: value })} />
              ))}
            </s-grid>
          </s-query-container>
        </Card>

        <Card heading={t("Advanced")}>
          <Toggle
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
          <Area
            label={t("Custom JavaScript")}
            value={s.advanced.customJs}
            placeholder="document.addEventListener('vc:render', (event) => { … });"
            details={t("Runs on your storefront after the app starts. Events: vc:ready, vc:render, vc:cart-add.")}
            onChange={(customJs) => patch("advanced", { customJs })}
          />
        </Card>
      </s-stack>
    </s-page>
  );
}
