import { APP_NAME } from "../../shared/brand";
import { loadAppContext } from "../api/settings";
import { loadThemeStatus, themeEditorUrl } from "../api/theme";
import { ErrorBanner, openExternal } from "../components/common";
import { t } from "../i18n";
import { useAsync } from "../lib/hooks";
import { navigate } from "../router";

function StepBadge(props: { done: boolean | null }) {
  if (props.done === null) return <s-badge>{t("Checking…")}</s-badge>;
  return props.done ? (
    <s-badge tone="success" icon="check">
      {t("Done")}
    </s-badge>
  ) : (
    <s-badge tone="caution">{t("To do")}</s-badge>
  );
}

export function Home() {
  const context = useAsync(() => loadAppContext(), []);
  const theme = useAsync(() => loadThemeStatus(), []);
  const shopDomain = context.data?.shop.domain ?? window.shopify?.config?.shop ?? "";
  const apiKey = window.shopify?.config?.apiKey ?? "";
  const embedUrl = shopDomain && apiKey ? themeEditorUrl(shopDomain, apiKey) : "";
  const embedOn = theme.loading ? null : theme.data ? theme.data.embed === "enabled" : false;
  const embedUnknown = !theme.loading && (theme.error || theme.data?.embed === "unknown");

  return (
    <s-page heading={APP_NAME} inlineSize="base">
      <s-button slot="primary-action" variant="primary" onClick={() => void navigate("/products")}>
        {t("Assign images")}
      </s-button>

      {theme.data && theme.data.embed !== "enabled" && theme.data.embed !== "unknown" && (
        <s-banner tone="warning" heading={t("Turn on the app embed to show variant images in your store")}>
          <s-paragraph>
            {t("Shopify requires you to switch on app embeds yourself. It takes one click in the theme editor — then press Save.")}
          </s-paragraph>
          <s-stack direction="inline" gap="small-200">
            <s-button variant="primary" onClick={() => embedUrl && openExternal(embedUrl)}>
              {t("Turn on in theme editor")}
            </s-button>
            <s-button onClick={theme.reload}>{t("I turned it on — check again")}</s-button>
          </s-stack>
        </s-banner>
      )}

      {theme.data?.conflicts.length ? (
        <s-banner tone="warning" heading={t("Your theme hides variant media on its own")}>
          <s-paragraph>
            {t(
              "The theme setting “Hide other variants’ media” is on. Turn it off (Theme editor → Product page → product information/media settings) so it doesn't fight with {app}.",
              { app: APP_NAME },
            )}
          </s-paragraph>
          {shopDomain && (
            <s-button onClick={() => openExternal(`https://${shopDomain}/admin/themes/current/editor?template=product`)}>
              {t("Open theme editor")}
            </s-button>
          )}
        </s-banner>
      ) : null}

      {context.error && <ErrorBanner error={context.error} onRetry={context.reload} />}

      <s-section heading={t("Get started")}>
        <s-stack direction="block" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
              <s-stack direction="block" gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-heading>{t("1. Turn on the app embed")}</s-heading>
                  <StepBadge done={embedUnknown ? false : embedOn} />
                </s-stack>
                <s-text color="subdued">
                  {theme.data?.themeName
                    ? t("Live theme: {theme}. The embed loads variant images and swatches without editing theme code.", {
                        theme: theme.data.themeName,
                      })
                    : t("The embed loads variant images and swatches without editing theme code.")}
                </s-text>
              </s-stack>
              <s-button onClick={() => embedUrl && openExternal(embedUrl)}>{embedOn ? t("Open") : t("Turn on")}</s-button>
            </s-grid>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
              <s-stack direction="block" gap="small-200">
                <s-heading>{t("2. Assign images to variants")}</s-heading>
                <s-text color="subdued">
                  {t("Let the app match images automatically (by variant image order, alt text, file name or colors), then fine-tune any product by hand.")}
                </s-text>
              </s-stack>
              <s-stack direction="inline" gap="small-200">
                <s-button onClick={() => void navigate("/bulk")}>{t("Auto-assign all")}</s-button>
                <s-button variant="primary" onClick={() => void navigate("/products")}>
                  {t("Choose products")}
                </s-button>
              </s-stack>
            </s-grid>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
              <s-stack direction="block" gap="small-200">
                <s-heading>{t("3. Style swatches (optional)")}</s-heading>
                <s-text color="subdued">
                  {t("Replace your theme's color dropdowns with color or image swatches, on product pages and collection cards.")}
                </s-text>
              </s-stack>
              <s-button onClick={() => void navigate("/swatches")}>{t("Set up swatches")}</s-button>
            </s-grid>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
              <s-stack direction="block" gap="small-200">
                <s-heading>{t("4. Check your store")}</s-heading>
                <s-text color="subdued">
                  {t("Open a product with several colors and switch variants: only that variant's images should show.")}
                </s-text>
              </s-stack>
              <s-button
                onClick={() => {
                  const url = context.data?.shop.url ?? (shopDomain ? `https://${shopDomain}` : "");
                  if (url) openExternal(url);
                }}
              >
                {t("View store")}
              </s-button>
            </s-grid>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading={t("Free. Really.")}>
        <s-paragraph>
          {t(
            "Every feature is included for every store: unlimited products, variants and images, automatic matching, swatches and collection swatches. No plans, no usage limits, no watermark.",
          )}
        </s-paragraph>
        <s-paragraph color="subdued">
          {t(
            "Why it can be free: your variant image setup is stored in your own store (as product data), and the storefront script is served by Shopify. Nothing runs on our servers when shoppers browse, so there is nothing to charge you for.",
          )}
        </s-paragraph>
      </s-section>

      <s-section heading={t("Need a hand?")}>
        <s-stack direction="inline" gap="small-200">
          <s-button onClick={() => void navigate("/help")}>{t("Help & troubleshooting")}</s-button>
          <s-button onClick={() => void navigate("/settings")}>{t("Settings")}</s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}
