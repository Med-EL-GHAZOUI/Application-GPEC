import { RequestMethod, type INestApplication } from '@nestjs/common';
import { DiscoveryService, ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator.js';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator.js';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './create-test-app.js';
import { createSession } from './e2e-helpers.js';

// Requires PostgreSQL (npm run db:up) and a valid backend/.env.
//
// This suite discovers EVERY route of the application from its controllers and
// checks the access rules route by route. A new endpoint that is public by
// mistake, or whose roles are not the documented ones, fails here.
const suffix = randomUUID().slice(0, 8);
const emailOf = (name: string) => `${name}-${suffix}@e2e.test`;
const NIL_ID = '00000000-0000-4000-8000-000000000000';
const ALL_ROLES = [Role.Admin, Role.Hr, Role.Manager, Role.Employee];

const METHODS: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

type RouteInfo = {
  method: string;
  /** Nest template, e.g. /api/employees/:id */
  template: string;
  isPublic: boolean;
  roles: Role[] | undefined;
};

const join = (...parts: string[]) =>
  '/' +
  parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

/** Every HTTP handler of every controller, with its access metadata. */
const discoverRoutes = (app: INestApplication): RouteInfo[] => {
  const routes: RouteInfo[] = [];

  for (const wrapper of new DiscoveryService(
    app.get(ModulesContainer),
  ).getControllers()) {
    const controller = wrapper.metatype;
    if (!controller) {
      continue;
    }
    const base: string = Reflect.getMetadata('path', controller) ?? '';

    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      const method =
        typeof handler === 'function'
          ? Reflect.getMetadata('method', handler)
          : undefined;
      if (method === undefined) {
        continue;
      }
      const path: string = Reflect.getMetadata('path', handler) ?? '';

      routes.push({
        method: METHODS[method],
        template: join('api', base, path),
        isPublic: Boolean(
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) ??
          Reflect.getMetadata(IS_PUBLIC_KEY, controller),
        ),
        roles: (Reflect.getMetadata(ROLES_KEY, handler) ??
          Reflect.getMetadata(ROLES_KEY, controller)) as Role[] | undefined,
      });
    }
  }
  return routes.sort((a, b) =>
    `${a.template} ${a.method}`.localeCompare(`${b.template} ${b.method}`),
  );
};

const keyOf = (route: RouteInfo) => `${route.method} ${route.template}`;
const urlOf = (route: RouteInfo) => route.template.replace(/:\w+/g, NIL_ID);

/** The documented access rules (Phase 3 matrix): every restricted route, with its roles. */
const RESTRICTED: Record<string, Role[]> = {
  'POST /api/auth/register': [Role.Admin],

  'POST /api/departments': [Role.Admin, Role.Hr],
  'PATCH /api/departments/:id': [Role.Admin, Role.Hr],
  'DELETE /api/departments/:id': [Role.Admin, Role.Hr],

  'POST /api/skills': [Role.Admin, Role.Hr],
  'PATCH /api/skills/:id': [Role.Admin, Role.Hr],
  'DELETE /api/skills/:id': [Role.Admin, Role.Hr],

  'POST /api/positions': [Role.Admin, Role.Hr],
  'PATCH /api/positions/:id': [Role.Admin, Role.Hr],
  'DELETE /api/positions/:id': [Role.Admin, Role.Hr],
  'POST /api/positions/:id/skills': [Role.Admin, Role.Hr],
  'PATCH /api/positions/:id/skills/:skillId': [Role.Admin, Role.Hr],
  'DELETE /api/positions/:id/skills/:skillId': [Role.Admin, Role.Hr],

  'GET /api/employees': [Role.Admin, Role.Hr, Role.Manager],
  'POST /api/employees': [Role.Admin, Role.Hr],
  'PATCH /api/employees/:id': [Role.Admin, Role.Hr],
  'DELETE /api/employees/:id': [Role.Admin, Role.Hr],

  'PUT /api/employees/:employeeId/skills/:skillId': [Role.Hr, Role.Manager],
  'DELETE /api/employees/:employeeId/skills/:skillId': [Role.Admin, Role.Hr],
  'POST /api/evaluations': [Role.Hr, Role.Manager],

  'POST /api/trainings': [Role.Admin, Role.Hr],
  'PATCH /api/trainings/:id': [Role.Admin, Role.Hr],
  'DELETE /api/trainings/:id': [Role.Admin, Role.Hr],
  'GET /api/trainings/:id/enrollments': [Role.Admin, Role.Hr],
  'POST /api/trainings/:id/enrollments': [Role.Admin, Role.Hr],
  'PATCH /api/trainings/:id/enrollments/:employeeId': [Role.Admin, Role.Hr],

  'GET /api/employees/:employeeId/training-recommendations': [
    Role.Admin,
    Role.Hr,
    Role.Manager,
  ],
  'GET /api/dashboard': [Role.Admin, Role.Hr, Role.Manager],
  'GET /api/dashboard/skills-evolution': [Role.Admin, Role.Hr, Role.Manager],
};

const PUBLIC = [
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
];

