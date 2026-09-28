-- Preserve the current request status as the first workflow log when a request
-- does not already have a log history.
WITH requestStatuses AS (
  SELECT
    request."id",
    request."organizationId",
    request."requesterId",
    request."updatedAt",
    CASE request."status"::TEXT
      WHEN 'INITIAL_APPROVED' THEN 'REQUEST_APPROVED'
      WHEN 'APPROVED' THEN 'REQUEST_APPROVED'
      WHEN 'PURCHASED' THEN 'RECEIVED_BY_VENDOR'
      ELSE request."status"::TEXT
    END AS "mappedStatus"
  FROM "PurchaseRequest" AS request
)
INSERT INTO "purchaseRequestLogs" (
  "id",
  "organizationId",
  "purchaseRequestId",
  "purchaseStatus",
  "performedBy",
  "performedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  request."organizationId",
  request."id",
  request."mappedStatus"::"PurchaseRequestLogStatus",
  request."requesterId",
  GREATEST(
    request."updatedAt",
    COALESCE(
      (
        SELECT latestLog."performedAt" + INTERVAL '1 millisecond'
        FROM "purchaseRequestLogs" AS latestLog
        WHERE latestLog."purchaseRequestId" = request."id"
        ORDER BY latestLog."performedAt" DESC, latestLog."id" DESC
        LIMIT 1
      ),
      request."updatedAt"
    )
  )
FROM requestStatuses AS request
WHERE COALESCE(
  (
    SELECT CASE latestLog."purchaseStatus"::TEXT
      WHEN 'APPROVED' THEN 'REQUEST_APPROVED'
      ELSE latestLog."purchaseStatus"::TEXT
    END
    FROM "purchaseRequestLogs" AS latestLog
    WHERE latestLog."purchaseRequestId" = request."id"
    ORDER BY latestLog."performedAt" DESC, latestLog."id" DESC
    LIMIT 1
  ),
  ''
) <> request."mappedStatus";

-- The old request-level status and approval flow are being replaced by logs.
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_approverId_fkey";
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_analysisId_fkey";
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_purchaseRequestId_fkey";
DROP TABLE "Approval";
DROP TYPE "ApprovalStatus";
DROP TYPE "ApprovalType";

ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_initialApprovedById_fkey";
DROP INDEX "PurchaseRequest_initialApprovedById_idx";
ALTER TABLE "PurchaseRequest"
  DROP COLUMN "initialApprovedById",
  DROP COLUMN "initialApprovalComment",
  DROP COLUMN "initialApprovedAt",
  DROP COLUMN "status";

-- Rebuild the enum without the removed legacy values, and convert the log
-- column explicitly so the existing log rows are retained.
CREATE TYPE "PurchaseRequestStatus_new" AS ENUM (
  'PENDING_MANAGER_APPROVAL',
  'REQUEST_APPROVED',
  'QUOTE_COLLECTION',
  'AI_ANALYSIS_SUCCESS',
  'AI_ANALYSIS_FAILED',
  'PENDING_FINANCE_APPROVAL',
  'PENDING_CFO_APPROVAL',
  'REJECTED',
  'CFO_APPROVED',
  'RECEIVED_BY_VENDOR'
);

ALTER TABLE "purchaseRequestLogs"
  ALTER COLUMN "purchaseStatus" TYPE "PurchaseRequestStatus_new"
  USING (
    CASE "purchaseStatus"::TEXT
      WHEN 'APPROVED' THEN 'REQUEST_APPROVED'
      ELSE "purchaseStatus"::TEXT
    END
  )::"PurchaseRequestStatus_new";

DROP TYPE "PurchaseRequestLogStatus";
DROP TYPE "PurchaseRequestStatus";
ALTER TYPE "PurchaseRequestStatus_new" RENAME TO "PurchaseRequestStatus";
