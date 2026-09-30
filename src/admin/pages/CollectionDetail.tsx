import { useEffect, useMemo, useState } from "preact/hooks";
import {
  EMPTY_COLLECTION_SETTINGS,
  TITLE_PRESETS,
  effectiveSettings,
  type AppSettings,
  type CollectionSettings,
  type PriceFormat,
  type SplitBy,
} from "../../shared/settings";
import { arrangeCards, formatTitle, productCards, type VariantCard } from "../../shared/split";
import { loadCollection, loadCollectionProducts, saveCollectionSettings } from "../api/collections";
import { loadAppContext, saveSettings } from "../api/settings";
import { ErrorBanner, Loading, openExternal } from "../components/common";
import { Card, Select, Text } from "../components/fields";
import { formatNumber, t, tn } from "../i18n";
import { toast, useAsync, useSaveBar } from "../lib/hooks";
import { navigate } from "../router";
import { collectionIsOn } from "./Collections";
import { splitByOptions, titleOptions } from "./Dashboard";

type Tri = "inherit" | "on" | "off";
const tri = (value: boolean | null): Tri => (value === null ? "inherit" : value ? "on" : "off");
const fromTri = (value: Tri): boolean | null => (value === "inherit" ? null : value === "on");

function priceLabels(): Record<PriceFormat, string> {
  return { theme: t("Like the theme (From $10)"), from: t("From the lowest price"), range: t("Price range ($10 – $15)") };
}

