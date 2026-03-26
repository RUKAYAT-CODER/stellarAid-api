import { IsString, IsOptional, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class AnalyticsQueryDto {
  @IsDateString()
  @IsOptional()
  @Transform(
    ({ value }) =>
      value || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  ) // Default to 30 days ago
  startDate?: string;

  @IsDateString()
  @IsOptional()
  @Transform(({ value }) => value || new Date().toISOString()) // Default to now
  endDate?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || 'daily')
  granularity?: 'daily' | 'weekly' | 'monthly';

  @IsString()
  @IsOptional()
  timezone?: string;
}
