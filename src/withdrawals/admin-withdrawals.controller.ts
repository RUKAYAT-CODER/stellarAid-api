import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { AdminGetWithdrawalsQueryDto } from './dto/admin-get-withdrawals-query.dto';
import { WithdrawalsService } from './providers/withdrawals.service';

@ApiTags('Withdrawals')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/withdrawals')
export class AdminWithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all withdrawal requests with filters and metrics (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Withdrawals retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@Query() query: AdminGetWithdrawalsQueryDto) {
    const result = await this.withdrawalsService.findAllForAdmin(query);
    return {
      data: result.data,
      total: result.total,
      limit: query.limit ?? 10,
      offset: query.offset ?? 0,
      statistics: result.statistics,
    };
  }
}
