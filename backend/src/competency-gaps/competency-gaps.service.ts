import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { GapStatus } from '../common/enums/domain.enums.js';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity.js';
import { AccessPolicy } from '../employees/access-policy.service.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { PositionSkill } from '../positions/entities/position-skill.entity.js';
import { TrainingRecommendationsService } from '../trainings/training-recommendations.service.js';
import type {
  EmployeeGapsResponseDto,
  TrainingRecommendationsResponseDto,
} from './dto/gaps-response.dto.js';
import {
  buildSkillGap,
  sortByUrgency,
  summarize,
  type SkillGap,
} from './gap-calculator.js';

/** How many alternatives the dedicated recommendations endpoint lists per skill. */
const ALTERNATIVES_PER_SKILL = 5;

type Analysis = {
  employee: EmployeeGapsResponseDto['employee'];
  position: EmployeeGapsResponseDto['position'];
  gaps: SkillGap[];
};

@Injectable()
export class CompetencyGapsService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(PositionSkill)
    private readonly positionSkills: Repository<PositionSkill>,
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkills: Repository<EmployeeSkill>,
    private readonly accessPolicy: AccessPolicy,
    private readonly recommendations: TrainingRecommendationsService,
  ) {}

  /**
   * Gaps of the employee against their position, each development need
   * carrying the best training to close it. Computed on demand, never stored,
   * so it always reflects the latest assessment.
   */
  async forEmployee(
    employeeId: string,
    user: AuthUser,
  ): Promise<EmployeeGapsResponseDto> {
    const { employee, position, gaps } = await this.analyse(employeeId, user);
    const trainings = await this.recommendations.recommend(
      employeeId,
      this.needsOf(gaps),
      1,
    );

    return {
      employee,
      position,
      summary: summarize(gaps),
      gaps: gaps.map((item) => ({
        ...item,
        recommendedTraining: trainings.get(item.skill.id)?.[0] ?? null,
      })),
    };
  }

  /** For each development need, the ranked list of trainings that could close it. */
  async recommendationsForEmployee(
    employeeId: string,
    user: AuthUser,
  ): Promise<TrainingRecommendationsResponseDto> {
    const { employee, position, gaps } = await this.analyse(employeeId, user);
    const trainings = await this.recommendations.recommend(
      employeeId,
      this.needsOf(gaps),
      ALTERNATIVES_PER_SKILL,
    );

    return {
      employee,
      position,
      recommendations: gaps
        .filter((item) => item.status === GapStatus.ToDevelop)
        .map((item) => ({
          skill: item.skill,
          currentLevel: item.currentLevel,
          requiredLevel: item.requiredLevel,
          gap: item.gap,
          priority: item.priority,
          trainings: trainings.get(item.skill.id) ?? [],
        })),
    };
  }

  private needsOf(gaps: SkillGap[]) {
    return gaps
      .filter((item) => item.status === GapStatus.ToDevelop)
      .map((item) => ({
        skillId: item.skill.id,
        currentLevel: item.currentLevel,
        requiredLevel: item.requiredLevel,
      }));
  }

  private async analyse(employeeId: string, user: AuthUser): Promise<Analysis> {
    // Scope first, so that out-of-scope callers learn nothing about existence.
    await this.accessPolicy.assertCanAccessEmployee(user, employeeId);

    const employee = await this.employees.findOne({
      where: { id: employeeId },
      relations: { position: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!employee.position) {
      throw new ConflictException(
        'The employee has no position: competency gaps cannot be computed',
      );
    }

    const requirements = await this.positionSkills.find({
      where: { positionId: employee.position.id },
      relations: { skill: true },
    });
    const currentLevels = await this.loadCurrentLevels(
      employeeId,
      requirements.map((requirement) => requirement.skillId),
    );

    const gaps = sortByUrgency(
      requirements.map((requirement) => {
        const current = currentLevels.get(requirement.skillId);
        return buildSkillGap({
          skill: {
            id: requirement.skill.id,
            name: requirement.skill.name,
            category: requirement.skill.category,
            maxLevel: requirement.skill.maxLevel,
          },
          requiredLevel: requirement.requiredLevel,
          currentLevel: current?.level ?? null,
          evaluatedAt: current?.evaluatedAt ?? null,
        });
      }),
    );

    return {
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
      },
      position: { id: employee.position.id, title: employee.position.title },
      gaps,
    };
  }

  /** One query for all required skills, instead of one per skill. */
  private async loadCurrentLevels(
    employeeId: string,
    skillIds: string[],
  ): Promise<Map<string, EmployeeSkill>> {
    if (skillIds.length === 0) {
      return new Map();
    }
    const held = await this.employeeSkills.find({
      where: { employeeId, skillId: In(skillIds) },
    });
    return new Map(held.map((link) => [link.skillId, link]));
  }
}
