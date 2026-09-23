import { IsEnum, IsNotEmpty } from 'class-validator';
import { PurchaseRequestStatus } from 'src/generated/prisma/enums';

export class UpdatePurchaseRequestStatusDto {
  @IsEnum(PurchaseRequestStatus)
  @IsNotEmpty()
  status: PurchaseRequestStatus;
}
