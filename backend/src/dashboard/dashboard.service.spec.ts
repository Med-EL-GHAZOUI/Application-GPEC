import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type.js';
import { TrainingStatus } from '../common/enums/domain.enums.js';
import { Role } from '../common/enums/role.enum.js';
import { HIGH_PRIORITY_GAP } from '../competency-gaps/gap-calculator.js';
import { DASHBOARD_QUERIES as Q } from './dashboard.queries.js';
import { DashboardService, NO_MATCH_ID } from './dashboard.service.js';

const hr: AuthUser = { id: 'u-hr', email: 'hr@company.com', role: Role.Hr };
const admin: AuthUser = {
  id: 'u-admin',
  email: 'a@company.com',
  role: Role.Admin,
};
const manager: AuthUser = {
  id: 'u-mgr',
  email: 'm@company.com',
  role: Role.Manager,
};

const defaultQuery = { limit: 5, months: 12 };

const skillRow = { id: 's1', name: 'Angular', category: 'TECHNICAL' };

/** Rows returned by the database, keyed by query. */
const answers = (overrides: Record<string, unknown[]> = {}) => {
  const base: Record<string, unknown[]> = {
    [Q.totals]: [
      {
        employees: 6,
        active_employees: 5,
        departments: 2,
        positions: 2,
        skills: 5,
        trainings: 4,
        trainings_in_progress: 1,
        employees_in_training: 1,
      },
    ],
    [Q.gapSummary]: [
      { employees_with_gaps: 3, employees_with_high_priority_gap: 1 },
    ],
    [Q.employeesByDepartment]: [
      { id: 'd1', name: 'IT', employees: 3 },
      { id: 'd2', name: 'HR', employees: 0 },
    ],
    [Q.demandedSkills]: [{ ...skillRow, employees: 3, positions: 2 }],
    [Q.deficientSkills]: [
      {
        ...skillRow,
        employees_requiring: 3,
        employees_to_develop: 2,
        total_gap: 4,
      },
    ],
    [Q.criticalSkills]: [
      { ...skillRow, employees_in_high_priority_gap: 1, largest_gap: 3 },
      {
        id: 's2',
        name: 'Docker',
        category: 'TECHNICAL',
        employees_in_high_priority_gap: 1,
        largest_gap: 3,
      },
    ],
    [Q.employeesWithGaps]: [
      {
        id: 'e1',
        first_name: 'Mohamed',
        last_name: 'Test',
        department: 'IT',
        position: 'Engineer',
        total_gap: 5,
        high_priority_gaps: 1,
        skills_to_develop: 2,
      },
    ],
    [Q.trainingsByStatus]: [
      { status: TrainingStatus.Open, count: 2 },
      { status: TrainingStatus.InProgress, count: 1 },
    ],
    [Q.skillsEvolution]: [
      { month: '2026-10', average_level: 2.5, evaluations: 2 },
      { month: '2026-11', average_level: null, evaluations: 0 },
    ],
    [Q.skillExists]: [{ '?column?': 1 }],
    ...overrides,
  };
  return base;
};

const build = (
  overrides: Record<string, unknown[]> = {},
  ownEmployeeId: string | null = 'mgr-employee',
) => {
  const rows = answers(overrides);
  const dataSource = {
    query: vi.fn(async (sql: string) => rows[sql] ?? []),
  };
  const accessPolicy = {
    findEmployeeIdByUserId: vi.fn().mockResolvedValue(ownEmployeeId),
  };
  const service = new DashboardService(
    dataSource as never,
    accessPolicy as never,
  );
  const paramsOf = (sql: string) =>
    dataSource.query.mock.calls.find(([called]) => called === sql)?.[1];
  return { service, dataSource, accessPolicy, paramsOf };
};

