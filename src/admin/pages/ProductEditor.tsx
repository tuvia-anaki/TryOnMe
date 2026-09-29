import { useEffect, useMemo, useState } from "preact/hooks";
import {
  assignBySimilarity,
  bestInstantStrategy,
  runStrategy,
  type AutoAssignResult,
  type StrategyId,
} from "../../shared/autoassign";
import { colorsForName, parseCssColor, rgbToLab } from "../../shared/colors";
import { cloneConfig, configsEqual, emptyConfig, type NormalizedConfig } from "../../shared/config";
import { groupingCombinations } from "../../shared/product";
import { loadProduct, saveProductConfig, StaleConfigError, type LoadedProduct } from "../api/products";
import { loadAppContext, markAssigned } from "../api/settings";
import { loadThemeStatus, themeEditorUrl } from "../api/theme";
import { ErrorBanner, Loading, openAdmin, openExternal } from "../components/common";
import { GroupList, MediaGrid, VariantPreview } from "../components/EditorParts";
import { t, tn } from "../i18n";
import { inferGroupBy, regroup, setMain, SHARED_KEY, toggleMedia } from "../lib/editor";
import { toast, useAsync, useSaveBar } from "../lib/hooks";
import { computeSignatures } from "../lib/signature";
import { navigate } from "../router";

type UnassignedChoice = "inherit" | "show" | "hide";

function describeResult(result: AutoAssignResult): string {
  if (!result.groupsFilled) return t("No matches found. Try another method or assign images by hand.");
  const base = t("Assigned {images} images to {filled} of {total} groups.", {
    images: result.assignedMedia,
    filled: result.groupsFilled,
    total: result.groupsTotal,
  });
  if (!result.unmatched.length) return base;
  const list = result.unmatched.slice(0, 5).join(", ") + (result.unmatched.length > 5 ? "…" : "");
  return `${base} ${t("Nothing found for: {list}.", { list })}`;
}

