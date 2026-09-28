import { IsIn, IsOptional, IsString } from 'class-validator';

export const purchaseRequestLogActions = [
  'approve',
  'reject',
  'quote',
  'received',
] as const;

export type PurchaseRequestLogAction =
  (typeof purchaseRequestLogActions)[number];

export class ApproveAndRejectPurchaseRequestLogDto {
  @IsString()
  purchaseRequestId: string;

  @IsString()
  organizationId: string;

  @IsIn(purchaseRequestLogActions)
  type: PurchaseRequestLogAction;

  @IsOptional()
  @IsString()
  note?: string;

}

export const purchaseRequestLogStatuses = [
  'PENDING_MANAGER_APPROVAL',
  'REQUEST_APPROVED',
  'QUOTE_COLLECTION',
  'AI_ANALYSIS_SUCCESS',
  'AI_ANALYSIS_FAILED',
  'PENDING_FINANCE_APPROVAL',
  'PENDING_CFO_APPROVAL',
  'REJECTED',
  'CFO_APPROVED',
  'RECEIVED_BY_VENDOR',
] as const;

export class CreatePurchaseRequestLogDto {
  @IsString()
  organizationId: string;

  @IsString()
  purchaseRequestId: string;

  @IsIn(purchaseRequestLogStatuses)
  purchaseStatus: (typeof purchaseRequestLogStatuses)[number];

  @IsString()
  performedBy: string;

  @IsOptional()
  @IsString()
  note?: string;

  performedAt?: Date;
}
