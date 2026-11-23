import { HttpsError } from 'firebase-functions/v2/https';

export type DraftSection = 'basic' | 'personal' | 'religious' | 'location' | 'professional' | 'additional' | 'interests' | 'consent' | 'details' | 'preferences' | 'photos' | 'privacy' | 'notifications' | 'complete';

export function assertNonEmptyString(val: unknown, field: string, maxLen = 200): string {
  if (typeof val !== 'string' || !val.trim()) {
    throw new HttpsError('invalid-argument', `${field} must be a non-empty string.`);
  }
  const trimmed = val.trim();
  if (trimmed.length > maxLen) {
    throw new HttpsError('invalid-argument', `${field} exceeds maximum length of ${maxLen}.`);
  }
  return trimmed;
}

export function optionalString(val: unknown, maxLen = 500): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val !== 'string') {
    throw new HttpsError('invalid-argument', 'Expected string value.');
  }
  return val.trim().slice(0, maxLen);
}

export function optionalEditableString(val: unknown, maxLen = 500): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') {
    throw new HttpsError('invalid-argument', 'Expected string value.');
  }
  return val.trim().slice(0, maxLen);
}

export function optionalNumber(val: unknown, min: number, max: number, field: string): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new HttpsError('invalid-argument', `${field} must be between ${min} and ${max}.`);
  }
  return Math.round(num);
}

export function optionalBoolean(val: unknown): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  return Boolean(val);
}

export function optionalStringArray(val: unknown, maxItems = 20, maxItemLen = 80): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .slice(0, maxItems)
    .map((v) => v.trim().slice(0, maxItemLen));
}

export function validateDraftSection(section: unknown): DraftSection {
  if (
    section === 'basic' ||
    section === 'personal' ||
    section === 'religious' ||
    section === 'location' ||
    section === 'professional' ||
    section === 'additional' ||
    section === 'interests' ||
    section === 'consent' ||
    section === 'details' ||
    section === 'preferences' ||
    section === 'photos' ||
    section === 'privacy' ||
    section === 'notifications' ||
    section === 'complete'
  ) {
    return section;
  }
  throw new HttpsError('invalid-argument', 'Invalid draft section.');
}

export function sanitizePhotoStoragePath(pathVal: unknown, uid: string): string | undefined {
  if (typeof pathVal !== 'string' || !pathVal.trim()) return undefined;
  const trimmed = pathVal.trim();
  // Accept either a path inside the matrimony bucket owned by uid, or the member's existing photoURL
  if (trimmed.startsWith(`photos/${uid}/`)) {
    return trimmed;
  }
  if (trimmed.startsWith('https://firebasestorage.googleapis.com/') || trimmed.startsWith('https://storage.googleapis.com/')) {
    return trimmed;
  }
  throw new HttpsError('invalid-argument', 'Invalid photo reference.');
}
