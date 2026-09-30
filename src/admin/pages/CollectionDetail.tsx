import { useEffect, useMemo, useState } from "preact/hooks";
import {
  EMPTY_COLLECTION_SETTINGS,
  TITLE_PRESETS,
  effectiveSettings,
  isDefaultCollectionSettings,
  splitOptionName,
  type AppSettings,
  type CollectionSettings,
  type PriceFormat,
  type SplitBy,
} from "../../shared/settings";
import { arrangeCards, formatTitle, productCards, type VariantCard } from "../../shared/split";
import { loadCollection, loadCollectionProducts, loadOptionNames, saveCollectionSettings } from "../api/collections";
import { loadAppContext, saveSettings } from "../api/settings";
import { splitSummary, titleChoices } from "../components/choices";
import { ErrorBanner, Loading, openExternal } from "../components/common";
import { Disclosure } from "../components/Disclosure";
import { Select, Text } from "../components/fields";
import { Button, PageHeader, Panel, ToggleRow } from "../components/ui";
import { formatNumber, t, tn } from "../i18n";
import { toast, useAsync, useSaveBar } from "../lib/hooks";
import { navigate } from "../router";
import { collectionIsOn } from "./Collections";
import { orderChoices, priceChoices } from "./Settings";

const INHERIT = "inherit";
const CUSTOM = "__custom__";

