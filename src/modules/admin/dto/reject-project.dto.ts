import { IsString, IsNotEmpty } from 'class-validator';

export class RejectProjectDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
