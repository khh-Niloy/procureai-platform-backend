import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DocumentStatus, DocumentType } from 'src/generated/prisma/enums';
import { Prisma } from 'src/generated/prisma/client';
import { DocumentService } from 'src/document/document.service';
import { QuotationPdfQueue } from 'src/jobs/quotation-pdf/quotation-pdf.queue';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/storage/supabase-storage.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QuotationPdfQueue,
    private readonly documents: DocumentService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async createQuote(
    organizationId: string,
    userId: string,
    dto: CreateQuoteDto,
  ) {
    const [vendor, purchaseRequest] = await Promise.all([
      this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, organizationId, isActive: true },
      }),
      this.prisma.purchaseRequest.findFirst({
        where: { id: dto.purchaseRequestId, organizationId },
      }),
    ]);

    if (!vendor) throw new NotFoundException('Active vendor not found');
    if (!purchaseRequest)
      throw new NotFoundException('Purchase request not found');
    if (vendor.userId !== userId) {
      throw new ForbiddenException(
        'You can only submit a quote for your vendor',
      );
    }

    const quoteId = randomUUID();
    const todaysDate = new Date().toISOString().slice(0, 10);
    const fileName = `quotation-${todaysDate}-${quoteId.slice(0, 8)}.pdf`;
    const storageKey = `organizations/${organizationId}/quotes/${quoteId}.pdf`;

    const result = await this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          id: quoteId,
          vendorId: dto.vendorId,
          purchaseRequestId: dto.purchaseRequestId,
          subtotal: dto.subtotal,
          discount: dto.discount,
          tax: dto.tax,
          shippingCost: dto.shippingCost,
          totalAmount: dto.totalAmount,
          currency: dto.currency,
          deliveryDays: dto.deliveryDays,
          deliveryTerms: dto.deliveryTerms,
          paymentTerms: dto.paymentTerms,
          warrantyMonths: dto.warrantyMonths,
          validityDays: dto.validityDays,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              productName: item.productName,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              specifications: item.specifications as
                Prisma.InputJsonValue | undefined,
            })),
          },
        },
        include: { items: true },
      });
      const document = await tx.document.create({
        data: {
          organizationId,
          vendorId: quote.vendorId,
          quoteId: quote.id,
          type: DocumentType.QUOTE,
          status: DocumentStatus.PROCESSING,
          fileName,
          storageKey,
          mimeType: 'application/pdf',
          fileSize: 0,
        },
      });
      return { quote, document };
    });

    try {
      await this.queue.enqueue({
        quoteId: result.quote.id,
        documentId: result.document.id,
      });
    } catch (error) {
      await this.documents
        .markFailed(result.document.id, (error as Error).message)
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        `Quote was saved but PDF generation could not be queued: ${(error as Error).message}`,
      );
    }

    return {
      ...result.quote,
      document: {
        id: result.document.id,
        status: result.document.status,
        fileName: result.document.fileName,
      },
    };
  }

  async getDownloadUrl(
    quoteId: string,
    organizationId: string,
    userId: string,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        purchaseRequest: { is: { organizationId } },
        vendor: { userId },
      },
      include: {
        documents: {
          where: { type: DocumentType.QUOTE },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    const document = quote?.documents[0];
    if (!document) {
      throw new NotFoundException('Generated quotation document not found');
    }
    if (document.status === DocumentStatus.PROCESSING) {
      throw new ConflictException(
        'Quotation PDF is still processing. Please try again shortly.',
      );
    }
    if (document.status === DocumentStatus.FAILED) {
      throw new ConflictException(
        document.failureReason ?? 'Quotation PDF generation failed.',
      );
    }
    return {
      fileName: document.fileName,
      url: await this.storage.createSignedDownloadUrl(document.storageKey),
    };
  }

  async retryPdf(quoteId: string, organizationId: string, userId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        purchaseRequest: { is: { organizationId } },
        vendor: { userId },
      },
      include: {
        documents: {
          where: { type: DocumentType.QUOTE },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    const document = quote?.documents[0];
    if (!document) {
      throw new NotFoundException('Quotation document not found');
    }
    if (document.status !== DocumentStatus.FAILED) {
      throw new ConflictException('Only failed quotation PDFs can be retried.');
    }

    await this.documents.markProcessing(document.id);
    try {
      await this.queue.retry({ quoteId, documentId: document.id });
    } catch (error) {
      await this.documents
        .markFailed(document.id, (error as Error).message)
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'Quotation PDF retry could not be queued. Please try again shortly.',
      );
    }

    return {
      documentId: document.id,
      status: DocumentStatus.PROCESSING,
      message: 'Quotation PDF retry has been queued.',
    };
  }
}
