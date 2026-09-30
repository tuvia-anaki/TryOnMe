import { APP_NAME, SUPPORT_EMAIL } from "../../shared/brand";
import { Button, PageHeader, Panel } from "../components/ui";
import { msg, t } from "../i18n";
import { navigate } from "../router";

const CHECKLIST = [
  msg("The app is on in your theme and the theme is saved (Home says “Live”)."),
  msg("The collection shows variant cards (Collections → the collection → “Show variant cards on this collection's page”)."),
  msg("The products have variants that look different: a color option, or another option whose variants have their own photos (like Material or Scent). If not, pick the option yourself (Home → What gets its own card)."),
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
    msg("Your theme decides how many products fit on a page; each product then becomes several cards. A page of 24 products with 3 colors each shows 72 cards."),
  ],
  [
    msg("What about SEO?"),
    msg("Nothing changes for search engines: there are no new pages or product URLs. Variant cards link to the product page with that variant selected (?variant=…)."),
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
    <s-page inlineSize="base">
      <PageHeader title={t("Help")} back={{ label: t("Home"), to: "/" }} />
      <div class="vc-stack">
        <Panel title={t("How it works")}>
          <p class="vc-text">
            {t("{app} takes each product card in your collection and search pages and shows one card per style: each color, material or scent (or each value of any option you choose). Each card keeps your theme's design and shows that variant's image, title, price and link.", { app: APP_NAME })}
          </p>
        </Panel>

        <Panel title={t("Variant cards don't show?")}>
          <ol class="vc-steps">
            {CHECKLIST.map((item) => (
              <li key={item}>{t(item)}</li>
            ))}
          </ol>
          <p class="vc-muted">
            {t("Still not working? Your theme may build its grid in an unusual way. More settings → Advanced → “Product card selector” lets you point the app at your cards.")}
          </p>
          <div class="vc-actions">
            <Button onClick={() => void navigate("/")}>{t("Go to Home")}</Button>
            <Button variant="plain" onClick={() => void navigate("/settings")}>
              {t("More settings")}
            </Button>
          </div>
        </Panel>

        <Panel title={t("Questions")}>
          <div class="vc-faq">
            {FAQ.map(([question, answer]) => (
              <details key={question} class="vc-faq__item">
                <summary class="vc-faq__question">{t(question)}</summary>
                <p class="vc-text">{t(answer)}</p>
              </details>
            ))}
          </div>
        </Panel>

        <Panel title={t("Contact")}>
          {SUPPORT_EMAIL ? (
            <p class="vc-text">
              {t("Email us at {email}. Include your store address and a link to the collection page.", { email: SUPPORT_EMAIL })}{" "}
              <s-link href={`mailto:${SUPPORT_EMAIL}`}>{t("Write an email")}</s-link>
            </p>
          ) : (
            <p class="vc-text">{t("{app} is maintained by a small team. Reach us through the app's listing page in the Shopify App Store.", { app: APP_NAME })}</p>
          )}
        </Panel>
      </div>
    </s-page>
  );
}
