import { Component, type ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { t } from "./i18n";
import { CollectionDetail } from "./pages/CollectionDetail";
import { Collections } from "./pages/Collections";
import { Dashboard } from "./pages/Dashboard";
import { Help } from "./pages/Help";
import { Settings } from "./pages/Settings";
import { Swatches } from "./pages/Swatches";
import { matchRoute, navigate, usePath } from "./router";

class ErrorBoundary extends Component<{ children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <s-page heading={t("Something went wrong")}>
          <s-banner tone="critical" heading={t("This page couldn't be displayed")}>
            <s-paragraph>{this.state.error.message}</s-paragraph>
            <s-button onClick={() => window.location.reload()}>{t("Reload")}</s-button>
          </s-banner>
        </s-page>
      );
    }
    return this.props.children;
  }
}

export function App() {
  // mock.html (local development) is the home page.
  const path = usePath().replace(/\/mock\.html$/, "").replace(/\/+$/, "") || "/";
  // Paths of earlier versions and of the apps this one replaced (bookmarks, open admin tabs).
  const legacy = ["/app", "/products", "/bulk", "/sections"].some((p) => path === p || path.startsWith(`${p}/`)) || path.startsWith("/auth/");
  useEffect(() => {
    if (legacy) void navigate("/", { replace: true });
  }, [legacy]);
  let page: ComponentChildren;
  let params: Record<string, string> | null;
  if (path === "/" || legacy) page = <Dashboard />;
  else if (path === "/settings") page = <Settings />;
  else if (path === "/collections") page = <Collections />;
  else if ((params = matchRoute("/collections/:id", path))) page = <CollectionDetail key={params.id} id={Number(params.id)} />;
  else if (path === "/swatches") page = <Swatches />;
  else if (path === "/help") page = <Help />;
  else {
    page = (
      <s-page heading={t("Page not found")}>
        <s-section>
          <s-paragraph>{t("This page doesn't exist.")}</s-paragraph>
          <s-button onClick={() => void navigate("/")}>{t("Go to Home")}</s-button>
        </s-section>
      </s-page>
    );
  }
  return <ErrorBoundary key={path}>{page}</ErrorBoundary>;
}
