import { SECTIONS, type SectionHandle } from "../../shared/constants";
import { loadAppContext } from "../api/settings";
import { addSectionUrl, listThemes, loadThemeStatus, preferredTheme } from "../api/theme";
import { ErrorBanner, openExternal } from "../components/common";
import { msg, t } from "../i18n";
import { useAsync } from "../lib/hooks";

const SECTION_INFO: Record<SectionHandle, { name: string; description: string; where: string }> = {
  "featured-collection": {
    name: msg("Featured collection"),
    description: msg("A collection's products as variant cards, on any page."),
    where: msg("Home page"),
  },
  "best-sellers": {
    name: msg("Best sellers"),
    description: msg("Your best-selling products, from a collection sorted by best selling."),
    where: msg("Home page"),
  },
  "hand-picked": {
    name: msg("Hand-picked products"),
    description: msg("Products you choose, each color as its own card."),
    where: msg("Home page"),
  },
  "related-products": {
    name: msg("Related products"),
    description: msg("Shopify's recommendations for the product being viewed."),
    where: msg("Product pages"),
  },
  "promo-card": {
    name: msg("Promo card"),
    description: msg("An image tile inside the collection grid, at the position you choose."),
    where: msg("Collection pages"),
  },
};

const IMAGES: Record<string, string> = {
  "featured-collection": "/illustrations/assign.svg",
  "best-sellers": "/illustrations/free.svg",
  "hand-picked": "/illustrations/swatches.svg",
  "related-products": "/illustrations/assign.svg",
  "promo-card": "/illustrations/embed.svg",
};

const ADD_LABEL: Record<string, string> = {
  index: msg("Add to home page"),
  product: msg("Add to product page"),
  collection: msg("Add to collection page"),
};

export function Sections() {
  const context = useAsync(() => loadAppContext(), []);
  const themes = useAsync(() => listThemes(), []);
  const theme = preferredTheme(themes.data);
  const status = useAsync(() => (theme ? loadThemeStatus(theme.id) : Promise.resolve(null)), [theme?.id]);
  const shopDomain = context.data?.shop.domain ?? window.shopify?.config?.shop ?? "";
  const apiKey = window.shopify?.config?.apiKey ?? "";

  return (
    <s-page heading={t("Sections")} inlineSize="base">
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">
          {theme
            ? t("Sections you can add to {theme} in the theme editor. They show each color as its own card and match your theme's fonts and colors.", { theme: theme.name })
            : t("Sections you can add in the theme editor. They show each color as its own card and match your theme's fonts and colors.")}
        </s-paragraph>
        {(context.error || themes.error) && <ErrorBanner error={(context.error ?? themes.error)!} onRetry={() => (context.error ? context.reload() : themes.reload())} />}
        {SECTIONS.map((section) => {
          const info = SECTION_INFO[section.handle];
          const placed = status.data?.sections[section.handle] ?? [];
          return (
            <s-section key={section.handle}>
              <s-query-container>
                <s-grid gridTemplateColumns="@container (inline-size <= 520px) 1fr, auto 1fr auto" gap="base" alignItems="center">
                  <s-box maxInlineSize="72px" maxBlockSize="72px">
                    <s-image src={IMAGES[section.handle]} alt="" accessibilityRole="presentation" />
                  </s-box>
                  <s-stack direction="block" gap="small-300">
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-heading>{t(info.name)}</s-heading>
                      {status.loading ? (
                        <s-badge>{t("Checking…")}</s-badge>
                      ) : placed.length ? (
                        <s-badge tone="success">{t("Added")}</s-badge>
                      ) : (
                        <s-badge>{t("Not added")}</s-badge>
                      )}
                    </s-stack>
                    <s-text color="subdued">{t(info.description)}</s-text>
                  </s-stack>
                  {theme && shopDomain && (
                    <s-button
                      variant={placed.length ? "secondary" : "primary"}
                      onClick={() => openExternal(addSectionUrl(shopDomain, theme.id, apiKey, section.handle, section.template))}
                    >
                      {placed.length ? t("Add another") : t(ADD_LABEL[section.template])}
                    </s-button>
                  )}
                </s-grid>
              </s-query-container>
            </s-section>
          );
        })}
      </s-stack>
    </s-page>
  );
}
