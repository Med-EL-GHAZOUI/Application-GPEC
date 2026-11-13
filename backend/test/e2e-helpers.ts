import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/common/enums/role.enum.js';
import { User } from '../src/users/entities/user.entity.js';

export const E2E_PASSWORD = 'e2e-password-123';

export type TestSession = { userId: string; email: string; token: string };

/** Creates an active account directly in the database, then logs in through the API. */
export const createSession = async (
  app: INestApplication,
  email: string,
  role: Role,
): Promise<TestSession> => {
  const user = await app
    .get(DataSource)
    .getRepository(User)
    .save({
      email,
      passwordHash: await argon2.hash(E2E_PASSWORD),
      role,
      isActive: true,
      refreshTokenHash: null,
    });

  const { body } = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: E2E_PASSWORD })
    .expect(200);

  return { userId: user.id, email, token: body.accessToken as string };
};

/** supertest shortcuts that prefix /api and attach the bearer token. */
export const asUser = (app: INestApplication, token: string) => {
  const server = app.getHttpServer();
  const auth = `Bearer ${token}`;
  return {
    get: (url: string) =>
      request(server).get(`/api${url}`).set('Authorization', auth),
    post: (url: string) =>
      request(server).post(`/api${url}`).set('Authorization', auth),
    put: (url: string) =>
      request(server).put(`/api${url}`).set('Authorization', auth),
    patch: (url: string) =>
      request(server).patch(`/api${url}`).set('Authorization', auth),
    delete: (url: string) =>
      request(server).delete(`/api${url}`).set('Authorization', auth),
  };
};
