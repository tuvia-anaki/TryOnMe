import { APP_NAME } from "../../shared/brand";
import { currentLanguage } from "../i18n";

/**
 * Live support chat (Tidio), the same one the earlier Virtual Try-On app had.
 *
 * The widget loads once per admin session, after the app has rendered, so the chat bubble is
 * on every page (and Tidio can see it's installed) without ever slowing the admin down. The
 * operator sees which shop is asking, in which language, from which app.
 */

const TIDIO_SRC = "https://code.tidio.co/w9exl12wsqxlqdl4badjzkcgfimbkwux.js";
const READY_TIMEOUT_MS = 15_000;

declare global {
  interface Window {
    tidioChatApi?: {
      open?: () => void;
      show?: () => void;
      display?: (visible: boolean) => void;
      setVisitorData?: (data: Record<string, unknown>) => void;
      setContactProperties?: (props: Record<string, unknown>) => void;
    };
  }
  interface Document {
    tidioChatLang?: string;
  }
}

let loadPromise: Promise<void> | null = null;

/** Tidio's widget languages are plain codes ("pt", not "pt-BR"). */
const chatLanguage = () => currentLanguage().split("-")[0];

/** Who is asking: shop, language and app, for the operator. */
function applyContext(topic = "admin"): void {
  const api = window.tidioChatApi;
  if (!api) return;
  const properties = { language: currentLanguage(), shop: window.shopify?.config?.shop ?? "", topic, app: APP_NAME };
  try {
    api.setVisitorData?.(properties);
    api.setContactProperties?.(properties);
  } catch {
    // Context is a nice-to-have: never block the chat.
  }
}

/** Adds the widget once; repeat calls return the same promise. */
export function loadSupportChat(): Promise<void> {
  if (window.tidioChatApi) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    // Tidio reads this before it starts, to pick the widget's language.
    document.tidioChatLang = chatLanguage();
    const script = document.createElement("script");
    script.src = TIDIO_SRC;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("Support chat took too long to load.")), READY_TIMEOUT_MS);
    const ready = () => {
      window.clearTimeout(timer);
      applyContext();
      resolve();
    };
    script.onload = () => {
      if (window.tidioChatApi) ready();
      else document.addEventListener("tidioChat-ready", ready, { once: true });
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      loadPromise = null; // a later click can try again
      reject(new Error("Support chat failed to load."));
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

/** Opens the chat window (loading the widget first if it isn't there yet). */
export async function openSupportChat(topic = "help"): Promise<void> {
  await loadSupportChat();
  const api = window.tidioChatApi;
  if (!api) throw new Error("Support chat is unavailable.");
  applyContext(topic);
  api.display?.(true);
  api.show?.();
  api.open?.();
}
