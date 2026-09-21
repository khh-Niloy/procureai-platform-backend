import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createAdminClient } from '@supabase/server/core';

const PROCUREMENT_DOCUMENTS_BUCKET = 'procurement-documents';

@Injectable()
export class SupabaseStorageService {
  private readonly client = createAdminClient();

  async uploadPdf(storageKey: string, pdf: Buffer) {
    const { error } = await this.client.storage
      .from(PROCUREMENT_DOCUMENTS_BUCKET)
      .upload(storageKey, pdf, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Unable to upload quotation PDF: ${error.message}`,
      );
    }
  }

  async createSignedDownloadUrl(storageKey: string, expiresIn = 300) {
    const { data, error } = await this.client.storage
      .from(PROCUREMENT_DOCUMENTS_BUCKET)
      .createSignedUrl(storageKey, expiresIn, { download: true });

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        `Unable to create document download URL: ${error?.message ?? 'Unknown error'}`,
      );
    }

    return data.signedUrl;
  }
}
