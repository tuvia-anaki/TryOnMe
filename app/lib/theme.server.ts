/**
 * Detects whether our app embed is enabled and our product app block is
 * installed on the shop's live (main) theme, by reading theme JSON files
 * through the Admin GraphQL API (requires the read_themes scope).
 *
 * - App embeds live in config/settings_data.json under current.blocks with a
 *   type like "shopify://apps/<app>/blocks/tryon-embed/<uuid>".
 * - Product app blocks live in templates/product.json section blocks with a
 *   type like "shopify://apps/<app>/blocks/tryon-button/<uuid>".
 */

export const APP_EMBED_HANDLE = "tryon-embed";
export const APP_BLOCK_HANDLE = "tryon-button";

export interface ThemeStatus {
  embedEnabled: boolean;
  blockInstalled: boolean;
  themeId: string | null;
}

interface GraphqlClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

const THEME_FILES_QUERY = `#graphql
  query TryOnThemeStatus {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        files(filenames: ["config/settings_data.json", "templates/product.json"], first: 2) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }
`;

export function detectEmbedInSettings(settingsDataJson: string): boolean {
  try {
    const parsed = JSON.parse(stripJsonComments(settingsDataJson));
    const current = parsed?.current;
    if (!current || typeof current !== "object") return false;
    const blocks = current.blocks;
    if (!blocks || typeof blocks !== "object") return false;
    return Object.values(blocks as Record<string, any>).some(
      (block) =>
        typeof block?.type === "string" &&
        block.type.includes(`/blocks/${APP_EMBED_HANDLE}/`) &&
        block.disabled !== true,
    );
  } catch {
    return false;
  }
}

export function detectBlockInProductTemplate(productTemplateJson: string): boolean {
  try {
    const parsed = JSON.parse(stripJsonComments(productTemplateJson));
    const sections = parsed?.sections;
    if (!sections || typeof sections !== "object") return false;
    return Object.values(sections as Record<string, any>).some((section) => {
      const blocks = section?.blocks;
      if (!blocks || typeof blocks !== "object") return false;
      return Object.values(blocks as Record<string, any>).some(
        (block) =>
          typeof block?.type === "string" &&
          block.type.includes(`/blocks/${APP_BLOCK_HANDLE}/`),
      );
    });
  } catch {
    return false;
  }
}

/** Shopify theme JSON files may start with a comment banner. */
function stripJsonComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "");
}

export async function getThemeStatus(admin: GraphqlClient): Promise<ThemeStatus> {
  try {
    const response = await admin.graphql(THEME_FILES_QUERY);
    const body = (await response.json()) as any;
    const theme = body?.data?.themes?.nodes?.[0];
    if (!theme) return { embedEnabled: false, blockInstalled: false, themeId: null };

    let embedEnabled = false;
    let blockInstalled = false;
    for (const file of theme.files?.nodes ?? []) {
      const content: string | undefined = file?.body?.content;
      if (!content) continue;
      if (file.filename === "config/settings_data.json") {
        embedEnabled = detectEmbedInSettings(content);
      } else if (file.filename === "templates/product.json") {
        blockInstalled = detectBlockInProductTemplate(content);
      }
    }
    return { embedEnabled, blockInstalled, themeId: theme.id };
  } catch (error) {
    console.error("Theme status check failed:", error);
    return { embedEnabled: false, blockInstalled: false, themeId: null };
  }
}

/** Official theme-editor deep links. */
export function themeEditorLinks(shopDomain: string) {
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const base = `https://${shopDomain}/admin/themes/current/editor`;
  return {
    enableEmbed: `${base}?context=apps&template=product&activateAppId=${apiKey}/${APP_EMBED_HANDLE}`,
    addBlock: `${base}?template=product&addAppBlockId=${apiKey}/${APP_BLOCK_HANDLE}&target=mainSection`,
    openEditor: base,
  };
}
