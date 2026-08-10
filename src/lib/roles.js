const ROLES = ['viewer', 'editor', 'admin'];
const ROLE_LEVEL = { viewer: 0, editor: 1, admin: 2 };

function roleAtLeast(role, minRole) {
  const level = ROLE_LEVEL[role];
  return level !== undefined && level >= ROLE_LEVEL[minRole];
}

module.exports = { ROLES, ROLE_LEVEL, roleAtLeast };
