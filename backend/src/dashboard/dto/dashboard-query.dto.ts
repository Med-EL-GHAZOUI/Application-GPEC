import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_TOP = 5;
export const MAX_TOP = 20;
export const DEFAULT_MONTHS = 12;
export const MAX_MONTHS = 36;

export class EvolutionQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restrict the evolution to one skill (default: all skills)',
  })
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @ApiPropertyOptional({
    default: DEFAULT_MONTHS,
    minimum: 1,
    maximum: MAX_MONTHS,
    description: 'Number of months, ending with the current one',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MONTHS)
  months: number = DEFAULT_MONTHS;
}

export class DashboardQueryDto extends EvolutionQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_TOP,
    minimum: 1,
    maximum: MAX_TOP,
    description: 'Size of every "top" list (skills and employees)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TOP)
  limit: number = DEFAULT_TOP;
}
