import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'src/generated/prisma/client';
import {
  AnalysisStatus,
  ApprovalStatus,
  ApprovalType,
  PurchaseRequestStatus,
  Role,
} from 'src/generated/prisma/enums';
import { AiAnalysisService } from 'src/ai/ai-analysis.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';

type RuleStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'UNKNOWN';

type QuoteHardRuleResult = {
  quoteId: string;
  budget: { status: RuleStatus; message: string };
  delivery: { status: RuleStatus; message: string };
  requirements: {
    status: RuleStatus;
    message: string;
    missingItems: string[];
    quantityMismatches: string[];
    specificationMismatches: string[];
  };
};

const APPROVAL_TRANSITIONS: Partial<
  Record<
    Role,
    {
      type: ApprovalType;
      expectedStatus: PurchaseRequestStatus;
      approvedStatus: PurchaseRequestStatus;
      nextType?: ApprovalType;
    }
  >
> = {
  [Role.MANAGER]: {
    type: ApprovalType.MANAGER,
    expectedStatus: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL,
    approvedStatus: PurchaseRequestStatus.PENDING_FINANCE_APPROVAL,
    nextType: ApprovalType.FINANCE,
  },
  [Role.FINANCE_OFFICER]: {
    type: ApprovalType.FINANCE,
    expectedStatus: PurchaseRequestStatus.PENDING_FINANCE_APPROVAL,
    approvedStatus: PurchaseRequestStatus.PENDING_CFO_APPROVAL,
    nextType: ApprovalType.CFO,
  },
  [Role.CFO]: {
    type: ApprovalType.CFO,
    expectedStatus: PurchaseRequestStatus.PENDING_CFO_APPROVAL,
    approvedStatus: PurchaseRequestStatus.CFO_APPROVED,
  },
};

