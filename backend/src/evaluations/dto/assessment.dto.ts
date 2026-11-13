import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../common/transformers/trim.js';
import { MAX_SKILL_LEVEL } from '../../skills/dto/skill.dto.js';

/** The content of an assessment, shared by every way of recording one. */
export class AssessmentDto {
  @ApiProperty({
    minimum: 1,
    maximum: MAX_SKILL_LEVEL,
    description: 'Cannot exceed the maximum level of the skill',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_SKILL_LEVEL)
  level: number;

  @ApiPropertyOptional({
    example: '2026-03-01',
    description:
      'Assessment date (YYYY-MM-DD), today by default, never in the future',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'evaluatedAt must be formatted YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  evaluatedAt?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
