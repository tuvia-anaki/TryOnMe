import { useEffect, useState } from "preact/hooks";
import { loadCollectionsByHandle, type ChosenCollection } from "../api/collections";
import { formatNumber, t, tn } from "../i18n";
import { Button } from "./ui";

/**
 * The collections chosen in the settings: a list with pictures, and Shopify's
 * own collection picker to add or remove some. The settings keep handles
 * (what the theme sees); titles and images are looked up.
 */
export function CollectionPicker(props: { handles: string[]; onChange: (handles: string[]) => void }) {
  const [known, setKnown] = useState<Map<string, ChosenCollection>>(new Map());
  const [lookedUp, setLookedUp] = useState<Set<string>>(new Set());
  const missing = props.handles.filter((handle) => !known.has(handle) && !lookedUp.has(handle));

  useEffect(() => {
    if (!missing.length) return;
    let current = true;
    loadCollectionsByHandle(missing).then(
      (found) => {
        if (!current) return;
        setKnown((map) => new Map([...map, ...found.map((c) => [c.handle, c] as const)]));
        setLookedUp((set) => new Set([...set, ...missing]));
      },
      () => current && setLookedUp((set) => new Set([...set, ...missing])),
    );
    return () => {
      current = false;
    };
  }, [missing.join("\n")]);

  const pick = async () => {
    const picker = window.shopify?.resourcePicker;
    if (!picker) return;
    const selectionIds = props.handles.flatMap((handle) => {
      const id = known.get(handle)?.id;
      return id ? [{ id }] : [];
    });
    const picked = await picker({ type: "collection", multiple: true, action: "select", selectionIds });
    if (!picked) return;
    const rows = picked as unknown as { id: string; handle: string; title?: string; productsCount?: number; image?: { originalSrc?: string; url?: string } | null }[];
    setKnown(
      (map) =>
        new Map([
          ...map,
          ...rows.map(
            (c) =>
              [c.handle, { handle: c.handle, id: c.id, title: c.title ?? c.handle, image: c.image?.url ?? c.image?.originalSrc ?? null, productsCount: c.productsCount ?? null }] as const,
          ),
        ]),
    );
    props.onChange(rows.map((c) => c.handle).filter(Boolean));
  };

  if (!props.handles.length) {
    return (
      <div class="vc-picked vc-picked--empty">
        <span class="vc-muted">{t("No collections chosen yet.")}</span>
        <Button onClick={() => void pick()}>{t("Choose collections")}</Button>
      </div>
    );
  }

  return (
    <div class="vc-picked">
      <ul class="vc-picked__list" aria-label={t("Chosen collections")}>
        {props.handles.map((handle) => {
          const row = known.get(handle);
          const gone = !row && lookedUp.has(handle) ? true : row ? row.id === null : false;
          const title = row?.title ?? handle;
          return (
            <li key={handle} class="vc-picked__row">
              <s-thumbnail size="small-200" src={row?.image ?? undefined} alt="" />
              <span class="vc-picked__text">
                <span class="vc-picked__title">{title}</span>
                <span class="vc-picked__meta">
                  {gone ? t("This collection doesn't exist anymore") : row?.productsCount != null ? tn(row.productsCount, "{count} product", "{count} products", { count: formatNumber(row.productsCount) }) : "…"}
                </span>
              </span>
              <s-button
                variant="tertiary"
                icon="x"
                accessibilityLabel={t("Remove {title}", { title })}
                onClick={() => props.onChange(props.handles.filter((h) => h !== handle))}
              />
            </li>
          );
        })}
      </ul>
      <div class="vc-picked__footer">
        <Button onClick={() => void pick()}>{t("Add or remove collections")}</Button>
      </div>
    </div>
  );
}
