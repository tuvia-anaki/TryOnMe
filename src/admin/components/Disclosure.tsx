import type { ComponentChildren } from "preact";
import { useId, useState } from "preact/hooks";

/** Settings most merchants never need, behind a "Show more" row (progressive disclosure). */
export function Disclosure(props: { title: string; summary?: string; defaultOpen?: boolean; children: ComponentChildren }) {
  const [open, setOpen] = useState(!!props.defaultOpen);
  const bodyId = useId();
  return (
    <div class={`vc-disclosure${open ? " is-open" : ""}`}>
      <button type="button" class="vc-disclosure__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span class="vc-disclosure__text">
          <span class="vc-disclosure__title">{props.title}</span>
          {props.summary && !open && <span class="vc-disclosure__summary">{props.summary}</span>}
        </span>
        <svg class="vc-disclosure__chevron" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div id={bodyId} class="vc-disclosure__body" hidden={!open}>
        {props.children}
      </div>
    </div>
  );
}
