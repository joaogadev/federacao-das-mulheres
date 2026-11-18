CREATE TYPE "MembershipSource" AS ENUM ('ASAAS', 'MANUAL', 'MISTA');

ALTER TABLE "Membership"
  ADD COLUMN "source" "MembershipSource" NOT NULL DEFAULT 'ASAAS';

CREATE TABLE "ManualMonth" (
  "id" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "competence" TEXT NOT NULL,
  "paid" BOOLEAN NOT NULL,
  "amountCents" INTEGER,
  "paidAt" DATE,
  "note" TEXT,
  "verifiedById" UUID NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualMonth_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManualMonth_membershipId_competence_key" ON "ManualMonth"("membershipId", "competence");
ALTER TABLE "ManualMonth" ADD CONSTRAINT "ManualMonth_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualMonth" ADD CONSTRAINT "ManualMonth_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
