/**
 * Text + URL helpers shared by the admin app and the storefront script.
 * Keep this file dependency-free: it is bundled into the storefront asset.
 */

/** Lowercase, strip accents, and collapse separators into single spaces. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words of a normalized string. */
export function tokens(input: string | null | undefined): string[] {
  const n = normalizeText(input);
  return n ? n.split(" ") : [];
}

/**
 * True when `phrase` appears in `text` as a whole-word sequence
 * ("light blue" matches "shirt light blue front", "blue" doesn't match "blueberry").
 */
export function containsPhrase(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  return (" " + text + " ").includes(" " + phrase + " ");
}

const IMAGE_EXT = /(?:\.progressive)?\.(?:jpe?g|png|gif|webp|avif|heic|heif|svg|jxl|tiff?|bmp)(?:\.webp)?$/i;
const SIZE_SUFFIX =
  /_(?:\d+x\d*|\d*x\d+|\{width\}x\d*|pico|icon|thumb|small|compact|medium|large|grande|original|master)(?:_crop_(?:top|center|bottom|left|right))?(?:@\d+x)?$/i;

/** Last path segment of a URL/path, without query or hash, URI-decoded. */
export function fileNameFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  let path = String(url).trim();
  const q = path.search(/[?#]/);
  if (q >= 0) path = path.slice(0, q);
  const slash = path.lastIndexOf("/");
  let name = slash >= 0 ? path.slice(slash + 1) : path;
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep raw */
  }
  return name;
}

/** Filename without extension, lowercased — the key used to match media. */
export function mediaFileKey(url: string | null | undefined): string {
  return fileNameFromUrl(url).replace(IMAGE_EXT, "").toLowerCase();
}

/**
 * Candidate keys for an image URL found in the DOM. Themes often request
 * resized copies (legacy `_800x` suffixes), so we also try the key with one
 * size suffix removed. The raw key always comes first.
 */
export function domImageKeys(url: string | null | undefined): string[] {
  const raw = mediaFileKey(url);
  if (!raw) return [];
  const stripped = raw.replace(SIZE_SUFFIX, "");
  return stripped && stripped !== raw ? [raw, stripped] : [raw];
}

/** First URL of a srcset attribute ("a.jpg 100w, b.jpg 200w" -> "a.jpg"). */
export function firstSrcsetUrl(srcset: string | null | undefined): string {
  if (!srcset) return "";
  const first = srcset.split(",")[0]?.trim() ?? "";
  return first.split(/\s+/)[0] ?? "";
}

/** Every URL of a srcset attribute. */
export function srcsetUrls(srcset: string | null | undefined): string[] {
  if (!srcset) return [];
  return srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

/** Human filename without extension, for display and text matching. */
export function displayFileName(url: string | null | undefined): string {
  return fileNameFromUrl(url).replace(IMAGE_EXT, "");
}
