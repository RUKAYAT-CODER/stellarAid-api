import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDonationDto {
  @ApiProperty({
    example: 'project-uuid',
    description: 'Project ID to donate to',
  })
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @ApiProperty({ example: 100, description: 'Donation amount' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @ApiProperty({
    example: 'XLM',
    description: 'Asset type for donation',
    default: 'XLM',
  })
  @IsOptional()
  @IsString()
  assetType?: string;

  @ApiProperty({
    example: 'transaction-hash-xyz',
    description: 'Blockchain transaction hash',
  })
  @IsNotEmpty()
  @IsString()
  transactionHash: string;

  @ApiProperty({
    example: false,
    description: 'Whether donation is anonymous',
    default: false,
  })
  @IsOptional()
  isAnonymous?: boolean = false;
}
