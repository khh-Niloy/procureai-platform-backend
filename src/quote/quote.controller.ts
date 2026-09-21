import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Request } from 'express';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteService } from './quote.service';

type AuthenticatedRequest = Request & {
  user: { id: string; organizationId: string };
};

@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateQuoteDto) {
    return this.quoteService.createQuote(
      req.user.organizationId,
      req.user.id,
      dto,
    );
  }

  @Get(':id/document/download-url')
  getDownloadUrl(
    @Req() req: AuthenticatedRequest,
    @Param('id') quoteId: string,
  ) {
    return this.quoteService.getDownloadUrl(
      quoteId,
      req.user.organizationId,
      req.user.id,
    );
  }

  @Post(':id/document/retry')
  retryPdf(@Req() req: AuthenticatedRequest, @Param('id') quoteId: string) {
    return this.quoteService.retryPdf(
      quoteId,
      req.user.organizationId,
      req.user.id,
    );
  }
}
