/**
 * Canonical phone number normalization and guest-classification utilities.
 * Ensures a single unique phone identity per church across members, guests,
 * invitations, and attendance records.
 */

export const stripGuestSuffix = (name?: string | null): string => {
  if (!name) return '';
  return String(name).replace(/\s*\(guest\)\s*$/i, '').trim();
};

export const extractDigits = (raw?: string | null): string => {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '');
};

/**
 * Extracts the canonical 10-digit phone key used for per-church indexing.
 * Returns empty string when fewer than 10 digits are present.
 */
export const normalizePhone10 = (raw?: string | null): string => {
  const digits = extractDigits(raw);
  if (digits.length < 10) return '';
  return digits.slice(-10);
};

export const isValidPhone10 = (raw?: string | null): boolean => {
  return normalizePhone10(raw).length === 10;
};

/**
 * Formats a phone number into canonical E.164 format.
 * Defaults to +91 for 10-digit numbers matching existing app conventions,
 * while preserving explicit international country prefixes when entered.
 */
export const formatPhoneE164 = (
  raw?: string | null,
  defaultCountryCode = '+91'
): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  const digits = extractDigits(trimmed);
  if (!digits) return '';

  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (trimmed.startsWith('+') && digits.length >= 10) {
    return `+${digits}`;
  }

  if (digits.length > 10) {
    return `${defaultCountryCode}${digits.slice(-10)}`;
  }

  return trimmed;
};

/**
 * Generates common phone string formats for Firestore equality / `in` queries.
 * Capped to 8 unique variants to stay within Firestore `in` query limits.
 */
export const getPhoneVariants = (raw?: string | null): string[] => {
  const variants = new Set<string>();
  const trimmed = String(raw || '').trim();
  if (trimmed) variants.add(trimmed);

  const e164 = formatPhoneE164(raw);
  if (e164) variants.add(e164);

  const last10 = normalizePhone10(raw);
  if (last10) {
    variants.add(last10);
    variants.add(`+91${last10}`);
    variants.add(`91${last10}`);
    variants.add(`0${last10}`);
    variants.add(`+91 ${last10}`);
    variants.add(`${last10.slice(0, 5)} ${last10.slice(5)}`);
  }

  return Array.from(variants).filter(Boolean).slice(0, 8);
};

export const phonesMatch = (
  a?: string | null,
  b?: string | null
): boolean => {
  const nA = normalizePhone10(a);
  const nB = normalizePhone10(b);
  if (nA && nB) return nA === nB;

  const tA = String(a || '').trim();
  const tB = String(b || '').trim();
  return Boolean(tA && tB && tA === tB);
};

export const isGuestMemberDoc = (
  doc?: {
    userType?: string | null;
    isGuest?: boolean | null;
    role?: string | null;
  } | null
): boolean => {
  if (!doc) return false;
  const userType = String(doc.userType || '').trim().toLowerCase();
  // Explicit full member / admin classifications never downgrade to guest.
  if (
    userType === 'member' ||
    userType === 'admin' ||
    userType === 'super admin'
  ) {
    return false;
  }
  const role = String(doc.role || '').trim().toLowerCase();
  if (role === 'admin' || role === 'super admin') {
    return false;
  }
  return doc.isGuest === true || userType === 'guest' || role === 'guest';
};

