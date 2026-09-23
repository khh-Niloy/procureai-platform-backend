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
import { VendorService } from './vendor.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';

@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  // @Post()
  // @Roles(Role.VENDOR)
  // createVendor(@Req() req: any, @Body() dto: CreateVendorDto) {
  //   return this.vendorService.createVendor(req.user.organizationId, req.user.id, dto);
  // }

  @Patch(':id')
  @Roles(Role.VENDOR)
  updateVendor(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorService.updateVendor(id, req.user.organizationId, dto);
  }

  @Get()
  @Roles(Role.PROCUREMENT_OFFICER)
  getVendorsByOrganization(@Req() req: any) {
    return this.vendorService.getVendorsByOrganization(req.user.organizationId);
  }

  @Get('quote-requests')
  @Roles(Role.VENDOR)
  getQuoteRequests(@Req() req: any) {
    return this.vendorService.getQuoteRequests(req.user.organizationId);
  }

  @Get(':id')
  getVendorById(@Req() req: any, @Param('id') id: string) {
    return this.vendorService.getVendorById(id, req.user.organizationId);
  }
}
