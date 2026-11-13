import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity.js';
import { AccessPolicy } from '../employees/access-policy.service.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { PositionSkill } from '../positions/entities/position-skill.entity.js';
import type { EmployeeGapsResponseDto } from './dto/gaps-response.dto.js';
import { buildSkillGap, sortByUrgency, summarize } from './gap-calculator.js';

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
  ) {}

  /**
   * Compares, for every skill required by the employee's position, the level
   * the position expects with the employee's current level. Computed on
   * demand, never stored, so it always reflects the latest assessment.
   */
  async forEmployee(
    employeeId: string,
    user: AuthUser,
  ): Promise<EmployeeGapsResponseDto> {
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
      summary: summarize(gaps),
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
