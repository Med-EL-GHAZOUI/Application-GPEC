import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/configuration.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import type { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './auth-user.type.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { TokensResponseDto } from './dto/tokens-response.dto.js';

// Verified when the email is unknown so that response time does not reveal
// whether an account exists. Same algorithm and parameters as real hashes.
const dummyHash = argon2.hash(randomUUID());

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async login({ email, password }: LoginDto): Promise<TokensResponseDto> {
    const user = await this.usersService.findByEmail(email);
    const passwordMatches = await this.verifyHash(
      user?.passwordHash ?? (await dummyHash),
      password,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account disabled');
    }

    return this.issueTokens(user);
  }

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const user = await this.usersService.create(dto);
    return UserResponseDto.from(user);
  }

  async refresh(refreshToken: string): Promise<TokensResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matchesStoredToken = await this.verifyHash(
      user.refreshTokenHash,
      refreshToken,
    );
    if (!matchesStoredToken) {
      // A correctly signed token that is not the current one was already
      // rotated: treat it as theft and revoke the session.
      await this.usersService.setRefreshTokenHash(user.id, null);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return UserResponseDto.from(user);
  }

  private async issueTokens(user: User): Promise<TokensResponseDto> {
    const jwt = this.config.get('jwt', { infer: true });
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwt.accessSecret,
        expiresIn: jwt.accessTtl as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(payload, {
        secret: jwt.refreshSecret,
        expiresIn: jwt.refreshTtl as JwtSignOptions['expiresIn'],
        jwtid: randomUUID(),
      }),
    ]);

    await this.usersService.setRefreshTokenHash(
      user.id,
      await argon2.hash(refreshToken),
    );

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('jwt', { infer: true }).refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async verifyHash(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
