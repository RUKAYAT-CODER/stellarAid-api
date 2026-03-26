import { IsNotEmpty, IsNumber, IsString, IsOptional, Min, Matches } from 'class-validator';
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

  @ApiProperty({ example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', description: 'Stellar blockchain transaction hash (64 hex characters)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Transaction hash must be a valid Stellar transaction hash (64 hexadecimal characters)',
  })
  transactionHash: string;

  @ApiProperty({
    example: false,
    description: 'Whether donation is anonymous',
    default: false,
  })
  @IsOptional()
  isAnonymous?: boolean = false;
}
