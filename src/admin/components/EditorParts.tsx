import { useState } from "preact/hooks";
import { colorsForName } from "../../shared/colors";
import type { NormalizedConfig } from "../../shared/config";
import type { Combination, PMedia, ProductModel } from "../../shared/product";
import { resolveVisibleMedia } from "../../shared/resolve";
import { backgroundFor } from "../../storefront/swatch-style";
import { t, tn } from "../i18n";
import { SHARED_KEY } from "../lib/editor";

export interface GroupView {
  key: string;
  label: string;
  valueIds: number[];
  variants: number;
  media: number[];
}

export function thumbUrl(url: string | null, width = 240): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

/** Colored dot for a group: native swatch → color name → first image → initials. */
export function GroupDot(props: { product: ProductModel; combo: { valueIds: number[]; label: string } | null; firstMedia?: PMedia }) {
  if (!props.combo) return <span class="pvi-dot pvi-dot--shared" aria-hidden="true" />;
  for (const option of props.product.options) {
    const value = option.values.find((v) => props.combo!.valueIds.includes(v.id));
    if (!value) continue;
    if (value.imageUrl) return <span class="pvi-dot" style={{ backgroundImage: `url("${value.imageUrl}")` }} aria-hidden="true" />;
    if (value.color) return <span class="pvi-dot" style={{ background: value.color }} aria-hidden="true" />;
    const named = colorsForName(value.name);
    if (named) return <span class="pvi-dot" style={{ background: backgroundFor(named) }} aria-hidden="true" />;
  }
  const url = thumbUrl(props.firstMedia?.url ?? null, 80);
  if (url) return <span class="pvi-dot" style={{ backgroundImage: `url("${url}")` }} aria-hidden="true" />;
  return (
    <span class="pvi-dot pvi-dot--text" aria-hidden="true">
      {props.combo.label.slice(0, 2)}
    </span>
  );
}

