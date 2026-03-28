import {
  IsUUID,
  IsNumber,
  IsNotEmpty,
  IsPositive,
  Max,
  IsOptional,
  IsIn,
} from 'class-validator';

export class CreateWithdrawalDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @IsNumber()
  @IsPositive()
  @Max(999999999.9999999)
  amount: number;

  @IsOptional()
  @IsIn(['XLM', 'USDC', 'NGNT'])
  assetType?: string;
}
