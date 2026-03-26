import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from '../entities/donation.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { CreateDonationDto } from '../dto/create-donation.dto';
import { UpdateDonationDto } from '../dto/update-donation.dto';
import { DonationResponseDto } from '../dto/donation-response.dto';
import { StellarBlockchainService } from '../../common/services/stellar-blockchain.service';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(Donation)
    private donationsRepository: Repository<Donation>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private stellarBlockchainService: StellarBlockchainService,
    private mailService: MailService,
  ) {}

  async create(createDonationDto: CreateDonationDto, donorId?: string): Promise<DonationResponseDto> {
    const { projectId, transactionHash, amount, assetType = 'XLM', isAnonymous = false } = createDonationDto;

    try {
      // 1. Check if project exists
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      // 2. Check for duplicate transaction hash
      const existingDonation = await this.donationsRepository.findOne({
        where: { transactionHash },
      });

      if (existingDonation) {
        throw new ConflictException('A donation with this transaction hash already exists');
      }

      // 3. Verify transaction on Stellar blockchain
      const verificationResult = await this.stellarBlockchainService.verifyTransaction(transactionHash);

      if (!verificationResult.isValid) {
        throw new BadRequestException(
          `Transaction verification failed: ${verificationResult.error || 'Unknown error'}`,
        );
      }

      // 4. Create and save donation
      const donation = this.donationsRepository.create({
        projectId,
        donorId: isAnonymous ? null : donorId || null,
        amount,
        assetType,
        transactionHash,
        isAnonymous,
      });

      const savedDonation = await this.donationsRepository.save(donation);

      // 5. Update project funds_raised and donationCount atomically
      await this.projectRepository.update(
        { id: projectId },
        {
          fundsRaised: () => `CAST(fundsRaised + ${Number(amount)} AS decimal(18,7))`,
          donationCount: () => 'donationCount + 1',
        },
      );

      // 6. Retrieve updated project for progress calculation
      const updatedProject = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (updatedProject) {
        // Calculate progress percentage
        const goalAmount = Number(updatedProject.goalAmount) || 1;
        const fundsRaised = Number(updatedProject.fundsRaised) || 0;
        const progress = Math.min((fundsRaised / goalAmount) * 100, 100);

        // Update progress
        await this.projectRepository.update(
          { id: projectId },
          {
            progress: Math.round(progress * 100) / 100,
          },
        );
      }

      // 7. Send confirmation email to donor (if not anonymous)
      if (!isAnonymous && donorId) {
        this.sendDonationConfirmationEmail(donorId, savedDonation, project).catch((error) => {
          console.error('Error sending donation confirmation email:', error);
          // Don't throw - email failures shouldn't affect the donation success
        });
      }

      return DonationResponseDto.fromEntity(savedDonation);
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Handle database-specific errors
      if (error.code === '23505') {
        // PostgreSQL unique violation
        throw new ConflictException('A donation with this transaction hash already exists');
      }

      if (error.code === '23503') {
        // PostgreSQL foreign key violation
        throw new BadRequestException('Invalid project ID');
      }

      // Log unexpected errors
      console.error('Error creating donation:', error);
      throw new BadRequestException('Failed to create donation');
    }
  }

  private async sendDonationConfirmationEmail(
    donorId: string,
    donation: Donation,
    project: Project,
  ): Promise<void> {
    try {
      const donor = await this.userRepository.findOne({
        where: { id: donorId },
      });

      if (!donor || !donor.email) {
        console.warn(`Unable to send confirmation email - donor ${donorId} not found or has no email`);
        return;
      }

      await this.mailService.sendDonationConfirmationEmail(
        donor.email,
        donor.firstName || 'Donor',
        {
          projectName: project.title,
          amount: Number(donation.amount),
          assetType: donation.assetType,
          transactionHash: donation.transactionHash || '',
          projectId: project.id,
        },
      );
    } catch (error) {
      console.error('Error in sendDonationConfirmationEmail:', error);
      // Silently fail - don't interrupt the donation process
    }
  }

  async findAll(page: number = 1, limit: number = 10): Promise<{ data: DonationResponseDto[]; total: number }> {
    const [data, total] = await this.donationsRepository.findAndCount({
      relations: ['project', 'donor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((donation) => DonationResponseDto.fromEntity(donation)),
      total,
    };
  }

  async findOne(id: string): Promise<DonationResponseDto> {
    const donation = await this.donationsRepository.findOne({
      where: { id },
      relations: ['project', 'donor'],
    });

    if (!donation) {
      throw new NotFoundException(`Donation with ID ${id} not found`);
    }

    return DonationResponseDto.fromEntity(donation);
  }

  async findByProject(
    projectId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: DonationResponseDto[]; total: number }> {
    const [data, total] = await this.donationsRepository.findAndCount({
      where: { projectId },
      relations: ['donor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((donation) => DonationResponseDto.fromEntity(donation)),
      total,
    };
  }

  async findByDonor(
    donorId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: DonationResponseDto[]; total: number }> {
    const [data, total] = await this.donationsRepository.findAndCount({
      where: { donorId },
      relations: ['project'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((donation) => DonationResponseDto.fromEntity(donation)),
      total,
    };
  }

  async findByTransactionHash(
    transactionHash: string,
  ): Promise<DonationResponseDto> {
    const donation = await this.donationsRepository.findOne({
      where: { transactionHash },
      relations: ['project', 'donor'],
    });

    if (!donation) {
      throw new NotFoundException(
        `Donation with transaction hash ${transactionHash} not found`,
      );
    }

    return DonationResponseDto.fromEntity(donation);
  }

  async update(
    id: string,
    updateDonationDto: UpdateDonationDto,
  ): Promise<DonationResponseDto> {
    const donation = await this.findOne(id);

    Object.assign(donation, updateDonationDto);

    try {
      const updatedDonation = await this.donationsRepository.save(donation);
      return DonationResponseDto.fromEntity(updatedDonation);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'A donation with this transaction hash already exists',
        );
      }
      throw new BadRequestException('Failed to update donation');
    }
  }

  async remove(id: string): Promise<void> {
    const donation = await this.findOne(id);
    await this.donationsRepository.delete(donation.id);
  }

  async getTotalDonationsForProject(projectId: string): Promise<number> {
    const result = await this.donationsRepository
      .createQueryBuilder('donation')
      .select('SUM(donation.amount)', 'total')
      .where('donation.projectId = :projectId', { projectId })
      .getRawOne();

    return parseFloat(result.total) || 0;
  }

  async getDonationCountForProject(projectId: string): Promise<number> {
    return await this.donationsRepository.count({
      where: { projectId },
    });
  }
}
