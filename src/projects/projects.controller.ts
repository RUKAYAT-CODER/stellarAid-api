import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { GetProjectsQueryDto } from './dto/get-projects-query.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { ProjectsService } from './providers/projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  //______________________ Endpoint to create a new project (CREATOR role required)
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all projects with filtering and pagination' })
  @ApiOkResponse({ description: 'Projects retrieved successfully' })
  async findAll(@Query() query: GetProjectsQueryDto) {
    const { data, total } = await this.projectsService.findAll(query);
    return {
      data,
      total,
      limit: query.limit ?? 10,
      offset: query.offset ?? 0,
    };
  }

  //_____________________ Endpoint to get detailed project info by ID (public view)
  @Get(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get detailed project by ID' })
  @ApiOkResponse({ description: 'Project details retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOnePublic(id);
  }

  //_____________________ Endpoint to create a new project (CREATOR role required)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new project (CREATOR role required)' })
  @ApiCreatedResponse({ description: 'Project created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({
    description: 'Forbidden – only CREATOR role allowed',
  })
  async create(@Body() createProjectDto: CreateProjectDto, @Request() req) {
    const userId = req.user.sub;
    const project = await this.projectsService.create(createProjectDto, userId);
    return project;
  }

  //_____________________ Endpoint to pause a project
  @Patch(':id/pause')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a project (CREATOR or ADMIN required)' })
  @ApiOkResponse({ description: 'Project paused successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Only creator or admin can pause project' })
  async pauseProject(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateProjectStatusDto,
    @Request() req,
  ) {
    const userId = req.user.sub;
    const userRole = req.user.role;
    const project = await this.projectsService.updateStatus(
      id,
      { status: 'paused' as any, reason: updateStatusDto.reason },
      userId,
      userRole,
    );
    return project;
  }

  //_____________________ Endpoint to resume a project
  @Patch(':id/resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a project (CREATOR or ADMIN required)' })
  @ApiOkResponse({ description: 'Project resumed successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Only creator or admin can resume project' })
  async resumeProject(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateProjectStatusDto,
    @Request() req,
  ) {
    const userId = req.user.sub;
    const userRole = req.user.role;
    const project = await this.projectsService.updateStatus(
      id,
      { status: 'active' as any, reason: updateStatusDto.reason },
      userId,
      userRole,
    );
    return project;
  }

  //_____________________ Endpoint to complete a project
  @Post(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a project (CREATOR or ADMIN required)' })
  @ApiOkResponse({ description: 'Project completed successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Only creator or admin can complete project' })
  async completeProject(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateProjectStatusDto,
    @Request() req,
  ) {
    const userId = req.user.sub;
    const userRole = req.user.role;
    const project = await this.projectsService.updateStatus(
      id,
      { status: 'completed' as any, reason: updateStatusDto.reason },
      userId,
      userRole,
    );
    return project;
  }
}
