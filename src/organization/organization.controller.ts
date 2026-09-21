import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  Req,
  ParseArrayPipe,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InvitePersonDto } from './dto/invite-people.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createOrganization(@Req() req: any, @Body() dto: CreateOrganizationDto) {
    return this.organizationService.createOrganization(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  @Post('invite')
  invitePeople(
    @Req() req: any,
    @Body(new ParseArrayPipe({ items: InvitePersonDto }))
    invites: InvitePersonDto[],
  ) {
    return this.organizationService.invitePeople(
      req.user.organizationId,
      invites,
    );
  }

  // Public endpoint
  @Get('accept-invitation')
  acceptInvitation(@Query('token') token: string) {
    return this.organizationService.acceptInvitation(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyOrganization(@Req() req: any) {
    return this.organizationService.getMyOrganization(req.user.organizationId);
  }
}
