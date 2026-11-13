import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { SkillCategory } from '../../common/enums/domain.enums.js';
import { trim } from '../../common/transformers/trim.js';

export const MAX_SKILL_LEVEL = 10;
export const DEFAULT_SKILL_MAX_LEVEL = 5;

export class CreateSkillDto {
  @ApiProperty({ example: 'Angular', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: SkillCategory })
  @IsEnum(SkillCategory)
  category: SkillCategory;

  @ApiPropertyOptional({
    default: DEFAULT_SKILL_MAX_LEVEL,
    minimum: 1,
    maximum: MAX_SKILL_LEVEL,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SKILL_LEVEL)
  maxLevel?: number;
}

export class UpdateSkillDto extends PartialType(CreateSkillDto) {}

export class SkillQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SkillCategory })
  @IsOptional()
  @IsEnum(SkillCategory)
  category?: SkillCategory;
}
