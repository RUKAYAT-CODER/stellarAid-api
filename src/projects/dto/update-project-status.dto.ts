import { IsString, IsOptional, IsIn } from 'class-validator';
import { ProjectStatus } from 'src/common/enums/project-status.enum';

export class UpdateProjectStatusDto {
  @IsString()
  @IsOptional()
  @IsIn([ProjectStatus.PAUSED, ProjectStatus.ACTIVE, ProjectStatus.COMPLETED])
  status: ProjectStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
