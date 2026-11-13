import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { AccessPolicy } from '../employees/access-policy.service.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { EvaluationsService } from '../evaluations/evaluations.service.js';
import { EmployeeSkillResponseDto } from './dto/employee-skill-response.dto.js';
import type { SetEmployeeSkillDto } from './dto/employee-skill.dto.js';
import { EmployeeSkill } from './entities/employee-skill.entity.js';

@Injectable()
export class EmployeeSkillsService {
  constructor(
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkills: Repository<EmployeeSkill>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly accessPolicy: AccessPolicy,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  async list(
    employeeId: string,
    user: AuthUser,
  ): Promise<EmployeeSkillResponseDto[]> {
    // Scope first, so that out-of-scope callers learn nothing about existence.
    await this.accessPolicy.assertCanAccessEmployee(user, employeeId);
    await this.assertEmployeeExists(employeeId);

    const links = await this.employeeSkills.find({
      where: { employeeId },
      relations: { skill: true, evaluator: true },
      order: { skill: { name: 'ASC' } },
    });
    return links.map((link) => EmployeeSkillResponseDto.from(link));
  }

  /**
   * Sets the current level of a skill. This is an assessment like any other:
   * it goes through the evaluation service so that the history is always
   * written, with the same rules and scope.
   * Returns the current state, which a back-dated assessment leaves unchanged.
   */
  async set(
    employeeId: string,
    skillId: string,
    dto: SetEmployeeSkillDto,
    user: AuthUser,
  ): Promise<EmployeeSkillResponseDto> {
    await this.evaluationsService.evaluate(
      {
        employeeId,
        skillId,
        level: dto.level,
        evaluatedAt: dto.evaluatedAt,
        comment: dto.comment,
      },
      user,
    );

    const link = await this.employeeSkills.findOneOrFail({
      where: { employeeId, skillId },
      relations: { skill: true, evaluator: true },
    });
    return EmployeeSkillResponseDto.from(link);
  }

  async remove(employeeId: string, skillId: string): Promise<void> {
    await this.assertEmployeeExists(employeeId);
    const link = await this.employeeSkills.findOne({
      where: { employeeId, skillId },
    });
    if (!link) {
      throw new NotFoundException('The employee does not hold this skill');
    }
    await this.employeeSkills.remove(link);
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    if (!(await this.employees.exists({ where: { id: employeeId } }))) {
      throw new NotFoundException('Employee not found');
    }
  }
}
