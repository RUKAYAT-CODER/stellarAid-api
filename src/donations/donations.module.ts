import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationsController } from './donations.controller';
import { DonationsService } from './providers/donations.service';
import { Donation } from './entities/donation.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Donation, Project, User])],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService, TypeOrmModule],
})
export class DonationsModule {}
