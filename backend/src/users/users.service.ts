import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/database/pg-errors.js';
import { Role } from '../common/enums/role.enum.js';
import { User } from './entities/user.entity.js';

export type CreateUserInput = {
  email: string;
  password: string;
  role: Role;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async create({ email, password, role }: CreateUserInput): Promise<User> {
    const normalizedEmail = email.toLowerCase();
    if (await this.findByEmail(normalizedEmail)) {
      throw new ConflictException('Email already in use');
    }

    const user = this.users.create({
      email: normalizedEmail,
      passwordHash: await argon2.hash(password),
      role,
      isActive: true,
      refreshTokenHash: null,
    });

    try {
      return await this.users.save(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async deactivate(userId: string): Promise<void> {
    await this.users.update(
      { id: userId },
      { isActive: false, refreshTokenHash: null },
    );
  }

  async setRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.users.update({ id: userId }, { refreshTokenHash });
  }
}
