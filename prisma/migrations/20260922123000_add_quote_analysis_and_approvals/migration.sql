ALTER TYPE "PurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'CFO_APPROVED';
CREATE TYPE "ApprovalType" AS ENUM ('MANAGER', 'FINANCE', 'CFO');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "QuoteAnalysis" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "selectedQuoteIds" JSONB NOT NULL,
    "result" JSONB,
    "hardRuleResults" JSONB,
    "recommendedQuoteId" TEXT,
    "failureReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Approval_analysisId_type_key" ON "Approval"("analysisId", "type");
CREATE INDEX "QuoteAnalysis_purchaseRequestId_createdAt_idx" ON "QuoteAnalysis"("purchaseRequestId", "createdAt");
CREATE INDEX "QuoteAnalysis_status_idx" ON "QuoteAnalysis"("status");
CREATE INDEX "Approval_purchaseRequestId_status_idx" ON "Approval"("purchaseRequestId", "status");
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");

ALTER TABLE "QuoteAnalysis"
  ADD CONSTRAINT "QuoteAnalysis_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "QuoteAnalysis_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Approval"
  ADD CONSTRAINT "Approval_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Approval_analysisId_fkey"
  FOREIGN KEY ("analysisId") REFERENCES "QuoteAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Approval_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
