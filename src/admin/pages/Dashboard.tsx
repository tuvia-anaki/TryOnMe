import { useRef, useState } from "preact/hooks";
import { APP_NAME } from "../../shared/brand";
import { splitOptionName, type AppSettings } from "../../shared/settings";
import { appEmbedsUrl, appNameFromHandle, enableEmbedUrl, listThemes, loadThemeStatus, preferredTheme, setPreferredTheme, type ThemeInfo } from "../api/theme";
import { ChoiceCards } from "../components/ChoiceCards";
import { CollectionPicker } from "../components/CollectionPicker";
import { splitKind, SplitPicker } from "../components/choices";
import { ErrorBanner, Loading, openExternal } from "../components/common";
import { Dropdown } from "../components/Dropdown";
import { LanguagePicker } from "../components/LanguagePicker";
import { Button, LinkCard, PageHeader, Panel, StatusCard, Tag } from "../components/ui";
import { t } from "../i18n";
import { useSettingsDraft } from "../lib/draft";
import { useAsync } from "../lib/hooks";

function themeLabel(theme: ThemeInfo): string {
  return theme.role === "MAIN" ? t("{name} (published)", { name: theme.name }) : theme.name;
}

/** What shoppers see now, in one sentence. */
function liveSentence(settings: AppSettings): string {
  const kind = splitKind(settings.split.enabled, settings.split.by);
  if (kind === "none") {
    return settings.swatches.enabled
      ? t("Shoppers see one card per product and pick variants with swatches.")
      : t("Cards aren't split right now. Choose what gets its own card below.");
  }
  if (kind === "variant") return t("Shoppers see a card for each variant on your collection pages.");
  if (kind === "option") return t("Shoppers see a card for each {option} on your collection pages.", { option: splitOptionName(settings.split.by)! });
  return t("Shoppers see a card for each style on your collection pages.");
}

