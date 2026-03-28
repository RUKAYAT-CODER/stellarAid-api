import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Project } from '../../projects/entities/project.entity';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { WithdrawalStatus } from '../../common/enums/withdrawal-status.enum';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';
import { MailService } from '../../mail/mail.service';
import { StellarPayoutService } from './stellar-payout.service';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    @InjectRepository(Withdrawal)
    private withdrawalsRepository: Repository<Withdrawal>,
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    private mailService: MailService,
    private stellarPayoutService: StellarPayoutService,
  ) {}

  async createWithdrawal(
    createWithdrawalDto: CreateWithdrawalDto,
    userId: string,
  ): Promise<Withdrawal> {
    const { projectId, amount } = createWithdrawalDto;

    // Find project and verify ownership
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: ['creator'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.creatorId !== userId) {
      throw new ForbiddenException('You are not the creator of this project');
    }

    // Check project completion status
    if (project.status !== ProjectStatus.COMPLETED) {
      throw new BadRequestException(
        'Withdrawals can only be requested for completed projects',
      );
    }

    // Validate sufficient funds
    if (amount > project.fundsRaised) {
      throw new BadRequestException(
        'Withdrawal amount cannot exceed total funds raised',
      );
    }

    // Check for existing pending withdrawals for this project
    const existingPendingWithdrawal = await this.withdrawalsRepository.findOne({
      where: {
        projectId,
        status: WithdrawalStatus.PENDING,
      },
    });

    if (existingPendingWithdrawal) {
      throw new BadRequestException(
        'There is already a pending withdrawal request for this project',
      );
    }

    // Calculate total withdrawn amount (excluding pending requests)
    const totalWithdrawn = (await this.withdrawalsRepository
      .createQueryBuilder('withdrawal')
      .where('withdrawal.projectId = :projectId', { projectId })
      .andWhere('withdrawal.status IN (:...statuses)', {
        statuses: [WithdrawalStatus.APPROVED, WithdrawalStatus.PAID],
      })
      .select('SUM(withdrawal.amount)', 'total')
      .getRawOne()) as { total: string } | null;

    const alreadyWithdrawn = parseFloat(totalWithdrawn?.total || '0');
    const availableFunds = project.fundsRaised - alreadyWithdrawn;

    if (amount > availableFunds) {
      throw new BadRequestException(
        `Insufficient available funds. Available: ${availableFunds}, Requested: ${amount}`,
      );
    }

    // Create withdrawal request
    const withdrawal = this.withdrawalsRepository.create({
      projectId,
      amount,
      assetType: createWithdrawalDto.assetType ?? 'XLM',
      status: WithdrawalStatus.PENDING,
    });

    const savedWithdrawal = await this.withdrawalsRepository.save(withdrawal);

    // Notify admins of new withdrawal request
    await this.notifyAdmins(savedWithdrawal, project);

    this.logger.log(
      `Withdrawal request created: ${savedWithdrawal.id} for project: ${projectId} by user: ${userId}`,
    );

    return savedWithdrawal;
  }

  private async notifyAdmins(
    withdrawal: Withdrawal,
    project: Project,
  ): Promise<void> {
    try {
      // In a real implementation, you would fetch admin emails from the database
      // For now, we'll use a hardcoded admin email or get it from config
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@stellaraid.com';

      const withdrawalData = {
        projectName: project.title,
        projectId: project.id,
        amount: withdrawal.amount,
        withdrawalId: withdrawal.id,
        creatorName: `${project.creator.firstName} ${project.creator.lastName}`,
        requestDate: withdrawal.createdAt.toLocaleDateString(),
      };

      // Send notification to admins (you'd need to implement this email template)
      await this.sendWithdrawalRequestNotification(adminEmail, withdrawalData);

      this.logger.log(
        `Admin notification sent for withdrawal request: ${withdrawal.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send admin notification for withdrawal ${withdrawal.id}:`,
        (error as Error).message,
      );
      // Don't throw here - the withdrawal was created successfully
      // Just log the error for debugging
    }
  }

  private async sendWithdrawalRequestNotification(
    adminEmail: string,
    withdrawalData: {
      projectName: string;
      projectId: string;
      amount: number;
      withdrawalId: string;
      creatorName: string;
      requestDate: string;
    },
  ): Promise<void> {
    await this.mailService.sendWithdrawalRequestNotification(
      adminEmail,
      withdrawalData,
    );
  }

  async getProjectWithdrawals(
    projectId: string,
    userId: string,
  ): Promise<Withdrawal[]> {
    // Verify user owns the project
    const project = await this.projectsRepository.findOne({
      where: { id: projectId, creatorId: userId },
    });

    if (!project) {
      throw new NotFoundException('Project not found or access denied');
    }

    return this.withdrawalsRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async getWithdrawalById(id: string, userId: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalsRepository.findOne({
      where: { id },
      relations: ['project', 'project.creator'],
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    // Verify user owns the project
    if (withdrawal.project.creatorId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return withdrawal;
  }

  /**
   * Process an approved withdrawal by sending funds to the creator via Stellar.
   * Only callable by admins. Updates status to PAID and stores the transaction hash.
   */
  async processWithdrawalPayout(withdrawalId: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalsRepository.findOne({
      where: { id: withdrawalId },
      relations: ['project', 'project.creator'],
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot process payout: withdrawal status is '${withdrawal.status}'. Only approved withdrawals can be paid out.`,
      );
    }

    const creatorWallet = withdrawal.project.creator.walletAddress;
    if (!creatorWallet) {
      throw new BadRequestException(
        'Creator does not have a Stellar wallet address configured',
      );
    }

    this.logger.log(
      `Processing payout for withdrawal ${withdrawalId}: ${withdrawal.amount} ${withdrawal.assetType} → ${creatorWallet}`,
    );

    const { transactionHash } = await this.stellarPayoutService.sendPayment({
      destinationAddress: creatorWallet,
      amount: Number(withdrawal.amount),
      assetType: withdrawal.assetType,
      withdrawalId,
    });

    withdrawal.status = WithdrawalStatus.PAID;
    withdrawal.transactionHash = transactionHash;

    const saved = await this.withdrawalsRepository.save(withdrawal);

    this.logger.log(
      `Withdrawal ${withdrawalId} marked as PAID. Transaction hash: ${transactionHash}`,
    );

    return saved;
  }
}
