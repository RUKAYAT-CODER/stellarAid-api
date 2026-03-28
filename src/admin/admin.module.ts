import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { Donation } from '../donations/entities/donation.entity';
import { ProjectHistory } from '../projects/entities/project-history.entity';
import { Withdrawal } from '../withdrawals/entities/withdrawal.entity';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Project,
      Donation,
      ProjectHistory,
      Withdrawal,
    ]),
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService, RolesGuard],
})
export class AdminModule {}
