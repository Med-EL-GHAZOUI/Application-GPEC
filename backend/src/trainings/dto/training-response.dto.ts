import { ApiProperty } from '@nestjs/swagger';
import {
  SkillCategory,
  TrainingStatus,
} from '../../common/enums/domain.enums.js';
import type { Training } from '../entities/training.entity.js';

class TrainingSkillDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: SkillCategory })
  category: SkillCategory;
}

/** Compact view used wherever a training is shown next to something else. */
export class TrainingSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: TrainingSkillDto })
  skill: TrainingSkillDto;

  @ApiProperty()
  targetLevel: number;

  @ApiProperty()
  durationHours: number;

  @ApiProperty({ nullable: true, type: String })
  provider: string | null;

  @ApiProperty({ nullable: true, type: String, example: '2026-09-15' })
  startDate: string | null;

  @ApiProperty({ enum: TrainingStatus })
  status: TrainingStatus;

  @ApiProperty({ description: 'capacity minus active enrollments' })
  availableSeats: number;

  static from(training: Training, enrolledCount: number): TrainingSummaryDto {
    return {
      id: training.id,
      title: training.title,
      skill: {
        id: training.skill.id,
        name: training.skill.name,
        category: training.skill.category,
      },
      targetLevel: training.targetLevel,
      durationHours: training.durationHours,
      provider: training.provider,
      startDate: training.startDate,
      status: training.status,
      availableSeats: Math.max(training.capacity - enrolledCount, 0),
    };
  }
}

export class TrainingResponseDto extends TrainingSummaryDto {
  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty()
  capacity: number;

  @ApiProperty({ description: 'Enrollments that are not cancelled' })
  enrolledCount: number;

  static override from(
    training: Training,
    enrolledCount: number,
  ): TrainingResponseDto {
    const summary = TrainingSummaryDto.from(training, enrolledCount);
    return Object.assign(new TrainingResponseDto(), summary, {
      description: training.description,
      capacity: training.capacity,
      enrolledCount,
    });
  }
}
