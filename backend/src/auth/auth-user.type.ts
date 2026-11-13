import type { Role } from '../common/enums/role.enum.js';

/** Identity attached to a request once the access token is validated. */
export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};
