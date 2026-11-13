import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { EmployeeStatus } from '../../common/enums/domain.enums.js';
import { normalizeEmail } from '../../common/transformers/normalize-email.js';
import { trim } from '../../common/transformers/trim.js';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'EMP-0042', maxLength: 30 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  matricule: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'mohamed@company.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ example: '2024-09-01', description: 'ISO date (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'hireDate must be formatted YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  hireDate: string;

  @ApiPropertyOptional({ enum: EmployeeStatus, default: EmployeeStatus.Active })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  departmentId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Login account of this employee',
  })
  @IsOptional()
  @IsUUID()
  userId?: string | null;
}

/** On update, `null` clears an optional link (position, manager, user account). */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class EmployeeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}
