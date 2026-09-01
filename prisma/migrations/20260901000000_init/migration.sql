-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "installed" BOOLEAN NOT NULL DEFAULT true,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProviderCredential" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shopId" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "quality" TEXT NOT NULL DEFAULT 'medium',
    "visitorDailyLimit" INTEGER NOT NULL DEFAULT 3,
    "shopDailyLimit" INTEGER NOT NULL DEFAULT 500,
    "productAvailabilityMode" TEXT NOT NULL DEFAULT 'all',
    "productSelectionJson" TEXT NOT NULL DEFAULT '[]',
    "retentionDays" INTEGER NOT NULL DEFAULT 90,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "WidgetSettings" (
    "shopId" TEXT NOT NULL,
    "buttonText" TEXT NOT NULL DEFAULT 'Try It On',
    "buttonStyle" TEXT NOT NULL DEFAULT 'solid',
    "backgroundColor" TEXT NOT NULL DEFAULT '#111111',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "borderRadius" INTEGER NOT NULL DEFAULT 10,
    "fullWidth" BOOLEAN NOT NULL DEFAULT false,
    "iconEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hoverAnimation" TEXT NOT NULL DEFAULT 'none',
    "buttonSize" TEXT NOT NULL DEFAULT 'medium',
    "modalTitle" TEXT NOT NULL DEFAULT 'Try It On',
    "modalSubtitle" TEXT NOT NULL DEFAULT 'See how it looks on you',
    "modalBackgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "modalTextColor" TEXT NOT NULL DEFAULT '#111111',
    "modalAccentColor" TEXT NOT NULL DEFAULT '#111111',
    "modalBorderRadius" INTEGER NOT NULL DEFAULT 18,

    CONSTRAINT "WidgetSettings_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "visitorId" TEXT,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "triedOn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "anonymousTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorPhoto" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TryOn" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "visitorPhotoId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "productTitle" TEXT NOT NULL,
    "productImageUrl" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "generatedImageStorageKey" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TryOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TryOnFeedback" (
    "id" TEXT NOT NULL,
    "tryOnId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TryOnFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "visitorId" TEXT,
    "tryOnId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "AIProviderCredential_shopId_provider_key" ON "AIProviderCredential"("shopId", "provider");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_shopId_type_createdAt_idx" ON "AnalyticsEvent"("shopId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_shopId_anonymousTokenHash_key" ON "Visitor"("shopId", "anonymousTokenHash");

-- CreateIndex
CREATE INDEX "TryOn_shopId_createdAt_idx" ON "TryOn"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "TryOn_visitorId_createdAt_idx" ON "TryOn"("visitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TryOnFeedback_tryOnId_key" ON "TryOnFeedback"("tryOnId");

-- CreateIndex
CREATE INDEX "UsageEvent_shopId_createdAt_idx" ON "UsageEvent"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "AIProviderCredential" ADD CONSTRAINT "AIProviderCredential_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WidgetSettings" ADD CONSTRAINT "WidgetSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorPhoto" ADD CONSTRAINT "VisitorPhoto_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_visitorPhotoId_fkey" FOREIGN KEY ("visitorPhotoId") REFERENCES "VisitorPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOnFeedback" ADD CONSTRAINT "TryOnFeedback_tryOnId_fkey" FOREIGN KEY ("tryOnId") REFERENCES "TryOn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

