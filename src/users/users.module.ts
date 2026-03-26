import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { User } from './entities/user.entity';
import { AdminUsersController } from './admin-users.controller';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersService } from './providers/users.service';
import { DonationsModule } from '../donations/donations.module';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([User]), DonationsModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, RolesGuard],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
