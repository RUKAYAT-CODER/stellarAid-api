import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ProjectStatus } from 'src/common/enums/project-status.enum';
import { ProjectSortBy } from 'src/common/enums/projects-sortBy.enum';
import { Project } from '../entities/project.entity';
import { ProjectHistory } from '../entities/project-history.entity';
import { Donation } from '../entities/donation.entity';
import { CreateProjectDto } from '../dto/create-project.dto';
import { GetProjectsQueryDto } from '../dto/get-projects-query.dto';
import { UpdateProjectStatusDto } from '../dto/update-project-status.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(ProjectHistory)
    private readonly projectHistoryRepository: Repository<ProjectHistory>,
  ) {}

  // create a new project
  public async create(
    createProjectDto: CreateProjectDto,
    creatorId: string,
  ): Promise<Project> {
    const {
      projectName,
      projectDesc,
      projectImage,
      fundingGoal,
      deadline,
      category,
    } = createProjectDto;

    // Validate that the deadline is in the future
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      throw new BadRequestException('Deadline must be a valid date');
    }
    if (deadlineDate <= new Date()) {
      throw new BadRequestException('Deadline must be a future date');
    }

    const project = this.projectRepository.create({
      title: projectName,
      description: projectDesc,
      imageUrl: projectImage,
      goalAmount: fundingGoal,
      deadline: deadlineDate,
      status: ProjectStatus.PENDING,
      progress: 0,
      donationCount: 0,
      fundsRaised: 0,
      creatorId,
      ...(category && { category }),
    });

    return this.projectRepository.save(project);
  }

  // get all projects with filtering, sorting, and pagination
  public async findAll(
    query: GetProjectsQueryDto,
  ): Promise<{ data: Partial<Project>[]; total: number }> {
    const {
      category,
      status,
      search,
      sortBy = ProjectSortBy.NEWEST,
      limit = 10,
      offset = 0,
    } = query;

    const qb: SelectQueryBuilder<Project> = this.projectRepository
      .createQueryBuilder('project')
      .leftJoin('project.creator', 'creator')
      .select([
        'project.id',
        'project.title',
        'project.description',
        'project.category',
        'project.status',
        'project.goalAmount',
        'project.fundsRaised',
        'project.imageUrl',
        'project.deadline',
        'project.createdAt',
        'project.updatedAt',
        // creator info — sensitive fields excluded
        'creator.id',
        'creator.firstName',
        'creator.lastName',
        'creator.walletAddress',
      ]);

    // Default: only APPROVED or ACTIVE projects unless a specific status is requested
    if (status) {
      qb.where('project.status = :status', { status });
    } else {
      qb.where('project.status IN (:...statuses)', {
        statuses: [ProjectStatus.APPROVED, ProjectStatus.ACTIVE],
      });
    }

    if (category) {
      qb.andWhere('project.category = :category', { category });
    }

    if (search) {
      qb.andWhere(
        '(LOWER(project.title) LIKE :search OR LOWER(project.description) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    switch (sortBy) {
      case ProjectSortBy.MOST_FUNDED:
        qb.orderBy('project.fundsRaised', 'DESC');
        break;
      case ProjectSortBy.ENDING_SOON:
        qb.orderBy('project.deadline', 'ASC');
        break;
      case ProjectSortBy.NEWEST:
      default:
        qb.orderBy('project.createdAt', 'DESC');
        break;
    }

    const total = await qb.getCount();

    const data = await qb.skip(offset).take(limit).getMany();

    return { data, total };
  }

  // get detailed project info by ID (public view)
  public async findOnePublic(id: string) {
    const project = await this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.creator', 'creator')
      .where('project.id = :id', { id })
      .andWhere('project.status IN (:...statuses)', {
        statuses: [ProjectStatus.APPROVED, ProjectStatus.ACTIVE],
      })
      .getOne();

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const donationStatsRaw = await this.donationRepository
      .createQueryBuilder('donation')
      .select('COUNT(donation.id)', 'totalDonations')
      .addSelect('COALESCE(SUM(donation.amount), 0)', 'totalAmount')
      .addSelect('COUNT(DISTINCT donation.donorId)', 'uniqueDonors')
      .where('donation.projectId = :projectId', { projectId: id })
      .getRawOne<{
        totalDonations: string;
        totalAmount: string;
        uniqueDonors: string;
      }>();

    const recentDonations = await this.donationRepository
      .createQueryBuilder('donation')
      .leftJoinAndSelect('donation.donor', 'donor')
      .where('donation.projectId = :projectId', { projectId: id })
      .orderBy('donation.createdAt', 'DESC')
      .take(5)
      .getMany();

    const goalAmount = Number(project.goalAmount) || 0;
    const fundsRaised = Number(project.fundsRaised) || 0;
    const progressPercentage =
      goalAmount > 0 ? Math.min((fundsRaised / goalAmount) * 100, 100) : 0;

    return {
      id: project.id,
      title: project.title,
      description: project.description,
      imageUrl: project.imageUrl,
      category: project.category,
      status: project.status,
      goalAmount,
      fundsRaised,
      deadline: project.deadline,
      rejectionReason: project.rejectionReason,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      creator: {
        id: project.creator.id,
        firstName: project.creator.firstName,
        lastName: project.creator.lastName,
        walletAddress: project.creator.walletAddress,
        avatarUrl: project.creator.avatarUrl,
        country: project.creator.country,
      },
      donationSummary: {
        totalDonations: Number(donationStatsRaw?.totalDonations ?? 0),
        totalAmount: Number(donationStatsRaw?.totalAmount ?? 0),
        uniqueDonors: Number(donationStatsRaw?.uniqueDonors ?? 0),
      },
      progressPercentage: Number(progressPercentage.toFixed(2)),
      recentDonations: recentDonations.map((donation) => ({
        id: donation.id,
        amount: Number(donation.amount),
        transactionHash: donation.transactionHash,
        isAnonymous: donation.isAnonymous,
        createdAt: donation.createdAt,
        donor:
          donation.isAnonymous || !donation.donor
            ? null
            : {
                id: donation.donor.id,
                firstName: donation.donor.firstName,
                lastName: donation.donor.lastName,
                avatarUrl: donation.donor.avatarUrl,
              },
      })),
    };
  }

  // validate status transitions
  private validateStatusTransition(
    currentStatus: ProjectStatus,
    newStatus: ProjectStatus,
  ): boolean {
    const validTransitions: Record<ProjectStatus, ProjectStatus[]> = {
      [ProjectStatus.DRAFT]: [ProjectStatus.PENDING],
      [ProjectStatus.PENDING]: [ProjectStatus.APPROVED, ProjectStatus.REJECTED],
      [ProjectStatus.APPROVED]: [ProjectStatus.ACTIVE, ProjectStatus.REJECTED],
      [ProjectStatus.ACTIVE]: [ProjectStatus.PAUSED, ProjectStatus.COMPLETED],
      [ProjectStatus.PAUSED]: [ProjectStatus.ACTIVE, ProjectStatus.COMPLETED],
      [ProjectStatus.COMPLETED]: [], // Completed projects cannot change status
      [ProjectStatus.REJECTED]: [], // Rejected projects cannot change status
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  // update project status
  public async updateStatus(
    id: string,
    updateStatusDto: UpdateProjectStatusDto,
    userId: string,
    userRole: string,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user is creator or admin
    const isCreator = project.creatorId === userId;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException('Only creator or admin can change project status');
    }

    const { status: newStatus, reason } = updateStatusDto;

    // Validate status transition
    if (!this.validateStatusTransition(project.status, newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${project.status} to ${newStatus}`,
      );
    }

    const previousStatus = project.status;

    // Update project status
    project.status = newStatus;
    await this.projectRepository.save(project);

    // Record status change in history
    await this.projectHistoryRepository.save({
      previousStatus,
      newStatus,
      reason: reason || null,
      projectId: id,
      changedBy: userId,
    });

    return project;
  }

  // auto-complete projects past deadline
  public async autocompleteExpiredProjects(): Promise<void> {
    const expiredProjects = await this.projectRepository
      .createQueryBuilder('project')
      .where('project.deadline < :now', { now: new Date() })
      .andWhere('project.status IN (:...statuses)', {
        statuses: [ProjectStatus.ACTIVE, ProjectStatus.PAUSED],
      })
      .getMany();

    for (const project of expiredProjects) {
      project.status = ProjectStatus.COMPLETED;
      await this.projectRepository.save(project);

      // Record auto-completion in history
      await this.projectHistoryRepository.save({
        previousStatus: project.status,
        newStatus: ProjectStatus.COMPLETED,
        reason: 'Auto-completed due to deadline',
        projectId: project.id,
        changedBy: 'system',
      });
    }
  }

  // check if project accepts donations
  public canAcceptDonations(project: Project): boolean {
    return project.status === ProjectStatus.ACTIVE;
  }
}
