import { WithdrawalResponseDto } from './withdrawal-response.dto';

export class WithdrawalHistoryResponseDto {
  withdrawals: WithdrawalResponseDto[];
  totalWithdrawn: number;
}
