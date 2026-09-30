import type { ComponentChildren } from "preact";
import type { ProductRow } from "../api/products";
import { formatNumber, t, tn } from "../i18n";
import { navigate } from "../router";

export type ProductFilter = "all" | "todo" | "configured";

/** Variant images need at least two variants and two images. */
export function canSetUp(row: ProductRow): boolean {
  return row.variantsCount > 1 && row.mediaCount > 1;
}

export function matchesFilter(row: ProductRow, filter: ProductFilter): boolean {
  if (filter === "configured") return row.configured;
  if (filter === "todo") return !row.configured;
  return true;
}

/** Products that can be set up first; the rest keep their order. */
export function readyFirst(rows: ProductRow[]): ProductRow[] {
  return [...rows.filter(canSetUp), ...rows.filter((row) => !canSetUp(row))];
}

export function StatusBadge({ row }: { row: ProductRow }) {
  if (row.configured)
    return (
      <s-badge tone="success" icon="check">
        {t("Set up")}
      </s-badge>
    );
  if (row.variantsCount < 2) return <s-badge>{t("No variants")}</s-badge>;
  if (row.mediaCount < 2) return <s-badge>{t("Not enough images")}</s-badge>;
  return <s-badge tone="caution">{t("Not set up")}</s-badge>;
}

const FILTER_LABELS: Record<ProductFilter, () => string> = {
  all: () => t("All"),
  todo: () => t("Not set up"),
  configured: () => t("Set up"),
};

/** Segmented tabs above a product table. */
export function FilterTabs(props: { value: ProductFilter; options: ProductFilter[]; onChange: (value: ProductFilter) => void }) {
  return (
    <div class="pvi-segmented" role="group" aria-label={t("Filter")}>
      {props.options.map((value) => (
        <button type="button" key={value} aria-pressed={props.value === value} onClick={() => props.onChange(value)}>
          {FILTER_LABELS[value]()}
        </button>
      ))}
    </div>
  );
}

const openProduct = (row: ProductRow) => void navigate(`/products/${row.id}`);

/**
 * Products with their variant images status. "full" (Products page) adds the
 * variant count and the options; "compact" (home page) keeps the essentials.
 */
export function ProductTable(props: {
  rows: ProductRow[];
  loading: boolean;
  variant: "full" | "compact";
  filters?: ComponentChildren;
  empty: ComponentChildren;
  pagination?: { hasNext: boolean; hasPrevious: boolean; onNext: () => void; onPrevious: () => void };
}) {
  const full = props.variant === "full";
  return (
    <>
      <s-table
        paginate={!!props.pagination}
        loading={props.loading}
        hasNextPage={props.pagination?.hasNext ?? false}
        hasPreviousPage={props.pagination?.hasPrevious ?? false}
        onNextPage={props.pagination?.onNext}
        onPreviousPage={props.pagination?.onPrevious}
      >
        {props.filters && (
          <s-grid slot="filters" gridTemplateColumns="1fr auto" gap="small-200" alignItems="center">
            {props.filters}
          </s-grid>
        )}
        <s-table-header-row>
          <s-table-header listSlot="primary">{t("Product")}</s-table-header>
          {full && (
            <s-table-header listSlot="labeled" format="numeric">
              {t("Variants")}
            </s-table-header>
          )}
          <s-table-header listSlot="labeled" format="numeric">
            {t("Images")}
          </s-table-header>
          <s-table-header listSlot="secondary">{t("Status")}</s-table-header>
          {/* "numeric" right-aligns the column, keeping the buttons at the row's end. */}
          <s-table-header listSlot="inline" format="numeric">
            <span class="pvi-visually-hidden">{t("Actions")}</span>
          </s-table-header>
        </s-table-header-row>
        <s-table-body>
          {props.rows.map((row) => (
            <s-table-row key={row.id} clickDelegate={`pvi-product-${row.id}`}>
              <s-table-cell>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-thumbnail size="small" src={row.image ?? undefined} alt="" />
                  <s-stack direction="block" gap="none">
                    <s-link
                      id={`pvi-product-${row.id}`}
                      href={`/products/${row.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        openProduct(row);
                      }}
                    >
                      {row.title}
                    </s-link>
                    {full && row.options.length > 0 && (
                      <s-text color="subdued">
                        {row.configured ? `${row.options.join(" · ")} — ${tn(row.groups, "{count} group", "{count} groups")}` : row.options.join(" · ")}
                      </s-text>
                    )}
                  </s-stack>
                </s-stack>
              </s-table-cell>
              {full && <s-table-cell>{formatNumber(row.variantsCount)}</s-table-cell>}
              <s-table-cell>{formatNumber(row.mediaCount)}</s-table-cell>
              <s-table-cell>
                <StatusBadge row={row} />
              </s-table-cell>
              <s-table-cell>
                <s-button onClick={() => openProduct(row)}>
                  {row.configured ? t("Edit") : canSetUp(row) ? t("Assign images") : t("View")}
                </s-button>
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
      {!props.loading && !props.rows.length && <div class="pvi-empty">{props.empty}</div>}
    </>
  );
}
