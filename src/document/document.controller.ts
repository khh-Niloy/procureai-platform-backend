import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Request } from 'express';
import { DocumentService } from './document.service';

type AuthenticatedRequest = Request & {
  user: { id: string; organizationId: string };
};

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PROCUREMENT_OFFICER)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  findByVendor(
    @Req() req: AuthenticatedRequest,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.documentService.findVendorDocuments(
      req.user.organizationId,
      vendorId,
    );
  }
}
