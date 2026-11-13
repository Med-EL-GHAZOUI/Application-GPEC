import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { Role } from '../src/common/enums/role.enum.js';
import { User } from '../src/users/entities/user.entity.js';
import { createTestApp } from './create-test-app.js';

// Requires PostgreSQL (npm run db:up) and a valid backend/.env
const PASSWORD = 'e2e-password-123';
const suffix = randomUUID().slice(0, 8);
const emailOf = (name: string) => `${name}-${suffix}@e2e.test`;

describe('Authentication and RBAC (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const createdEmails: string[] = [];

  const createUser = async (name: string, role: Role, isActive = true) => {
    const email = emailOf(name);
    createdEmails.push(email);
    await dataSource.getRepository(User).save({
      email,
      passwordHash: await argon2.hash(PASSWORD),
      role,
      isActive,
      refreshTokenHash: null,
    });
    return email;
  };

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await createUser('admin', Role.Admin);
    await createUser('hr', Role.Hr);
    await createUser('disabled', Role.Employee, false);
  });

  afterAll(async () => {
    await dataSource
      .getRepository(User)
      .delete({ email: In([...createdEmails, emailOf('created')]) });
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns both tokens for valid credentials', async () => {
      const { body } = await login(emailOf('admin')).expect(200);
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toEqual(expect.any(String));
    });

    it('is case-insensitive on the email', async () => {
      await login(emailOf('admin').toUpperCase()).expect(200);
    });

    it('answers 401 for a wrong password', async () => {
      await login(emailOf('admin'), 'wrong-password').expect(401);
    });

    it('answers 401 for an unknown email', async () => {
      await login(emailOf('nobody')).expect(401);
    });

    it('answers 403 for a disabled account', async () => {
      await login(emailOf('disabled')).expect(403);
    });

    it('answers 400 for an invalid body', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'x', extra: true })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('answers 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('answers 401 with a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.token')
        .expect(401);
    });

    it('returns the user without any secret field', async () => {
      const { accessToken } = (await login(emailOf('hr'))).body;
      const { body } = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(body).toMatchObject({ email: emailOf('hr'), role: Role.Hr });
      expect(body).not.toHaveProperty('passwordHash');
      expect(body).not.toHaveProperty('refreshTokenHash');
    });

    it('rejects a refresh token used as an access token', async () => {
      const { refreshToken } = (await login(emailOf('hr'))).body;
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });
  });

  describe('POST /auth/register (ADMIN only)', () => {
    const payload = () => ({
      email: emailOf('created'),
      password: 'a-strong-password',
      role: Role.Manager,
    });

    it('answers 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload())
        .expect(401);
    });

    it('answers 403 for a non-admin', async () => {
      const { accessToken } = (await login(emailOf('hr'))).body;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload())
        .expect(403);
    });

    it('creates the account for an admin, then answers 409 on a duplicate', async () => {
      const { accessToken } = (await login(emailOf('admin'))).body;
      const send = () =>
        request(app.getHttpServer())
          .post('/api/auth/register')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payload());

      const { body } = await send().expect(201);
      expect(body).toMatchObject({ email: emailOf('created'), role: Role.Manager });
      expect(body).not.toHaveProperty('passwordHash');

      await send().expect(409);
      await login(emailOf('created'), 'a-strong-password').expect(200);
    });

    it('rejects a weak password and an unknown role with 400', async () => {
      const { accessToken } = (await login(emailOf('admin'))).body;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...payload(), password: 'short' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...payload(), role: 'SUPERUSER' })
        .expect(400);
    });
  });

  describe('refresh and logout', () => {
    it('rotates tokens and revokes the session when an old token is replayed', async () => {
      const first = (await login(emailOf('hr'))).body;
      const second = (
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: first.refreshToken })
          .expect(200)
      ).body;
      expect(second.refreshToken).not.toBe(first.refreshToken);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      // The replay revoked the whole session, including the latest token.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: second.refreshToken })
        .expect(401);
    });

    it('invalidates the refresh token on logout', async () => {
      const { accessToken, refreshToken } = (await login(emailOf('hr'))).body;
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('answers 401 on logout without a token', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });
  });
});

describe('Login throttling (e2e)', () => {
  it('answers 429 after too many attempts', async () => {
    const app = await createTestApp({ throttling: true });
    try {
      const attempt = () =>
        request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'nobody@e2e.test', password: 'wrong-password' });

      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        statuses.push((await attempt()).status);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses.slice(5)).toEqual([429, 429]);
    } finally {
      await app.close();
    }
  });
});

