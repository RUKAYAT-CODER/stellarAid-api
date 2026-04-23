import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public, CurrentUser } from './modules/auth';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('protected')
  getProtected(@CurrentUser() user: any): any {
    return {
      message: 'This is a protected route',
      user: user,
    };
  }
}
