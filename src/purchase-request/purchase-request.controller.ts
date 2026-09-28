import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Req,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { PurchaseRequestService } from './purchase-request.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { PurchaseRequestStatus, Role } from 'src/generated/prisma/enums';
import { AnalyzeQuotesDto } from './dto/analyze-quotes.dto';
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

  @Get('pending-quote-collection')
  @Roles(Role.PROCUREMENT_OFFICER)
  findPendingQuoteCollection(@Req() req: AuthenticatedRequest) {
    return this.purchaseRequestService.findByStatus(
      req.user.organizationId,
      PurchaseRequestStatus.REQUEST_APPROVED,
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

  @Post(':id/analyze-quotes')
  @Roles(Role.PROCUREMENT_OFFICER)
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

  @Get(':id/analyses')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.TEAM_LEADER)
  listAnalyses(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.purchaseRequestService.listAnalyses(
      id,
      req.user.organizationId,
    );
  }

  // Any authenticated org member except vendor can view purchase requests.
  @Get()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.TEAM_LEADER)
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('organizationId') organizationId?: string,
  ) {
    if (organizationId && organizationId !== req.user.organizationId) {
      throw new ForbiddenException('You cannot access another organization.');
    }
    return this.purchaseRequestService.findAll(
      organizationId ?? req.user.organizationId,
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.TEAM_LEADER)
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.purchaseRequestService.findOne(id, req.user.organizationId);
  }
}
