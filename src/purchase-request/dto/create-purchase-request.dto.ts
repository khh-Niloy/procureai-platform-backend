import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsDecimal,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseRequestItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  specifications?: Record<string, any>;
}

export class CreatePurchaseRequestDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDecimal()
  @IsOptional()
  budget?: string;

  @IsString()
  @IsOptional()
  @IsIn(['USD', 'EUR', 'GBP', 'BDT'])
  currency?: string;

  @IsDateString()
  @IsOptional()
  requiredBy?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRequestItemDto)
  items: CreatePurchaseRequestItemDto[];
}
