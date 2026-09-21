import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { config } from 'src/config';

export const QUOTATION_PDF_QUEUE = 'quotation-pdf';
export const GENERATE_QUOTATION_PDF_JOB = 'generate-quotation-pdf';

export interface QuotationPdfJobData {
  quoteId: string;
  documentId: string;
}

function redisConnection() {
  const redis = new URL(config.redisUrl);
  return {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username || undefined,
    password: redis.password || undefined,
    tls: redis.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class QuotationPdfQueue implements OnModuleDestroy {
  private readonly queue = new Queue<QuotationPdfJobData>(QUOTATION_PDF_QUEUE, {
    connection: redisConnection(),
  });

  async enqueue(data: QuotationPdfJobData) {
    await this.add(data, data.documentId);
  }

  async retry(data: QuotationPdfJobData) {
    const existingJob = await this.queue.getJob(data.documentId);
    if (existingJob && (await existingJob.getState()) === 'failed') {
      await existingJob.retry();
      return;
    }
    await this.add(data, `${data.documentId}-retry-${Date.now()}`);
  }

  private async add(data: QuotationPdfJobData, jobId: string) {
    await this.queue.add(GENERATE_QUOTATION_PDF_JOB, data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}

export { redisConnection };