export function Dashboard() {
  // The main settings live here, so this page is a form: Shopify's save bar appears once something changes.
  const { context, draft, saved, patch, update, saving } = useSettingsDraft("vc-home-save-bar");
  const themes = useAsync(() => listThemes(), []);
  const [themeId, setThemeId] = useState("");
  const [pickTheme, setPickTheme] = useState(false);
  const theme = themes.data?.find((th) => th.id === themeId) ?? preferredTheme(themes.data);
  const status = useAsync(() => (theme ? loadThemeStatus(theme.id).then((st) => ({ ...st, themeId: theme.id })) : Promise.resolve(null)), [theme?.id]);
  const confirmRef = useRef<any>(null);
  // The language picker comes first, top right; then the page title.
  const header = (
    <>
      <div class="vc-topbar">
        <LanguagePicker />
      </div>
      <PageHeader title={APP_NAME} subtitle={t("Show your variants as their own product cards on your collection pages.")} />
    </>
  );

  if (context.error) {
    return (
      <s-page inlineSize="base">
        {header}
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!draft || !saved) {
    return (
      <s-page inlineSize="base">
        {header}
        <Loading />
      </s-page>
    );
  }
  const s = draft;

  const shopDomain = context.data?.shop.domain ?? window.shopify?.config?.shop ?? "";
  const apiKey = window.shopify?.config?.apiKey ?? "";
  const storeUrl = context.data?.shop.url || `https://${shopDomain}`;
  // Data for another theme (just switched) counts as still checking.
  const current = status.data && status.data.themeId === theme?.id ? status.data : null;
  const checkError = themes.error ?? status.error;
  const checking = !checkError && (themes.loading || (!!theme && !current));
  const embedOn = current?.embed === "enabled";
  const otherApps = current?.otherVariantApps ?? [];
  const themeName = theme?.name ?? "";

  const recheck = () => (themes.error ? themes.reload() : status.reload());
  const openEmbed = () => theme && shopDomain && openExternal(enableEmbedUrl(shopDomain, theme.id, apiKey));
  const preview = () => {
    const url = new URL("/collections/all", storeUrl);
    if (theme && theme.role !== "MAIN") url.searchParams.set("preview_theme_id", theme.id.split("/").pop()!);
    openExternal(url.toString());
  };

  // Stores keep copies of their theme: which one to check, tucked away until needed.
  const themeLine = themes.data && themes.data.length > 1 && theme && (
    <div class="vc-theme-line">
      {pickTheme ? (
        <div class="vc-inline-field">
          <Dropdown
            label={t("Theme")}
            value={theme.id}
            options={themes.data.map((th) => ({ value: th.id, label: themeLabel(th) }))}
            onChange={(id) => {
              const picked = themes.data!.find((th) => th.id === id);
              if (picked) setPreferredTheme(picked);
              setThemeId(id);
              setPickTheme(false);
            }}
          />
        </div>
      ) : (
        <>
          <span class="vc-muted">{t("Theme: {name}", { name: themeLabel(theme) })}</span>
          <button type="button" class="vc-link-button" onClick={() => setPickTheme(true)}>
            {t("Change")}
          </button>
        </>
      )}
    </div>
  );

  const statusCard = checkError ? (
    <StatusCard tone="off" title={t("Couldn't check your theme")} description={checkError.message} actions={<Button onClick={recheck}>{t("Try again")}</Button>} />
  ) : checking ? (
    <StatusCard tone="checking" title={t("Checking your theme…")} description={themeName ? themeLabel(theme!) : undefined} />
  ) : !embedOn ? (
    <StatusCard
      tone="off"
      title={t("Turn on the app in your theme")}
      description={t("Click the button, then press Save in the theme editor. It's off in {theme} right now.", { theme: themeName })}
      actions={
        <>
          <Button variant="primary" onClick={openEmbed}>
            {t("Turn on in theme editor")}
          </Button>
          <Button variant="plain" loading={status.loading} onClick={recheck}>
            {t("Check again")}
          </Button>
        </>
      }
    >
      {themeLine}
    </StatusCard>
  ) : !saved.enabled ? (
    <StatusCard
      tone="paused"
      title={t("Variant Cards is paused")}
      description={t("Your store shows one card per product until you turn it back on.")}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void update((settings) => ({ ...settings, enabled: true }), t("Variant Cards is on"))}>
          {t("Turn back on")}
        </Button>
      }
    >
      {themeLine}
    </StatusCard>
  ) : (
    <StatusCard
      tone="live"
      title={t("Live on {theme}", { theme: themeName })}
      description={liveSentence(saved)}
      actions={
        <>
          <Button onClick={preview}>{t("Preview store")}</Button>
          <Button variant="plain" onClick={() => confirmRef.current?.showOverlay?.()}>
            {t("Pause")}
          </Button>
        </>
      }
    >
      {themeLine}
    </StatusCard>
  );

  return (
    <s-page inlineSize="base">
      {header}

      <div class="vc-stack">
        {statusCard}

        {otherApps.length > 0 && (
          <s-banner tone="warning" heading={t("Another variant app is on in this theme")}>
            <s-paragraph>
              {t("{apps} may change the same product cards, so variants can show twice. Turn it off in App embeds, then press Save.", {
                apps: otherApps.map(appNameFromHandle).join(", "),
              })}
            </s-paragraph>
            <s-stack direction="inline" gap="small-200">
              <s-button onClick={() => theme && shopDomain && openExternal(appEmbedsUrl(shopDomain, theme.id))}>{t("Open App embeds")}</s-button>
              <s-button variant="tertiary" onClick={recheck}>
                {t("Check again")}
              </s-button>
            </s-stack>
          </s-banner>
        )}

        <Panel title={t("What gets its own card")}>
          <SplitPicker labelHidden enabled={s.split.enabled} by={s.split.by} onChange={(split) => patch("split", split)} />
        </Panel>

        <Panel title={t("Where cards show")}>
          <ChoiceCards<"all" | "selected">
            label={t("Collections")}
            labelHidden
            value={s.collections.mode}
            minWidth={220}
            choices={[
              { value: "all", title: t("All collections"), description: t("Every collection page in your store.") },
              { value: "selected", title: t("Only some collections"), description: t("Choose them below.") },
            ]}
            onChange={(mode) => patch("collections", { mode })}
          />
          {s.collections.mode === "selected" && <CollectionPicker handles={s.collections.handles} onChange={(handles) => patch("collections", { handles })} />}
        </Panel>

        <div class="vc-link-cards">
          <LinkCard
            to="/swatches"
            icon="swatches"
            title={t("Swatches")}
            tag={
              <Tag tone={saved.swatches.enabled ? "success" : undefined} dot>
                {saved.swatches.enabled ? t("On") : t("Off")}
              </Tag>
            }
            description={t("Shoppers pick a color or style right on the card.")}
          />
          <LinkCard to="/collections" icon="collections" title={t("Collections")} description={t("Change the order of cards in a collection, or hide some.")} />
          <LinkCard to="/settings" icon="settings" title={t("More settings")} description={t("Card titles, sold-out cards, prices and more.")} />
          <LinkCard to="/help" icon="help" title={t("Help")} description={t("How it works, and what to do if cards don't show.")} />
        </div>
      </div>

      <footer class="vc-footer">
        <span class="vc-muted">{t("Free forever. Every feature included.")}</span>
      </footer>

      <s-modal id="vc-confirm-pause" heading={t("Pause Variant Cards?")} ref={confirmRef}>
        <s-paragraph>{t("Your store goes back to one card per product right away. Your settings are kept.")}</s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={() => {
            confirmRef.current?.hideOverlay?.();
            void update((settings) => ({ ...settings, enabled: false }), t("Variant Cards is paused"));
          }}
        >
          {t("Pause")}
        </s-button>
        <s-button slot="secondary-actions" commandFor="vc-confirm-pause" command="--hide">
          {t("Cancel")}
        </s-button>
      </s-modal>
    </s-page>
  );
}
