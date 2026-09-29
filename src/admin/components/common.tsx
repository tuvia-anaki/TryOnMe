import type { ComponentChildren } from "preact";
import { ApiError } from "../api/graphql";
import { t } from "../i18n";

export function ErrorBanner(props: { error: Error; onRetry?: () => void }) {
  const isApi = props.error instanceof ApiError;
  return (
    <s-banner tone="critical" heading={isApi ? t("Couldn't reach Shopify") : t("Something went wrong")}>
      <s-paragraph>{props.error.message}</s-paragraph>
      {props.onRetry && <s-button onClick={props.onRetry}>{t("Try again")}</s-button>}
    </s-banner>
  );
}

export function Loading(props: { label?: string }) {
  return (
    <s-section>
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-spinner accessibilityLabel={props.label ?? t("Loading")} size="base" />
        <s-text color="subdued">{props.label ?? t("Loading…")}</s-text>
      </s-stack>
    </s-section>
  );
}

export function Field(props: { label: string; help?: string; children: ComponentChildren }) {
  return (
    <s-stack direction="block" gap="small-200">
      <s-text type="strong">{props.label}</s-text>
      {props.children}
      {props.help && <s-text color="subdued">{props.help}</s-text>}
    </s-stack>
  );
}

/** Open a URL in a new tab (theme editor, storefront). */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener");
}

/** Navigate the Shopify admin itself (e.g. to a product page). */
export function openAdmin(path: string): void {
  window.open(`shopify://admin${path}`, "_top");
}
