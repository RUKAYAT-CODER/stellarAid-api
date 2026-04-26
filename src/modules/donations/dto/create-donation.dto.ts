import { IsNotEmpty, IsString, IsDecimal, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateDonationDto {
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsDecimal()
  amount: number;

  @IsOptional()
  @IsString()
  assetCode?: string;

  @IsOptional()
  @IsString()
  assetIssuer?: string;
}