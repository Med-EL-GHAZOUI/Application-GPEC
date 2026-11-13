import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { TrainingStatus } from '../../common/enums/domain.enums.js';
import { trim } from '../../common/transformers/trim.js';
import { MAX_SKILL_LEVEL } from '../../skills/dto/skill.dto.js';

export const MAX_TRAINING_HOURS = 2000;
export const MAX_TRAINING_CAPACITY = 10_000;

export class CreateTrainingDto {
  @ApiProperty({ example: 'Angular Advanced', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ format: 'uuid', description: 'Skill the training develops' })
  @IsUUID()
  skillId: string;

  @ApiProperty({
    minimum: 1,
    maximum: MAX_SKILL_LEVEL,
    description:
      'Level the training brings participants to; cannot exceed the skill maximum',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_SKILL_LEVEL)
  targetLevel: number;

  @ApiProperty({ minimum: 1, maximum: MAX_TRAINING_HOURS })
  @IsInt()
  @Min(1)
  @Max(MAX_TRAINING_HOURS)
  durationHours: number;

  @ApiPropertyOptional({ maxLength: 150, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  provider?: string | null;

  @ApiPropertyOptional({ example: '2026-09-15', nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be formatted YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  startDate?: string | null;

  @ApiProperty({ minimum: 1, maximum: MAX_TRAINING_CAPACITY })
  @IsInt()
  @Min(1)
  @Max(MAX_TRAINING_CAPACITY)
  capacity: number;

  @ApiPropertyOptional({
    enum: TrainingStatus,
    default: TrainingStatus.Planned,
  })
  @IsOptional()
  @IsEnum(TrainingStatus)
  status?: TrainingStatus;
}

/** On update, `null` clears the provider or the start date. */
export class UpdateTrainingDto extends PartialType(CreateTrainingDto) {}

export class TrainingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @ApiPropertyOptional({ enum: TrainingStatus })
  @IsOptional()
  @IsEnum(TrainingStatus)
  status?: TrainingStatus;

  @ApiPropertyOptional({ description: 'Exact target level' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(MAX_SKILL_LEVEL)
  level?: number;
}
