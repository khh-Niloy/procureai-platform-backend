import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class AnalyzeQuotesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  quoteIds: string[];
}
