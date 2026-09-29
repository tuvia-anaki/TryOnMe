/** Change the app's name in one place (also update shopify.app.toml and the extension locale). */
export const APP_NAME = "Prism Variant Images";
export const APP_SHORT_NAME = "Prism";
/** Optional support email shown in the Help page (set VITE_SUPPORT_EMAIL at build time). */
export const SUPPORT_EMAIL: string = (import.meta as any).env?.VITE_SUPPORT_EMAIL ?? "";
