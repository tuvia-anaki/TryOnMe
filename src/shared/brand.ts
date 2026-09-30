/** Change the app's name in one place (also update shopify.app.toml and the extension locales). */
export const APP_NAME = "Variant Cards";
/** Optional support email shown on the Help page (set VITE_SUPPORT_EMAIL at build time). */
export const SUPPORT_EMAIL: string = (import.meta as any).env?.VITE_SUPPORT_EMAIL ?? "";
