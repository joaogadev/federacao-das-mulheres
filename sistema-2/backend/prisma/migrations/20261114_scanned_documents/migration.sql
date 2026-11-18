CREATE TABLE "ScannedDocument" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "ocrText" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScannedDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScannedDocument_createdAt_idx" ON "ScannedDocument"("createdAt");
CREATE INDEX "ScannedDocument_uploadedById_createdAt_idx" ON "ScannedDocument"("uploadedById", "createdAt");
ALTER TABLE "ScannedDocument" ADD CONSTRAINT "ScannedDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
