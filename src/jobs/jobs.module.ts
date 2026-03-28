import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProjectsJobProcessor } from './processors/projects.processor';
import { JobsService } from './services/jobs.service';
import { ProjectsModule } from '../projects/projects.module';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'projects',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      },
    }),
    // We import ProjectsModule to have access to project services/repositories
    ProjectsModule,
  ],
  providers: [ProjectsJobProcessor, JobsService],
  exports: [BullModule, JobsService],
})
export class JobsModule {}
