import type { SFProduct } from "./data";

/**
 * Finds the theme's own variant picker controls (radio groups, selects or
 * buttons) for each product option. Used to read the shopper's selection
 * instantly and to let our swatches drive the native picker, so the theme
 * keeps updating price, availability and the add-to-cart form itself.
 */

export interface NativeOption {
  /** Index into product.options (0-based). */
  index: number;
  kind: "radio" | "select" | "button";
  /**
   * Elements that make up this option's native UI (hidden when swatches
   * replace it): one wrapper when it's safe, otherwise each control + label.
   */
  blocks: Element[];
  read(): string | null;
  choose(value: string): boolean;
  /** Elements whose events signal a selection change. */
  controls: Element[];
}

const OUR_UI = "[data-pvi-ui]";
const NATIVE_HIDDEN = "data-pvi-native-hidden";

/**
 * Controls inside an element a theme has hidden inline (e.g. Dawn keeps the
 * previous picker for ~500 ms with display:none while it swaps in the new
 * one) are stale copies — never ours to read or drive.
 */
export function isInert(el: Element, stopAt?: Element): boolean {
  let node: Element | null = el;
  while (node && node !== stopAt) {
    const style = (node as HTMLElement).style;
    if (style && style.display === "none" && !node.hasAttribute(NATIVE_HIDDEN)) return true;
    node = node.parentElement;
  }
  return false;
}

const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();

/**
 * Maps whatever a theme puts in its control values (value names, option
 * value ids, lowercase handles) back to our option value names.
 */
function valueResolver(option: { values: { id: number; name: string }[] }) {
  const byKey = new Map<string, string>();
  for (const value of option.values) {
    byKey.set(norm(value.name), value.name);
    byKey.set(String(value.id), value.name);
    byKey.set(norm(value.name).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, ""), value.name);
  }
  return (raw: string | null | undefined): string | null => (raw == null ? null : byKey.get(norm(raw)) ?? byKey.get(String(raw).trim()) ?? null);
}

function overlap(values: string[], resolve: (raw: string) => string | null): number {
  const hits = new Set<string>();
  for (const v of values) {
    const name = resolve(v);
    if (name != null) hits.add(name);
  }
  return hits.size;
}

function isGoodMatch(values: string[], resolve: (raw: string) => string | null, wantedSize: number): boolean {
  const hits = overlap(values, resolve);
  if (!hits) return false;
  const needed = Math.min(2, wantedSize);
  return hits >= needed && hits / Math.max(1, new Set(values).size) >= 0.6;
}

function lowestCommonAncestor(elements: Element[]): Element | null {
  if (!elements.length) return null;
  let candidate: Element | null = elements[0].parentElement;
  while (candidate && !elements.every((el) => candidate!.contains(el))) candidate = candidate.parentElement;
  return candidate;
}

const FORBIDDEN_INSIDE = "form,[name='quantity'],[type='submit'],button[name='add'],.shopify-payment-button,[name='id']";
const STOP_AT = "form, product-info, .product__info-wrapper, .product-info, variant-selects, variant-radios, variant-picker";

function safeBlock(el: Element, others: Element[]): boolean {
  if (el.matches(STOP_AT)) return false;
  if (others.some((other) => el.contains(other))) return false;
  return !el.querySelector(FORBIDDEN_INSIDE);
}

/**
 * The element(s) to hide for an option. Grow from the controls' common
 * ancestor while it still contains only this option (so the legend/label goes
 * too). If even the common ancestor is shared with another option, the buy
 * button or the whole form, hide each control and its label instead.
 */
