import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ProjectStatus } from 'src/common/enums/project-status.enum';
import { ProjectSortBy } from 'src/common/enums/projects-sortBy.enum';
import { ProjectsGateway } from '../gateways/projects.gateway';
import { Project } from '../entities/project.entity';
import { ProjectHistory } from '../entities/project-history.entity';
import { Donation } from '../../donations/entities/donation.entity';
import { User } from '../../users/entities/user.entity';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { GetProjectsQueryDto } from '../dto/get-projects-query.dto';
import { UpdateProjectStatusDto } from '../dto/update-project-status.dto';
import { UserRole } from 'src/common/enums/user-role.enum';
import { AdminUpdateProjectStatusDto } from '../dto/admin-update-project.dto';
import { MailService } from '../../mail/mail.service';
import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(ProjectHistory)
    private readonly projectHistoryRepository: Repository<ProjectHistory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => ProjectsGateway))
    private readonly projectsGateway: ProjectsGateway,
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
      throw new ForbiddenException(
        'Only creator or admin can change project status',
      );
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
    const isAdminAction = userRole === 'admin';
    await this.projectHistoryRepository.save({
      previousStatus,
      newStatus,
      reason: reason || null,
      adminNotes: null,
      isAdminAction,
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

  // update project details (creator or admin only)
  public async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
    userId: string,
    userRole: string,
  ): Promise<Project> {
    // 1. Fetch project with creator info
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // 2. Check authorization - must be creator or admin
    const isCreator = project.creatorId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException(
        'Only project creator or admin can update project',
      );
    }

    // 3. Prevent updates to completed or rejected projects
    if (project.status === ProjectStatus.COMPLETED) {
      throw new BadRequestException('Cannot update a completed project');
    }

    if (project.status === ProjectStatus.REJECTED) {
      throw new BadRequestException('Cannot update a rejected project');
    }

    // 4. Allow only specific fields to be updated
    if (updateProjectDto.projectName) {
      project.title = updateProjectDto.projectName;
    }

    if (updateProjectDto.projectDesc) {
      project.description = updateProjectDto.projectDesc;
    }

    if (updateProjectDto.projectImage) {
      project.imageUrl = updateProjectDto.projectImage;
    }

    if (updateProjectDto.category) {
      project.category = updateProjectDto.category;
    }

    // Note: Story field would require a migration to add to Project entity
    // For now, it's omitted but can be added by extending the entity

    // 5. Prevent updates to critical fields (goal, deadline) - they can only be changed by admin
    // These fields are intentionally not updatable in this endpoint

    try {
      // 6. Save and return updated project
      const updatedProject = await this.projectRepository.save(project);
      return updatedProject;
    } catch (error) {
      this.logger.error('Error updating project:', error);
      throw new BadRequestException('Failed to update project');
    }
  }

  // admin approve project
  public async approveProject(
    id: string,
    adminId: string,
    updateDto: AdminUpdateProjectStatusDto,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Validate that project is in PENDING status
    if (project.status !== ProjectStatus.PENDING) {
      throw new BadRequestException(
        `Only projects in PENDING status can be approved. Current status: ${project.status}`,
      );
    }

    const previousStatus = project.status;

    // Update project status to APPROVED
    project.status = ProjectStatus.APPROVED;
    project.rejectionReason = null; // Clear any previous rejection reason
    await this.projectRepository.save(project);

    // Record status change in history with admin action flag
    await this.projectHistoryRepository.save({
      previousStatus,
      newStatus: ProjectStatus.APPROVED,
      reason: updateDto.reason || 'Project approved by admin',
      adminNotes: updateDto.adminNotes || null,
      isAdminAction: true,
      projectId: id,
      changedBy: adminId,
    });

    // Send notification email to creator
    try {
      await this.sendApprovalNotification(
        project.creator,
        project,
        updateDto.reason,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send approval notification for project ${id}:`,
        error.message,
      );
      // Don't throw - email failure shouldn't rollback the approval
    }

    // Log admin action
    this.logger.log(
      `Admin ${adminId} approved project ${id}. Reason: ${updateDto.reason || 'No reason provided'}`,
    );

    return project;
  }

  // admin reject project
  public async rejectProject(
    id: string,
    adminId: string,
    updateDto: AdminUpdateProjectStatusDto,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Validate that project is in PENDING or APPROVED status
    if (
      ![ProjectStatus.PENDING, ProjectStatus.APPROVED].includes(project.status)
    ) {
      throw new BadRequestException(
        `Only projects in PENDING or APPROVED status can be rejected. Current status: ${project.status}`,
      );
    }

    // Require a reason for rejection
    if (!updateDto.reason || updateDto.reason.trim() === '') {
      throw new BadRequestException('Rejection reason is required');
    }

    const previousStatus = project.status;

    // Update project status to REJECTED and save the reason
    project.status = ProjectStatus.REJECTED;
    project.rejectionReason = updateDto.reason.trim();
    await this.projectRepository.save(project);

    // Record status change in history with admin action flag
    await this.projectHistoryRepository.save({
      previousStatus,
      newStatus: ProjectStatus.REJECTED,
      reason: updateDto.reason,
      adminNotes: updateDto.adminNotes || null,
      isAdminAction: true,
      projectId: id,
      changedBy: adminId,
    });

    // Send notification email to creator
    try {
      await this.sendRejectionNotification(
        project.creator,
        project,
        updateDto.reason,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send rejection notification for project ${id}:`,
        error.message,
      );
      // Don't throw - email failure shouldn't rollback the rejection
    }

    // Log admin action
    this.logger.log(
      `Admin ${adminId} rejected project ${id}. Reason: ${updateDto.reason}`,
    );

    return project;
  }

  // send approval notification email
  private async sendApprovalNotification(
    creator: User,
    project: Project,
    reason?: string,
  ): Promise<void> {
    const templatePath = path.join(
      __dirname,
      '../../mail/templates/project-approval.ejs',
    );
    const template = fs.readFileSync(templatePath, 'utf-8');

    const templateData = {
      firstName: creator.firstName,
      projectName: project.title,
      projectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${project.id}`,
      reason: reason || 'Your project meets all requirements.',
      currentDate: new Date().toLocaleDateString(),
      currentYear: new Date().getFullYear(),
    };

    const html = ejs.render(template, templateData);

    await this.mailService['sendMail']({
      from: process.env.MAIL_FROM || 'noreply@stellaraid.com',
      to: creator.email,
      subject: `[StellarAid] Your project "${project.title}" has been approved!`,
      html,
    });

    this.logger.log(
      `Approval notification sent to creator of project ${project.id}`,
    );
  }

  // send rejection notification email
  private async sendRejectionNotification(
    creator: User,
    project: Project,
    reason: string,
  ): Promise<void> {
    const templatePath = path.join(
      __dirname,
      '../../mail/templates/project-rejection.ejs',
    );
    const template = fs.readFileSync(templatePath, 'utf-8');

    const templateData = {
      firstName: creator.firstName,
      projectName: project.title,
      reason: reason,
      resubmitUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${project.id}/edit`,
      currentDate: new Date().toLocaleDateString(),
      currentYear: new Date().getFullYear(),
    };

    const html = ejs.render(template, templateData);

    await this.mailService['sendMail']({
      from: process.env.MAIL_FROM || 'noreply@stellaraid.com',
      to: creator.email,
      subject: `[StellarAid] Update on your project "${project.title}"`,
      html,
    });

    this.logger.log(
      `Rejection notification sent to creator of project ${project.id}`,
    );
  }

  // update all active project funding totals
  public async updateProjectFundingTotals(): Promise<void> {
    const activeProjects = await this.projectRepository.find({
      where: [
        { status: ProjectStatus.ACTIVE },
        { status: ProjectStatus.APPROVED },
      ],
    });

    for (const project of activeProjects) {
      const stats = await this.donationRepository
        .createQueryBuilder('donation')
        .select('COALESCE(SUM(donation.amount), 0)', 'totalRaised')
        .addSelect('COUNT(donation.id)', 'donationCount')
        .where('donation.projectId = :projectId', { projectId: project.id })
        .andWhere('donation.verified = :verified', { verified: true })
        .getRawOne();

      const totalRaised = Number(stats.totalRaised);
      const donationCount = Number(stats.donationCount);

      // Check if project status should be completed if goal reached or deadline passed
      let status = project.status;
      const progress =
        project.goalAmount > 0
          ? Math.min((totalRaised / project.goalAmount) * 100, 100)
          : 0;

      if (totalRaised >= project.goalAmount && project.goalAmount > 0) {
        // Goal reached, but typically we keep it active until creator completes it or deadline passes
        // Some platforms auto-complete, let's keep it active but update totals
      }

      if (project.deadline && project.deadline < new Date()) {
        status = ProjectStatus.COMPLETED;
      }

      // Update project record
      await this.projectRepository.update(project.id, {
        fundsRaised: totalRaised,
        donationCount: donationCount,
        progress: Number(progress.toFixed(2)),
        status,
      });

      // Emit real-time update
      this.projectsGateway.emitProjectUpdate(project.id, {
        fundsRaised: totalRaised,
        donationCount: donationCount,
        progress: Number(progress.toFixed(2)),
        status,
      });
    }
  }
}
