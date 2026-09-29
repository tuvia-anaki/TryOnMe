import type { ImageSignature } from "../../shared/autoassign";
import { rgbToLab } from "../../shared/colors";

/**
 * In-browser image fingerprints for visual matching. Images come from
 * Shopify's CDN (CORS-enabled) at a tiny size, are drawn on a canvas and
 * reduced to a CIELAB color histogram + dominant colors of the foreground.
 * Runs on the merchant's computer: free, private, no AI service involved.
 */

const SIZE = 48;
const L_BINS = 4;
const A_BINS = 6;
const B_BINS = 6;

function sized(url: string): string {
  if (url.startsWith("data:")) return url;
  try {
    const u = new URL(url, window.location.href);
    if (/cdn\.shopify\.com|\/cdn\/shop\//.test(u.href)) u.searchParams.set("width", "128");
    return u.toString();
  } catch {
    return url;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = sized(url);
  });
}

function binOf(lab: [number, number, number]): number {
  const l = Math.min(L_BINS - 1, Math.max(0, Math.floor((lab[0] / 100) * L_BINS)));
  const a = Math.min(A_BINS - 1, Math.max(0, Math.floor(((lab[1] + 80) / 160) * A_BINS)));
  const b = Math.min(B_BINS - 1, Math.max(0, Math.floor(((lab[2] + 80) / 160) * B_BINS)));
  return (l * A_BINS + a) * B_BINS + b;
}

function kmeans(points: [number, number, number][], k: number): { lab: [number, number, number]; weight: number }[] {
  if (!points.length) return [];
  const step = Math.max(1, Math.floor(points.length / k));
  let centers = Array.from({ length: k }, (_, i) => [...points[Math.min(points.length - 1, i * step)]] as [number, number, number]);
  let assignment = new Array(points.length).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    assignment = points.map((p) => {
      let best = 0;
      let bestDist = Infinity;
      centers.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    });
    centers = centers.map((c, i) => {
      const members = points.filter((_, j) => assignment[j] === i);
      if (!members.length) return c;
      const sum = members.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
      return [sum[0] / members.length, sum[1] / members.length, sum[2] / members.length] as [number, number, number];
    });
  }
  const counts = new Array(k).fill(0);
  assignment.forEach((i) => counts[i]++);
  return centers
    .map((lab, i) => ({ lab, weight: counts[i] / points.length }))
    .filter((c) => c.weight > 0.02)
    .sort((a, b) => b.weight - a.weight);
}

export async function computeSignature(url: string): Promise<ImageSignature> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  const labs: [number, number, number][] = [];
  const border: [number, number, number][] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (data[i + 3] < 128) {
        labs.push([100, 0, 0]);
        continue;
      }
      const lab = rgbToLab([data[i], data[i + 1], data[i + 2]]);
      labs.push(lab);
      if (x < 2 || y < 2 || x >= SIZE - 2 || y >= SIZE - 2) border.push(lab);
    }
  }

  // Studio shots have a flat background: drop pixels close to it.
  const mean = border.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]).map((v) => v / border.length);
  const spread = Math.sqrt(border.reduce((acc, p) => acc + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2, 0) / border.length);
  let foreground = labs;
  if (spread < 12) {
    const kept = labs.filter((p) => Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]) > 14);
    if (kept.length > labs.length * 0.05) foreground = kept;
  }

  const hist = new Array(L_BINS * A_BINS * B_BINS).fill(0);
  for (const lab of foreground) hist[binOf(lab)] += 1;
  const total = foreground.length || 1;
  for (let i = 0; i < hist.length; i++) hist[i] /= total;

  const sample = foreground.filter((_, i) => i % 2 === 0);
  return { hist, colors: kmeans(sample, 3) };
}

/** Compute signatures for many images with limited parallelism. Failures are skipped. */
export async function computeSignatures(
  items: { id: number; url: string | null }[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<Map<number, ImageSignature>> {
  const result = new Map<number, ImageSignature>();
  const queue = items.filter((item) => item.url);
  let done = 0;
  async function worker() {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      try {
        result.set(item.id, await computeSignature(item.url!));
      } catch {
        /* skip unreadable images */
      }
      done += 1;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
  return result;
}