function optionBlocks(own: Element[], controls: Element[], others: Element[], scope: Element): Element[] {
  let block = lowestCommonAncestor(own);
  if (block && block !== scope && safeBlock(block, others)) {
    while (block.parentElement && block.parentElement !== scope) {
      const parent: Element = block.parentElement;
      if (!safeBlock(parent, others) || parent.children.length > 6) break;
      block = parent;
    }
    return [block];
  }
  // Per-control fallback: each control, its label and a wrapper that holds nothing else.
  const blocks: Element[] = [];
  for (const control of controls) {
    const wrapper = control.parentElement;
    const label =
      (control.id && scope.querySelector(`label[for="${CSS.escape(control.id)}"]`)) || control.closest("label");
    if (label && !label.contains(control)) blocks.push(label);
    if (wrapper && wrapper !== scope && safeBlock(wrapper, [...others, ...controls.filter((c) => c !== control)])) {
      blocks.push(label && label.contains(control) ? label : wrapper);
    } else {
      blocks.push(label && label.contains(control) ? label : control);
    }
  }
  return [...new Set(blocks)];
}

function fire(el: Element, types: string[]): void {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
}

export function findNativeOptions(scope: Element, product: SFProduct): NativeOption[] {
  const results: (NativeOption & { controlsForBlock: Element[] })[] = [];
  const used = new Set<Element>();

  const radios = Array.from(scope.querySelectorAll<HTMLInputElement>("input[type='radio']")).filter(
    (input) => !input.closest(OUR_UI) && input.name,
  );
  const radioGroups = new Map<string, HTMLInputElement[]>();
  for (const input of radios) {
    const key = `${input.getAttribute("form") || input.form?.id || ""}|${input.name}`;
    if (!radioGroups.has(key)) radioGroups.set(key, []);
    radioGroups.get(key)!.push(input);
  }
  // A theme swapping in a new picker may briefly keep the old copy (same names)
  // hidden inline: when both exist, only the live copy counts.
  for (const [key, group] of radioGroups) {
    const live = group.filter((input) => !isInert(input, scope));
    if (live.length && live.length < group.length) radioGroups.set(key, live);
  }
  const selects = Array.from(scope.querySelectorAll<HTMLSelectElement>("select")).filter(
    (select) => !select.closest(OUR_UI) && select.name !== "id" && !/quantity/i.test(select.name),
  );

  product.options.forEach((option, index) => {
    const resolve = valueResolver(option);
    const wantedSize = option.values.length;
    const nameHint = norm(option.name);

    // 1) Radio groups (Dawn, Horizon, most OS 2.0 themes)
    let best: HTMLInputElement[] | null = null;
    let bestScore = 0;
    for (const group of radioGroups.values()) {
      if (used.has(group[0])) continue;
      const values = group.map((input) => input.value);
      if (!isGoodMatch(values, resolve, wantedSize)) continue;
      let score = overlap(values, resolve);
      if (norm(group[0].name).includes(nameHint)) score += 100;
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    }
    if (best) {
      const group = best;
      group.forEach((input) => used.add(input));
      results.push({
        index,
        kind: "radio",
        blocks: [],
        controls: group,
        controlsForBlock: group,
        read: () => resolve(group.find((input) => input.checked)?.value),
        choose: (value) => {
          const input = group.find((el) => resolve(el.value) === value);
          if (!input) return false;
          if (!input.checked) input.click();
          if (!input.checked) {
            input.checked = true;
            fire(input, ["input", "change"]);
          }
          return true;
        },
      });
      return;
    }

    // 2) Selects (dropdown pickers, classic themes)
    let bestSelect: HTMLSelectElement | null = null;
    bestScore = 0;
    for (const select of selects) {
      if (used.has(select)) continue;
      const values = Array.from(select.options).map((o) => o.value).filter(Boolean);
      if (!isGoodMatch(values, resolve, wantedSize)) continue;
      let score = overlap(values, resolve);
      const label = norm(`${select.name} ${select.id} ${select.getAttribute("data-index") ?? ""}`);
      if (label.includes(nameHint) || label.includes(`option${index + 1}`)) score += 100;
      if (!isInert(select, scope)) score += 1000;
      if (score > bestScore) {
        bestScore = score;
        bestSelect = select;
      }
    }
    if (bestSelect) {
      const select = bestSelect;
      used.add(select);
      results.push({
        index,
        kind: "select",
        blocks: [],
        controls: [select],
        controlsForBlock: [select],
        read: () => resolve(select.value),
        choose: (value) => {
          const match = Array.from(select.options).find((o) => resolve(o.value) === value);
          if (!match) return false;
          if (select.value !== match.value) {
            select.value = match.value;
            fire(select, ["input", "change"]);
          }
          return true;
        },
      });
      return;
    }

    // 3) Buttons carrying the value in a data attribute
    const buttons = Array.from(
      scope.querySelectorAll<HTMLElement>("[data-value],[data-option-value],[data-variant-option-value],[data-escape]"),
    ).filter((el) => !el.closest(OUR_UI) && !used.has(el) && !(el instanceof HTMLOptionElement));
    const valueOf = (el: HTMLElement) =>
      el.getAttribute("data-escape") ??
      el.getAttribute("data-option-value") ??
      el.getAttribute("data-value") ??
      el.getAttribute("data-variant-option-value") ??
      "";
    const byParent = new Map<Element, HTMLElement[]>();
    for (const button of buttons) {
      if (resolve(valueOf(button)) == null) continue;
      const parent = button.parentElement;
      if (!parent) continue;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent)!.push(button);
    }
    let bestButtons: HTMLElement[] | null = null;
    let bestButtonScore = -1;
    for (const group of byParent.values()) {
      if (!isGoodMatch(group.map(valueOf), resolve, wantedSize)) continue;
      const groupScore = group.length + (isInert(group[0], scope) ? 0 : 1000);
      if (groupScore > bestButtonScore) {
        bestButtonScore = groupScore;
        bestButtons = group;
      }
    }
    if (bestButtons) {
      const group = bestButtons;
      group.forEach((el) => used.add(el));
      const selected = (el: HTMLElement) =>
        el.matches(".is-active,.active,.selected,.is-selected,[aria-pressed='true'],[aria-checked='true'],[aria-selected='true']");
      results.push({
        index,
        kind: "button",
        blocks: [],
        controls: group,
        controlsForBlock: group,
        read: () => {
          const el = group.find(selected);
          return el ? resolve(valueOf(el)) : null;
        },
        choose: (value) => {
          const el = group.find((b) => resolve(valueOf(b)) === value);
          if (!el) return false;
          if (!selected(el)) el.click();
          return true;
        },
      });
    }
  });

  // Compute each option's blocks now that we know every option's controls.
  for (const result of results) {
    const others = results.filter((r) => r !== result).flatMap((r) => r.controlsForBlock);
    const own = [...result.controlsForBlock];
    // Include labels pointing at the controls.
    for (const control of result.controlsForBlock) {
      if (control.id) {
        const label = scope.querySelector(`label[for="${CSS.escape(control.id)}"]`);
        if (label) own.push(label);
      }
    }
    result.blocks = optionBlocks(own, result.controlsForBlock, others, scope);
  }
  return results.map(({ controlsForBlock: _unused, ...rest }) => rest);
}

