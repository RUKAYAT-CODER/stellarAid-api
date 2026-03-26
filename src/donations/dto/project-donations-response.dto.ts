import { ApiProperty } from '@nestjs/swagger';
import { Donation } from '../entities/donation.entity';

export class DonorInfoDto {
  @ApiProperty({ example: 'donor-uuid', description: 'Donor ID' })
  id: string;

  @ApiProperty({ example: 'John', description: 'Donor first name' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Donor last name' })
  lastName: string;

  @ApiProperty({
    example: 'GAA2M7F4E3C4D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6',
    nullable: true,
    description: 'Donor wallet address',
  })
  walletAddress: string | null;

  @ApiProperty({
    example: 'https://example.com/avatar.jpg',
    nullable: true,
    description: 'Donor avatar URL',
  })
  avatarUrl: string | null;
}

export class ProjectDonationItemDto {
  @ApiProperty({ example: 'donation-uuid', description: 'Donation ID' })
  id: string;

  @ApiProperty({ example: 100, description: 'Donation amount' })
  amount: number;

  @ApiProperty({ example: 'XLM', description: 'Asset type' })
  assetType: string;

  @ApiProperty({
    example: 'transaction-hash-xyz',
    nullable: true,
    description: 'Blockchain transaction hash',
  })
  transactionHash: string | null;

  @ApiProperty({
    example: 'https://stellar.expert/explorer/public/tx/transaction-hash-xyz',
    nullable: true,
    description: 'Blockchain explorer link',
  })
  blockchainExplorerUrl: string | null;

  @ApiProperty({
    example: false,
    description: 'Whether donation is anonymous',
  })
  isAnonymous: boolean;

  @ApiProperty({
    example: '2024-01-01T00:00:00Z',
    description: 'Donation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    type: DonorInfoDto,
    nullable: true,
    description: 'Donor information (null if anonymous)',
  })
  donor: DonorInfoDto | null;
}

export class ProjectDonationsStatsDto {
  @ApiProperty({ example: 150, description: 'Total number of donations' })
  totalDonations: number;

  @ApiProperty({ example: 50000.5, description: 'Total amount donated' })
  totalAmount: number;

  @ApiProperty({ example: 333.33, description: 'Average donation amount' })
  averageDonation: number;

  @ApiProperty({ example: 100, description: 'Number of unique donors' })
  uniqueDonors: number;
}

export class ProjectDonationsResponseDto {
  @ApiProperty({
    type: [ProjectDonationItemDto],
    description: 'List of donations',
  })
  data: ProjectDonationItemDto[];

  @ApiProperty({ example: 150, description: 'Total number of donations' })
  total: number;

  @ApiProperty({ example: 1, description: 'Current page' })
  page: number;

  @ApiProperty({ example: 10, description: 'Items per page' })
  limit: number;

  @ApiProperty({
    type: ProjectDonationsStatsDto,
    description: 'Donation statistics',
  })
  stats: ProjectDonationsStatsDto;

  static fromEntity(
    donation: Donation,
    blockchainExplorerBaseUrl: string = 'https://stellar.expert/explorer/public/tx',
  ): ProjectDonationItemDto {
    const donor = donation.donor
      ? {
          id: donation.donor.id,
          firstName: donation.donor.firstName,
          lastName: donation.donor.lastName,
          walletAddress: donation.donor.walletAddress,
          avatarUrl: donation.donor.avatarUrl,
        }
      : null;

    return {
      id: donation.id,
      amount: Number(donation.amount),
      assetType: donation.assetType,
      transactionHash: donation.transactionHash,
      blockchainExplorerUrl: donation.transactionHash
        ? `${blockchainExplorerBaseUrl}/${donation.transactionHash}`
        : null,
      isAnonymous: donation.isAnonymous,
      createdAt: donation.createdAt,
      donor: donation.isAnonymous ? null : donor,
    };
  }
}
