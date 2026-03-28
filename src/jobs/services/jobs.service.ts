import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  constructor(@InjectQueue('projects') private readonly projectsQueue: Queue) {}

  async onModuleInit() {
    this.logger.log('Initializing background jobs...');
    await this.setupRepeatableJobs();
  }

  private async setupRepeatableJobs() {
    // Clear existing repeatable jobs to avoid duplicates on restart
    const repeatableJobs = await this.projectsQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.projectsQueue.removeRepeatableByKey(job.key);
    }

    // Schedule update funding totals every 5 minutes
    await this.projectsQueue.add(
      'update-funding-totals',
      {},
      {
        repeat: { cron: '*/5 * * * *' },
        jobId: 'update-funding-totals-repeat',
      },
    );

    // Schedule expiration check every hour (or at every 5 mins too)
    await this.projectsQueue.add(
      'check-expired-projects',
      {},
      {
        repeat: { cron: '0 * * * *' },
        jobId: 'check-expired-projects-repeat',
      },
    );

    this.logger.log('Repeatable jobs scheduled:');
    this.logger.log('- update-funding-totals (every 5 mins)');
    this.logger.log('- check-expired-projects (every hour)');
  }
}
