import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Project } from '../entities/project.entity';
import { ProjectCategory } from 'src/common/enums/project-category.enum';
import { ProjectStatus } from 'src/common/enums/project-status.enum';
import { ProjectSortBy } from 'src/common/enums/projects-sortBy.enum';
import { SearchProjectsDto } from '../dto/search-projects.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  async searchProjects(searchDto: SearchProjectsDto): Promise<{
    data: Partial<Project>[];
    total: number;
    suggestions?: string[];
  }> {
    const {
      search,
      category,
      status,
      categories,
      statuses,
      sortBy = ProjectSortBy.NEWEST,
      limit = 10,
      offset = 0,
      minGoal,
      maxGoal,
      minRaised,
      maxRaised,
    } = searchDto;

    const qb: SelectQueryBuilder<Project> = this.projectRepository
      .createQueryBuilder('project')
      .leftJoin('project.creator', 'creator')
      .select([
        'project.id',
        'project.title',
        'project.description',
        'project.category',
        'project.status',
        'project.goalAmount',
        'project.fundsRaised',
        'project.imageUrl',
        'project.deadline',
        'project.createdAt',
        'project.updatedAt',
        // creator info — sensitive fields excluded
        'creator.id',
        'creator.firstName',
        'creator.lastName',
        'creator.walletAddress',
      ]);

    // Build search conditions
    const whereConditions: string[] = [];
    const parameters: Record<string, any> = {};

    // Default: only APPROVED or ACTIVE projects unless a specific status is requested
    if (statuses && statuses.length > 0) {
      whereConditions.push('project.status IN (:...statuses)');
      parameters.statuses = statuses;
    } else if (status) {
      whereConditions.push('project.status = :status');
      parameters.status = status;
    } else {
      whereConditions.push('project.status IN (:...defaultStatuses)');
      parameters.defaultStatuses = [
        ProjectStatus.APPROVED,
        ProjectStatus.ACTIVE,
      ];
    }

    // Category filters
    if (categories && categories.length > 0) {
      whereConditions.push('project.category IN (:...categories)');
      parameters.categories = categories;
    } else if (category) {
      whereConditions.push('project.category = :category');
      parameters.category = category;
    }

    // Goal amount filters
    if (minGoal) {
      whereConditions.push('project.goalAmount >= :minGoal');
      parameters.minGoal = parseFloat(minGoal);
    }
    if (maxGoal) {
      whereConditions.push('project.goalAmount <= :maxGoal');
      parameters.maxGoal = parseFloat(maxGoal);
    }

    // Funds raised filters
    if (minRaised) {
      whereConditions.push('project.fundsRaised >= :minRaised');
      parameters.minRaised = parseFloat(minRaised);
    }
    if (maxRaised) {
      whereConditions.push('project.fundsRaised <= :maxRaised');
      parameters.maxRaised = parseFloat(maxRaised);
    }

    // Full-text search
    if (search && search.trim()) {
      const searchTerm = search.trim();

      // Enhanced search with relevance scoring
      whereConditions.push(
        `(LOWER(project.title) LIKE :search OR LOWER(project.description) LIKE :search)`,
      );
      parameters.search = `%${searchTerm.toLowerCase()}%`;

      // Add relevance scoring
      qb.addSelect(
        `
        CASE
          WHEN LOWER(project.title) LIKE :exactMatch THEN 100
          WHEN LOWER(project.title) LIKE :startsWith THEN 80
          WHEN LOWER(project.title) LIKE :contains THEN 60
          WHEN LOWER(project.description) LIKE :exactMatch THEN 40
          WHEN LOWER(project.description) LIKE :startsWith THEN 30
          WHEN LOWER(project.description) LIKE :contains THEN 20
          ELSE 10
        END
        `,
        'relevance',
      );

      parameters.exactMatch = `${searchTerm.toLowerCase()}`;
      parameters.startsWith = `${searchTerm.toLowerCase()}%`;
      parameters.contains = `%${searchTerm.toLowerCase()}%`;
    }

    // Apply where conditions
    if (whereConditions.length > 0) {
      qb.where(whereConditions.join(' AND '), parameters);
    }

    // Sorting with relevance for search results
    if (search && search.trim()) {
      qb.orderBy('relevance', 'DESC').addOrderBy('project.createdAt', 'DESC');
    } else {
      switch (sortBy) {
        case ProjectSortBy.MOST_FUNDED:
          qb.orderBy('project.fundsRaised', 'DESC');
          break;
        case ProjectSortBy.ENDING_SOON:
          qb.orderBy('project.deadline', 'ASC');
          break;
        case ProjectSortBy.NEWEST:
        default:
          qb.orderBy('project.createdAt', 'DESC');
          break;
      }
    }

    const total = await qb.getCount();
    const data = await qb.skip(offset).take(limit).getMany();

    // Generate suggestions based on search term
    let suggestions: string[] = [];
    if (search && search.trim()) {
      suggestions = await this.generateSearchSuggestions(search.trim());
    }

    return { data, total, suggestions };
  }

  private async generateSearchSuggestions(
    searchTerm: string,
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Get project titles that contain similar terms
    const similarTitles = await this.projectRepository
      .createQueryBuilder('project')
      .select('project.title', 'title')
      .where('project.status IN (:...statuses)', {
        statuses: [ProjectStatus.APPROVED, ProjectStatus.ACTIVE],
      })
      .andWhere('LOWER(project.title) LIKE :search', {
        search: `%${searchTerm.toLowerCase()}%`,
      })
      .andWhere('LOWER(project.title) != :exactSearch', {
        exactSearch: searchTerm.toLowerCase(),
      })
      .orderBy('project.fundsRaised', 'DESC')
      .limit(5)
      .getRawMany();

    suggestions.push(...similarTitles.map((item) => item.title));

    // Get category suggestions
    const categories = Object.values(ProjectCategory);
    const matchingCategories = categories.filter((cat) =>
      cat.toLowerCase().includes(searchTerm.toLowerCase()),
    );
    suggestions.push(...matchingCategories);

    return suggestions.slice(0, 8); // Limit to 8 suggestions
  }

  async getSearchAnalytics(): Promise<{
    totalProjects: number;
    categoryDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
    averageGoal: number;
    averageRaised: number;
  }> {
    const stats = await this.projectRepository
      .createQueryBuilder('project')
      .select('COUNT(project.id)', 'totalProjects')
      .addSelect('project.category', 'category')
      .addSelect('project.status', 'status')
      .addSelect('AVG(project.goalAmount)', 'avgGoal')
      .addSelect('AVG(project.fundsRaised)', 'avgRaised')
      .where('project.status IN (:...statuses)', {
        statuses: [ProjectStatus.APPROVED, ProjectStatus.ACTIVE],
      })
      .groupBy('project.category, project.status')
      .getRawMany();

    const totalProjects = await this.projectRepository
      .createQueryBuilder('project')
      .where('project.status IN (:...statuses)', {
        statuses: [ProjectStatus.APPROVED, ProjectStatus.ACTIVE],
      })
      .getCount();

    const categoryDistribution: Record<string, number> = {};
    const statusDistribution: Record<string, number> = {};
    let totalGoal = 0;
    let totalRaised = 0;
    let count = 0;

    stats.forEach((stat) => {
      const category = stat.category;
      const status = stat.status;

      categoryDistribution[category] =
        (categoryDistribution[category] || 0) + 1;
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;

      if (stat.avgGoal) {
        totalGoal += parseFloat(stat.avgGoal);
        totalRaised += parseFloat(stat.avgRaised);
        count++;
      }
    });

    return {
      totalProjects,
      categoryDistribution,
      statusDistribution,
      averageGoal: count > 0 ? totalGoal / count : 0,
      averageRaised: count > 0 ? totalRaised / count : 0,
    };
  }
}
