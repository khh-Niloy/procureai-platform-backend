import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/storage/supabase-storage.service';

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async markDone(id: string, fileSize: number) {
    return this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.DONE, fileSize, failureReason: null },
    });
  }

  async markProcessing(id: string) {
    return this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.PROCESSING, failureReason: null },
    });
  }

  async markFailed(id: string, failureReason?: string) {
    return this.prisma.document.update({
      where: { id },
      data: {
        status: DocumentStatus.FAILED,
        failureReason: failureReason?.slice(0, 1_000),
      },
    });
  }

  async createSignedDownloadUrl(id: string, organizationId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, organizationId, status: DocumentStatus.DONE },
    });

    if (!document) {
      throw new NotFoundException('Generated document not found');
    }

    return {
      fileName: document.fileName,
      url: await this.storage.createSignedDownloadUrl(document.storageKey),
    };
  }

  async findVendorDocuments(organizationId: string, vendorId?: string) {
    if (!vendorId) {
      throw new BadRequestException('vendorId is required');
    }

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, organizationId },
      select: { id: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return this.prisma.document.findMany({
      where: {
        organizationId,
        vendorId,
      },
      select: {
        quoteId: true,
        organizationId: true,
        vendorId: true,
        fileName: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
