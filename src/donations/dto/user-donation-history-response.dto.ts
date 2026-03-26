import { ApiProperty } from '@nestjs/swagger';
import { Donation } from '../entities/donation.entity';

export class ProjectInfoDto {
  @ApiProperty({ example: 'project-uuid', description: 'Project ID' })
  id: string;

  @ApiProperty({ example: 'Education Fund', description: 'Project title' })
  title: string;

  @ApiProperty({
    example: 'https://example.com/project-image.jpg',
    nullable: true,
    description: 'Project image URL',
  })
  imageUrl: string | null;

  @ApiProperty({ example: 'education', description: 'Project category' })
  category: string;

  @ApiProperty({ example: 'active', description: 'Project status' })
  status: string;
}

export class UserDonationItemDto {
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
    example: 'verified',
    description: 'Transaction status',
    enum: ['pending', 'verified', 'failed'],
  })
  transactionStatus: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00Z',
    description: 'Donation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    type: ProjectInfoDto,
    nullable: true,
    description: 'Project information',
  })
  project: ProjectInfoDto | null;

  static fromEntity(
    donation: Donation,
    blockchainExplorerBaseUrl: string = 'https://stellar.expert/explorer/public/tx',
  ): UserDonationItemDto {
    return {
      id: donation.id,
      amount: Number(donation.amount),
      assetType: donation.assetType,
      transactionHash: donation.transactionHash,
      blockchainExplorerUrl: donation.transactionHash
        ? `${blockchainExplorerBaseUrl}/${donation.transactionHash}`
        : null,
      isAnonymous: donation.isAnonymous,
      transactionStatus: donation.transactionHash ? 'verified' : 'pending',
      createdAt: donation.createdAt,
      project: donation.project
        ? ({
            id: donation.project.id,
            title: donation.project.title,
            imageUrl: donation.project.imageUrl,
            category: donation.project.category,
            status: donation.project.status,
          } as ProjectInfoDto)
        : null,
    };
  }
}

export class UserDonationSummaryDto {
  @ApiProperty({ example: 50, description: 'Total number of donations' })
  totalDonations: number;

  @ApiProperty({ example: 25000.5, description: 'Total amount donated' })
  totalAmount: number;

  @ApiProperty({ example: 500.01, description: 'Average donation amount' })
  averageDonation: number;

  @ApiProperty({ example: 10, description: 'Number of projects donated to' })
  projectsSupported: number;

  @ApiProperty({
    example: '2024-01-01T00:00:00Z',
    description: 'First donation date',
  })
  firstDonationDate: Date | null;

  @ApiProperty({
    example: '2024-12-31T00:00:00Z',
    description: 'Last donation date',
  })
  lastDonationDate: Date | null;
}

export class UserDonationHistoryResponseDto {
  @ApiProperty({
    type: [UserDonationItemDto],
    description: 'List of user donations',
  })
  data: UserDonationItemDto[];

  @ApiProperty({ example: 50, description: 'Total number of donations' })
  total: number;

  @ApiProperty({ example: 1, description: 'Current page' })
  page: number;

  @ApiProperty({ example: 10, description: 'Items per page' })
  limit: number;

  @ApiProperty({
    type: UserDonationSummaryDto,
    description: 'Donation summary statistics',
  })
  summary: UserDonationSummaryDto;
}
