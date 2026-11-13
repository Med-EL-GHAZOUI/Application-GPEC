import { ApiProperty } from '@nestjs/swagger';
import { SkillCategory } from '../../common/enums/domain.enums.js';
import type { SkillEvaluation } from '../entities/skill-evaluation.entity.js';

class SkillRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: SkillCategory })
  category: SkillCategory;

  @ApiProperty()
  maxLevel: number;
}

class EvaluatorRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

export class EvaluationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  employeeId: string;

  @ApiProperty({ type: SkillRefDto })
  skill: SkillRefDto;

  @ApiProperty()
  level: number;

  @ApiProperty({ example: '2026-03-01' })
  evaluatedAt: string;

  @ApiProperty({ type: EvaluatorRefDto, nullable: true })
  evaluator: EvaluatorRefDto | null;

  @ApiProperty({ nullable: true, type: String })
  comment: string | null;

  @ApiProperty()
  createdAt: Date;

  static from(evaluation: SkillEvaluation): EvaluationResponseDto {
    return {
      id: evaluation.id,
      employeeId: evaluation.employeeId,
      skill: {
        id: evaluation.skill.id,
        name: evaluation.skill.name,
        category: evaluation.skill.category,
        maxLevel: evaluation.skill.maxLevel,
      },
      level: evaluation.level,
      evaluatedAt: evaluation.evaluatedAt,
      evaluator: evaluation.evaluator
        ? {
            id: evaluation.evaluator.id,
            firstName: evaluation.evaluator.firstName,
            lastName: evaluation.evaluator.lastName,
          }
        : null,
      comment: evaluation.comment,
      createdAt: evaluation.createdAt,
    };
  }
}

/** One point of the progression of an employee on a skill. */
export class EvolutionPointDto {
  @ApiProperty({ example: '2026-03-01' })
  evaluatedAt: string;

  @ApiProperty()
  level: number;

  @ApiProperty({ type: EvaluatorRefDto, nullable: true })
  evaluator: EvaluatorRefDto | null;

  @ApiProperty({ nullable: true, type: String })
  comment: string | null;
}
