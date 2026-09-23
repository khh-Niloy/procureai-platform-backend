import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PurchaseRequestService } from './purchase-request.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { PurchaseRequestStatus, Role } from 'src/generated/prisma/enums';
import { AnalyzeQuotesDto } from './dto/analyze-quotes.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { DecideInitialApprovalDto } from './dto/decide-initial-approval.dto';
import { Request } from 'express';

type AuthenticatedRequest = Request & {
  user: { id: string; organizationId: string; role: Role };
};

@Controller('purchase-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseRequestController {
  constructor(
    private readonly purchaseRequestService: PurchaseRequestService,
  ) {}

  // Only TEAM_LEADER can create purchase requests
  @Post()
  @Roles(Role.TEAM_LEADER)
  createRequest(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePurchaseRequestDto,
  ) {
    return this.purchaseRequestService.createRequest(
      req.user.organizationId,
      req.user.id,
      dto,
    );
  }

  @Get('pending-initial-approval')
  @Roles(Role.MANAGER)
  findPendingInitialApprovals(@Req() req: AuthenticatedRequest) {
    return this.purchaseRequestService.findByStatus(
      req.user.organizationId,
      PurchaseRequestStatus.PENDING_MANAGER_APPROVAL,
    );
  }

  @Get('pending-quote-collection')
  @Roles(Role.PROCUREMENT_OFFICER)
  findPendingQuoteCollection(@Req() req: AuthenticatedRequest) {
    return this.purchaseRequestService.findByStatus(
      req.user.organizationId,
      PurchaseRequestStatus.INITIAL_APPROVED,
    );
  }

  @Get('quote-collection')
  @Roles(Role.PROCUREMENT_OFFICER)
  findQuoteCollectionRequests(@Req() req: AuthenticatedRequest) {
    return this.purchaseRequestService.findByStatus(
      req.user.organizationId,
      PurchaseRequestStatus.QUOTE_COLLECTION,
    );
  }

  @Post(':id/initial-approval')
  @Roles(Role.MANAGER)
  decideInitialApproval(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: DecideInitialApprovalDto,
  ) {
    return this.purchaseRequestService.decideInitialApproval(
      id,
      req.user.organizationId,
      req.user.id,
      dto.status,
      dto.comment,
    );
  }

  @Post(':id/start-quote-collection')
  @Roles(Role.PROCUREMENT_OFFICER)
  startQuoteCollection(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.purchaseRequestService.startQuoteCollection(
      id,
      req.user.organizationId,
      req.user.id,
    );
  }

  @Post(':id/analyze-quotes')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PROCUREMENT_OFFICER)
  analyzeQuotes(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AnalyzeQuotesDto,
  ) {
    return this.purchaseRequestService.analyzeQuotes(
      id,
      req.user.organizationId,
      req.user.id,
      dto.quoteIds,
    );
  }

  // @Get(':id/analyses')
  // @Roles(
  //   Role.ADMIN,
  //   Role.MANAGER,
  //   Role.FINANCE_OFFICER,
  //   Role.CFO,
  //   Role.PROCUREMENT_OFFICER,
  // )
  // listAnalyses(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
  //   return this.purchaseRequestService.listAnalyses(
  //     id,
  //     req.user.organizationId,
  //   );
  // }

  @Post(':id/analyses/:analysisId/approval')
  @Roles(Role.MANAGER, Role.FINANCE_OFFICER, Role.CFO)
  decideApproval(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('analysisId') analysisId: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.purchaseRequestService.decideApproval(
      id,
      analysisId,
      req.user.organizationId,
      req.user.id,
      req.user.role,
      dto.status,
      dto.comment,
    );
  }

  @Post(':id/mark-purchased')
  @Roles(Role.PROCUREMENT_OFFICER)
  markPurchased(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.purchaseRequestService.markPurchased(
      id,
      req.user.organizationId,
    );
  }

  // Any authenticated org member can view purchase requests
  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.purchaseRequestService.findAll(req.user.organizationId);
  }

  // @Get(':id')
  // findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
  //   return this.purchaseRequestService.findOne(id, req.user.organizationId);
  // }
}
