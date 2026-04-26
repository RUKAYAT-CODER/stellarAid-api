import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateDonationDto } from './dto/create-donation.dto';

@Injectable()
export class DonationsService {
  constructor(private prisma: PrismaService) {}

  async create(donorId: string, dto: CreateDonationDto) {
    // Check if project exists and is active
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.status !== 'ACTIVE') {
      throw new NotFoundException('Project is not active for donations');
    }

    // Create donation in a transaction to update raisedAmount
    const result = await this.prisma.$transaction(async (tx) => {
      const donation = await tx.donation.create({
        data: {
          amount: dto.amount,
          assetCode: dto.assetCode,
          assetIssuer: dto.assetIssuer,
          projectId: dto.projectId,
          donorId,
        },
      });

      // Update project's raisedAmount
      await tx.project.update({
        where: { id: dto.projectId },
        data: {
          raisedAmount: {
            increment: dto.amount,
          },
        },
      });

      return donation;
    });

    return result;
  }

  async findAll() {
    return this.prisma.donation.findMany({
      include: {
        project: true,
        donor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async findByProject(projectId: string) {
    return this.prisma.donation.findMany({
      where: { projectId },
      include: {
        donor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
}