function money(cents: number): string {
  try {
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

function OrderList(props: {
  cards: VariantCard[];
  hidden: Set<string>;
  title: string;
  onMove: (from: number, to: number) => void;
  onToggleHidden: (key: string) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <ol class="vc-order" aria-label={t("Card order")}>
      {props.cards.map((card, index) => {
        const hidden = props.hidden.has(card.key);
        return (
          <li
            key={card.key}
            class={`vc-order__row${hidden ? " is-hidden" : ""}${dragging === index ? " is-dragging" : ""}${over === index && dragging !== null && dragging !== index ? " is-over" : ""}`}
            draggable
            onDragStart={(event) => {
              setDragging(index);
              event.dataTransfer?.setData("text/plain", String(index));
              if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(index);
            }}
            onDragLeave={() => setOver((o) => (o === index ? null : o))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging !== null && dragging !== index) props.onMove(dragging, index);
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
          >
            <span class="vc-order__handle" aria-hidden="true">⋮⋮</span>
            <span class="vc-order__pos">{index + 1}</span>
            {card.image ? <img class="vc-order__img" src={card.image} alt="" loading="lazy" /> : <span class="vc-order__img" />}
            <span class="vc-order__text">
              <span class="vc-order__title">{formatTitle(props.title, card)}</span>
              <span class="vc-order__meta">
                {card.minPrice === card.maxPrice ? money(card.minPrice) : `${money(card.minPrice)} – ${money(card.maxPrice)}`}
                {!card.available && ` · ${t("Sold out")}`}
                {hidden && ` · ${t("Hidden")}`}
              </span>
            </span>
            <span class="vc-order__actions">
              <button type="button" class="vc-icon-button" aria-label={t("Move up")} disabled={index === 0} onClick={() => props.onMove(index, index - 1)}>
                ↑
              </button>
              <button type="button" class="vc-icon-button" aria-label={t("Move down")} disabled={index === props.cards.length - 1} onClick={() => props.onMove(index, index + 1)}>
                ↓
              </button>
              <button type="button" class="vc-text-button" onClick={() => props.onToggleHidden(card.key)}>
                {hidden ? t("Show") : t("Hide")}
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function CollectionDetail({ id }: { id: number }) {
  const context = useAsync(() => loadAppContext(), []);
  const collection = useAsync(() => loadCollection(id), [id]);
  const [progress, setProgress] = useState(0);
  const products = useAsync(() => loadCollectionProducts(id, 200, setProgress), [id]);
  const [draft, setDraft] = useState<CollectionSettings>(EMPTY_COLLECTION_SETTINGS);
  const [saved, setSaved] = useState<CollectionSettings>(EMPTY_COLLECTION_SETTINGS);
  const [shop, setShop] = useState<AppSettings | null>(null);
  const [shopSaved, setShopSaved] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!collection.data) return;
    const initial = collection.data.settings ?? EMPTY_COLLECTION_SETTINGS;
    setDraft(initial);
    setSaved(initial);
  }, [collection.data]);
  useEffect(() => {
    if (!context.data) return;
    setShop(context.data.settings);
    setShopSaved(context.data.settings);
  }, [context.data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || JSON.stringify(shop) !== JSON.stringify(shopSaved);

  const save = async () => {
    if (!collection.data || !context.data || !shop || saving) return;
    setSaving(true);
    try {
      await saveCollectionSettings(collection.data.gid, draft);
      if (JSON.stringify(shop) !== JSON.stringify(shopSaved)) {
        const clean = await saveSettings(context.data, shop);
        setShop(clean);
        setShopSaved(clean);
      }
      setSaved(draft);
      toast(t("Saved"));
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    setDraft(saved);
    setShop(shopSaved);
  };
  useSaveBar("vc-collection-save-bar", dirty, saving, { onSave: () => void save(), onDiscard: discard }, { save: t("Save"), discard: t("Discard") });

  const effective = shop ? effectiveSettings(shop, draft) : null;
  const cards = useMemo(() => {
    if (!effective || !products.data) return [];
    const options = { split: effective.split, by: effective.by, hideSoldOut: effective.hideSoldOut, hideNoImage: effective.hideNoImage };
    // Hidden cards stay in the list (greyed) so they can be shown again.
    return arrangeCards(
      products.data.products.map((p) => productCards(p, options)),
      { mix: effective.mix, soldOutLast: effective.soldOutLast, order: draft.order, hidden: [] },
    );
  }, [products.data, JSON.stringify(effective), draft.order]);

  if (collection.loading && !collection.data) {
    return (
      <s-page heading={t("Loading collection…")}>
        <Loading />
      </s-page>
    );
  }
  if (collection.error || context.error) {
    return (
      <s-page heading={t("Collection")}>
        <ErrorBanner error={(collection.error ?? context.error)!} onRetry={collection.error ? collection.reload : context.reload} />
      </s-page>
    );
  }
  const row = collection.data;
  if (!row || !shop) {
    return (
      <s-page heading={t("Collection not found")}>
        <s-section>
          <s-paragraph>{t("This collection doesn't exist anymore.")}</s-paragraph>
          <s-button onClick={() => void navigate("/collections")}>{t("Back to collections")}</s-button>
        </s-section>
      </s-page>
    );
  }

  const on = collectionIsOn({ handle: row.handle, settings: draft }, shop);
  const setOn = (value: boolean) => {
    if (row.handle === "all") {
      setShop({ ...shop, pages: { ...shop.pages, allProducts: value } });
      setDraft({ ...draft, enabled: null });
      return;
    }
    if (shop.collections.mode === "selected") {
      const handles = value ? [...new Set([...shop.collections.handles, row.handle])] : shop.collections.handles.filter((h) => h !== row.handle);
      setShop({ ...shop, collections: { ...shop.collections, handles } });
      setDraft({ ...draft, enabled: null });
    } else {
      setDraft({ ...draft, enabled: value ? null : false });
    }
  };
  const inherit = (label: string) => t("Shop setting ({value})", { value: label });
  const onOff = (value: boolean) => (value ? t("on") : t("off"));
  const hidden = new Set(draft.hidden);
  const splitLabel = splitByOptions().find(([v]) => v === shop.split.by)?.[1] ?? "";
  const storeUrl = context.data?.shop.url ?? `https://${context.data?.shop.domain}`;

  const move = (from: number, to: number) => {
    const keys = cards.map((c) => c.key);
    const [key] = keys.splice(from, 1);
    keys.splice(to, 0, key);
    setDraft({ ...draft, order: keys });
  };

  return (
    <s-page heading={row.title} inlineSize="base">
      <s-link slot="breadcrumb-actions" onClick={() => void navigate("/collections")}>
        {t("Collections")}
      </s-link>
      <s-button slot="primary-action" variant="primary" disabled={!dirty || saving} loading={saving} onClick={() => void save()}>
        {t("Save")}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => openExternal(`${storeUrl}/collections/${row.handle}`)}>
        {t("View in store")}
      </s-button>

      <s-stack direction="block" gap="base">
        <Card heading={t("Variant cards in this collection")}>
          <s-switch
            label={t("Show variant cards on this collection's page")}
            details={shop.collections.mode === "selected" ? t("Adds or removes this collection from your selected collections.") : undefined}
            checked={on}
            onChange={(event) => setOn(event.currentTarget.checked)}
          />
          {!shop.enabled && <s-banner tone="warning">{t("Variant Cards is switched off for the whole store (see the dashboard).")}</s-banner>}
        </Card>

        <Card heading={t("Settings for this collection")} description={t("Anything left on “Shop setting” follows your general settings.")}>
          <s-query-container>
            <s-grid gridTemplateColumns="@container (inline-size <= 520px) 1fr, 1fr 1fr" gap="base">
              <Select<Tri>
                label={t("Show each variant as its own card")}
                value={tri(draft.split)}
                options={[
                  ["inherit", inherit(onOff(shop.split.enabled))],
                  ["on", t("On")],
                  ["off", t("Off")],
                ]}
                onChange={(v) => setDraft({ ...draft, split: fromTri(v) })}
              />
              <Select<SplitBy | "inherit">
                label={t("Split products by")}
                value={draft.by ?? "inherit"}
                options={[["inherit", inherit(splitLabel)], ...splitByOptions()]}
                onChange={(v) => setDraft({ ...draft, by: v === "inherit" ? null : v })}
              />
              <Select<string>
                label={t("Card title")}
                value={draft.title ?? "inherit"}
                options={[
                  ["inherit", inherit(titleOptions(shop.split.title).find(([v]) => v === shop.split.title)?.[1] ?? shop.split.title)],
                  ...titleOptions(draft.title ?? TITLE_PRESETS[0]),
                ]}
                onChange={(v) => setDraft({ ...draft, title: v === "inherit" ? null : v })}
              />
              <Select<PriceFormat | "inherit">
                label={t("Price format")}
                value={draft.price ?? "inherit"}
                options={[
                  ["inherit", inherit(priceLabels()[shop.price.format])],
                  ["theme", t("Like the theme (From $10)")],
                  ["from", t("From the lowest price")],
                  ["range", t("Price range ($10 – $15)")],
                ]}
                onChange={(v) => setDraft({ ...draft, price: v === "inherit" ? null : v })}
              />
              <Select<Tri>
                label={t("Hide sold-out variants")}
                value={tri(draft.hideSoldOut)}
                options={[
                  ["inherit", inherit(onOff(shop.hide.soldOut))],
                  ["on", t("On")],
                  ["off", t("Off")],
                ]}
                onChange={(v) => setDraft({ ...draft, hideSoldOut: fromTri(v) })}
              />
              <Select<Tri>
                label={t("Hide variants without their own image")}
                value={tri(draft.hideNoImage)}
                options={[
                  ["inherit", inherit(onOff(shop.hide.noImage))],
                  ["on", t("On")],
                  ["off", t("Off")],
                ]}
                onChange={(v) => setDraft({ ...draft, hideNoImage: fromTri(v) })}
              />
              <Select<Tri>
                label={t("Mix variants of different products")}
                value={tri(draft.mix)}
                options={[
                  ["inherit", inherit(onOff(shop.order.mix))],
                  ["on", t("On")],
                  ["off", t("Off")],
                ]}
                onChange={(v) => setDraft({ ...draft, mix: fromTri(v) })}
              />
            </s-grid>
          </s-query-container>
          {draft.title && !(TITLE_PRESETS as readonly string[]).includes(draft.title) && (
            <Text label={t("Custom title")} value={draft.title} onChange={(title) => setDraft({ ...draft, title: title || null })} />
          )}
        </Card>

        <Card
          heading={t("Card order")}
          description={t("Drag cards (or use the arrows) to choose the order shoppers see. Hidden cards never show in this collection. The order applies within each page of the collection.")}
        >
          {products.error ? (
            <ErrorBanner error={products.error} onRetry={products.reload} />
          ) : products.loading ? (
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-spinner accessibilityLabel={t("Loading")} size="base" />
              <s-text color="subdued">{tn(progress, "Loaded {count} product…", "Loaded {count} products…")}</s-text>
            </s-stack>
          ) : !cards.length ? (
            <s-text color="subdued">{t("This collection has no products.")}</s-text>
          ) : (
            <>
              <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                <s-text color="subdued">
                  {tn(cards.length, "{count} card", "{count} cards")}
                  {hidden.size ? ` · ${tn(hidden.size, "{count} hidden", "{count} hidden")}` : ""}
                  {products.data?.truncated ? ` · ${t("first {count} products", { count: formatNumber(products.data.products.length) })}` : ""}
                </s-text>
                <s-stack direction="inline" gap="small-200">
                  {draft.order.length > 0 && (
                    <s-button variant="tertiary" onClick={() => setDraft({ ...draft, order: [] })}>
                      {t("Reset order")}
                    </s-button>
                  )}
                  {draft.hidden.length > 0 && (
                    <s-button variant="tertiary" onClick={() => setDraft({ ...draft, hidden: [] })}>
                      {t("Show all")}
                    </s-button>
                  )}
                </s-stack>
              </s-grid>
              <OrderList
                cards={cards}
                hidden={hidden}
                title={effective?.title ?? shop.split.title}
                onMove={move}
                onToggleHidden={(key) =>
                  setDraft({ ...draft, hidden: hidden.has(key) ? draft.hidden.filter((k) => k !== key) : [...draft.hidden, key] })
                }
              />
            </>
          )}
        </Card>
      </s-stack>
    </s-page>
  );
}