export function ProductEditor({ id }: { id: number }) {
  const context = useAsync(() => loadAppContext(), []);
  const loaded = useAsync<LoadedProduct | null>(() => loadProduct(id), [id]);
  const theme = useAsync(() => loadThemeStatus(), []);

  const [config, setConfig] = useState<NormalizedConfig>(emptyConfig());
  const [saved, setSaved] = useState<NormalizedConfig>(emptyConfig());
  const [digest, setDigest] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<number[]>([]);
  const [selected, setSelected] = useState<string>(SHARED_KEY);
  const [anchor, setAnchor] = useState<{ id: number; add: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undo: NormalizedConfig | null; tone: "info" | "success" | "warning" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const product = loaded.data?.product ?? null;

  useEffect(() => {
    if (!loaded.data) return;
    const { product: p, config: c, digest: d } = loaded.data;
    const initialGroupBy = inferGroupBy(c, p);
    setConfig(cloneConfig(c));
    setSaved(cloneConfig(c));
    setDigest(d);
    setGroupBy(initialGroupBy);
    setSelected(groupingCombinations(p, initialGroupBy)[0]?.key ?? SHARED_KEY);
    setStale(false);
  }, [loaded.data]);

  const combos = useMemo(() => (product ? groupingCombinations(product, groupBy) : []), [product, groupBy]);
  const labels = useMemo(() => new Map(combos.map((c) => [c.key, c.label])), [combos]);
  const selectedCombo = combos.find((c) => c.key === selected) ?? null;
  const selectedLabel = selected === SHARED_KEY ? t("All variants") : selectedCombo?.label ?? "";
  const dirty = !!product && !configsEqual(config, saved);
  const settings = context.data?.settings;

  const save = async () => {
    // Settings decide whether variant images get overwritten: wait for them.
    if (!product || saving || !settings) return;
    setSaving(true);
    try {
      const result = await saveProductConfig(product, config, {
        syncVariantImages: settings.admin.syncVariantImages,
        digest,
      });
      setSaved(cloneConfig(config));
      setDigest(result.digest);
      setNotice(null);
      if (config.groups.some((group) => group.media.length)) void markAssigned();
      toast(
        result.syncedVariants
          ? tn(result.syncedVariants, "Saved. Updated {count} variant image.", "Saved. Updated {count} variant images.")
          : t("Saved"),
      );
    } catch (error) {
      if (error instanceof StaleConfigError) setStale(true);
      toast((error as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setConfig(cloneConfig(saved));
    if (product) setGroupBy(inferGroupBy(saved, product));
    setNotice(null);
  };

  useSaveBar("pvi-product-save-bar", dirty, saving, { onSave: () => void save(), onDiscard: discard }, { save: t("Save"), discard: t("Discard") });

  if (loaded.loading && !loaded.data) {
    return (
      <s-page heading={t("Loading product…")} inlineSize="large">
        <Loading />
      </s-page>
    );
  }
  if (loaded.error) {
    return (
      <s-page heading={t("Product")} inlineSize="large">
        <ErrorBanner error={loaded.error} onRetry={loaded.reload} />
      </s-page>
    );
  }
  if (!product) {
    return (
      <s-page heading={t("Product not found")}>
        <s-section>
          <s-paragraph>{t("This product doesn't exist anymore.")}</s-paragraph>
          <s-button onClick={() => void navigate("/products")}>{t("Back to products")}</s-button>
        </s-section>
      </s-page>
    );
  }

  const valueIdsOf = (key: string) => (key === SHARED_KEY ? [] : combos.find((c) => c.key === key)?.valueIds ?? []);

  const onToggle = (mediaId: number, range: boolean) => {
    const current = selected === SHARED_KEY ? config.shared : config.groups.find((g) => g.key === selected)?.media ?? [];
    const add = !current.includes(mediaId);
    if (range && anchor) {
      const ids = product.media.map((m) => m.id);
      const [from, to] = [ids.indexOf(anchor.id), ids.indexOf(mediaId)].sort((a, b) => a - b);
      let next = config;
      for (const id of ids.slice(from, to + 1)) next = toggleMedia(next, product, selected, valueIdsOf(selected), id, anchor.add);
      setConfig(next);
      return;
    }
    setAnchor({ id: mediaId, add });
    setConfig(toggleMedia(config, product, selected, valueIdsOf(selected), mediaId));
  };

  const applyResult = (result: AutoAssignResult, method: string) => {
    const before = cloneConfig(config);
    const next = result.config;
    next.hideUnassigned = config.hideUnassigned;
    setConfig(next);
    setNotice({ text: `${method}: ${describeResult(result)}`, undo: before, tone: result.groupsFilled ? "success" : "warning" });
  };

  const autoAssign = async (strategy: StrategyId | "best") => {
    const options = { groupBy, leading: settings?.admin.leading ?? "shared" };
    const names: Record<string, string> = {
      best: t("Automatic"),
      "variant-images": t("Variant image order"),
      "alt-text": t("Alt text"),
      filename: t("File names"),
      smart: t("Visual match"),
    };
    if (strategy === "best") {
      const best = bestInstantStrategy(product, options);
      applyResult(best.result, `${names.best} (${names[best.strategy]})`);
      return;
    }
    if (strategy !== "smart") {
      applyResult(runStrategy(strategy, product, options), names[strategy]);
      return;
    }
    setBusy(t("Analyzing images… 0/{total}", { total: product.media.length }));
    try {
      const signatures = await computeSignatures(
        product.media.map((m) => ({ id: m.id, url: m.url })),
        (done, total) => setBusy(t("Analyzing images… {done}/{total}", { done, total })),
      );
      const values = new Map(product.options.flatMap((o) => o.values).map((v) => [v.id, v]));
      const colorOf = (valueId: number): [number, number, number] | null => {
        const value = values.get(valueId);
        if (!value) return null;
        const css = value.color ?? colorsForName(value.name)?.[0] ?? null;
        const rgb = css && css !== "gradient" ? parseCssColor(css) : null;
        return rgb ? rgbToLab(rgb) : null;
      };
      applyResult(assignBySimilarity(product, { ...options, signatures, colorOf }), names.smart);
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const changeGroupBy = (value: string) => {
    const next = value === "all" ? product.options.map((o) => o.id) : [Number(value)];
    setConfig(regroup(config, product, next));
    setGroupBy(next);
    setSelected(groupingCombinations(product, next)[0]?.key ?? SHARED_KEY);
  };

  const unassignedChoice: UnassignedChoice = config.hideUnassigned === null ? "inherit" : config.hideUnassigned ? "hide" : "show";
  const shopDefaultHide = settings?.gallery.hideUnassigned ?? false;
  const storeUrl = product.onlineStoreUrl ?? product.previewUrl;
  const groupByValue = groupBy.length > 1 ? "all" : String(groupBy[0] ?? "");
  const shopDomain = context.data?.shop.domain ?? window.shopify?.config?.shop ?? "";
  const apiKey = window.shopify?.config?.apiKey ?? "";

  return (
    <s-page heading={product.title} inlineSize="large">
      <s-link slot="breadcrumb-actions" onClick={() => void navigate("/products")}>
        {t("Products")}
      </s-link>
      <s-button slot="primary-action" variant="primary" disabled={!dirty || saving || !settings} loading={saving} onClick={() => void save()}>
        {t("Save")}
      </s-button>
      {storeUrl && (
        <s-button slot="secondary-actions" onClick={() => openExternal(storeUrl)}>
          {t("View in store")}
        </s-button>
      )}
      <s-button slot="secondary-actions" onClick={() => openAdmin(`/products/${product.id}`)}>
        {t("Edit product")}
      </s-button>

      {stale && (
        <s-banner tone="critical" heading={t("This product changed somewhere else")}>
          <s-paragraph>{t("Someone saved variant images for this product after you opened it. Reload to get the latest version (your unsaved changes will be lost).")}</s-paragraph>
          <s-button onClick={loaded.reload}>{t("Reload")}</s-button>
        </s-banner>
      )}
      {theme.data && theme.data.embed !== "enabled" && theme.data.embed !== "unknown" && (
        <s-banner tone="warning" heading={t("The app embed is off, so shoppers won't see these changes yet")}>
          <s-button onClick={() => shopDomain && apiKey && openExternal(themeEditorUrl(shopDomain, apiKey))}>{t("Turn on in theme editor")}</s-button>
        </s-banner>
      )}
      {product.variants.length < 2 && (
        <s-banner tone="info" heading={t("This product has a single variant")}>
          <s-paragraph>{t("Variant images are for products with several variants (like colors). There's nothing to assign here.")}</s-paragraph>
        </s-banner>
      )}
      {product.media.length < 2 && product.variants.length > 1 && (
        <s-banner tone="info" heading={t("Add more images first")}>
          <s-paragraph>{t("Upload the images for each variant to the product in Shopify, then come back to assign them.")}</s-paragraph>
          <s-button onClick={() => openAdmin(`/products/${product.id}`)}>{t("Edit product")}</s-button>
        </s-banner>
      )}
      {notice && (
        <s-banner tone={notice.tone} dismissible onDismiss={() => setNotice(null)}>
          <s-paragraph>{notice.text}</s-paragraph>
          {notice.undo && (
            <s-button
              onClick={() => {
                setConfig(notice.undo!);
                setNotice(null);
              }}
            >
              {t("Undo")}
            </s-button>
          )}
        </s-banner>
      )}

      <s-section>
        <s-grid gridTemplateColumns="minmax(0, 1fr) minmax(0, 1fr) auto" gap="base" alignItems="end">
          <s-select label={t("Group images by")} value={groupByValue} onChange={(event) => changeGroupBy(event.currentTarget.value ?? "")}>
            {product.options.map((option) => (
              <s-option value={String(option.id)} key={option.id}>
                {option.name}
              </s-option>
            ))}
            {product.options.length > 1 && <s-option value="all">{t("Each variant separately")}</s-option>}
          </s-select>
          <s-select
            label={t("Images not assigned to any variant")}
            value={unassignedChoice}
            onChange={(event) => {
              const value = event.currentTarget.value as UnassignedChoice;
              setConfig({ ...cloneConfig(config), hideUnassigned: value === "inherit" ? null : value === "hide" });
            }}
          >
            <s-option value="inherit">{shopDefaultHide ? t("Shop default (hide)") : t("Shop default (show)")}</s-option>
            <s-option value="show">{t("Show for every variant")}</s-option>
            <s-option value="hide">{t("Hide")}</s-option>
          </s-select>
          <s-stack direction="inline" gap="small-200">
            <s-button commandFor="pvi-auto-menu" icon="wand" disabled={!!busy} loading={!!busy}>
              {t("Auto-assign")}
            </s-button>
            <s-menu id="pvi-auto-menu" accessibilityLabel={t("Auto-assign methods")}>
              <s-button onClick={() => void autoAssign("best")}>{t("Automatic (best match)")}</s-button>
              <s-button onClick={() => void autoAssign("variant-images")}>{t("By variant image order")}</s-button>
              <s-button onClick={() => void autoAssign("alt-text")}>{t("By alt text")}</s-button>
              <s-button onClick={() => void autoAssign("filename")}>{t("By file name")}</s-button>
              <s-button onClick={() => void autoAssign("smart")}>{t("By colors in the images (visual)")}</s-button>
              <s-button
                tone="critical"
                onClick={() => {
                  setNotice({ text: t("Cleared all assignments."), undo: cloneConfig(config), tone: "info" });
                  setConfig({ ...emptyConfig(), hideUnassigned: config.hideUnassigned });
                }}
              >
                {t("Clear all")}
              </s-button>
            </s-menu>
          </s-stack>
        </s-grid>
        {busy && <s-text color="subdued">{busy}</s-text>}
      </s-section>

      <div class="pvi-editor">
        <s-section heading={t("Groups")}>
          <GroupList
            product={product}
            combos={combos}
            config={config}
            selected={selected}
            onSelect={(key) => {
              setSelected(key);
              setAnchor(null);
            }}
            onDropMedia={(key, mediaId) => setConfig(toggleMedia(config, product, key, valueIdsOf(key), mediaId, true))}
          />
        </s-section>
        <s-section heading={t("Images for {group}", { group: selectedLabel })}>
          <MediaGrid
            product={product}
            config={config}
            selected={selected}
            selectedLabel={selectedLabel}
            groupLabels={labels}
            onToggle={onToggle}
            onSetMain={(mediaId) => setConfig(setMain(config, selected, valueIdsOf(selected), mediaId))}
          />
        </s-section>
      </div>

      <s-section heading={t("What shoppers will see")}>
        <VariantPreview
          product={product}
          config={config}
          hideUnassigned={config.hideUnassigned ?? shopDefaultHide}
        />
      </s-section>
    </s-page>
  );
}
