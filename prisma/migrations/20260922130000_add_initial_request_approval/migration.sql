ALTER TYPE "PurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'INITIAL_APPROVED';

ALTER TABLE "PurchaseRequest"
  ADD COLUMN "initialApprovedById" TEXT,
  ADD COLUMN "initialApprovalComment" TEXT,
  ADD COLUMN "initialApprovedAt" TIMESTAMP(3);

CREATE INDEX "PurchaseRequest_initialApprovedById_idx"
  ON "PurchaseRequest"("initialApprovedById");

ALTER TABLE "PurchaseRequest"
  ADD CONSTRAINT "PurchaseRequest_initialApprovedById_fkey"
  FOREIGN KEY ("initialApprovedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
