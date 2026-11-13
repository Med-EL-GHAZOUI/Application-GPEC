import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type.js';
import { AccessPolicy } from '../employees/access-policy.service.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { Skill } from '../skills/entities/skill.entity.js';
import { EmployeeSkillResponseDto } from './dto/employee-skill-response.dto.js';
import type { SetEmployeeSkillDto } from './dto/employee-skill.dto.js';
import { EmployeeSkill } from './entities/employee-skill.entity.js';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

@Injectable()
export class EmployeeSkillsService {
  constructor(
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkills: Repository<EmployeeSkill>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    private readonly accessPolicy: AccessPolicy,
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
   * Sets the current level of a skill for an employee (creates or replaces).
   * The caller becomes the evaluator; nobody can assess themselves.
   */
  async set(
    employeeId: string,
    skillId: string,
    dto: SetEmployeeSkillDto,
    user: AuthUser,
  ): Promise<EmployeeSkillResponseDto> {
    await this.accessPolicy.assertCanAccessEmployee(user, employeeId);
    await this.assertEmployeeExists(employeeId);
    const skill = await this.findSkill(skillId);

    if (dto.level > skill.maxLevel) {
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

    await this.employeeSkills.upsert(
      {
        employeeId,
        skillId,
        level: dto.level,
        evaluatedAt,
        evaluatorId,
        comment: dto.comment ?? null,
      },
      { conflictPaths: ['employeeId', 'skillId'] },
    );
    return this.getOne(employeeId, skillId);
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

  private async getOne(
    employeeId: string,
    skillId: string,
  ): Promise<EmployeeSkillResponseDto> {
    const link = await this.employeeSkills.findOneOrFail({
      where: { employeeId, skillId },
      relations: { skill: true, evaluator: true },
    });
    return EmployeeSkillResponseDto.from(link);
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
