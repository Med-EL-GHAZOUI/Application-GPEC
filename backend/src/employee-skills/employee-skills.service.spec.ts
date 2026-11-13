import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type.js';
import { Role } from '../common/enums/role.enum.js';
import { EmployeeSkillsService } from './employee-skills.service.js';

const EMPLOYEE_ID = 'employee-1';
const SKILL_ID = 'skill-1';
const user: AuthUser = { id: 'user-1', email: 'hr@company.com', role: Role.Hr };

const build = (options: { employeeExists?: boolean } = {}) => {
  const { employeeExists = true } = options;

  const employeeSkills = {
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
  const accessPolicy = {
    assertCanAccessEmployee: vi.fn().mockResolvedValue(undefined),
  };
  const evaluationsService = { evaluate: vi.fn().mockResolvedValue({}) };

  const service = new EmployeeSkillsService(
    employeeSkills as never,
    employees as never,
    accessPolicy as never,
    evaluationsService as never,
  );
  return { service, employeeSkills, accessPolicy, evaluationsService };
};

describe('EmployeeSkillsService.set', () => {
  it('goes through the evaluation service so that the history is written', async () => {
    const { service, evaluationsService } = build();

    await service.set(
      EMPLOYEE_ID,
      SKILL_ID,
      { level: 3, comment: 'Solid' },
      user,
    );

    expect(evaluationsService.evaluate).toHaveBeenCalledWith(
      {
        employeeId: EMPLOYEE_ID,
        skillId: SKILL_ID,
        level: 3,
        evaluatedAt: undefined,
        comment: 'Solid',
      },
      user,
    );
  });

  it('returns the current state after the assessment', async () => {
    const { service } = build();
    const result = await service.set(EMPLOYEE_ID, SKILL_ID, { level: 3 }, user);
    expect(result).toMatchObject({ level: 3, skill: { id: SKILL_ID } });
  });

  it('propagates the rules of the evaluation service', async () => {
    const { service, evaluationsService, employeeSkills } = build();
    evaluationsService.evaluate.mockRejectedValue(new ForbiddenException());

    await expect(
      service.set(EMPLOYEE_ID, SKILL_ID, { level: 3 }, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(employeeSkills.findOneOrFail).not.toHaveBeenCalled();
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
