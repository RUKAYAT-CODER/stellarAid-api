import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminUpdateProjectStatusDto {
  @ApiProperty({
    description: 'Reason for approval or rejection',
    example: 'Project meets all requirements and is approved for funding',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({
    description: 'Admin decision notes (internal)',
    example: 'Verified all documentation and KYC status',
    required: false,
  })
  @IsString()
  @IsOptional()
  adminNotes?: string;
}
