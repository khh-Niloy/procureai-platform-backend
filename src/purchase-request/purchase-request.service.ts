import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'src/generated/prisma/client';
import {
  AnalysisStatus,
  PurchaseRequestStatus,
} from 'src/generated/prisma/enums';
import { AiAnalysisService } from 'src/ai/ai-analysis.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { PurchaseRequestLogService } from 'src/purchaseRequestLog/purchaseRequestLog.service';

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

@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly purchaseRequestLogService: PurchaseRequestLogService,
  ) {}

  async createRequest(
    organizationId: string,
    requesterId: string,
    dto: CreatePurchaseRequestDto,
  ) {
    const { items, requiredBy, budget, ...rest } = dto;
    return this.prisma.$transaction(async (transaction) => {
      const purchaseRequest = await transaction.purchaseRequest.create({
        data: {
          ...rest,
          currency: 'BDT',
          budget: budget || undefined,
          requiredBy: requiredBy ? new Date(requiredBy) : undefined,
          organizationId,
          requesterId,
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

      await this.purchaseRequestLogService.create(transaction, {
        organizationId,
        purchaseRequestId: purchaseRequest.id,
        purchaseStatus: 'PENDING_MANAGER_APPROVAL',
        performedBy: requesterId,
      });

      return purchaseRequest;
    });
  }

  async findByStatus(organizationId: string, status: PurchaseRequestStatus) {
    const response = await this.findAll(organizationId);
    return response.data.filter((request) => request.status === status);
  }

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
    const currentLog = await this.prisma.purchaseRequestLog.findFirst({
      where: { organizationId, purchaseRequestId: id },
      orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
    });
    if (currentLog?.purchaseStatus !== PurchaseRequestStatus.QUOTE_COLLECTION) {
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
          const latestLog = await tx.purchaseRequestLog.findFirst({
            where: { purchaseRequestId: id, organizationId },
            orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
          });
          if (
            !latestLog ||
            latestLog.id !== currentLog.id ||
            latestLog.purchaseStatus !== PurchaseRequestStatus.QUOTE_COLLECTION
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
          const analysisLog = await this.purchaseRequestLogService.create(tx, {
            organizationId,
            purchaseRequestId: id,
            purchaseStatus: PurchaseRequestStatus.AI_ANALYSIS_SUCCESS,
            performedBy: userId,
          });
          await this.purchaseRequestLogService.create(tx, {
            organizationId,
            purchaseRequestId: id,
            purchaseStatus: PurchaseRequestStatus.PENDING_FINANCE_APPROVAL,
            performedBy: userId,
            performedAt: new Date(analysisLog.performedAt.getTime() + 1),
          });
          return completed;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return {
        purchaseRequestStatus: PurchaseRequestStatus.PENDING_FINANCE_APPROVAL,
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
      await this.prisma.$transaction(async (tx) => {
        const currentLog = await tx.purchaseRequestLog.findFirst({
          where: { purchaseRequestId: id, organizationId },
          orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
        });
        if (currentLog?.purchaseStatus === PurchaseRequestStatus.QUOTE_COLLECTION) {
          await this.purchaseRequestLogService.create(tx, {
            organizationId,
            purchaseRequestId: id,
            purchaseStatus: PurchaseRequestStatus.AI_ANALYSIS_FAILED,
            performedBy: userId,
            note: this.failureReason(error),
          });
        }
      }).catch(() => undefined);
      throw error;
    }
  }

  async findAll(organizationId: string) {
    const requests = await this.prisma.purchaseRequest.findMany({
      where: { organizationId },
      include: {
        items: true,
        requester: { select: { id: true, name: true, email: true } },
        logs: {
          orderBy: { performedAt: 'asc' },
          include: { performer: { select: { name: true, role: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: requests.map(({ items, logs, budget, ...request }) => ({
        ...request,
        status: logs[logs.length - 1]?.purchaseStatus ?? null,
        quantity: items.reduce((total, item) => total + item.quantity, 0),
        budget: budget === null ? null : Number(budget),
        items,
        logs: logs.map((log) => ({
          id: log.id,
          status: log.purchaseStatus,
          performedBy: log.performedBy,
          performedByName: log.performer.name,
          performedByRole: log.performer.role,
          createdAt: log.performedAt,
          note: log.note,
        })),
      })),
    };
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
