import { Component, type ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { t } from "./i18n";
import { Bulk } from "./pages/Bulk";
import { Help } from "./pages/Help";
import { Home } from "./pages/Home";
import { ProductEditor } from "./pages/ProductEditor";
import { Products } from "./pages/Products";
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
  // Paths of the app this one replaced (bookmarks, open admin tabs).
  const legacy = path === "/app" || path.startsWith("/app/") || path.startsWith("/auth/");
  useEffect(() => {
    if (legacy) void navigate("/", { replace: true });
  }, [legacy]);
  let page: ComponentChildren;
  let params: Record<string, string> | null;
  if (path === "/" || legacy) page = <Home />;
  else if (path === "/products") page = <Products />;
  else if (path === "/bulk") page = <Bulk />;
  else if ((params = matchRoute("/products/:id", path))) page = <ProductEditor key={params.id} id={Number(params.id)} />;
  else if (path === "/swatches") page = <Swatches />;
  else if (path === "/settings") page = <Settings />;
  else if (path === "/help") page = <Help />;
  else {
    page = (
      <s-page heading={t("Page not found")}>
        <s-section>
          <s-paragraph>{t("This page doesn't exist.")}</s-paragraph>
          <s-button onClick={() => void navigate("/")}>{t("Go to home")}</s-button>
        </s-section>
      </s-page>
    );
  }
  return <ErrorBoundary key={path}>{page}</ErrorBoundary>;
}
