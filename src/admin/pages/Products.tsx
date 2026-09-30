import { useState } from "preact/hooks";
import { listProducts } from "../api/products";
import { ErrorBanner } from "../components/common";
import { FilterTabs, ProductTable, matchesFilter, type ProductFilter } from "../components/ProductTable";
import { t } from "../i18n";
import { useAsync, useDebounced } from "../lib/hooks";
import { navigate, useQueryParam } from "../router";

const FILTERS: ProductFilter[] = ["all", "todo", "configured"];

export function Products() {
  const initial = useQueryParam("filter") as ProductFilter | null;
  const [search, setSearch] = useState("");
  const query = useDebounced(search, 350);
  const [cursor, setCursor] = useState<{ after?: string | null; before?: string | null }>({});
  const [filter, setFilter] = useState<ProductFilter>(initial && FILTERS.includes(initial) ? initial : "all");
  // Only products with variants can be (or need to be) set up: skip the rest on those tabs.
  const withVariants = filter !== "all";
  const page = useAsync(
    () => listProducts({ search: query, withVariants, ...cursor, pageSize: 50 }),
    [query, withVariants, cursor.after, cursor.before],
  );

  const rows = (page.data?.rows ?? []).filter((row) => matchesFilter(row, filter));

  return (
    <s-page heading={t("Products")} inlineSize="large">
      <s-button slot="primary-action" variant="primary" onClick={() => void navigate("/bulk")}>
        {t("Bulk auto-assign")}
      </s-button>

      {page.error && <ErrorBanner error={page.error} onRetry={page.reload} />}

      <s-section padding="none" accessibilityLabel={t("Products")}>
        <ProductTable
          variant="full"
          rows={rows}
          loading={page.loading}
          filters={
            <>
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
              <FilterTabs
                value={filter}
                options={FILTERS}
                onChange={(value) => {
                  setFilter(value);
                  setCursor({});
                }}
              />
            </>
          }
          pagination={{
            hasNext: !!page.data?.hasNextPage,
            hasPrevious: !!page.data?.hasPreviousPage,
            onNext: () => setCursor({ after: page.data?.endCursor }),
            onPrevious: () => setCursor({ before: page.data?.startCursor }),
          }}
          empty={search ? t("No products match “{search}”.", { search }) : t("No products on this page match the filter.")}
        />
      </s-section>
    </s-page>
  );
}
