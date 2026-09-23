-- Quotation submissions are tied to their purchase request and their generated
-- PDFs are tracked as private documents.
CREATE TYPE "DocumentType" AS ENUM ('QUOTE');
CREATE TYPE "DocumentStatus" AS ENUM ('PROCESSING', 'DONE', 'FAILED');

ALTER TABLE "Quote"
  ADD COLUMN "purchaseRequestId" TEXT,
  ADD COLUMN "subtotal" DECIMAL(65,30),
  ADD COLUMN "discount" DECIMAL(65,30),
  ADD COLUMN "tax" DECIMAL(65,30),
  ADD COLUMN "shippingCost" DECIMAL(65,30),
  ADD COLUMN "deliveryTerms" TEXT,
  ADD COLUMN "validityDays" INTEGER;

ALTER TABLE "Document"
  ADD COLUMN "type" "DocumentType" NOT NULL DEFAULT 'QUOTE',
  ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'PROCESSING',
  ADD COLUMN "failureReason" TEXT;

ALTER TABLE "Document" ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "Document"
  DROP COLUMN "extractedText",
  DROP COLUMN "extractedData",
  DROP COLUMN "processingStatus";

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Quote_vendorId_idx" ON "Quote"("vendorId");
CREATE INDEX "Quote_purchaseRequestId_idx" ON "Quote"("purchaseRequestId");
CREATE INDEX "Document_organizationId_idx" ON "Document"("organizationId");
CREATE INDEX "Document_quoteId_idx" ON "Document"("quoteId");
