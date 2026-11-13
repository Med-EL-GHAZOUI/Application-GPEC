import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type.js';
import { Role } from '../common/enums/role.enum.js';
import { EmployeeSkillsService } from './employee-skills.service.js';

const EMPLOYEE_ID = 'employee-1';
const SKILL_ID = 'skill-1';
const user: AuthUser = { id: 'user-1', email: 'hr@company.com', role: Role.Hr };

const build = (
  options: {
    skillMaxLevel?: number | null;
    employeeExists?: boolean;
    evaluatorId?: string | null;
  } = {},
) => {
  const {
    skillMaxLevel = 5,
    employeeExists = true,
    evaluatorId = null,
  } = options;

  const employeeSkills = {
    upsert: vi.fn().mockResolvedValue(undefined),
    findOneOrFail: vi.fn().mockResolvedValue({
      skill: {
        id: SKILL_ID,
        name: 'Angular',
        category: 'TECHNICAL',
        maxLevel: 5,
      },
      level: 3,
      evaluatedAt: '2026-01-01',
      evaluator: null,
      comment: null,
    }),
    findOne: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([]),
  };
  const employees = { exists: vi.fn().mockResolvedValue(employeeExists) };
  const skills = {
    findOne: vi
      .fn()
      .mockResolvedValue(
        skillMaxLevel === null
          ? null
          : { id: SKILL_ID, name: 'Angular', maxLevel: skillMaxLevel },
      ),
  };
  const accessPolicy = {
    assertCanAccessEmployee: vi.fn().mockResolvedValue(undefined),
    findEmployeeIdByUserId: vi.fn().mockResolvedValue(evaluatorId),
  };

  const service = new EmployeeSkillsService(
    employeeSkills as never,
    employees as never,
    skills as never,
    accessPolicy as never,
  );
  return { service, employeeSkills, accessPolicy };
};

describe('EmployeeSkillsService.set', () => {
  it('records the caller as evaluator and defaults the date to today', async () => {
    const { service, employeeSkills } = build({ evaluatorId: 'evaluator-1' });

    await service.set(
      EMPLOYEE_ID,
      SKILL_ID,
      { level: 3, comment: 'Solid' },
      user,
    );

    expect(employeeSkills.upsert).toHaveBeenCalledWith(
      {
        employeeId: EMPLOYEE_ID,
        skillId: SKILL_ID,
        level: 3,
        evaluatedAt: new Date().toISOString().slice(0, 10),
        evaluatorId: 'evaluator-1',
        comment: 'Solid',
      },
      { conflictPaths: ['employeeId', 'skillId'] },
    );
  });

  it('checks the caller scope before anything else', async () => {
    const { service, accessPolicy, employeeSkills } = build();
    accessPolicy.assertCanAccessEmployee.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.set(EMPLOYEE_ID, SKILL_ID, { level: 3 }, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(employeeSkills.upsert).not.toHaveBeenCalled();
  });

  it('rejects a level above the skill maximum', async () => {
    const { service, employeeSkills } = build({ skillMaxLevel: 4 });

    await expect(
      service.set(EMPLOYEE_ID, SKILL_ID, { level: 5 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(employeeSkills.upsert).not.toHaveBeenCalled();
  });

  it('accepts a level equal to the skill maximum', async () => {
    const { service, employeeSkills } = build({ skillMaxLevel: 4 });
    await service.set(EMPLOYEE_ID, SKILL_ID, { level: 4 }, user);
    expect(employeeSkills.upsert).toHaveBeenCalledOnce();
  });

  it('rejects an assessment dated in the future', async () => {
    const { service } = build();
    const tomorrow = new Date(Date.now() + 24 * 3_600_000)
      .toISOString()
      .slice(0, 10);

    await expect(
      service.set(
        EMPLOYEE_ID,
        SKILL_ID,
        { level: 3, evaluatedAt: tomorrow },
        user,
      ),
    ).rejects.toThrow('future');
  });

  it('accepts a past date', async () => {
    const { service, employeeSkills } = build();
    await service.set(
      EMPLOYEE_ID,
      SKILL_ID,
      { level: 3, evaluatedAt: '2020-05-17' },
      user,
    );
    expect(employeeSkills.upsert).toHaveBeenCalledOnce();
  });

  it('forbids assessing oneself', async () => {
    const { service, employeeSkills } = build({ evaluatorId: EMPLOYEE_ID });

    await expect(
      service.set(EMPLOYEE_ID, SKILL_ID, { level: 3 }, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(employeeSkills.upsert).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown skill or employee', async () => {
    await expect(
      build({ skillMaxLevel: null }).service.set(
        EMPLOYEE_ID,
        SKILL_ID,
        { level: 3 },
        user,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      build({ employeeExists: false }).service.set(
        EMPLOYEE_ID,
        SKILL_ID,
        { level: 3 },
        user,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EmployeeSkillsService.remove', () => {
  it('answers 404 when the employee does not hold the skill', async () => {
    const { service } = build();
    await expect(service.remove(EMPLOYEE_ID, SKILL_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes an existing link', async () => {
    const { service, employeeSkills } = build();
    employeeSkills.findOne.mockResolvedValue({ id: 'link-1' });

    await service.remove(EMPLOYEE_ID, SKILL_ID);

    expect(employeeSkills.remove).toHaveBeenCalledWith({ id: 'link-1' });
  });
});

describe('EmployeeSkillsService.list', () => {
  it('checks the scope before revealing whether the employee exists', async () => {
    const { service, accessPolicy } = build({ employeeExists: false });
    accessPolicy.assertCanAccessEmployee.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(service.list(EMPLOYEE_ID, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
