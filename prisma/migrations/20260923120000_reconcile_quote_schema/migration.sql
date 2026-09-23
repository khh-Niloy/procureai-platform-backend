CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "specifications" JSONB,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Quote" DROP CONSTRAINT "Quote_purchaseRequestId_fkey";
ALTER TABLE "Quote"
ADD CONSTRAINT "Quote_purchaseRequestId_fkey"
FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteItem"
ADD CONSTRAINT "QuoteItem_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
