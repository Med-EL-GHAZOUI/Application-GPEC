import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './create-test-app.js';
import { asUser, createSession } from './e2e-helpers.js';

// Requires PostgreSQL (npm run db:up) and a valid backend/.env.
// Company-wide figures are checked as deltas against a baseline taken before
// the fixtures exist; team figures (a manager's direct reports) are absolute.
const suffix = randomUUID().slice(0, 8);
const emailOf = (name: string) => `${name}-${suffix}@e2e.test`;
const NOT_FOUND_ID = '00000000-0000-4000-8000-000000000000';

type Api = ReturnType<typeof asUser>;
type Named = { skill: { name: string } };

/** First day of the month `offset` months from now (UTC), as YYYY-MM-DD. */
const monthStart = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 10);
};
const monthLabel = (offset: number) => monthStart(offset).slice(0, 7);

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: Api;
  let hr: Api;
  let manager: Api;
  let loneManager: Api;
  let employee: Api;

  let baseline: Record<string, any>;
  let skillIds: Record<'angular' | 'docker' | 'sql' | 'comm' | 'kafka', string>;
  let employees: Record<'mgr' | 'e1' | 'e2' | 'e3' | 'e4' | 'e5', string>;

  const nameOf = (key: string) => `${key} ${suffix}`;
  const entry = <T extends Named>(rows: T[], key: string) =>
    rows.find((row) => row.skill.name === nameOf(key));

  const evaluate = (
    employeeId: string,
    skillId: string,
    level: number,
    date: string,
  ) =>
    manager
      .post('/evaluations')
      .send({ employeeId, skillId, level, evaluatedAt: date })
      .expect(201);

  const createSkill = async (
    name: string,
    category: string,
    maxLevel?: number,
  ) =>
    (
      await hr
        .post('/skills')
        .send({ name: nameOf(name), category, maxLevel })
        .expect(201)
    ).body.id as string;

  const createTraining = async (title: string, status: string) =>
    (
      await hr
        .post('/trainings')
        .send({
          title: nameOf(title),
          skillId: skillIds.kafka,
          targetLevel: 2,
          durationHours: 7,
          capacity: 5,
          status,
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    admin = asUser(
      app,
      (await createSession(app, emailOf('admin'), Role.Admin)).token,
    );
    const hrSession = await createSession(app, emailOf('hr'), Role.Hr);
    const managerSession = await createSession(
      app,
      emailOf('manager'),
      Role.Manager,
    );
    employee = asUser(
      app,
      (await createSession(app, emailOf('employee'), Role.Employee)).token,
    );
    loneManager = asUser(
      app,
      (await createSession(app, emailOf('lone'), Role.Manager)).token,
    );
    hr = asUser(app, hrSession.token);
    manager = asUser(app, managerSession.token);

    baseline = (await hr.get('/dashboard?limit=20').expect(200)).body;

    const dept1 = (
      await hr
        .post('/departments')
        .send({ name: nameOf('Dept1') })
        .expect(201)
    ).body.id;
    const dept2 = (
      await hr
        .post('/departments')
        .send({ name: nameOf('Dept2') })
        .expect(201)
    ).body.id;

    skillIds = {
      angular: await createSkill('Angular', 'TECHNICAL'),
      docker: await createSkill('Docker', 'TECHNICAL'),
      sql: await createSkill('SQL', 'TECHNICAL'),
      comm: await createSkill('Communication', 'SOFT', 4),
      kafka: await createSkill('Kafka', 'TECHNICAL'),
    };

    // P1 expects Angular 4, Docker 3, SQL 2. P2 expects Angular 3, Communication 3.
    const p1 = (
      await hr
        .post('/positions')
        .send({
          title: nameOf('Engineer'),
          level: 'SENIOR',
          departmentId: dept1,
        })
        .expect(201)
    ).body.id;
    const p2 = (
      await hr
        .post('/positions')
        .send({
          title: nameOf('Analyst'),
          level: 'JUNIOR',
          departmentId: dept2,
        })
        .expect(201)
    ).body.id;
    for (const [position, skill, level] of [
      [p1, skillIds.angular, 4],
      [p1, skillIds.docker, 3],
      [p1, skillIds.sql, 2],
      [p2, skillIds.angular, 3],
      [p2, skillIds.comm, 3],
    ] as const) {
      await hr
        .post(`/positions/${position}/skills`)
        .send({ skillId: skill, requiredLevel: level })
        .expect(201);
    }

    const create = async (key: string, extra: Record<string, unknown>) =>
      (
        await hr
          .post('/employees')
          .send({
            matricule: `M-${suffix}-${key}`,
            firstName: 'Test',
            lastName: `Last-${key}`,
            email: emailOf(`emp-${key}`),
            hireDate: '2024-01-15',
            ...extra,
          })
          .expect(201)
      ).body.id as string;

    const mgr = await create('mgr', {
      departmentId: dept1,
      userId: managerSession.userId,
    });
    employees = {
      mgr,
      e1: await create('e1', {
        departmentId: dept1,
        positionId: p1,
        managerId: mgr,
      }),
      e2: await create('e2', {
        departmentId: dept1,
        positionId: p1,
        managerId: mgr,
      }),
      e3: await create('e3', {
        departmentId: dept2,
        positionId: p2,
        managerId: mgr,
      }),
      e4: await create('e4', {
        departmentId: dept2,
        positionId: p1,
        status: 'INACTIVE',
      }),
      e5: await create('e5', { departmentId: dept2 }),
    };

    // Final levels. e1: Angular 2, SQL 2 (Docker never assessed). e2: Angular 4, Docker 3, SQL 1.
    // e3: Angular 1, Communication 4.
    const { e1, e2, e3 } = employees;
    await evaluate(e1, skillIds.angular, 1, monthStart(-2));
    await evaluate(e1, skillIds.angular, 2, monthStart(-1));
    await evaluate(e2, skillIds.angular, 3, monthStart(-1));
    await evaluate(e1, skillIds.sql, 2, monthStart(0));
    await evaluate(e2, skillIds.angular, 4, monthStart(0));
    await evaluate(e2, skillIds.docker, 3, monthStart(0));
    await evaluate(e2, skillIds.sql, 1, monthStart(0));
    await evaluate(e3, skillIds.angular, 1, monthStart(0));
    await evaluate(e3, skillIds.comm, 4, monthStart(0));

    // Trainings: 2 OPEN, 1 PLANNED, 1 IN_PROGRESS, 1 COMPLETED. e1 follows one, in progress.
    const open = await createTraining('Open A', 'OPEN');
    await createTraining('Open B', 'OPEN');
    await createTraining('Planned', 'PLANNED');
    await createTraining('Running', 'IN_PROGRESS');
    await createTraining('Done', 'COMPLETED');
    await hr
      .post(`/trainings/${open}/enrollments`)
      .send({ employeeId: e1 })
      .expect(201);
    await hr
      .patch(`/trainings/${open}/enrollments/${e1}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
  });

  afterAll(async () => {
    const like = `%${suffix}%`;
    await dataSource.query('DELETE FROM employees WHERE email LIKE $1', [like]);
    await dataSource.query('DELETE FROM trainings WHERE title LIKE $1', [like]);
    await dataSource.query('DELETE FROM positions WHERE title LIKE $1', [like]);
    await dataSource.query('DELETE FROM skills WHERE name LIKE $1', [like]);
    await dataSource.query('DELETE FROM departments WHERE name LIKE $1', [
      like,
    ]);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [like]);
    await app.close();
  });

  describe('Access', () => {
    it('is reserved to ADMIN, HR and MANAGER', async () => {
      await employee.get('/dashboard').expect(403);
      await employee.get('/dashboard/skills-evolution').expect(403);
      await admin.get('/dashboard').expect(200);
      await hr.get('/dashboard').expect(200);
      await manager.get('/dashboard').expect(200);
    });

    it('requires authentication', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer()).get('/api/dashboard').expect(401);
    });

    it('scopes ADMIN and HR to the company, a MANAGER to their team', async () => {
      expect((await admin.get('/dashboard').expect(200)).body.scope).toBe(
        'COMPANY',
      );
      expect((await hr.get('/dashboard').expect(200)).body.scope).toBe(
        'COMPANY',
      );
      expect((await manager.get('/dashboard').expect(200)).body.scope).toBe(
        'TEAM',
      );
    });

    it('validates the query (400) and the skill (404)', async () => {
      for (const bad of [
        'limit=0',
        'limit=21',
        'limit=abc',
        'months=0',
        'months=37',
        'skillId=nope',
        'foo=1',
      ]) {
        await hr.get(`/dashboard?${bad}`).expect(400);
      }
      await hr.get(`/dashboard?skillId=${NOT_FOUND_ID}`).expect(404);
      await hr
        .get(`/dashboard/skills-evolution?skillId=${NOT_FOUND_ID}`)
        .expect(404);
      await hr.get('/dashboard/skills-evolution?months=0').expect(400);
    });
  });

  describe('Team view of a manager (absolute figures)', () => {
    let body: Record<string, any>;

    beforeAll(async () => {
      body = (await manager.get('/dashboard?limit=20').expect(200)).body;
    });

    it('counts the team, its departments and its positions', () => {
      expect(body.totals).toMatchObject({
        employees: 3,
        activeEmployees: 3,
        departments: 2,
        positions: 2,
        employeesInTraining: 1,
      });
    });

    it('shows the catalogue totals and the trainings in progress', () => {
      expect(body.totals.skills).toBe(baseline.totals.skills + 5);
      expect(body.totals.trainings).toBe(baseline.totals.trainings + 5);
      expect(body.totals.trainingsInProgress).toBe(
        baseline.totals.trainingsInProgress + 1,
      );
    });

    it('splits the team by department, hiding empty ones', () => {
      expect(
        body.employeesByDepartment.map((row: any) => [
          row.department.name,
          row.employees,
        ]),
      ).toEqual([
        [nameOf('Dept1'), 2],
        [nameOf('Dept2'), 1],
      ]);
    });

    it('ranks the most demanded skills by the employees whose position requires them', () => {
      expect(
        body.demandedSkills.map((row: any) => [
          row.skill.name,
          row.employees,
          row.positions,
        ]),
      ).toEqual([
        [nameOf('Angular'), 3, 2],
        [nameOf('Docker'), 2, 1],
        [nameOf('SQL'), 2, 1],
        [nameOf('Communication'), 1, 1],
      ]);
    });

    it('ranks the most deficient skills by total gap, ignoring mastered ones', () => {
      expect(
        body.deficientSkills.map((row: any) => [
          row.skill.name,
          row.employeesRequiring,
          row.employeesToDevelop,
          row.totalGap,
        ]),
      ).toEqual([
        [nameOf('Angular'), 3, 2, 4], // e1 gap 2, e3 gap 2, e2 mastered
        [nameOf('Docker'), 2, 1, 3], // e1 never assessed: gap 3
        [nameOf('SQL'), 2, 1, 1], // e2 gap 1
      ]);
    });

    it('lists the critical skills (a gap of 3 or more)', () => {
      expect(body.criticalSkills).toEqual([
        {
          skill: expect.objectContaining({ name: nameOf('Docker') }),
          employeesInHighPriorityGap: 1,
          largestGap: 3,
        },
      ]);
      expect(body.gaps).toEqual({
        employeesWithGaps: 3,
        employeesWithHighPriorityGap: 1,
        criticalSkills: 1,
      });
    });

    it('lists the employees with the largest gaps first', () => {
      expect(
        body.employeesWithGaps.map((row: any) => [
          row.employee.lastName,
          row.totalGap,
          row.highPriorityGaps,
          row.skillsToDevelop,
        ]),
      ).toEqual([
        ['Last-e1', 5, 1, 2],
        ['Last-e3', 2, 0, 1],
        ['Last-e2', 1, 0, 1],
      ]);
      expect(body.employeesWithGaps[0]).toMatchObject({
        department: nameOf('Dept1'),
        position: nameOf('Engineer'),
      });
    });

    it('returns the trainings by status with every status present', () => {
      expect(body.trainingsByStatus.map((row: any) => row.status)).toEqual([
        'PLANNED',
        'OPEN',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ]);
      const delta = (status: string) =>
        body.trainingsByStatus.find((row: any) => row.status === status).count -
        baseline.trainingsByStatus.find((row: any) => row.status === status)
          .count;
      expect(
        ['PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(delta),
      ).toEqual([1, 2, 1, 1, 0]);
    });

    it('returns 12 months by default, the current one last, with the monthly average level', () => {
      const evolution = body.skillsEvolution;
      expect(evolution).toHaveLength(12);
      expect(evolution.at(-1).month).toBe(monthLabel(0));
      expect(evolution.at(0).month).toBe(monthLabel(-11));
      expect(evolution.slice(0, 9)).toEqual(
        evolution.slice(0, 9).map((row: any) => ({
          month: row.month,
          averageLevel: null,
          evaluations: 0,
        })),
      );
      expect(evolution.slice(-3)).toEqual([
        { month: monthLabel(-2), averageLevel: 1, evaluations: 1 },
        { month: monthLabel(-1), averageLevel: 2.5, evaluations: 2 },
        { month: monthLabel(0), averageLevel: 2.5, evaluations: 6 }, // (2+4+3+1+1+4) / 6
      ]);
    });
  });

  describe('Company view (HR and ADMIN)', () => {
    let body: Record<string, any>;

    beforeAll(async () => {
      body = (await hr.get('/dashboard?limit=20').expect(200)).body;
    });

    it('counts everybody, and only active people as active', () => {
      expect(body.totals.employees).toBe(baseline.totals.employees + 6);
      expect(body.totals.activeEmployees).toBe(
        baseline.totals.activeEmployees + 5,
      ); // e4 is INACTIVE
      expect(body.totals.departments).toBe(baseline.totals.departments + 2);
      expect(body.totals.positions).toBe(baseline.totals.positions + 2);
      expect(body.totals.skills).toBe(baseline.totals.skills + 5);
      expect(body.totals.trainings).toBe(baseline.totals.trainings + 5);
      expect(body.totals.trainingsInProgress).toBe(
        baseline.totals.trainingsInProgress + 1,
      );
      expect(body.totals.employeesInTraining).toBe(
        baseline.totals.employeesInTraining + 1,
      );
    });

    it('shows every department with its headcount, including people outside the team', () => {
      const count = (name: string) =>
        body.employeesByDepartment.find(
          (row: any) => row.department.name === nameOf(name),
        ).employees;
      expect(count('Dept1')).toBe(3); // mgr, e1, e2
      expect(count('Dept2')).toBe(3); // e3, e4 (inactive but still an employee), e5
    });

    it('leaves inactive employees out of the gap analytics', () => {
      // e4 (INACTIVE) has the same position as e1 and e2 but would add a fourth Angular need.
      const angular = entry(body.demandedSkills, 'Angular');
      expect(angular).toMatchObject({ employees: 3, positions: 2 });
      expect(entry(body.deficientSkills, 'Docker')).toMatchObject({
        employeesRequiring: 2,
        totalGap: 3,
      });
    });

    it('reports the same skill figures as the team view for these employees', () => {
      expect(entry(body.deficientSkills, 'Angular')).toMatchObject({
        employeesRequiring: 3,
        employeesToDevelop: 2,
        totalGap: 4,
      });
      expect(entry(body.criticalSkills, 'Docker')).toMatchObject({
        employeesInHighPriorityGap: 1,
      });
    });

    it('counts the employees with gaps on top of the existing ones', () => {
      expect(body.gaps.employeesWithGaps).toBe(
        baseline.gaps.employeesWithGaps + 3,
      );
      expect(body.gaps.employeesWithHighPriorityGap).toBe(
        baseline.gaps.employeesWithHighPriorityGap + 1,
      );
      expect(body.gaps.criticalSkills).toBe(baseline.gaps.criticalSkills + 1);
    });

    it('lists our employees with the same figures', () => {
      const row = (lastName: string) =>
        body.employeesWithGaps.find(
          (item: any) => item.employee.lastName === lastName,
        );
      expect(row('Last-e1')).toMatchObject({
        totalGap: 5,
        highPriorityGaps: 1,
        skillsToDevelop: 2,
      });
      expect(row('Last-e3')).toMatchObject({
        totalGap: 2,
        highPriorityGaps: 0,
      });
      expect(row('Last-e4')).toBeUndefined();
    });

    it('lets ADMIN see the same company view', async () => {
      const adminBody = (await admin.get('/dashboard?limit=20').expect(200))
        .body;
      expect(adminBody.totals.employees).toBe(body.totals.employees);
    });
  });

  describe('Consistency with the gap analysis', () => {
    it('matches /employees/:id/gaps for every employee (same rule, in SQL and in code)', async () => {
      const { body } = await manager.get('/dashboard?limit=20').expect(200);

      for (const key of ['e1', 'e2', 'e3'] as const) {
        const gaps = (
          await hr.get(`/employees/${employees[key]}/gaps`).expect(200)
        ).body;
        const row = body.employeesWithGaps.find(
          (item: any) => item.employee.id === employees[key],
        );

        expect(row.totalGap).toBe(gaps.summary.totalGap);
        expect(row.skillsToDevelop).toBe(gaps.summary.toDevelop);
        expect(row.highPriorityGaps).toBe(
          gaps.gaps.filter(
            (item: { priority: string }) => item.priority === 'HIGH',
          ).length,
        );
      }
    });
  });

  describe('Skills evolution', () => {
    it('restricts the evolution to one skill, over the requested months', async () => {
      const { body } = await manager
        .get(`/dashboard/skills-evolution?skillId=${skillIds.angular}&months=3`)
        .expect(200);

      expect(body).toEqual([
        { month: monthLabel(-2), averageLevel: 1, evaluations: 1 },
        { month: monthLabel(-1), averageLevel: 2.5, evaluations: 2 },
        { month: monthLabel(0), averageLevel: 2.5, evaluations: 2 }, // e2 level 4 and e3 level 1
      ]);
    });

    it('returns one entry per month, empty ones included', async () => {
      const { body } = await manager
        .get('/dashboard/skills-evolution?months=6')
        .expect(200);

      expect(body).toHaveLength(6);
      expect(
        body
          .slice(0, 3)
          .every(
            (row: any) => row.averageLevel === null && row.evaluations === 0,
          ),
      ).toBe(true);
    });

    it('does not leak the assessments of other teams to a manager', async () => {
      // e4 is not in the manager team: assessing them must not move the team curve.
      await hr
        .post('/evaluations')
        .send({
          employeeId: employees.e4,
          skillId: skillIds.angular,
          level: 5,
          evaluatedAt: monthStart(0),
        })
        .expect(201);

      const team = (
        await manager
          .get(
            `/dashboard/skills-evolution?skillId=${skillIds.angular}&months=1`,
          )
          .expect(200)
      ).body;
      const company = (
        await hr
          .get(
            `/dashboard/skills-evolution?skillId=${skillIds.angular}&months=1`,
          )
          .expect(200)
      ).body;

      expect(team[0]).toMatchObject({ averageLevel: 2.5, evaluations: 2 });
      // The company curve also counts e4: levels 4, 1 and 5 this month.
      expect(company[0]).toMatchObject({ averageLevel: 3.33, evaluations: 3 });
    });
  });

  describe('Manager without employee record', () => {
    it('sees an empty team, but still the catalogue', async () => {
      const { body } = await loneManager.get('/dashboard?limit=20').expect(200);

      expect(body.scope).toBe('TEAM');
      expect(body.totals).toMatchObject({
        employees: 0,
        departments: 0,
        positions: 0,
        employeesInTraining: 0,
      });
      expect(body.totals.skills).toBe(baseline.totals.skills + 5);
      expect(body.employeesByDepartment).toEqual([]);
      expect(body.demandedSkills).toEqual([]);
      expect(body.employeesWithGaps).toEqual([]);
      expect(body.gaps).toEqual({
        employeesWithGaps: 0,
        employeesWithHighPriorityGap: 0,
        criticalSkills: 0,
      });
      expect(
        body.skillsEvolution.every((row: any) => row.evaluations === 0),
      ).toBe(true);
    });
  });

  describe('Freshness', () => {
    it('reflects a new assessment immediately and respects the limit', async () => {
      await evaluate(employees.e1, skillIds.docker, 3, monthStart(0)); // closes e1's only high-priority gap

      const { body } = await manager.get('/dashboard?limit=1').expect(200);

      expect(body.gaps).toEqual({
        employeesWithGaps: 3,
        employeesWithHighPriorityGap: 0,
        criticalSkills: 0,
      });
      expect(body.criticalSkills).toEqual([]);
      expect(body.deficientSkills).toHaveLength(1);
      expect(body.employeesWithGaps).toHaveLength(1);
      expect(body.employeesWithGaps[0]).toMatchObject({ totalGap: 2 }); // e1 now has Angular only
    });

    it('drops an employee from the gap analytics once they are made inactive', async () => {
      await hr
        .patch(`/employees/${employees.e3}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const { body } = await manager.get('/dashboard?limit=20').expect(200);

      expect(body.totals).toMatchObject({ employees: 3, activeEmployees: 2 });
      expect(body.gaps.employeesWithGaps).toBe(2);
      expect(entry(body.demandedSkills, 'Communication')).toBeUndefined();
    });

    it('stops counting an employee who is deleted', async () => {
      await hr.delete(`/employees/${employees.e2}`).expect(204);

      const { body } = await manager.get('/dashboard?limit=20').expect(200);

      expect(body.totals.employees).toBe(2);
      expect(body.gaps.employeesWithGaps).toBe(1);
    });
  });
});
