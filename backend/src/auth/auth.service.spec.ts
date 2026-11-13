import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '../common/enums/role.enum.js';
import type { AppConfig } from '../config/configuration.js';
import type { User } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const PASSWORD = 'correct-horse-battery';

const jwtConfig = {
  accessSecret: 'a'.repeat(32),
  refreshSecret: 'b'.repeat(32),
  accessTtl: '15m',
  refreshTtl: '7d',
};

const buildUser = async (overrides: Partial<User> = {}): Promise<User> =>
  ({
    id: 'user-1',
    email: 'hr@company.com',
    passwordHash: await argon2.hash(PASSWORD),
    role: Role.Hr,
    isActive: true,
    refreshTokenHash: null,
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let user: User;
  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    setRefreshTokenHash: ReturnType<typeof vi.fn>;
  };
  let service: AuthService;

  beforeEach(async () => {
    user = await buildUser();
    // Minimal in-memory persistence of the refresh token hash.
    usersService = {
      findByEmail: vi.fn(async (email: string) =>
        email === user.email ? user : null,
      ),
      findById: vi.fn(async (id: string) => (id === user.id ? user : null)),
      create: vi.fn(),
      setRefreshTokenHash: vi.fn(async (_id: string, hash: string | null) => {
        user.refreshTokenHash = hash;
      }),
    };
    const config = { get: () => jwtConfig } as unknown as ConfigService<
      AppConfig,
      true
    >;
    service = new AuthService(
      usersService as unknown as UsersService,
      new JwtService({}),
      config,
    );
  });

  describe('login', () => {
    it('returns tokens and stores only a hash of the refresh token', async () => {
      const tokens = await service.login({
        email: user.email,
        password: PASSWORD,
      });

      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(tokens.refreshToken).toEqual(expect.any(String));
      expect(user.refreshTokenHash).not.toBeNull();
      expect(user.refreshTokenHash).not.toBe(tokens.refreshToken);
      await expect(
        argon2.verify(user.refreshTokenHash!, tokens.refreshToken),
      ).resolves.toBe(true);
    });

    it('rejects a wrong password', async () => {
      await expect(
        service.login({ email: user.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same error as a wrong password', async () => {
      const unknown = service.login({
        email: 'nobody@company.com',
        password: PASSWORD,
      });
      await expect(unknown).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(unknown).rejects.toThrow('Invalid credentials');
    });

    it('rejects a disabled account with 403 once the password is verified', async () => {
      user.isActive = false;
      await expect(
        service.login({ email: user.email, password: PASSWORD }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      const first = await service.login({
        email: user.email,
        password: PASSWORD,
      });
      const second = await service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      await expect(
        argon2.verify(user.refreshTokenHash!, second.refreshToken),
      ).resolves.toBe(true);
    });

    it('revokes the session when an already rotated token is replayed', async () => {
      const first = await service.login({
        email: user.email,
        password: PASSWORD,
      });
      await service.refresh(first.refreshToken);

      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(user.refreshTokenHash).toBeNull();
    });

    it('rejects a token that is not a valid JWT', async () => {
      await expect(service.refresh('garbage')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an access token used as a refresh token', async () => {
      const { accessToken } = await service.login({
        email: user.email,
        password: PASSWORD,
      });
      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a refresh after logout', async () => {
      const { refreshToken } = await service.login({
        email: user.email,
        password: PASSWORD,
      });
      await service.logout(user.id);

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a refresh for a disabled account', async () => {
      const { refreshToken } = await service.login({
        email: user.email,
        password: PASSWORD,
      });
      user.isActive = false;

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      await service.login({ email: user.email, password: PASSWORD });
      await service.logout(user.id);
      expect(user.refreshTokenHash).toBeNull();
    });
  });

  describe('register', () => {
    it('never returns the password hash', async () => {
      usersService.create.mockResolvedValue(user);
      const result = await service.register({
        email: user.email,
        password: PASSWORD,
        role: Role.Hr,
      });

      expect(result).toEqual({
        id: user.id,
        email: user.email,
        role: Role.Hr,
        isActive: true,
      });
      expect(result).not.toHaveProperty('passwordHash');
    });
  });
});
