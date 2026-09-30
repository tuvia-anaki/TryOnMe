import { useState } from "preact/hooks";
import type { AppSettings } from "../../shared/settings";
import { listCollections, type CollectionRow } from "../api/collections";
import { loadAppContext } from "../api/settings";
import { ErrorBanner } from "../components/common";
import { formatNumber, t } from "../i18n";
import { useAsync, useDebounced } from "../lib/hooks";
import { navigate } from "../router";

/** Is a collection's page showing variant cards (shop settings + its own override)? */
export function collectionIsOn(row: Pick<CollectionRow, "handle" | "settings">, settings: AppSettings): boolean {
  if (!settings.enabled || row.settings?.enabled === false) return false;
  if (row.handle === "all") return settings.pages.allProducts;
  return settings.collections.mode === "all" || settings.collections.handles.includes(row.handle);
}

function StatusBadges({ row, settings }: { row: CollectionRow; settings: AppSettings | null }) {
  if (!settings) return null;
  const on = collectionIsOn(row, settings);
  const custom = !!row.settings && (row.settings.order.length > 0 || row.settings.hidden.length > 0 || Object.entries(row.settings).some(([k, v]) => !["v", "order", "hidden", "enabled"].includes(k) && v !== null));
  return (
    <s-stack direction="inline" gap="small-200">
      {on ? <s-badge tone="success">{t("On")}</s-badge> : <s-badge>{t("Off")}</s-badge>}
      {custom && <s-badge tone="info">{t("Custom settings")}</s-badge>}
    </s-stack>
  );
}

export function Collections() {
  const context = useAsync(() => loadAppContext(), []);
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 350);
  const [cursor, setCursor] = useState<{ after?: string | null; before?: string | null }>({});
  const page = useAsync(() => listCollections({ search: query, ...cursor, pageSize: 50 }), [query, cursor.after, cursor.before]);
  const settings = context.data?.settings ?? null;
  const rows = page.data?.rows ?? [];

  return (
    <s-page heading={t("Collections")} inlineSize="large">
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">
          {t("Open a collection to give it its own settings, choose the order of its variant cards or hide some of them.")}
        </s-paragraph>
        {page.error && <ErrorBanner error={page.error} onRetry={page.reload} />}
        <s-section padding="none" accessibilityLabel={t("Collections")}>
          <s-table
            paginate
            loading={page.loading}
            hasNextPage={!!page.data?.hasNextPage}
            hasPreviousPage={!!page.data?.hasPreviousPage}
            onNextPage={() => setCursor({ after: page.data?.endCursor })}
            onPreviousPage={() => setCursor({ before: page.data?.startCursor })}
          >
            <s-grid slot="filters" gridTemplateColumns="1fr" gap="small-200">
              <s-search-field
                label={t("Search collections")}
                labelAccessibilityVisibility="exclusive"
                placeholder={t("Search collections")}
                value={search}
                onInput={(event) => {
                  setSearch(event.currentTarget.value ?? "");
                  setCursor({});
                }}
              />
            </s-grid>
            <s-table-header-row>
              <s-table-header listSlot="primary">{t("Collection")}</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                {t("Products")}
              </s-table-header>
              <s-table-header listSlot="secondary">{t("Variant cards")}</s-table-header>
              <s-table-header listSlot="inline" format="numeric">
                <span class="vc-visually-hidden">{t("Actions")}</span>
              </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((row) => (
                <s-table-row key={row.id} clickDelegate={`vc-collection-${row.id}`}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-thumbnail size="small" src={row.image ?? undefined} alt="" />
                      <s-stack direction="block" gap="none">
                        <s-link
                          id={`vc-collection-${row.id}`}
                          href={`/collections/${row.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            void navigate(`/collections/${row.id}`);
                          }}
                        >
                          {row.title}
                        </s-link>
                        <s-text color="subdued">{row.handle}</s-text>
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{formatNumber(row.productsCount)}</s-table-cell>
                  <s-table-cell>
                    <StatusBadges row={row} settings={settings} />
                  </s-table-cell>
                  <s-table-cell>
                    <s-button onClick={() => void navigate(`/collections/${row.id}`)}>{t("Edit")}</s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          {!page.loading && !rows.length && (
            <div class="vc-empty">{search ? t("No collections match “{search}”.", { search }) : t("Your store has no collections yet.")}</div>
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}
