import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

/**
 * Tiny client-side router. App Bridge's navigation menu updates the iframe
 * history; we follow popstate and our own pushState calls.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener("popstate", notify);

let guard: (() => Promise<boolean>) | null = null;

/** Register a check that runs before navigating away (unsaved changes). */
export function setNavigationGuard(fn: (() => Promise<boolean>) | null): void {
  guard = fn;
}

export async function navigate(path: string, options: { replace?: boolean } = {}): Promise<void> {
  if (guard && !(await guard())) return;
  const url = new URL(path, window.location.origin);
  // Keep Shopify's embedded params (shop, host…) so reloads keep working.
  const current = new URLSearchParams(window.location.search);
  for (const key of ["shop", "host", "embedded", "locale"]) {
    if (current.has(key) && !url.searchParams.has(key)) url.searchParams.set(key, current.get(key)!);
  }
  const target = url.pathname + url.search + url.hash;
  if (options.replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
  window.scrollTo(0, 0);
  notify();
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  return path;
}

export function useQueryParam(name: string): string | null {
  usePath();
  return new URLSearchParams(window.location.search).get(name);
}

export function Link(props: { href: string; children: ComponentChildren; class?: string }) {
  return (
    <a
      href={props.href}
      class={props.class}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        void navigate(props.href);
      }}
    >
      {props.children}
    </a>
  );
}

/** Match "/products/:id" style patterns. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
