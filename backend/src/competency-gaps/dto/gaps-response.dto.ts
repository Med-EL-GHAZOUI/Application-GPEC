import { ApiProperty } from '@nestjs/swagger';
import {
  GapPriority,
  GapStatus,
  SkillCategory,
} from '../../common/enums/domain.enums.js';
import { TrainingSummaryDto } from '../../trainings/dto/training-response.dto.js';

class GapSkillDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: SkillCategory })
  category: SkillCategory;

  @ApiProperty()
  maxLevel: number;
}

export class SkillGapDto {
  @ApiProperty({ type: GapSkillDto })
  skill: GapSkillDto;

  @ApiProperty({ description: '0 when the skill has never been assessed' })
  currentLevel: number;

  @ApiProperty()
  requiredLevel: number;

  @ApiProperty({
    description:
      'requiredLevel - currentLevel: positive = to develop, 0 = mastered, negative = above the need',
  })
  gap: number;

  @ApiProperty({ enum: GapStatus })
  status: GapStatus;

  @ApiProperty({
    enum: GapPriority,
    description: 'HIGH from a gap of 3, MEDIUM at 2, LOW at 1, NONE otherwise',
  })
  priority: GapPriority;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2026-03-01',
    description: 'Date of the latest assessment, null if never assessed',
  })
  evaluatedAt: string | null;

  @ApiProperty({
    type: TrainingSummaryDto,
    nullable: true,
    description:
      'Best training to close the gap (null when no gap or no suitable training)',
  })
  recommendedTraining: TrainingSummaryDto | null;
}

export class GapSummaryDto {
  @ApiProperty()
  requiredSkills: number;

  @ApiProperty()
  toDevelop: number;

  @ApiProperty()
  mastered: number;

  @ApiProperty()
  aboveRequirement: number;

  @ApiProperty({ description: 'Sum of the positive gaps' })
  totalGap: number;
}

class GapEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

class GapPositionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;
}

export class EmployeeGapsResponseDto {
  @ApiProperty({ type: GapEmployeeDto })
  employee: GapEmployeeDto;

  @ApiProperty({ type: GapPositionDto })
  position: GapPositionDto;

  @ApiProperty({ type: GapSummaryDto })
  summary: GapSummaryDto;

  @ApiProperty({
    type: [SkillGapDto],
    description:
      'One entry per skill required by the position, largest gap first',
  })
  gaps: SkillGapDto[];
}

export class SkillRecommendationDto {
  @ApiProperty({ type: GapSkillDto })
  skill: GapSkillDto;

  @ApiProperty()
  currentLevel: number;

  @ApiProperty()
  requiredLevel: number;

  @ApiProperty()
  gap: number;

  @ApiProperty({ enum: GapPriority })
  priority: GapPriority;

  @ApiProperty({
    type: [TrainingSummaryDto],
    description: 'Suitable trainings, best first (empty when none)',
  })
  trainings: TrainingSummaryDto[];
}

export class TrainingRecommendationsResponseDto {
  @ApiProperty({ type: GapEmployeeDto })
  employee: GapEmployeeDto;

  @ApiProperty({ type: GapPositionDto })
  position: GapPositionDto;

  @ApiProperty({
    type: [SkillRecommendationDto],
    description: 'One entry per skill to develop, largest gap first',
  })
  recommendations: SkillRecommendationDto[];
}
