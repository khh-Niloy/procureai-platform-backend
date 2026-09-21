import { Module } from '@nestjs/common';
import { DocumentModule } from 'src/document/document.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';

@Module({
  imports: [PrismaModule, JobsModule, DocumentModule, StorageModule],
  controllers: [QuoteController],
  providers: [QuoteService],
})
export class QuoteModule {}