describe('Permissions across every route (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let routes: RouteInfo[];
  const tokens = {} as Record<Role, string>;

  const call = (route: RouteInfo, token?: string) => {
    const server = request(app.getHttpServer());
    const url = urlOf(route);
    const builder = {
      GET: () => server.get(url),
      POST: () => server.post(url),
      PUT: () => server.put(url),
      PATCH: () => server.patch(url),
      DELETE: () => server.delete(url),
    }[route.method]!();
    if (token) {
      builder.set('Authorization', `Bearer ${token}`);
    }
    return ['GET', 'DELETE'].includes(route.method)
      ? builder
      : builder.send({});
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    routes = discoverRoutes(app);
    for (const role of ALL_ROLES) {
      tokens[role] = (
        await createSession(app, emailOf(role.toLowerCase()), role)
      ).token;
    }
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      `%${suffix}%`,
    ]);
    await app.close();
  });

  describe('Inventory', () => {
    it('discovers the routes of every module', () => {
      expect(routes.length).toBeGreaterThanOrEqual(50);
      const resources = new Set(
        routes.map((route) => route.template.split('/')[2]),
      );
      for (const resource of [
        'auth',
        'departments',
        'skills',
        'positions',
        'employees',
        'evaluations',
        'trainings',
        'dashboard',
        'health',
      ]) {
        expect(resources).toContain(resource);
      }
    });

    it('exposes exactly three public routes: login, refresh and health', () => {
      expect(
        routes
          .filter((route) => route.isPublic)
          .map(keyOf)
          .sort(),
      ).toEqual([...PUBLIC].sort());
    });

    it('restricts to roles exactly the routes of the documented matrix, with the documented roles', () => {
      const actual = Object.fromEntries(
        routes
          .filter((route) => route.roles && !route.isPublic)
          .map((route) => [keyOf(route), [...route.roles!].sort()]),
      );
      const documented = Object.fromEntries(
        Object.entries(RESTRICTED).map(([key, roles]) => [
          key,
          [...roles].sort(),
        ]),
      );
      expect(actual).toEqual(documented);
    });
  });

  describe('Authentication', () => {
    it('rejects every non-public route without a token (401)', async () => {
      for (const route of routes.filter((item) => !item.isPublic)) {
        const { status } = await call(route);
        expect(status, keyOf(route)).toBe(401);
      }
    });

    it('rejects every non-public route with an invalid token (401)', async () => {
      for (const route of routes.filter((item) => !item.isPublic)) {
        const { status } = await call(route, 'not.a.valid-token');
        expect(status, keyOf(route)).toBe(401);
      }
    });

    it('lets the public routes answer without a token', async () => {
      for (const route of routes.filter((item) => item.isPublic)) {
        const { status } = await call(route);
        expect(status, keyOf(route)).not.toBe(401);
        expect(status, keyOf(route)).not.toBe(403);
      }
    });
  });

  describe('Authorization', () => {
    it('answers 403 to every role that a restricted route does not list', async () => {
      for (const route of routes.filter(
        (item) => item.roles && !item.isPublic,
      )) {
        for (const role of ALL_ROLES.filter(
          (candidate) => !route.roles!.includes(candidate),
        )) {
          const { status } = await call(route, tokens[role]);
          expect(status, `${role} on ${keyOf(route)}`).toBe(403);
        }
      }
    });

    it('never answers 401 or 403 to the ADMIN or HR role on a route that lists it', async () => {
      // With a nil identifier and an empty body, the route answers 400, 404 or 200: never an access error.
      for (const route of routes.filter(
        (item) => item.roles && !item.isPublic,
      )) {
        for (const role of [Role.Admin, Role.Hr].filter((candidate) =>
          route.roles!.includes(candidate),
        )) {
          const { status } = await call(route, tokens[role]);
          expect(status, `${role} on ${keyOf(route)}`).not.toBe(401);
          expect(status, `${role} on ${keyOf(route)}`).not.toBe(403);
        }
      }
    });

    it('accepts a valid token of any role on the routes open to every authenticated user', async () => {
      for (const route of routes.filter(
        (item) => !item.roles && !item.isPublic,
      )) {
        for (const role of ALL_ROLES) {
          const { status } = await call(route, tokens[role]);
          expect(status, `${role} on ${keyOf(route)}`).not.toBe(401);
        }
      }
    });

    it('keeps role-restricted routes closed to an employee, whatever the payload', async () => {
      const route = routes.find(
        (item) => keyOf(item) === 'POST /api/auth/register',
      )!;
      const { status } = await request(app.getHttpServer())
        .post(urlOf(route))
        .set('Authorization', `Bearer ${tokens[Role.Employee]}`)
        .send({
          email: emailOf('sneaky'),
          password: 'a-strong-password',
          role: Role.Admin,
        });
      expect(status).toBe(403);
    });
  });

  describe('API documentation', () => {
    it('documents every route, and marks exactly the non-public ones as requiring a bearer token', () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('GPEC API').addBearerAuth().build(),
      );

      for (const route of routes) {
        const documentedPath = route.template.replace(/:(\w+)/g, '{$1}');
        const operation = (
          document.paths[documentedPath] as Record<string, any> | undefined
        )?.[route.method.toLowerCase()];
        expect(
          operation,
          `${keyOf(route)} is missing from the OpenAPI document`,
        ).toBeDefined();

        const requiresToken = (operation.security ?? []).some(
          (entry: object) => 'bearer' in entry,
        );
        expect(requiresToken, `${keyOf(route)}: bearer security`).toBe(
          !route.isPublic,
        );
      }
    });
  });
});
