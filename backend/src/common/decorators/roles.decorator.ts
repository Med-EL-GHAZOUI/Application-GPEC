import { SetMetadata } from '@nestjs/common';
import type { Role } from '../enums/role.enum.js';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. No decorator = any authenticated user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
