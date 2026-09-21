import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PurchaseRequestService } from './purchase-request.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';

@Controller('purchase-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseRequestController {
  constructor(
    private readonly purchaseRequestService: PurchaseRequestService,
  ) {}

  // Only TEAM_LEADER can create purchase requests
  @Post()
  @Roles(Role.TEAM_LEADER)
  createRequest(@Req() req: any, @Body() dto: CreatePurchaseRequestDto) {
    return this.purchaseRequestService.createRequest(
      req.user.organizationId,
      req.user.id,
      dto,
    );
  }

  // MANAGER, PROCUREMENT_OFFICER, FINANCE_OFFICER, CFO can update status
  @Patch(':id/status')
  @Roles(
    Role.MANAGER,
    Role.PROCUREMENT_OFFICER,
    Role.FINANCE_OFFICER,
    Role.CFO,
  )
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseRequestStatusDto,
  ) {
    return this.purchaseRequestService.updateStatus(
      id,
      req.user.organizationId,
      req.user.role,
      dto,
    );
  }

  // Any authenticated org member can view purchase requests
  @Get()
  findAll(@Req() req: any) {
    return this.purchaseRequestService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.purchaseRequestService.findOne(id, req.user.organizationId);
  }
}
