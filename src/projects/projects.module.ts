import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Project } from './entities/project.entity';
import { Donation } from '../donations/entities/donation.entity';
import { ProjectHistory } from './entities/project-history.entity';
import { ProjectImage } from './entities/project-image.entity';
import { User } from '../users/entities/user.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './providers/projects.service';
import { ImageUploadService } from './services/image-upload.service';
import { FileUploadService } from '../common/services/file-upload.service';
import { SearchService } from './services/search.service';
import { AnalyticsService } from './services/analytics.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      Donation,
      ProjectHistory,
      ProjectImage,
      User,
    ]),
    MulterModule.register({
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 10, // Max 10 files per request
      },
    }),
    MailModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ImageUploadService,
    FileUploadService,
    SearchService,
    AnalyticsService,
  ],
  exports: [
    ProjectsService,
    ImageUploadService,
    SearchService,
    AnalyticsService,
  ],
})
export class ProjectsModule {}
