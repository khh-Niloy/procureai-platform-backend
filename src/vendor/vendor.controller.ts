import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { VendorService } from './vendor.service';

type AuthenticatedRequest = Request & {
  user: { id: string; organizationId: string; role: Role };
};

@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Get('requests')
  @Roles(Role.VENDOR)
  getRequest(@Req() req: AuthenticatedRequest) {
    return this.vendorService.getRequest(
      req.user.organizationId,
      req.user.id,
    );
  }

  @Get()
  @Roles(Role.PROCUREMENT_OFFICER, Role.ADMIN)
  getVendorsByOrganization(@Req() req: AuthenticatedRequest) {
    return this.vendorService.getVendorsByOrganization(req.user.organizationId);
  }
}
