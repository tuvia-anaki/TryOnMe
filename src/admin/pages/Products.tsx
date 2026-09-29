import { useState } from "preact/hooks";
import { listProducts, type ProductRow } from "../api/products";
import { ErrorBanner } from "../components/common";
import { formatNumber, t, tn } from "../i18n";
import { useAsync, useDebounced } from "../lib/hooks";
import { navigate } from "../router";

type Filter = "all" | "configured" | "todo";

function StatusBadge({ row }: { row: ProductRow }) {
  if (row.variantsCount < 2) return <s-badge>{t("No variants")}</s-badge>;
  if (row.mediaCount < 2) return <s-badge>{t("Not enough images")}</s-badge>;
  if (row.configured)
    return (
      <s-badge tone="success" icon="check">
        {tn(row.groups, "{count} group", "{count} groups")}
      </s-badge>
    );
  return <s-badge tone="caution">{t("Not set up")}</s-badge>;
}

export function Products() {
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 350);
  const [cursor, setCursor] = useState<{ after?: string | null; before?: string | null }>({});
  const [filter, setFilter] = useState<Filter>("all");
  const page = useAsync(() => listProducts({ search: query, ...cursor, pageSize: 50 }), [query, cursor.after, cursor.before]);

  const rows = (page.data?.rows ?? []).filter((row) => {
    if (filter === "configured") return row.configured;
    if (filter === "todo") return !row.configured && row.variantsCount > 1 && row.mediaCount > 1;
    return true;
  });

  const open = (row: ProductRow) => void navigate(`/products/${row.id}`);

  return (
    <s-page heading={t("Products")} inlineSize="large">
      <s-button slot="primary-action" variant="primary" onClick={() => void navigate("/bulk")}>
        {t("Auto-assign")}
      </s-button>

      {page.error && <ErrorBanner error={page.error} onRetry={page.reload} />}

      <s-section padding="none">
        <s-box padding="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
            <s-search-field
              label={t("Search products")}
              labelAccessibilityVisibility="exclusive"
              placeholder={t("Search by title")}
              value={search}
              onInput={(event) => {
                setSearch(event.currentTarget.value ?? "");
                setCursor({});
              }}
            />
            <div class="pvi-segmented" role="group" aria-label={t("Filter")}>
              {(
                [
                  ["all", t("All")],
                  ["todo", t("Not set up")],
                  ["configured", t("Set up")],
                ] as [Filter, string][]
              ).map(([value, label]) => (
                <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          </s-grid>
        </s-box>

        <s-table
          paginate
          loading={page.loading}
          hasNextPage={!!page.data?.hasNextPage}
          hasPreviousPage={!!page.data?.hasPreviousPage}
          onNextPage={() => setCursor({ after: page.data?.endCursor })}
          onPreviousPage={() => setCursor({ before: page.data?.startCursor })}
        >
          <s-table-header-row>
            <s-table-header listSlot="primary">{t("Product")}</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">
              {t("Variants")}
            </s-table-header>
            <s-table-header listSlot="labeled" format="numeric">
              {t("Media")}
            </s-table-header>
            <s-table-header listSlot="secondary">{t("Variant images")}</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((row) => (
              <s-table-row key={row.id} clickDelegate={`product-link-${row.id}`}>
                <s-table-cell>
                  <a
                    id={`product-link-${row.id}`}
                    class="pvi-row-title"
                    href={`/products/${row.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      open(row);
                    }}
                  >
                    {row.image ? <img src={row.image} alt="" loading="lazy" /> : <span class="pvi-noimg" />}
                    <span>{row.title}</span>
                  </a>
                </s-table-cell>
                <s-table-cell>{formatNumber(row.variantsCount)}</s-table-cell>
                <s-table-cell>{formatNumber(row.mediaCount)}</s-table-cell>
                <s-table-cell>
                  <StatusBadge row={row} />
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {!page.loading && !rows.length && (
          <div class="pvi-empty">
            {search ? t("No products match “{search}”.", { search }) : t("No products on this page match the filter.")}
          </div>
        )}
      </s-section>
    </s-page>
  );
}
