import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { setNavigationGuard } from "../router";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
  setData: (value: T) => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    const run = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => run === latest.current && setState({ data, loading: false }),
      (error: Error) => run === latest.current && setState({ error, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const setData = useCallback((data: T) => setState({ data, loading: false }), []);
  return { data: state.data, error: state.error, loading: state.loading, reload, setData };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function toast(message: string, isError = false): void {
  try {
    window.shopify?.toast?.show(message, { isError, duration: isError ? 8000 : 4000 });
  } catch {
    /* outside admin */
  }
}

/**
 * App Bridge contextual save bar, for pages with a form (Shopify's rule):
 * shown only while there are unsaved changes, asks before Discard, and asks
 * before in-app navigation drops the changes. `id` null = no save bar.
 */
export function useSaveBar(
  id: string | null,
  dirty: boolean,
  saving: boolean,
  handlers: { onSave: () => void; onDiscard: () => void },
  labels: { save: string; discard: string },
): void {
  const handlerRef = useRef(handlers);
  handlerRef.current = handlers;
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!id) return;
    const bar = document.createElement("ui-save-bar");
    bar.id = id;
    bar.setAttribute("discardConfirmation", "");
    const save = document.createElement("button");
    save.setAttribute("variant", "primary");
    save.textContent = labels.save;
    save.addEventListener("click", () => handlerRef.current.onSave());
    const discard = document.createElement("button");
    discard.textContent = labels.discard;
    discard.addEventListener("click", () => handlerRef.current.onDiscard());
    bar.append(save, discard);
    document.body.appendChild(bar);
    elementRef.current = bar;
    return () => {
      void window.shopify?.saveBar?.hide(id);
      bar.remove();
      elementRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const bar = elementRef.current;
    const save = bar?.querySelector("button[variant=primary]");
    if (save) {
      if (saving) save.setAttribute("loading", "");
      else save.removeAttribute("loading");
    }
    if (dirty) void window.shopify?.saveBar?.show(id);
    else void window.shopify?.saveBar?.hide(id);
    setNavigationGuard(
      dirty
        ? async () => {
            await window.shopify?.saveBar?.leaveConfirmation();
            return true;
          }
        : null,
    );
    return () => setNavigationGuard(null);
  }, [dirty, saving, id]);
}
