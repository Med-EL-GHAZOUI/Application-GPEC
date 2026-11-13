import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { RolesGuard } from './roles.guard.js';

type Metadata = { isPublic?: boolean; roles?: Role[] };

const setup = (metadata: Metadata, userRole?: Role) => {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
    key === IS_PUBLIC_KEY
      ? metadata.isPublic
      : key === ROLES_KEY
        ? metadata.roles
        : undefined,
  );
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: userRole ? { role: userRole } : undefined }),
    }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
};

describe('RolesGuard', () => {
  it('lets public routes through', () => {
    const { guard, context } = setup({ isPublic: true, roles: [Role.Admin] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('accepts any authenticated user when no role is required', () => {
    const { guard, context } = setup({}, Role.Employee);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('accepts a user whose role is listed', () => {
    const { guard, context } = setup({ roles: [Role.Admin, Role.Hr] }, Role.Hr);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a user whose role is not listed', () => {
    const { guard, context } = setup({ roles: [Role.Admin] }, Role.Manager);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request without an authenticated user', () => {
    const { guard, context } = setup({ roles: [Role.Admin] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
