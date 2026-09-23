import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService) {}

  // async createVendor(organizationId: string, userId: string, dto: CreateVendorDto) {
  //   return this.prisma.vendor.create({
  //     data: {
  //       organizationId,
  //       userId,
  //       ...dto,
  //     },
  //   });
  // }

  async updateVendor(id: string, organizationId: string, dto: UpdateVendorDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return this.prisma.vendor.update({
      where: { id },
      data: dto,
    });
  }

  async getVendorById(id: string, organizationId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  async getVendorsByOrganization(organizationId: string) {
    return this.prisma.vendor.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQuoteRequests(organizationId: string) {
    return this.prisma.vendorQuoteRequest.findMany({
      where: { organizationId },
      include: {
        purchaseRequest: {
          include: { items: true, organization: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
