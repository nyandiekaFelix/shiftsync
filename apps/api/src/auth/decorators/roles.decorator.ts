import { SetMetadata } from '@nestjs/common';
import { Role } from '@shiftsync/shared-types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
