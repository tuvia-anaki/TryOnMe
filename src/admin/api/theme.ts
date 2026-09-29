import { gql } from "./graphql";

/**
 * Reads the live theme's JSON config to tell whether our app embed is on,
 * and to spot theme features that fight with variant images.
 */

export const EMBED_HANDLE = "variant-images-embed";

export type EmbedState = "enabled" | "disabled" | "missing";

export interface ThemeStatus {
  themeId: string | null;
  themeName: string | null;
  themeStoreId: number | null;
  embed: EmbedState | "unknown";
  /** Theme settings that duplicate/conflict with the app. */
  conflicts: ThemeConflict[];
}

export interface ThemeConflict {
  id: "hide-variant-media";
  section: string;
}

const THEME_QUERY = `#graphql
query MainTheme {
  themes(first: 1, roles: [MAIN]) {
    nodes {
      id
      name
      themeStoreId
      files(filenames: ["config/settings_data.json", "templates/product.json"], first: 2) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }
}`;

/** Theme JSON files may start with a comment banner. */
export function parseThemeJson(content: string): any {
  try {
    return JSON.parse(content.replace(/^\s*\/\*[\s\S]*?\*\//, ""));
  } catch {
    return null;
  }
}

export function embedStateFromSettings(settingsData: string, handle = EMBED_HANDLE): EmbedState {
  const parsed = parseThemeJson(settingsData);
  const blocks = parsed?.current?.blocks;
  if (!blocks || typeof blocks !== "object") return "missing";
  let found = false;
  for (const block of Object.values(blocks as Record<string, any>)) {
    if (typeof block?.type !== "string" || !block.type.includes(`/blocks/${handle}/`)) continue;
    found = true;
    if (block.disabled !== true) return "enabled";
  }
  return found ? "disabled" : "missing";
}

/**
 * Theme options that already filter media by variant: Dawn family
 * (`hide_variants`) and similar settings in other themes (media grouping,
 * variant image sets, multiple variant media…). Matched by setting name.
 */
const CONFLICT_SETTING =
  /^(hide_variants|hide_variant_media|only_show_variant_media|show_only_variant_media|enable_variant_group_images|variant_group_images|enable_media_grouping|media_grouping|group_media|group_images|variant_image_grouping|enable_variant_image_grouping|enable_multiple_variant_media|multiple_variant_media|image_sets|enable_image_sets|filter_variant_media)$/;

export function conflictsFromProductTemplate(template: string): ThemeConflict[] {
  const parsed = parseThemeJson(template);
  const sections = parsed?.sections;
  if (!sections || typeof sections !== "object") return [];
  const conflicts: ThemeConflict[] = [];
  const check = (settings: Record<string, unknown> | undefined, where: string) => {
    for (const [name, value] of Object.entries(settings ?? {})) {
      if (value === true && CONFLICT_SETTING.test(name)) {
        conflicts.push({ id: "hide-variant-media", section: where });
        return;
      }
    }
  };
  for (const [key, section] of Object.entries(sections as Record<string, any>)) {
    const where = String(section?.type ?? key);
    check(section?.settings, where);
    // Horizon-style themes keep media settings on blocks.
    for (const block of Object.values((section?.blocks ?? {}) as Record<string, any>)) check(block?.settings, where);
  }
  return conflicts;
}

export async function loadThemeStatus(): Promise<ThemeStatus> {
  const data = await gql<{
    themes: {
      nodes: {
        id: string;
        name: string;
        themeStoreId: number | null;
        files: { nodes: { filename: string; body: { content?: string } | null }[] } | null;
      }[];
    };
  }>(THEME_QUERY);
  const theme = data.themes.nodes[0];
  if (!theme) return { themeId: null, themeName: null, themeStoreId: null, embed: "unknown", conflicts: [] };
  let embed: ThemeStatus["embed"] = "unknown";
  let conflicts: ThemeConflict[] = [];
  for (const file of theme.files?.nodes ?? []) {
    const content = file.body?.content;
    if (!content) continue;
    if (file.filename === "config/settings_data.json") embed = embedStateFromSettings(content);
    if (file.filename === "templates/product.json") conflicts = conflictsFromProductTemplate(content);
  }
  return { themeId: theme.id, themeName: theme.name, themeStoreId: theme.themeStoreId, embed, conflicts };
}

export function themeEditorUrl(shopDomain: string, apiKey: string, template = "product"): string {
  const params = new URLSearchParams({ context: "apps", template, activateAppId: `${apiKey}/${EMBED_HANDLE}` });
  return `https://${shopDomain}/admin/themes/current/editor?${params.toString()}`;
}
