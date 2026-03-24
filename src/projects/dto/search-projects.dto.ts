import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ProjectCategory } from 'src/common/enums/project-category.enum';
import { ProjectStatus } from 'src/common/enums/project-status.enum';
import { ProjectSortBy } from 'src/common/enums/projects-sortBy.enum';
import { Transform, Type } from 'class-transformer';

export class SearchProjectsDto {
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsEnum(ProjectCategory)
  @IsOptional()
  category?: ProjectCategory;

  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @IsArray()
  @IsEnum(ProjectCategory, { each: true })
  @IsOptional()
  categories?: ProjectCategory[];

  @IsArray()
  @IsEnum(ProjectStatus, { each: true })
  @IsOptional()
  statuses?: ProjectStatus[];

  @IsEnum(ProjectSortBy)
  @IsOptional()
  sortBy?: ProjectSortBy;

  @Type(() => Number)
  @IsOptional()
  limit?: number = 10;

  @Type(() => Number)
  @IsOptional()
  offset?: number = 0;

  @IsString()
  @IsOptional()
  minGoal?: string;

  @IsString()
  @IsOptional()
  maxGoal?: string;

  @IsString()
  @IsOptional()
  minRaised?: string;

  @IsString()
  @IsOptional()
  maxRaised?: string;
}
