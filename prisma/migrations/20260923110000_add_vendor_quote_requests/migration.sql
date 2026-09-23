CREATE TYPE "VendorQuoteRequestStatus" AS ENUM ('PENDING', 'QOUTE_SUBMITTED');

CREATE TABLE "VendorQuoteRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorQuoteRequest" "VendorQuoteRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorQuoteRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorQuoteRequest_purchaseRequestId_organizationId_key"
ON "VendorQuoteRequest"("purchaseRequestId", "organizationId");

CREATE INDEX "VendorQuoteRequest_organizationId_createdAt_idx"
ON "VendorQuoteRequest"("organizationId", "createdAt");

ALTER TABLE "VendorQuoteRequest"
ADD CONSTRAINT "VendorQuoteRequest_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorQuoteRequest"
ADD CONSTRAINT "VendorQuoteRequest_purchaseRequestId_fkey"
FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorQuoteRequest"
ADD CONSTRAINT "VendorQuoteRequest_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
