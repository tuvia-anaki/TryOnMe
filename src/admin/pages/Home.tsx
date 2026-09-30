import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { APP_NAME } from "../../shared/brand";
import type { AppSettings } from "../../shared/settings";
import { listProducts, type ProductPage, type ProductRow } from "../api/products";
import { loadAppContext } from "../api/settings";
import { loadThemeStatus, themeEditorUrl, type ThemeStatus } from "../api/theme";
import { ErrorBanner, openExternal } from "../components/common";
import { LanguagePicker } from "../components/LanguagePicker";
import { FilterTabs, ProductTable, canSetUp, matchesFilter, readyFirst, type ProductFilter } from "../components/ProductTable";
import { t } from "../i18n";
import { useAsync, useDebounced, type AsyncState } from "../lib/hooks";
import { navigate } from "../router";

const GUIDE_HIDDEN_KEY = "pvi:setup-guide-hidden";

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
    /* storage blocked: the choice lasts until the page reloads */
  }
}

/** Link-styled navigation inside the app (keeps Shopify's embedded params). */
function AppLink(props: { to: string; children: ComponentChildren }) {
  return (
    <s-link
      href={props.to}
      onClick={(event) => {
        event.preventDefault();
        void navigate(props.to);
      }}
    >
      {props.children}
    </s-link>
  );
}

interface Step {
  key: string;
  title: string;
  done: boolean;
  body: string;
  image: string;
  actions: ComponentChildren;
}

function SetupStep(props: { step: Step; open: boolean; onToggle: () => void }) {
  const { step } = props;
  return (
    <s-box>
      <s-clickable onClick={props.onToggle} padding="small" borderRadius="base" accessibilityLabel={step.title}>
        <s-grid gridTemplateColumns="auto 1fr auto" gap="small" alignItems="center">
          {step.done ? <s-icon type="check-circle-filled" tone="success" /> : <s-icon type="circle-dashed" color="subdued" />}
          <s-text type={props.open ? "strong" : "generic"}>{step.title}</s-text>
          <s-icon type={props.open ? "chevron-up" : "chevron-down"} color="subdued" />
        </s-grid>
      </s-clickable>
      <s-box padding="small" paddingBlockStart="none" display={props.open ? "auto" : "none"}>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-grid gridTemplateColumns="@container (inline-size <= 420px) 1fr, 1fr auto" gap="base" alignItems="center">
            <s-grid gap="small-300">
              <s-paragraph>{step.body}</s-paragraph>
              <s-stack direction="inline" gap="small-200">
                {step.actions}
              </s-stack>
            </s-grid>
            <s-box maxInlineSize="88px" maxBlockSize="88px">
              <s-image src={step.image} alt="" accessibilityRole="presentation" />
            </s-box>
          </s-grid>
        </s-box>
      </s-box>
    </s-box>
  );
}

/** Shopify's setup guide pattern; steps tick themselves as the merchant completes them. */
function SetupGuide(props: { steps: Step[]; ready: boolean; onDismiss: () => void }) {
  const done = props.steps.filter((step) => step.done).length;
  const total = props.steps.length;
  const allDone = done === total;
  const firstOpen = props.steps.find((step) => !step.done)?.key ?? null;
  const [open, setOpen] = useState<string | null>(firstOpen);
  const [expanded, setExpanded] = useState(true);

  // Once the checks finish, open the first unfinished step (and fold a finished guide).
  useEffect(() => {
    if (!props.ready) return;
    setOpen(firstOpen);
    if (allDone) setExpanded(false);
  }, [props.ready]);

  return (
    <s-section>
      <s-grid gap="small">
        <s-grid gap="small-200">
          <s-grid gridTemplateColumns="1fr auto auto" gap="small-300" alignItems="center">
            <s-heading>{t("Setup guide")}</s-heading>
            <s-button variant="tertiary" tone="neutral" icon="x" accessibilityLabel={t("Dismiss setup guide")} onClick={props.onDismiss} />
            <s-button
              variant="tertiary"
              tone="neutral"
              icon={expanded ? "chevron-up" : "chevron-down"}
              accessibilityLabel={t("Show or hide the setup guide")}
              onClick={() => setExpanded(!expanded)}
            />
          </s-grid>
          <s-paragraph>
            {allDone
              ? t("You're all set: shoppers now see the right images for every variant.")
              : t("Three steps to show the right images for every variant.")}
          </s-paragraph>
          <s-grid gridTemplateColumns="auto 1fr" gap="base" alignItems="center">
            <s-text color="subdued">{t("{done} of {total} tasks complete", { done, total })}</s-text>
            {/* Not <s-progress>: at 0 it shows its "loading" animation. */}
            <div
              class={`pvi-progress${allDone ? " is-done" : ""}`}
              role="progressbar"
              aria-label={t("Setup progress")}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <span style={{ width: `${(done / total) * 100}%` }} />
            </div>
          </s-grid>
        </s-grid>
        <s-box borderRadius="base" border="base" background="base" display={expanded ? "auto" : "none"}>
          {props.steps.map((step, index) => (
            <s-box key={step.key}>
              {index > 0 && <s-divider />}
              <SetupStep step={step} open={open === step.key} onToggle={() => setOpen(open === step.key ? null : step.key)} />
            </s-box>
          ))}
        </s-box>
      </s-grid>
    </s-section>
  );
}

