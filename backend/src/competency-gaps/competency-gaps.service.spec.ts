import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type.js';
import { GapPriority, GapStatus } from '../common/enums/domain.enums.js';
import { Role } from '../common/enums/role.enum.js';
import { CompetencyGapsService } from './competency-gaps.service.js';

const EMPLOYEE_ID = 'employee-1';
const user: AuthUser = { id: 'user-1', email: 'hr@company.com', role: Role.Hr };

const requirement = (name: string, requiredLevel: number) => ({
  skillId: `skill-${name}`,
  requiredLevel,
  skill: { id: `skill-${name}`, name, category: 'TECHNICAL', maxLevel: 5 },
});

const held = (name: string, level: number) => ({
  skillId: `skill-${name}`,
  level,
  evaluatedAt: '2026-02-01',
});

const build = (
  options: {
    employee?: object | null;
    requirements?: ReturnType<typeof requirement>[];
    held?: ReturnType<typeof held>[];
    recommended?: Map<string, object[]>;
  } = {},
) => {
  const employee =
    options.employee === undefined
      ? {
          id: EMPLOYEE_ID,
          firstName: 'Mohamed',
          lastName: 'Test',
          position: { id: 'position-1', title: 'Software Engineer' },
        }
      : options.employee;

  const employees = { findOne: vi.fn().mockResolvedValue(employee) };
  const positionSkills = {
    find: vi.fn().mockResolvedValue(options.requirements ?? []),
  };
  const employeeSkills = {
    find: vi.fn().mockResolvedValue(options.held ?? []),
  };
  const accessPolicy = {
    assertCanAccessEmployee: vi.fn().mockResolvedValue(undefined),
  };

  const recommendations = {
    recommend: vi.fn().mockResolvedValue(options.recommended ?? new Map()),
  };

  const service = new CompetencyGapsService(
    employees as never,
    positionSkills as never,
    employeeSkills as never,
    accessPolicy as never,
    recommendations as never,
  );
  return {
    service,
    employees,
    positionSkills,
    employeeSkills,
    accessPolicy,
    recommendations,
  };
};

