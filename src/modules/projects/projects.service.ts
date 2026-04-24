import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PauseProjectDto } from './dto/pause-project.dto';
import { ResumeProjectDto } from './dto/resume-project.dto';
import { CompleteProjectDto } from './dto/complete-project.dto';
import { ProjectStatus, UserRole, AuditActionType } from '../../generated/prisma';
import { validateStatusTransition, isProjectAcceptingDonations } from './utils/status-transition.validator';
import { EmailService } from '../users/email.service';

@Injectable()
export class P
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  
  constructor(private readonly prisma: PrismaService) {}

  async create(creatorId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: { ...dto, creatorId },
    });
  }

  async findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async checkAuthorization(projectId: string, userId: string, userRole: UserRole): Promise<void> {
    const project = await this.findOne(projectId);
    
    const isCreator = project.creatorId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException('Only project creator or admin can change project status');
    }
  }

  async autoCompleteIfDeadlinePassed(projectId: string): Promise<void> {
    const project = await this.findOne(projectId);

    if (project.status === ProjectStatus.ACTIVE && project.endDate && new Date() > project.endDate) {
      await this.completeProject(projectId, 'Auto-completed: deadline passed', null);
    }
  }

  async pauseProject(projectId: string, userId: string, userRole: UserRole, dto: PauseProjectDto) {
    // Check authorization
    await this.checkAuthorization(projectId, userId, userRole);

    const project = await this.findOne(projectId);

    // Validate status transition
    validateStatusTransition(project.status, ProjectStatus.PAUSED);

    // Update project status
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PAUSED,
        pausedAt: new Date(),
        updatedAt: new Date(),
      },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.PAUSED,
        reason: dto.reason || 'Project paused by creator',
      },
    });

    return updatedProject;
  }

  async resumeProject(projectId: string, userId: string, userRole: UserRole, dto: ResumeProjectDto) {
    // Check authorization
    await this.checkAuthorization(projectId, userId, userRole);

    const project = await this.findOne(projectId);

    // Validate status transition
    validateStatusTransition(project.status, ProjectStatus.ACTIVE);

    // Check if deadline has passed
    if (project.endDate && new Date() > project.endDate) {
      throw new BadRequestException('Cannot resume project: deadline has passed');
    }

    // Update project status
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.ACTIVE,
        pausedAt: null,
        updatedAt: new Date(),
      },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.ACTIVE,
        reason: dto.reason || 'Project resumed by creator',
      },
    });

    return updatedProject;
  }

  async completeProject(projectId: string, userId: string | null, userRole: UserRole | null, dto?: CompleteProjectDto) {
    // If userId and userRole are provided, check authorization (manual completion)
    if (userId && userRole) {
      await this.checkAuthorization(projectId, userId, userRole);
    }

    const project = await this.findOne(projectId);

    // Validate status transition
    if (project.status !== ProjectStatus.ACTIVE && project.status !== ProjectStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot complete project in ${project.status} status. Project must be ACTIVE or PAUSED`,
      );
    }

    // Update project status
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.COMPLETED,
        updatedAt: new Date(),
      },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.COMPLETED,
        reason: dto?.reason || 'Project completed',
      },
    });

    return updatedProject;
  }

  async canAcceptDonations(projectId: string): Promise<boolean> {
    const project = await this.findOne(projectId);
    return isProjectAcceptingDonations(project.status);
  }

  async getStatusHistory(projectId: string) {
    const project = await this.findOne(projectId); // Verify project exists

    return this.prisma.projectStatusHistory.findMany({
      where: { projectId },

  async approveProject(projectId: string, adminId: string, remarks?: string) {
    const project = await this.findOne(projectId);

    // Validate status transition (PENDING -> APPROVED)
    if (project.status !== ProjectStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve project in ${project.status} status. Project must be in PENDING status`,
      );
    }

    // Update project status atomically
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.APPROVED,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
      include: { creator: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.APPROVED,
        reason: 'Project approved by admin',
      },
    });

    // Record audit log
    await this.createAuditLog(
      adminId,
      AuditActionType.PROJECT_APPROVED,
      projectId,
      remarks || 'Project approved',
    );

    // Send email notification to creator
    await this.emailService.sendProjectApprovalEmail(
      updatedProject.creator.email,
      updatedProject.title,
      remarks,
    );

    return updatedProject;
  }

  async rejectProject(projectId: string, adminId: string, rejectionReason: string) {
    const project = await this.findOne(projectId);

    // Validate status transition (PENDING -> REJECTED)
    if (project.status !== ProjectStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject project in ${project.status} status. Project must be in PENDING status`,
      );
    }

    // Update project status atomically
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason,
        updatedAt: new Date(),
      },
      include: { creator: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.REJECTED,
        reason: rejectionReason,
      },
    });

    // Record audit log
    await this.createAuditLog(
      adminId,
      AuditActionType.PROJECT_REJECTED,
      projectId,
      rejectionReason,
    );

    // Send email notification to creator
    await this.emailService.sendProjectRejectionEmail(
      updatedProject.creator.email,
      updatedProject.title,
      rejectionReason,
    );

    return updatedProject;
  }

  private async createAuditLog(
    adminId: string,
    action: AuditActionType,
    projectId?: string,
    remarks?: string,
    userId?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          adminId,
          projectId,
          userId,
          remarks,
        },
      });
    } catch (error) {
      // Log audit failure but don't fail the main operation
      console.error('Failed to create audit log:', error);
    }
  }
      orderBy: { createdAt: 'desc' },
    });
  }
}