describe('DashboardService.getDashboard', () => {
  it('maps every aggregation to the response contract', async () => {
    const { service } = build();

    const result = await service.getDashboard(defaultQuery, hr);

    expect(result.totals).toEqual({
      employees: 6,
      activeEmployees: 5,
      departments: 2,
      positions: 2,
      skills: 5,
      trainings: 4,
      trainingsInProgress: 1,
      employeesInTraining: 1,
    });
    expect(result.gaps).toEqual({
      employeesWithGaps: 3,
      employeesWithHighPriorityGap: 1,
      criticalSkills: 2,
    });
    expect(result.demandedSkills[0]).toEqual({
      skill: { id: 's1', name: 'Angular', category: 'TECHNICAL' },
      employees: 3,
      positions: 2,
    });
    expect(result.deficientSkills[0]).toMatchObject({
      employeesRequiring: 3,
      employeesToDevelop: 2,
      totalGap: 4,
    });
    expect(result.employeesWithGaps[0]).toEqual({
      employee: { id: 'e1', firstName: 'Mohamed', lastName: 'Test' },
      department: 'IT',
      position: 'Engineer',
      totalGap: 5,
      highPriorityGaps: 1,
      skillsToDevelop: 2,
    });
    expect(result.skillsEvolution).toEqual([
      { month: '2026-10', averageLevel: 2.5, evaluations: 2 },
      { month: '2026-11', averageLevel: null, evaluations: 0 },
    ]);
  });

  it('scopes ADMIN and HR to the whole company', async () => {
    for (const user of [admin, hr]) {
      const { service, paramsOf, accessPolicy } = build();

      const result = await service.getDashboard(defaultQuery, user);

      expect(result.scope).toBe('COMPANY');
      expect(paramsOf(Q.totals)).toEqual([null]);
      expect(paramsOf(Q.employeesWithGaps)?.[0]).toBeNull();
      expect(accessPolicy.findEmployeeIdByUserId).not.toHaveBeenCalled();
    }
  });

  it('scopes a MANAGER to their direct reports', async () => {
    const { service, paramsOf } = build();

    const result = await service.getDashboard(defaultQuery, manager);

    expect(result.scope).toBe('TEAM');
    for (const sql of [
      Q.totals,
      Q.gapSummary,
      Q.employeesByDepartment,
      Q.demandedSkills,
    ]) {
      expect(paramsOf(sql)?.[0]).toBe('mgr-employee');
    }
    expect(paramsOf(Q.skillsEvolution)?.[0]).toBe('mgr-employee');
  });

  it('gives a manager without employee record an identifier that matches nobody', async () => {
    const { service, paramsOf } = build({}, null);

    await service.getDashboard(defaultQuery, manager);

    expect(paramsOf(Q.totals)).toEqual([NO_MATCH_ID]);
  });

  it('hides empty departments for a team but keeps them company-wide', async () => {
    const company = await build().service.getDashboard(defaultQuery, hr);
    const team = await build().service.getDashboard(defaultQuery, manager);

    expect(
      company.employeesByDepartment.map((row) => row.department.name),
    ).toEqual(['IT', 'HR']);
    expect(
      team.employeesByDepartment.map((row) => row.department.name),
    ).toEqual(['IT']);
  });

  it('returns every training status, zeros included, in lifecycle order', async () => {
    const { service } = build();

    const { trainingsByStatus } = await service.getDashboard(defaultQuery, hr);

    expect(trainingsByStatus).toEqual([
      { status: 'PLANNED', count: 0 },
      { status: 'OPEN', count: 2 },
      { status: 'IN_PROGRESS', count: 1 },
      { status: 'COMPLETED', count: 0 },
      { status: 'CANCELLED', count: 0 },
    ]);
  });

  it('passes the requested limit to the top lists and truncates the critical skills', async () => {
    const { service, paramsOf } = build();

    const result = await service.getDashboard({ limit: 1, months: 6 }, hr);

    expect(paramsOf(Q.demandedSkills)?.[1]).toBe(1);
    expect(paramsOf(Q.deficientSkills)?.[1]).toBe(1);
    expect(paramsOf(Q.employeesWithGaps)?.[2]).toBe(1);
    expect(paramsOf(Q.skillsEvolution)?.[2]).toBe(6);
    // The count covers every critical skill; the list honours the limit.
    expect(result.gaps.criticalSkills).toBe(2);
    expect(result.criticalSkills).toHaveLength(1);
  });

  it('uses the same high-priority threshold as the gap analysis', async () => {
    const { service, paramsOf } = build();

    await service.getDashboard(defaultQuery, hr);

    expect(paramsOf(Q.gapSummary)?.[1]).toBe(HIGH_PRIORITY_GAP);
    expect(paramsOf(Q.criticalSkills)?.[1]).toBe(HIGH_PRIORITY_GAP);
    expect(paramsOf(Q.employeesWithGaps)?.[1]).toBe(HIGH_PRIORITY_GAP);
  });

  it('answers with empty lists on an empty company', async () => {
    const { service } = build({
      [Q.demandedSkills]: [],
      [Q.deficientSkills]: [],
      [Q.criticalSkills]: [],
      [Q.employeesWithGaps]: [],
      [Q.employeesByDepartment]: [],
      [Q.trainingsByStatus]: [],
    });

    const result = await service.getDashboard(defaultQuery, hr);

    expect(result.demandedSkills).toEqual([]);
    expect(result.criticalSkills).toEqual([]);
    expect(result.gaps.criticalSkills).toBe(0);
    expect(result.trainingsByStatus.every((entry) => entry.count === 0)).toBe(
      true,
    );
  });
});

describe('DashboardService.getSkillsEvolution', () => {
  it('restricts the evolution to a skill and to the caller scope', async () => {
    const { service, paramsOf } = build();

    const points = await service.getSkillsEvolution(
      { skillId: 'skill-1', months: 3 },
      manager,
    );

    expect(paramsOf(Q.skillsEvolution)).toEqual(['mgr-employee', 'skill-1', 3]);
    expect(points).toHaveLength(2);
  });

  it('covers all skills when none is given', async () => {
    const { service, paramsOf, dataSource } = build();

    await service.getSkillsEvolution({ months: 12 }, hr);

    expect(paramsOf(Q.skillsEvolution)).toEqual([null, null, 12]);
    expect(dataSource.query).not.toHaveBeenCalledWith(
      Q.skillExists,
      expect.anything(),
    );
  });

  it('answers 404 for an unknown skill, without running the aggregation', async () => {
    const { service, dataSource } = build({ [Q.skillExists]: [] });

    await expect(
      service.getSkillsEvolution({ skillId: 'ghost', months: 12 }, hr),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.query).not.toHaveBeenCalledWith(
      Q.skillsEvolution,
      expect.anything(),
    );
  });
});
