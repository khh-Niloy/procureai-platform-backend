import { Module } from '@nestjs/common';
import { DocumentModule } from 'src/document/document.module';
import { PdfModule } from 'src/pdf/pdf.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StorageModule } from 'src/storage/storage.module';
import { QuotationPdfProcessor } from './quotation-pdf/quotation-pdf.processor';
import { QuotationPdfQueue } from './quotation-pdf/quotation-pdf.queue';

@Module({
  imports: [PrismaModule, DocumentModule, PdfModule, StorageModule],
  providers: [QuotationPdfQueue, QuotationPdfProcessor],
  exports: [QuotationPdfQueue],
})
export class JobsModule {}
