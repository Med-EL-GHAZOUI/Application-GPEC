import { ApiProperty } from '@nestjs/swagger';
import { SkillCategory } from '../../common/enums/domain.enums.js';
import type { PositionSkill } from '../entities/position-skill.entity.js';

class PositionSkillSkillDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: SkillCategory })
  category: SkillCategory;

  @ApiProperty()
  maxLevel: number;
}

/** A skill required by a position, with the minimum level expected. */
export class PositionSkillResponseDto {
  @ApiProperty({ type: PositionSkillSkillDto })
  skill: PositionSkillSkillDto;

  @ApiProperty()
  requiredLevel: number;

  static from(link: PositionSkill): PositionSkillResponseDto {
    return {
      skill: {
        id: link.skill.id,
        name: link.skill.name,
        category: link.skill.category,
        maxLevel: link.skill.maxLevel,
      },
      requiredLevel: link.requiredLevel,
    };
  }
}
