import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DonationsService } from './providers/donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { DonationResponseDto } from './dto/donation-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Donations')
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new donation' })
  @ApiResponse({ status: 201, type: DonationResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Transaction hash already exists',
  })
  create(@Body() createDonationDto: CreateDonationDto) {
    return this.donationsService.create(createDonationDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all donations with pagination' })
  @ApiResponse({ status: 200, description: 'List of donations' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.donationsService.findAll(page, limit);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get donation by ID' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.donationsService.findOne(id);
  }

  @Get('project/:projectId')
  @Public()
  @ApiOperation({ summary: 'Get donations for a specific project' })
  @ApiResponse({ status: 200, description: 'List of project donations' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.donationsService.findByProject(projectId, page, limit);
  }

  @Get('donor/:donorId')
  @ApiOperation({ summary: 'Get donations by a specific donor' })
  @ApiResponse({ status: 200, description: 'List of donor donations' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findByDonor(
    @Param('donorId', ParseUUIDPipe) donorId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.donationsService.findByDonor(donorId, page, limit);
  }

  @Get('transaction/:hash')
  @Public()
  @ApiOperation({ summary: 'Get donation by transaction hash' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  findByTransactionHash(@Param('hash') hash: string) {
    return this.donationsService.findByTransactionHash(hash);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a donation' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDonationDto: UpdateDonationDto,
  ) {
    return this.donationsService.update(id, updateDonationDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a donation' })
  @ApiResponse({ status: 200, description: 'Donation deleted successfully' })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.donationsService.remove(id);
  }

  @Get('analytics/project/:projectId/total')
  @Public()
  @ApiOperation({ summary: 'Get total donations amount for a project' })
  @ApiResponse({ status: 200, description: 'Total donations amount' })
  getTotalForProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.donationsService.getTotalDonationsForProject(projectId);
  }

  @Get('analytics/project/:projectId/count')
  @Public()
  @ApiOperation({ summary: 'Get donation count for a project' })
  @ApiResponse({ status: 200, description: 'Donation count' })
  getCountForProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.donationsService.getDonationCountForProject(projectId);
  }
}

