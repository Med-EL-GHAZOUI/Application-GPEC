import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import {
  type Page,
  paginate,
  toLikePattern,
  toPage,
} from '../common/pagination/paginate.js';
import { AccessPolicy } from '../employees/access-policy.service.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { Skill } from '../skills/entities/skill.entity.js';
import type {
  CreateEvaluationDto,
  EvaluationHistoryQueryDto,
} from './dto/evaluation.dto.js';
import {
  EvaluationResponseDto,
  type EvolutionPointDto,
} from './dto/evaluation-response.dto.js';
import { SkillEvaluation } from './entities/skill-evaluation.entity.js';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

// Keeps the current level in sync with the most recent assessment (by date;
// on the same day the latest one recorded wins). A back-dated assessment is
// kept in the history but never overwrites a more recent current level.
// Atomic: no read-modify-write window between concurrent evaluations.
const UPSERT_CURRENT_LEVEL = `
  INSERT INTO employee_skills
    (employee_id, skill_id, level, evaluated_at, evaluator_id, comment)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (employee_id, skill_id) DO UPDATE SET
    level = EXCLUDED.level,
    evaluated_at = EXCLUDED.evaluated_at,
    evaluator_id = EXCLUDED.evaluator_id,
    comment = EXCLUDED.comment,
    updated_at = now()
  WHERE employee_skills.evaluated_at <= EXCLUDED.evaluated_at
`;

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SkillEvaluation)
    private readonly evaluations: Repository<SkillEvaluation>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    private readonly accessPolicy: AccessPolicy,
  ) {}

  /**
   * Records an assessment: appends it to the history and updates the current
   * level, in one transaction. The caller becomes the evaluator; nobody can
   * assess themselves.
   */
  async evaluate(
    dto: CreateEvaluationDto,
    user: AuthUser,
  ): Promise<EvaluationResponseDto> {
    const { employeeId, skillId, level, comment } = dto;

    await this.accessPolicy.assertCanAccessEmployee(user, employeeId);
    await this.assertEmployeeExists(employeeId);
    const skill = await this.findSkill(skillId);

    if (level > skill.maxLevel) {
      throw new BadRequestException(
        `level cannot exceed the maximum level of ${skill.name} (${skill.maxLevel})`,
      );
    }
    const evaluatedAt = dto.evaluatedAt ?? todayIso();
    if (evaluatedAt > todayIso()) {
      throw new BadRequestException('evaluatedAt cannot be in the future');
    }

    const evaluatorId = await this.accessPolicy.findEmployeeIdByUserId(user.id);
    if (evaluatorId === employeeId) {
      throw new ForbiddenException('Self-assessment is not allowed');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const evaluation = await manager.save(
        manager.create(SkillEvaluation, {
          employeeId,
          skillId,
          evaluatorId,
          level,
          evaluatedAt,
          comment: comment ?? null,
        }),
      );
      await manager.query(UPSERT_CURRENT_LEVEL, [
        employeeId,
        skillId,
        level,
        evaluatedAt,
        evaluatorId,
        comment ?? null,
      ]);
      return evaluation;
    });

    return this.findOne(saved.id);
  }

  /** Full history of an employee, newest first. */
  async history(
    employeeId: string,
    query: EvaluationHistoryQueryDto,
    user: AuthUser,
  ): Promise<Page<EvaluationResponseDto>> {
    await this.accessPolicy.assertCanAccessEmployee(user, employeeId);
    await this.assertEmployeeExists(employeeId);

    const queryBuilder = this.evaluations
      .createQueryBuilder('evaluation')
      .innerJoinAndSelect('evaluation.skill', 'skill')
      .leftJoinAndSelect('evaluation.evaluator', 'evaluator')
      .where('evaluation.employeeId = :employeeId', { employeeId })
      .orderBy('evaluation.evaluatedAt', 'DESC')
      .addOrderBy('evaluation.createdAt', 'DESC');

    if (query.skillId) {
      queryBuilder.andWhere('evaluation.skillId = :skillId', {
        skillId: query.skillId,
      });
    }
    if (query.search) {
      queryBuilder.andWhere(
        '(skill.name ILIKE :search OR evaluation.comment ILIKE :search)',
        { search: toLikePattern(query.search) },
      );
    }

    const page = await paginate(queryBuilder, query);
    return toPage(
      page.data.map((evaluation) => EvaluationResponseDto.from(evaluation)),
      page.total,
      query,
    );
  }

  /** Chronological progression of an employee on one skill (oldest first). */
  async evolution(
    employeeId: string,
    skillId: string,
    user: AuthUser,
  ): Promise<EvolutionPointDto[]> {
    await this.accessPolicy.assertCanAccessEmployee(user, employeeId);
    await this.assertEmployeeExists(employeeId);
    await this.findSkill(skillId);

    const rows = await this.evaluations.find({
      where: { employeeId, skillId },
      relations: { evaluator: true },
      order: { evaluatedAt: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      evaluatedAt: row.evaluatedAt,
      level: row.level,
      evaluator: row.evaluator
        ? {
            id: row.evaluator.id,
            firstName: row.evaluator.firstName,
            lastName: row.evaluator.lastName,
          }
        : null,
      comment: row.comment,
    }));
  }

  private async findOne(id: string): Promise<EvaluationResponseDto> {
    const evaluation = await this.evaluations.findOneOrFail({
      where: { id },
      relations: { skill: true, evaluator: true },
    });
    return EvaluationResponseDto.from(evaluation);
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    if (!(await this.employees.exists({ where: { id: employeeId } }))) {
      throw new NotFoundException('Employee not found');
    }
  }

  private async findSkill(skillId: string): Promise<Skill> {
    const skill = await this.skills.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    return skill;
  }
}
