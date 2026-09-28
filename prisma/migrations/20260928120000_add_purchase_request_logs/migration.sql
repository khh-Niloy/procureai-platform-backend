CREATE TYPE "PurchaseRequestLogStatus" AS ENUM (
  'PENDING_MANAGER_APPROVAL',
  'REQUEST_APPROVED',
  'QUOTE_COLLECTION',
  'AI_ANALYSIS_SUCCESS',
  'AI_ANALYSIS_FAILED',
  'PENDING_FINANCE_APPROVAL',
  'PENDING_CFO_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CFO_APPROVED',
  'RECEIVED_BY_VENDOR'
);

ALTER TABLE "PurchaseRequest" ALTER COLUMN "currency" SET DEFAULT 'BDT';

CREATE TABLE "purchaseRequestLogs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "purchaseStatus" "PurchaseRequestLogStatus" NOT NULL,
  "performedBy" TEXT NOT NULL,
  "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "purchaseRequestLogs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchaseRequestLogs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchaseRequestLogs_purchaseRequestId_fkey"
    FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchaseRequestLogs_performedBy_fkey"
    FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "purchaseRequestLogs_organizationId_purchaseRequestId_performedAt_idx"
  ON "purchaseRequestLogs"("organizationId", "purchaseRequestId", "performedAt");
