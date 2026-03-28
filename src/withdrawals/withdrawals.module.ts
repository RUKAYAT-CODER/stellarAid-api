import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Withdrawal } from './entities/withdrawal.entity';
import { WithdrawalsController } from './withdrawals.controller';
import { AdminWithdrawalsController } from './admin-withdrawals.controller';
import { WithdrawalsService } from './providers/withdrawals.service';
import { StellarPayoutService } from './providers/stellar-payout.service';
import { Project } from '../projects/entities/project.entity';
import { MailModule } from '../mail/mail.module';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Withdrawal, Project]), MailModule],
  controllers: [WithdrawalsController, AdminWithdrawalsController],
  providers: [WithdrawalsService, StellarPayoutService, RolesGuard],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
