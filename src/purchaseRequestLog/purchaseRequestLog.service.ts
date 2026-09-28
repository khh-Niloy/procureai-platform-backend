import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'src/generated/prisma/client';
import { PurchaseRequestStatus, Role } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ApproveAndRejectPurchaseRequestLogDto,
  CreatePurchaseRequestLogDto,
} from './dto/createPurchaseRequestLog.dto';

const allowedTransitions: Record<
  PurchaseRequestStatus,
  PurchaseRequestStatus[]
> = {
  [PurchaseRequestStatus.PENDING_MANAGER_APPROVAL]: [
    PurchaseRequestStatus.REQUEST_APPROVED,
    PurchaseRequestStatus.REJECTED,
  ],
  [PurchaseRequestStatus.REQUEST_APPROVED]: [
    PurchaseRequestStatus.QUOTE_COLLECTION,
  ],
  [PurchaseRequestStatus.QUOTE_COLLECTION]: [
    PurchaseRequestStatus.AI_ANALYSIS_SUCCESS,
    PurchaseRequestStatus.AI_ANALYSIS_FAILED,
  ],
  [PurchaseRequestStatus.AI_ANALYSIS_SUCCESS]: [
    PurchaseRequestStatus.PENDING_FINANCE_APPROVAL,
  ],
  [PurchaseRequestStatus.AI_ANALYSIS_FAILED]: [],
  [PurchaseRequestStatus.PENDING_FINANCE_APPROVAL]: [
    PurchaseRequestStatus.PENDING_CFO_APPROVAL,
    PurchaseRequestStatus.REJECTED,
  ],
  [PurchaseRequestStatus.PENDING_CFO_APPROVAL]: [
    PurchaseRequestStatus.CFO_APPROVED,
    PurchaseRequestStatus.REJECTED,
  ],
  [PurchaseRequestStatus.CFO_APPROVED]: [
    PurchaseRequestStatus.RECEIVED_BY_VENDOR,
  ],
  [PurchaseRequestStatus.RECEIVED_BY_VENDOR]: [],
  [PurchaseRequestStatus.REJECTED]: [],
};

const transitionRoles: Record<PurchaseRequestStatus, Role[]> = {
  [PurchaseRequestStatus.PENDING_MANAGER_APPROVAL]: [Role.MANAGER],
  [PurchaseRequestStatus.REQUEST_APPROVED]: [Role.PROCUREMENT_OFFICER],
  [PurchaseRequestStatus.QUOTE_COLLECTION]: [
    Role.PROCUREMENT_OFFICER,
    Role.ADMIN,
  ],
  [PurchaseRequestStatus.AI_ANALYSIS_SUCCESS]: [Role.FINANCE_OFFICER],
  [PurchaseRequestStatus.AI_ANALYSIS_FAILED]: [],
  [PurchaseRequestStatus.PENDING_FINANCE_APPROVAL]: [Role.FINANCE_OFFICER],
  [PurchaseRequestStatus.PENDING_CFO_APPROVAL]: [Role.CFO],
  [PurchaseRequestStatus.CFO_APPROVED]: [Role.PROCUREMENT_OFFICER],
  [PurchaseRequestStatus.RECEIVED_BY_VENDOR]: [],
  [PurchaseRequestStatus.REJECTED]: [],
};

@Injectable()
export class PurchaseRequestLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    transaction: Prisma.TransactionClient,
    createPurchaseRequestLogDto: CreatePurchaseRequestLogDto,
  ) {
    const {
      organizationId,
      purchaseRequestId,
      purchaseStatus,
      performedBy,
      note,
      performedAt,
    } = createPurchaseRequestLogDto;

    return transaction.purchaseRequestLog.create({
      data: {
        organizationId,
        purchaseRequestId,
        purchaseStatus,
        performedBy,
        note,
        performedAt,
      },
    });
  }

  async approveAndReject(
    purchaseRequestLogId: string,
    user: { id: string; organizationId: string; role: Role },
    dto: ApproveAndRejectPurchaseRequestLogDto,
  ) {
    if (dto.organizationId !== user.organizationId) {
      throw new ForbiddenException('You cannot access another organization.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const currentLog = await transaction.purchaseRequestLog.findFirst({
        where: {
          id: purchaseRequestLogId,
          organizationId: user.organizationId,
          purchaseRequestId: dto.purchaseRequestId,
        },
      });
      if (!currentLog) {
        throw new NotFoundException('Purchase request log not found.');
      }

      const latestLog = await transaction.purchaseRequestLog.findFirst({
        where: {
          purchaseRequestId: dto.purchaseRequestId,
          organizationId: user.organizationId,
        },
        orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
      });
      if (!latestLog || latestLog.id !== currentLog.id) {
        throw new ConflictException(
          'This request has already moved to another workflow stage.',
        );
      }

      const nextStatus = this.getNextStatus(
        currentLog.purchaseStatus,
        dto.type,
      );
      if (!allowedTransitions[currentLog.purchaseStatus].includes(nextStatus)) {
        throw new ConflictException('This workflow transition is not allowed.');
      }
      if (!transitionRoles[currentLog.purchaseStatus].includes(user.role)) {
        throw new ForbiddenException(
          'Your role cannot perform this workflow transition.',
        );
      }

      if (dto.type === 'quote') {
        const vendors = await transaction.vendor.findMany({
          where: { organizationId: user.organizationId, isActive: true },
          select: { id: true },
        });
        if (vendors.length) {
          await transaction.vendorQuoteRequest.createMany({
            data: vendors.map(({ id: vendorId }) => ({
              requesterId: user.id,
              purchaseRequestId: dto.purchaseRequestId,
              organizationId: user.organizationId,
              vendorId,
            })),
          });
        }
      }

      const createdLog = await this.create(transaction, {
        organizationId: user.organizationId,
        purchaseRequestId: dto.purchaseRequestId,
        purchaseStatus: nextStatus,
        performedBy: user.id,
        note: dto.note,
      });
      return {
        id: createdLog.id,
        status: createdLog.purchaseStatus,
        performedBy: createdLog.performedBy,
        createdAt: createdLog.performedAt,
        note: createdLog.note,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private getNextStatus(
    currentStatus: PurchaseRequestStatus,
    type: ApproveAndRejectPurchaseRequestLogDto['type'],
  ) {
    if (type === 'reject') return PurchaseRequestStatus.REJECTED;
    if (type === 'quote') return PurchaseRequestStatus.QUOTE_COLLECTION;
    if (type === 'received') return PurchaseRequestStatus.RECEIVED_BY_VENDOR;
    if (currentStatus === PurchaseRequestStatus.PENDING_MANAGER_APPROVAL) {
      return PurchaseRequestStatus.REQUEST_APPROVED;
    }
    if (currentStatus === PurchaseRequestStatus.PENDING_FINANCE_APPROVAL) {
      return PurchaseRequestStatus.PENDING_CFO_APPROVAL;
    }
    if (currentStatus === PurchaseRequestStatus.PENDING_CFO_APPROVAL) {
      return PurchaseRequestStatus.CFO_APPROVED;
    }
    return PurchaseRequestStatus.REJECTED;
  }
}
