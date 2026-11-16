CREATE TYPE "DocumentStatus" AS ENUM ('PENDENTE', 'CONFERIDO', 'DIVERGENTE');

CREATE TABLE "DocumentRecord" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "subjectIdentifier" TEXT,
    "issueDate" DATE,
    "notes" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDENTE',
    "reviewNote" TEXT,
    "uploadedById" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "DocumentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentRecord_status_createdAt_idx" ON "DocumentRecord"("status", "createdAt");
CREATE INDEX "DocumentRecord_subjectName_idx" ON "DocumentRecord"("subjectName");
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
