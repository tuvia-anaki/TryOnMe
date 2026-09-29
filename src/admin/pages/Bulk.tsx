import { useEffect, useRef, useState } from "preact/hooks";
import { assignBySimilarity, bestInstantStrategy, runStrategy, type AutoAssignResult } from "../../shared/autoassign";
import { colorsForName, parseCssColor, rgbToLab } from "../../shared/colors";
import { suggestGroupingOptions, type ProductModel } from "../../shared/product";
import { gql } from "../api/graphql";
import { listProducts, loadProduct, saveProductConfig } from "../api/products";
import { loadAppContext } from "../api/settings";
import { ErrorBanner } from "../components/common";
import { formatNumber, t } from "../i18n";
import { useAsync } from "../lib/hooks";
import { computeSignatures } from "../lib/signature";
import { navigate } from "../router";

type Method = "best" | "variant-images" | "alt-text" | "filename" | "smart";
type Scope = "new" | "all";

interface LogLine {
  ok: boolean | null;
  text: string;
}

async function runForProduct(product: ProductModel, method: Method, leading: "shared" | "first" | "none"): Promise<{ result: AutoAssignResult; used: string }> {
  const options = { groupBy: suggestGroupingOptions(product), leading };
  if (method === "best") {
    const best = bestInstantStrategy(product, options);
    return { result: best.result, used: best.strategy };
  }
  if (method !== "smart") return { result: runStrategy(method, product, options), used: method };
  const signatures = await computeSignatures(product.media.map((m) => ({ id: m.id, url: m.url })));
  const values = new Map(product.options.flatMap((o) => o.values).map((v) => [v.id, v]));
  const colorOf = (valueId: number): [number, number, number] | null => {
    const value = values.get(valueId);
    const css = value ? value.color ?? colorsForName(value.name)?.[0] ?? null : null;
    const rgb = css && css !== "gradient" ? parseCssColor(css) : null;
    return rgb ? rgbToLab(rgb) : null;
  };
  return { result: assignBySimilarity(product, { ...options, signatures, colorOf }), used: "smart" };
}

