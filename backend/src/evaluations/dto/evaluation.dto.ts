import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { AssessmentDto } from './assessment.dto.js';

export class CreateEvaluationDto extends AssessmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  skillId: string;
}

/** `search` (inherited) matches the skill name or the comment. */
export class EvaluationHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only the evaluations of this skill',
  })
  @IsOptional()
  @IsUUID()
  skillId?: string;
}