@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAnalysis: AiAnalysisService,
  ) {}

  async analyzeQuotes(
    id: string,
    organizationId: string,
    userId: string,
    quoteIds: string[],
  ) {
    if (new Set(quoteIds).size !== quoteIds.length) {
      throw new BadRequestException('quoteIds must not contain duplicates');
    }

    const purchaseRequest = await this.prisma.purchaseRequest.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!purchaseRequest) {
      throw new NotFoundException('Purchase request not found');
    }
    if (
      purchaseRequest.status !== PurchaseRequestStatus.QUOTE_COLLECTION &&
      purchaseRequest.status !== PurchaseRequestStatus.AI_ANALYSIS_FAILED
    ) {
      throw new ConflictException(
        'Quotes can only be analyzed while the purchase request is in quote collection.',
      );
    }

    const quotes = await this.prisma.quote.findMany({
      where: {
        id: { in: quoteIds },
        purchaseRequestId: id,
        vendor: { organizationId },
      },
      include: {
        vendor: { select: { name: true } },
        items: true,
      },
    });
    if (quotes.length !== quoteIds.length) {
      throw new BadRequestException(
        'Every selected quote must belong to this purchase request.',
      );
    }

    const hardRuleResults = quotes.map((quote) =>
      this.evaluateHardRules(purchaseRequest, quote),
    );
    const input = {
      purchaseRequest: {
        id: purchaseRequest.id,
        title: purchaseRequest.title,
        description: purchaseRequest.description,
        budget: purchaseRequest.budget?.toString() ?? null,
        currency: purchaseRequest.currency,
        requiredBy: purchaseRequest.requiredBy?.toISOString() ?? null,
        items: purchaseRequest.items,
      },
      quotes: quotes.map((quote) => ({
        id: quote.id,
        vendorName: quote.vendor.name,
        subtotal: quote.subtotal?.toString() ?? null,
        discount: quote.discount?.toString() ?? null,
        tax: quote.tax?.toString() ?? null,
        shippingCost: quote.shippingCost?.toString() ?? null,
        totalAmount: quote.totalAmount.toString(),
        currency: quote.currency,
        deliveryDays: quote.deliveryDays,
        deliveryTerms: quote.deliveryTerms,
        paymentTerms: quote.paymentTerms,
        warrantyMonths: quote.warrantyMonths,
        validityDays: quote.validityDays,
        notes: quote.notes,
        items: quote.items.map((item) => ({
          productName: item.productName,
          description: item.description,
          quantity: item.quantity.toString(),
          unit: item.unit,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
          specifications: item.specifications,
        })),
      })),
      hardRuleResults,
    };

    const analysis = await this.prisma.quoteAnalysis.create({
      data: {
        purchaseRequestId: id,
        createdById: userId,
        selectedQuoteIds: quoteIds,
      },
    });

    try {
      const generated = await this.aiAnalysis.analyze(input, quoteIds);
      const saved = await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.purchaseRequest.findFirst({
            where: { id, organizationId },
            select: { status: true },
          });
          if (
            !current ||
            (current.status !== PurchaseRequestStatus.QUOTE_COLLECTION &&
              current.status !== PurchaseRequestStatus.AI_ANALYSIS_FAILED)
          ) {
            throw new ConflictException(
              'The purchase request status changed while analysis was running.',
            );
          }
          const completed = await tx.quoteAnalysis.update({
            where: { id: analysis.id },
            data: {
              status: AnalysisStatus.SUCCEEDED,
              result: generated.result,
              hardRuleResults,
              recommendedQuoteId: generated.result.recommendedQuoteId,
              completedAt: new Date(),
            },
          });
          await tx.purchaseRequest.update({
            where: { id },
            data: { status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL },
          });
          await tx.approval.create({
            data: {
              purchaseRequestId: id,
              analysisId: analysis.id,
              type: ApprovalType.MANAGER,
            },
          });
          return completed;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return {
        purchaseRequestStatus: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL,
        analysis: this.analysisResponse(saved, hardRuleResults),
      };
    } catch (error) {
      await this.prisma.quoteAnalysis
        .update({
          where: { id: analysis.id },
          data: {
            status: AnalysisStatus.FAILED,
            failureReason: this.failureReason(error),
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
      await this.prisma.purchaseRequest
        .updateMany({
          where: {
            id,
            organizationId,
            status: {
              in: [
                PurchaseRequestStatus.QUOTE_COLLECTION,
                PurchaseRequestStatus.AI_ANALYSIS_FAILED,
              ],
            },
          },
          data: { status: PurchaseRequestStatus.AI_ANALYSIS_FAILED },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async listAnalyses(id: string, organizationId: string) {
    const purchaseRequest = await this.prisma.purchaseRequest.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!purchaseRequest) {
      throw new NotFoundException('Purchase request not found');
    }

    const analyses = await this.prisma.quoteAnalysis.findMany({
      where: { purchaseRequestId: id },
      include: { approvals: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return analyses.map((analysis) => this.analysisResponse(analysis));
  }

  async decideApproval(
    id: string,
    analysisId: string,
    organizationId: string,
    userId: string,
    role: Role,
    status: ApprovalStatus,
    comment?: string,
  ) {
    if (status === ApprovalStatus.PENDING) {
      throw new BadRequestException(
        'An approval decision must be APPROVED or REJECTED.',
      );
    }
    const transition = APPROVAL_TRANSITIONS[role];
    if (!transition) {
      throw new ForbiddenException(
        'Your role cannot approve this purchase request.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const request = await tx.purchaseRequest.findFirst({
          where: { id, organizationId },
          select: { status: true },
        });
        if (!request) throw new NotFoundException('Purchase request not found');
        if (request.status !== transition.expectedStatus) {
          throw new ConflictException(
            'This purchase request is not awaiting your approval.',
          );
        }

        const analysis = await tx.quoteAnalysis.findFirst({
          where: {
            id: analysisId,
            purchaseRequestId: id,
            status: AnalysisStatus.SUCCEEDED,
          },
          select: { id: true },
        });
        if (!analysis)
          throw new NotFoundException('Completed analysis not found');

        const updated = await tx.approval.updateMany({
          where: {
            purchaseRequestId: id,
            analysisId,
            type: transition.type,
            status: ApprovalStatus.PENDING,
          },
          data: { status, approverId: userId, comment, decidedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'This approval has already been decided.',
          );
        }

        const nextStatus =
          status === ApprovalStatus.APPROVED
            ? transition.approvedStatus
            : PurchaseRequestStatus.REJECTED;
        await tx.purchaseRequest.update({
          where: { id },
          data: { status: nextStatus },
        });
        if (status === ApprovalStatus.APPROVED && transition.nextType) {
          await tx.approval.create({
            data: {
              purchaseRequestId: id,
              analysisId,
              type: transition.nextType,
            },
          });
        }
        return {
          purchaseRequestStatus: nextStatus,
          analysis: await this.getAnalysisInTransaction(tx, analysisId),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async markPurchased(id: string, organizationId: string) {
    const result = await this.prisma.purchaseRequest.updateMany({
      where: { id, organizationId, status: PurchaseRequestStatus.CFO_APPROVED },
      data: { status: PurchaseRequestStatus.PURCHASED },
    });
    if (result.count !== 1) {
      throw new ConflictException(
        'Only CFO-approved purchase requests can be marked purchased.',
      );
    }
    return this.findOne(id, organizationId);
  }

  async createRequest(
    organizationId: string,
    requesterId: string,
    dto: CreatePurchaseRequestDto,
  ) {
    const { items, requiredBy, budget, ...rest } = dto;
    return this.prisma.purchaseRequest.create({
      data: {
        ...rest,
        budget: budget || undefined,
        requiredBy: requiredBy ? new Date(requiredBy) : undefined,
        organizationId,
        requesterId,
        status: PurchaseRequestStatus.QUOTE_COLLECTION,
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

  async findAll(organizationId: string) {
    return this.prisma.purchaseRequest.findMany({
      where: { organizationId },
      include: {
        items: true,
        requester: { select: { id: true, name: true, email: true } },
      },
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
    if (!pr) throw new NotFoundException('Purchase request not found');
    return pr;
  }

  private async getAnalysisInTransaction(
    tx: Prisma.TransactionClient,
    analysisId: string,
  ) {
    const analysis = await tx.quoteAnalysis.findUnique({
      where: { id: analysisId },
      include: { approvals: { orderBy: { createdAt: 'asc' } } },
    });
    if (!analysis) throw new NotFoundException('Analysis not found');
    return this.analysisResponse(analysis);
  }

  private analysisResponse(
    analysis: {
      id: string;
      status: AnalysisStatus;
      selectedQuoteIds: Prisma.JsonValue;
      result: Prisma.JsonValue | null;
      hardRuleResults: Prisma.JsonValue | null;
      recommendedQuoteId: string | null;
      failureReason?: string | null;
      completedAt: Date | null;
      createdAt?: Date;
      approvals?: unknown;
    },
    hardRuleResults?: QuoteHardRuleResult[],
  ) {
    return {
      id: analysis.id,
      status: analysis.status,
      selectedQuoteIds: analysis.selectedQuoteIds,
      recommendation: analysis.result,
      hardRuleResults: hardRuleResults ?? analysis.hardRuleResults,
      recommendedQuoteId: analysis.recommendedQuoteId,
      approvals: analysis.approvals ?? [],
      failureReason: analysis.failureReason ?? null,
      completedAt: analysis.completedAt,
      createdAt: analysis.createdAt,
    };
  }

  private evaluateHardRules(
    request: {
      budget: Prisma.Decimal | null;
      currency: string;
      requiredBy: Date | null;
      items: {
        name: string;
        quantity: number;
        specifications: Prisma.JsonValue | null;
      }[];
    },
    quote: {
      id: string;
      totalAmount: Prisma.Decimal;
      currency: string;
      deliveryDays: number | null;
      items: {
        productName: string;
        quantity: Prisma.Decimal;
        specifications: Prisma.JsonValue | null;
      }[];
    },
  ): QuoteHardRuleResult {
    const budget = !request.budget
      ? {
          status: 'NOT_APPLICABLE' as const,
          message: 'No budget was provided.',
        }
      : quote.currency !== request.currency
        ? {
            status: 'FAIL' as const,
            message: 'Quote currency does not match request currency.',
          }
        : quote.totalAmount.lte(request.budget)
          ? {
              status: 'PASS' as const,
              message: 'Quote total is within budget.',
            }
          : { status: 'FAIL' as const, message: 'Quote total exceeds budget.' };

    let delivery: { status: RuleStatus; message: string };
    if (!request.requiredBy) {
      delivery = {
        status: 'NOT_APPLICABLE',
        message: 'No required delivery date was provided.',
      };
    } else if (quote.deliveryDays === null) {
      delivery = {
        status: 'UNKNOWN',
        message: 'Quote does not provide delivery days.',
      };
    } else {
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + quote.deliveryDays);
      delivery =
        deliveryDate <= request.requiredBy
          ? {
              status: 'PASS',
              message: 'Quoted delivery timeline meets the required date.',
            }
          : {
              status: 'FAIL',
              message: 'Quoted delivery timeline misses the required date.',
            };
    }

    const missingItems: string[] = [];
    const quantityMismatches: string[] = [];
    const specificationMismatches: string[] = [];
    for (const item of request.items) {
      const quoted = quote.items.find(
        (candidate) =>
          candidate.productName.trim().toLowerCase() ===
          item.name.trim().toLowerCase(),
      );
      if (!quoted) {
        missingItems.push(item.name);
        continue;
      }
      if (!quoted.quantity.eq(item.quantity))
        quantityMismatches.push(item.name);
      if (
        item.specifications !== null &&
        !jsonContains(quoted.specifications, item.specifications)
      ) {
        specificationMismatches.push(item.name);
      }
    }
    const requirementsFailed =
      missingItems.length +
        quantityMismatches.length +
        specificationMismatches.length >
      0;
    return {
      quoteId: quote.id,
      budget,
      delivery,
      requirements: {
        status: requirementsFailed ? 'FAIL' : 'PASS',
        message: requirementsFailed
          ? 'Quote does not meet one or more explicit item requirements.'
          : 'Quote covers all explicit item requirements.',
        missingItems,
        quantityMismatches,
        specificationMismatches,
      },
    };
  }

  private failureReason(error: unknown) {
    if (error instanceof Error) return error.name;
    return 'UnknownError';
  }
}

function jsonContains(
  actual: Prisma.JsonValue | null,
  required: Prisma.JsonValue | undefined,
) {
  if (required === undefined) return false;
  if (actual === null) return false;
  if (typeof required !== 'object' || required === null)
    return actual === required;
  if (Array.isArray(required)) {
    return (
      Array.isArray(actual) &&
      JSON.stringify(actual) === JSON.stringify(required)
    );
  }
  if (typeof actual !== 'object' || Array.isArray(actual)) return false;
  return Object.entries(required).every(([key, value]) =>
    jsonContains(actual[key] ?? null, value),
  );
}
