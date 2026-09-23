import { ApprovalStatus } from 'src/generated/prisma/enums';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideApprovalDto {
  @IsEnum(ApprovalStatus)
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
