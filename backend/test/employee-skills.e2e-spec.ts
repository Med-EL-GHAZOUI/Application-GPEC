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
const today = () => new Date().toISOString().slice(0, 10);

describe('Employee skills (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: ReturnType<typeof asUser>;
  let hr: ReturnType<typeof asUser>;
  let manager: ReturnType<typeof asUser>;
  let employee: ReturnType<typeof asUser>;

  let skillId: string;
  let otherSkillId: string;
  let managerEmployeeId: string;
  let reportId: string;
  let outsiderId: string;

  const skillUrl = (employeeId: string, id = skillId) =>
    `/employees/${employeeId}/skills/${id}`;

  const createEmployee = async (
    key: string,
    extra: Record<string, unknown> = {},
  ) => {
    const departmentId = (
      await dataSource.query('SELECT id FROM departments WHERE name = $1', [
        `Dept ${suffix}`,
      ])
    )[0].id;
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

    await hr
      .post('/departments')
      .send({ name: `Dept ${suffix}` })
      .expect(201);
    skillId = (
      await hr
        .post('/skills')
        .send({ name: `Angular ${suffix}`, category: 'TECHNICAL' })
        .expect(201)
    ).body.id;
    otherSkillId = (
      await hr
        .post('/skills')
        .send({
          name: `Communication ${suffix}`,
          category: 'SOFT',
          maxLevel: 4,
        })
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
    // employee_skills rows go with their employee (ON DELETE CASCADE)
    await dataSource.query('DELETE FROM employees WHERE email LIKE $1', [like]);
    await dataSource.query('DELETE FROM skills WHERE name LIKE $1', [like]);
    await dataSource.query('DELETE FROM departments WHERE name LIKE $1', [
      like,
    ]);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [like]);
    await app.close();
  });

  describe('Setting a level', () => {
    it('lets a MANAGER assess a direct report and records them as evaluator', async () => {
      const { body } = await manager
        .put(skillUrl(reportId))
        .send({ level: 3, comment: '  Good on components  ' })
        .expect(200);

      expect(body).toMatchObject({
        level: 3,
        evaluatedAt: today(),
        comment: 'Good on components',
        skill: { id: skillId, maxLevel: 5 },
        evaluator: { id: managerEmployeeId, lastName: 'Last-mgr' },
      });
    });

    it('replaces the level instead of duplicating the link', async () => {
      await manager
        .put(skillUrl(reportId))
        .send({ level: 4 }) // same day as the first assessment: the latest one wins
        .expect(200);

      const { body } = await hr
        .get(`/employees/${reportId}/skills`)
        .expect(200);
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        level: 4,
        evaluatedAt: today(),
        comment: null,
      });
    });

    it('lets HR assess anyone; an HR account without employee record has no evaluator', async () => {
      const { body } = await hr
        .put(skillUrl(outsiderId))
        .send({ level: 2 })
        .expect(200);
      expect(body.evaluator).toBeNull();
    });

    it('refuses a MANAGER outside their team and any self-assessment (403)', async () => {
      await manager.put(skillUrl(outsiderId)).send({ level: 2 }).expect(403);
      await manager
        .put(skillUrl(managerEmployeeId))
        .send({ level: 2 })
        .expect(403);
    });

    it('refuses EMPLOYEE and ADMIN: assessing is an HR/manager act (403)', async () => {
      await employee.put(skillUrl(reportId)).send({ level: 5 }).expect(403);
      await admin.put(skillUrl(reportId)).send({ level: 5 }).expect(403);
    });

    it('rejects levels beyond the skill maximum or the global scale (400)', async () => {
      await hr
        .put(skillUrl(reportId, otherSkillId))
        .send({ level: 5 })
        .expect(400); // max 4
      await hr.put(skillUrl(reportId)).send({ level: 0 }).expect(400);
      await hr.put(skillUrl(reportId)).send({ level: 11 }).expect(400);
      await hr.put(skillUrl(reportId)).send({ level: 2.5 }).expect(400);
    });

    it('rejects an invalid or future date, and unknown body fields (400)', async () => {
      const tomorrow = new Date(Date.now() + 2 * 24 * 3_600_000)
        .toISOString()
        .slice(0, 10);
      await hr
        .put(skillUrl(reportId))
        .send({ level: 2, evaluatedAt: tomorrow })
        .expect(400);
      await hr
        .put(skillUrl(reportId))
        .send({ level: 2, evaluatedAt: '2025-02-30' })
        .expect(400);
      await hr
        .put(skillUrl(reportId))
        .send({ level: 2, evaluatedAt: '01/02/2025' })
        .expect(400);
      await hr
        .put(skillUrl(reportId))
        .send({ level: 2, evaluatorId: NOT_FOUND_ID })
        .expect(400);
    });

    it('answers 404 for an unknown employee or skill, 400 for a malformed id', async () => {
      await hr.put(skillUrl(NOT_FOUND_ID)).send({ level: 2 }).expect(404);
      await hr
        .put(skillUrl(reportId, NOT_FOUND_ID))
        .send({ level: 2 })
        .expect(404);
      await hr
        .put(`/employees/${reportId}/skills/not-a-uuid`)
        .send({ level: 2 })
        .expect(400);
    });
  });

  describe('Reading levels (scope)', () => {
    it('lets an EMPLOYEE read their own skills only', async () => {
      const { body } = await employee
        .get(`/employees/${reportId}/skills`)
        .expect(200);
      expect(body).toHaveLength(1);
      await employee.get(`/employees/${outsiderId}/skills`).expect(403);
      await employee.get(`/employees/${managerEmployeeId}/skills`).expect(403);
    });

    it('lets a MANAGER read direct reports only', async () => {
      await manager.get(`/employees/${reportId}/skills`).expect(200);
      await manager.get(`/employees/${outsiderId}/skills`).expect(403);
    });

    it('does not reveal whether an out-of-scope employee exists', async () => {
      await employee.get(`/employees/${NOT_FOUND_ID}/skills`).expect(403);
      await hr.get(`/employees/${NOT_FOUND_ID}/skills`).expect(404);
    });

    it('requires authentication', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer())
        .get(`/api/employees/${reportId}/skills`)
        .expect(401);
    });
  });

  describe('Consistency with the skill catalogue', () => {
    it('stops a skill maximum from dropping below a level an employee holds (409)', async () => {
      await hr.patch(`/skills/${skillId}`).send({ maxLevel: 3 }).expect(409); // report holds 4
      await hr.patch(`/skills/${skillId}`).send({ maxLevel: 4 }).expect(200);
    });

    it('refuses to delete a skill held by an employee (409)', async () => {
      await hr.delete(`/skills/${skillId}`).expect(409);
    });
  });

  describe('Removing a skill from an employee', () => {
    it('forbids a MANAGER (403)', async () => {
      await manager.delete(skillUrl(reportId)).expect(403);
    });

    it('lets HR and ADMIN remove it, then answers 404', async () => {
      await hr.delete(skillUrl(reportId)).expect(204);
      await hr.delete(skillUrl(reportId)).expect(404);
      await hr
        .put(skillUrl(outsiderId, otherSkillId))
        .send({ level: 1 })
        .expect(200);
      await admin.delete(skillUrl(outsiderId, otherSkillId)).expect(204);
    });

    it('keeps the skill rows of a soft-deleted employee out of reach', async () => {
      await hr.put(skillUrl(outsiderId)).send({ level: 2 }).expect(200);
      await hr.delete(`/employees/${outsiderId}`).expect(204);
      await hr.get(`/employees/${outsiderId}/skills`).expect(404);
      const [row] = await dataSource.query(
        'SELECT count(*)::int AS count FROM employee_skills WHERE employee_id = $1',
        [outsiderId],
      );
      expect(row.count).toBe(1);
    });
  });
});
