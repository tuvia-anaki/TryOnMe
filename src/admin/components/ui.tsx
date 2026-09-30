import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { Link } from "../router";

/**
 * The app's page building blocks: bigger, roomier and easier to scan than the
 * admin's defaults (a page title, panels with clear titles, on/off rows, buttons).
 */

const Chevron = ({ class: className, d }: { class: string; d: string }) => (
  <svg class={className} viewBox="0 0 20 20" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export function PageHeader(props: { title: string; subtitle?: string; back?: { label: string; to: string }; actions?: ComponentChildren }) {
  return (
    <header class="vc-header">
      <div class="vc-header__text">
        {props.back && (
          <Link class="vc-header__back" href={props.back.to}>
            <Chevron class="vc-flip" d="M12 5l-5 5 5 5" />
            {props.back.label}
          </Link>
        )}
        <h1 class="vc-header__title">{props.title}</h1>
        {props.subtitle && <p class="vc-header__subtitle">{props.subtitle}</p>}
      </div>
      {props.actions && <div class="vc-header__actions">{props.actions}</div>}
    </header>
  );
}

export function Panel(props: { title?: string; description?: string; action?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="vc-panel">
      {(props.title || props.action) && (
        <div class="vc-panel__head">
          <div>
            {props.title && <h2 class="vc-panel__title">{props.title}</h2>}
            {props.description && <p class="vc-panel__desc">{props.description}</p>}
          </div>
          {props.action}
        </div>
      )}
      <div class="vc-panel__body">{props.children}</div>
    </section>
  );
}

export function Button(props: {
  variant?: "primary" | "secondary" | "plain" | "critical";
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class={`vc-btn vc-btn--${props.variant ?? "secondary"}${props.loading ? " is-loading" : ""}`}
      disabled={props.disabled || props.loading}
      aria-busy={props.loading || undefined}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/** A setting that's on or off: a title, a line of explanation, and a switch. */
export function ToggleRow(props: { title: string; description?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div class={`vc-toggle-row${props.disabled ? " is-disabled" : ""}`}>
      <label class="vc-toggle-row__text" for={id}>
        <span class="vc-toggle-row__title">{props.title}</span>
        {props.description && <span class="vc-toggle-row__desc">{props.description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        class={`vc-switch${props.checked ? " is-on" : ""}`}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      >
        <span class="vc-switch__knob" />
      </button>
    </div>
  );
}

/** Switches in one box, under an optional small label. */
export function ToggleList(props: { label?: string; children: ComponentChildren }) {
  return (
    <div class="vc-toggle-list">
      {props.label && <span class="vc-field__label">{props.label}</span>}
      <div class="vc-toggle-list__rows">{props.children}</div>
    </div>
  );
}

export type StatusTone = "live" | "off" | "paused" | "checking";

const STATUS_ICONS: Record<StatusTone, ComponentChildren> = {
  live: <path d="M6 10.5l2.5 2.5L14 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />,
  off: (
    <>
      <path d="M10 5.5v5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="10" cy="14.25" r="1.25" fill="currentColor" />
    </>
  ),
  paused: <path d="M7.75 6v8M12.25 6v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />,
  checking: <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="24 12" stroke-linecap="round" />,
};

/** Is the app working? A big state line, what to do about it, and the buttons that do it. */
export function StatusCard(props: { tone: StatusTone; title: string; description?: string; actions?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <section class={`vc-status vc-status--${props.tone}`} aria-live="polite">
      <span class="vc-status__icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">{STATUS_ICONS[props.tone]}</svg>
      </span>
      <div class="vc-status__text">
        <h2 class="vc-status__title">{props.title}</h2>
        {props.description && <p class="vc-status__desc">{props.description}</p>}
      </div>
      {props.actions && <div class="vc-status__actions">{props.actions}</div>}
      {props.children && <div class="vc-status__extra">{props.children}</div>}
    </section>
  );
}

/** A small rounded label: "On", "Off", "Own settings". */
export function Tag(props: { tone?: "success" | "info"; dot?: boolean; children: ComponentChildren }) {
  return <span class={`vc-tag${props.tone ? ` vc-tag--${props.tone}` : ""}${props.dot ? " vc-tag--dot" : ""}`}>{props.children}</span>;
}

/** A row that opens another page: a picture or icon, a title, a line of detail, tags. */
export function LinkRow(props: { to: string; media?: ComponentChildren; title: string; meta?: string; tags?: ComponentChildren }) {
  return (
    <Link class="vc-link-row" href={props.to}>
      {props.media && <span class="vc-link-row__media">{props.media}</span>}
      <span class="vc-link-row__text">
        <span class="vc-link-row__title">{props.title}</span>
        {props.meta && <span class="vc-link-row__meta">{props.meta}</span>}
      </span>
      {props.tags && <span class="vc-link-row__tags">{props.tags}</span>}
      <Chevron class="vc-link-row__chevron vc-flip" d="M8 5l5 5-5 5" />
    </Link>
  );
}

const CARD_ICONS = {
  settings: (
    <path
      d="M4 6h7M15 6h1M4 14h1M9 14h7M13 4v4M7 12v4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    />
  ),
  help: (
    <>
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7" />
      <path d="M8.1 8.2a2 2 0 1 1 2.6 1.9c-.5.2-.7.6-.7 1.1v.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      <circle cx="10" cy="13.6" r="1" fill="currentColor" />
    </>
  ),
};

/** A big clickable card that opens another page: an icon, a title and what's there. */
export function LinkCard(props: { to: string; icon: keyof typeof CARD_ICONS; title: string; description: string }) {
  return (
    <Link class="vc-link-card" href={props.to}>
      <span class="vc-link-card__icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">{CARD_ICONS[props.icon]}</svg>
      </span>
      <span class="vc-link-card__text">
        <span class="vc-link-card__title">{props.title}</span>
        <span class="vc-link-card__desc">{props.description}</span>
      </span>
      <Chevron class="vc-link-card__chevron vc-flip" d="M8 5l5 5-5 5" />
    </Link>
  );
}
