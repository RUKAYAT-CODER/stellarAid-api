import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Project } from '../entities/project.entity';
import { Donation } from '../../donations/entities/donation.entity';
import { User } from '../../users/entities/user.entity';
import { AnalyticsQueryDto } from '../dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getProjectAnalytics(
    projectId: string,
    userId: string,
    userRole: string,
    query: AnalyticsQueryDto,
  ) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['creator'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user is creator or admin
    const isCreator = project.creatorId === userId;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException(
        'Only creator or admin can access project analytics',
      );
    }

    const {
      startDate,
      endDate,
      granularity = 'daily',
      timezone = 'UTC',
    } = query;

    // Parse dates
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get total statistics
    const totalStats = await this.getTotalStats(projectId, start, end);

    // Get donation trends
    const donationTrends = await this.getDonationTrends(
      projectId,
      start,
      end,
      granularity,
      timezone,
    );

    // Get top donors (anonymized option)
    const topDonors = await this.getTopDonors(projectId, start, end, isCreator);

    // Get funding velocity
    const fundingVelocity = await this.getFundingVelocity(
      projectId,
      start,
      end,
      granularity,
    );

    return {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        goalAmount: Number(project.goalAmount),
        fundsRaised: Number(project.fundsRaised),
        progress: Number(project.progress),
        deadline: project.deadline,
      },
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        granularity,
      },
      totalStats,
      donationTrends,
      topDonors,
      fundingVelocity,
    };
  }

  private async getTotalStats(
    projectId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const stats = await this.donationRepository
      .createQueryBuilder('donation')
      .select('COUNT(donation.id)', 'totalDonations')
      .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalAmount')
      .addSelect('COUNT(DISTINCT donation.donorId)', 'uniqueDonors')
      .addSelect('AVG(donation.amount)', 'averageDonation')
      .addSelect('MAX(donation.amount)', 'maxDonation')
      .addSelect('MIN(donation.amount)', 'minDonation')
      .where('donation.projectId = :projectId', { projectId })
      .andWhere('donation.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne<{
        totalDonations: string;
        totalAmount: string;
        uniqueDonors: string;
        averageDonation: string;
        maxDonation: string;
        minDonation: string;
      }>();

    return {
      totalDonations: Number(stats?.totalDonations ?? 0),
      totalAmount: Number(stats?.totalAmount ?? 0),
      uniqueDonors: Number(stats?.uniqueDonors ?? 0),
      averageDonation: Number(stats?.averageDonation ?? 0),
      maxDonation: Number(stats?.maxDonation ?? 0),
      minDonation: Number(stats?.minDonation ?? 0),
    };
  }

  private async getDonationTrends(
    projectId: string,
    startDate: Date,
    endDate: Date,
    granularity: string,
    timezone: string,
  ) {
    let dateFormat: string;
    switch (granularity) {
      case 'weekly':
        dateFormat =
          "DATE_TRUNC('week', donation.createdAt AT TIME ZONE :timezone)";
        break;
      case 'monthly':
        dateFormat =
          "DATE_TRUNC('month', donation.createdAt AT TIME ZONE :timezone)";
        break;
      case 'daily':
      default:
        dateFormat =
          "DATE_TRUNC('day', donation.createdAt AT TIME ZONE :timezone)";
        break;
    }

    const trends = await this.donationRepository
      .createQueryBuilder('donation')
      .select(dateFormat, 'period')
      .addSelect('COUNT(donation.id)', 'donationCount')
      .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalAmount')
      .addSelect('COUNT(DISTINCT donation.donorId)', 'uniqueDonors')
      .where('donation.projectId = :projectId', { projectId })
      .andWhere('donation.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('period')
      .orderBy('period', 'ASC')
      .setParameter('timezone', timezone)
      .getRawMany<{
        period: Date;
        donationCount: string;
        totalAmount: string;
        uniqueDonors: string;
      }>();

    return trends.map((trend) => ({
      period: trend.period.toISOString(),
      donationCount: Number(trend.donationCount),
      totalAmount: Number(trend.totalAmount),
      uniqueDonors: Number(trend.uniqueDonors),
    }));
  }

  private async getTopDonors(
    projectId: string,
    startDate: Date,
    endDate: Date,
    isCreator: boolean,
  ) {
    const query = this.donationRepository
      .createQueryBuilder('donation')
      .leftJoin('donation.donor', 'donor')
      .select('donor.id', 'donorId')
      .addSelect('donor.firstName', 'firstName')
      .addSelect('donor.lastName', 'lastName')
      .addSelect('donor.avatarUrl', 'avatarUrl')
      .addSelect('COUNT(donation.id)', 'donationCount')
      .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalAmount')
      .addSelect('MAX(donation.createdAt)', 'lastDonationDate')
      .where('donation.projectId = :projectId', { projectId })
      .andWhere('donation.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('donation.isAnonymous = :isAnonymous', { isAnonymous: false })
      .groupBy('donor.id')
      .orderBy('totalAmount', 'DESC')
      .limit(10);

    const donors = await query.getRawMany<{
      donorId: string;
      firstName: string;
      lastName: string;
      avatarUrl: string;
      donationCount: string;
      totalAmount: string;
      lastDonationDate: Date;
    }>();

    // If not the creator, anonymize donor information
    return donors.map((donor) => ({
      id: isCreator ? donor.donorId : null,
      firstName: isCreator ? donor.firstName : null,
      lastName: isCreator ? donor.lastName : null,
      avatarUrl: isCreator ? donor.avatarUrl : null,
      donationCount: Number(donor.donationCount),
      totalAmount: Number(donor.totalAmount),
      lastDonationDate: donor.lastDonationDate.toISOString(),
    }));
  }

  private async getFundingVelocity(
    projectId: string,
    startDate: Date,
    endDate: Date,
    granularity: string,
  ) {
    let dateFormat: string;
    let intervalDays: number;

    switch (granularity) {
      case 'weekly':
        dateFormat = "DATE_TRUNC('week', createdAt)";
        intervalDays = 7;
        break;
      case 'monthly':
        dateFormat = "DATE_TRUNC('month', createdAt)";
        intervalDays = 30;
        break;
      case 'daily':
      default:
        dateFormat = "DATE_TRUNC('day', createdAt)";
        intervalDays = 1;
        break;
    }

    const velocity = await this.donationRepository
      .createQueryBuilder('donation')
      .select(dateFormat, 'period')
      .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalAmount')
      .addSelect('COUNT(donation.id)', 'donationCount')
      .where('donation.projectId = :projectId', { projectId })
      .andWhere('donation.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('period')
      .orderBy('period', 'ASC')
      .getRawMany<{
        period: Date;
        totalAmount: string;
        donationCount: string;
      }>();

    // Calculate velocity metrics
    const velocityData: Array<{
      period: string;
      totalAmount: number;
      donationCount: number;
      growthRate: number;
      averagePerDonation: number;
    }> = [];

    for (let i = 0; i < velocity.length; i++) {
      const current = velocity[i];
      const previous = velocity[i - 1];

      let growthRate = 0;
      if (previous && Number(previous.totalAmount) > 0) {
        growthRate =
          ((Number(current.totalAmount) - Number(previous.totalAmount)) /
            Number(previous.totalAmount)) *
          100;
      }

      velocityData.push({
        period: current.period.toISOString(),
        totalAmount: Number(current.totalAmount),
        donationCount: Number(current.donationCount),
        growthRate: Number(growthRate.toFixed(2)),
        averagePerDonation:
          Number(current.donationCount) > 0
            ? Number(current.totalAmount) / Number(current.donationCount)
            : 0,
      });
    }

    return velocityData;
  }

  async getCreatorAnalytics(userId: string, query: AnalyticsQueryDto) {
    const { startDate, endDate, granularity = 'daily' } = query;

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get all projects for this creator
    const projects = await this.projectRepository.find({
      where: { creatorId: userId },
      select: [
        'id',
        'title',
        'status',
        'goalAmount',
        'fundsRaised',
        'progress',
        'deadline',
        'createdAt',
      ],
    });

    const projectIds = projects.map((p) => p.id);

    // Get overall statistics
    const overallStats = await this.donationRepository
      .createQueryBuilder('donation')
      .select('COUNT(donation.id)', 'totalDonations')
      .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalAmount')
      .addSelect('COUNT(DISTINCT donation.donorId)', 'uniqueDonors')
      .addSelect('COUNT(DISTINCT donation.projectId)', 'activeProjects')
      .where('donation.projectId IN (:...projectIds)', { projectIds })
      .andWhere('donation.createdAt BETWEEN :startDate AND :endDate', {
        startDate: start,
        endDate: end,
      })
      .getRawOne<{
        totalDonations: string;
        totalAmount: string;
        uniqueDonors: string;
        activeProjects: string;
      }>();

    // Get project performance comparison
    const projectPerformance = await Promise.all(
      projects.map(async (project) => {
        const stats = await this.donationRepository
          .createQueryBuilder('donation')
          .select('COUNT(donation.id)', 'donationCount')
          .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalRaised')
          .addSelect('COUNT(DISTINCT donation.donorId)', 'uniqueDonors')
          .where('donation.projectId = :projectId', { projectId: project.id })
          .andWhere('donation.createdAt BETWEEN :startDate AND :endDate', {
            startDate: start,
            endDate: end,
          })
          .getRawOne<{
            donationCount: string;
            totalRaised: string;
            uniqueDonors: string;
          }>();

        return {
          projectId: project.id,
          title: project.title,
          status: project.status,
          goalAmount: Number(project.goalAmount),
          totalRaised: Number(project.fundsRaised),
          periodRaised: Number(stats?.totalRaised ?? 0),
          periodDonations: Number(stats?.donationCount ?? 0),
          periodUniqueDonors: Number(stats?.uniqueDonors ?? 0),
          progress: Number(project.progress),
          deadline: project.deadline,
          createdAt: project.createdAt,
        };
      }),
    );

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        granularity,
      },
      overallStats: {
        totalDonations: Number(overallStats?.totalDonations ?? 0),
        totalAmount: Number(overallStats?.totalAmount ?? 0),
        uniqueDonors: Number(overallStats?.uniqueDonors ?? 0),
        activeProjects: Number(overallStats?.activeProjects ?? 0),
        totalProjects: projects.length,
      },
      projectPerformance: projectPerformance.sort(
        (a, b) => b.periodRaised - a.periodRaised,
      ),
    };
  }
}
