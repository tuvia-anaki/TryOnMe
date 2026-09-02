-- Remember every product reference image sent to the AI for a try-on.
ALTER TABLE "TryOn" ADD COLUMN "productImageUrlsJson" TEXT NOT NULL DEFAULT '[]';