export function Bulk() {
  const context = useAsync(() => loadAppContext(), []);
  const total = useAsync(() => gql<{ productsCount: { count: number } }>(`query Counts { productsCount { count } }`).then((d) => d.productsCount.count), []);
  const [method, setMethod] = useState<Method>("best");
  const [scope, setScope] = useState<Scope>("new");
  const [sync, setSync] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({ seen: 0, saved: 0, skipped: 0, failed: 0 });
  const [log, setLog] = useState<LogLine[]>([]);
  const stopRef = useRef(false);

  // Leaving the page stops the job (it runs in this page, and a second run would collide with it).
  useEffect(() => () => void (stopRef.current = true), []);

  // Until settings load, don't assume the merchant wants variant images overwritten.
  const syncImages = sync ?? context.data?.settings.admin.syncVariantImages ?? false;
  const methodNames: Record<string, string> = {
    best: t("automatic"),
    "variant-images": t("variant image order"),
    "alt-text": t("alt text"),
    filename: t("file names"),
    smart: t("colors in images"),
  };

  const start = async () => {
    stopRef.current = false;
    setRunning(true);
    setDone(false);
    setLog([]);
    const counts = { seen: 0, saved: 0, skipped: 0, failed: 0 };
    const push = (line: LogLine) => setLog((lines) => [line, ...lines].slice(0, 400));
    const leading = context.data?.settings.admin.leading ?? "shared";
    let after: string | null = null;
    try {
      for (;;) {
        const page = await listProducts({ after, pageSize: 50 });
        for (const row of page.rows) {
          if (stopRef.current) break;
          counts.seen += 1;
          if (row.variantsCount < 2 || row.mediaCount < 2) {
            counts.skipped += 1;
          } else if (scope === "new" && row.configured) {
            counts.skipped += 1;
            push({ ok: null, text: t("{title}: already set up — skipped", { title: row.title }) });
          } else {
            try {
              const loaded = await loadProduct(row.id);
              if (!loaded) throw new Error(t("not found"));
              const { result, used } = await runForProduct(loaded.product, method, leading);
              if (result.groupsFilled < 2) {
                counts.skipped += 1;
                push({ ok: null, text: t("{title}: no reliable match — skipped", { title: row.title }) });
              } else {
                result.config.hideUnassigned = loaded.config.hideUnassigned;
                await saveProductConfig(loaded.product, result.config, { syncVariantImages: syncImages, digest: loaded.digest });
                counts.saved += 1;
                push({
                  ok: true,
                  text: t("{title}: {filled}/{total} groups by {method}", {
                    title: row.title,
                    filled: result.groupsFilled,
                    total: result.groupsTotal,
                    method: methodNames[used] ?? used,
                  }),
                });
              }
            } catch (error) {
              counts.failed += 1;
              push({ ok: false, text: `${row.title}: ${(error as Error).message}` });
            }
          }
          setProgress({ ...counts });
        }
        if (stopRef.current || !page.hasNextPage) break;
        after = page.endCursor;
      }
    } catch (error) {
      push({ ok: false, text: (error as Error).message });
    } finally {
      setRunning(false);
      setDone(true);
      setProgress({ ...counts });
    }
  };

  return (
    <s-page heading={t("Auto-assign images")} inlineSize="base">
      <s-link slot="breadcrumb-actions" onClick={() => void navigate("/products")}>
        {t("Products")}
      </s-link>
      {context.error && <ErrorBanner error={context.error} onRetry={context.reload} />}

      <s-section heading={t("How should images be matched?")}>
        <s-stack direction="block" gap="base">
          <s-choice-list label={t("Method")} name="method" values={[method]} onChange={(event) => setMethod(((event.currentTarget as any).values?.[0] ?? "best") as Method)} disabled={running}>
            <s-choice value="best">
              {t("Automatic (recommended)")}
              <s-text slot="details">{t("Tries variant image order, alt text and file names, and keeps whichever explains the most images for each product.")}</s-text>
            </s-choice>
            <s-choice value="variant-images">
              {t("Variant image order")}
              <s-text slot="details">{t("Each variant's image starts a run of images that lasts until the next variant's image.")}</s-text>
            </s-choice>
            <s-choice value="alt-text">
              {t("Alt text")}
              <s-text slot="details">{t("Images whose alt text mentions a color (for example “Red – back” or “#color_red”).")}</s-text>
            </s-choice>
            <s-choice value="filename">
              {t("File names")}
              <s-text slot="details">{t("Images whose file name mentions a color (for example tee-red-back.jpg).")}</s-text>
            </s-choice>
            <s-choice value="smart">
              {t("Colors in the images (slower)")}
              <s-text slot="details">{t("Analyzes each photo in your browser and matches it to the closest variant image or color. No data leaves your computer.")}</s-text>
            </s-choice>
          </s-choice-list>

          <s-choice-list label={t("Products")} name="scope" values={[scope]} onChange={(event) => setScope(((event.currentTarget as any).values?.[0] ?? "new") as Scope)} disabled={running}>
            <s-choice value="new">{t("Only products that aren't set up yet")}</s-choice>
            <s-choice value="all">{t("All products (replaces existing setups)")}</s-choice>
          </s-choice-list>

          <s-checkbox
            label={t("Also set each variant's image in Shopify to its main image (used in cart, checkout and feeds)")}
            checked={syncImages}
            disabled={running}
            onChange={(event) => setSync(!!(event.currentTarget as any).checked)}
          />
        </s-stack>
      </s-section>

      <s-section heading={t("Run")}>
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            {t("This runs in your browser — keep this page open until it finishes. Products are processed one by one at Shopify's speed limit.")}
            {total.data != null ? " " + t("Your store has {count} products.", { count: formatNumber(total.data) }) : ""}
          </s-paragraph>
          <s-stack direction="inline" gap="small-200">
            {!running ? (
              <s-button variant="primary" disabled={!context.data} onClick={() => void start()}>
                {done ? t("Run again") : t("Start")}
              </s-button>
            ) : (
              <s-button tone="critical" onClick={() => (stopRef.current = true)}>
                {t("Stop")}
              </s-button>
            )}
          </s-stack>
          {(running || done) && (
            <s-stack direction="block" gap="small-200">
              <s-progress
                accessibilityLabel={t("Progress")}
                value={progress.seen}
                max={Math.max(progress.seen, total.data ?? progress.seen) || 1}
              />
              <s-text>
                {t("{seen} checked · {saved} set up · {skipped} skipped · {failed} failed", {
                  seen: formatNumber(progress.seen),
                  saved: formatNumber(progress.saved),
                  skipped: formatNumber(progress.skipped),
                  failed: formatNumber(progress.failed),
                })}
              </s-text>
            </s-stack>
          )}
          {done && !running && (
            <s-banner tone={progress.failed ? "warning" : "success"} heading={t("Finished")}>
              <s-paragraph>{t("Open any product to review or fine-tune what was assigned.")}</s-paragraph>
              <s-button onClick={() => void navigate("/products")}>{t("Review products")}</s-button>
            </s-banner>
          )}
          {log.length > 0 && (
            <ul class="pvi-log" aria-live="polite">
              {log.map((line, i) => (
                <li key={i}>
                  {line.ok === true ? "✓ " : line.ok === false ? "✗ " : "– "}
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
