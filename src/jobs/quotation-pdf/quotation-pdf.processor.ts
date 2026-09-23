import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DocumentStatus } from 'src/generated/prisma/enums';
import { DocumentService } from 'src/document/document.service';
import { PdfService } from 'src/pdf/pdf.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/storage/supabase-storage.service';
import { Job, Worker } from 'bullmq';
import {
  GENERATE_QUOTATION_PDF_JOB,
  QUOTATION_PDF_QUEUE,
  QuotationPdfJobData,
  redisConnection,
} from './quotation-pdf.queue';

function money(value: { toString(): string } | null, currency: string) {
  if (value === null) return null;
  return `${currency} ${Number(value.toString()).toFixed(2)}`;
}

@Injectable()
export class QuotationPdfProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuotationPdfProcessor.name);
  private worker!: Worker<QuotationPdfJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly storage: SupabaseStorageService,
    private readonly documents: DocumentService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<QuotationPdfJobData>(
      QUOTATION_PDF_QUEUE,
      async (job) => this.process(job),
      { connection: redisConnection(), concurrency: 2 },
    );
    this.worker.on('error', (error) =>
      this.logger.error('Quotation PDF worker error', error.stack),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<QuotationPdfJobData>) {
    if (job.name !== GENERATE_QUOTATION_PDF_JOB) return;

    const { quoteId, documentId } = job.data;
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new Error(`Document ${documentId} was not found`);
    if (document.quoteId !== quoteId) {
      throw new Error(
        `Document ${documentId} does not belong to quote ${quoteId}`,
      );
    }
    if (document.status === DocumentStatus.DONE) return;

    try {
      const quote = await this.prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          vendor: true,
          items: { orderBy: { id: 'asc' } },
          purchaseRequest: true,
        },
      });
      if (!quote) throw new Error(`Quote ${quoteId} was not found`);
      if (!quote.purchaseRequest) {
        throw new Error(`Quote ${quoteId} is not linked to a purchase request`);
      }

      const viewModel = {
        quoteNumber: `QT-${quote.id.slice(0, 8).toUpperCase()}`,
        quoteDate: quote.submittedAt.toISOString().slice(0, 10),
        vendor: {
          name: quote.vendor.name,
          email: quote.vendor.email,
          phone: quote.vendor.phone,
          address: quote.vendor.address,
        },
        purchaseRequest: {
          id: quote.purchaseRequest.id,
          title: quote.purchaseRequest.title,
          description: quote.purchaseRequest.description,
        },
        items: quote.items.map((item) => ({
          productName: item.productName,
          description: item.description,
          quantity: item.quantity.toString(),
          unit: item.unit,
          unitPrice: money(item.unitPrice, quote.currency),
          totalPrice: money(item.totalPrice, quote.currency),
        })),
        subtotal: money(quote.subtotal, quote.currency),
        discount: money(quote.discount, quote.currency),
        tax: money(quote.tax, quote.currency),
        shippingCost: money(quote.shippingCost, quote.currency),
        totalAmount: money(quote.totalAmount, quote.currency),
        deliveryDays: quote.deliveryDays,
        deliveryTerms: quote.deliveryTerms,
        paymentTerms: quote.paymentTerms,
        warrantyMonths: quote.warrantyMonths,
        validityDays: quote.validityDays,
        notes: quote.notes,
      };
      const pdf = await this.pdf.createQuotationPdf(viewModel);
      await this.storage.uploadPdf(document.storageKey, pdf);
      await this.documents.markDone(documentId, pdf.length);
    } catch (error) {
      try {
        await this.documents.markFailed(documentId, (error as Error).message);
      } catch (statusError) {
        this.logger.error(
          `Could not mark document ${documentId} as failed`,
          (statusError as Error).stack,
        );
      }
      throw error;
    }
  }
}
