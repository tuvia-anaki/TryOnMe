import { createPortal } from "preact/compat";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";

/**
 * The app's dropdown (instead of the browser's native select menu): a button
 * that opens a list of options, each with an optional second line. Keyboard:
 * arrows, Home/End, Enter/Space, Escape and type-to-jump (the WAI-ARIA
 * "select-only combobox" pattern; focus stays on the button).
 */

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** A quieter second line: an example or a few words of explanation. */
  description?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  label: string;
  /** Hide the label visually (screen readers still get it). */
  labelHidden?: boolean;
  value: T;
  options: DropdownOption<T>[];
  details?: string;
  disabled?: boolean;
  /** Also show the chosen option's second line on the button (e.g. an example title). */
  showDescription?: boolean;
  onChange: (value: T) => void;
}

interface Place {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

const GAP = 4;

function place(trigger: HTMLElement): Place {
  const r = trigger.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - GAP - 8;
  const above = r.top - GAP - 8;
  const width = Math.max(r.width, 220);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  // Open upwards only when there's clearly more room above.
  if (below < 220 && above > below) return { bottom: window.innerHeight - r.top + GAP, left, width, maxHeight: Math.min(360, above) };
  return { top: r.bottom + GAP, left, width, maxHeight: Math.min(360, below) };
}

export function Dropdown<T extends string>(props: Props<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-opt-${index}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Place | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = props.options.findIndex((o) => o.value === props.value);
  const selected = props.options[selectedIndex];
  const enabled = (index: number) => index >= 0 && index < props.options.length && !props.options[index].disabled;

  const show = () => {
    if (props.disabled || !triggerRef.current) return;
    setPos(place(triggerRef.current));
    setActive(enabled(selectedIndex) ? selectedIndex : props.options.findIndex((o) => !o.disabled));
    setOpen(true);
  };
  const hide = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const choose = (index: number) => {
    if (!enabled(index)) return;
    hide();
    if (props.options[index].value !== props.value) props.onChange(props.options[index].value);
  };
  const step = (from: number, delta: 1 | -1) => {
    const n = props.options.length;
    for (let i = 1; i <= n; i++) {
      const next = (from + delta * i + n * 2) % n;
      if (enabled(next)) return next;
    }
    return from;
  };

  // Keep the list next to its button while the page scrolls or resizes; close when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const reposition = () => triggerRef.current && setPos(place(triggerRef.current));
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) hide(false);
    };
    const blur = () => hide(false);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("blur", blur);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("blur", blur);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [open]);

  // Keep the active option visible.
  useLayoutEffect(() => {
    if (!open || active < 0) return;
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`);
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop - 6;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight + 6;
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        show();
      }
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => step(a, key === "ArrowDown" ? 1 : -1));
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      setActive(key === "Home" ? step(-1, 1) : step(props.options.length, -1));
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      choose(active);
    } else if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hide();
    } else if (key === "Tab") {
      hide(false);
    } else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // Type-to-jump: the next option starting with what was typed.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + key.toLowerCase(), at: now };
      const text = typed.current.text;
      const n = props.options.length;
      // A new first letter moves on to the next match; more letters refine the current one.
      const start = text.length > 1 ? Math.max(active, 0) : active + 1;
      for (let i = 0; i < n; i++) {
        const index = (start + i) % n;
        if (enabled(index) && props.options[index].label.toLowerCase().startsWith(text)) {
          setActive(index);
          break;
        }
      }
    }
  };

  return (
    <div class={`vc-field${props.disabled ? " is-disabled" : ""}`}>
      <span id={labelId} class={props.labelHidden ? "vc-visually-hidden" : "vc-field__label"}>
        {props.label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        class={`vc-dd__trigger${open ? " is-open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        disabled={props.disabled}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKeyDown}
      >
        <span class="vc-dd__value">
          {selected?.label ?? ""}
          {props.showDescription && selected?.description && <span class="vc-dd__value-desc">{selected.description}</span>}
        </span>
        <svg class="vc-dd__chevron" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {props.details && <span class="vc-field__details">{props.details}</span>}
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            class="vc-dd__list"
            role="listbox"
            aria-labelledby={labelId}
            tabIndex={-1}
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            {props.options.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === selectedIndex}
                aria-disabled={option.disabled || undefined}
                class={`vc-dd__option${index === active ? " is-active" : ""}${index === selectedIndex ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
                onPointerMove={() => enabled(index) && index !== active && setActive(index)}
                // Keep focus on the button (mousedown would move it to the list).
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <svg class="vc-dd__check" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="vc-dd__text">
                  <span class="vc-dd__label">{option.label}</span>
                  {option.description && <span class="vc-dd__desc">{option.description}</span>}
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
