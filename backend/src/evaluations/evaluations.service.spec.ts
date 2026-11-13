import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type.js';
import { Role } from '../common/enums/role.enum.js';
import { EvaluationsService } from './evaluations.service.js';

const EMPLOYEE_ID = 'employee-1';
const SKILL_ID = 'skill-1';
const user: AuthUser = { id: 'user-1', email: 'hr@company.com', role: Role.Hr };
const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 3_600_000).toISOString().slice(0, 10);

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

  // Fake transaction manager: records what the service writes.
  const manager = {
    create: vi.fn((_entity: unknown, data: object) => ({ ...data })),
    save: vi.fn(async (row: object) => ({ id: 'evaluation-1', ...row })),
    query: vi.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: vi.fn(async (work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };
  const evaluations = {
    findOneOrFail: vi.fn().mockResolvedValue({
      id: 'evaluation-1',
      employeeId: EMPLOYEE_ID,
      skill: {
        id: SKILL_ID,
        name: 'Angular',
        category: 'TECHNICAL',
        maxLevel: 5,
      },
      level: 3,
      evaluatedAt: today(),
      evaluator: null,
      comment: null,
      createdAt: new Date(),
    }),
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

  const service = new EvaluationsService(
    dataSource as never,
    evaluations as never,
    employees as never,
    skills as never,
    accessPolicy as never,
  );
  return { service, manager, dataSource, evaluations, accessPolicy };
};

const evaluate = (
  service: EvaluationsService,
  extra: { level?: number; evaluatedAt?: string; comment?: string } = {},
) =>
  service.evaluate(
    { employeeId: EMPLOYEE_ID, skillId: SKILL_ID, level: 3, ...extra },
    user,
  );

describe('EvaluationsService.evaluate', () => {
  it('appends to the history and updates the current level in one transaction', async () => {
    const { service, manager, dataSource } = build({
      evaluatorId: 'evaluator-1',
    });

    await evaluate(service, { comment: 'Solid' });

    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(manager.save).toHaveBeenCalledWith({
      employeeId: EMPLOYEE_ID,
      skillId: SKILL_ID,
      evaluatorId: 'evaluator-1',
      level: 3,
      evaluatedAt: today(),
      comment: 'Solid',
    });
    expect(manager.query).toHaveBeenCalledOnce();
    expect(manager.query.mock.calls[0][1]).toEqual([
      EMPLOYEE_ID,
      SKILL_ID,
      3,
      today(),
      'evaluator-1',
      'Solid',
    ]);
  });

  it('only lets a more recent assessment overwrite the current level', async () => {
    const { service, manager } = build();
    await evaluate(service);

    const sql = manager.query.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT (employee_id, skill_id) DO UPDATE');
    expect(sql).toContain(
      'WHERE employee_skills.evaluated_at <= EXCLUDED.evaluated_at',
    );
  });

  it('writes nothing when the caller is out of scope', async () => {
    const { service, accessPolicy, dataSource } = build();
    accessPolicy.assertCanAccessEmployee.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(evaluate(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a level above the skill maximum but accepts the maximum', async () => {
    const { service, dataSource } = build({ skillMaxLevel: 4 });

    await expect(evaluate(service, { level: 5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();

    await evaluate(service, { level: 4 });
    expect(dataSource.transaction).toHaveBeenCalledOnce();
  });

  it('rejects an assessment dated in the future, accepts a past date', async () => {
    const { service, dataSource } = build();

    await expect(
      evaluate(service, { evaluatedAt: daysFromNow(1) }),
    ).rejects.toThrow('future');
    await evaluate(service, { evaluatedAt: '2020-05-17' });
    expect(dataSource.transaction).toHaveBeenCalledOnce();
  });

  it('forbids assessing oneself', async () => {
    const { service, dataSource } = build({ evaluatorId: EMPLOYEE_ID });

    await expect(evaluate(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown skill or employee', async () => {
    await expect(
      evaluate(build({ skillMaxLevel: null }).service),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      evaluate(build({ employeeExists: false }).service),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EvaluationsService.evolution', () => {
  it('returns the points oldest first, without internal identifiers of the row', async () => {
    const { service, evaluations } = build();
    evaluations.find.mockResolvedValue([
      {
        id: 'x',
        evaluatedAt: '2026-01-10',
        level: 3,
        evaluator: { id: 'e1', firstName: 'A', lastName: 'B' },
        comment: 'first',
      },
      {
        id: 'y',
        evaluatedAt: '2027-01-10',
        level: 4,
        evaluator: null,
        comment: null,
      },
    ]);

    const points = await service.evolution(EMPLOYEE_ID, SKILL_ID, user);

    expect(evaluations.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { evaluatedAt: 'ASC', createdAt: 'ASC' },
      }),
    );
    expect(points).toEqual([
      {
        evaluatedAt: '2026-01-10',
        level: 3,
        evaluator: { id: 'e1', firstName: 'A', lastName: 'B' },
        comment: 'first',
      },
      { evaluatedAt: '2027-01-10', level: 4, evaluator: null, comment: null },
    ]);
  });

  it('checks the scope before anything else', async () => {
    const { service, accessPolicy, evaluations } = build();
    accessPolicy.assertCanAccessEmployee.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.evolution(EMPLOYEE_ID, SKILL_ID, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(evaluations.find).not.toHaveBeenCalled();
  });
});
