CREATE TYPE "PaymentProvider" AS ENUM ('ASAAS', 'HOTMART');

ALTER TABLE "CustomerIdentity" ALTER COLUMN "asaasId" DROP NOT NULL;
ALTER TABLE "ResourceOrigin" ALTER COLUMN "asaasLinkId" DROP NOT NULL;
ALTER TABLE "ResourceOrigin" ADD COLUMN "hotmartProductId" TEXT;
CREATE UNIQUE INDEX "ResourceOrigin_hotmartProductId_key" ON "ResourceOrigin"("hotmartProductId");

ALTER TABLE "Subscription" ALTER COLUMN "asaasId" DROP NOT NULL;
ALTER TABLE "Subscription" ADD COLUMN "hotmartSubscriberCode" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "hotmartSubscriptionId" TEXT;
CREATE UNIQUE INDEX "Subscription_hotmartSubscriberCode_key" ON "Subscription"("hotmartSubscriberCode");
CREATE UNIQUE INDEX "Subscription_hotmartSubscriptionId_key" ON "Subscription"("hotmartSubscriptionId");

ALTER TABLE "Payment" ALTER COLUMN "asaasId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'ASAAS';
ALTER TABLE "Payment" ADD COLUMN "hotmartTransactionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BRL';
CREATE UNIQUE INDEX "Payment_hotmartTransactionId_key" ON "Payment"("hotmartTransactionId");
