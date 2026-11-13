import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum.js';
import type { User } from '../entities/user.entity.js';

/** Public representation of a user: never exposes hashes. */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
