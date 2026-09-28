import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Role } from 'src/generated/prisma/enums';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { ApproveAndRejectPurchaseRequestLogDto } from './dto/createPurchaseRequestLog.dto';
import { PurchaseRequestLogService } from './purchaseRequestLog.service';

type AuthenticatedRequest = Request & {
  user: { id: string; organizationId: string; role: Role };
};

@Controller('purchase-request-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseRequestLogController {
  constructor(
    private readonly purchaseRequestLogService: PurchaseRequestLogService,
  ) {}

  @Post(':purchaseRequestLogId/approveAndReject')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.TEAM_LEADER)
  approveAndReject(
    @Param('purchaseRequestLogId') purchaseRequestLogId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ApproveAndRejectPurchaseRequestLogDto,
  ) {
    return this.purchaseRequestLogService.approveAndReject(
      purchaseRequestLogId,
      req.user,
      dto,
    );
  }
}
