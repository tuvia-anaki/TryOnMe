import { SETTINGS_KEY, SETTINGS_NAMESPACE } from "../../shared/constants";
import { sanitizeSettings, type AppSettings } from "../../shared/settings";
import { gql, throwUserErrors, type UserError } from "./graphql";

/**
 * Shop-wide settings live in an app-data metafield on the app installation:
 * readable by the theme app extension (`app.metafields`), invisible in the
 * Shopify admin, and removed automatically when the app is uninstalled.
 */

export interface AppContext {
  installationId: string;
  settings: AppSettings;
  settingsSaved: boolean;
  shop: { name: string; domain: string; url: string | null; currency: string };
}

const CONTEXT_QUERY = `#graphql
query AppContext {
  currentAppInstallation {
    id
    settings: metafield(namespace: "${SETTINGS_NAMESPACE}", key: "${SETTINGS_KEY}") { value updatedAt }
  }
  shop { name myshopifyDomain primaryDomain { url } currencyCode }
}`;

const SAVE_MUTATION = `#graphql
mutation SaveSettings($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id updatedAt }
    userErrors { field message code }
  }
}`;

let cached: Promise<AppContext> | null = null;

export function loadAppContext(force = false): Promise<AppContext> {
  if (!cached || force) {
    cached = gql<{
      currentAppInstallation: { id: string; settings: { value: string } | null };
      shop: { name: string; myshopifyDomain: string; primaryDomain: { url: string } | null; currencyCode: string };
    }>(CONTEXT_QUERY).then((data) => ({
      installationId: data.currentAppInstallation.id,
      settings: sanitizeSettings(data.currentAppInstallation.settings?.value ?? null),
      settingsSaved: !!data.currentAppInstallation.settings,
      shop: {
        name: data.shop.name,
        domain: data.shop.myshopifyDomain,
        url: data.shop.primaryDomain?.url ?? null,
        currency: data.shop.currencyCode,
      },
    }));
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export async function saveSettings(context: AppContext, next: AppSettings): Promise<AppSettings> {
  const clean = sanitizeSettings(next);
  const data = await gql<{ metafieldsSet: { userErrors: UserError[] } }>(SAVE_MUTATION, {
    metafields: [
      {
        ownerId: context.installationId,
        namespace: SETTINGS_NAMESPACE,
        key: SETTINGS_KEY,
        type: "json",
        value: JSON.stringify(clean),
      },
    ],
  });
  throwUserErrors(data.metafieldsSet.userErrors, "Couldn't save settings");
  context.settings = clean;
  context.settingsSaved = true;
  return clean;
}