describe('CompetencyGapsService.forEmployee', () => {
  it('reproduces the specification example: Angular required 4, current 2, gap 2', async () => {
    const { service } = build({
      requirements: [requirement('Angular', 4)],
      held: [held('Angular', 2)],
    });

    const result = await service.forEmployee(EMPLOYEE_ID, user);

    expect(result.gaps).toEqual([
      expect.objectContaining({
        skill: expect.objectContaining({ name: 'Angular' }),
        currentLevel: 2,
        requiredLevel: 4,
        gap: 2,
        status: GapStatus.ToDevelop,
        priority: GapPriority.Medium,
        evaluatedAt: '2026-02-01',
      }),
    ]);
  });

  it('treats a never-assessed required skill as level 0', async () => {
    const { service } = build({ requirements: [requirement('Docker', 3)] });

    const [item] = (await service.forEmployee(EMPLOYEE_ID, user)).gaps;

    expect(item).toMatchObject({
      currentLevel: 0,
      gap: 3,
      priority: GapPriority.High,
      evaluatedAt: null,
    });
  });

  it('ignores skills the employee holds that the position does not require', async () => {
    const { service } = build({
      requirements: [requirement('Angular', 3)],
      held: [held('Angular', 3), held('Kubernetes', 5)],
    });

    const { gaps, summary } = await service.forEmployee(EMPLOYEE_ID, user);

    expect(gaps).toHaveLength(1);
    expect(summary.requiredSkills).toBe(1);
  });

  it('orders by largest gap and summarises the result', async () => {
    const { service } = build({
      requirements: [
        requirement('SQL', 2),
        requirement('Angular', 4),
        requirement('Docker', 3),
        requirement('Communication', 3),
      ],
      held: [held('SQL', 2), held('Angular', 2), held('Communication', 4)],
    });

    const result = await service.forEmployee(EMPLOYEE_ID, user);

    expect(result.gaps.map((item) => item.skill.name)).toEqual([
      'Docker',
      'Angular',
      'SQL',
      'Communication',
    ]);
    expect(result.summary).toEqual({
      requiredSkills: 4,
      toDevelop: 2,
      mastered: 1,
      aboveRequirement: 1,
      totalGap: 5,
    });
    expect(result.employee).toEqual({
      id: EMPLOYEE_ID,
      firstName: 'Mohamed',
      lastName: 'Test',
    });
    expect(result.position.title).toBe('Software Engineer');
  });

  it('loads the current levels with a single query', async () => {
    const { service, employeeSkills } = build({
      requirements: [
        requirement('A', 1),
        requirement('B', 2),
        requirement('C', 3),
      ],
    });

    await service.forEmployee(EMPLOYEE_ID, user);

    expect(employeeSkills.find).toHaveBeenCalledOnce();
  });

  it('returns an empty analysis, without querying levels, for a position with no requirement', async () => {
    const { service, employeeSkills } = build();

    const result = await service.forEmployee(EMPLOYEE_ID, user);

    expect(result.gaps).toEqual([]);
    expect(result.summary.requiredSkills).toBe(0);
    expect(employeeSkills.find).not.toHaveBeenCalled();
  });

  it('answers 409 for an employee without position', async () => {
    const { service } = build({
      employee: {
        id: EMPLOYEE_ID,
        firstName: 'A',
        lastName: 'B',
        position: null,
      },
    });

    await expect(service.forEmployee(EMPLOYEE_ID, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('answers 404 for an unknown employee', async () => {
    const { service } = build({ employee: null });

    await expect(service.forEmployee(EMPLOYEE_ID, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks the caller scope before reading anything', async () => {
    const { service, accessPolicy, employees } = build();
    accessPolicy.assertCanAccessEmployee.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(service.forEmployee(EMPLOYEE_ID, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(employees.findOne).not.toHaveBeenCalled();
  });
});

const trainingSummary = (title: string) => ({ id: `training-${title}`, title });

describe('CompetencyGapsService training recommendations', () => {
  const requirements = [
    requirement('Angular', 4),
    requirement('SQL', 2),
    requirement('Communication', 3),
  ];
  const held = [
    { skillId: 'skill-Angular', level: 2, evaluatedAt: '2026-02-01' },
    { skillId: 'skill-SQL', level: 2, evaluatedAt: '2026-02-01' },
    { skillId: 'skill-Communication', level: 4, evaluatedAt: '2026-02-01' },
  ];

  it('asks for recommendations only for the skills to develop', async () => {
    const { service, recommendations } = build({ requirements, held });

    await service.forEmployee(EMPLOYEE_ID, user);

    expect(recommendations.recommend).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      [{ skillId: 'skill-Angular', currentLevel: 2, requiredLevel: 4 }],
      1,
    );
  });

  it('attaches the best training to each development need, and null elsewhere', async () => {
    const { service } = build({
      requirements,
      held,
      recommended: new Map([['skill-Angular', [trainingSummary('Advanced')]]]),
    });

    const { gaps } = await service.forEmployee(EMPLOYEE_ID, user);

    expect(
      gaps.map((item) => [
        item.skill.name,
        item.recommendedTraining?.title ?? null,
      ]),
    ).toEqual([
      ['Angular', 'Advanced'],
      ['SQL', null],
      ['Communication', null],
    ]);
  });

  it('gives null when no training suits a development need', async () => {
    const { service } = build({
      requirements,
      held,
      recommended: new Map([['skill-Angular', []]]),
    });

    const { gaps } = await service.forEmployee(EMPLOYEE_ID, user);

    expect(gaps[0].recommendedTraining).toBeNull();
  });

  it('lists several alternatives per skill to develop, in the dedicated endpoint', async () => {
    const { service, recommendations } = build({
      requirements,
      held,
      recommended: new Map([
        [
          'skill-Angular',
          [trainingSummary('Advanced'), trainingSummary('Basics')],
        ],
      ]),
    });

    const result = await service.recommendationsForEmployee(EMPLOYEE_ID, user);

    expect(recommendations.recommend).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      expect.any(Array),
      5,
    );
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      skill: { name: 'Angular' },
      currentLevel: 2,
      requiredLevel: 4,
      gap: 2,
      priority: GapPriority.Medium,
    });
    expect(
      result.recommendations[0].trainings.map((item) => item.title),
    ).toEqual(['Advanced', 'Basics']);
  });

  it('applies the same scope check to the recommendations endpoint', async () => {
    const { service, accessPolicy, recommendations } = build({
      requirements,
      held,
    });
    accessPolicy.assertCanAccessEmployee.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.recommendationsForEmployee(EMPLOYEE_ID, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recommendations.recommend).not.toHaveBeenCalled();
  });
});
