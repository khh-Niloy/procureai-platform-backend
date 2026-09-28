import { Module } from '@nestjs/common';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseRequestController } from './purchase-request.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AiModule } from 'src/ai/ai.module';
import { PurchaseRequestLogModule } from 'src/purchaseRequestLog/purchaseRequestLog.module';

@Module({
  imports: [PrismaModule, AiModule, PurchaseRequestLogModule],
  controllers: [PurchaseRequestController],
  providers: [PurchaseRequestService],
  exports: [PurchaseRequestService],
})
export class PurchaseRequestModule {}
