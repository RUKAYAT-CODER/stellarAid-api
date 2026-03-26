import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SubmitKYCDto } from './dto/submit-kyc.dto';
import { UpdateKYCDto } from './dto/update-kyc.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUserDonationsQueryDto } from '../donations/dto/get-user-donations-query.dto';
import { UserDonationHistoryResponseDto } from '../donations/dto/user-donation-history-response.dto';
import { Public } from '../common/decorators/public.decorator';
import type { JwtPayload } from '../common/interfaces/auth.interface';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { AuthService } from 'src/auth/providers/auth.service';
import { UsersService } from './providers/users.service';
import { DonationsService } from '../donations/providers/donations.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly donationsService: DonationsService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.sub, updateUserDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const user = req.user;
    return this.authService.changePassword(user.id, changePasswordDto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async forgotPassword(@Body() forgotDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotDto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto.token, resetDto.newPassword);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @Post('kyc/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit KYC document for verification' })
  @ApiResponse({ status: 200, description: 'KYC submitted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async submitKYC(@Request() req, @Body() submitKYCDto: SubmitKYCDto) {
    const user = req.user;
    return this.authService.submitKYC(user.id, submitKYCDto);
  }

  // Admin endpoint to update KYC status
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @Patch('admin/kyc/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update KYC status (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID to update KYC for' })
  @ApiResponse({ status: 200, description: 'KYC status updated successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateKYCStatus(
    @Request() req,
    @Param('userId') userId: string,
    @Body() updateKYCDto: UpdateKYCDto,
  ) {
    // Check if requester is admin
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return this.authService.updateKYCStatus(userId, updateKYCDto);
  }

  //_____________________ Endpoint to get current user's donation history
  @Get('donations')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get current user's donation history",
    description:
      'Returns paginated list of user donations with project information and summary statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Donation history retrieved successfully',
    type: UserDonationHistoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserDonations(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetUserDonationsQueryDto,
  ): Promise<UserDonationHistoryResponseDto> {
    return this.donationsService.getUserDonationHistory(
      user.sub,
      query.page,
      query.limit,
      query.startDate,
      query.endDate,
    );
  }
}
