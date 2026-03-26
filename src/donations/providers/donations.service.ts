import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from '../entities/donation.entity';
import { CreateDonationDto } from '../dto/create-donation.dto';
import { UpdateDonationDto } from '../dto/update-donation.dto';
import { DonationResponseDto } from '../dto/donation-response.dto';

@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(Donation)
    private donationsRepository: Repository<Donation>,
  ) {}

  async create(
    createDonationDto: CreateDonationDto,
  ): Promise<DonationResponseDto> {
    try {
      const donation = this.donationsRepository.create({
        ...createDonationDto,
      });

      const savedDonation = await this.donationsRepository.save(donation);
      return DonationResponseDto.fromEntity(savedDonation);
    } catch (error) {
      if (error.code === '23505') {
        // PostgreSQL unique violation
        throw new ConflictException(
          'A donation with this transaction hash already exists',
        );
      }
      throw new BadRequestException('Failed to create donation');
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: DonationResponseDto[]; total: number }> {
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
