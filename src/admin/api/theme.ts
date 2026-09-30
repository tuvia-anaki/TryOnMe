import { BLOCK_HANDLES, EMBED_HANDLE, SECTIONS, type SectionHandle } from "../../shared/constants";
import { gql } from "./graphql";

/**
 * The store's themes, and for one theme: is the app embed on, and where are
 * the app's sections placed. Read from the theme's JSON files (read_themes).
 */

export type ThemeRole = "MAIN" | "UNPUBLISHED" | "DEVELOPMENT" | "DEMO" | "ARCHIVED" | "LOCKED";

export interface ThemeInfo {
  id: string;
  name: string;
  role: ThemeRole;
  themeStoreId: number | null;
}

export type EmbedState = "enabled" | "disabled" | "missing";

export interface ThemeStatus {
  theme: ThemeInfo;
  embed: EmbedState | "unknown";
  /** Section handle → templates it's placed on ("index", "product"…). */
  sections: Record<SectionHandle, string[]>;
  /** Other variant or swatch apps switched on in the theme (their app handles). */
  otherVariantApps: string[];
}

const THEMES_QUERY = `#graphql
query Themes {
  themes(first: 50) { nodes { id name role themeStoreId } }
}`;

const THEME_FILES_QUERY = `#graphql
query ThemeFiles($id: ID!) {
  theme(id: $id) {
    id
    name
    role
    themeStoreId
    files(filenames: ["config/settings_data.json", "templates/*.json", "sections/*.json"], first: 250) {
      nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
    }
  }
}`;

const THEME_KEY = "vc:theme";

/** The theme the admin shows status for: the one picked on this computer, else the published one. */
export function preferredTheme(themes: ThemeInfo[] | undefined): ThemeInfo | null {
  if (!themes?.length) return null;
  let id = "";
  try {
    id = localStorage.getItem(THEME_KEY) ?? "";
  } catch {
    /* storage blocked */
  }
  return themes.find((th) => th.id === id) ?? themes.find((th) => th.role === "MAIN") ?? themes[0];
}

export function setPreferredTheme(theme: ThemeInfo): void {
  try {
    if (theme.role === "MAIN") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    /* storage blocked: lasts until reload */
  }
}

export async function listThemes(): Promise<ThemeInfo[]> {
  const data = await gql<{ themes: { nodes: ThemeInfo[] } }>(THEMES_QUERY);
  const order: Record<string, number> = { MAIN: 0, UNPUBLISHED: 1, DEVELOPMENT: 2 };
  return data.themes.nodes
    .filter((t) => t.role !== "DEMO" && t.role !== "ARCHIVED" && t.role !== "LOCKED")
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
}

