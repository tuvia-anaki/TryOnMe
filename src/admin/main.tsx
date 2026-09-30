import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { App } from "./App";
import { initI18n, msg, onLanguageChange, t } from "./i18n";
import "./styles.css";

declare global {
  interface Window {
    __PVI_MOCK__?: boolean;
  }
}

const NAV_LINKS: [string, string][] = [
  ["/swatches", msg("Swatches")],
  ["/collections", msg("Collections")],
  ["/settings", msg("More settings")],
  ["/help", msg("Help")],
];

/** The app's menu in the Shopify admin sidebar (re-rendered when the language changes). */
function renderNav(): void {
  let nav = document.querySelector("s-app-nav");
  if (!nav) {
    nav = document.createElement("s-app-nav");
    document.body.prepend(nav);
  }
  nav.replaceChildren(
    ...NAV_LINKS.map(([href, label]) => {
      const link = document.createElement("s-link");
      link.setAttribute("href", href);
      link.textContent = t(label);
      return link;
    }),
  );
}

function Root() {
  // Remount the app in the new language (the home page is the only place to switch).
  const [revision, setRevision] = useState(0);
  useEffect(
    () =>
      onLanguageChange(() => {
        renderNav();
        setRevision((n) => n + 1);
      }),
    [],
  );
  return <App key={revision} />;
}

async function boot(): Promise<void> {
  // Local development only; removed from production builds.
  if (import.meta.env.DEV && window.__PVI_MOCK__) {
    const { installMock } = await import("./dev/mock");
    installMock();
  }
  await initI18n(window.shopify?.config?.locale);
  renderNav();
  render(<Root />, document.getElementById("app")!);
}

void boot();
