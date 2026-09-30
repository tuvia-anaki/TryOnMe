import { useRef, useState } from "preact/hooks";
import { APP_NAME } from "../../shared/brand";
import { SECTIONS, type SectionHandle } from "../../shared/constants";
import { TITLE_PRESETS, type AppSettings, type SplitBy } from "../../shared/settings";
import { testedThemeFor } from "../../shared/themes";
import { listCollections, loadCounts } from "../api/collections";
import { addSectionUrl, enableEmbedUrl, listThemes, loadThemeStatus, type ThemeInfo } from "../api/theme";
import { ErrorBanner, openExternal } from "../components/common";
import { Select, Toggle } from "../components/fields";
import { LanguagePicker } from "../components/LanguagePicker";
import { SetupGuide, type SetupStep } from "../components/SetupGuide";
import { formatNumber, msg, t } from "../i18n";
import { useSettingsDraft } from "../lib/draft";
import { useAsync } from "../lib/hooks";
import { navigate } from "../router";

const GUIDE_HIDDEN_KEY = "vc:setup-guide-hidden";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* storage blocked: lasts until reload */
  }
}

export const SECTION_INFO: Record<SectionHandle, { name: string; description: string; where: string }> = {
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

export function splitByOptions(): [SplitBy, string][] {
  return [
    ["auto", t("Color (automatic)")],
    ["option1", t("First option")],
    ["option2", t("Second option")],
    ["option3", t("Third option")],
    ["combined", t("First and second option together")],
    ["all", t("Every variant")],
  ];
}

export function titleOptions(current: string): [string, string][] {
  const example = (template: string) => template.replace("{product}", t("Classic tee")).replace("{value}", t("Red"));
  const presets: [string, string][] = TITLE_PRESETS.map((p) => [p, example(p)]);
  if (!presets.some(([value]) => value === current)) presets.push([current, t("Custom: {template}", { template: current })]);
  return presets;
}

function roleLabel(theme: ThemeInfo): string {
  return theme.role === "MAIN" ? t("{name} (published)", { name: theme.name }) : theme.name;
}

export function Dashboard() {
  const { context, draft, patch, save, saving } = useSettingsDraft("vc-dashboard-save-bar");
  const themes = useAsync(() => listThemes(), []);
  const [guideHidden, setGuideHidden] = useState(() => readFlag(GUIDE_HIDDEN_KEY));
  const confirmRef = useRef<any>(null);
  const [previewHandle, setPreviewHandle] = useState("all");

  const settings: AppSettings | null = draft;
  const appHandle = context.data?.appHandle ?? "";
  const main = themes.data?.find((th) => th.role === "MAIN") ?? themes.data?.[0] ?? null;
  const theme = themes.data?.find((th) => th.id === settings?.admin.themeId) ?? main;
  const status = useAsync(() => (theme && appHandle ? loadThemeStatus(theme.id, appHandle) : Promise.resolve(null)), [theme?.id, appHandle]);
  const counts = useAsync(() => loadCounts(), []);
  const collections = useAsync(() => listCollections({ pageSize: 25 }), []);

  const shopDomain = context.data?.shop.domain ?? window.shopify?.config?.shop ?? "";
  const apiKey = window.shopify?.config?.apiKey ?? "";
  const storeUrl = context.data?.shop.url ?? (shopDomain ? `https://${shopDomain}` : "");
  const embedOn = status.data?.embed === "enabled";
  const tested = theme ? testedThemeFor(theme.name) : null;

  if (context.error) {
    return (
      <s-page heading={APP_NAME}>
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }

  const openEmbed = () => theme && shopDomain && openExternal(enableEmbedUrl(shopDomain, theme.id, apiKey));
  const previewUrl = () => {
    const path = previewHandle === "all" ? "/collections/all" : `/collections/${encodeURIComponent(previewHandle)}`;
    const url = new URL(path, storeUrl || `https://${shopDomain}`);
    if (theme && theme.role !== "MAIN") url.searchParams.set("preview_theme_id", theme.id.split("/").pop()!);
    return url.toString();
  };
  const markDone = (key: "previewed" | "themeChecked") => void save((s) => ({ ...s, admin: { ...s.admin, [key]: true } }));
  const selectTheme = (id: string) => void save((s) => ({ ...s, admin: { ...s.admin, themeId: id === main?.id ? "" : id } }));

  const themePicker = themes.data && themes.data.length > 1 && settings && (
    <Select label={t("Theme")} value={theme?.id ?? ""} options={themes.data.map((th) => [th.id, roleLabel(th)] as [string, string])} onChange={selectTheme} />
  );

  const steps: SetupStep[] = settings
    ? [
        {
          key: "embed",
          title: t("Turn on the app in your theme"),
          done: embedOn,
          image: "/illustrations/embed.svg",
          content: (
            <>
              {themePicker}
              <s-paragraph>
                {t("The app embed shows variant cards on your collection and search pages. Click the button, then press Save in the theme editor and come back here.")}
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button variant="primary" onClick={openEmbed}>
                  {t("Turn on in theme editor")}
                </s-button>
                <s-button variant="tertiary" tone="neutral" onClick={status.reload}>
                  {t("Check again")}
                </s-button>
              </s-stack>
            </>
          ),
        },
        {
          key: "settings",
          title: t("Choose how variants show"),
          done: settings.admin.settingsSaved,
          image: "/illustrations/assign.svg",
          content: (
            <>
              <Toggle label={t("Show each variant as its own card")} checked={settings.split.enabled} onChange={(enabled) => patch("split", { enabled })} />
              <s-grid gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr" gap="base">
                <Select label={t("Split products by")} value={settings.split.by} options={splitByOptions()} onChange={(by) => patch("split", { by })} />
                <Select label={t("Card title")} value={settings.split.title} options={titleOptions(settings.split.title)} onChange={(title) => patch("split", { title })} />
              </s-grid>
              <Select
                label={t("Where")}
                value={settings.collections.mode}
                options={[
                  ["all", t("All collections")],
                  ["selected", t("Selected collections")],
                ]}
                onChange={(mode) => patch("collections", { mode })}
              />
              <s-stack direction="inline" gap="small-200">
                <s-button variant="primary" loading={saving} onClick={() => void save()}>
                  {t("Save")}
                </s-button>
                <s-button variant="tertiary" onClick={() => void navigate("/settings")}>
                  {t("All settings")}
                </s-button>
              </s-stack>
            </>
          ),
        },
        {
          key: "theme",
          title: t("Theme compatibility"),
          done: !!tested || settings.admin.themeChecked,
          image: "/illustrations/swatches.svg",
          content: tested ? (
            <s-paragraph>{t("{theme} is one of the themes Variant Cards is tested with. Nothing to do here.", { theme: theme?.name ?? tested })}</s-paragraph>
          ) : (
            <>
              <s-paragraph>
                {t("Variant Cards works with most themes automatically. Open a collection page and check that each color shows as its own card.")}
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button onClick={() => openExternal(previewUrl())}>{t("Open a collection page")}</s-button>
                <s-button variant="primary" onClick={() => markDone("themeChecked")}>
                  {t("It works")}
                </s-button>
                <s-button variant="tertiary" onClick={() => void navigate("/help")}>
                  {t("It doesn't")}
                </s-button>
              </s-stack>
            </>
          ),
        },
        {
          key: "preview",
          title: t("Preview a collection page"),
          done: settings.admin.previewed,
          image: "/illustrations/free.svg",
          content: (
            <>
              <Select
                label={t("Collection")}
                value={previewHandle}
                options={[["all", t("All products")] as [string, string], ...(collections.data?.rows ?? []).map((c) => [c.handle, c.title] as [string, string])]}
                onChange={setPreviewHandle}
              />
              <s-stack direction="inline" gap="small-200">
                <s-button
                  variant="primary"
                  onClick={() => {
                    openExternal(previewUrl());
                    markDone("previewed");
                  }}
                >
                  {t("Preview")}
                </s-button>
              </s-stack>
            </>
          ),
        },
      ]
    : [];

  const hideGuide = (hidden: boolean) => {
    writeFlag(GUIDE_HIDDEN_KEY, hidden);
    setGuideHidden(hidden);
  };

  const installedCount = status.data ? SECTIONS.filter((s) => status.data!.sections[s.handle].length > 0).length : 0;

  return (
    <s-page heading={APP_NAME} inlineSize="base">
      <s-button slot="primary-action" variant="primary" onClick={() => void navigate("/settings")}>
        {t("Settings")}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => void navigate("/collections")}>
        {t("Collections")}
      </s-button>

      <s-stack direction="block" gap="base">
        <s-query-container>
          <s-grid gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr auto" gap="base" alignItems="center">
            <s-grid gap="small-200">
              <s-heading fontSize="large-200">{t("Show every variant as its own product")}</s-heading>
              <s-paragraph color="subdued">
                {t("Shoppers see each color (or any option) as a separate card on your collection and search pages, with its own image, title, price and link.")}
              </s-paragraph>
            </s-grid>
            <s-box minInlineSize="180px">
              <LanguagePicker />
            </s-box>
          </s-grid>
        </s-query-container>

        {settings && !settings.enabled && (
          <s-banner tone="warning" heading={t("Variant Cards is switched off")}>
            <s-paragraph>{t("Your store shows the theme's normal product cards until you switch it back on.")}</s-paragraph>
            <s-button onClick={() => void save((s) => ({ ...s, enabled: true }))}>{t("Switch on")}</s-button>
          </s-banner>
        )}

        {!guideHidden && settings && (
          <SetupGuide
            steps={steps}
            ready={!status.loading && !themes.loading}
            intro={t("Four quick steps to show your variants as separate products.")}
            doneIntro={t("You're all set: your collections now show every variant as its own card.")}
            onDismiss={() => hideGuide(true)}
          />
        )}

        <s-query-container>
          <s-grid gridTemplateColumns="@container (inline-size <= 620px) 1fr, 1fr 1fr" gap="base">
            <s-section heading={t("App status")}>
              <s-stack direction="block" gap="base">
                <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                  <s-text>{t("App embed")}</s-text>
                  {status.loading ? (
                    <s-badge>{t("Checking…")}</s-badge>
                  ) : embedOn ? (
                    <s-badge tone="success">{t("Active")}</s-badge>
                  ) : (
                    <s-badge tone="caution">{t("Off")}</s-badge>
                  )}
                </s-grid>
                {themePicker || (theme && <s-text color="subdued">{t("Theme: {theme}", { theme: roleLabel(theme) })}</s-text>)}
                <s-stack direction="inline" gap="small-200">
                  {!embedOn && !status.loading && (
                    <s-button variant="primary" onClick={openEmbed}>
                      {t("Turn on")}
                    </s-button>
                  )}
                  {storeUrl && (
                    <s-button variant={embedOn ? "secondary" : "tertiary"} onClick={() => openExternal(previewUrl())}>
                      {t("Preview store")}
                    </s-button>
                  )}
                </s-stack>
              </s-stack>
            </s-section>

            <s-stack direction="block" gap="base">
              <s-section heading={t("Emergency switch")}>
                <s-stack direction="block" gap="small-300">
                  <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                    <s-text color="subdued">{t("Turn the app off on your storefront in one click, without touching your theme.")}</s-text>
                    {settings?.enabled === false ? <s-badge tone="caution">{t("Off")}</s-badge> : <s-badge tone="success">{t("On")}</s-badge>}
                  </s-grid>
                  <s-stack direction="inline">
                    {settings?.enabled === false ? (
                      <s-button variant="primary" loading={saving} onClick={() => void save((s) => ({ ...s, enabled: true }))}>
                        {t("Switch on")}
                      </s-button>
                    ) : (
                      <s-button tone="critical" commandFor="vc-confirm-off">
                        {t("Switch off")}
                      </s-button>
                    )}
                  </s-stack>
                </s-stack>
              </s-section>
              <s-section heading={t("Plan")}>
                <s-stack direction="block" gap="small-200">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-text type="strong">{t("Free forever")}</s-text>
                    <s-badge tone="success">{t("Every feature included")}</s-badge>
                  </s-stack>
                  <s-text color="subdued">{t("Unlimited collections, products and sections. No usage limits, no paid plans.")}</s-text>
                </s-stack>
              </s-section>
            </s-stack>
          </s-grid>
        </s-query-container>

        <s-section heading={t("Sections")}>
          <s-stack direction="block" gap="small-300">
            <s-paragraph color="subdued">
              {status.data
                ? t("{count} of {total} sections are in {theme}. Add them from here; they show variant cards too.", {
                    count: installedCount,
                    total: SECTIONS.length,
                    theme: theme?.name ?? "",
                  })
                : t("Add the app's sections to your theme; they show variant cards too.")}
            </s-paragraph>
            <s-box border="base" borderRadius="base">
              {SECTIONS.map((section, index) => {
                const info = SECTION_INFO[section.handle];
                const placed = status.data?.sections[section.handle] ?? [];
                return (
                  <s-box key={section.handle}>
                    {index > 0 && <s-divider />}
                    <s-box padding="small-100 base">
                      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                        <s-stack direction="block" gap="small-400">
                          <s-stack direction="inline" gap="small-200" alignItems="center">
                            <s-text type="strong">{t(info.name)}</s-text>
                            {placed.length ? <s-badge tone="success">{t("Added")}</s-badge> : <s-badge>{t("Not added")}</s-badge>}
                          </s-stack>
                          <s-text color="subdued">{`${t(info.description)} · ${t(info.where)}`}</s-text>
                        </s-stack>
                        {theme && shopDomain && (
                          <s-button
                            variant={placed.length ? "tertiary" : "secondary"}
                            onClick={() => openExternal(addSectionUrl(shopDomain, theme.id, apiKey, section.handle, section.template))}
                          >
                            {placed.length ? t("Add another") : t("Add")}
                          </s-button>
                        )}
                      </s-grid>
                    </s-box>
                  </s-box>
                );
              })}
            </s-box>
          </s-stack>
        </s-section>

        <s-section heading={t("Your catalog")}>
          {counts.error ? (
            <ErrorBanner error={counts.error} onRetry={counts.reload} />
          ) : (
            <s-query-container>
              <s-grid gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr 1fr" gap="base">
                <s-stack direction="block" gap="small-400">
                  <s-text color="subdued">{t("Products with variants")}</s-text>
                  <s-heading fontSize="large-200">{counts.data ? formatNumber(counts.data.withVariants) : "…"}</s-heading>
                  <s-text color="subdued">{counts.data ? t("of {total} products", { total: formatNumber(counts.data.products) }) : ""}</s-text>
                </s-stack>
                <s-stack direction="block" gap="small-400">
                  <s-text color="subdued">{t("Collections")}</s-text>
                  <s-heading fontSize="large-200">{counts.data ? formatNumber(counts.data.collections) : "…"}</s-heading>
                  <s-text color="subdued">
                    {settings?.collections.mode === "selected"
                      ? t("{count} show variant cards", { count: formatNumber(settings.collections.handles.length) })
                      : t("All show variant cards")}
                  </s-text>
                </s-stack>
                <s-stack direction="block" gap="small-400">
                  <s-text color="subdued">{t("Also on")}</s-text>
                  <s-text>
                    {[
                      settings?.pages.allProducts ? t("All products page") : null,
                      settings?.pages.search ? t("Search results") : null,
                      settings?.pages.home ? t("Home page") : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || t("Collection pages only")}
                  </s-text>
                  <s-link
                    href="/collections"
                    onClick={(event) => {
                      event.preventDefault();
                      void navigate("/collections");
                    }}
                  >
                    {t("Per-collection settings")}
                  </s-link>
                </s-stack>
              </s-grid>
            </s-query-container>
          )}
        </s-section>
      </s-stack>

      <s-stack direction="inline" justifyContent="center" gap="small-200" paddingBlock="large">
        <s-text color="subdued">{t("Need a hand?")}</s-text>
        <s-link
          href="/help"
          onClick={(event) => {
            event.preventDefault();
            void navigate("/help");
          }}
        >
          {t("Help & troubleshooting")}
        </s-link>
        {guideHidden && (
          <>
            <s-text color="subdued">·</s-text>
            <s-link
              href="#setup-guide"
              onClick={(event) => {
                event.preventDefault();
                hideGuide(false);
              }}
            >
              {t("Show setup guide")}
            </s-link>
          </>
        )}
      </s-stack>

      <s-modal id="vc-confirm-off" heading={t("Switch Variant Cards off?")} ref={confirmRef}>
        <s-paragraph>{t("Your collection pages go back to one card per product right away. Your settings are kept.")}</s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={() => {
            confirmRef.current?.hideOverlay?.();
            void save((s) => ({ ...s, enabled: false }));
          }}
        >
          {t("Switch off")}
        </s-button>
        <s-button slot="secondary-actions" commandFor="vc-confirm-off" command="--hide">
          {t("Cancel")}
        </s-button>
      </s-modal>
    </s-page>
  );
}
