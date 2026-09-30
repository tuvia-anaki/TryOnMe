import { EMBED_HANDLE, SECTIONS, type SectionHandle } from "../../shared/constants";
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

/** Block types look like "shopify://apps/<app handle>/blocks/<block>/<extension uid>". */
function blockMatcher(appHandle: string, block: string): (type: unknown) => boolean {
  return (type) => typeof type === "string" && type.startsWith(`shopify://apps/${appHandle}/blocks/${block}/`);
}

export function embedStateFromSettings(settingsData: string, appHandle: string): EmbedState {
  const blocks = parseThemeJson(settingsData)?.current?.blocks;
  if (!blocks || typeof blocks !== "object") return "missing";
  const isEmbed = blockMatcher(appHandle, EMBED_HANDLE);
  let found = false;
  for (const block of Object.values(blocks as Record<string, any>)) {
    if (!isEmbed(block?.type)) continue;
    found = true;
    if (block.disabled !== true) return "enabled";
  }
  return found ? "disabled" : "missing";
}

/** Which of the app's sections a template (or section group) file contains. */
export function sectionsInFile(content: string, appHandle: string): SectionHandle[] {
  const parsed = parseThemeJson(content);
  const found = new Set<SectionHandle>();
  const matchers = SECTIONS.map((s) => [s.handle, blockMatcher(appHandle, s.handle)] as const);
  for (const section of Object.values((parsed?.sections ?? {}) as Record<string, any>)) {
    if (section?.disabled === true) continue;
    for (const block of Object.values((section?.blocks ?? {}) as Record<string, any>)) {
      if (block?.disabled === true) continue;
      for (const [handle, matches] of matchers) if (matches(block?.type)) found.add(handle);
    }
  }
  return [...found];
}

export async function loadThemeStatus(themeId: string, appHandle: string): Promise<ThemeStatus> {
  const data = await gql<{
    theme: (ThemeInfo & { files: { nodes: { filename: string; body: { content?: string } | null }[] } | null }) | null;
  }>(THEME_FILES_QUERY, { id: themeId });
  const theme = data.theme;
  if (!theme) throw new Error("Theme not found");
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.handle, [] as string[]])) as Record<SectionHandle, string[]>;
  let embed: ThemeStatus["embed"] = "unknown";
  for (const file of theme.files?.nodes ?? []) {
    const content = file.body?.content;
    if (!content) continue;
    if (file.filename === "config/settings_data.json") {
      embed = embedStateFromSettings(content, appHandle);
      continue;
    }
    const where = file.filename.replace(/^(templates|sections)\//, "").replace(/\.json$/, "");
    for (const handle of sectionsInFile(content, appHandle)) sections[handle].push(where);
  }
  return { theme: { id: theme.id, name: theme.name, role: theme.role, themeStoreId: theme.themeStoreId }, embed, sections };
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
  return editorUrl(shopDomain, themeId, { template, addAppBlockId: `${apiKey}/${handle}`, target: "newAppsSection" });
}

export function themeEditorUrl(shopDomain: string, themeId: string, template = "collection"): string {
  return editorUrl(shopDomain, themeId, { template });
}
