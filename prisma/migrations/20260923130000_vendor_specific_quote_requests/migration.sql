DROP INDEX "VendorQuoteRequest_purchaseRequestId_organizationId_key";

ALTER TABLE "VendorQuoteRequest" ADD COLUMN "vendorId" TEXT;

UPDATE "VendorQuoteRequest" AS request
SET "vendorId" = (
    SELECT vendor."id"
    FROM "Vendor" AS vendor
    WHERE vendor."organizationId" = request."organizationId"
    ORDER BY vendor."id"
    LIMIT 1
);

DELETE FROM "VendorQuoteRequest" WHERE "vendorId" IS NULL;

UPDATE "VendorQuoteRequest" AS request
SET "vendorQuoteRequest" = CASE
    WHEN EXISTS (
        SELECT 1
        FROM "Quote" AS quote
        WHERE quote."purchaseRequestId" = request."purchaseRequestId"
          AND quote."vendorId" = request."vendorId"
    ) THEN 'QOUTE_SUBMITTED'::"VendorQuoteRequestStatus"
    ELSE 'PENDING'::"VendorQuoteRequestStatus"
END;

INSERT INTO "VendorQuoteRequest" (
    "id",
    "requesterId",
    "purchaseRequestId",
    "organizationId",
    "vendorId",
    "vendorQuoteRequest",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    request."requesterId",
    request."purchaseRequestId",
    request."organizationId",
    vendor."id",
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM "Quote" AS quote
            WHERE quote."purchaseRequestId" = request."purchaseRequestId"
              AND quote."vendorId" = vendor."id"
        ) THEN 'QOUTE_SUBMITTED'::"VendorQuoteRequestStatus"
        ELSE 'PENDING'::"VendorQuoteRequestStatus"
    END,
    request."createdAt",
    request."updatedAt"
FROM "VendorQuoteRequest" AS request
JOIN "Vendor" AS vendor
  ON vendor."organizationId" = request."organizationId"
WHERE vendor."id" <> request."vendorId";

ALTER TABLE "VendorQuoteRequest" ALTER COLUMN "vendorId" SET NOT NULL;

CREATE UNIQUE INDEX "VendorQuoteRequest_purchaseRequestId_vendorId_key"
ON "VendorQuoteRequest"("purchaseRequestId", "vendorId");

CREATE INDEX "VendorQuoteRequest_vendorId_createdAt_idx"
ON "VendorQuoteRequest"("vendorId", "createdAt");

ALTER TABLE "VendorQuoteRequest"
ADD CONSTRAINT "VendorQuoteRequest_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
