import { WithdrawalStatus } from '../../common/enums/withdrawal-status.enum';

export class WithdrawalResponseDto {
  id: string;
  projectId: string;
  amount: number;
  assetType: string;
  status: WithdrawalStatus;
  transactionHash: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
