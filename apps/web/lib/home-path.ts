import type { Role } from '@bookleaf/shared';

const HOME_PATHS: Record<Role, string> = {
  AUTHOR: '/books',
  ADMIN: '/admin',
};

export function homePath(role: Role) {
  return HOME_PATHS[role];
}
