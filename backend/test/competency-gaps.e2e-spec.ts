import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './create-test-app.js';
import { asUser, createSession } from './e2e-helpers.js';

// Requires PostgreSQL (npm run db:up) and a valid backend/.env
const suffix = randomUUID().slice(0, 8);
const emailOf = (name: string) => `${name}-${suffix}@e2e.test`;
const NOT_FOUND_ID = '00000000-0000-4000-8000-000000000000';

type GapRow = {
  skill: { name: string };
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  status: string;
  priority: string;
  evaluatedAt: string | null;
};

describe('Competency gaps (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: ReturnType<typeof asUser>;
  let hr: ReturnType<typeof asUser>;
  let manager: ReturnType<typeof asUser>;
  let employee: ReturnType<typeof asUser>;

  let departmentId: string;
  let positionId: string;
  let emptyPositionId: string;
  let skills: Record<'angular' | 'docker' | 'sql' | 'communication', string>;
  let managerEmployeeId: string;
  let reportId: string;
  let outsiderId: string;
  let noPositionId: string;

  const gapsOf = (id: string) => `/employees/${id}/gaps`;
  const byName = (rows: GapRow[], name: string) =>
    rows.find((row) => row.skill.name === `${name} ${suffix}`);

  const createEmployee = async (
    key: string,
    extra: Record<string, unknown> = {},
  ) => {
    const { body } = await hr
      .post('/employees')
      .send({
        matricule: `M-${suffix}-${key}`,
        firstName: 'Test',
        lastName: `Last-${key}`,
        email: emailOf(`emp-${key}`),
        hireDate: '2024-01-15',
        departmentId,
        ...extra,
      })
      .expect(201);
    return body.id as string;
  };

  const createSkill = async (
    name: string,
    category: string,
    maxLevel?: number,
  ) =>
    (
      await hr
        .post('/skills')
        .send({ name: `${name} ${suffix}`, category, maxLevel })
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
    const employeeSession = await createSession(
      app,
      emailOf('employee'),
      Role.Employee,
    );
    hr = asUser(app, hrSession.token);
    manager = asUser(app, managerSession.token);
    employee = asUser(app, employeeSession.token);

    departmentId = (
      await hr
        .post('/departments')
        .send({ name: `Dept ${suffix}` })
        .expect(201)
    ).body.id;
    skills = {
      angular: await createSkill('Angular', 'TECHNICAL'),
      docker: await createSkill('Docker', 'TECHNICAL'),
      sql: await createSkill('SQL', 'TECHNICAL'),
      communication: await createSkill('Communication', 'SOFT', 4),
    };

    positionId = (
      await hr
        .post('/positions')
        .send({ title: `Engineer ${suffix}`, level: 'SENIOR', departmentId })
        .expect(201)
    ).body.id;
    emptyPositionId = (
      await hr
        .post('/positions')
        .send({ title: `Observer ${suffix}`, level: 'JUNIOR', departmentId })
        .expect(201)
    ).body.id;

    // The position expects: Angular 4, Docker 3, SQL 2, Communication 3
    for (const [skill, level] of [
      [skills.angular, 4],
      [skills.docker, 3],
      [skills.sql, 2],
      [skills.communication, 3],
    ] as const) {
      await hr
        .post(`/positions/${positionId}/skills`)
        .send({ skillId: skill, requiredLevel: level })
        .expect(201);
    }

    managerEmployeeId = await createEmployee('mgr', {
      userId: managerSession.userId,
    });
    reportId = await createEmployee('report', {
      managerId: managerEmployeeId,
      userId: employeeSession.userId,
      positionId,
    });
    outsiderId = await createEmployee('out', { positionId });
    noPositionId = await createEmployee('nopos');

    // The report holds: Angular 2, SQL 2, Communication 4 (Docker never assessed)
    await manager
      .put(`/employees/${reportId}/skills/${skills.angular}`)
      .send({ level: 2, evaluatedAt: '2026-01-10' })
      .expect(200);
    await manager
      .put(`/employees/${reportId}/skills/${skills.sql}`)
      .send({ level: 2, evaluatedAt: '2026-01-10' })
      .expect(200);
    await manager
      .put(`/employees/${reportId}/skills/${skills.communication}`)
      .send({ level: 4, evaluatedAt: '2026-01-10' })
      .expect(200);
  });

  afterAll(async () => {
    const like = `%${suffix}%`;
    await dataSource.query('DELETE FROM employees WHERE email LIKE $1', [like]);
    await dataSource.query('DELETE FROM positions WHERE title LIKE $1', [like]);
    await dataSource.query('DELETE FROM skills WHERE name LIKE $1', [like]);
    await dataSource.query('DELETE FROM departments WHERE name LIKE $1', [
      like,
    ]);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [like]);
    await app.close();
  });

  describe('Computation', () => {
    it('compares each required skill with the current level, largest gap first', async () => {
      const { body } = await hr.get(gapsOf(reportId)).expect(200);

      expect(body.employee).toMatchObject({
        id: reportId,
        lastName: 'Last-report',
      });
      expect(body.position.title).toBe(`Engineer ${suffix}`);
      expect(body.gaps.map((row: GapRow) => row.skill.name)).toEqual([
        `Docker ${suffix}`,
        `Angular ${suffix}`,
        `SQL ${suffix}`,
        `Communication ${suffix}`,
      ]);
    });

    it('reproduces the specification example: Angular required 4, current 2, gap 2', async () => {
      const { body } = await hr.get(gapsOf(reportId)).expect(200);
      expect(byName(body.gaps, 'Angular')).toMatchObject({
        currentLevel: 2,
        requiredLevel: 4,
        gap: 2,
        status: 'TO_DEVELOP',
        priority: 'MEDIUM',
        evaluatedAt: '2026-01-10',
      });
    });

    it('counts a skill that was never assessed as level 0, and says so', async () => {
      const { body } = await hr.get(gapsOf(reportId)).expect(200);
      expect(byName(body.gaps, 'Docker')).toMatchObject({
        currentLevel: 0,
        requiredLevel: 3,
        gap: 3,
        status: 'TO_DEVELOP',
        priority: 'HIGH',
        evaluatedAt: null,
      });
    });

    it('classifies mastered and above-requirement skills without priority', async () => {
      const { body } = await hr.get(gapsOf(reportId)).expect(200);
      expect(byName(body.gaps, 'SQL')).toMatchObject({
        gap: 0,
        status: 'MASTERED',
        priority: 'NONE',
      });
      expect(byName(body.gaps, 'Communication')).toMatchObject({
        gap: -1,
        status: 'ABOVE_REQUIREMENT',
        priority: 'NONE',
      });
    });

    it('summarises the analysis', async () => {
      const { body } = await hr.get(gapsOf(reportId)).expect(200);
      expect(body.summary).toEqual({
        requiredSkills: 4,
        toDevelop: 2,
        mastered: 1,
        aboveRequirement: 1,
        totalGap: 5,
      });
    });

    it('reflects a new evaluation immediately (gaps are computed, never stored)', async () => {
      await manager
        .post('/evaluations')
        .send({
          employeeId: reportId,
          skillId: skills.angular,
          level: 4,
          evaluatedAt: '2026-02-20',
        })
        .expect(201);

      const { body } = await hr.get(gapsOf(reportId)).expect(200);
      expect(byName(body.gaps, 'Angular')).toMatchObject({
        currentLevel: 4,
        gap: 0,
        status: 'MASTERED',
        priority: 'NONE',
        evaluatedAt: '2026-02-20',
      });
      expect(body.summary).toMatchObject({
        toDevelop: 1,
        mastered: 2,
        totalGap: 3,
      });
    });

    it('reflects a change of required level', async () => {
      await hr
        .patch(`/positions/${positionId}/skills/${skills.angular}`)
        .send({ requiredLevel: 5 })
        .expect(200);

      const { body } = await hr.get(gapsOf(reportId)).expect(200);
      expect(byName(body.gaps, 'Angular')).toMatchObject({
        requiredLevel: 5,
        gap: 1,
        priority: 'LOW',
      });
    });

    it('ignores skills the employee holds beyond the position needs', async () => {
      const { body } = await hr.get(gapsOf(outsiderId)).expect(200);
      // The outsider holds nothing yet: every required skill is a gap at level 0.
      expect(body.gaps).toHaveLength(4);
      expect(
        body.gaps.every(
          (row: GapRow) => row.currentLevel === 0 && row.evaluatedAt === null,
        ),
      ).toBe(true);

      await hr
        .put(`/employees/${outsiderId}/skills/${skills.angular}`)
        .send({ level: 1 })
        .expect(200);
      const extra = await createSkill('Kubernetes', 'TECHNICAL');
      await hr
        .put(`/employees/${outsiderId}/skills/${extra}`)
        .send({ level: 5 })
        .expect(200);

      const after = await hr.get(gapsOf(outsiderId)).expect(200);
      expect(after.body.gaps).toHaveLength(4);
      expect(byName(after.body.gaps, 'Angular')?.currentLevel).toBe(1);
    });

    it('returns an empty analysis for a position without required skills', async () => {
      await hr
        .patch(`/employees/${outsiderId}`)
        .send({ positionId: emptyPositionId })
        .expect(200);

      const { body } = await hr.get(gapsOf(outsiderId)).expect(200);
      expect(body.gaps).toEqual([]);
      expect(body.summary).toEqual({
        requiredSkills: 0,
        toDevelop: 0,
        mastered: 0,
        aboveRequirement: 0,
        totalGap: 0,
      });
    });
  });

  describe('Errors', () => {
    it('answers 409 for an employee without position', async () => {
      await hr.get(gapsOf(noPositionId)).expect(409);
    });

    it('answers 404 for an unknown employee and 400 for a malformed id', async () => {
      await hr.get(gapsOf(NOT_FOUND_ID)).expect(404);
      await hr.get('/employees/not-a-uuid/gaps').expect(400);
    });

    it('requires authentication', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer())
        .get(`/api${gapsOf(reportId)}`)
        .expect(401);
    });

    it('answers 404 for a soft-deleted employee', async () => {
      const id = await createEmployee('gone', { positionId });
      await hr.get(gapsOf(id)).expect(200);
      await hr.delete(`/employees/${id}`).expect(204);
      await hr.get(gapsOf(id)).expect(404);
    });
  });

  describe('Access scope', () => {
    it('lets an EMPLOYEE read their own gaps only', async () => {
      await employee.get(gapsOf(reportId)).expect(200);
      await employee.get(gapsOf(outsiderId)).expect(403);
      await employee.get(gapsOf(managerEmployeeId)).expect(403);
    });

    it('lets a MANAGER read their direct reports only', async () => {
      await manager.get(gapsOf(reportId)).expect(200);
      await manager.get(gapsOf(outsiderId)).expect(403);
    });

    it('lets HR and ADMIN read any employee', async () => {
      await hr.get(gapsOf(outsiderId)).expect(200);
      await admin.get(gapsOf(reportId)).expect(200);
    });

    it('does not reveal whether an out-of-scope employee exists', async () => {
      await employee.get(gapsOf(NOT_FOUND_ID)).expect(403);
      await manager.get(gapsOf(NOT_FOUND_ID)).expect(403);
    });
  });
});
