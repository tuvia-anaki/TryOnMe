import { APP_NAME, SUPPORT_EMAIL } from "../../shared/brand";
import { msg, t } from "../i18n";
import { navigate } from "../router";

const CHECKLIST = [
  msg("The app is on in your theme and the theme is saved (Home says “Live”)."),
  msg("The collection shows variant cards (Collections → the collection → “Show variant cards on this collection's page”)."),
  msg("The products have a color option. Products without one stay as one card, unless you pick another option (Settings → What gets its own card)."),
  msg("You're looking at the published theme, or at the theme you picked on Home (use its preview)."),
  msg("Reload the collection page once: product data is cached for 10 minutes while you browse."),
];

const FAQ: [string, string][] = [
  [
    msg("Does it duplicate my products?"),
    msg("No. Your products, variants, prices, images and inventory stay exactly as they are. The app only changes how the product grid is shown to shoppers."),
  ],
  [
    msg("Does it edit my theme's code?"),
    msg("No. It runs from an app embed that you switch on in the theme editor, so turning it off (or uninstalling) leaves your theme untouched."),
  ],
  [
    msg("Do the theme's filters and sorting still work?"),
    msg("Yes. When the theme reloads the grid (filters, sorting, its own infinite scroll), the new cards are split too."),
  ],
  [
    msg("Why does a page show more cards than the theme's page size?"),
    msg("Your theme decides how many products fit on a page; each product then becomes one card per color. A page of 24 products with 3 colors each shows 72 cards."),
  ],
  [
    msg("What about SEO?"),
    msg("Nothing changes for search engines: there are no new pages or product URLs. Variant cards link to the product page with the color selected (?variant=…)."),
  ],
  [
    msg("Will it slow down my store?"),
    msg("The script is small, loads after the page, and gets product data from Shopify's own storefront endpoints, which are cached by Shopify. Pages where the app isn't used don't load it."),
  ],
  [
    msg("Why is it free?"),
    msg("Everything runs in your store: settings are saved in your store, the script is served by Shopify, and cards are built in the shopper's browser. There's no server for us to pay for, so there's nothing to charge you for."),
  ],
  [
    msg("What happens when I uninstall?"),
    msg("Your store goes back to the theme's normal cards right away, and Shopify deletes the app's settings automatically."),
  ],
];

export function Help() {
  return (
    <s-page heading={t("Help")} inlineSize="base">
      <s-stack direction="block" gap="base">
        <s-section heading={t("How it works")}>
          <s-paragraph>
            {t("{app} takes each product card in your collection and search pages and shows one card per color (or per any option you choose). Each card keeps your theme's design and shows that variant's image, title, price and link.", { app: APP_NAME })}
          </s-paragraph>
        </s-section>

        <s-section heading={t("Variant cards don't show?")}>
          <s-ordered-list>
            {CHECKLIST.map((item) => (
              <s-list-item key={item}>{t(item)}</s-list-item>
            ))}
          </s-ordered-list>
          <s-paragraph color="subdued">
            {t("Still not working? Your theme may build its grid in an unusual way. Settings → Advanced → “Product card selector” lets you point the app at your cards.")}
          </s-paragraph>
          <s-stack direction="inline" gap="small-200">
            <s-button onClick={() => void navigate("/")}>{t("Go to Home")}</s-button>
            <s-button variant="tertiary" onClick={() => void navigate("/settings")}>
              {t("Settings")}
            </s-button>
          </s-stack>
        </s-section>

        <s-section heading={t("Questions")}>
          <s-stack direction="block" gap="base">
            {FAQ.map(([question, answer]) => (
              <s-stack key={question} direction="block" gap="small-200">
                <s-heading>{t(question)}</s-heading>
                <s-paragraph>{t(answer)}</s-paragraph>
              </s-stack>
            ))}
          </s-stack>
        </s-section>

        <s-section heading={t("Contact")}>
          {SUPPORT_EMAIL ? (
            <s-paragraph>
              {t("Email us at {email}. Include your store address and a link to the collection page.", { email: SUPPORT_EMAIL })}{" "}
              <s-link href={`mailto:${SUPPORT_EMAIL}`}>{t("Write an email")}</s-link>
            </s-paragraph>
          ) : (
            <s-paragraph>{t("{app} is maintained by a small team. Reach us through the app's listing page in the Shopify App Store.", { app: APP_NAME })}</s-paragraph>
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}
