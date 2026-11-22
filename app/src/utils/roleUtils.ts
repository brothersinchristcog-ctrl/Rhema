/**
 * Shared role helpers for platform and church-level permission checks.
 */

export function isSuperAdminMember(
  member?: any,
  isPlatformSuperAdmin?: boolean
): boolean {
  if (isPlatformSuperAdmin) return true;
  if (!member) return false;
  const roleText = `${member.userType || ''} ${member.role || ''}`.toUpperCase();
  return Boolean(
    member.superadmin === true ||
    member.isSuperAdmin === true ||
    roleText.includes('SUPER')
  );
}
