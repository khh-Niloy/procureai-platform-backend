import { Type } from 'class-transformer';
import {
  IsArray,
  IsDecimal,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class CreateQuoteItemDto {
  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDecimal()
  quantity: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsDecimal()
  unitPrice: string;

  @IsDecimal()
  totalPrice: string;

  @IsOptional()
  specifications?: Record<string, unknown>;
}

export class CreateQuoteDto {
  @IsUUID()
  purchaseRequestId: string;

  @IsDecimal()
  @IsOptional()
  subtotal?: string;

  @IsDecimal()
  @IsOptional()
  discount?: string;

  @IsDecimal()
  @IsOptional()
  tax?: string;

  @IsDecimal()
  @IsOptional()
  shippingCost?: string;

  @IsDecimal()
  totalAmount: string;

  @IsIn(['USD', 'EUR', 'GBP', 'BDT'])
  currency: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  deliveryDays?: number;

  @IsString()
  @IsOptional()
  deliveryTerms?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  warrantyMonths?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  validityDays?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items: CreateQuoteItemDto[];
}
