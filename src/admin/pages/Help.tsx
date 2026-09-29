import { APP_NAME, SUPPORT_EMAIL } from "../../shared/brand";
import { msg, t } from "../i18n";
import { navigate } from "../router";

const FAQ: [string, string][] = [
  [
    msg("How does it work?"),
    msg("You choose which images belong to each variant (or let the app match them). The setup is saved in your own store as product data. On your storefront, a small script from Shopify's CDN shows only the selected variant's images — in the main gallery, the thumbnails and the zoom view."),
  ],
  [
    msg("Is it really free?"),
    msg("Yes — every feature, unlimited products. Nothing runs on our servers while shoppers browse your store, so the app costs nothing to operate at your store's scale."),
  ],
  [
    msg("Will it slow down my store?"),
    msg("No. The storefront script is small, loads deferred from Shopify's CDN, only on pages that need it, and never waits for a server. Product data comes from your store's own page."),
  ],
  [
    msg("Does it work with my theme?"),
    msg("It detects galleries automatically: Dawn and the free Shopify themes, Horizon, and popular paid themes (Prestige, Impulse, Impact, Focal, Symmetry, Motion, Broadcast, Be Yours, Palo Alto, Empire, Minimog, Ella…). It also works with Swiper, Flickity, Slick and Splide sliders used by page builders. If your gallery isn't detected, add a gallery item selector in Settings."),
  ],
  [
    msg("Some images show for every variant. Why?"),
    msg("Images you didn't assign to any variant show for all of them (useful for size charts or lifestyle shots). Turn on “Hide images that aren't assigned to any variant” in Settings, or assign them."),
  ],
  [
    msg("My theme already has a “show variant images” option."),
    msg("Turn the theme's option off so the two don't fight (for example Dawn's “Hide other variants' media”, or theme features that group images by alt text)."),
  ],
  [
    msg("What is the “main” image?"),
    msg("The first image of a group. When you save, the app can set it as the variant's image in Shopify, so the cart, checkout and product feeds show the right picture."),
  ],
  [
    msg("Can I import what my old app or theme used?"),
    msg("Yes. Many themes and apps group images by alt text (like “#color_red”) or by file name. Use Auto-assign → By alt text or By file name."),
  ],
  [
    msg("What happens if I uninstall?"),
    msg("Your product images are never changed. Shopify deletes the app's data automatically some time after uninstalling. To remove it right away, use Settings → Remove all data before uninstalling."),
  ],
];

export function Help() {
  return (
    <s-page heading={t("Help")} inlineSize="base">
      <s-section heading={t("Quick checklist when something looks wrong")}>
        <s-ordered-list>
          <s-list-item>{t("The app embed is on in Online Store → Themes → Customize → App embeds (and the theme is saved).")}</s-list-item>
          <s-list-item>{t("The product has images assigned and you pressed Save.")}</s-list-item>
          <s-list-item>{t("Your theme's own variant image option is turned off.")}</s-list-item>
          <s-list-item>{t("You're looking at the published theme (or previewing the theme where the embed is on).")}</s-list-item>
          <s-list-item>{t("Hard-refresh the product page (browser cache).")}</s-list-item>
        </s-ordered-list>
        <s-stack direction="inline" gap="small-200">
          <s-button onClick={() => void navigate("/")}>{t("Check app embed status")}</s-button>
          <s-button onClick={() => void navigate("/settings")}>{t("Open settings")}</s-button>
        </s-stack>
      </s-section>

      <s-section heading={t("Questions")}>
        <s-stack direction="block" gap="base">
          {FAQ.map(([q, a]) => (
            <s-stack direction="block" gap="small-200" key={q}>
              <s-heading>{t(q)}</s-heading>
              <s-paragraph>{t(a)}</s-paragraph>
            </s-stack>
          ))}
        </s-stack>
      </s-section>

      <s-section heading={t("Contact")}>
        {SUPPORT_EMAIL ? (
          <s-paragraph>
            {t("Email us at {email} — include your store address and a product link.", { email: SUPPORT_EMAIL })}{" "}
            <s-link href={`mailto:${SUPPORT_EMAIL}`}>{t("Write an email")}</s-link>
          </s-paragraph>
        ) : (
          <s-paragraph>{t("{app} is maintained by a small team. Reach us through the app's listing page in the Shopify App Store.", { app: APP_NAME })}</s-paragraph>
        )}
      </s-section>
    </s-page>
  );
}
