import { useRef, useState } from "preact/hooks";
import { APP_NAME } from "../../shared/brand";
import { appEmbedsUrl, appNameFromHandle, enableEmbedUrl, listThemes, loadThemeStatus, preferredTheme, setPreferredTheme, type ThemeInfo } from "../api/theme";
import { splitSummary } from "../components/choices";
import { ErrorBanner, openExternal } from "../components/common";
import { Dropdown } from "../components/Dropdown";
import { LanguagePicker } from "../components/LanguagePicker";
import { SetupGuide, type SetupStep } from "../components/SetupGuide";
import { t, tn } from "../i18n";
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

function themeLabel(theme: ThemeInfo): string {
  return theme.role === "MAIN" ? t("{name} (published)", { name: theme.name }) : theme.name;
}

/** A row that opens another page of the app. */
function LinkRow(props: { icon: string; title: string; description: string; to: string }) {
  return (
    <s-clickable onClick={() => void navigate(props.to)} padding="small-100 base" accessibilityLabel={props.title}>
      <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
        <span class="vc-link-row__icon">
          <s-icon type={props.icon as any} />
        </span>
        <s-stack direction="block" gap="none">
          <s-text type="strong">{props.title}</s-text>
          <s-text color="subdued">{props.description}</s-text>
        </s-stack>
        <s-icon type="chevron-right" color="subdued" />
      </s-grid>
    </s-clickable>
  );
}

