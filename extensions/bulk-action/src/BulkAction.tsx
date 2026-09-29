import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { bestInstantStrategy } from "../../../src/shared/autoassign";
import { suggestGroupingOptions } from "../../../src/shared/product";
import { setApiEndpoint } from "../../../src/admin/api/graphql";
import { loadProduct, saveProductConfig } from "../../../src/admin/api/products";
import { loadAppContext } from "../../../src/admin/api/settings";

/** Bulk action in Shopify's product list: auto-assign variant images for the selected products. */

setApiEndpoint("shopify:admin/api/graphql.json");

export default async () => {
  render(<Action />, document.body);
};

const tr = (key: string, options?: Record<string, unknown>) => shopify.i18n.translate(key, options as any) as string;
const idOf = (gid: string) => Number(/\/(\d+)$/.exec(gid)?.[1] ?? 0);

function Action() {
  const selected = (shopify.data.selected ?? []).map((item) => idOf(item.id)).filter(Boolean);
  const [replace, setReplace] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setLines([]);
    setSummary(null);
    const counts = { saved: 0, skipped: 0, failed: 0 };
    const push = (line: string) => setLines((all) => [...all, line]);
    try {
      const context = await loadAppContext();
      for (const [index, id] of selected.entries()) {
        let title = `#${id}`;
        try {
          const loaded = await loadProduct(id);
          if (!loaded) throw new Error("not found");
          title = loaded.product.title;
          const { product } = loaded;
          if (product.variants.length < 2 || product.media.length < 2) {
            counts.skipped++;
            push(tr("lineSkippedVariants", { title }));
          } else if (!replace && loaded.config.groups.length) {
            counts.skipped++;
            push(tr("lineSkippedSetUp", { title }));
          } else {
            const best = bestInstantStrategy(product, { groupBy: suggestGroupingOptions(product), leading: context.settings.admin.leading });
            if (best.result.groupsFilled < 2) {
              counts.skipped++;
              push(tr("lineSkippedMatch", { title }));
            } else {
              best.result.config.hideUnassigned = loaded.config.hideUnassigned;
              await saveProductConfig(product, best.result.config, {
                syncVariantImages: context.settings.admin.syncVariantImages,
                digest: loaded.digest,
              });
              counts.saved++;
              push(tr("lineSaved", { title, filled: best.result.groupsFilled, total: best.result.groupsTotal }));
            }
          }
        } catch (error) {
          counts.failed++;
          push(tr("lineFailed", { title, message: (error as Error).message }));
        }
        setDone(index + 1);
      }
    } finally {
      setRunning(false);
      setSummary(tr("done", counts));
    }
  };

  return (
    <s-admin-action heading={tr("heading")}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{tr("intro", { count: selected.length })}</s-paragraph>
        <s-checkbox label={tr("replace")} checked={replace} disabled={running} onChange={(event) => setReplace(!!(event.currentTarget as any).checked)} />
        {running && (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-spinner accessibilityLabel={tr("progress", { done, total: selected.length })} />
            <s-text>{tr("progress", { done, total: selected.length })}</s-text>
          </s-stack>
        )}
        {summary && <s-banner tone="success">{summary}</s-banner>}
        {lines.length > 0 && (
          <s-unordered-list>
            {lines.slice(-25).map((line, i) => (
              <s-list-item key={i}>{line}</s-list-item>
            ))}
          </s-unordered-list>
        )}
        {summary && <s-link href="app:products">{tr("review")}</s-link>}
      </s-stack>
      <s-button slot="primary-action" variant="primary" onClick={() => void run()} loading={running} disabled={running || !selected.length}>
        {tr("start")}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => shopify.close()}>
        {tr("close")}
      </s-button>
    </s-admin-action>
  );
}
