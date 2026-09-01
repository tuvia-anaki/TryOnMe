/**
 * Live support chat (Tidio).
 *
 * The widget is loaded once per admin session from the app layout, so the
 * chat bubble is always available to merchants (and Tidio can verify the
 * install). The script is injected asynchronously after render, so it never
 * blocks the admin UI.
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

export interface SupportChatContext {
  language: string;
  shopDomain?: string;
  topic?: string;
}

let loadPromise: Promise<void> | null = null;

/**
 * Injects the widget once. Safe to call on every render/navigation — repeat
 * calls return the same promise instead of adding another script tag.
 */
export function loadSupportChat(context: SupportChatContext): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.tidioChatApi) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    // Tidio reads this before boot to choose the widget language.
    document.tidioChatLang = context.language;

    const script = document.createElement("script");
    script.src = TIDIO_SRC;
    script.async = true;

    const timer = setTimeout(
      () => reject(new Error("Support chat took too long to load.")),
      READY_TIMEOUT_MS,
    );
    const ready = () => {
      clearTimeout(timer);
      applyContext(context);
      resolve();
    };

    script.onload = () => {
      if (window.tidioChatApi) return ready();
      document.addEventListener("tidioChat-ready", ready, { once: true });
    };
    script.onerror = () => {
      clearTimeout(timer);
      loadPromise = null; // allow a retry
      reject(new Error("Support chat failed to load."));
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}

/** Tells the operator who is asking, from which shop, in which language. */
function applyContext(context: SupportChatContext): void {
  const api = window.tidioChatApi;
  if (!api) return;
  const properties = {
    language: context.language,
    shop: context.shopDomain ?? "",
    topic: context.topic ?? "admin",
    app: "Virtual Try-On",
  };
  try {
    api.setVisitorData?.(properties);
    api.setContactProperties?.(properties);
  } catch {
    // Context is a nice-to-have — never block the chat.
  }
}

/** Opens the chat window, loading the widget first if it isn't up yet. */
export async function openSupportChat(context: SupportChatContext): Promise<void> {
  await loadSupportChat(context);
  const api = window.tidioChatApi;
  if (!api) throw new Error("Support chat is unavailable.");
  applyContext(context);
  api.display?.(true);
  api.show?.();
  api.open?.();
}
