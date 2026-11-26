/**
 * Helpers for validating, normalizing, and classifying RegistrationRequest
 * documents across Auth/ApprovalPending and AdminRegistrationApprovals.
 */

export function normalizeRegistrationDocId(requestIdOrPhone?: string): string {
  const raw = String(requestIdOrPhone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Indian/international phone numbers map to the canonical 10-digit doc ID
  if (digits.length >= 10 && /^[+\d\s()-]+$/.test(raw)) {
    return digits.slice(-10);
  }
  return raw;
}

/**
 * Detects corrupt empty token-only stub docs (e.g. docs containing only
 * `fcmToken` / `authUid` with no `status` and no applicant identity/timestamp fields).
 * Legitimate registration requests always carry `status` or applicant identity fields.
 */
export function isEmptyGhostRegistrationRequest(req: any): boolean {
  if (!req || typeof req !== 'object') return true;
  const hasStatus = Boolean(String(req.status || '').trim());
  const fullName = String(req.fullName || '').trim();
  const firstName = String(req.firstName || '').trim();
  const lastName = String(req.lastName || '').trim();
  const phone = String(req.phone || '').trim();
  const email = String(req.email || '').trim();
  const city = String(req.city || req.village || '').trim();
  const createdAt = String(req.createdAt || '').trim();

  return (
    !hasStatus &&
    !fullName &&
    !firstName &&
    !lastName &&
    !phone &&
    !email &&
    !city &&
    !createdAt
  );
}

/**
 * Canonical status classification matching AdminRegistrationApprovals tabs
 * so pending/unspecified records never render as REJECTED inside the Pending tab.
 */
export function resolveRegistrationDisplayStatus(
  status?: string
): 'pending' | 'approved' | 'rejected' {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  return 'pending';
}
