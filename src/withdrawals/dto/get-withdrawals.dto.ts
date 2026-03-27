import { IsOptional, IsDateString } from 'class-validator';

export class GetWithdrawalsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
