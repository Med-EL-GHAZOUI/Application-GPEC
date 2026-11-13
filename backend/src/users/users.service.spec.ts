import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '../common/enums/role.enum.js';
import { UsersService } from './users.service.js';

const build = (
  options: { existing?: object | null; saveError?: unknown } = {},
) => {
  const users = {
    findOne: vi.fn().mockResolvedValue(options.existing ?? null),
    create: vi.fn((data: object) => data),
    save: vi.fn(async (row: object) => {
      if (options.saveError) {
        throw options.saveError;
      }
      return { id: 'user-1', ...row };
    }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new UsersService(users as never), users };
};

const input = {
  email: '  New.User@Company.com '.trim(),
  password: 'a-strong-password',
  role: Role.Hr,
};

describe('UsersService.create', () => {
  it('stores a lower-cased email and an Argon2 hash, never the password', async () => {
    const { service, users } = build();

    await service.create(input);

    const saved = users.save.mock.calls[0][0];
    expect(saved.email).toBe('new.user@company.com');
    expect(saved.passwordHash).not.toBe(input.password);
    await expect(
      argon2.verify(saved.passwordHash, input.password),
    ).resolves.toBe(true);
    expect(saved.refreshTokenHash).toBeNull();
  });

  it('refuses an email that already exists (checked before writing)', async () => {
    const { service, users } = build({ existing: { id: 'user-0' } });

    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(users.save).not.toHaveBeenCalled();
  });

  it('turns a unique violation raised by the database into a 409 (concurrent registrations)', async () => {
    const { service } = build({
      saveError: { driverError: { code: '23505' } },
    });

    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lets any other database error through', async () => {
    const { service } = build({ saveError: new Error('connection lost') });

    await expect(service.create(input)).rejects.toThrow('connection lost');
  });
});

describe('UsersService.deactivate', () => {
  it('disables the account and drops its refresh token in one update', async () => {
    const { service, users } = build();

    await service.deactivate('user-1');

    expect(users.update).toHaveBeenCalledWith(
      { id: 'user-1' },
      { isActive: false, refreshTokenHash: null },
    );
  });
});
