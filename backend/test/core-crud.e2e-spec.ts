import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './create-test-app.js';
import {
  asUser,
  createSession,
  E2E_PASSWORD,
  type TestSession,
} from './e2e-helpers.js';

// Requires PostgreSQL (npm run db:up) and a valid backend/.env
const suffix = randomUUID().slice(0, 8);
const emailOf = (name: string) => `${name}-${suffix}@e2e.test`;
const NOT_FOUND_ID = '00000000-0000-4000-8000-000000000000';

describe('Departments, skills, positions and employees (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let hr: ReturnType<typeof asUser>;
  let manager: ReturnType<typeof asUser>;
  let employee: ReturnType<typeof asUser>;
  let managerSession: TestSession;
  let employeeSession: TestSession;

  // Fixtures created through the API in beforeAll
  let departmentId: string;
  let otherDepartmentId: string;
  let skillId: string;
  let positionId: string;
  let managerEmployeeId: string;
  let reportAId: string;
  let reportBId: string;
  let outsiderId: string;

  const employeeBody = (key: string, extra: Record<string, unknown> = {}) => ({
    matricule: `M-${suffix}-${key}`,
    firstName: 'Test',
    lastName: `Last-${key}`,
    email: emailOf(`emp-${key}`),
    hireDate: '2024-01-15',
    departmentId,
    ...extra,
  });

  const createEmployee = async (
    key: string,
    extra: Record<string, unknown> = {},
  ) => {
    const { body } = await hr
      .post('/employees')
      .send(employeeBody(key, extra))
      .expect(201);
    return body.id as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    const hrSession = await createSession(app, emailOf('hr'), Role.Hr);
    managerSession = await createSession(app, emailOf('manager'), Role.Manager);
    employeeSession = await createSession(
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
    otherDepartmentId = (
      await hr
        .post('/departments')
        .send({ name: `Other ${suffix}` })
        .expect(201)
    ).body.id;
    skillId = (
      await hr
        .post('/skills')
        .send({ name: `Angular ${suffix}`, category: 'TECHNICAL' })
        .expect(201)
    ).body.id;
    positionId = (
      await hr
        .post('/positions')
        .send({ title: `Engineer ${suffix}`, level: 'SENIOR', departmentId })
        .expect(201)
    ).body.id;

    managerEmployeeId = await createEmployee('mgr', {
      userId: managerSession.userId,
      positionId,
    });
    reportAId = await createEmployee('a', {
      managerId: managerEmployeeId,
      userId: employeeSession.userId,
    });
    reportBId = await createEmployee('b', { managerId: managerEmployeeId });
    outsiderId = await createEmployee('out');
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
    it('lets any authenticated user read, but only HR/ADMIN write', async () => {
      await employee.get('/departments').expect(200);
      await employee
        .post('/departments')
        .send({ name: `Nope ${suffix}` })
        .expect(403);
      await manager.delete(`/departments/${departmentId}`).expect(403);
    });

    it('answers 409 on a duplicate name (unique violation)', async () => {
      await hr
        .post('/departments')
        .send({ name: `Dept ${suffix}` })
        .expect(409);
    });

    it('answers 400 on an invalid body and on a malformed id', async () => {
      await hr.post('/departments').send({ name: '' }).expect(400);
      await hr
        .post('/departments')
        .send({ name: 'X', unknown: true })
        .expect(400);
      await hr.get('/departments/not-a-uuid').expect(400);
    });

    it('answers 404 for an unknown department', async () => {
      await hr.get(`/departments/${NOT_FOUND_ID}`).expect(404);
    });

    it('searches case-insensitively with the pagination envelope', async () => {
      const { body } = await hr
        .get(`/departments?search=${suffix.toUpperCase()}&limit=1&page=2`)
        .expect(200);
      expect(body).toMatchObject({ total: 2, page: 2, limit: 1 });
      expect(body.data).toHaveLength(1);
    });

    it('rejects an out-of-range page size', async () => {
      await hr.get('/departments?limit=1000').expect(400);
      await hr.get('/departments?page=0').expect(400);
    });

    it('treats % in a search as a literal character', async () => {
      const { body } = await hr.get('/departments?search=%25').expect(200);
      expect(body.total).toBe(0);
    });

    it('updates a department', async () => {
      const { body } = await hr
        .patch(`/departments/${otherDepartmentId}`)
        .send({ description: 'Renamed scope' })
        .expect(200);
      expect(body.description).toBe('Renamed scope');
    });

    it('refuses to delete a department still used (409)', async () => {
      await hr.delete(`/departments/${departmentId}`).expect(409);
    });

    it('deletes an unused department', async () => {
      const { body } = await hr
        .post('/departments')
        .send({ name: `Temp ${suffix}` })
        .expect(201);
      await hr.delete(`/departments/${body.id}`).expect(204);
      await hr.get(`/departments/${body.id}`).expect(404);
    });
  });

  describe('Skills', () => {
    it('applies the default maximum level of 5', async () => {
      const { body } = await hr.get(`/skills/${skillId}`).expect(200);
      expect(body.maxLevel).toBe(5);
    });

    it('rejects a duplicate name (409) and an invalid level or category (400)', async () => {
      await hr
        .post('/skills')
        .send({ name: `Angular ${suffix}`, category: 'TECHNICAL' })
        .expect(409);
      await hr
        .post('/skills')
        .send({ name: `Bad ${suffix}`, category: 'TECHNICAL', maxLevel: 11 })
        .expect(400);
      await hr
        .post('/skills')
        .send({ name: `Bad ${suffix}`, category: 'OTHER' })
        .expect(400);
    });

    it('forbids writes to non-HR roles', async () => {
      await manager
        .post('/skills')
        .send({ name: `Nope ${suffix}`, category: 'SOFT' })
        .expect(403);
    });

    it('filters by category', async () => {
      await hr
        .post('/skills')
        .send({ name: `Teamwork ${suffix}`, category: 'SOFT', maxLevel: 4 })
        .expect(201);
      const { body } = await hr
        .get(`/skills?search=${suffix}&category=SOFT`)
        .expect(200);
      expect(body.total).toBe(1);
      expect(body.data[0].name).toBe(`Teamwork ${suffix}`);
    });
  });

  describe('Positions and required skills', () => {
    it('answers 404 when the department does not exist', async () => {
      await hr
        .post('/positions')
        .send({
          title: `Ghost ${suffix}`,
          level: 'JUNIOR',
          departmentId: NOT_FOUND_ID,
        })
        .expect(404);
    });

    it('answers 409 for the same title in the same department', async () => {
      await hr
        .post('/positions')
        .send({ title: `Engineer ${suffix}`, level: 'JUNIOR', departmentId })
        .expect(409);
    });

    it('returns the position with its department and filters by department', async () => {
      const { body } = await hr.get(`/positions/${positionId}`).expect(200);
      expect(body.department.id).toBe(departmentId);

      const list = await hr
        .get(`/positions?departmentId=${departmentId}&search=${suffix}`)
        .expect(200);
      expect(list.body.total).toBe(1);
    });

    it('requires a skill at a level, within the skill maximum', async () => {
      await hr
        .post(`/positions/${positionId}/skills`)
        .send({ skillId, requiredLevel: 6 })
        .expect(400);

      const { body } = await hr
        .post(`/positions/${positionId}/skills`)
        .send({ skillId, requiredLevel: 4 })
        .expect(201);
      expect(body).toMatchObject({ requiredLevel: 4, skill: { id: skillId } });
    });

    it('answers 409 when the skill is already required', async () => {
      await hr
        .post(`/positions/${positionId}/skills`)
        .send({ skillId, requiredLevel: 3 })
        .expect(409);
    });

    it('lists and updates the required level', async () => {
      await employee.get(`/positions/${positionId}/skills`).expect(200);
      const { body } = await hr
        .patch(`/positions/${positionId}/skills/${skillId}`)
        .send({ requiredLevel: 5 })
        .expect(200);
      expect(body.requiredLevel).toBe(5);

      await hr
        .patch(`/positions/${positionId}/skills/${skillId}`)
        .send({ requiredLevel: 9 })
        .expect(400);
    });

    it('stops a skill maximum from dropping below a required level (409)', async () => {
      await hr.patch(`/skills/${skillId}`).send({ maxLevel: 3 }).expect(409);
      await hr.patch(`/skills/${skillId}`).send({ maxLevel: 5 }).expect(200);
    });

    it('refuses to delete a skill required by a position (409)', async () => {
      await hr.delete(`/skills/${skillId}`).expect(409);
    });

    it('refuses to delete a position assigned to employees (409)', async () => {
      await hr.delete(`/positions/${positionId}`).expect(409);
    });

    it('removes a required skill, then answers 404 when removing it again', async () => {
      await hr.delete(`/positions/${positionId}/skills/${skillId}`).expect(204);
      await hr.delete(`/positions/${positionId}/skills/${skillId}`).expect(404);
    });
  });

  describe('Employees: creation and validation', () => {
    it('forbids creation to non-HR roles', async () => {
      await manager.post('/employees').send(employeeBody('x1')).expect(403);
      await employee.post('/employees').send(employeeBody('x2')).expect(403);
    });

    it('returns the employee with names, not raw secrets or foreign records', async () => {
      const { body } = await hr
        .get(`/employees/${managerEmployeeId}`)
        .expect(200);
      expect(body).toMatchObject({
        matricule: `M-${suffix}-mgr`,
        status: 'ACTIVE',
        department: { id: departmentId },
        position: { id: positionId },
        manager: null,
      });
    });

    it('answers 409 on a duplicate matricule or email', async () => {
      await hr
        .post('/employees')
        .send(employeeBody('dup', { matricule: `M-${suffix}-mgr` }))
        .expect(409);
      await hr
        .post('/employees')
        .send(employeeBody('dup2', { email: emailOf('emp-mgr') }))
        .expect(409);
    });

    it('validates fields (400) and references (404, 409)', async () => {
      await hr
        .post('/employees')
        .send(employeeBody('v1', { hireDate: '2024-13-45' }))
        .expect(400);
      await hr
        .post('/employees')
        .send(employeeBody('v2', { hireDate: '15/01/2024' }))
        .expect(400);
      await hr
        .post('/employees')
        .send(employeeBody('v3', { email: 'nope' }))
        .expect(400);
      await hr
        .post('/employees')
        .send(employeeBody('v4', { status: 'FIRED' }))
        .expect(400);
      await hr
        .post('/employees')
        .send(employeeBody('v5', { departmentId: NOT_FOUND_ID }))
        .expect(404);
      await hr
        .post('/employees')
        .send(employeeBody('v6', { managerId: NOT_FOUND_ID }))
        .expect(404);
      // This account already belongs to another employee.
      await hr
        .post('/employees')
        .send(employeeBody('v7', { userId: managerSession.userId }))
        .expect(409);
    });
  });

  describe('Employees: search, filters and pagination (HR)', () => {
    it('paginates on the server', async () => {
      const first = await hr
        .get(`/employees?search=${suffix}&limit=3&page=1`)
        .expect(200);
      expect(first.body).toMatchObject({ total: 4, page: 1, limit: 3 });
      expect(first.body.data).toHaveLength(3);

      const second = await hr
        .get(`/employees?search=${suffix}&limit=3&page=2`)
        .expect(200);
      expect(second.body.data).toHaveLength(1);
    });

    it('searches by department and position names too', async () => {
      const { body } = await hr
        .get(`/employees?search=Engineer ${suffix}`)
        .expect(200);
      expect(body.total).toBe(1);
      expect(body.data[0].id).toBe(managerEmployeeId);
    });

    it('filters by manager and by status', async () => {
      const byManager = await hr
        .get(`/employees?managerId=${managerEmployeeId}&search=${suffix}`)
        .expect(200);
      expect(byManager.body.total).toBe(2);

      const inactive = await hr
        .get(`/employees?status=INACTIVE&search=${suffix}`)
        .expect(200);
      expect(inactive.body.total).toBe(0);
    });

    it('rejects invalid filters with 400', async () => {
      await hr.get('/employees?status=FIRED').expect(400);
      await hr.get('/employees?departmentId=nope').expect(400);
    });
  });

  describe('Employees: access scope (RBAC)', () => {
    it('lets an EMPLOYEE read only their own record', async () => {
      const me = await employee.get('/employees/me').expect(200);
      expect(me.body.id).toBe(reportAId);
      await employee.get(`/employees/${reportAId}`).expect(200);
      await employee.get(`/employees/${reportBId}`).expect(403);
      await employee.get(`/employees/${managerEmployeeId}`).expect(403);
      await employee.get('/employees').expect(403);
    });

    it('does not reveal the manager contact details to the employee', async () => {
      const { body } = await employee
        .get(`/employees/${reportAId}`)
        .expect(200);
      expect(body.manager).toEqual({
        id: managerEmployeeId,
        firstName: 'Test',
        lastName: 'Last-mgr',
      });
    });

    it('lets a MANAGER list and read only direct reports', async () => {
      const { body } = await manager.get('/employees').expect(200);
      const ids = body.data.map((row: { id: string }) => row.id).sort();
      expect(body.total).toBe(2);
      expect(ids).toEqual([reportAId, reportBId].sort());

      await manager.get(`/employees/${reportAId}`).expect(200);
      await manager.get(`/employees/${outsiderId}`).expect(403);
    });

    it('does not let a MANAGER widen the scope with a filter', async () => {
      const { body } = await manager
        .get(`/employees?managerId=${NOT_FOUND_ID}`)
        .expect(200);
      expect(body.total).toBe(0);
    });

    it('lets a MANAGER read their own record through /me', async () => {
      const { body } = await manager.get('/employees/me').expect(200);
      expect(body.id).toBe(managerEmployeeId);
    });

    it('answers 404 on /me when the account has no employee record', async () => {
      const lone = await createSession(app, emailOf('lone'), Role.Employee);
      await asUser(app, lone.token).get('/employees/me').expect(404);
    });

    it('forbids update and delete to a MANAGER', async () => {
      await manager
        .patch(`/employees/${reportAId}`)
        .send({ phone: '0600' })
        .expect(403);
      await manager.delete(`/employees/${reportAId}`).expect(403);
    });
  });

  describe('Employees: update rules', () => {
    it('updates fields and clears an optional link with null', async () => {
      const updated = await hr
        .patch(`/employees/${reportBId}`)
        .send({ phone: '+212600000000', status: 'ON_LEAVE', positionId })
        .expect(200);
      expect(updated.body).toMatchObject({
        phone: '+212600000000',
        status: 'ON_LEAVE',
      });
      expect(updated.body.position.id).toBe(positionId);

      const cleared = await hr
        .patch(`/employees/${reportBId}`)
        .send({ positionId: null })
        .expect(200);
      expect(cleared.body.position).toBeNull();
    });

    it('moves an employee to another department', async () => {
      const { body } = await hr
        .patch(`/employees/${outsiderId}`)
        .send({ departmentId: otherDepartmentId })
        .expect(200);
      expect(body.department.id).toBe(otherDepartmentId);
    });

    it('rejects an employee as their own manager (400)', async () => {
      await hr
        .patch(`/employees/${managerEmployeeId}`)
        .send({ managerId: managerEmployeeId })
        .expect(400);
    });

    it('rejects a management cycle (400)', async () => {
      await hr
        .patch(`/employees/${managerEmployeeId}`)
        .send({ managerId: reportAId })
        .expect(400);
    });

    it('answers 404 for an unknown employee', async () => {
      await hr
        .patch(`/employees/${NOT_FOUND_ID}`)
        .send({ phone: '1' })
        .expect(404);
      await hr.delete(`/employees/${NOT_FOUND_ID}`).expect(404);
    });
  });

  describe('Employees: soft delete', () => {
    it('refuses to delete someone who still manages employees (409)', async () => {
      await hr.delete(`/employees/${managerEmployeeId}`).expect(409);
    });

    it('soft-deletes, hides the record, and frees the matricule and email', async () => {
      await hr.delete(`/employees/${outsiderId}`).expect(204);
      await hr.get(`/employees/${outsiderId}`).expect(404);
      const list = await hr.get(`/employees?search=${suffix}`).expect(200);
      expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(
        outsiderId,
      );

      // The row is kept for history...
      const [row] = await dataSource.query(
        'SELECT deleted_at FROM employees WHERE id = $1',
        [outsiderId],
      );
      expect(row.deleted_at).not.toBeNull();
      // ...and its identifiers can be reused.
      await createEmployee('out');
    });

    it('disables the login account of a deleted employee', async () => {
      await hr.delete(`/employees/${reportAId}`).expect(204);

      await employee.get('/auth/me').expect(401);
      const { default: request } = await import('supertest');
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: employeeSession.email, password: E2E_PASSWORD })
        .expect(403);
    });
  });
});
