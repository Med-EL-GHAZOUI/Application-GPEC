import { ApiProperty } from '@nestjs/swagger';
import { SkillCategory } from '../../common/enums/domain.enums.js';
import type { EmployeeSkill } from '../entities/employee-skill.entity.js';

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

/** A skill held by an employee, with the latest assessment. */
export class EmployeeSkillResponseDto {
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

  static from(link: EmployeeSkill): EmployeeSkillResponseDto {
    return {
      skill: {
        id: link.skill.id,
        name: link.skill.name,
        category: link.skill.category,
        maxLevel: link.skill.maxLevel,
      },
      level: link.level,
      evaluatedAt: link.evaluatedAt,
      evaluator: link.evaluator
        ? {
            id: link.evaluator.id,
            firstName: link.evaluator.firstName,
            lastName: link.evaluator.lastName,
          }
        : null,
      comment: link.comment,
    };
  }
}
