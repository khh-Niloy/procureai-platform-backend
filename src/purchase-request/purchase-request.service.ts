import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';
import { PurchaseRequestStatus, Role } from 'src/generated/prisma/enums';

// Role-based allowed status transitions
const ALLOWED_STATUS_PER_ROLE: Partial<Record<Role, PurchaseRequestStatus[]>> =
  {
    [Role.MANAGER]: [
      PurchaseRequestStatus.APPROVED,
      PurchaseRequestStatus.REJECTED,
    ],
    [Role.PROCUREMENT_OFFICER]: [PurchaseRequestStatus.QUOTE_COLLECTION],
    [Role.FINANCE_OFFICER]: [PurchaseRequestStatus.PENDING_CFO_APPROVAL],
    [Role.CFO]: [PurchaseRequestStatus.PURCHASED],
  };

@Injectable()
export class PurchaseRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async createRequest(
    organizationId: string,
    requesterId: string,
    dto: CreatePurchaseRequestDto,
  ) {
    const { items, requiredBy, budget, ...rest } = dto;

    return this.prisma.purchaseRequest.create({
      data: {
        ...rest,
        budget: budget ? budget : undefined,
        requiredBy: requiredBy ? new Date(requiredBy) : undefined,
        organizationId,
        requesterId,
        status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL,
        items: {
          create: items.map((item) => ({
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            specifications: item.specifications ?? undefined,
          })),
        },
      },
      include: { items: true },
    });
  }

  async updateStatus(
    id: string,
    organizationId: string,
    userRole: Role,
    dto: UpdatePurchaseRequestStatusDto,
  ) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, organizationId },
    });

    if (!pr) {
      throw new NotFoundException('Purchase request not found');
    }

    const allowedStatuses = ALLOWED_STATUS_PER_ROLE[userRole] ?? [];
    if (!allowedStatuses.includes(dto.status)) {
      throw new ForbiddenException(
        `Your role (${userRole}) cannot set status to "${dto.status}"`,
      );
    }

    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: dto.status },
      include: { items: true },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.purchaseRequest.findMany({
      where: { organizationId },
      include: { items: true, requester: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        requester: { select: { id: true, name: true, email: true } },
      },
    });

    if (!pr) {
      throw new NotFoundException('Purchase request not found');
    }

    return pr;
  }
}
