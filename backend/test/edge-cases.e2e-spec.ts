import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/common/enums/role.enum.js';
import { User } from '../src/users/entities/user.entity.js';
import { createTestApp } from './create-test-app.js';
import { asUser, createSession } from './e2e-helpers.js';

// Requires PostgreSQL (npm run db:up) and a valid backend/.env.
// Error paths and race conditions that the happy-path suites do not reach.
const suffix = randomUUID().slice(0, 8);
const emailOf = (name: string) => `${name}-${suffix}@e2e.test`;
const NOT_FOUND_ID = '00000000-0000-4000-8000-000000000000';

describe('Edge cases and races (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: ReturnType<typeof asUser>;
  let hr: ReturnType<typeof asUser>;
  let departmentId: string;
  let otherDepartmentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    admin = asUser(
      app,
      (await createSession(app, emailOf('admin'), Role.Admin)).token,
    );
    hr = asUser(app, (await createSession(app, emailOf('hr'), Role.Hr)).token);

    departmentId = (
      await hr
        .post('/departments')
        .send({ name: `Dept ${suffix}` })
        .expect(201)
    ).body.id;
    otherDepartmentId = (
      await hr
        .post('/departments')
        .send({ name: `Other ${suffix}` })
        .expect(201)
    ).body.id;
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

  describe('Departments', () => {
    it('answers 409 when renaming to a name already taken, and 404 on unknown ids', async () => {
      await hr
        .patch(`/departments/${otherDepartmentId}`)
        .send({ name: `Dept ${suffix}` })
        .expect(409);
      await hr
        .patch(`/departments/${NOT_FOUND_ID}`)
        .send({ name: 'x' })
        .expect(404);
      await hr.delete(`/departments/${NOT_FOUND_ID}`).expect(404);
    });
  });

  describe('Skills', () => {
    let skillId: string;

    beforeAll(async () => {
      skillId = (
        await hr
          .post('/skills')
          .send({ name: `Kotlin ${suffix}`, category: 'TECHNICAL' })
          .expect(201)
      ).body.id;
      await hr
        .post('/skills')
        .send({ name: `Swift ${suffix}`, category: 'TECHNICAL' })
        .expect(201);
    });

    it('answers 409 when renaming to a name already taken', async () => {
      await hr
        .patch(`/skills/${skillId}`)
        .send({ name: `Swift ${suffix}` })
        .expect(409);
    });

    it('answers 404 for an unknown skill', async () => {
      await hr.get(`/skills/${NOT_FOUND_ID}`).expect(404);
      await hr
        .patch(`/skills/${NOT_FOUND_ID}`)
        .send({ description: 'x' })
        .expect(404);
      await hr.delete(`/skills/${NOT_FOUND_ID}`).expect(404);
    });

    it('updates a skill, then deletes it when nothing uses it', async () => {
      const { body } = await hr
        .patch(`/skills/${skillId}`)
        .send({ description: 'JVM language', maxLevel: 4 })
        .expect(200);
      expect(body).toMatchObject({ description: 'JVM language', maxLevel: 4 });
      await hr.delete(`/skills/${skillId}`).expect(204);
      await hr.get(`/skills/${skillId}`).expect(404);
    });
  });

  describe('Positions', () => {
    let positionId: string;

    beforeAll(async () => {
      positionId = (
        await hr
          .post('/positions')
          .send({ title: `Engineer ${suffix}`, level: 'SENIOR', departmentId })
          .expect(201)
      ).body.id;
      await hr
        .post('/positions')
        .send({
          title: `Engineer ${suffix}`,
          level: 'JUNIOR',
          departmentId: otherDepartmentId,
        })
        .expect(201);
    });

    it('filters by department and by level', async () => {
      const byDepartment = await hr
        .get(`/positions?search=${suffix}&departmentId=${otherDepartmentId}`)
        .expect(200);
      expect(byDepartment.body.total).toBe(1);
      expect(byDepartment.body.data[0].level).toBe('JUNIOR');

      const byLevel = await hr
        .get(`/positions?search=${suffix}&level=SENIOR`)
        .expect(200);
      expect(byLevel.body.total).toBe(1);
      await hr.get('/positions?level=CEO').expect(400);
    });

    it('moves a position to another department, unless the title already exists there (409)', async () => {
      await hr
        .patch(`/positions/${positionId}`)
        .send({ departmentId: otherDepartmentId })
        .expect(409);

      const free = await createUnusedDepartment();
      const { body } = await hr
        .patch(`/positions/${positionId}`)
        .send({ departmentId: free })
        .expect(200);
      expect(body.department.id).toBe(free);
    });

    it('answers 404 for an unknown department, position or skill link', async () => {
      await hr
        .patch(`/positions/${positionId}`)
        .send({ departmentId: NOT_FOUND_ID })
        .expect(404);
      await hr
        .patch(`/positions/${NOT_FOUND_ID}`)
        .send({ title: 'x' })
        .expect(404);
      await hr.delete(`/positions/${NOT_FOUND_ID}`).expect(404);
      await hr.get(`/positions/${NOT_FOUND_ID}/skills`).expect(404);
      await hr
        .post(`/positions/${NOT_FOUND_ID}/skills`)
        .send({ skillId: NOT_FOUND_ID, requiredLevel: 2 })
        .expect(404);
      await hr
        .patch(`/positions/${positionId}/skills/${NOT_FOUND_ID}`)
        .send({ requiredLevel: 2 })
        .expect(404);
    });

    const createUnusedDepartment = async () =>
      (
        await hr
          .post('/departments')
          .send({ name: `Free ${suffix}` })
          .expect(201)
      ).body.id as string;
  });

  describe('Employees', () => {
    const body = (key: string, extra: Record<string, unknown> = {}) => ({
      matricule: `M-${suffix}-${key}`,
      firstName: 'Test',
      lastName: `Last-${key}`,
      email: emailOf(`emp-${key}`),
      hireDate: '2024-01-15',
      departmentId,
      ...extra,
    });

    it('answers 404 when the login account does not exist', async () => {
      await hr
        .post('/employees')
        .send(body('ghost', { userId: NOT_FOUND_ID }))
        .expect(404);
    });

    it('lets exactly one of two simultaneous creations with the same matricule succeed', async () => {
      const payload = body('race');
      const responses = await Promise.all([
        hr.post('/employees').send(payload),
        hr
          .post('/employees')
          .send({ ...payload, email: emailOf('emp-race-2') }),
      ]);

      expect(
        responses.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int AS count FROM employees WHERE matricule = $1 AND deleted_at IS NULL',
        [payload.matricule],
      );
      expect(count).toBe(1);
    });

    it('answers 409 when renaming a matricule or an email to one already in use', async () => {
      const first = (
        await hr.post('/employees').send(body('first')).expect(201)
      ).body;
      const second = (
        await hr.post('/employees').send(body('second')).expect(201)
      ).body;

      await hr
        .patch(`/employees/${second.id}`)
        .send({ matricule: first.matricule })
        .expect(409);
      await hr
        .patch(`/employees/${second.id}`)
        .send({ email: first.email })
        .expect(409);
    });

    it('filters the list by department and by position', async () => {
      const position = (
        await hr
          .post('/positions')
          .send({
            title: `Analyst ${suffix}`,
            level: 'JUNIOR',
            departmentId: otherDepartmentId,
          })
          .expect(201)
      ).body.id;
      const moved = (
        await hr
          .post('/employees')
          .send(
            body('filtered', {
              departmentId: otherDepartmentId,
              positionId: position,
            }),
          )
          .expect(201)
      ).body.id;

      const byDepartment = await hr
        .get(`/employees?departmentId=${otherDepartmentId}&search=${suffix}`)
        .expect(200);
      expect(
        byDepartment.body.data.map((row: { id: string }) => row.id),
      ).toEqual([moved]);
      const byPosition = await hr
        .get(`/employees?positionId=${position}`)
        .expect(200);
      expect(byPosition.body.data.map((row: { id: string }) => row.id)).toEqual(
        [moved],
      );
    });

    it('answers 404 on an unknown employee for HR and ADMIN alike', async () => {
      await hr.get(`/employees/${NOT_FOUND_ID}`).expect(404);
      await admin.get(`/employees/${NOT_FOUND_ID}`).expect(404);
    });
  });

  describe('Accounts', () => {
    it('lets exactly one of two simultaneous registrations of the same email succeed', async () => {
      const payload = {
        email: emailOf('twin'),
        password: 'a-strong-password',
        role: Role.Employee,
      };

      const responses = await Promise.all([
        admin.post('/auth/register').send(payload),
        admin.post('/auth/register').send(payload),
      ]);

      expect(
        responses.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int AS count FROM users WHERE email = $1',
        [payload.email],
      );
      expect(count).toBe(1);
    });

    it('answers 401, not 500, when the stored password hash is corrupted', async () => {
      const email = emailOf('corrupt');
      await dataSource.getRepository(User).save({
        email,
        passwordHash: 'not-an-argon2-hash',
        role: Role.Employee,
        isActive: true,
        refreshTokenHash: null,
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'whatever-password' })
        .expect(401);
    });

    it('does not reveal whether an email exists: same status and message', async () => {
      const email = emailOf('known');
      await dataSource.getRepository(User).save({
        email,
        passwordHash: await argon2.hash('the-real-password'),
        role: Role.Employee,
        isActive: true,
        refreshTokenHash: null,
      });
      const login = (address: string) =>
        request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: address, password: 'wrong-password' });

      const known = await login(email);
      const unknown = await login(emailOf('nobody'));

      expect(known.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(known.body.message).toBe(unknown.body.message);
    });
  });
});
