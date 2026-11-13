import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PositionLevel } from '../../common/enums/domain.enums.js';
import { trim } from '../../common/transformers/trim.js';
import { MAX_SKILL_LEVEL } from '../../skills/dto/skill.dto.js';

export class CreatePositionDto {
  @ApiProperty({ example: 'Software Engineer', maxLength: 150 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: PositionLevel })
  @IsEnum(PositionLevel)
  level: PositionLevel;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  departmentId: string;
}

export class UpdatePositionDto extends PartialType(CreatePositionDto) {}

export class PositionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: PositionLevel })
  @IsOptional()
  @IsEnum(PositionLevel)
  level?: PositionLevel;
}

export class UpdatePositionSkillDto {
  @ApiProperty({ minimum: 1, maximum: MAX_SKILL_LEVEL })
  @IsInt()
  @Min(1)
  @Max(MAX_SKILL_LEVEL)
  requiredLevel: number;
}

export class AddPositionSkillDto extends UpdatePositionSkillDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  skillId: string;
}
