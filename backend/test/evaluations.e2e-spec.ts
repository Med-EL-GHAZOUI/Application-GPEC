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

describe('Evaluations and history (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: ReturnType<typeof asUser>;
  let hr: ReturnType<typeof asUser>;
  let manager: ReturnType<typeof asUser>;
  let employee: ReturnType<typeof asUser>;

  let departmentId: string;
  let skillId: string; // max level 5
  let narrowSkillId: string; // max level 4
  let managerEmployeeId: string;
  let reportId: string;
  let outsiderId: string;

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

  const evaluate = (
    caller: ReturnType<typeof asUser>,
    body: Record<string, unknown>,
  ) => caller.post('/evaluations').send(body);

  const historyCount = async (employeeId: string, forSkillId?: string) => {
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS count FROM skill_evaluations
       WHERE employee_id = $1 AND ($2::uuid IS NULL OR skill_id = $2)`,
      [employeeId, forSkillId ?? null],
    );
    return row.count as number;
  };

  const currentLevel = async (employeeId: string, forSkillId = skillId) => {
    const { body } = await hr
      .get(`/employees/${employeeId}/skills`)
      .expect(200);
    return body.find(
      (row: { skill: { id: string } }) => row.skill.id === forSkillId,
    );
  };

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
    skillId = (
      await hr
        .post('/skills')
        .send({ name: `Angular ${suffix}`, category: 'TECHNICAL' })
        .expect(201)
    ).body.id;
    narrowSkillId = (
      await hr
        .post('/skills')
        .send({ name: `Teamwork ${suffix}`, category: 'SOFT', maxLevel: 4 })
        .expect(201)
    ).body.id;

    managerEmployeeId = await createEmployee('mgr', {
      userId: managerSession.userId,
    });
    reportId = await createEmployee('report', {
      managerId: managerEmployeeId,
      userId: employeeSession.userId,
    });
    outsiderId = await createEmployee('out');
  });

  afterAll(async () => {
    const like = `%${suffix}%`;
    // evaluations and employee_skills go with their employee (ON DELETE CASCADE)
    await dataSource.query('DELETE FROM employees WHERE email LIKE $1', [like]);
    await dataSource.query('DELETE FROM skills WHERE name LIKE $1', [like]);
    await dataSource.query('DELETE FROM departments WHERE name LIKE $1', [
      like,
    ]);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [like]);
    await app.close();
  });

  describe('Recording evaluations', () => {
    it('lets a MANAGER evaluate a direct report and returns the stored assessment', async () => {
      const { body } = await evaluate(manager, {
        employeeId: reportId,
        skillId,
        level: 3,
        evaluatedAt: '2025-01-15',
        comment: '  First review  ',
      }).expect(201);

      expect(body).toMatchObject({
        employeeId: reportId,
        level: 3,
        evaluatedAt: '2025-01-15',
        comment: 'First review',
        skill: { id: skillId },
        evaluator: { id: managerEmployeeId },
      });
      expect(body.id).toEqual(expect.any(String));
      expect(await currentLevel(reportId)).toMatchObject({
        level: 3,
        evaluatedAt: '2025-01-15',
      });
    });

    it('keeps both assessments and moves the current level forward (3 then 4)', async () => {
      await evaluate(manager, {
        employeeId: reportId,
        skillId,
        level: 4,
        evaluatedAt: '2026-01-15',
        comment: 'Progress',
      }).expect(201);

      expect(await historyCount(reportId, skillId)).toBe(2);
      expect(await currentLevel(reportId)).toMatchObject({
        level: 4,
        evaluatedAt: '2026-01-15',
      });
    });

    it('records a back-dated assessment in the history without lowering the current level', async () => {
      await evaluate(hr, {
        employeeId: reportId,
        skillId,
        level: 2,
        evaluatedAt: '2024-06-01',
      }).expect(201);

      expect(await historyCount(reportId, skillId)).toBe(3);
      expect(await currentLevel(reportId)).toMatchObject({
        level: 4,
        evaluatedAt: '2026-01-15',
      });
    });

    it('lets the latest recorded assessment win on the same day', async () => {
      await evaluate(hr, {
        employeeId: reportId,
        skillId,
        level: 5,
        evaluatedAt: '2026-01-15',
      }).expect(201);

      expect(await historyCount(reportId, skillId)).toBe(4);
      expect(await currentLevel(reportId)).toMatchObject({ level: 5 });
    });

    it('defaults the date to today and leaves the evaluator null for an HR account without employee record', async () => {
      const { body } = await evaluate(hr, {
        employeeId: outsiderId,
        skillId,
        level: 2,
      }).expect(201);
      expect(body.evaluatedAt).toBe(new Date().toISOString().slice(0, 10));
      expect(body.evaluator).toBeNull();
    });

    it('also records history when the level is set through PUT /employees/:id/skills', async () => {
      await manager
        .put(`/employees/${reportId}/skills/${narrowSkillId}`)
        .send({ level: 3, evaluatedAt: '2026-02-01', comment: 'via PUT' })
        .expect(200);

      expect(await historyCount(reportId, narrowSkillId)).toBe(1);
      expect(await currentLevel(reportId, narrowSkillId)).toMatchObject({
        level: 3,
      });
    });

    it('survives concurrent assessments: every one is kept, a single current row remains', async () => {
      const before = await historyCount(outsiderId, narrowSkillId);
      const responses = await Promise.all(
        [1, 2, 3, 4, 2].map((level) =>
          evaluate(hr, {
            employeeId: outsiderId,
            skillId: narrowSkillId,
            level,
            evaluatedAt: '2026-03-01',
          }),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      expect((await historyCount(outsiderId, narrowSkillId)) - before).toBe(5);
      const [row] = await dataSource.query(
        'SELECT count(*)::int AS count FROM employee_skills WHERE employee_id = $1 AND skill_id = $2',
        [outsiderId, narrowSkillId],
      );
      expect(row.count).toBe(1);
    });
  });

  describe('Rules and permissions', () => {
    it('refuses a MANAGER outside their team and any self-assessment (403)', async () => {
      await evaluate(manager, {
        employeeId: outsiderId,
        skillId,
        level: 2,
      }).expect(403);
      await evaluate(manager, {
        employeeId: managerEmployeeId,
        skillId,
        level: 2,
      }).expect(403);
    });

    it('refuses EMPLOYEE and ADMIN (403)', async () => {
      await evaluate(employee, {
        employeeId: reportId,
        skillId,
        level: 5,
      }).expect(403);
      await evaluate(admin, { employeeId: reportId, skillId, level: 5 }).expect(
        403,
      );
    });

    it('requires authentication (401)', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer())
        .post('/api/evaluations')
        .send({ employeeId: reportId, skillId, level: 2 })
        .expect(401);
    });

    it('rejects invalid input without writing anything (400)', async () => {
      const before = await historyCount(reportId);
      const tomorrow = new Date(Date.now() + 2 * 24 * 3_600_000)
        .toISOString()
        .slice(0, 10);

      await evaluate(hr, {
        employeeId: reportId,
        skillId: narrowSkillId,
        level: 5,
      }).expect(400); // max 4
      await evaluate(hr, { employeeId: reportId, skillId, level: 0 }).expect(
        400,
      );
      await evaluate(hr, {
        employeeId: reportId,
        skillId,
        level: 2,
        evaluatedAt: tomorrow,
      }).expect(400);
      await evaluate(hr, {
        employeeId: reportId,
        skillId,
        level: 2,
        evaluatedAt: '2025-02-30',
      }).expect(400);
      await evaluate(hr, { employeeId: reportId, level: 2 }).expect(400);
      await evaluate(hr, { employeeId: 'nope', skillId, level: 2 }).expect(400);
      await evaluate(hr, {
        employeeId: reportId,
        skillId,
        level: 2,
        evaluatorId: reportId,
      }).expect(400);

      expect(await historyCount(reportId)).toBe(before);
    });

    it('answers 404 for an unknown employee or skill', async () => {
      await evaluate(hr, {
        employeeId: NOT_FOUND_ID,
        skillId,
        level: 2,
      }).expect(404);
      await evaluate(hr, {
        employeeId: reportId,
        skillId: NOT_FOUND_ID,
        level: 2,
      }).expect(404);
    });

    it('offers no way to modify or delete an evaluation', async () => {
      const [{ id }] = await dataSource.query(
        'SELECT id FROM skill_evaluations WHERE employee_id = $1 LIMIT 1',
        [reportId],
      );
      await hr.patch(`/evaluations/${id}`).send({ level: 1 }).expect(404);
      await hr.put(`/evaluations/${id}`).send({ level: 1 }).expect(404);
      await hr.delete(`/evaluations/${id}`).expect(404);
    });
  });

  describe('History and evolution', () => {
    it('lists the history newest first with the pagination envelope', async () => {
      const first = await hr
        .get(
          `/employees/${reportId}/evaluations?skillId=${skillId}&limit=2&page=1`,
        )
        .expect(200);
      expect(first.body).toMatchObject({ total: 4, page: 1, limit: 2 });
      expect(
        first.body.data.map((row: { level: number }) => row.level),
      ).toEqual([5, 4]);

      const second = await hr
        .get(
          `/employees/${reportId}/evaluations?skillId=${skillId}&limit=2&page=2`,
        )
        .expect(200);
      expect(
        second.body.data.map((row: { level: number }) => row.level),
      ).toEqual([3, 2]);
    });

    it('filters by skill and searches the comment', async () => {
      const bySkill = await hr
        .get(`/employees/${reportId}/evaluations?skillId=${narrowSkillId}`)
        .expect(200);
      expect(bySkill.body.total).toBe(1);

      const byComment = await hr
        .get(`/employees/${reportId}/evaluations?search=progress`)
        .expect(200);
      expect(byComment.body.total).toBe(1);
      expect(byComment.body.data[0].level).toBe(4);

      const literal = await hr
        .get(`/employees/${reportId}/evaluations?search=%25`)
        .expect(200);
      expect(literal.body.total).toBe(0);
    });

    it('returns the progression oldest first', async () => {
      const { body } = await hr
        .get(`/employees/${reportId}/skills/${skillId}/evolution`)
        .expect(200);

      expect(body.map((point: { level: number }) => point.level)).toEqual([
        2, 3, 4, 5,
      ]);
      expect(
        body.map((point: { evaluatedAt: string }) => point.evaluatedAt),
      ).toEqual(['2024-06-01', '2025-01-15', '2026-01-15', '2026-01-15']);
      expect(body[1].evaluator).toMatchObject({ id: managerEmployeeId });
      expect(body[0]).not.toHaveProperty('id');
    });

    it('returns an empty progression for a skill never assessed', async () => {
      const { body } = await hr
        .get(`/employees/${managerEmployeeId}/skills/${skillId}/evolution`)
        .expect(200);
      expect(body).toEqual([]);
    });

    it('applies the access scope to history and evolution', async () => {
      await employee.get(`/employees/${reportId}/evaluations`).expect(200);
      await employee
        .get(`/employees/${reportId}/skills/${skillId}/evolution`)
        .expect(200);
      await employee.get(`/employees/${outsiderId}/evaluations`).expect(403);
      await employee
        .get(`/employees/${managerEmployeeId}/skills/${skillId}/evolution`)
        .expect(403);

      await manager.get(`/employees/${reportId}/evaluations`).expect(200);
      await manager.get(`/employees/${outsiderId}/evaluations`).expect(403);

      await employee.get(`/employees/${NOT_FOUND_ID}/evaluations`).expect(403);
      await hr.get(`/employees/${NOT_FOUND_ID}/evaluations`).expect(404);
      await hr
        .get(`/employees/${reportId}/skills/${NOT_FOUND_ID}/evolution`)
        .expect(404);
    });

    it('rejects invalid filters and malformed ids (400)', async () => {
      await hr
        .get(`/employees/${reportId}/evaluations?skillId=nope`)
        .expect(400);
      await hr.get(`/employees/${reportId}/evaluations?limit=1000`).expect(400);
      await hr.get('/employees/not-a-uuid/evaluations').expect(400);
    });
  });

  describe('Consistency with other modules', () => {
    it('keeps the history after the skill link is removed, and then blocks deleting the skill (409)', async () => {
      await hr.delete(`/employees/${reportId}/skills/${skillId}`).expect(204);

      expect(await historyCount(reportId, skillId)).toBe(4);
      await hr.delete(`/skills/${skillId}`).expect(409);
    });

    it('hides the history of a soft-deleted employee but keeps the rows', async () => {
      const total = await historyCount(outsiderId);
      expect(total).toBeGreaterThan(0);

      await hr.delete(`/employees/${outsiderId}`).expect(204);

      await hr.get(`/employees/${outsiderId}/evaluations`).expect(404);
      expect(await historyCount(outsiderId)).toBe(total);
    });
  });
});
