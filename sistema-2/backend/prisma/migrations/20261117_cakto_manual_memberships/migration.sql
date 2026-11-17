CREATE TYPE "MembershipSource" AS ENUM ('ASAAS', 'CAKTO', 'MANUAL', 'MISTA');

ALTER TABLE "Membership"
  ADD COLUMN "source" "MembershipSource" NOT NULL DEFAULT 'ASAAS',
  ADD COLUMN "caktoSubscriptionId" TEXT,
  ADD COLUMN "caktoSubscriptionStatus" TEXT;

CREATE UNIQUE INDEX "Membership_caktoSubscriptionId_key" ON "Membership"("caktoSubscriptionId");

CREATE TABLE "CaktoOrder" (
  "id" UUID NOT NULL,
  "orderId" TEXT NOT NULL,
  "membershipId" UUID NOT NULL,
  "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "competence" TEXT,
  "paidAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CaktoOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaktoOrder_orderId_key" ON "CaktoOrder"("orderId");
CREATE INDEX "CaktoOrder_membershipId_paidAt_idx" ON "CaktoOrder"("membershipId", "paidAt");
ALTER TABLE "CaktoOrder" ADD CONSTRAINT "CaktoOrder_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
