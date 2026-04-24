import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PrismaModule } from '../../database/prisma.module';
import { EmailService } from '../users/email.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, EmailService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
