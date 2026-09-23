import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';

@Injectable()
export class PdfService {
  async createQuotationPdf(
    viewModel: Record<string, unknown>,
  ): Promise<Buffer> {
    const templatePath = join(__dirname, 'templates', 'quotation.hbs');
    let source: string;

    try {
      source = await readFile(templatePath, 'utf8');
    } catch (error) {
      throw new InternalServerErrorException(
        `Unable to load quotation template: ${(error as Error).message}`,
      );
    }

    const html = Handlebars.compile(source, { noEscape: false })(viewModel);
    const browser = await puppeteer.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
