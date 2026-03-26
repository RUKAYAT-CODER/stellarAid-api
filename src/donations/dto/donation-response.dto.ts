import { ApiProperty } from '@nestjs/swagger';
import { Donation } from '../entities/donation.entity';

export class DonationResponseDto {
  @ApiProperty({ example: 'donation-uuid', description: 'Donation ID' })
  id: string;

  @ApiProperty({ example: 'project-uuid', description: 'Project ID' })
  projectId: string;

  @ApiProperty({
    example: 'donor-uuid',
    nullable: true,
    description: 'Donor ID',
  })
  donorId: string | null;

  @ApiProperty({ example: 100, description: 'Donation amount' })
  amount: number;

  @ApiProperty({ example: 'XLM', description: 'Asset type' })
  assetType: string;

  @ApiProperty({
    example: 'transaction-hash-xyz',
    nullable: true,
    description: 'Transaction hash',
  })
  transactionHash: string | null;

  @ApiProperty({ example: false, description: 'Whether donation is anonymous' })
  isAnonymous: boolean;

  @ApiProperty({
    example: '2024-01-01T00:00:00Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;

  static fromEntity(donation: Donation): DonationResponseDto {
    return {
      id: donation.id,
      projectId: donation.projectId,
      donorId: donation.donorId,
      amount: donation.amount,
      assetType: donation.assetType,
      transactionHash: donation.transactionHash,
      isAnonymous: donation.isAnonymous,
      createdAt: donation.createdAt,
    };
  }
}
