import { useRef, useState } from "preact/hooks";
import { APP_NAME } from "../../shared/brand";
import { splitOptionName, type AppSettings } from "../../shared/settings";
import { listCollections } from "../api/collections";
import { appEmbedsUrl, appNameFromHandle, enableEmbedUrl, listThemes, loadThemeStatus, preferredTheme, setPreferredTheme, type ThemeInfo } from "../api/theme";
import { ChoiceCards } from "../components/ChoiceCards";
import { CollectionPicker } from "../components/CollectionPicker";
import { splitKind, SplitPicker, TitlePicker } from "../components/choices";
import { ErrorBanner, Loading, openExternal } from "../components/common";
import { Dropdown } from "../components/Dropdown";
import { LanguagePicker } from "../components/LanguagePicker";
import { Button, LinkCard, LinkRow, PageHeader, Panel, StatusCard, Tag, ToggleList, ToggleRow } from "../components/ui";
import { formatNumber, t, tn } from "../i18n";
import { useSettingsDraft } from "../lib/draft";
import { useAsync } from "../lib/hooks";
import { navigate } from "../router";
import { collectionIsOn } from "./Collections";

function themeLabel(theme: ThemeInfo): string {
  return theme.role === "MAIN" ? t("{name} (published)", { name: theme.name }) : theme.name;
}

/** What shoppers see now, in one sentence. */
function liveSentence(settings: AppSettings): string {
  const kind = splitKind(settings.split.enabled, settings.split.by);
  if (kind === "none") return t("Cards aren't split right now. Choose what gets its own card below.");
  if (kind === "variant") return t("Shoppers see a card for each variant on your collection pages.");
  if (kind === "option") return t("Shoppers see a card for each {option} on your collection pages.", { option: splitOptionName(settings.split.by)! });
  return t("Shoppers see a card for each color on your collection pages.");
}

/** The first collections, whether they show variant cards (with the changes on this page), and a way in. */
function CollectionsPreview({ settings }: { settings: AppSettings }) {
  const page = useAsync(() => listCollections({ pageSize: 5 }), []);
  if (page.error) return <ErrorBanner error={page.error} onRetry={page.reload} />;
  if (!page.data) return <p class="vc-muted">{t("Loading…")}</p>;
  if (!page.data.rows.length) return <p class="vc-muted">{t("Your store has no collections yet.")}</p>;
  return (
    <div class="vc-link-rows">
      {page.data.rows.map((row) => {
        const on = collectionIsOn(row, settings);
        return (
          <LinkRow
            key={row.id}
            to={`/collections/${row.id}`}
            media={<s-thumbnail size="small" src={row.image ?? undefined} alt="" />}
            title={row.title}
            meta={tn(row.productsCount, "{count} product", "{count} products", { count: formatNumber(row.productsCount) })}
            tags={
              <Tag tone={on ? "success" : undefined} dot>
                {on ? t("On") : t("Off")}
              </Tag>
            }
          />
        );
      })}
    </div>
  );
}

export function Dashboard() {
  // The main settings live here, so this page is a form: Shopify's save bar appears once something changes.
  const { context, draft, saved, patch, update, saving } = useSettingsDraft("vc-home-save-bar");
  const themes = useAsync(() => listThemes(), []);
  const [themeId, setThemeId] = useState("");
  const theme = themes.data?.find((th) => th.id === themeId) ?? preferredTheme(themes.data);
  const status = useAsync(() => (theme ? loadThemeStatus(theme.id).then((st) => ({ ...st, themeId: theme.id })) : Promise.resolve(null)), [theme?.id]);
  const confirmRef = useRef<any>(null);

  if (context.error) {
    return (
      <s-page inlineSize="base">
        <PageHeader title={APP_NAME} />
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }
  if (!draft || !saved) {
    return (
      <s-page inlineSize="base">
        <PageHeader title={APP_NAME} />
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

  const themePicker = themes.data && themes.data.length > 1 && (
    <div class="vc-inline-field">
      <Dropdown
        label={t("Theme")}
        value={theme?.id ?? ""}
        options={themes.data.map((th) => ({ value: th.id, label: themeLabel(th) }))}
        onChange={(id) => {
          const picked = themes.data!.find((th) => th.id === id);
          if (picked) setPreferredTheme(picked);
          setThemeId(id);
        }}
      />
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
      {themePicker}
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
      {themePicker}
    </StatusCard>
  ) : (
    <StatusCard
      tone="live"
      title={t("Live on {theme}", { theme: themeName })}
      description={liveSentence(saved)}
      actions={<Button onClick={() => confirmRef.current?.showOverlay?.()}>{t("Pause")}</Button>}
    >
      {themePicker}
    </StatusCard>
  );

  return (
    <s-page inlineSize="base">
      <PageHeader
        title={APP_NAME}
        subtitle={t("Show every color as its own product card on your collection pages.")}
        actions={<Button onClick={preview}>{t("Preview store")}</Button>}
      />

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

        <Panel title={t("What gets its own card")} description={t("Pick how your products are split into cards.")}>
          <SplitPicker labelHidden enabled={s.split.enabled} by={s.split.by} onChange={(split) => patch("split", split)} />
          {s.split.enabled && (
            <div class="vc-narrow">
              <TitlePicker title={s.split.title} by={s.split.by} onChange={(title) => patch("split", { title })} />
            </div>
          )}
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
          <ToggleList label={t("Also on")}>
            <ToggleRow title={t("All products page")} checked={s.pages.allProducts} onChange={(allProducts) => patch("pages", { allProducts })} />
            <ToggleRow title={t("Search results")} checked={s.pages.search} onChange={(search) => patch("pages", { search })} />
            <ToggleRow title={t("Product grids on the home page")} checked={s.pages.home} onChange={(home) => patch("pages", { home })} />
          </ToggleList>
        </Panel>

        <Panel
          title={t("Your collections")}
          description={t("Open a collection to change the order of its cards or hide some.")}
          action={
            <Button variant="plain" onClick={() => void navigate("/collections")}>
              {t("See all")}
            </Button>
          }
        >
          <CollectionsPreview settings={s} />
        </Panel>

        <div class="vc-two">
          <LinkCard to="/settings" icon="settings" title={t("More settings")} description={t("Sold-out cards, missing photos, prices, badges and advanced options.")} />
          <LinkCard to="/help" icon="help" title={t("Help")} description={t("How it works, and what to do if cards don't show.")} />
        </div>
      </div>

      <footer class="vc-footer">
        <span class="vc-muted">{t("Free forever. Every feature included.")}</span>
        <div class="vc-footer__language">
          <LanguagePicker />
        </div>
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