function StatusCard(props: {
  title: string;
  status: { tone: "success" | "caution" | "neutral" | "critical" | "info"; label: string };
  text: string;
  children: ComponentChildren;
}) {
  return (
    <s-section>
      <s-grid gap="small-300">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-heading>{props.title}</s-heading>
          <s-badge tone={props.status.tone}>{props.status.label}</s-badge>
        </s-stack>
        <s-paragraph color="subdued">{props.text}</s-paragraph>
        <s-stack direction="inline" gap="small-200">
          {props.children}
        </s-stack>
      </s-grid>
    </s-section>
  );
}

function galleryStatus(theme: ThemeStatus | null, loading: boolean, failed: boolean, settings: AppSettings | null) {
  if (loading) return { tone: "neutral" as const, label: t("Checking…"), text: t("Checking your live theme…"), state: "checking" as const };
  if (failed || !theme || theme.embed === "unknown")
    return { tone: "neutral" as const, label: t("Unknown"), text: t("We couldn't check your theme. Open the theme editor to make sure the app embed is on."), state: "unknown" as const };
  if (theme.embed !== "enabled")
    return { tone: "caution" as const, label: t("Off"), text: t("Turn on the app embed in your theme to start showing variant images."), state: "off" as const };
  if (settings && !settings.gallery.enabled)
    return { tone: "caution" as const, label: t("Paused"), text: t("Variant image filtering is turned off in Settings."), state: "paused" as const };
  return {
    tone: "success" as const,
    label: t("Active"),
    text: theme.themeName
      ? t("Shoppers see only the selected variant's images in {theme}.", { theme: theme.themeName })
      : t("Shoppers see only the selected variant's images."),
    state: "active" as const,
  };
}

function swatchStatus(settings: AppSettings | null) {
  if (!settings) return { tone: "neutral" as const, label: t("Checking…"), text: t("Loading your settings…"), on: false };
  const product = settings.swatches.enabled;
  const cards = settings.cards.enabled;
  if (product && cards)
    return { tone: "success" as const, label: t("Active"), text: t("Swatches show on product pages and collection cards."), on: true };
  if (product) return { tone: "success" as const, label: t("Active"), text: t("Swatches show on product pages."), on: true };
  if (cards) return { tone: "success" as const, label: t("Active"), text: t("Swatches show on collection cards."), on: true };
  return { tone: "neutral" as const, label: t("Off"), text: t("Show color and image swatches instead of dropdowns."), on: false };
}

const ROWS_STEP = 5;

function mergeRows(first: ProductRow[], second: ProductRow[]): ProductRow[] {
  const seen = new Set(first.map((row) => row.id));
  return [...first, ...second.filter((row) => !seen.has(row.id))];
}

/**
 * The store's products, like on competitors' home pages: what's left to set up
 * (products that can be set up first) and what's done. Every row opens inside the app.
 */