/** "Same as your settings", with what that currently means underneath. */
const same = (current: string): [typeof INHERIT, string, string] => [INHERIT, t("Same as your settings"), current];

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
  const optionNames = useAsync(() => loadOptionNames(), []);
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

  const back = { label: t("Collections"), to: "/collections" };
  if (collection.loading && !collection.data) {
    return (
      <s-page inlineSize="base">
        <PageHeader title={t("Loading collection…")} back={back} />
        <Loading />
      </s-page>
    );
  }
  if (collection.error || context.error) {
    return (
      <s-page inlineSize="base">
        <PageHeader title={t("Collection")} back={back} />
        <ErrorBanner error={(collection.error ?? context.error)!} onRetry={collection.error ? collection.reload : context.reload} />
      </s-page>
    );
  }
  const row = collection.data;
  if (!row || !shop) {
    return (
      <s-page inlineSize="base">
        <PageHeader title={t("Collection not found")} back={back} />
        <Panel>
          <p class="vc-text">{t("This collection doesn't exist anymore.")}</p>
          <div class="vc-actions">
            <Button onClick={() => void navigate("/collections")}>{t("Back to collections")}</Button>
          </div>
        </Panel>
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
  const hidden = new Set(draft.hidden);
  const storeUrl = context.data?.shop.url ?? `https://${context.data?.shop.domain}`;
  const overrides = !isDefaultCollectionSettings({ ...draft, order: [], hidden: [], enabled: null });

  // What gets its own card: one list with every choice, including each option name in the store.
  const splitValue = draft.split === false ? "none" : (draft.by ?? (draft.split === true ? shop.split.by : INHERIT));
  const names = [...new Set([...(optionNames.data ?? []).map((o) => o.name), ...[splitOptionName(shop.split.by), draft.by ? splitOptionName(draft.by) : null].filter((n): n is string => !!n)])];
  const splitOptions: [string, string, string?][] = [
    same(splitSummary(shop.split.enabled, shop.split.by)),
    ["auto", t("Each color")],
    ["all", t("Each variant")],
    ...names.map((name): [string, string] => [`option:${name}`, t("Each {option}", { option: name })]),
    ["none", t("Don't split")],
  ];
  const setSplit = (v: string) =>
    setDraft({ ...draft, split: v === INHERIT ? null : v !== "none", by: v === INHERIT || v === "none" ? null : (v as SplitBy) });

  const titleBy = effective?.by ?? shop.split.by;
  const titleExample = optionNames.data?.find((o) => o.name.toLowerCase() === (splitOptionName(titleBy) ?? "").toLowerCase())?.example;
  const titleValue = draft.title === null ? INHERIT : (TITLE_PRESETS as readonly string[]).includes(draft.title) ? draft.title : CUSTOM;
  const titleOptions: [string, string, string?][] = [
    same(titleChoices(titleBy, titleExample).find((o) => o.value === shop.split.title)?.label ?? shop.split.title),
    ...titleChoices(titleBy, titleExample).map((o): [string, string, string?] => [o.value, o.label, o.description]),
    [CUSTOM, t("Custom"), t("Write your own")],
  ];
  const showHide = (value: boolean | null) => (value === null ? INHERIT : value ? "hide" : "show");
  const fromShowHide = (value: string) => (value === INHERIT ? null : value === "hide");

  const move = (from: number, to: number) => {
    const keys = cards.map((c) => c.key);
    const [key] = keys.splice(from, 1);
    keys.splice(to, 0, key);
    setDraft({ ...draft, order: keys });
  };

  return (
    <s-page inlineSize="base">
      <PageHeader
        title={row.title}
        subtitle={tn(row.productsCount, "{count} product", "{count} products", { count: formatNumber(row.productsCount) })}
        back={back}
        actions={<Button onClick={() => openExternal(`${storeUrl}/collections/${row.handle}`)}>{t("View in store")}</Button>}
      />

      <div class="vc-stack">
        {!shop.enabled && <s-banner tone="warning">{t("Variant Cards is paused for the whole store (see Home).")}</s-banner>}
        <Panel>
          <ToggleRow
            title={t("Show variant cards on this collection's page")}
            description={shop.collections.mode === "selected" ? t("Adds it to (or removes it from) the collections you chose on Home.") : undefined}
            checked={on}
            onChange={setOn}
          />
        </Panel>

        <Disclosure title={t("Different settings for this collection")} summary={overrides ? t("Some settings are changed") : t("Same as your settings")} defaultOpen={overrides}>
          <div class="vc-columns">
            <Select<string> showDescription label={t("What gets its own card")} value={splitValue} options={splitOptions} onChange={setSplit} />
            <Select<string>
              showDescription
              label={t("Card title")}
              value={titleValue}
              options={titleOptions}
              disabled={!(effective?.split ?? true)}
              onChange={(v) => setDraft({ ...draft, title: v === INHERIT ? null : v === CUSTOM ? "{product} · {value}" : v })}
            />
            <Select<string>
              showDescription
              label={t("Price")}
              value={draft.price ?? INHERIT}
              options={[same(priceChoices().find(([v]) => v === shop.price.format)![1]), ...priceChoices()]}
              onChange={(v) => setDraft({ ...draft, price: v === INHERIT ? null : (v as PriceFormat) })}
            />
            <Select<string>
              showDescription
              label={t("Card order")}
              value={draft.mix === null ? INHERIT : draft.mix ? "mix" : "together"}
              options={[same(orderChoices().find(([v]) => v === (shop.order.mix ? "mix" : "together"))![1]), ...orderChoices()]}
              onChange={(v) => setDraft({ ...draft, mix: v === INHERIT ? null : v === "mix" })}
            />
            <Select<string>
              showDescription
              label={t("Sold-out cards")}
              value={showHide(draft.hideSoldOut)}
              options={[same(shop.hide.soldOut ? t("Hide") : t("Show")), ["show", t("Show")], ["hide", t("Hide")]]}
              onChange={(v) => setDraft({ ...draft, hideSoldOut: fromShowHide(v) })}
            />
            <Select<string>
              showDescription
              label={t("Cards without their own photo")}
              value={showHide(draft.hideNoImage)}
              options={[same(shop.hide.noImage ? t("Hide") : t("Show")), ["show", t("Show")], ["hide", t("Hide")]]}
              onChange={(v) => setDraft({ ...draft, hideNoImage: fromShowHide(v) })}
            />
          </div>
          {draft.title !== null && !(TITLE_PRESETS as readonly string[]).includes(draft.title) && (
            <Text label={t("Custom title")} value={draft.title} onChange={(title) => setDraft({ ...draft, title: title || null })} />
          )}
        </Disclosure>

        <Panel title={t("Card order")} description={t("Drag cards to change the order shoppers see. Hidden cards don't show in this collection.")}>
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
              <div class="vc-order-bar">
                <span class="vc-muted">
                  {tn(cards.length, "{count} card", "{count} cards")}
                  {hidden.size ? ` · ${tn(hidden.size, "{count} hidden", "{count} hidden")}` : ""}
                  {products.data?.truncated ? ` · ${t("first {count} products", { count: formatNumber(products.data.products.length) })}` : ""}
                </span>
                <span class="vc-actions">
                  {draft.order.length > 0 && (
                    <Button variant="plain" onClick={() => setDraft({ ...draft, order: [] })}>
                      {t("Reset order")}
                    </Button>
                  )}
                  {draft.hidden.length > 0 && (
                    <Button variant="plain" onClick={() => setDraft({ ...draft, hidden: [] })}>
                      {t("Show all")}
                    </Button>
                  )}
                </span>
              </div>
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
        </Panel>

      </div>
    </s-page>
  );
}
