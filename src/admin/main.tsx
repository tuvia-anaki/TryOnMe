import { render } from "preact";
import { App } from "./App";
import { initI18n, t } from "./i18n";
import "./styles.css";

declare global {
  interface Window {
    __PVI_MOCK__?: boolean;
  }
}

function renderNav(): void {
  if (document.querySelector("s-app-nav")) return;
  const nav = document.createElement("s-app-nav");
  const links: [string, string][] = [
    ["/products", t("Products")],
    ["/swatches", t("Swatches")],
    ["/settings", t("Settings")],
    ["/help", t("Help")],
  ];
  for (const [href, label] of links) {
    const link = document.createElement("s-link");
    link.setAttribute("href", href);
    link.textContent = label;
    nav.appendChild(link);
  }
  document.body.prepend(nav);
}

async function boot(): Promise<void> {
  // Local development only; removed from production builds.
  if (import.meta.env.DEV && window.__PVI_MOCK__) {
    const { installMock } = await import("./dev/mock");
    installMock();
  }
  await initI18n(window.shopify?.config?.locale);
  renderNav();
  render(<App />, document.getElementById("app")!);
}

void boot();