function HomeProducts({ withVariants }: { withVariants: AsyncState<ProductPage> }) {
  const [tab, setTab] = useState<ProductFilter>("todo");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(ROWS_STEP);
  const query = useDebounced(search.trim(), 350);
  // Recently edited products of any kind, so the list is never empty…
  const latest = useAsync(() => listProducts({ pageSize: 50, sort: "updated" }), []);
  const found = useAsync(() => (query ? listProducts({ search: query, pageSize: 50 }) : Promise.resolve(null)), [query]);
  useEffect(() => setLimit(ROWS_STEP), [tab, query]);

  // …plus the products with variants (the ones that can be set up), even if not edited lately.
  const all = query ? (found.data?.rows ?? []) : mergeRows(withVariants.data?.rows ?? [], latest.data?.rows ?? []);
  const loading = query ? found.loading : withVariants.loading || latest.loading;
  const error = query ? found.error : (withVariants.error ?? latest.error);
  const matching = all.filter((row) => matchesFilter(row, tab));
  const rows = tab === "todo" ? readyFirst(matching) : matching;
  const noneReady = !loading && tab === "todo" && rows.length > 0 && !rows.some(canSetUp);

  const empty = query
    ? t("No products match “{search}”.", { search: query })
    : tab === "configured"
      ? t("None of your recently edited products are set up yet.")
      : t("Nothing left to set up among your recently edited products.");

  const retry = () => {
    if (query) return found.reload();
    withVariants.reload();
    latest.reload();
  };

  return (
    <s-section padding="none" accessibilityLabel={t("Products")}>
      <s-box padding="base">
        <s-grid gap="small-300">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-heading>{t("Products")}</s-heading>
            <s-button variant="tertiary" onClick={() => void navigate(`/products?filter=${tab}`)}>
              {t("View all")}
            </s-button>
          </s-grid>
          <s-grid gridTemplateColumns="@container (inline-size <= 480px) 1fr, auto 1fr" gap="small-300" alignItems="center">
            <s-stack direction="inline">
              <FilterTabs value={tab} options={["todo", "configured"]} onChange={setTab} />
            </s-stack>
            <s-search-field
              label={t("Search products")}
              labelAccessibilityVisibility="exclusive"
              placeholder={t("Search by title")}
              value={search}
              onInput={(event) => setSearch(event.currentTarget.value ?? "")}
            />
          </s-grid>
          {noneReady && (
            <s-banner tone="info">
              {t("Variant images work on products with at least 2 variants (like colors) and 2 images. None of your recent products have that yet.")}
            </s-banner>
          )}
        </s-grid>
      </s-box>
      {error ? (
        <s-box padding="base">
          <ErrorBanner error={error} onRetry={retry} />
        </s-box>
      ) : (
        <ProductTable variant="compact" rows={rows.slice(0, limit)} loading={loading} empty={empty} />
      )}
      {!loading && rows.length > limit && (
        <s-box padding="small">
          <s-stack direction="inline" justifyContent="center">
            <s-button variant="tertiary" onClick={() => setLimit(limit + ROWS_STEP)}>
              {t("Show more")}
            </s-button>
          </s-stack>
        </s-box>
      )}
    </s-section>
  );
}