/** Theme JSON files may start with a comment banner. */
export function parseThemeJson(content: string): any {
  try {
    return JSON.parse(content.replace(/^\s*\/\*[\s\S]*?\*\//, ""));
  } catch {
    return null;
  }
}

/**
 * Block types look like "shopify://apps/<app>/blocks/<block>/<extension id>". <app> is a
 * name Shopify picks (it follows the app's name, not its handle), so the app's own blocks
 * are recognized by their "vc-" block names instead.
 */
function parseBlockType(type: unknown): { app: string; block: string } | null {
  const m = typeof type === "string" ? /^shopify:\/\/apps\/([^/]+)\/blocks\/([^/]+)\//.exec(type) : null;
  return m ? { app: m[1], block: m[2] } : null;
}

export function embedStateFromSettings(settingsData: string): EmbedState {
  const blocks = parseThemeJson(settingsData)?.current?.blocks;
  if (!blocks || typeof blocks !== "object") return "missing";
  let found = false;
  for (const block of Object.values(blocks as Record<string, any>)) {
    if (parseBlockType(block?.type)?.block !== EMBED_HANDLE) continue;
    found = true;
    if (block.disabled !== true) return "enabled";
  }
  return found ? "disabled" : "missing";
}

/**
 * Other apps' embeds that are on and look like variant or swatch apps. Two apps
 * changing the same product cards can show every variant twice. (Variant image
 * apps only change the product page gallery, so they don't count.)
 */
export function otherVariantAppsFromSettings(settingsData: string): string[] {
  const blocks = parseThemeJson(settingsData)?.current?.blocks;
  if (!blocks || typeof blocks !== "object") return [];
  const all = Object.values(blocks as Record<string, any>).map((block) => ({ block, type: parseBlockType(block?.type) }));
  // The name Shopify files this app's own blocks under.
  const own = new Set(all.flatMap(({ type }) => (type && BLOCK_HANDLES.includes(type.block) ? [type.app] : [])));
  const found = new Set<string>();
  for (const { block, type } of all) {
    if (!type || own.has(type.app) || block.disabled === true) continue;
    const name = `${type.app} ${type.block}`;
    if (/variant|swatch/i.test(name) && !/image|gallery|photo/i.test(name)) found.add(type.app);
  }
  return [...found];
}

/** "variants-on-collection" → "Variants on collection". */
export function appNameFromHandle(handle: string): string {
  const words = handle.replace(/-\d+$/, "").split(/[-_]+/).filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Which of the app's sections a template (or section group) file contains. */
export function sectionsInFile(content: string): SectionHandle[] {
  const parsed = parseThemeJson(content);
  const found = new Set<SectionHandle>();
  const byBlock = new Map(SECTIONS.map((s) => [s.block, s.handle]));
  for (const section of Object.values((parsed?.sections ?? {}) as Record<string, any>)) {
    if (section?.disabled === true) continue;
    for (const block of Object.values((section?.blocks ?? {}) as Record<string, any>)) {
      if (block?.disabled === true) continue;
      const handle = byBlock.get(parseBlockType(block?.type)?.block ?? "");
      if (handle) found.add(handle);
    }
  }
  return [...found];
}

export async function loadThemeStatus(themeId: string): Promise<ThemeStatus> {
  const data = await gql<{
    theme: (ThemeInfo & { files: { nodes: { filename: string; body: { content?: string } | null }[] } | null }) | null;
  }>(THEME_FILES_QUERY, { id: themeId });
  const theme = data.theme;
  if (!theme) throw new Error("Theme not found");
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.handle, [] as string[]])) as Record<SectionHandle, string[]>;
  let embed: ThemeStatus["embed"] = "unknown";
  let otherVariantApps: string[] = [];
  for (const file of theme.files?.nodes ?? []) {
    const content = file.body?.content;
    if (!content) continue;
    if (file.filename === "config/settings_data.json") {
      embed = embedStateFromSettings(content);
      otherVariantApps = otherVariantAppsFromSettings(content);
      continue;
    }
    const where = file.filename.replace(/^(templates|sections)\//, "").replace(/\.json$/, "");
    for (const handle of sectionsInFile(content)) sections[handle].push(where);
  }
  return { theme: { id: theme.id, name: theme.name, role: theme.role, themeStoreId: theme.themeStoreId }, embed, sections, otherVariantApps };
}

const numericId = (gid: string) => gid.split("/").pop() ?? gid;

function editorUrl(shopDomain: string, themeId: string, params: Record<string, string>): string {
  return `https://${shopDomain}/admin/themes/${numericId(themeId)}/editor?${new URLSearchParams(params).toString()}`;
}

/** Opens the theme editor with the app embed switched on (the merchant presses Save). */
export function enableEmbedUrl(shopDomain: string, themeId: string, apiKey: string): string {
  return editorUrl(shopDomain, themeId, { context: "apps", template: "collection", activateAppId: `${apiKey}/${EMBED_HANDLE}` });
}

/** Opens the theme editor with one of the app's sections added to a template. */
export function addSectionUrl(shopDomain: string, themeId: string, apiKey: string, handle: SectionHandle, template: string): string {
  const block = SECTIONS.find((s) => s.handle === handle)?.block ?? handle;
  return editorUrl(shopDomain, themeId, { template, addAppBlockId: `${apiKey}/${block}`, target: "newAppsSection" });
}

export function themeEditorUrl(shopDomain: string, themeId: string, template = "collection"): string {
  return editorUrl(shopDomain, themeId, { template });
}

/** Opens the theme editor's App embeds list. */
export function appEmbedsUrl(shopDomain: string, themeId: string): string {
  return editorUrl(shopDomain, themeId, { context: "apps", template: "collection" });
}
