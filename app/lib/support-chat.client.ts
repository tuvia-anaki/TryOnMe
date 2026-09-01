/**
 * Live support chat (Tidio), loaded on demand.
 *
 * The widget script is only fetched when a merchant actually asks for help,
 * so it never costs anything on normal admin page loads. The merchant's
 * chosen admin language is passed along so the conversation starts in the
 * right language and the operator can see it.
 */

const TIDIO_SRC = "https://code.tidio.co/w9exl12wsqxlqdl4badjzkcgfimbkwux.js";
const READY_TIMEOUT_MS = 12_000;

declare global {
  interface Window {
    tidioChatApi?: {
      open?: () => void;
      show?: () => void;
      display?: (visible: boolean) => void;
      setVisitorData?: (data: Record<string, unknown>) => void;
      setContactProperties?: (props: Record<string, unknown>) => void;
      messageFromOperator?: (message: string) => void;
    };
  }
  interface Document {
    tidioChatLang?: string;
  }
}

let loadPromise: Promise<void> | null = null;

function loadWidget(language: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.tidioChatApi) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    // Tidio reads this before boot to pick the widget language.
    document.tidioChatLang = language;

    const script = document.createElement("script");
    script.src = TIDIO_SRC;
    script.async = true;

    const timer = setTimeout(
      () => reject(new Error("Support chat took too long to load.")),
      READY_TIMEOUT_MS,
    );
    const done = () => {
      clearTimeout(timer);
      resolve();
    };

    script.onload = () => {
      if (window.tidioChatApi) return done();
      document.addEventListener("tidioChat-ready", done, { once: true });
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

export interface SupportChatContext {
  language: string;
  shopDomain?: string;
  topic?: string;
}

/** Loads the widget if needed, passes context, and opens the chat. */
export async function openSupportChat(context: SupportChatContext): Promise<void> {
  await loadWidget(context.language);
  const api = window.tidioChatApi;
  if (!api) throw new Error("Support chat is unavailable.");

  const properties = {
    language: context.language,
    shop: context.shopDomain ?? "",
    topic: context.topic ?? "onboarding",
    app: "Virtual Try-On",
  };
  try {
    api.setVisitorData?.(properties);
    api.setContactProperties?.(properties);
  } catch {
    // Context is a nice-to-have — never block opening the chat.
  }

  api.display?.(true);
  api.show?.();
  api.open?.();
}