export function Home() {
  const context = useAsync(() => loadAppContext(), []);
  const theme = useAsync(() => loadThemeStatus(), []);
  const recent = useAsync(() => listProducts({ pageSize: 50, sort: "updated", withVariants: true }), []);
  const [guideHidden, setGuideHidden] = useState(() => readFlag(GUIDE_HIDDEN_KEY));

  const settings = context.data?.settings ?? null;
  const shopDomain = context.data?.shop.domain ?? window.shopify?.config?.shop ?? "";
  const apiKey = window.shopify?.config?.apiKey ?? "";
  const embedUrl = shopDomain && apiKey ? themeEditorUrl(shopDomain, apiKey) : "";
  const openThemeEditor = () => embedUrl && openExternal(embedUrl);
  const storeUrl = context.data?.shop.url ?? (shopDomain ? `https://${shopDomain}` : "");

  const gallery = galleryStatus(theme.data ?? null, theme.loading, !!theme.error, settings);
  const swatches = swatchStatus(settings);
  const assigned = !!settings?.admin.assigned || !!recent.data?.rows.some((row) => row.configured);

  const steps: Step[] = [
    {
      key: "embed",
      title: t("Turn on the app embed in your theme"),
      done: gallery.state === "active" || gallery.state === "paused",
      body: t("The app embed switches variant images and swatches on in your live theme, without editing theme code. Shopify asks you to turn it on yourself: click the button, then Save."),
      image: "/illustrations/embed.svg",
      actions: (
        <>
          <s-button variant="primary" onClick={openThemeEditor}>
            {t("Turn on in theme editor")}
          </s-button>
          <s-button variant="tertiary" tone="neutral" onClick={theme.reload}>
            {t("Check again")}
          </s-button>
        </>
      ),
    },
    {
      key: "assign",
      title: t("Assign images to variants"),
      done: assigned,
      body: t("Let the app match images automatically (by variant image order, alt text, file name or colors), then fine-tune any product by hand."),
      image: "/illustrations/assign.svg",
      actions: (
        <>
          <s-button variant="primary" onClick={() => void navigate("/bulk")}>
            {t("Auto-assign all products")}
          </s-button>
          <s-button onClick={() => void navigate("/products?filter=todo")}>{t("Choose a product")}</s-button>
        </>
      ),
    },
    {
      key: "swatches",
      title: t("Add color swatches (optional)"),
      done: swatches.on,
      body: t("Replace your theme's color dropdowns with color or image swatches, on product pages and collection cards."),
      image: "/illustrations/swatches.svg",
      actions: (
        <s-button variant="primary" onClick={() => void navigate("/swatches")}>
          {t("Set up swatches")}
        </s-button>
      ),
    },
  ];

  const hideGuide = (hidden: boolean) => {
    writeFlag(GUIDE_HIDDEN_KEY, hidden);
    setGuideHidden(hidden);
  };

  return (
    <s-page heading={APP_NAME} inlineSize="base">
      <s-button slot="primary-action" variant="primary" onClick={() => void navigate("/products")}>
        {t("Assign images")}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => void navigate("/bulk")}>
        {t("Bulk auto-assign")}
      </s-button>

      <s-stack direction="block" gap="base">
        <s-query-container>
          <s-grid gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr auto" gap="base" alignItems="center">
            <s-grid gap="small-200">
              <s-heading fontSize="large-200">{t("Show the right images for every variant")}</s-heading>
              <s-paragraph color="subdued">
                {t("When a shopper picks a color, only that color's images show in the gallery. Add color and image swatches to your variant picker and collection pages.")}
              </s-paragraph>
            </s-grid>
            <s-box minInlineSize="180px">
              <LanguagePicker />
            </s-box>
          </s-grid>
        </s-query-container>

        {theme.data?.conflicts.length ? (
          <s-banner tone="warning" heading={t("Your theme hides variant media on its own")}>
            <s-paragraph>
              {t(
                "The theme setting “Hide other variants’ media” is on. Turn it off (Theme editor → Product page → product information/media settings) so it doesn't fight with {app}.",
                { app: APP_NAME },
              )}
            </s-paragraph>
            {shopDomain && (
              <s-button onClick={() => openExternal(`https://${shopDomain}/admin/themes/current/editor?template=product`)}>
                {t("Open theme editor")}
              </s-button>
            )}
          </s-banner>
        ) : null}

        {context.error && <ErrorBanner error={context.error} onRetry={context.reload} />}

        {!guideHidden && <SetupGuide steps={steps} ready={!theme.loading && !context.loading && !recent.loading} onDismiss={() => hideGuide(true)} />}

        <s-query-container>
          <s-grid gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr 1fr" gap="base">
            <StatusCard title={t("Variant images")} status={gallery} text={gallery.text}>
              {gallery.state === "active" ? (
                <>
                  <s-button onClick={() => void navigate("/settings")}>{t("Settings")}</s-button>
                  {storeUrl && (
                    <s-button variant="tertiary" onClick={() => openExternal(storeUrl)}>
                      {t("View store")}
                    </s-button>
                  )}
                </>
              ) : gallery.state === "paused" ? (
                <s-button variant="primary" onClick={() => void navigate("/settings")}>
                  {t("Turn on")}
                </s-button>
              ) : gallery.state === "checking" ? null : (
                <s-button variant={gallery.state === "off" ? "primary" : "secondary"} onClick={openThemeEditor}>
                  {gallery.state === "off" ? t("Activate") : t("Open theme editor")}
                </s-button>
              )}
            </StatusCard>
            <StatusCard title={t("Swatches")} status={swatches} text={swatches.text}>
              <s-button variant={swatches.on ? "secondary" : "primary"} onClick={() => void navigate("/swatches")}>
                {swatches.on ? t("Customize") : t("Activate")}
              </s-button>
            </StatusCard>
          </s-grid>
        </s-query-container>

        <HomeProducts withVariants={recent} />

        <s-section>
          <s-grid gridTemplateColumns="@container (inline-size <= 520px) 1fr, 1fr auto" gap="large" alignItems="center">
            <s-grid gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-heading>{t("Free forever")}</s-heading>
                <s-badge tone="success">{t("Every feature included")}</s-badge>
              </s-stack>
              <s-paragraph>
                {t(
                  "Every feature is included for every store: unlimited products, variants and images, automatic matching, swatches and collection swatches. No plans, no usage limits, no watermark.",
                )}
              </s-paragraph>
              <s-paragraph color="subdued">
                {t(
                  "Why it can be free: your variant image setup is stored in your own store (as product data), and the storefront script is served by Shopify. Nothing runs on our servers when shoppers browse, so there is nothing to charge you for.",
                )}
              </s-paragraph>
            </s-grid>
            <s-box maxInlineSize="176px">
              <s-image src="/illustrations/free.svg" alt="" accessibilityRole="presentation" />
            </s-box>
          </s-grid>
        </s-section>

      </s-stack>

      <s-stack direction="inline" justifyContent="center" gap="small-200" paddingBlock="large">
        <s-text color="subdued">{t("Need a hand?")}</s-text>
        <AppLink to="/help">{t("Help & troubleshooting")}</AppLink>
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
    </s-page>
  );
}
