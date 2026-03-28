import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { Donation } from '../donations/entities/donation.entity';
import { ProjectHistory } from '../projects/entities/project-history.entity';
import { Withdrawal } from '../withdrawals/entities/withdrawal.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { WithdrawalStatus } from '../common/enums/withdrawal-status.enum';
import { AdminDashboardQueryDto } from './dto/admin-dashboard-query.dto';

export type AdminDashboardActivityItem =
  | {
      type: 'donation';
      occurredAt: string;
      donationId: string;
      projectId: string;
      projectTitle: string;
      amount: number;
      assetType: string;
    }
  | {
      type: 'project_status_change';
      occurredAt: string;
      historyId: string;
      projectId: string;
      projectTitle: string;
      previousStatus: ProjectStatus;
      newStatus: ProjectStatus;
      isAdminAction: boolean;
    }
  | {
      type: 'withdrawal';
      occurredAt: string;
      withdrawalId: string;
      projectId: string;
      projectTitle: string;
      amount: number;
      assetType: string;
      status: WithdrawalStatus;
    };

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(ProjectHistory)
    private readonly projectHistoryRepository: Repository<ProjectHistory>,
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
  ) {}

  async getDashboard(query: AdminDashboardQueryDto) {
    const { start, end } = this.parsePeriod(query.startDate, query.endDate);
    const activityLimit = query.activityLimit ?? 40;
    const perSource = Math.min(50, Math.max(activityLimit, 15));

    const feePercent = this.getPlatformFeePercent();

    const [
      usersByRole,
      projectsByStatus,
      donationTotals,
      donationRows,
      historyRows,
      withdrawalRows,
    ] = await Promise.all([
      this.getUserCountsByRole(),
      this.getProjectCountsByStatus(),
      this.getDonationTotals(start, end),
      this.getRecentDonations(start, end, perSource),
      this.getRecentProjectHistory(start, end, perSource),
      this.getRecentWithdrawals(start, end, perSource),
    ]);

    const totalDonationAmount = donationTotals.totalAmount;
    const platformFeesCollected = totalDonationAmount * (feePercent / 100);

    const recentActivity = this.mergeActivity(
      donationRows,
      historyRows,
      withdrawalRows,
      activityLimit,
    );

    return {
      period: {
        startDate: start?.toISOString() ?? null,
        endDate: end?.toISOString() ?? null,
      },
      users: usersByRole,
      projects: projectsByStatus,
      donations: {
        totalAmount: totalDonationAmount,
        count: donationTotals.count,
      },
      platformFees: {
        feePercentApplied: feePercent,
        totalCollected: platformFeesCollected,
      },
      recentActivity,
    };
  }

  private getPlatformFeePercent(): number {
    const v = parseFloat(process.env.PLATFORM_FEE_PERCENT ?? '0');
    if (!Number.isFinite(v) || v < 0) {
      return 0;
    }
    return Math.min(v, 100);
  }

  private parsePeriod(startDate?: string, endDate?: string): {
    start: Date | null;
    end: Date | null;
  } {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return { start, end };
  }

  private async getUserCountsByRole() {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(user.id)', 'cnt')
      .where('user.deletedAt IS NULL');
    const rows = await qb.groupBy('user.role').getRawMany<{ role: UserRole; cnt: string }>();

    const byRole = Object.values(UserRole).reduce(
      (acc, role) => {
        acc[role] = 0;
        return acc;
      },
      {} as Record<UserRole, number>,
    );

    let total = 0;
    for (const row of rows) {
      const n = parseInt(row.cnt, 10);
      if (row.role in byRole) {
        byRole[row.role as UserRole] = n;
        total += n;
      }
    }

    return { byRole, total };
  }

  private async getProjectCountsByStatus() {
    const qb = this.projectRepository
      .createQueryBuilder('project')
      .select('project.status', 'status')
      .addSelect('COUNT(project.id)', 'cnt');
    const rows = await qb
      .groupBy('project.status')
      .getRawMany<{ status: ProjectStatus; cnt: string }>();

    const byStatus = Object.values(ProjectStatus).reduce(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<ProjectStatus, number>,
    );

    let total = 0;
    for (const row of rows) {
      const n = parseInt(row.cnt, 10);
      if (row.status in byStatus) {
        byStatus[row.status as ProjectStatus] = n;
        total += n;
      }
    }

    return { byStatus, total };
  }

  private async getDonationTotals(start: Date | null, end: Date | null) {
    const qb = this.donationRepository
      .createQueryBuilder('donation')
      .select('COUNT(donation.id)', 'cnt')
      .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalAmount');
    if (start) {
      qb.andWhere('donation.createdAt >= :dStart', { dStart: start });
    }
    if (end) {
      qb.andWhere('donation.createdAt <= :dEnd', { dEnd: end });
    }
    const row = await qb.getRawOne<{ cnt: string; totalAmount: string }>();
    return {
      count: parseInt(row?.cnt ?? '0', 10),
      totalAmount: Number(row?.totalAmount ?? 0),
    };
  }

  private async getRecentDonations(
    start: Date | null,
    end: Date | null,
    take: number,
  ) {
    const qb = this.donationRepository
      .createQueryBuilder('donation')
      .leftJoinAndSelect('donation.project', 'project')
      .orderBy('donation.createdAt', 'DESC')
      .take(take);
    if (start) {
      qb.andWhere('donation.createdAt >= :dStart', { dStart: start });
    }
    if (end) {
      qb.andWhere('donation.createdAt <= :dEnd', { dEnd: end });
    }
    return qb.getMany();
  }

  private async getRecentProjectHistory(
    start: Date | null,
    end: Date | null,
    take: number,
  ) {
    const qb = this.projectHistoryRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.project', 'project')
      .orderBy('history.changedAt', 'DESC')
      .take(take);
    if (start) {
      qb.andWhere('history.changedAt >= :hStart', { hStart: start });
    }
    if (end) {
      qb.andWhere('history.changedAt <= :hEnd', { hEnd: end });
    }
    return qb.getMany();
  }

  private async getRecentWithdrawals(
    start: Date | null,
    end: Date | null,
    take: number,
  ) {
    const qb = this.withdrawalRepository
      .createQueryBuilder('withdrawal')
      .leftJoinAndSelect('withdrawal.project', 'project')
      .orderBy('withdrawal.createdAt', 'DESC')
      .take(take);
    if (start) {
      qb.andWhere('withdrawal.createdAt >= :wStart', { wStart: start });
    }
    if (end) {
      qb.andWhere('withdrawal.createdAt <= :wEnd', { wEnd: end });
    }
    return qb.getMany();
  }

  private mergeActivity(
    donations: Donation[],
    histories: ProjectHistory[],
    withdrawals: Withdrawal[],
    limit: number,
  ): AdminDashboardActivityItem[] {
    const items: AdminDashboardActivityItem[] = [];

    for (const d of donations) {
      items.push({
        type: 'donation',
        occurredAt: d.createdAt.toISOString(),
        donationId: d.id,
        projectId: d.projectId,
        projectTitle: d.project?.title ?? '',
        amount: Number(d.amount),
        assetType: d.assetType,
      });
    }

    for (const h of histories) {
      items.push({
        type: 'project_status_change',
        occurredAt: h.changedAt.toISOString(),
        historyId: h.id,
        projectId: h.projectId,
        projectTitle: h.project?.title ?? '',
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        isAdminAction: h.isAdminAction,
      });
    }

    for (const w of withdrawals) {
      items.push({
        type: 'withdrawal',
        occurredAt: w.createdAt.toISOString(),
        withdrawalId: w.id,
        projectId: w.projectId,
        projectTitle: w.project?.title ?? '',
        amount: Number(w.amount),
        assetType: w.assetType,
        status: w.status,
      });
    }

    items.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return items.slice(0, limit);
  }
}