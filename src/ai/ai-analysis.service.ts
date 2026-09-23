import {
  BadGatewayException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { config } from 'src/config';

export type QuoteAnalysis = {
  quoteId: string;
  requirementMatch: { score: number; explanation: string };
  price: { score: number; explanation: string };
  delivery: { score: number; explanation: string };
  warranty: { score: number; explanation: string };
  strengths: string[];
  weaknesses: string[];
  issues: {
    type: 'missing' | 'conflicting' | 'problematic';
    description: string;
  }[];
};

export type QuoteAnalysisResult = {
  recommendedQuoteId: string;
  recommendationReason: string;
  quotes: QuoteAnalysis[];
};

export type AnalysisGeneration = {
  result: QuoteAnalysisResult;
};

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendedQuoteId', 'recommendationReason', 'quotes'],
  properties: {
    recommendedQuoteId: { type: 'string' },
    recommendationReason: { type: 'string' },
    quotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'quoteId',
          'requirementMatch',
          'price',
          'delivery',
          'warranty',
          'strengths',
          'weaknesses',
          'issues',
        ],
        properties: {
          quoteId: { type: 'string' },
          requirementMatch: scoreSchema(),
          price: scoreSchema(),
          delivery: scoreSchema(),
          warranty: scoreSchema(),
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'description'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['missing', 'conflicting', 'problematic'],
                },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

function scoreSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['score', 'explanation'],
    properties: {
      score: { type: 'number', minimum: 0, maximum: 100 },
      explanation: { type: 'string' },
    },
  };
}

@Injectable()
export class AiAnalysisService {
  async analyze(
    input: unknown,
    quoteIds: string[],
  ): Promise<AnalysisGeneration> {
    if (!config.geminiApiKey) {
      throw new ServiceUnavailableException(
        'AI analysis is unavailable because Gemini is not configured.',
      );
    }

    const contents = JSON.stringify(input);
    if (Buffer.byteLength(contents, 'utf8') > config.geminiMaxInputBytes) {
      throw new PayloadTooLargeException(
        'The selected quotes are too large for AI analysis.',
      );
    }

    const client = new GoogleGenAI({ apiKey: config.geminiApiKey });
    let lastError: unknown;

    for (let attempt = 0; attempt <= config.geminiMaxRetries; attempt += 1) {
      try {
        const response = await client.models.generateContent({
          model: config.geminiModel,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: responseSchema,
            abortSignal: AbortSignal.timeout(config.geminiTimeoutMs),
            systemInstruction:
              'You are a procurement analyst. Compare every supplied quote against the purchase request. Do not select solely on price. Evaluate specification fit, budget and currency context, delivery, warranty, payment terms, and risks. Scores are 0 to 100, where 100 is best. Use only supplied quote IDs. Identify absent data as issues rather than inventing it. The backend supplies deterministic hard-rule results separately; do not claim that an unmet hard rule is acceptable.',
          },
        });
        if (!response.text) {
          throw new BadGatewayException('Gemini returned an empty analysis.');
        }
        const result: unknown = JSON.parse(response.text);
        this.validateResult(result, quoteIds);

        return { result };
      } catch (error) {
        lastError = error;
        if (
          error instanceof BadGatewayException ||
          attempt === config.geminiMaxRetries ||
          !this.isTransient(error)
        ) {
          break;
        }
        await this.backoff(attempt);
      }
    }

    if (lastError instanceof BadGatewayException) {
      throw lastError;
    }
    throw new BadGatewayException(
      'Gemini analysis is temporarily unavailable.',
    );
  }

  private async backoff(attempt: number) {
    const delayMs = 250 * 2 ** attempt + Math.floor(Math.random() * 100);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  private isTransient(error: unknown): boolean {
    const candidate = error as {
      status?: unknown;
      code?: unknown;
      name?: unknown;
    };
    const status = Number(candidate?.status ?? candidate?.code);
    return (
      // 429: Gemini rate limit
      // 500+: Gemini server problem
      // AbortError / TimeoutError: request took too long;
      status === 429 ||
      status >= 500 ||
      candidate?.name === 'AbortError' ||
      candidate?.name === 'TimeoutError'
    );
  }

  private validateResult(
    result: unknown,
    quoteIds: string[],
  ): asserts result is QuoteAnalysisResult {
    if (
      !isExactObject(result, [
        'recommendedQuoteId',
        'recommendationReason',
        'quotes',
      ])
    ) {
      throw new BadGatewayException('Gemini returned an invalid analysis.');
    }
    if (
      !isNonEmptyString(result.recommendedQuoteId) ||
      !quoteIds.includes(result.recommendedQuoteId as string) ||
      !isNonEmptyString(result.recommendationReason) ||
      !Array.isArray(result.quotes) ||
      result.quotes.length !== quoteIds.length
    ) {
      throw new BadGatewayException('Gemini returned an incomplete analysis.');
    }

    const returnedIds = result.quotes.map((quote) => {
      this.validateQuote(quote);
      return quote.quoteId;
    });
    if (
      returnedIds.some((id) => !quoteIds.includes(id)) ||
      new Set(returnedIds).size !== quoteIds.length
    ) {
      throw new BadGatewayException(
        'Gemini returned unexpected quote references.',
      );
    }
  }

  private validateQuote(value: unknown): asserts value is QuoteAnalysis {
    if (
      !isExactObject(value, [
        'quoteId',
        'requirementMatch',
        'price',
        'delivery',
        'warranty',
        'strengths',
        'weaknesses',
        'issues',
      ]) ||
      !isNonEmptyString(value.quoteId) ||
      !isScore(value.requirementMatch) ||
      !isScore(value.price) ||
      !isScore(value.delivery) ||
      !isScore(value.warranty) ||
      !isStringList(value.strengths) ||
      !isStringList(value.weaknesses) ||
      !Array.isArray(value.issues) ||
      !value.issues.every(isIssue)
    ) {
      throw new BadGatewayException('Gemini returned invalid quote details.');
    }
  }
}

function isExactObject(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isNonEmptyString(value: unknown) {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 5000
  );
}

function isScore(value: unknown) {
  return (
    isExactObject(value, ['score', 'explanation']) &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    isNonEmptyString(value.explanation)
  );
}

function isStringList(value: unknown) {
  return (
    Array.isArray(value) && value.length <= 50 && value.every(isNonEmptyString)
  );
}

function isIssue(value: unknown) {
  return (
    isExactObject(value, ['type', 'description']) &&
    (value.type === 'missing' ||
      value.type === 'conflicting' ||
      value.type === 'problematic') &&
    isNonEmptyString(value.description)
  );
}