/** Selected option value names in option order (null when unknown). */
export function readSelection(options: NativeOption[], optionCount: number): (string | null)[] {
  const names: (string | null)[] = new Array(optionCount).fill(null);
  for (const option of options) names[option.index] = option.read();
  return names;
}

/** Keeps the detected native controls fresh (themes re-render pickers on variant change). */
export class NativeRegistry {
  private options: NativeOption[] = [];
  private liveAtScan: boolean[] = [];
  private lastScan = 0;

  constructor(
    private readonly scope: Element,
    private readonly product: SFProduct,
  ) {
    this.refresh();
  }

  refresh(): NativeOption[] {
    this.options = findNativeOptions(this.scope, this.product);
    this.liveAtScan = this.options.map((option) => option.controls.every((control) => !isInert(control, this.scope)));
    this.lastScan = Date.now();
    return this.options;
  }

  get(): NativeOption[] {
    const stale = this.options.some(
      (option, i) =>
        option.controls.some((control) => !control.isConnected) ||
        (this.liveAtScan[i] && option.controls.some((control) => isInert(control, this.scope))),
    );
    // Nothing found yet (picker rendered late?): rescan, but not more than every 2s.
    if (stale || (!this.options.length && Date.now() - this.lastScan > 2000)) this.refresh();
    return this.options;
  }
}
