import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ProjectsService } from '../../projects/providers/projects.service';

@Processor('projects')
export class ProjectsJobProcessor {
  private readonly logger = new Logger(ProjectsJobProcessor.name);

  constructor(private readonly projectsService: ProjectsService) {}

  @Process('update-funding-totals')
  async handleUpdateFundingTotals(job: Job) {
    this.logger.log('Processing update-funding-totals job...');
    try {
      await this.projectsService.updateProjectFundingTotals();
      this.logger.log('Successfully updated funding totals for all active projects.');
    } catch (error) {
      this.logger.error('Error updating project funding totals:', error);
      throw error;
    }
  }

  @Process('check-expired-projects')
  async handleCheckExpiredProjects(job: Job) {
    this.logger.log('Processing check-expired-projects job...');
    try {
      await this.projectsService.autocompleteExpiredProjects();
      this.logger.log('Successfully completed expired projects.');
    } catch (error) {
      this.logger.error('Error completing expired projects:', error);
      throw error;
    }
  }
}
