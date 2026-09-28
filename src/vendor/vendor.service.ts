import { Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseRequestStatus } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService) {}

  async getVendorsByOrganization(organizationId: string) {
    return this.prisma.vendor.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRequest(organizationId: string, userId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { organizationId, userId, isActive: true },
      select: { id: true },
    });

    if (!vendor) {
      throw new NotFoundException('Active vendor not found');
    }

    const purchaseRequests = await this.prisma.purchaseRequest.findMany({
      where: { organizationId },
      include: {
        items: true,
        logs: {
          orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { purchaseStatus: true },
        },
        quotes: {
          where: { vendorId: vendor.id },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: purchaseRequests
        .filter(
          (purchaseRequest) =>
            purchaseRequest.logs[0]?.purchaseStatus ===
            PurchaseRequestStatus.QUOTE_COLLECTION,
        )
        .map(({ items, logs, quotes, ...purchaseRequest }) => ({
          ...purchaseRequest,
          items,
          isSubmitted: quotes.length > 0,
        })),
    };
  }
}
