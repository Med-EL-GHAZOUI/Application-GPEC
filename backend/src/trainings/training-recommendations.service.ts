import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingStatus } from '../common/enums/domain.enums.js';
import { TrainingSummaryDto } from './dto/training-response.dto.js';
import { Training } from './entities/training.entity.js';
import { rankTrainings, type GapNeed } from './recommendation-ranker.js';
import { TrainingsService } from './trainings.service.js';

export type SkillNeed = GapNeed & { skillId: string };

/** Statuses of a training that can still be proposed to someone. */
const RECOMMENDABLE_STATUSES = [TrainingStatus.Planned, TrainingStatus.Open];

@Injectable()
export class TrainingRecommendationsService {
  constructor(
    @InjectRepository(Training)
    private readonly trainings: Repository<Training>,
    private readonly trainingsService: TrainingsService,
  ) {}

  /**
   * For each skill gap, the trainings that answer it, best first.
   *
   * Excluded: trainings that are cancelled, completed or in progress, full
   * ones, and those the employee already follows or has followed. Then
   * `rankTrainings` keeps the ones that raise the employee's level and orders
   * them by closeness to the requirement.
   */
  async recommend(
    employeeId: string,
    needs: SkillNeed[],
    limitPerSkill: number,
  ): Promise<Map<string, TrainingSummaryDto[]>> {
    const result = new Map<string, TrainingSummaryDto[]>();
    if (needs.length === 0) {
      return result;
    }

    const candidates = await this.findCandidates(
      employeeId,
      needs.map((need) => need.skillId),
    );
    const seats = await this.trainingsService.countActiveEnrollments(
      candidates.map((training) => training.id),
    );

    for (const need of needs) {
      const ranked = rankTrainings(
        candidates.filter((training) => training.skillId === need.skillId),
        need,
      );
      result.set(
        need.skillId,
        ranked
          .slice(0, limitPerSkill)
          .map((training) =>
            TrainingSummaryDto.from(training, seats.get(training.id) ?? 0),
          ),
      );
    }
    return result;
  }

  /** One query for every deficient skill; capacity and history filtered in SQL. */
  private findCandidates(
    employeeId: string,
    skillIds: string[],
  ): Promise<Training[]> {
    return this.trainings
      .createQueryBuilder('training')
      .innerJoinAndSelect('training.skill', 'skill')
      .where('training.skillId IN (:...skillIds)', { skillIds })
      .andWhere('training.status IN (:...statuses)', {
        statuses: RECOMMENDABLE_STATUSES,
      })
      .andWhere(
        `(SELECT COUNT(*) FROM employee_trainings taken
          WHERE taken.training_id = training.id
            AND taken.status <> 'CANCELLED') < training.capacity`,
      )
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM employee_trainings mine
          WHERE mine.training_id = training.id
            AND mine.employee_id = :employeeId
            AND mine.status <> 'CANCELLED')`,
        { employeeId },
      )
      .getMany();
  }
}