export function Dashboard() {
  // No form here, so no save bar: pausing and setup progress save right away.
  const { context, draft: settings, update, saving } = useSettingsDraft();
  const themes = useAsync(() => listThemes(), []);
  const [themeId, setThemeId] = useState("");
  const theme = themes.data?.find((th) => th.id === themeId) ?? preferredTheme(themes.data);
  const status = useAsync(() => (theme ? loadThemeStatus(theme.id) : Promise.resolve(null)), [theme?.id]);
  const [guideHidden, setGuideHidden] = useState(() => readFlag(GUIDE_HIDDEN_KEY));
  const confirmRef = useRef<any>(null);

  const shopDomain = context.data?.shop.domain ?? window.shopify?.config?.shop ?? "";
  const apiKey = window.shopify?.config?.apiKey ?? "";
  const storeUrl = context.data?.shop.url ?? (shopDomain ? `https://${shopDomain}` : "");
  const checking = themes.loading || status.loading;
  const embedOn = status.data?.embed === "enabled";
  const otherApps = status.data?.otherVariantApps ?? [];

  if (context.error) {
    return (
      <s-page heading={APP_NAME}>
        <ErrorBanner error={context.error} onRetry={context.reload} />
      </s-page>
    );
  }

  const openEmbed = () => theme && shopDomain && openExternal(enableEmbedUrl(shopDomain, theme.id, apiKey));
  const preview = () => {
    const url = new URL("/collections/all", storeUrl || `https://${shopDomain}`);
    if (theme && theme.role !== "MAIN") url.searchParams.set("preview_theme_id", theme.id.split("/").pop()!);
    openExternal(url.toString());
    if (settings && !settings.admin.previewed) void update((s) => ({ ...s, admin: { ...s.admin, previewed: true } }));
  };
  const resume = () => void update((s) => ({ ...s, enabled: true }), t("Variant Cards is on"));
  const hideGuide = (hidden: boolean) => {
    writeFlag(GUIDE_HIDDEN_KEY, hidden);
    setGuideHidden(hidden);
  };

  const themePicker = themes.data && themes.data.length > 1 && (
    <s-box maxInlineSize="320px">
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
    </s-box>
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
              <s-paragraph>{t("Click the button, then press Save in the theme editor.")}</s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button variant="primary" onClick={openEmbed}>
                  {t("Turn on in theme editor")}
                </s-button>
                <s-button variant="tertiary" onClick={status.reload}>
                  {t("Check again")}
                </s-button>
              </s-stack>
            </>
          ),
        },
        {
          key: "settings",
          title: t("Choose how cards look"),
          done: settings.admin.settingsSaved,
          image: "/illustrations/assign.svg",
          content: (
            <>
              <s-paragraph>{t("Pick what gets its own card and how it's named.")}</s-paragraph>
              <s-stack direction="inline">
                <s-button variant="primary" onClick={() => void navigate("/settings")}>
                  {t("Open settings")}
                </s-button>
              </s-stack>
            </>
          ),
        },
        {
          key: "preview",
          title: t("See it in your store"),
          done: settings.admin.previewed,
          image: "/illustrations/free.svg",
          content: (
            <>
              <s-paragraph>{t("Open a collection page and check that each color has its own card.")}</s-paragraph>
              <s-stack direction="inline">
                <s-button variant="primary" onClick={preview}>
                  {t("Preview store")}
                </s-button>
              </s-stack>
            </>
          ),
        },
      ]
    : [];
  const setupDone = steps.length > 0 && steps.every((step) => step.done);
  const showGuide = !!settings && !guideHidden && !setupDone;

  const where = settings
    ? settings.collections.mode === "all"
      ? t("All collections")
      : tn(settings.collections.handles.length, "{count} collection", "{count} collections")
    : "";

  return (
    <s-page heading={APP_NAME} inlineSize="base">
      <s-button slot="primary-action" variant="primary" onClick={() => void navigate("/settings")}>
        {t("Settings")}
      </s-button>

      <s-stack direction="block" gap="base">
        {settings && !settings.enabled && (
          <s-banner tone="warning" heading={t("Variant Cards is paused")}>
            <s-paragraph>{t("Your store shows one card per product until you turn it back on.")}</s-paragraph>
            <s-button loading={saving} onClick={resume}>
              {t("Turn back on")}
            </s-button>
          </s-banner>
        )}

        {otherApps.length > 0 && (
          <s-banner tone="warning" heading={t("Another variant app is on in this theme")}>
            <s-paragraph>
              {t("{apps} may change the same product cards, so variants can show twice. Turn it off in App embeds, then press Save.", {
                apps: otherApps.map(appNameFromHandle).join(", "),
              })}
            </s-paragraph>
            <s-stack direction="inline" gap="small-200">
              <s-button onClick={() => theme && shopDomain && openExternal(appEmbedsUrl(shopDomain, theme.id))}>{t("Open App embeds")}</s-button>
              <s-button variant="tertiary" onClick={status.reload}>
                {t("Check again")}
              </s-button>
            </s-stack>
          </s-banner>
        )}

        {showGuide ? (
          <SetupGuide
            steps={steps}
            ready={!checking}
            intro={t("Three steps to show every color as its own product card.")}
            doneIntro={t("You're all set.")}
            onDismiss={() => hideGuide(true)}
          />
        ) : (
          <s-section>
            <div class="vc-status">
              <span class={`vc-status__dot ${checking ? "is-checking" : !settings?.enabled ? "is-paused" : embedOn ? "is-live" : "is-off"}`} aria-hidden="true" />
              <div class="vc-status__text">
                <s-heading>
                  {checking
                    ? t("Checking your theme…")
                    : !settings?.enabled
                      ? t("Paused")
                      : embedOn
                        ? t("Live on {theme}", { theme: theme?.name ?? "" })
                        : t("Not on in {theme} yet", { theme: theme?.name ?? "" })}
                </s-heading>
                <s-text color="subdued">
                  {!checking && settings?.enabled && !embedOn ? t("Turn on the app in your theme to show variant cards.") : settings ? `${splitSummary(settings.split.enabled, settings.split.by)} · ${where}` : ""}
                </s-text>
              </div>
              <s-stack direction="inline" gap="small-200">
                {!checking && settings?.enabled && !embedOn ? (
                  <>
                    <s-button variant="tertiary" onClick={status.reload}>
                      {t("Check again")}
                    </s-button>
                    <s-button variant="primary" onClick={openEmbed}>
                      {t("Turn on")}
                    </s-button>
                  </>
                ) : (
                  <>
                    {settings?.enabled && (
                      <s-button variant="tertiary" commandFor="vc-confirm-pause">
                        {t("Pause")}
                      </s-button>
                    )}
                    <s-button onClick={preview}>{t("Preview store")}</s-button>
                  </>
                )}
              </s-stack>
            </div>
            {themePicker && <div class="vc-status__theme">{themePicker}</div>}
          </s-section>
        )}

        <s-section heading={t("Customize")} padding="none">
          <div class="vc-link-rows">
            <LinkRow icon="collection" title={t("Collections")} description={t("Change the order of cards or hide some, per collection.")} to="/collections" />
            <LinkRow icon="color" title={t("Swatches")} description={settings?.swatches.enabled ? t("On: color dots under each card.") : t("Add color dots under each card.")} to="/swatches" />
            <LinkRow icon="layout-section" title={t("Sections")} description={t("Best sellers, related products and more, with variant cards.")} to="/sections" />
          </div>
        </s-section>
      </s-stack>

      <div class="vc-footer">
        <s-text color="subdued">{t("Free forever. Every feature included.")}</s-text>
        <s-link
          href="/help"
          onClick={(event) => {
            event.preventDefault();
            void navigate("/help");
          }}
        >
          {t("Help")}
        </s-link>
        {guideHidden && !setupDone && (
          <s-link
            href="#setup-guide"
            onClick={(event) => {
              event.preventDefault();
              hideGuide(false);
            }}
          >
            {t("Show setup guide")}
          </s-link>
        )}
        <div class="vc-footer__language">
          <LanguagePicker />
        </div>
      </div>

      <s-modal id="vc-confirm-pause" heading={t("Pause Variant Cards?")} ref={confirmRef}>
        <s-paragraph>{t("Your store goes back to one card per product right away. Your settings are kept.")}</s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={() => {
            confirmRef.current?.hideOverlay?.();
            void update((s) => ({ ...s, enabled: false }), t("Variant Cards is paused"));
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