export function GroupList(props: {
  product: ProductModel;
  combos: Combination[];
  config: NormalizedConfig;
  selected: string;
  onSelect: (key: string) => void;
  onDropMedia: (key: string, mediaId: number) => void;
}) {
  const [dropKey, setDropKey] = useState<string | null>(null);
  const byId = new Map(props.product.media.map((m) => [m.id, m]));
  const items = [
    ...props.combos.map((combo) => ({
      key: combo.key,
      label: combo.label,
      combo: combo as { valueIds: number[]; label: string } | null,
      variants: combo.variants.length,
      media: props.config.groups.find((g) => g.key === combo.key)?.media ?? [],
    })),
    { key: SHARED_KEY, label: t("All variants (shared)"), combo: null, variants: 0, media: props.config.shared },
  ];

  const dropHandlers = (key: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("text/pvi-media")) return;
      event.preventDefault();
      setDropKey(key);
    },
    onDragLeave: () => setDropKey((k) => (k === key ? null : k)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDropKey(null);
      const id = Number(event.dataTransfer?.getData("text/pvi-media"));
      if (id) props.onDropMedia(key, id);
    },
  });

  return (
    <ul class="pvi-groups" aria-label={t("Variant groups")}>
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            class={`pvi-group${dropKey === item.key ? " is-drop-target" : ""}`}
            aria-current={props.selected === item.key ? "true" : "false"}
            onClick={() => props.onSelect(item.key)}
            {...dropHandlers(item.key)}
          >
            <GroupDot product={props.product} combo={item.combo} firstMedia={byId.get(item.media[0])} />
            <span>
              <span class="pvi-group__label">{item.label}</span>
              <span class="pvi-group__meta">
                {item.combo ? tn(item.variants, "{count} variant", "{count} variants") : t("Always visible")}
              </span>
            </span>
            <span class={`pvi-group__count${item.combo && !item.media.length ? " is-empty" : ""}`}>{item.media.length}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type Filter = "all" | "unassigned" | "group";

/** Filter tabs only help when a product has lots of images. */
const MANY_IMAGES = 12;

export function MediaGrid(props: {
  product: ProductModel;
  config: NormalizedConfig;
  selected: string;
  groupLabels: Map<string, string>;
  onToggle: (mediaId: number, range: boolean) => void;
  onSetMain: (mediaId: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [dragging, setDragging] = useState<number | null>(null);
  const inGroup = new Set(props.selected === SHARED_KEY ? props.config.shared : (props.config.groups.find((g) => g.key === props.selected)?.media ?? []));
  const main = props.selected === SHARED_KEY ? null : (props.config.groups.find((g) => g.key === props.selected)?.media[0] ?? null);
  const membership = new Map<number, string[]>();
  for (const group of props.config.groups) for (const id of group.media) membership.set(id, [...(membership.get(id) ?? []), group.key]);
  for (const id of props.config.shared) membership.set(id, [...(membership.get(id) ?? []), SHARED_KEY]);

  const many = props.product.media.length > MANY_IMAGES;
  const media = props.product.media.filter((m) => {
    if (!many) return true;
    if (filter === "unassigned") return !membership.has(m.id);
    if (filter === "group") return inGroup.has(m.id);
    return true;
  });

  const typeLabel: Record<string, string> = { VIDEO: t("Video"), EXTERNAL_VIDEO: t("Video"), MODEL_3D: t("3D") };

  return (
    <div>
      {many && (
        <div class="pvi-toolbar">
          <div class="pvi-segmented" role="group" aria-label={t("Show")}>
            {(
              [
                ["all", t("All")],
                ["unassigned", t("Unassigned")],
                ["group", t("Selected")],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!media.length ? (
        <div class="pvi-empty">{filter === "unassigned" ? t("Every image is assigned.") : t("No images here yet.")}</div>
      ) : (
        <div class="pvi-media-grid">
          {media.map((m) => {
            const selected = inGroup.has(m.id);
            const groups = (membership.get(m.id) ?? []).filter((k) => k !== props.selected);
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                class={`pvi-tile${selected ? " is-selected" : ""}${dragging === m.id ? " is-dragging" : ""}`}
                aria-pressed={selected}
                aria-label={`${m.alt || t("Image {n}", { n: m.position + 1 })}${selected ? ` — ${t("selected")}` : ""}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer?.setData("text/pvi-media", String(m.id));
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
                  setDragging(m.id);
                }}
                onDragEnd={() => setDragging(null)}
                onClick={(event) => props.onToggle(m.id, event.shiftKey)}
                onKeyDown={(event) => {
                  // Keys pressed on the inner "Make main" button belong to that button.
                  if (event.target !== event.currentTarget) return;
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    props.onToggle(m.id, event.shiftKey);
                  }
                }}
              >
                {m.url ? (
                  <img class="pvi-tile__img" src={thumbUrl(m.url) ?? undefined} alt="" loading="lazy" draggable={false} />
                ) : (
                  <div class="pvi-tile__img" />
                )}
                <span class="pvi-tile__check" aria-hidden="true">
                  {selected ? "✓" : ""}
                </span>
                {main === m.id && <span class="pvi-tile__main">{t("Main")}</span>}
                {typeLabel[m.type] && <span class="pvi-tile__type">{typeLabel[m.type]}</span>}
                {(groups.length > 0 || (selected && main !== m.id && props.selected !== SHARED_KEY)) && (
                  <div class="pvi-tile__foot">
                    {groups.slice(0, 2).map((key) => (
                      <span class="pvi-chip" key={key}>
                        {key === SHARED_KEY ? t("Shared") : props.groupLabels.get(key) ?? key}
                      </span>
                    ))}
                    {groups.length > 2 && <span class="pvi-chip">+{groups.length - 2}</span>}
                    {selected && main !== m.id && props.selected !== SHARED_KEY && (
                      <button
                        type="button"
                        class="pvi-tile__action"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onSetMain(m.id);
                        }}
                      >
                        {t("Make main")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** What shoppers see for the selected group (its first variant). */
export function GroupPreview(props: {
  product: ProductModel;
  config: NormalizedConfig;
  hideUnassigned: boolean;
  variant: ProductModel["variants"][number] | undefined;
}) {
  const variant = props.variant ?? props.product.variants[0];
  if (!variant) return null;
  const result = resolveVisibleMedia(
    props.config,
    props.product.media.map((m) => m.id),
    variant.valueIds,
    { hideUnassigned: props.hideUnassigned },
  );
  const byId = new Map(props.product.media.map((m) => [m.id, m]));
  return (
    <s-stack direction="block" gap="small-300">
      <s-text color="subdued">
        {result.mode === "all"
          ? t("Shoppers see all {count} images (nothing assigned yet).", { count: result.visible.length })
          : result.mode === "fallback"
            ? t("No group matches this variant: shoppers see shared and unassigned images ({count}).", { count: result.visible.length })
            : t("Shoppers see {count} of {total} images.", { count: result.visible.length, total: props.product.media.length })}
      </s-text>
      <div class="pvi-strip">
        {result.visible.map((id) => {
          const m = byId.get(id);
          return m?.url ? (
            <img key={id} src={thumbUrl(m.url, 160) ?? undefined} alt={m.alt} class={result.main === id ? "is-main" : ""} title={result.main === id ? t("Main image") : m.alt} />
          ) : null;
        })}
      </div>
    </s-stack>
  );
}
