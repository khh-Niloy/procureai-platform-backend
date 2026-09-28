import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PurchaseRequestLogController } from './purchaseRequestLog.controller';
import { PurchaseRequestLogService } from './purchaseRequestLog.service';

@Module({
  imports: [PrismaModule],
  controllers: [PurchaseRequestLogController],
  providers: [PurchaseRequestLogService],
  exports: [PurchaseRequestLogService],
})
export class PurchaseRequestLogModule {}
