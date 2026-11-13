import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { isForeignKeyViolation } from '../common/database/pg-errors.js';
import { EnrollmentStatus } from '../common/enums/domain.enums.js';
import {
  type Page,
  paginate,
  toLikePattern,
  toPage,
} from '../common/pagination/paginate.js';
import { Skill } from '../skills/entities/skill.entity.js';
import type {
  CreateTrainingDto,
  TrainingQueryDto,
  UpdateTrainingDto,
} from './dto/training.dto.js';
import { TrainingResponseDto } from './dto/training-response.dto.js';
import { EmployeeTraining } from './entities/employee-training.entity.js';
import { Training } from './entities/training.entity.js';

@Injectable()
export class TrainingsService {
  constructor(
    @InjectRepository(Training)
    private readonly trainings: Repository<Training>,
    @InjectRepository(EmployeeTraining)
    private readonly enrollments: Repository<EmployeeTraining>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
  ) {}

  async findAll(query: TrainingQueryDto): Promise<Page<TrainingResponseDto>> {
    const queryBuilder = this.trainings
      .createQueryBuilder('training')
      .innerJoinAndSelect('training.skill', 'skill')
      .orderBy('training.startDate', 'ASC', 'NULLS LAST')
      .addOrderBy('training.title', 'ASC');

    if (query.search) {
      queryBuilder.andWhere(
        `(training.title ILIKE :search
          OR skill.name ILIKE :search
          OR training.provider ILIKE :search)`,
        { search: toLikePattern(query.search) },
      );
    }
    if (query.skillId) {
      queryBuilder.andWhere('training.skillId = :skillId', {
        skillId: query.skillId,
      });
    }
    if (query.status) {
      queryBuilder.andWhere('training.status = :status', {
        status: query.status,
      });
    }
    if (query.level) {
      queryBuilder.andWhere('training.targetLevel = :level', {
        level: query.level,
      });
    }

    const page = await paginate(queryBuilder, query);
    const counts = await this.countActiveEnrollments(
      page.data.map((training) => training.id),
    );
    return toPage(
      page.data.map((training) =>
        TrainingResponseDto.from(training, counts.get(training.id) ?? 0),
      ),
      page.total,
      query,
    );
  }

  async findOne(id: string): Promise<TrainingResponseDto> {
    const training = await this.findEntity(id);
    const counts = await this.countActiveEnrollments([id]);
    return TrainingResponseDto.from(training, counts.get(id) ?? 0);
  }

  async create(dto: CreateTrainingDto): Promise<TrainingResponseDto> {
    const skill = await this.findSkill(dto.skillId);
    this.assertLevelWithinSkill(dto.targetLevel, skill);

    const saved = await this.trainings.save(
      this.trainings.create({
        title: dto.title,
        description: dto.description ?? null,
        skillId: dto.skillId,
        targetLevel: dto.targetLevel,
        durationHours: dto.durationHours,
        provider: dto.provider ?? null,
        startDate: dto.startDate ?? null,
        capacity: dto.capacity,
        ...(dto.status ? { status: dto.status } : {}),
      }),
    );
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateTrainingDto,
  ): Promise<TrainingResponseDto> {
    const training = await this.findEntity(id);

    const skillId = dto.skillId ?? training.skillId;
    const targetLevel = dto.targetLevel ?? training.targetLevel;
    if (dto.skillId || dto.targetLevel) {
      this.assertLevelWithinSkill(targetLevel, await this.findSkill(skillId));
    }
    if (dto.capacity !== undefined) {
      await this.assertCapacityCoversEnrollments(id, dto.capacity);
    }

    const { skillId: _skill, ...fields } = dto;
    Object.assign(training, fields);
    training.skillId = skillId;
    training.skill = { id: skillId } as Skill;

    await this.trainings.save(training);
    return this.findOne(id);
  }

  /** A training that has enrollments cannot be deleted: cancel it instead. */
  async remove(id: string): Promise<void> {
    const training = await this.findEntity(id);
    try {
      await this.trainings.remove(training);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Training has enrollments: set its status to CANCELLED instead of deleting it',
        );
      }
      throw error;
    }
  }

  /** Seats taken per training, in one query. Cancelled enrollments free their seat. */
  async countActiveEnrollments(
    trainingIds: string[],
  ): Promise<Map<string, number>> {
    if (trainingIds.length === 0) {
      return new Map();
    }
    const rows = await this.enrollments
      .createQueryBuilder('enrollment')
      .select('enrollment.trainingId', 'trainingId')
      .addSelect('COUNT(*)', 'count')
      .where('enrollment.trainingId IN (:...trainingIds)', { trainingIds })
      .andWhere('enrollment.status != :cancelled', {
        cancelled: EnrollmentStatus.Cancelled,
      })
      .groupBy('enrollment.trainingId')
      .getRawMany<{ trainingId: string; count: string }>();

    return new Map(rows.map((row) => [row.trainingId, Number(row.count)]));
  }

  private async findEntity(id: string): Promise<Training> {
    const training = await this.trainings.findOne({
      where: { id },
      relations: { skill: true },
    });
    if (!training) {
      throw new NotFoundException('Training not found');
    }
    return training;
  }

  private async findSkill(skillId: string): Promise<Skill> {
    const skill = await this.skills.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    return skill;
  }

  private assertLevelWithinSkill(targetLevel: number, skill: Skill): void {
    if (targetLevel > skill.maxLevel) {
      throw new BadRequestException(
        `targetLevel cannot exceed the maximum level of ${skill.name} (${skill.maxLevel})`,
      );
    }
  }

  private async assertCapacityCoversEnrollments(
    trainingId: string,
    capacity: number,
  ): Promise<void> {
    const enrolled = await this.enrollments.count({
      where: { trainingId, status: Not(In([EnrollmentStatus.Cancelled])) },
    });
    if (capacity < enrolled) {
      throw new ConflictException(
        `capacity cannot be lower than the ${enrolled} active enrollments`,
      );
    }
  }
}
