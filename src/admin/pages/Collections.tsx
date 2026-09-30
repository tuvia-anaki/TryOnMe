import { useState } from "preact/hooks";
import type { AppSettings } from "../../shared/settings";
import { listCollections, type CollectionRow } from "../api/collections";
import { loadAppContext } from "../api/settings";
import { ErrorBanner } from "../components/common";
import { Button, LinkRow, PageHeader, Panel, Tag } from "../components/ui";
import { formatNumber, t, tn } from "../i18n";
import { useAsync, useDebounced } from "../lib/hooks";

/** Is a collection's page showing variant cards (shop settings + its own override)? */
export function collectionIsOn(row: Pick<CollectionRow, "handle" | "settings">, settings: AppSettings): boolean {
  if (!settings.enabled || row.settings?.enabled === false) return false;
  if (row.handle === "all") return settings.pages.allProducts;
  return settings.collections.mode === "all" || settings.collections.handles.includes(row.handle);
}

/** Has the collection its own card order or hidden cards? */
function isCustomized(row: CollectionRow): boolean {
  return !!row.settings && (row.settings.order.length > 0 || row.settings.hidden.length > 0);
}

export function Collections() {
  const context = useAsync(() => loadAppContext(), []);
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 350);
  const [cursor, setCursor] = useState<{ after?: string | null; before?: string | null }>({});
  const page = useAsync(() => listCollections({ search: query, ...cursor, pageSize: 25 }), [query, cursor.after, cursor.before]);
  const settings = context.data?.settings ?? null;
  const rows = page.data?.rows ?? [];

  return (
    <s-page inlineSize="base">
      <PageHeader
        title={t("Collections")}
        subtitle={t("Open a collection to change the order of its cards or hide some.")}
        back={{ label: t("Home"), to: "/" }}
      />
      <div class="vc-stack">
        {page.error && <ErrorBanner error={page.error} onRetry={page.reload} />}
        <Panel>
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
          {page.error && !rows.length ? null : page.loading && !rows.length ? (
            <p class="vc-muted">{t("Loading…")}</p>
          ) : !rows.length ? (
            <div class="vc-empty">{search ? t("No collections match “{search}”.", { search }) : t("Your store has no collections yet.")}</div>
          ) : (
            <div class={`vc-link-rows${page.loading ? " is-loading" : ""}`}>
              {rows.map((row) => {
                const on = !!settings && collectionIsOn(row, settings);
                return (
                  <LinkRow
                    key={row.id}
                    to={`/collections/${row.id}`}
                    media={<s-thumbnail size="small" src={row.image ?? undefined} alt="" />}
                    title={row.title}
                    meta={tn(row.productsCount, "{count} product", "{count} products", { count: formatNumber(row.productsCount) })}
                    tags={
                      settings && (
                        <>
                          {isCustomized(row) && <Tag tone="info">{t("Custom order")}</Tag>}
                          <Tag tone={on ? "success" : undefined} dot>
                            {on ? t("On") : t("Off")}
                          </Tag>
                        </>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
          {(page.data?.hasPreviousPage || page.data?.hasNextPage) && (
            <div class="vc-pager">
              <Button disabled={!page.data?.hasPreviousPage} onClick={() => setCursor({ before: page.data?.startCursor })}>
                {t("Previous")}
              </Button>
              <Button disabled={!page.data?.hasNextPage} onClick={() => setCursor({ after: page.data?.endCursor })}>
                {t("Next")}
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </s-page>
  );
}
