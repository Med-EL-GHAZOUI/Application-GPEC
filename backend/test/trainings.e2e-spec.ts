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

type Api = ReturnType<typeof asUser>;
type GapRow = {
  skill: { name: string };
  recommendedTraining: {
    title: string;
    targetLevel: number;
    availableSeats: number;
  } | null;
};
type Recommendation = {
  skill: { name: string };
  trainings: { title: string }[];
};

describe('Trainings, enrollments and recommendations (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: Api;
  let hr: Api;
  let manager: Api;
  let employee: Api;

  let departmentId: string;
  let kafkaSkillId: string; // used by the catalogue/enrollment tests
  let narrowSkillId: string; // max level 4
  let positionId: string;
  const skillIds: Record<'angular' | 'docker' | 'sql', string> = {
    angular: '',
    docker: '',
    sql: '',
  };

  let managerEmployeeId: string;
  let reportId: string;
  let outsiderId: string;
  let noPositionId: string;
  let others: string[]; // four plain employees for capacity tests

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

  const createTraining = async (
    title: string,
    skillId: string,
    targetLevel: number,
    extra: Record<string, unknown> = {},
  ) =>
    (
      await hr
        .post('/trainings')
        .send({
          title: `${title} ${suffix}`,
          skillId,
          targetLevel,
          durationHours: 14,
          capacity: 10,
          status: 'OPEN',
          ...extra,
        })
        .expect(201)
    ).body.id as string;

  const gapFor = (rows: GapRow[], name: string) =>
    rows.find((row) => row.skill.name === `${name} ${suffix}`);

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
    kafkaSkillId = await createSkill('Kafka', 'TECHNICAL');
    narrowSkillId = await createSkill('Teamwork', 'SOFT', 4);
    skillIds.angular = await createSkill('Angular', 'TECHNICAL');
    skillIds.docker = await createSkill('Docker', 'TECHNICAL');
    skillIds.sql = await createSkill('SQL', 'TECHNICAL');

    positionId = (
      await hr
        .post('/positions')
        .send({ title: `Engineer ${suffix}`, level: 'SENIOR', departmentId })
        .expect(201)
    ).body.id;
    for (const [key, level] of [
      ['angular', 4],
      ['docker', 3],
      ['sql', 2],
    ] as const) {
      await hr
        .post(`/positions/${positionId}/skills`)
        .send({ skillId: skillIds[key], requiredLevel: level })
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
    others = await Promise.all(
      ['o1', 'o2', 'o3', 'o4'].map((key) => createEmployee(key)),
    );

    // The report holds Angular 2 and SQL 2; Docker was never assessed.
    for (const key of ['angular', 'sql'] as const) {
      await manager
        .put(`/employees/${reportId}/skills/${skillIds[key]}`)
        .send({ level: 2, evaluatedAt: '2026-01-10' })
        .expect(200);
    }
  });

  afterAll(async () => {
    const like = `%${suffix}%`;
    await dataSource.query('DELETE FROM employees WHERE email LIKE $1', [like]); // enrollments cascade
    await dataSource.query('DELETE FROM trainings WHERE title LIKE $1', [like]);
    await dataSource.query('DELETE FROM positions WHERE title LIKE $1', [like]);
    await dataSource.query('DELETE FROM skills WHERE name LIKE $1', [like]);
    await dataSource.query('DELETE FROM departments WHERE name LIKE $1', [
      like,
    ]);
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [like]);
    await app.close();
  });

  describe('Catalogue', () => {
    it('lets everyone read, but only HR/ADMIN write', async () => {
      await employee.get('/trainings').expect(200);
      await employee
        .post('/trainings')
        .send({
          title: 'x',
          skillId: kafkaSkillId,
          targetLevel: 2,
          durationHours: 1,
          capacity: 1,
        })
        .expect(403);
      await manager.delete(`/trainings/${NOT_FOUND_ID}`).expect(403);
    });

    it('creates a training with defaults and free seats', async () => {
      const { body } = await admin
        .post('/trainings')
        .send({
          title: `Kafka Fundamentals ${suffix}`,
          description: 'Brokers, topics, partitions',
          skillId: kafkaSkillId,
          targetLevel: 2,
          durationHours: 21,
          provider: 'Confluent',
          startDate: '2027-03-01',
          capacity: 8,
        })
        .expect(201);

      expect(body).toMatchObject({
        status: 'PLANNED',
        capacity: 8,
        enrolledCount: 0,
        availableSeats: 8,
        provider: 'Confluent',
        startDate: '2027-03-01',
        skill: { id: kafkaSkillId },
      });
    });

    it('validates input (400) and references (404)', async () => {
      const base = {
        title: `Bad ${suffix}`,
        skillId: kafkaSkillId,
        targetLevel: 2,
        durationHours: 5,
        capacity: 5,
      };
      await hr
        .post('/trainings')
        .send({ ...base, targetLevel: 6 })
        .expect(400); // Kafka maximum is 5
      await hr
        .post('/trainings')
        .send({ ...base, skillId: narrowSkillId, targetLevel: 5 })
        .expect(400); // max 4
      await hr
        .post('/trainings')
        .send({ ...base, capacity: 0 })
        .expect(400);
      await hr
        .post('/trainings')
        .send({ ...base, durationHours: 0 })
        .expect(400);
      await hr
        .post('/trainings')
        .send({ ...base, startDate: '2027-02-30' })
        .expect(400);
      await hr
        .post('/trainings')
        .send({ ...base, status: 'DONE' })
        .expect(400);
      await hr
        .post('/trainings')
        .send({ ...base, extra: true })
        .expect(400);
      await hr
        .post('/trainings')
        .send({ ...base, skillId: NOT_FOUND_ID })
        .expect(404);
    });

    it('lists, searches and filters with pagination, soonest start first and unscheduled last', async () => {
      await createTraining('Lst-Later', kafkaSkillId, 3, {
        startDate: '2027-09-01',
      });
      await createTraining('Lst-Sooner', kafkaSkillId, 3, {
        startDate: '2027-04-01',
      });
      await createTraining('Lst-Unscheduled', narrowSkillId, 2, {
        status: 'PLANNED',
      });

      const { body } = await hr
        .get(`/trainings?search=Lst-&limit=10`)
        .expect(200);
      expect(body.data.map((row: { title: string }) => row.title)).toEqual([
        `Lst-Sooner ${suffix}`,
        `Lst-Later ${suffix}`,
        `Lst-Unscheduled ${suffix}`,
      ]);

      const bySkill = await hr
        .get(`/trainings?search=${suffix}&skillId=${narrowSkillId}`)
        .expect(200);
      expect(bySkill.body.total).toBe(1);
      const byStatus = await hr
        .get(`/trainings?search=Lst-&status=PLANNED`)
        .expect(200);
      expect(byStatus.body.total).toBe(1);
      const byLevel = await hr
        .get(`/trainings?search=Lst-&level=3`)
        .expect(200);
      expect(byLevel.body.total).toBe(2);
      const bySkillName = await hr
        .get(`/trainings?search=teamwork ${suffix}`)
        .expect(200);
      expect(bySkillName.body.total).toBeGreaterThanOrEqual(1);

      const page = await hr
        .get(`/trainings?search=Lst-&limit=2&page=2`)
        .expect(200);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(page.body.data).toHaveLength(1);
    });

    it('rejects invalid filters (400), answers 404 and 400 on bad ids', async () => {
      await hr.get('/trainings?status=DONE').expect(400);
      await hr.get('/trainings?level=0').expect(400);
      await hr.get(`/trainings/${NOT_FOUND_ID}`).expect(404);
      await hr.get('/trainings/not-a-uuid').expect(400);
    });

    it('updates a training; null clears optional fields; the level is revalidated', async () => {
      const id = await createTraining('Update', kafkaSkillId, 2, {
        provider: 'ACME',
        startDate: '2027-05-01',
      });

      const { body } = await hr
        .patch(`/trainings/${id}`)
        .send({
          capacity: 20,
          provider: null,
          startDate: null,
          title: `Update v2 ${suffix}`,
        })
        .expect(200);
      expect(body).toMatchObject({
        capacity: 20,
        provider: null,
        startDate: null,
        title: `Update v2 ${suffix}`,
      });

      await hr
        .patch(`/trainings/${id}`)
        .send({ skillId: narrowSkillId, targetLevel: 5 })
        .expect(400);
      await hr.patch(`/trainings/${id}`).send({ targetLevel: 9 }).expect(400);
      await hr
        .patch(`/trainings/${NOT_FOUND_ID}`)
        .send({ capacity: 1 })
        .expect(404);
    });

    it('deletes a training without enrollments, refuses one that has some (409)', async () => {
      const free = await createTraining('Deletable', kafkaSkillId, 2);
      await hr.delete(`/trainings/${free}`).expect(204);
      await hr.get(`/trainings/${free}`).expect(404);

      const used = await createTraining('Used', kafkaSkillId, 2);
      await hr
        .post(`/trainings/${used}/enrollments`)
        .send({ employeeId: others[0] })
        .expect(201);
      await hr.delete(`/trainings/${used}`).expect(409);
    });
  });

  describe('Enrollments', () => {
    let openId: string;

    beforeAll(async () => {
      openId = await createTraining('Enroll', kafkaSkillId, 3, { capacity: 2 });
    });

    it('enrolls an employee and counts the seat', async () => {
      const { body } = await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[0] })
        .expect(201);
      expect(body).toMatchObject({
        status: 'ENROLLED',
        completedAt: null,
        employee: { id: others[0] },
      });

      const training = await hr.get(`/trainings/${openId}`).expect(200);
      expect(training.body).toMatchObject({
        enrolledCount: 1,
        availableSeats: 1,
      });
    });

    it('refuses a second enrollment of the same employee (409)', async () => {
      await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[0] })
        .expect(409);
    });

    it('forbids EMPLOYEE and MANAGER from enrolling or listing participants (403)', async () => {
      await employee
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[1] })
        .expect(403);
      await manager
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[1] })
        .expect(403);
      await employee.get(`/trainings/${openId}/enrollments`).expect(403);
      await manager
        .patch(`/trainings/${openId}/enrollments/${others[0]}`)
        .send({ status: 'COMPLETED' })
        .expect(403);
    });

    it('validates the request and the references', async () => {
      await hr.post(`/trainings/${openId}/enrollments`).send({}).expect(400);
      await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: 'nope' })
        .expect(400);
      await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: NOT_FOUND_ID })
        .expect(404);
      await hr
        .post(`/trainings/${NOT_FOUND_ID}/enrollments`)
        .send({ employeeId: others[1] })
        .expect(404);
    });

    it('only accepts enrollments while the training is OPEN (409)', async () => {
      for (const status of [
        'PLANNED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ]) {
        const id = await createTraining(`Status ${status}`, kafkaSkillId, 2, {
          status,
        });
        await hr
          .post(`/trainings/${id}/enrollments`)
          .send({ employeeId: others[1] })
          .expect(409);
      }
    });

    it('refuses an inactive employee (409)', async () => {
      await hr
        .patch(`/employees/${others[3]}`)
        .send({ status: 'INACTIVE' })
        .expect(200);
      await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[3] })
        .expect(409);
      await hr
        .patch(`/employees/${others[3]}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
    });

    it('never exceeds the capacity, even with simultaneous requests', async () => {
      const id = await createTraining('Concurrent', kafkaSkillId, 3, {
        capacity: 2,
      });

      const responses = await Promise.all(
        others.map((employeeId) =>
          hr.post(`/trainings/${id}/enrollments`).send({ employeeId }),
        ),
      );

      const statuses = responses
        .map((response) => response.status)
        .sort((a, b) => a - b);
      expect(statuses).toEqual([201, 201, 409, 409]);
      const training = await hr.get(`/trainings/${id}`).expect(200);
      expect(training.body).toMatchObject({
        enrolledCount: 2,
        availableSeats: 0,
      });
    });

    it('refuses a full training, and a capacity lower than the active enrollments (409)', async () => {
      await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[1] })
        .expect(201);
      await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[2] })
        .expect(409);
      await hr.patch(`/trainings/${openId}`).send({ capacity: 1 }).expect(409);
      await hr.patch(`/trainings/${openId}`).send({ capacity: 2 }).expect(200);
    });

    it('lists participants with pagination', async () => {
      const { body } = await hr
        .get(`/trainings/${openId}/enrollments?limit=1&page=2`)
        .expect(200);
      expect(body).toMatchObject({ total: 2, page: 2, limit: 1 });
      expect(body.data[0].employee).toHaveProperty('lastName');
      await hr.get(`/trainings/${NOT_FOUND_ID}/enrollments`).expect(404);
    });

    it('follows the allowed transitions and stamps the completion date', async () => {
      const move = (status: string) =>
        hr
          .patch(`/trainings/${openId}/enrollments/${others[0]}`)
          .send({ status });

      await move('ENROLLED').expect(409); // no way back to the same state
      const started = await move('IN_PROGRESS').expect(200);
      expect(started.body).toMatchObject({
        status: 'IN_PROGRESS',
        completedAt: null,
      });
      await move('ENROLLED').expect(409);

      const done = await move('COMPLETED').expect(200);
      expect(done.body.status).toBe('COMPLETED');
      expect(done.body.completedAt).toEqual(expect.any(String));

      await move('CANCELLED').expect(409); // COMPLETED is final
      await move('IN_PROGRESS').expect(409);
      await move('NOPE').expect(400);
      await hr
        .patch(`/trainings/${openId}/enrollments/${NOT_FOUND_ID}`)
        .send({ status: 'COMPLETED' })
        .expect(404);
    });

    it('frees the seat on cancellation, and reactivates the same row on re-enrollment', async () => {
      await hr
        .patch(`/trainings/${openId}/enrollments/${others[1]}`)
        .send({ status: 'CANCELLED' })
        .expect(200);
      expect(
        (await hr.get(`/trainings/${openId}`).expect(200)).body,
      ).toMatchObject({
        enrolledCount: 1,
        availableSeats: 1,
      });

      await hr
        .patch(`/trainings/${openId}/enrollments/${others[1]}`)
        .send({ status: 'COMPLETED' })
        .expect(409);
      const again = await hr
        .post(`/trainings/${openId}/enrollments`)
        .send({ employeeId: others[1] })
        .expect(201);
      expect(again.body).toMatchObject({
        status: 'ENROLLED',
        completedAt: null,
      });

      const [row] = await dataSource.query(
        'SELECT count(*)::int AS count FROM employee_trainings WHERE training_id = $1 AND employee_id = $2',
        [openId, others[1]],
      );
      expect(row.count).toBe(1);
    });
  });

  describe("An employee's trainings (scope)", () => {
    let id: string;

    beforeAll(async () => {
      id = await createTraining('Scope', kafkaSkillId, 3);
      await hr
        .post(`/trainings/${id}/enrollments`)
        .send({ employeeId: reportId })
        .expect(201);
    });

    it('lists the trainings of the caller with their status', async () => {
      const { body } = await employee
        .get(`/employees/${reportId}/trainings`)
        .expect(200);
      const entry = body.find(
        (row: { training: { id: string } }) => row.training.id === id,
      );
      expect(entry).toMatchObject({
        status: 'ENROLLED',
        training: { title: `Scope ${suffix}` },
      });
    });

    it('applies the access scope', async () => {
      await manager.get(`/employees/${reportId}/trainings`).expect(200);
      await employee.get(`/employees/${outsiderId}/trainings`).expect(403);
      await manager.get(`/employees/${outsiderId}/trainings`).expect(403);
      await hr.get(`/employees/${outsiderId}/trainings`).expect(200);
      await admin.get(`/employees/${reportId}/trainings`).expect(200);
      await employee.get(`/employees/${NOT_FOUND_ID}/trainings`).expect(403);
      await hr.get(`/employees/${NOT_FOUND_ID}/trainings`).expect(404);
    });
  });

  describe('Recommendations from the competency gaps', () => {
    // Angular: required 4, current 2. Docker: required 3, never assessed. SQL: mastered.
    let advancedId: string;

    beforeAll(async () => {
      const { angular, docker } = skillIds;
      await createTraining('Angular Intro', angular, 2); // does not raise the level
      await createTraining('Angular Basics', angular, 3);
      advancedId = await createTraining('Angular Advanced', angular, 4, {
        startDate: '2027-09-01',
      });
      await createTraining('Angular Expert', angular, 5);
      await createTraining('Angular Planned', angular, 4, {
        status: 'PLANNED',
        startDate: '2028-01-01',
      });
      await createTraining('Angular Cancelled', angular, 4, {
        status: 'CANCELLED',
      });
      await createTraining('Angular Done', angular, 4, { status: 'COMPLETED' });
      await createTraining('Angular Started', angular, 4, {
        status: 'IN_PROGRESS',
      });
      const full = await createTraining('Angular Full', angular, 4, {
        capacity: 1,
      });
      await hr
        .post(`/trainings/${full}/enrollments`)
        .send({ employeeId: others[0] })
        .expect(201);

      await createTraining('Docker Fundamentals', docker, 3);
      await createTraining('Docker Intro', docker, 1);
      await createTraining('SQL Pro', skillIds.sql, 4); // the SQL need is already met
    });

    it('proposes the best training for each development need in the gaps', async () => {
      const { body } = await hr.get(`/employees/${reportId}/gaps`).expect(200);

      const angular = gapFor(body.gaps, 'Angular');
      expect(angular?.recommendedTraining).toMatchObject({
        title: `Angular Advanced ${suffix}`,
        targetLevel: 4,
      });
      expect(angular?.recommendedTraining?.availableSeats).toBe(10);
      expect(gapFor(body.gaps, 'Docker')?.recommendedTraining?.title).toBe(
        `Docker Fundamentals ${suffix}`,
      );
      expect(gapFor(body.gaps, 'SQL')?.recommendedTraining).toBeNull();
    });

    it('ranks the alternatives: closest to the requirement, then earliest start', async () => {
      const { body } = await hr
        .get(`/employees/${reportId}/training-recommendations`)
        .expect(200);

      const rows: Recommendation[] = body.recommendations;
      expect(rows.map((row) => row.skill.name)).toEqual([
        `Docker ${suffix}`,
        `Angular ${suffix}`,
      ]); // largest gap first
      expect(rows[1].trainings.map((row) => row.title)).toEqual([
        `Angular Advanced ${suffix}`, // target 4, soonest
        `Angular Planned ${suffix}`, // target 4, later
        `Angular Expert ${suffix}`, // target 5: reaches the need
        `Angular Basics ${suffix}`, // target 3: falls short
      ]);
      expect(rows[0].trainings.map((row) => row.title)).toEqual([
        `Docker Fundamentals ${suffix}`,
        `Docker Intro ${suffix}`,
      ]);
      expect(body.recommendations).toHaveLength(2); // no entry for the mastered SQL
    });

    it('excludes cancelled, completed, in-progress, full and non-improving trainings', async () => {
      const { body } = await hr
        .get(`/employees/${reportId}/training-recommendations`)
        .expect(200);
      const titles = body.recommendations.flatMap((row: Recommendation) =>
        row.trainings.map((training) => training.title),
      );

      for (const excluded of [
        'Intro',
        'Cancelled',
        'Done',
        'Started',
        'Full',
      ]) {
        expect(titles).not.toContain(`Angular ${excluded} ${suffix}`);
      }
      expect(titles).not.toContain(`SQL Pro ${suffix}`);
    });

    it('stops proposing a training the employee follows, and proposes it again once cancelled', async () => {
      await hr
        .post(`/trainings/${advancedId}/enrollments`)
        .send({ employeeId: reportId })
        .expect(201);
      const followed = await hr.get(`/employees/${reportId}/gaps`).expect(200);
      expect(
        gapFor(followed.body.gaps, 'Angular')?.recommendedTraining?.title,
      ).toBe(`Angular Planned ${suffix}`);

      await hr
        .patch(`/trainings/${advancedId}/enrollments/${reportId}`)
        .send({ status: 'CANCELLED' })
        .expect(200);
      const back = await hr.get(`/employees/${reportId}/gaps`).expect(200);
      expect(
        gapFor(back.body.gaps, 'Angular')?.recommendedTraining?.title,
      ).toBe(`Angular Advanced ${suffix}`);
    });

    it('follows the employee progress: a higher level drops the trainings that no longer help', async () => {
      await manager
        .post('/evaluations')
        .send({
          employeeId: reportId,
          skillId: skillIds.angular,
          level: 3,
          evaluatedAt: '2026-02-01',
        })
        .expect(201);

      const { body } = await hr
        .get(`/employees/${reportId}/training-recommendations`)
        .expect(200);
      const angular = body.recommendations.find(
        (row: Recommendation) => row.skill.name === `Angular ${suffix}`,
      );
      expect(
        angular.trainings.map((row: { title: string }) => row.title),
      ).not.toContain(`Angular Basics ${suffix}`);
      expect(angular.trainings[0].title).toBe(`Angular Advanced ${suffix}`);

      await manager
        .post('/evaluations')
        .send({
          employeeId: reportId,
          skillId: skillIds.angular,
          level: 4,
          evaluatedAt: '2026-03-01',
        })
        .expect(201);
      const mastered = await hr
        .get(`/employees/${reportId}/training-recommendations`)
        .expect(200);
      expect(
        mastered.body.recommendations.map(
          (row: Recommendation) => row.skill.name,
        ),
      ).toEqual([`Docker ${suffix}`]);
    });

    it('lets the employee see the recommendation in their gaps, but not the alternatives list', async () => {
      const { body } = await employee
        .get(`/employees/${reportId}/gaps`)
        .expect(200);
      expect(gapFor(body.gaps, 'Docker')?.recommendedTraining).not.toBeNull();
      await employee
        .get(`/employees/${reportId}/training-recommendations`)
        .expect(403);
    });

    it('applies the scope to the alternatives list', async () => {
      await manager
        .get(`/employees/${reportId}/training-recommendations`)
        .expect(200);
      await manager
        .get(`/employees/${outsiderId}/training-recommendations`)
        .expect(403);
      await admin
        .get(`/employees/${reportId}/training-recommendations`)
        .expect(200);
      await hr
        .get(`/employees/${NOT_FOUND_ID}/training-recommendations`)
        .expect(404);
      await hr
        .get(`/employees/${noPositionId}/training-recommendations`)
        .expect(409);
    });
  });

  describe('Consistency with the skill catalogue', () => {
    it('stops a skill maximum from dropping below a training target level (409)', async () => {
      await createTraining('Target 5', kafkaSkillId, 5);
      await hr
        .patch(`/skills/${kafkaSkillId}`)
        .send({ maxLevel: 4 })
        .expect(409);
    });

    it('refuses to delete a skill that has trainings (409)', async () => {
      await hr.delete(`/skills/${kafkaSkillId}`).expect(409);
    });
  });
});
