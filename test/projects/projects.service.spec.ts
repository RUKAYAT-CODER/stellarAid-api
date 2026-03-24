import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectCategory } from 'src/common/enums/project-category.enum';
import { ProjectStatus } from 'src/common/enums/project-status.enum';
import { ProjectSortBy } from 'src/common/enums/projects-sortBy.enum';
import { GetProjectsQueryDto } from 'src/projects/dto/get-projects-query.dto';
import { Donation } from 'src/projects/entities/donation.entity';
import { Project } from 'src/projects/entities/project.entity';
import { ProjectHistory } from 'src/projects/entities/project-history.entity';
import { ProjectsService } from 'src/projects/providers/projects.service';
import { Repository } from 'typeorm';


describe('ProjectsService', () => {
  let service: ProjectsService;
  let repository: Repository<Project>;

  // Mock QueryBuilder
  const mockQueryBuilder = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    getMany: jest.fn(),
  };

  // Mock Repository
  const mockRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockDonationRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockProjectHistoryRepository = {
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getRepositoryToken(Project),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Donation),
          useValue: mockDonationRepository,
        },
        {
          provide: getRepositoryToken(ProjectHistory),
          useValue: mockProjectHistoryRepository,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    repository = module.get<Repository<Project>>(getRepositoryToken(Project));

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockProjects: Partial<Project>[] = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Education Fund',
        description: 'Supporting education for children',
        category: ProjectCategory.EDUCATION,
        status: ProjectStatus.ACTIVE,
        goalAmount: 10000,
        fundsRaised: 5000,
        imageUrl: 'https://example.com/image1.jpg',
        deadline: new Date('2025-12-31'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        creator: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          walletAddress:
            'GAA2M7F4E3C4D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6',
        } as any,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Health Initiative',
        description: 'Improving healthcare access',
        category: ProjectCategory.HEALTH,
        status: ProjectStatus.APPROVED,
        goalAmount: 25000,
        fundsRaised: 15000,
        imageUrl: null,
        deadline: new Date('2025-06-30'),
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
        creator: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          firstName: 'John',
          lastName: 'Doe',
          walletAddress:
            'GAA2M7F4E3C4D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6',
        } as any,
      },
    ];

    describe('success scenarios', () => {
      it('should return projects with default filters (no query params)', async () => {
        const query: GetProjectsQueryDto = {};
        const total = 2;

        mockQueryBuilder.getCount.mockResolvedValue(total);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        const result = await service.findAll(query);

        expect(result).toEqual({ data: mockProjects, total });
        expect(repository.createQueryBuilder).toHaveBeenCalledWith('project');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'project.creator',
          'creator',
        );
        expect(mockQueryBuilder.where).toHaveBeenCalledWith(
          'project.status IN (:...statuses)',
          {
            statuses: [ProjectStatus.APPROVED, ProjectStatus.ACTIVE],
          },
        );
        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'project.createdAt',
          'DESC',
        );
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      });

      it('should filter by category', async () => {
        const query: GetProjectsQueryDto = {
          category: ProjectCategory.EDUCATION,
        };
        const total = 1;
        const filteredProjects = [mockProjects[0]];

        mockQueryBuilder.getCount.mockResolvedValue(total);
        mockQueryBuilder.getMany.mockResolvedValue(filteredProjects);

        const result = await service.findAll(query);

        expect(result.data).toEqual(filteredProjects);
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'project.category = :category',
          { category: ProjectCategory.EDUCATION },
        );
      });

      it('should filter by status', async () => {
        const query: GetProjectsQueryDto = {
          status: ProjectStatus.ACTIVE,
        };
        const total = 1;
        const filteredProjects = [mockProjects[0]];

        mockQueryBuilder.getCount.mockResolvedValue(total);
        mockQueryBuilder.getMany.mockResolvedValue(filteredProjects);

        const result = await service.findAll(query);

        expect(result.data).toEqual(filteredProjects);
        expect(mockQueryBuilder.where).toHaveBeenCalledWith(
          'project.status = :status',
          { status: ProjectStatus.ACTIVE },
        );
      });

      it('should filter by search term', async () => {
        const query: GetProjectsQueryDto = {
          search: 'education',
        };
        const total = 1;
        const filteredProjects = [mockProjects[0]];

        mockQueryBuilder.getCount.mockResolvedValue(total);
        mockQueryBuilder.getMany.mockResolvedValue(filteredProjects);

        const result = await service.findAll(query);

        expect(result.data).toEqual(filteredProjects);
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(project.title) LIKE :search OR LOWER(project.description) LIKE :search)',
          { search: '%education%' },
        );
      });

      it('should handle search term case insensitively', async () => {
        const query: GetProjectsQueryDto = {
          search: 'EDUCATION',
        };

        mockQueryBuilder.getCount.mockResolvedValue(1);
        mockQueryBuilder.getMany.mockResolvedValue([mockProjects[0]]);

        await service.findAll(query);

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(project.title) LIKE :search OR LOWER(project.description) LIKE :search)',
          { search: '%education%' },
        );
      });

      it('should sort by newest (default)', async () => {
        const query: GetProjectsQueryDto = {
          sortBy: ProjectSortBy.NEWEST,
        };

        mockQueryBuilder.getCount.mockResolvedValue(2);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        await service.findAll(query);

        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'project.createdAt',
          'DESC',
        );
      });

      it('should sort by most funded', async () => {
        const query: GetProjectsQueryDto = {
          sortBy: ProjectSortBy.MOST_FUNDED,
        };

        mockQueryBuilder.getCount.mockResolvedValue(2);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        await service.findAll(query);

        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'project.fundsRaised',
          'DESC',
        );
      });

      it('should sort by ending soon', async () => {
        const query: GetProjectsQueryDto = {
          sortBy: ProjectSortBy.ENDING_SOON,
        };

        mockQueryBuilder.getCount.mockResolvedValue(2);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        await service.findAll(query);

        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'project.deadline',
          'ASC',
        );
      });

      it('should apply pagination with custom limit and offset', async () => {
        const query: GetProjectsQueryDto = {
          limit: 5,
          offset: 10,
        };

        mockQueryBuilder.getCount.mockResolvedValue(20);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        await service.findAll(query);

        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
      });

      it('should apply multiple filters together', async () => {
        const query: GetProjectsQueryDto = {
          category: ProjectCategory.EDUCATION,
          status: ProjectStatus.ACTIVE,
          search: 'children',
          sortBy: ProjectSortBy.MOST_FUNDED,
          limit: 20,
          offset: 5,
        };

        mockQueryBuilder.getCount.mockResolvedValue(1);
        mockQueryBuilder.getMany.mockResolvedValue([mockProjects[0]]);

        const result = await service.findAll(query);

        expect(result.data).toHaveLength(1);
        expect(mockQueryBuilder.where).toHaveBeenCalledWith(
          'project.status = :status',
          { status: ProjectStatus.ACTIVE },
        );
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'project.category = :category',
          { category: ProjectCategory.EDUCATION },
        );
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(project.title) LIKE :search OR LOWER(project.description) LIKE :search)',
          { search: '%children%' },
        );
        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'project.fundsRaised',
          'DESC',
        );
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5);
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      });

      it('should return empty array when no projects match', async () => {
        const query: GetProjectsQueryDto = {
          search: 'nonexistent',
        };

        mockQueryBuilder.getCount.mockResolvedValue(0);
        mockQueryBuilder.getMany.mockResolvedValue([]);

        const result = await service.findAll(query);

        expect(result).toEqual({ data: [], total: 0 });
      });

      it('should handle projects without deadline for ENDING_SOON sort', async () => {
        const projectsWithoutDeadline = [
          {
            ...mockProjects[0],
            deadline: null,
          },
        ];

        const query: GetProjectsQueryDto = {
          sortBy: ProjectSortBy.ENDING_SOON,
        };

        mockQueryBuilder.getCount.mockResolvedValue(1);
        mockQueryBuilder.getMany.mockResolvedValue(projectsWithoutDeadline);

        const result = await service.findAll(query);

        expect(result.data).toEqual(projectsWithoutDeadline);
        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'project.deadline',
          'ASC',
        );
      });
    });

    describe('error scenarios', () => {
      it('should handle database error during getCount', async () => {
        const query: GetProjectsQueryDto = {};
        const dbError = new Error('Database connection failed');

        mockQueryBuilder.getCount.mockRejectedValue(dbError);

        await expect(service.findAll(query)).rejects.toThrow(
          'Database connection failed',
        );
      });

      it('should handle database error during getMany', async () => {
        const query: GetProjectsQueryDto = {};
        const dbError = new Error('Query execution failed');

        mockQueryBuilder.getCount.mockResolvedValue(2);
        mockQueryBuilder.getMany.mockRejectedValue(dbError);

        await expect(service.findAll(query)).rejects.toThrow(
          'Query execution failed',
        );
      });

      it('should handle unexpected error from repository', async () => {
        const query: GetProjectsQueryDto = {};
        const unexpectedError = new Error('Unexpected error');

        mockRepository.createQueryBuilder.mockImplementationOnce(() => {
          throw unexpectedError;
        });

        await expect(service.findAll(query)).rejects.toThrow(
          'Unexpected error',
        );
      });
    });

    describe('edge cases', () => {
      it('should handle special characters in search term', async () => {
        const query: GetProjectsQueryDto = {
          search: 'test%_special',
        };

        mockQueryBuilder.getCount.mockResolvedValue(0);
        mockQueryBuilder.getMany.mockResolvedValue([]);

        await service.findAll(query);

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(project.title) LIKE :search OR LOWER(project.description) LIKE :search)',
          { search: '%test%_special%' },
        );
      });

      it('should not apply search filter for empty string', async () => {
        const query: GetProjectsQueryDto = {
          search: '',
        };

        mockQueryBuilder.getCount.mockResolvedValue(2);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        const result = await service.findAll(query);

        // Empty string is falsy, so search filter should not be applied
        const searchFilterCalls = mockQueryBuilder.andWhere.mock.calls.filter(
          (call) => call[0].includes('LIKE'),
        );
        expect(searchFilterCalls).toHaveLength(0);
        expect(result.data).toHaveLength(2);
      });

      it('should handle limit of 1 (minimum valid)', async () => {
        const query: GetProjectsQueryDto = {
          limit: 1,
        };

        mockQueryBuilder.getCount.mockResolvedValue(10);
        mockQueryBuilder.getMany.mockResolvedValue([mockProjects[0]]);

        await service.findAll(query);

        expect(mockQueryBuilder.take).toHaveBeenCalledWith(1);
      });

      it('should handle limit of 100 (maximum valid)', async () => {
        const query: GetProjectsQueryDto = {
          limit: 100,
        };

        mockQueryBuilder.getCount.mockResolvedValue(150);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        await service.findAll(query);

        expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
      });

      it('should handle offset of 0', async () => {
        const query: GetProjectsQueryDto = {
          offset: 0,
        };

        mockQueryBuilder.getCount.mockResolvedValue(5);
        mockQueryBuilder.getMany.mockResolvedValue(mockProjects);

        await service.findAll(query);

        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      });

      it('should filter by REJECTED status when explicitly requested', async () => {
        const query: GetProjectsQueryDto = {
          status: ProjectStatus.REJECTED,
        };

        mockQueryBuilder.getCount.mockResolvedValue(0);
        mockQueryBuilder.getMany.mockResolvedValue([]);

        await service.findAll(query);

        expect(mockQueryBuilder.where).toHaveBeenCalledWith(
          'project.status = :status',
          { status: ProjectStatus.REJECTED },
        );
      });

      it('should filter by DRAFT status when explicitly requested', async () => {
        const query: GetProjectsQueryDto = {
          status: ProjectStatus.DRAFT,
        };

        mockQueryBuilder.getCount.mockResolvedValue(0);
        mockQueryBuilder.getMany.mockResolvedValue([]);

        await service.findAll(query);

        expect(mockQueryBuilder.where).toHaveBeenCalledWith(
          'project.status = :status',
          { status: ProjectStatus.DRAFT },
        );
      });

      it('should filter by all project categories', async () => {
        const categories = Object.values(ProjectCategory);

        for (const category of categories) {
          jest.clearAllMocks();

          const query: GetProjectsQueryDto = { category };

          mockQueryBuilder.getCount.mockResolvedValue(1);
          mockQueryBuilder.getMany.mockResolvedValue([mockProjects[0]]);

          await service.findAll(query);

          expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
            'project.category = :category',
            { category },
          );
        }
      });
    });
  });
});
