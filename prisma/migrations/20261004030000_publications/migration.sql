-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('IMAGE', 'CAROUSEL', 'REEL');
CREATE TYPE "PublicationStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELED');
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "mediaType" "PublicationType" NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "containerId" TEXT,
    "igMediaId" TEXT,
    "permalink" TEXT,
    "publishedAt" TIMESTAMP(3),
    "automationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicationMedia" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "kind" "MediaKind" NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Publication_workspaceId_scheduledAt_idx" ON "Publication"("workspaceId", "scheduledAt");
CREATE INDEX "Publication_status_scheduledAt_idx" ON "Publication"("status", "scheduledAt");
CREATE INDEX "PublicationMedia_publicationId_position_idx" ON "PublicationMedia"("publicationId", "position");
CREATE INDEX "PublicationMedia_workspaceId_idx" ON "PublicationMedia"("workspaceId");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicationMedia" ADD CONSTRAINT "PublicationMedia_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
