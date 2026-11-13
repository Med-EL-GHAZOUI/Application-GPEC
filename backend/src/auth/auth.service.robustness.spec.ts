import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/enums/role.enum.js';
import type { AppConfig } from '../config/configuration.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const jwtConfig = {
  accessSecret: 'a'.repeat(32),
  refreshSecret: 'b'.repeat(32),
  accessTtl: '15m',
  refreshTtl: '7d',
};

const build = (user: object | null) => {
  const usersService = {
    findByEmail: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    setRefreshTokenHash: vi.fn().mockResolvedValue(undefined),
  };
  const config = { get: () => jwtConfig } as unknown as ConfigService<
    AppConfig,
    true
  >;
  const service = new AuthService(
    usersService as unknown as UsersService,
    new JwtService({}),
    config,
  );
  return { service, usersService };
};

describe('AuthService robustness', () => {
  it('answers 401, not 500, when the stored password hash is corrupted', async () => {
    const { service } = build({
      id: 'user-1',
      email: 'hr@company.com',
      passwordHash: 'not-an-argon2-hash',
      role: Role.Hr,
      isActive: true,
    });

    await expect(
      service.login({ email: 'hr@company.com', password: 'whatever-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 401 when the stored refresh token hash is corrupted, and keeps the session closed', async () => {
    const refreshToken = await new JwtService({}).signAsync(
      { sub: 'user-1', email: 'hr@company.com', role: Role.Hr },
      { secret: jwtConfig.refreshSecret, expiresIn: '1h' },
    );
    const corrupted = {
      id: 'user-1',
      isActive: true,
      refreshTokenHash: 'garbage',
    };
    const { service: withUser, usersService } = build(corrupted);

    await expect(withUser.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
      'user-1',
      null,
    );
  });

  it('answers 401 from /auth/me when the account no longer exists', async () => {
    const { service } = build(null);

    await expect(service.me('ghost')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
