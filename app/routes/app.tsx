import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import { t } from "../lib/i18n/translations";
import { loadSupportChat } from "../lib/support-chat.client";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    language: shop.language,
    shopDomain: session.shop,
  };
};

export default function App() {
  const { apiKey, language, shopDomain } = useLoaderData<typeof loader>();

  // Load the support chat once per session so the bubble is always available.
  // Injected after render, so it never delays the admin UI.
  useEffect(() => {
    loadSupportChat({ language, shopDomain }).catch(() => {
      // Chat is optional — a failure here must never break the admin.
    });
  }, [language, shopDomain]);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          {t(language, "navHome")}
        </Link>
        <Link to="/app/dashboard">{t(language, "navAnalytics")}</Link>
        <Link to="/app/design">{t(language, "navDesign")}</Link>
        <Link to="/app/products">{t(language, "navProducts")}</Link>
        <Link to="/app/settings">{t(language, "navSettings")}</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
