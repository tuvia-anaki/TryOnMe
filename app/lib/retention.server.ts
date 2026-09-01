import prisma from "../db.server";
import { storage } from "./storage.server";

/**
 * Retention sweeper: deletes shopper photos and try-on results older than the
 * shop's retention window, including stored assets. Runs opportunistically
 * (at most once per hour per process) — no external cron needed for the MVP.
 * Point a real scheduler at `runRetentionSweep()` in production if preferred.
 */

let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export function maybeRunRetentionSweep() {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  runRetentionSweep().catch((error) =>
    console.error("Retention sweep failed:", (error as Error)?.message),
  );
}

export async function runRetentionSweep() {
  const shops = await prisma.shop.findMany({ include: { settings: true } });
  for (const shop of shops) {
    const days = shop.settings?.retentionDays ?? 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [oldPhotos, oldTryOns] = await Promise.all([
      prisma.visitorPhoto.findMany({
        where: { visitor: { shopId: shop.id }, createdAt: { lt: cutoff } },
      }),
      prisma.tryOn.findMany({
        where: { shopId: shop.id, createdAt: { lt: cutoff } },
      }),
    ]);
    if (!oldPhotos.length && !oldTryOns.length) continue;

    const keys = [
      ...oldPhotos.map((p) => p.storageKey),
      ...oldTryOns
        .map((t) => t.generatedImageStorageKey)
        .filter((k): k is string => Boolean(k)),
    ];
    await Promise.allSettled(keys.map((key) => storage().delete(key)));

    // TryOns cascade-delete when their photo goes; delete both explicitly
    // to cover try-ons whose photo is newer than the cutoff.
    await prisma.tryOn.deleteMany({
      where: { id: { in: oldTryOns.map((t) => t.id) } },
    });
    await prisma.visitorPhoto.deleteMany({
      where: { id: { in: oldPhotos.map((p) => p.id) } },
    });
  }
}
