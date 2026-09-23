import { PurchaseRequestStatus } from 'src/generated/prisma/enums';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideInitialApprovalDto {
  @IsIn([
    PurchaseRequestStatus.INITIAL_APPROVED,
    PurchaseRequestStatus.REJECTED,
  ])
  status: 'INITIAL_APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
