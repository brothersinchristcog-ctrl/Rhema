import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Firestore, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, DEFAULT_CHURCH_ID, MATRIMONY_BUCKET } from './constants.js';
import { seedMutualMatchChatOnAccept } from './chat.js';
import {
  getObjectPronoun,
  resolveNotificationPhotoUrl,
  sendMatrimonyNotification,
} from './notifications.js';
import {
  getCurrentMonthKey,
  resolveActiveTierFromProfile,
  resolveMemberEntitlements,
  type ResolvedMemberEntitlements,
} from './entitlements.js';
import {
  assertMatrimonyProfileActive,
  getAdminProfileRef,
  getBlocksCol,
  getPhotoRequestsCol,
  getPrefsRef,
  getPrivateRef,
  getProfileRef,
  getSentPhotoRequestsCol,
  getShortlistedByCol,
  getShortlistsCol,
  getUnlockedContactsCol,
  getUsageRef,
  getViewedByCol,
  getViewsCol,
  readBlockDocs,
  readPrefsSnap,
  readPrivateSnap,
  readShortlistedByDocs,
  readShortlistDocs,
  readViewedByDocs,
  readViewDocs,
} from './store.js';
import { assertNonEmptyString, optionalBoolean, optionalNumber, optionalString } from './validation.js';

function requireAuthUid(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return uid;
}

function buildFirebaseTokenUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

const WARM_PHOTO_URL_CACHE = new Map<string, { url: string; expiresAtMs: number }>();

async function resolveSingleMatchPhotoUrl(
  bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>,
  path: string,
  expires: number
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('https://') || path.startsWith('http://')) {
    return path;
  }
  const now = Date.now();
  const cached = WARM_PHOTO_URL_CACHE.get(path);
  if (cached && cached.expiresAtMs > now + 5 * 60 * 1000) {
    return cached.url;
  }

  const file = bucket.file(path);
  try {
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires });
    WARM_PHOTO_URL_CACHE.set(path, { url: signedUrl, expiresAtMs: expires });
    return signedUrl;
  } catch {
    try {
      const [meta] = await file.getMetadata();
      const existingTokens = String(meta?.metadata?.firebaseStorageDownloadTokens || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      let token = existingTokens[0];
      if (!token) {
        token = randomUUID();
        await file.setMetadata({
          metadata: {
            ...(meta?.metadata || {}),
            firebaseStorageDownloadTokens: token,
          },
        });
      }
      const tokenUrl = buildFirebaseTokenUrl(MATRIMONY_BUCKET, path, token);
      WARM_PHOTO_URL_CACHE.set(path, { url: tokenUrl, expiresAtMs: expires });
      return tokenUrl;
    } catch (metaErr) {
      console.warn(`Unable to sign/tokenize match photo ${path}:`, metaErr);
      return null;
    }
  }
}

async function batchGetDocMap(
  db: Firestore,
  refs: DocumentReference[]
): Promise<Map<string, DocumentSnapshot>> {
  const out = new Map<string, DocumentSnapshot>();
  if (refs.length === 0) return out;
  const CHUNK = 200;
  const chunks: DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += CHUNK) {
    chunks.push(refs.slice(i, i + CHUNK));
  }
  const chunkResults = await Promise.all(chunks.map((c) => db.getAll(...c)));
  chunkResults.forEach((snaps) => {
    snaps.forEach((s) => {
      out.set(s.ref.path, s);
    });
  });
  return out;
}

interface WarmViewerFeedEntry {
  expiresAtMs: number;
  viewer: Record<string, any>;
  viewerPrivate: Record<string, any>;
  viewerEntitlements: ResolvedMemberEntitlements;
  unlockedContactSet: Set<string>;
  lockedAdvancedFilters: boolean;
  totalMatchedCount: number;
  totalAvailableCount: number;
  hiddenCount: number;
  viewerGender: BinaryGender;
  targetGender: BinaryGender;
  viewerPhoto: string | null;
  viewerPreferencesFilter: Record<string, any>;
  preferencesUpdatedAtMs: number;
  photoRequestStatusMap?: Map<string, 'pending' | 'approved' | 'declined'>;
  validScored: any[];
}

const WARM_VIEWER_FEED_CACHE = new Map<string, WarmViewerFeedEntry>();

async function resolveMatchPhotoUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const bucket = getStorage().bucket(MATRIMONY_BUCKET);
  const expires = Date.now() + 60 * 60 * 1000;
  const resolved = await Promise.all(
    paths.map((p) => resolveSingleMatchPhotoUrl(bucket, p, expires))
  );
  return resolved.filter((u): u is string => Boolean(u));
}

type BinaryGender = 'male' | 'female';

export function normalizeGender(raw: unknown): BinaryGender | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'male' || s === 'm' || s === 'man' || s === 'groom' || s === 'boy') {
    return 'male';
  }
  if (s === 'female' || s === 'f' || s === 'woman' || s === 'bride' || s === 'girl') {
    return 'female';
  }
  return null;
}

function normalizeMarital(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === "doesn't matter" || s === 'any') return 'any';
  if (s === 'single' || s === 'unmarried' || s === 'never married') return 'never married';
  return s;
}

export function normalizeAnyOption(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'any' || s === 'any division' || s === "doesn't matter" || s === 'not specified') {
    return 'any';
  }
  return s;
}

function flattenInterests(interestsObj: Record<string, any> | undefined): string[] {
  if (!interestsObj || typeof interestsObj !== 'object') return [];
  const keys = ['hobbies', 'music', 'reading', 'movies', 'sports', 'food', 'languages'];
  const items: string[] = [];
  for (const k of keys) {
    const arr = interestsObj[k];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const clean = String(item || '').trim();
        if (clean) items.push(clean);
      }
    }
  }
  return items;
}

export function toTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val._seconds === 'number') return val._seconds * 1000;
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  if (val instanceof Date) return val.getTime();
  return 0;
}

interface FilterInput {
  minAge?: number | undefined;
  maxAge?: number | undefined;
  minHeightCm?: number | undefined;
  maxHeightCm?: number | undefined;
  profileCreatedBy?: string | undefined;
  maritalStatus?: string | undefined;
  motherTongue?: string | undefined;
  physicalStatus?: string | undefined;
  baptized?: string | undefined;
  baptizedOnly?: boolean | undefined;
  denomination?: string | undefined;
  division?: string | undefined;
  occupation?: string | undefined;
  annualIncome?: string | undefined;
  employmentType?: string | undefined;
  education?: string[] | undefined;
  nearbyProfiles?: boolean | undefined;
  sameCity?: boolean | undefined;
  sameState?: boolean | undefined;
  country?: string | undefined;
  state?: string | undefined;
  city?: string | undefined;
  eatingHabits?: string | undefined;
  drinkingHabits?: string | undefined;
  smokingHabits?: string | undefined;
  familyStatus?: string | undefined;
  familyType?: string | undefined;
  familyValues?: string | undefined;
  createdWithin?: 'all' | 'today' | '3d' | '1w' | '1m' | undefined;
  mutualMatchesOnly?: boolean | undefined;
  withPhotoOnly?: boolean | undefined;
  sharedInterestsOnly?: boolean | undefined;
}

interface ScoreEvaluation {
  eligible: boolean;
  score: number;
  sharedInterests: string[];
  matchReasons: string[];
  breakdown: {
    ageScore: number;
    educationScore: number;
    interestsScore: number;
    heightScore: number;
    maritalScore: number;
    familyScore: number;
    faithScore: number;
    careerScore: number;
    locationScore: number;
    lifestyleScore: number;
    additionalScore: number;
    habitsScore: number;
  };
}

const EDUCATION_CLUSTERS: string[][] = [
  ['b.tech', 'b.e', 'm.tech', 'm.e', 'engineering', 'computer', 'mca', 'bca', 'b.sc it', 'm.sc it', 'software'],
  ['mbbs', 'md', 'ms ', 'bds', 'mds', 'bams', 'bhms', 'medical', 'doctor', 'mha', 'nursing', 'pharma'],
  ['mba', 'bba', 'pgdm', 'b.com', 'm.com', 'ca', 'cma', 'cs', 'finance', 'management', 'business'],
  ['b.sc', 'm.sc', 'b.a', 'm.a', 'ph.d', 'phd', 'science', 'arts', 'b.ed', 'm.ed'],
];

const PROFESSION_CLUSTERS: string[][] = [
  ['software', 'developer', 'engineer', 'it ', 'programmer', 'architect', 'qa', 'quality assurance', 'data', 'tech', 'analyst'],
  ['doctor', 'physician', 'surgeon', 'dentist', 'nurse', 'medical', 'pharmacist', 'healthcare', 'hospital'],
  ['business', 'entrepreneur', 'owner', 'founder', 'manager', 'director', 'executive', 'consultant'],
  ['teacher', 'professor', 'lecturer', 'faculty', 'educator', 'principal'],
  ['bank', 'finance', 'accountant', 'chartered accountant', 'auditor', 'investment'],
  ['government', 'civil', 'ias', 'ips', 'officer', 'defence', 'army', 'navy'],
  ['pastor', 'minister', 'missionary', 'evangelist', 'theologian'],
];

function findClusterIndex(raw: unknown, clusters: string[][]): number {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return -1;
  return clusters.findIndex((keywords) => keywords.some((kw) => s.includes(kw)));
}

export function areEducationsClose(aRaw: unknown, bRaw: unknown): 'exact' | 'close' | 'none' {
  const a = String(aRaw || '').trim().toLowerCase();
  const b = String(bRaw || '').trim().toLowerCase();
  if (!a || !b) return 'none';
  if (a === b || a.includes(b) || b.includes(a)) return 'exact';
  const ca = findClusterIndex(a, EDUCATION_CLUSTERS);
  const cb = findClusterIndex(b, EDUCATION_CLUSTERS);
  if (ca !== -1 && ca === cb) return 'close';
  return 'none';
}

export function areProfessionsClose(aRaw: unknown, bRaw: unknown): 'exact' | 'close' | 'none' {
  const a = String(aRaw || '').trim().toLowerCase();
  const b = String(bRaw || '').trim().toLowerCase();
  if (!a || !b) return 'none';
  if (a === b || a.includes(b) || b.includes(a)) return 'exact';
  const ca = findClusterIndex(a, PROFESSION_CLUSTERS);
  const cb = findClusterIndex(b, PROFESSION_CLUSTERS);
  if (ca !== -1 && ca === cb) return 'close';
  return 'none';
}

function parseIncomeLakhFloor(raw: unknown): number | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'any' || s === "doesn't matter") return null;
  const nums = s.match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const first = Number(nums[0]);
  if (!Number.isFinite(first)) return null;
  return first;
}

function matchesIncomePref(prefRaw: unknown, actualRaw: unknown): boolean {
  const prefNorm = normalizeAnyOption(prefRaw);
  if (prefNorm === 'any') return true;
  const actualNorm = normalizeAnyOption(actualRaw);
  if (actualNorm === 'any') return false;
  if (actualNorm === prefNorm || actualNorm.includes(prefNorm)) return true;
  const prefFloor = parseIncomeLakhFloor(prefRaw);
  const actualFloor = parseIncomeLakhFloor(actualRaw);
  if (prefFloor !== null && actualFloor !== null) {
    return actualFloor >= prefFloor;
  }
  return false;
}

export function evaluateCompatibility(
  viewer: Record<string, any>,
  viewerPrivate: Record<string, any>,
  viewerPrefs: Record<string, any>,
  candidate: Record<string, any>,
  candidatePrivate: Record<string, any>,
  candidatePrefs: Record<string, any>,
  filters: FilterInput,
  matchBasis: 'partner_preferences' | 'all_filters' = 'partner_preferences'
): ScoreEvaluation {
  const fail: ScoreEvaluation = {
    eligible: false,
    score: 0,
    sharedInterests: [],
    matchReasons: [],
    breakdown: {
      ageScore: 0,
      educationScore: 0,
      interestsScore: 0,
      heightScore: 0,
      maritalScore: 0,
      familyScore: 0,
      faithScore: 0,
      careerScore: 0,
      locationScore: 0,
      lifestyleScore: 0,
      additionalScore: 0,
      habitsScore: 0,
    },
  };

  // 1. Optional UI Filters
  if (
    filters.withPhotoOnly &&
    !candidate.profilePhoto &&
    !(Array.isArray(candidate.gallery) && candidate.gallery.length > 0)
  ) {
    return fail;
  }
  if (filters.baptizedOnly && candidate.faithSummary?.baptized !== true) return fail;

  const baptFilter = normalizeAnyOption(filters.baptized);
  if (baptFilter === 'yes' && candidate.faithSummary?.baptized !== true) return fail;
  if (baptFilter === 'no' && candidate.faithSummary?.baptized !== false) return fail;

  if (normalizeAnyOption(filters.profileCreatedBy) !== 'any') {
    const fCreator = normalizeAnyOption(filters.profileCreatedBy);
    const managedType = String(candidatePrivate?.profileManager?.type || 'self').toLowerCase();
    const isGuardian = managedType === 'guardian';
    if (fCreator === 'self' && isGuardian) return fail;
    if (fCreator.includes('parent') && !isGuardian) return fail;
  }

  if (filters.denomination && normalizeAnyOption(filters.denomination) !== 'any') {
    if (!matchesAnyOrText(filters.denomination, candidate.faithSummary?.denomination)) {
      return fail;
    }
  }
  if (filters.division && normalizeAnyOption(filters.division) !== 'any') {
    if (!matchesAnyOrText(filters.division, candidate.faithSummary?.division)) {
      return fail;
    }
  }
  if (filters.maritalStatus && normalizeMarital(filters.maritalStatus) !== 'any') {
    if (normalizeMarital(candidate.maritalStatus) !== normalizeMarital(filters.maritalStatus)) {
      return fail;
    }
  }
  if (filters.motherTongue && normalizeAnyOption(filters.motherTongue) !== 'any') {
    if (!matchesAnyOrText(filters.motherTongue, candidate.motherTongue)) {
      return fail;
    }
  }
  if (filters.physicalStatus && normalizeAnyOption(filters.physicalStatus) !== 'any') {
    if (!matchesAnyOrText(filters.physicalStatus, candidate.physicalStatus || 'Normal')) {
      return fail;
    }
  }
  if (filters.occupation && normalizeAnyOption(filters.occupation) !== 'any') {
    if (areProfessionsClose(candidate.career?.profession || candidate.career?.occupationCategory, filters.occupation) === 'none') {
      return fail;
    }
  }
  if (filters.employmentType && normalizeAnyOption(filters.employmentType) !== 'any') {
    if (!matchesAnyOrText(filters.employmentType, candidate.career?.employmentType)) {
      return fail;
    }
  }
  if (filters.annualIncome && normalizeAnyOption(filters.annualIncome) !== 'any') {
    const candIncome = candidatePrivate?.incomeDetails?.annualIncomeRange || '';
    if (!matchesIncomePref(filters.annualIncome, candIncome)) {
      return fail;
    }
  }
  if (filters.education && filters.education.length > 0) {
    const candEdu = String(candidate.education?.qualification || '').trim().toLowerCase();
    if (!candEdu) return fail;
    const matchedAnyEdu = filters.education.some((sel) => {
      const s = String(sel || '').trim().toLowerCase();
      if (!s || s === 'any') return true;
      const prefix = (s.split(' - ')[0] || '').trim();
      return (
        candEdu === s ||
        candEdu.includes(prefix) ||
        s.includes(candEdu) ||
        areEducationsClose(candEdu, s) === 'exact'
      );
    });
    if (!matchedAnyEdu) return fail;
  }
  if (filters.country && normalizeAnyOption(filters.country) !== 'any') {
    if (!matchesAnyOrText(filters.country, candidate.location?.country)) {
      return fail;
    }
  }
  if (filters.state && normalizeAnyOption(filters.state) !== 'any') {
    if (!matchesAnyOrText(filters.state, candidate.location?.state)) {
      return fail;
    }
  }
  if (filters.city && normalizeAnyOption(filters.city) !== 'any') {
    const cityTerms = filters.city
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && normalizeAnyOption(s) !== 'any');
    const candCityVal = candidate.location?.village || candidate.location?.city;
    if (
      cityTerms.length > 0 &&
      !cityTerms.some((term) => matchesAnyOrText(term, candCityVal))
    ) {
      return fail;
    }
  }
  if (filters.nearbyProfiles) {
    const vState = normalizeAnyOption(viewer.location?.state);
    const vCity = normalizeAnyOption(viewer.location?.village || viewer.location?.city);
    const cState = normalizeAnyOption(candidate.location?.state);
    const cCity = normalizeAnyOption(candidate.location?.village || candidate.location?.city);
    const sameState = vState !== 'any' && cState !== 'any' && vState === cState;
    const sameCity = vCity !== 'any' && cCity !== 'any' && vCity === cCity;
    if (!sameState && !sameCity) return fail;
  }
  if (filters.sameCity) {
    const vCity = normalizeAnyOption(viewer.location?.village || viewer.location?.city);
    const cCity = normalizeAnyOption(candidate.location?.village || candidate.location?.city);
    if (vCity === 'any' || cCity === 'any' || vCity !== cCity) return fail;
  }
  if (filters.sameState) {
    const vState = normalizeAnyOption(viewer.location?.state);
    const cState = normalizeAnyOption(candidate.location?.state);
    if (vState === 'any' || cState === 'any' || vState !== cState) return fail;
  }
  if (filters.eatingHabits && normalizeAnyOption(filters.eatingHabits) !== 'any') {
    if (!matchesAnyOrText(filters.eatingHabits, candidate.habits?.eatingHabits)) return fail;
  }
  if (filters.drinkingHabits && normalizeAnyOption(filters.drinkingHabits) !== 'any') {
    if (!matchesAnyOrText(filters.drinkingHabits, candidate.habits?.drinkingHabits)) return fail;
  }
  if (filters.smokingHabits && normalizeAnyOption(filters.smokingHabits) !== 'any') {
    if (!matchesAnyOrText(filters.smokingHabits, candidate.habits?.smokingHabits)) return fail;
  }
  if (filters.familyStatus && normalizeAnyOption(filters.familyStatus) !== 'any') {
    if (!matchesAnyOrText(filters.familyStatus, candidate.familySummary?.familyStatus)) return fail;
  }
  if (filters.familyType && normalizeAnyOption(filters.familyType) !== 'any') {
    if (!matchesAnyOrText(filters.familyType, candidate.familySummary?.familyType)) return fail;
  }
  if (filters.familyValues && normalizeAnyOption(filters.familyValues) !== 'any') {
    if (!matchesAnyOrText(filters.familyValues, candidate.familySummary?.familyValues)) return fail;
  }

  // 2. Basic Details & Preferences (Age, Height, Marital Status, Mother Tongue, Physical Status, Have Children)
  const applyPrefHardFilters = matchBasis === 'partner_preferences';
  const cAge = typeof candidate.age === 'number' ? candidate.age : null;
  const vAge = typeof viewer.age === 'number' ? viewer.age : null;
  const prefAgeMin = filters.minAge ?? viewerPrefs?.age?.min ?? 18;
  const prefAgeMax = filters.maxAge ?? viewerPrefs?.age?.max ?? 65;
  const ageImportance = viewerPrefs?.age?.importance || 'preferred';

  if (cAge !== null) {
    if (filters.minAge !== undefined && cAge < filters.minAge) return fail;
    if (filters.maxAge !== undefined && cAge > filters.maxAge) return fail;

    if (applyPrefHardFilters) {
      if (ageImportance === 'essential') {
        if (cAge < prefAgeMin || cAge > prefAgeMax) return fail;
      } else if (cAge < prefAgeMin - 5 || cAge > prefAgeMax + 5) {
        return fail;
      }
    }
  }

  if (applyPrefHardFilters && vAge !== null && candidatePrefs?.age?.importance === 'essential') {
    const cPrefMin = candidatePrefs.age.min ?? 18;
    const cPrefMax = candidatePrefs.age.max ?? 70;
    if (vAge < cPrefMin - 2 || vAge > cPrefMax + 2) return fail;
  }

  const cHeight = typeof candidate.heightCm === 'number' ? candidate.heightCm : null;
  if (cHeight !== null) {
    if (filters.minHeightCm !== undefined && cHeight < filters.minHeightCm) return fail;
    if (filters.maxHeightCm !== undefined && cHeight > filters.maxHeightCm) return fail;
  }
  const minH = filters.minHeightCm ?? viewerPrefs?.height?.minCm ?? 120;
  const maxH = filters.maxHeightCm ?? viewerPrefs?.height?.maxCm ?? 240;
  if (applyPrefHardFilters && viewerPrefs?.height?.importance === 'essential' && cHeight !== null) {
    if (cHeight < minH || cHeight > maxH) return fail;
  }

  const prefMaritals: string[] = Array.isArray(viewerPrefs?.maritalStatuses)
    ? viewerPrefs.maritalStatuses.map(normalizeMarital).filter((m: string) => m !== 'any')
    : [];
  const cMarital = normalizeMarital(candidate.maritalStatus);
  if (
    applyPrefHardFilters &&
    prefMaritals.length > 0 &&
    cMarital !== 'any' &&
    !prefMaritals.includes(cMarital)
  ) {
    return fail;
  }

  // Physical status compulsory check if user specifically selected Normal vs Physically challenged
  const prefPhys = normalizeAnyOption(viewerPrefs?.physicalStatus);
  const candPhys = normalizeAnyOption(candidate.physicalStatus || 'Normal');
  if (applyPrefHardFilters && prefPhys !== 'any' && candPhys !== 'any' && prefPhys !== candPhys) {
    return fail;
  }

  // Have children preference check
  const prefChildren = normalizeAnyOption(viewerPrefs?.haveChildren);
  const candChildren = normalizeAnyOption(candidate.numberOfChildren || 'None');
  if (
    applyPrefHardFilters &&
    prefChildren === 'no' &&
    candChildren !== 'any' &&
    candChildren !== 'none' &&
    candChildren !== 'no'
  ) {
    return fail;
  }

  // Essential education check
  const prefEduList: string[] = Array.isArray(viewerPrefs?.education?.acceptable)
    ? viewerPrefs.education.acceptable.map((e: string) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  const candEdu = String(candidate.education?.qualification || '').trim();
  if (
    applyPrefHardFilters &&
    viewerPrefs?.education?.importance === 'essential' &&
    prefEduList.length > 0 &&
    candEdu &&
    !prefEduList.some((e) => areEducationsClose(candEdu, e) !== 'none')
  ) {
    return fail;
  }

  // Soft preference signals (motherTongue, denomination, division, habits) are factored into
  // motherTongueScore / faithScore / habitsScore below instead of hard-rejecting verified
  // members in partner_preferences mode (especially when optional profile fields like habits
  // are unset). Explicit selections in `filters` still hard-filter in section 1 above.

  const matchReasons: string[] = [];

  // Score 1: Age (15 pts)
  let ageScore = 8;
  if (cAge !== null) {
    if (cAge >= prefAgeMin && cAge <= prefAgeMax) {
      ageScore = 12;
      const cMin = candidatePrefs?.age?.min;
      const cMax = candidatePrefs?.age?.max;
      if (vAge !== null && typeof cMin === 'number' && typeof cMax === 'number' && vAge >= cMin && vAge <= cMax) {
        ageScore = 15;
        matchReasons.push('Mutual age preference');
      } else {
        matchReasons.push('Matches your age preference');
      }
    } else {
      const dist = cAge < prefAgeMin ? prefAgeMin - cAge : cAge - prefAgeMax;
      ageScore = Math.max(0, 10 - dist * 2);
    }
  }

  // Score 2: Height (5 pts)
  let heightScore = 3;
  if (cHeight !== null) {
    if (cHeight >= minH && cHeight <= maxH) heightScore = 5;
    else if (Math.abs(cHeight < minH ? minH - cHeight : cHeight - maxH) <= 5) heightScore = 3;
    else heightScore = 0;
  }

  // Score 3: Family Values & Background + Mother Tongue (15 pts)
  let familyScore = 0;
  const candFamVal = normalizeAnyOption(candidate.familySummary?.familyValues);
  const viewFamVal = normalizeAnyOption(viewer.familySummary?.familyValues);
  if (candFamVal !== 'any' && viewFamVal !== 'any' && candFamVal === viewFamVal) {
    familyScore += 5;
    matchReasons.push('Aligned family values');
  } else if (candFamVal === 'any' || viewFamVal === 'any') {
    familyScore += 3;
  } else {
    familyScore += 2;
  }

  const candFamType = normalizeAnyOption(candidate.familySummary?.familyType);
  const viewFamType = normalizeAnyOption(viewer.familySummary?.familyType);
  const candFamStatus = normalizeAnyOption(candidate.familySummary?.familyStatus);
  const viewFamStatus = normalizeAnyOption(viewer.familySummary?.familyStatus);
  if (candFamType !== 'any' && viewFamType !== 'any' && candFamType === viewFamType) familyScore += 3;
  else familyScore += 2;
  if (candFamStatus !== 'any' && viewFamStatus !== 'any' && candFamStatus === viewFamStatus) familyScore += 2;
  else familyScore += 1;

  const prefMT = normalizeAnyOption(viewerPrefs?.motherTongue);
  const candMT = normalizeAnyOption(candidate.motherTongue);
  const viewMT = normalizeAnyOption(viewer.motherTongue);
  if (prefMT !== 'any' && candMT !== 'any' && candMT === prefMT) {
    familyScore += 5;
    matchReasons.push('Same mother tongue');
  } else if (prefMT === 'any' && viewMT !== 'any' && candMT === viewMT) {
    familyScore += 5;
    matchReasons.push('Same mother tongue');
  } else if (prefMT === 'any') {
    familyScore += 3;
  }

  // Score 4: Shared Interests & Lifestyle (10 pts)
  const viewerInterestList = flattenInterests(viewer.interests);
  const candidateInterestList = flattenInterests(candidate.interests);
  const viewerLowerSet = new Set(viewerInterestList.map((i) => i.toLowerCase()));
  const sharedInterests: string[] = [];
  const seenShared = new Set<string>();

  for (const item of candidateInterestList) {
    const lower = item.toLowerCase();
    if (viewerLowerSet.has(lower) && !seenShared.has(lower)) {
      seenShared.add(lower);
      sharedInterests.push(item);
    }
  }

  if (filters.sharedInterestsOnly && sharedInterests.length === 0) {
    return fail;
  }

  const interestKeys = ['hobbies', 'music', 'reading', 'movies', 'sports', 'food', 'languages'];
  let sharedCategoryCount = 0;
  for (const k of interestKeys) {
    if (
      Array.isArray(viewer.interests?.[k]) &&
      viewer.interests[k].length > 0 &&
      Array.isArray(candidate.interests?.[k]) &&
      candidate.interests[k].length > 0
    ) {
      sharedCategoryCount += 1;
    }
  }

  let interestsScore = 0;
  if (sharedInterests.length > 0) {
    if (sharedInterests.length >= 4) interestsScore = 6;
    else if (sharedInterests.length >= 2) interestsScore = 5;
    else interestsScore = 4;
    matchReasons.push(
      `${sharedInterests.length} shared ${sharedInterests.length === 1 ? 'interest' : 'interests'}`
    );
  } else if (sharedCategoryCount >= 2) {
    interestsScore = 3;
  } else if (viewerInterestList.length === 0 || candidateInterestList.length === 0) {
    interestsScore = 2;
  }

  let habitsScore = 0;
  const prefEat = normalizeAnyOption(viewerPrefs?.eatingHabits);
  const candEat = normalizeAnyOption(candidate.habits?.eatingHabits);
  if (prefEat === 'any' || candEat === prefEat) habitsScore += 2;

  const prefDrink = normalizeAnyOption(viewerPrefs?.drinkingHabits);
  const candDrink = normalizeAnyOption(candidate.habits?.drinkingHabits);
  if (prefDrink === 'any' || candDrink === prefDrink) habitsScore += 1;

  const prefSmoke = normalizeAnyOption(viewerPrefs?.smokingHabits);
  const candSmoke = normalizeAnyOption(candidate.habits?.smokingHabits);
  if (prefSmoke === 'any' || candSmoke === prefSmoke) habitsScore += 1;

  const lifestyleScore = interestsScore + habitsScore; // max 10

  // Score 5: Faith-Related Preferences (15 pts)
  let faithScore = 0;
  const candReligion = normalizeAnyOption(candidate.faithSummary?.religion || 'Christian');
  const viewReligion = normalizeAnyOption(viewer.faithSummary?.religion || 'Christian');
  if (candReligion === viewReligion) faithScore += 2;

  const prefDenom = normalizeAnyOption(viewerPrefs?.denomination);
  const candDenom = normalizeAnyOption(candidate.faithSummary?.denomination);
  const viewDenom = normalizeAnyOption(viewer.faithSummary?.denomination);
  if (prefDenom !== 'any') {
    if (candDenom !== 'any' && candDenom === prefDenom) {
      faithScore += 5;
      matchReasons.push('Same denomination');
    } else if (candDenom === 'any') {
      faithScore += 2;
    }
  } else if (candDenom !== 'any' && viewDenom !== 'any' && candDenom === viewDenom) {
    faithScore += 5;
    matchReasons.push('Same denomination');
  } else {
    faithScore += 3;
  }

  const prefDiv = normalizeAnyOption(viewerPrefs?.division);
  const candDiv = normalizeAnyOption(candidate.faithSummary?.division);
  const viewDiv = normalizeAnyOption(viewer.faithSummary?.division);
  if (prefDiv === 'any' || candDiv === 'any' || candDiv === prefDiv || candDiv === viewDiv) {
    faithScore += 2;
  }

  const candFaithVal = normalizeAnyOption(candidate.faithSummary?.religiousValues);
  const viewFaithVal = normalizeAnyOption(viewer.faithSummary?.religiousValues);
  if (candFaithVal !== 'any' && viewFaithVal !== 'any' && candFaithVal === viewFaithVal) {
    faithScore += 3;
  } else {
    faithScore += 1;
  }

  if (candidate.faithSummary?.baptized === true) {
    faithScore += viewer.faithSummary?.baptized === true ? 3 : 2;
  }

  // Score 6: Education (10 pts)
  let educationScore = 0;
  if (prefEduList.length > 0) {
    const exactOrClose = prefEduList.reduce<'exact' | 'close' | 'none'>((best, e) => {
      const res = areEducationsClose(candEdu, e);
      if (res === 'exact') return 'exact';
      if (res === 'close' && best === 'none') return 'close';
      return best;
    }, 'none');
    if (exactOrClose === 'exact') {
      educationScore = 10;
      matchReasons.push('Matches education preference');
    } else if (exactOrClose === 'close') {
      educationScore = 8;
      matchReasons.push('Close education field');
    } else {
      educationScore = 3;
    }
  } else {
    const vsViewerEdu = areEducationsClose(candEdu, viewer.education?.qualification);
    if (vsViewerEdu === 'exact') {
      educationScore = 10;
      matchReasons.push('Similar education');
    } else if (vsViewerEdu === 'close') {
      educationScore = 8;
      matchReasons.push('Close education field');
    } else {
      educationScore = 5;
    }
  }

  // Score 7: Career (10 pts)
  let careerScore = 0;
  const prefOcc = normalizeAnyOption(viewerPrefs?.occupation);
  const candOcc = candidate.career?.profession;
  const viewOcc = viewer.career?.profession;
  if (prefOcc !== 'any') {
    const res = areProfessionsClose(candOcc, prefOcc);
    if (res === 'exact') {
      careerScore += 5;
      matchReasons.push('Matches occupation preference');
    } else if (res === 'close') {
      careerScore += 4;
      matchReasons.push('Close career field');
    } else {
      careerScore += 1;
    }
  } else {
    const vsViewerOcc = areProfessionsClose(candOcc, viewOcc);
    if (vsViewerOcc === 'exact' || vsViewerOcc === 'close') {
      careerScore += 5;
      matchReasons.push('Close career field');
    } else {
      careerScore += 3;
    }
  }

  const prefEmp = normalizeAnyOption(viewerPrefs?.employedIn);
  const candEmp = normalizeAnyOption(candidate.career?.employmentType);
  const viewEmp = normalizeAnyOption(viewer.career?.employmentType);
  if (prefEmp !== 'any' && candEmp === prefEmp) careerScore += 3;
  else if (prefEmp === 'any' && candEmp !== 'any' && candEmp === viewEmp) careerScore += 3;
  else if (prefEmp === 'any') careerScore += 2;

  const prefIncome = viewerPrefs?.annualIncome;
  const candIncome = candidatePrivate?.incomeDetails?.annualIncomeRange;
  if (matchesIncomePref(prefIncome, candIncome)) {
    careerScore += 2;
  }

  // Score 8: Location (10 pts)
  let locationScore = 0;
  const prefCountries: string[] = Array.isArray(viewerPrefs?.locations?.preferredCountries)
    ? viewerPrefs.locations.preferredCountries.map(normalizeAnyOption).filter((x: string) => x !== 'any')
    : [];
  const candCountry = normalizeAnyOption(candidate.location?.country);
  const viewCountry = normalizeAnyOption(viewer.location?.country);
  if (prefCountries.length === 0) {
    locationScore += candCountry === viewCountry ? 3 : 1;
  } else if (candCountry !== 'any' && prefCountries.includes(candCountry)) {
    locationScore += 3;
  }

  const prefStates: string[] = Array.isArray(viewerPrefs?.locations?.preferredStates)
    ? viewerPrefs.locations.preferredStates.map(normalizeAnyOption).filter((x: string) => x !== 'any')
    : [];
  const candState = normalizeAnyOption(candidate.location?.state);
  const viewState = normalizeAnyOption(viewer.location?.state);
  const candCity = normalizeAnyOption(candidate.location?.village || candidate.location?.city);
  const viewCity = normalizeAnyOption(viewer.location?.village || viewer.location?.city);
  if (prefStates.length === 0) {
    if (candState !== 'any' && candState === viewState) {
      locationScore += 4;
      if (candCity === 'any' || viewCity === 'any' || candCity !== viewCity) {
        matchReasons.push('Same state');
      }
    } else {
      locationScore += 2;
    }
  } else if (candState !== 'any' && prefStates.includes(candState)) {
    locationScore += 4;
    matchReasons.push('Preferred state');
  }

  const prefCities: string[] = Array.isArray(viewerPrefs?.locations?.preferredCities)
    ? viewerPrefs.locations.preferredCities.map(normalizeAnyOption).filter((x: string) => x !== 'any')
    : [];
  if (prefCities.length > 0 && candCity !== 'any' && prefCities.includes(candCity)) {
    locationScore += 3;
    matchReasons.push('Preferred city');
  } else if (candCity !== 'any' && viewCity !== 'any' && candCity === viewCity) {
    locationScore += 3;
    matchReasons.push('Same city');
  } else if (prefCities.length === 0 && viewerPrefs?.locations?.openToRelocation !== false) {
    locationScore += 2;
  }

  // Score 9: Additional Preferences (Marital, Physical, Reciprocal Preference Alignment - 10 pts)
  const maritalScore = prefMaritals.length === 0 || prefMaritals.includes(cMarital) ? 2 : 0;
  const physicalScore = prefPhys === 'any' || candPhys === prefPhys ? 2 : 0;

  const candMatchesViewerPref = buildPartnerPrefComparison(
    candidate,
    candidatePrivate,
    viewer,
    viewerPrefs
  );
  const viewerMatchesCandPref = buildPartnerPrefComparison(
    viewer,
    viewerPrivate,
    candidate,
    candidatePrefs
  );
  const candRatio =
    candMatchesViewerPref.totalCount > 0
      ? candMatchesViewerPref.matchedCount / candMatchesViewerPref.totalCount
      : 0.7;
  const viewerRatio =
    viewerMatchesCandPref.totalCount > 0
      ? viewerMatchesCandPref.matchedCount / viewerMatchesCandPref.totalCount
      : 0.7;
  const mutualPrefScore = Math.round(((candRatio + viewerRatio) / 2) * 6);
  if (candRatio >= 0.75 && viewerRatio >= 0.75) {
    matchReasons.unshift('High mutual match');
  }

  if (filters.mutualMatchesOnly && (candRatio < 0.65 || viewerRatio < 0.65)) {
    return fail;
  }

  const additionalScore = maritalScore + physicalScore + mutualPrefScore; // max 10

  // Compatibility score is 100% independent of subscription tier
  const totalScore = Math.min(
    100,
    Math.round(
      ageScore +
        heightScore +
        educationScore +
        careerScore +
        locationScore +
        familyScore +
        faithScore +
        lifestyleScore +
        additionalScore
    )
  );

  const uniqueReasons = Array.from(new Set(matchReasons)).slice(0, 6);

  return {
    eligible: true,
    score: totalScore,
    sharedInterests: sharedInterests.slice(0, 8),
    matchReasons: uniqueReasons,
    breakdown: {
      ageScore,
      educationScore,
      interestsScore,
      heightScore,
      maritalScore,
      familyScore,
      faithScore,
      careerScore,
      locationScore,
      lifestyleScore,
      additionalScore,
      habitsScore,
    },
  };
}

function formatCompactHeightStr(cm?: number | null): string {
  if (!cm || cm <= 0) return 'Any';
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function maskPhoneNumber(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.length <= 5) return '******';
  if (s.startsWith('+91') && s.length >= 7) {
    const rest = s.slice(3).trim();
    return `+91 ${rest.slice(0, 2)}${'*'.repeat(Math.max(8, rest.length - 2))}`;
  }
  return `${s.slice(0, Math.min(5, s.length - 4))}${'*'.repeat(Math.max(6, s.length - 5))}`;
}

function maskDob(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  return '**/**/****';
}

function matchesAnyOrText(prefRaw: unknown, viewerRaw: unknown): boolean {
  const pref = normalizeAnyOption(prefRaw);
  if (pref === 'any') return true;
  const val = normalizeAnyOption(viewerRaw);
  if (val === 'any') return false;
  return val === pref || val.includes(pref) || pref.includes(val);
}

function doesViewerMatchCandPrefs(
  viewer: Record<string, any>,
  candPrefs: Record<string, any>
): boolean {
  if (!candPrefs || typeof candPrefs !== 'object') return true;

  const vAge = typeof viewer.age === 'number' ? viewer.age : null;
  if (vAge !== null && candPrefs.age && (candPrefs.age.min || candPrefs.age.max)) {
    const cMin = Number(candPrefs.age.min ?? 18);
    const cMax = Number(candPrefs.age.max ?? 70);
    if (candPrefs.age.importance === 'essential') {
      if (vAge < cMin || vAge > cMax) return false;
    } else if (vAge < cMin - 5 || vAge > cMax + 5) {
      return false;
    }
  }

  const vHeight = typeof viewer.heightCm === 'number' ? viewer.heightCm : null;
  if (vHeight !== null && candPrefs.height?.importance === 'essential') {
    const cMinH = Number(candPrefs.height.minCm ?? 120);
    const cMaxH = Number(candPrefs.height.maxCm ?? 240);
    if (vHeight < cMinH || vHeight > cMaxH) return false;
  }

  const candMaritals: string[] = Array.isArray(candPrefs.maritalStatuses)
    ? candPrefs.maritalStatuses.map(normalizeMarital).filter((m: string) => m !== 'any')
    : [];
  const vMarital = normalizeMarital(viewer.maritalStatus);
  if (candMaritals.length > 0 && vMarital !== 'any' && !candMaritals.includes(vMarital)) {
    return false;
  }

  const candPhys = normalizeAnyOption(candPrefs.physicalStatus);
  const vPhys = normalizeAnyOption(viewer.physicalStatus || 'Normal');
  if (candPhys !== 'any' && vPhys !== 'any' && candPhys !== vPhys) {
    return false;
  }

  const candEduList: string[] = Array.isArray(candPrefs.education?.acceptable)
    ? candPrefs.education.acceptable.map((e: string) => String(e || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const vEdu = String(viewer.education?.qualification || '').trim();
  if (
    candPrefs.education?.importance === 'essential' &&
    candEduList.length > 0 &&
    vEdu &&
    !candEduList.some((e) => areEducationsClose(vEdu, e) !== 'none')
  ) {
    return false;
  }

  return true;
}

function matchesViewerPreferenceTab(
  tab: string,
  viewer: Record<string, any>,
  viewerPrefs: Record<string, any>,
  candidate: Record<string, any>,
  candPrefs: Record<string, any>
): boolean {
  switch (tab) {
    case 'nearby': {
      const vState = normalizeAnyOption(viewer.location?.state);
      const vCity = normalizeAnyOption(viewer.location?.village || viewer.location?.city);
      const cState = normalizeAnyOption(candidate.location?.state);
      const cCity = normalizeAnyOption(candidate.location?.village || candidate.location?.city);
      if (vCity !== 'any' && cCity !== 'any' && vCity === cCity) return true;
      if (vState !== 'any' && cState !== 'any' && vState === cState) return true;
      return false;
    }
    case 'photo_matches': {
      return Boolean(candidate.profilePhoto) || (Array.isArray(candidate.gallery) && candidate.gallery.length > 0);
    }
    case 'looking_for_you': {
      return doesViewerMatchCandPrefs(viewer, candPrefs);
    }
    case 'mutual_matches': {
      return doesViewerMatchCandPrefs(viewer, candPrefs);
    }
    case 'education_pref': {
      const prefEduList: string[] = Array.isArray(viewerPrefs?.education?.acceptable)
        ? viewerPrefs.education.acceptable.map((e: string) => String(e || '').trim().toLowerCase()).filter(Boolean)
        : [];
      if (prefEduList.length === 0) return true;
      const candEdu = String(candidate.education?.qualification || '').trim();
      if (!candEdu) return false;
      return prefEduList.some((e) => areEducationsClose(candEdu, e) !== 'none');
    }
    case 'professional_pref': {
      const prefOcc = normalizeAnyOption(viewerPrefs?.occupation);
      const prefEmp = normalizeAnyOption(viewerPrefs?.employedIn);
      const candOcc = candidate.career?.profession || candidate.career?.occupationCategory;
      const candEmp = candidate.career?.employmentType;
      if (prefOcc !== 'any' && areProfessionsClose(candOcc, prefOcc) === 'none') {
        return false;
      }
      if (prefEmp !== 'any' && !matchesAnyOrText(prefEmp, candEmp)) {
        return false;
      }
      return true;
    }
    case 'location_pref': {
      const prefCities: string[] = Array.isArray(viewerPrefs?.locations?.preferredCities)
        ? viewerPrefs.locations.preferredCities.filter((x: string) => normalizeAnyOption(x) !== 'any')
        : [];
      const prefStates: string[] = Array.isArray(viewerPrefs?.locations?.preferredStates)
        ? viewerPrefs.locations.preferredStates.filter((x: string) => normalizeAnyOption(x) !== 'any')
        : [];
      const prefCountries: string[] = Array.isArray(viewerPrefs?.locations?.preferredCountries)
        ? viewerPrefs.locations.preferredCountries.filter((x: string) => normalizeAnyOption(x) !== 'any')
        : [];

      if (prefCities.length > 0) {
        const candCity = candidate.location?.village || candidate.location?.city;
        return prefCities.some((c) => matchesAnyOrText(c, candCity));
      }
      if (prefStates.length > 0) {
        return prefStates.some((s) => matchesAnyOrText(s, candidate.location?.state));
      }
      if (prefCountries.length > 0) {
        return prefCountries.some((c) => matchesAnyOrText(c, candidate.location?.country));
      }
      return true;
    }
    case 'nri_matches': {
      const candCountry = normalizeAnyOption(candidate.location?.country);
      return (
        candCountry !== 'any' &&
        candCountry !== 'india' &&
        candCountry !== 'in' &&
        candCountry !== 'bharat'
      );
    }
    default:
      return true;
  }
}

function buildPartnerPrefComparison(
  viewer: Record<string, any>,
  viewerPrivate: Record<string, any>,
  candidate: Record<string, any>,
  candPrefs: Record<string, any>
): {
  matchedCount: number;
  totalCount: number;
  sections: {
    title: string;
    items: { label: string; value: string; matched: boolean }[];
  }[];
} {
  const viewerAge = typeof viewer.age === 'number' ? viewer.age : null;
  const viewerHeight = typeof viewer.heightCm === 'number' ? viewer.heightCm : null;
  const viewerIncome = viewerPrivate?.incomeDetails?.annualIncomeRange || '';

  const candGender = normalizeGender(candidate.gender);
  const ageRoleLabel =
    candGender === 'female' ? "Preferred Groom's Age" : "Preferred Bride's Age";

  const prefAgeMin = candPrefs?.age?.min ?? 18;
  const prefAgeMax = candPrefs?.age?.max ?? 60;
  const ageMatched = viewerAge !== null ? viewerAge >= prefAgeMin && viewerAge <= prefAgeMax : true;

  const prefHMin = candPrefs?.height?.minCm ?? 145;
  const prefHMax = candPrefs?.height?.maxCm ?? 195;
  const heightMatched =
    viewerHeight !== null ? viewerHeight >= prefHMin && viewerHeight <= prefHMax : true;

  const prefMaritals: string[] = Array.isArray(candPrefs?.maritalStatuses)
    ? candPrefs.maritalStatuses.filter((x: string) => normalizeMarital(x) !== 'any')
    : [];
  const maritalLabel = prefMaritals.length ? prefMaritals.join(', ') : "Doesn't matter";
  const vMarital = normalizeMarital(viewer.maritalStatus);
  const maritalMatched =
    prefMaritals.length === 0 ||
    vMarital === 'any' ||
    prefMaritals.some((m) => normalizeMarital(m) === vMarital);

  const prefMT = candPrefs?.motherTongue || 'Any';
  const mtMatched = matchesAnyOrText(prefMT, viewer.motherTongue);

  const prefPhys = candPrefs?.physicalStatus || 'Normal';
  const physMatched = matchesAnyOrText(prefPhys, viewer.physicalStatus || 'Normal');

  const prefEat = candPrefs?.eatingHabits || "Doesn't matter";
  const eatMatched = matchesAnyOrText(prefEat, viewer.habits?.eatingHabits);

  const prefSmoke = candPrefs?.smokingHabits || "Doesn't matter";
  const smokeMatched = matchesAnyOrText(prefSmoke, viewer.habits?.smokingHabits);

  const prefDrink = candPrefs?.drinkingHabits || "Doesn't matter";
  const drinkMatched = matchesAnyOrText(prefDrink, viewer.habits?.drinkingHabits);

  const prefReligion = candidate.faithSummary?.religion || 'Christian';
  const religionMatched = matchesAnyOrText(prefReligion, viewer.faithSummary?.religion || 'Christian');

  const prefDenom = candPrefs?.denomination || 'Any';
  const denomMatched = matchesAnyOrText(prefDenom, viewer.faithSummary?.denomination);

  const prefDiv = candPrefs?.division || 'Any';
  const divMatched = matchesAnyOrText(prefDiv, viewer.faithSummary?.division);

  const prefEduList: string[] = Array.isArray(candPrefs?.education?.acceptable)
    ? candPrefs.education.acceptable.filter(Boolean)
    : [];
  const eduLabel = prefEduList.length ? prefEduList.join(', ') : 'Any';
  const vEdu = String(viewer.education?.qualification || '').trim();
  const eduMatched =
    prefEduList.length === 0 ||
    (Boolean(vEdu) && prefEduList.some((e) => areEducationsClose(vEdu, e) !== 'none'));

  const prefEmp = candPrefs?.employedIn || 'Any';
  const empMatched = matchesAnyOrText(prefEmp, viewer.career?.employmentType);

  const prefOcc = candPrefs?.occupation || 'Any';
  const occMatched =
    normalizeAnyOption(prefOcc) === 'any' ||
    areProfessionsClose(viewer.career?.profession, prefOcc) !== 'none';

  const prefInc = candPrefs?.annualIncome || 'Any';
  const incMatched = matchesIncomePref(prefInc, viewerIncome);

  const prefCountries: string[] = Array.isArray(candPrefs?.locations?.preferredCountries)
    ? candPrefs.locations.preferredCountries.filter((x: string) => normalizeAnyOption(x) !== 'any')
    : [];
  const countriesLabel = prefCountries.length ? prefCountries.join(', ') : 'Any';
  const countryMatched =
    prefCountries.length === 0 ||
    prefCountries.some((c) => matchesAnyOrText(c, viewer.location?.country));

  const prefStates: string[] = Array.isArray(candPrefs?.locations?.preferredStates)
    ? candPrefs.locations.preferredStates.filter((x: string) => normalizeAnyOption(x) !== 'any')
    : [];
  const statesLabel = prefStates.length ? prefStates.join(', ') : 'Any';
  const stateMatched =
    prefStates.length === 0 ||
    prefStates.some((s) => matchesAnyOrText(s, viewer.location?.state));

  const prefCities: string[] = Array.isArray(candPrefs?.locations?.preferredCities)
    ? candPrefs.locations.preferredCities.filter((x: string) => normalizeAnyOption(x) !== 'any')
    : [];
  const citiesLabel = prefCities.length ? prefCities.join(', ') : 'Any';
  const cityMatched =
    prefCities.length === 0 ||
    prefCities.some((c) => matchesAnyOrText(c, viewer.location?.village || viewer.location?.city));

  const prefCitizenship = candPrefs?.citizenship || 'Any';
  const citizenshipMatched = matchesAnyOrText(
    prefCitizenship,
    viewer.location?.citizenship || viewer.location?.country
  );

  const sections = [
    {
      title: 'Basic Preferences',
      items: [
        { label: ageRoleLabel, value: `${prefAgeMin}-${prefAgeMax} Yrs`, matched: ageMatched },
        {
          label: 'Preferred Height',
          value: `${formatCompactHeightStr(prefHMin)} - ${formatCompactHeightStr(prefHMax)}`,
          matched: heightMatched,
        },
        { label: 'Preferred Marital Status', value: maritalLabel, matched: maritalMatched },
        { label: 'Preferred Mother Tongue', value: prefMT, matched: mtMatched },
        { label: 'Preferred Physical Status', value: prefPhys, matched: physMatched },
        { label: 'Preferred Eating Habits', value: prefEat, matched: eatMatched },
        { label: 'Preferred Smoking Habits', value: prefSmoke, matched: smokeMatched },
        { label: 'Preferred Drinking Habits', value: prefDrink, matched: drinkMatched },
      ],
    },
    {
      title: 'Religious Preferences',
      items: [
        { label: 'Preferred Religion', value: prefReligion, matched: religionMatched },
        { label: 'Preferred Denomination', value: prefDenom, matched: denomMatched },
        { label: 'Preferred Division', value: prefDiv, matched: divMatched },
      ],
    },
    {
      title: 'Professional Preferences',
      items: [
        { label: 'Preferred Education', value: eduLabel, matched: eduMatched },
        { label: 'Preferred Employment Type', value: prefEmp, matched: empMatched },
        { label: 'Preferred Occupation', value: prefOcc, matched: occMatched },
        { label: 'Preferred Annual Income', value: prefInc, matched: incMatched },
      ],
    },
    {
      title: 'Location Preferences',
      items: [
        { label: 'Preferred Country', value: countriesLabel, matched: countryMatched },
        { label: 'Preferred Residing State', value: statesLabel, matched: stateMatched },
        { label: 'Preferred Residing City', value: citiesLabel, matched: cityMatched },
        { label: 'Preferred Citizenship', value: prefCitizenship, matched: citizenshipMatched },
      ],
    },
  ];

  let matchedCount = 0;
  let totalCount = 0;
  for (const sec of sections) {
    for (const item of sec.items) {
      totalCount += 1;
      if (item.matched) matchedCount += 1;
    }
  }

  return { matchedCount, totalCount, sections };
}

export function canViewerSeeCandidatePhotos(params: {
  viewerUid: string;
  candidate: Record<string, any>;
  interestStatus: string | null;
  viewerEntitlements?: ResolvedMemberEntitlements | undefined;
  photoRequestStatus?: 'pending' | 'approved' | 'declined' | null;
}): boolean {
  const { viewerUid, candidate, interestStatus, viewerEntitlements, photoRequestStatus } = params;
  const mode = String(candidate?.photoVisibility || 'approved_members');
  if (mode === 'approved_members') return true;

  const allowed: string[] = Array.isArray(candidate?.protectedPhotoAllowedUids)
    ? candidate.protectedPhotoAllowedUids
    : [];
  if (mode === 'protect_photo') {
    return Boolean(viewerUid && allowed.includes(viewerUid));
  }
  if (Boolean(viewerUid && (allowed.includes(viewerUid) || photoRequestStatus === 'approved'))) {
    return true;
  }

  if (mode === 'matches_only') return interestStatus === 'accepted';
  if (mode === 'contacted_and_paid') {
    const isPaid = Boolean(viewerEntitlements && viewerEntitlements.tier !== 'free');
    const hasContactedOrResponded = Boolean(interestStatus);
    return isPaid || hasContactedOrResponded;
  }
  return true;
}

async function formatMatchCandidatePayload(params: {
  candUid: string;
  viewer: Record<string, any>;
  viewerPrivate: Record<string, any>;
  candidate: Record<string, any>;
  candPriv: Record<string, any>;
  candPrefs: Record<string, any>;
  evaluation: ScoreEvaluation;
  isShortlisted: boolean;
  interestStatus: string | null;
  interestSentAtMs?: number;
  joinedAtMs: number;
  viewedAtMs?: number;
  viewerEntitlements?: ResolvedMemberEntitlements;
  unlockedContactSet?: Set<string>;
  photoRequestStatus?: 'pending' | 'approved' | 'declined' | null;
  candidateTierOverride?: 'free' | 'silver' | 'gold' | 'platinum';
  preResolvedPhotoMap?: Map<string, string | null>;
}) {
  const {
    candUid,
    viewer,
    viewerPrivate,
    candidate,
    candPriv,
    candPrefs,
    evaluation,
    isShortlisted,
    interestStatus,
    interestSentAtMs = 0,
    joinedAtMs,
    viewedAtMs = 0,
    viewerEntitlements,
    unlockedContactSet,
    photoRequestStatus = null,
    candidateTierOverride,
    preResolvedPhotoMap,
  } = params;

  const lookupPhoto = (p: string): Promise<string | null> => {
    if (preResolvedPhotoMap && preResolvedPhotoMap.has(p)) {
      return Promise.resolve(preResolvedPhotoMap.get(p) ?? null);
    }
    return resolveMatchPhotoUrls([p]).then((u) => u[0] || null);
  };

  const canSeePhotos = canViewerSeeCandidatePhotos({
    viewerUid: String(viewer?.uid || ''),
    candidate,
    interestStatus,
    viewerEntitlements,
    photoRequestStatus,
  });

  const [signedProfilePhoto, signedGallery] = canSeePhotos
    ? await Promise.all([
        candidate.profilePhoto ? lookupPhoto(String(candidate.profilePhoto)) : Promise.resolve(null),
        Array.isArray(candidate.gallery) && candidate.gallery.length > 0
          ? Promise.all(
              candidate.gallery
                .filter((g: unknown): g is string => typeof g === 'string' && g.length > 0)
                .map((g: string) => lookupPhoto(g))
            ).then((arr) => arr.filter((u): u is string => Boolean(u)))
          : Promise.resolve([]),
      ])
    : [null, []];

  const partnerPreferencesComparison = buildPartnerPrefComparison(
    viewer,
    viewerPrivate,
    candidate,
    candPrefs
  );

  const managedType = String(candPriv?.profileManager?.type || 'self').toLowerCase();
  const candidateTier = candidateTierOverride ?? resolveActiveTierFromProfile(candidate);
  const isHighlighted: 'none' | 'gold' | 'platinum' =
    candidateTier === 'platinum' ? 'platinum' : candidateTier === 'gold' ? 'gold' : 'none';
  const visibilityPriority =
    candidateTier === 'platinum' ? 2 : candidateTier === 'gold' ? 1 : 0;

  const hasPhoto = Boolean(candidate.profilePhoto);
  const isBaptized = candidate.faithSummary?.baptized === true;
  const verificationSummary = {
    adminApproved: candidate.profileStatus === 'approved',
    churchMemberVerified: true,
    photoVerified: hasPhoto,
    baptismVerified: isBaptized,
    trustLevel: (hasPhoto && isBaptized ? 'prime_verified' : 'verified') as
      | 'prime_verified'
      | 'verified',
  };

  // Contact numbers & exact DOB require active paid subscription AND either Platinum (unlimited) or explicit unlock
  const isMessagesOnly = candidate.mobilePrivacy === 'messages_only';
  const hasPaidViewer = Boolean(viewerEntitlements && viewerEntitlements.tier !== 'free');
  const isContactUnlocked = Boolean(
    !isMessagesOnly &&
      hasPaidViewer &&
      (viewerEntitlements!.contactNumberLimit < 0 || unlockedContactSet?.has(candUid))
  );
  const canUnlockContact = Boolean(
    !isMessagesOnly &&
      hasPaidViewer &&
      (viewerEntitlements!.contactNumberLimit < 0 || viewerEntitlements!.contactNumbersRemaining > 0)
  );

  return {
    uid: candUid,
    displayName: candidate.displayName || 'Rhema Member',
    profileCode: candidate.matrimonyId || `RM${candUid.slice(0, 7).toUpperCase()}`,
    gender: candidate.gender,
    age: candidate.age ?? null,
    heightCm: candidate.heightCm ?? null,
    maritalStatus: candidate.maritalStatus || 'Never Married',
    motherTongue: candidate.motherTongue || '',
    aboutMe: candidate.aboutMe || '',
    profileCreatedBy: managedType === 'guardian' ? 'Parents / Guardian' : 'Self',
    education: candidate.education || {},
    career: candidate.career || {},
    location: candidate.location || {},
    faithSummary: candidate.faithSummary || {},
    habits: candidate.habits || {},
    interests: candidate.interests || {},
    familySummary: candidate.familySummary || {},
    familyDetails: candPriv.familyDetails || null,
    annualIncomeRange: candPriv?.incomeDetails?.annualIncomeRange || '',
    dob: isContactUnlocked ? (candPriv?.dob || null) : null,
    maskedDob: maskDob(candPriv?.dob),
    maskedPhone: maskPhoneNumber(candPriv?.phoneNumber),
    contactPhone: isContactUnlocked ? (candPriv?.phoneNumber || null) : null,
    isContactUnlocked,
    canUnlockContact,
    mobilePrivacy: isMessagesOnly ? 'messages_only' : 'show_all',
    isPhotoProtected:
      !canSeePhotos &&
      Boolean(
        candidate.profilePhoto ||
          (Array.isArray(candidate.gallery) && candidate.gallery.length > 0)
      ),
    photoRequestStatus,
    photoVisibility: candidate.photoVisibility || 'approved_members',
    candidateTier,
    isHighlighted,
    visibilityPriority,
    verificationSummary,
    partnerPreferencesComparison,
    signedProfilePhoto,
    signedGallery,
    photoCount: (signedProfilePhoto ? 1 : 0) + signedGallery.length,
    matchScore: evaluation.score,
    sharedInterests: evaluation.sharedInterests,
    matchReasons: evaluation.matchReasons,
    breakdown: evaluation.breakdown,
    isShortlisted,
    interestStatus,
    interestSentAtMs,
    joinedAtMs,
    viewedAtMs,
    updatedAtMs: toTimestampMs(candidate.updatedAt),
  };
}

function mapViewerPrefsToFilter(viewerPrefs: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  if (!viewerPrefs || typeof viewerPrefs !== 'object') return out;

  if (typeof viewerPrefs.age?.min === 'number') out.minAge = viewerPrefs.age.min;
  if (typeof viewerPrefs.age?.max === 'number') out.maxAge = viewerPrefs.age.max;

  const minH = viewerPrefs.height?.minCm;
  const maxH = viewerPrefs.height?.maxCm;
  if (typeof minH === 'number') out.minHeightCm = minH;
  if (typeof maxH === 'number') out.maxHeightCm = maxH;

  const maritals: string[] = Array.isArray(viewerPrefs.maritalStatuses)
    ? viewerPrefs.maritalStatuses.filter((m: unknown) => typeof m === 'string' && normalizeMarital(m) !== 'any')
    : [];
  if (maritals.length === 1) {
    const first = (maritals[0] || '').trim();
    if (first) {
      out.maritalStatus = first.toLowerCase() === 'single' ? 'Never Married' : first;
    }
  }

  const addIfSpecific = (key: string, val: unknown, ignoreVals: string[] = []) => {
    if (typeof val !== 'string') return;
    const norm = normalizeAnyOption(val);
    if (norm === 'any') return;
    if (ignoreVals.includes(norm)) return;
    out[key] = val.trim();
  };

  addIfSpecific('motherTongue', viewerPrefs.motherTongue);
  addIfSpecific('physicalStatus', viewerPrefs.physicalStatus);
  addIfSpecific('denomination', viewerPrefs.denomination);
  addIfSpecific('division', viewerPrefs.division);
  addIfSpecific('occupation', viewerPrefs.occupation);
  addIfSpecific('employmentType', viewerPrefs.employedIn);
  addIfSpecific('annualIncome', viewerPrefs.annualIncome);
  addIfSpecific('eatingHabits', viewerPrefs.eatingHabits);
  addIfSpecific('drinkingHabits', viewerPrefs.drinkingHabits);
  addIfSpecific('smokingHabits', viewerPrefs.smokingHabits);

  const acceptableEdu = Array.isArray(viewerPrefs.education?.acceptable)
    ? viewerPrefs.education.acceptable.filter((e: unknown) => typeof e === 'string' && e.trim().length > 0)
    : [];
  if (acceptableEdu.length > 0) {
    out.education = acceptableEdu;
  }

  const countries = Array.isArray(viewerPrefs.locations?.preferredCountries)
    ? viewerPrefs.locations.preferredCountries.filter((c: unknown) => typeof c === 'string' && normalizeAnyOption(c) !== 'any')
    : [];
  if (countries.length > 0) out.country = countries[0];

  const states = Array.isArray(viewerPrefs.locations?.preferredStates)
    ? viewerPrefs.locations.preferredStates.filter((s: unknown) => typeof s === 'string' && normalizeAnyOption(s) !== 'any')
    : [];
  if (states.length > 0) out.state = states[0];

  const cities = Array.isArray(viewerPrefs.locations?.preferredCities)
    ? viewerPrefs.locations.preferredCities
        .filter((c: unknown): c is string => typeof c === 'string' && normalizeAnyOption(c) !== 'any')
        .map((c: string) => c.trim())
    : [];
  if (cities.length > 0) out.city = cities.join(', ');

  return out;
}

/**
 * 1. getMatrimonyMatches
 * Returns real verified opposite-gender matches scored by Partner Preferences, Age, & Hobbies/Interests.
 */
export const getMatrimonyMatches = onCall(
  { invoker: 'public', cpu: 1, memory: '512MiB', maxInstances: 20 },
  async (request) => {
  const uid = requireAuthUid(request);
  const db = getFirestore();

  const tab = optionalString(request.data?.tab, 30) || 'all';
  const matchBasisRaw = optionalString(request.data?.matchBasis, 30);
  const matchBasis: 'partner_preferences' | 'all_filters' =
    matchBasisRaw === 'all_filters' ? 'all_filters' : 'partner_preferences';
  const matchTierRaw = optionalString(request.data?.matchTier, 20);
  const matchTier: 'regular' | 'prime' = matchTierRaw === 'prime' ? 'prime' : 'regular';
  const sortBy = optionalString(request.data?.sortBy, 30) || 'best_match';
  const offset = optionalNumber(request.data?.offset, 0, 5000, 'offset') ?? 0;
  const limit = optionalNumber(request.data?.limit, 1, 2000, 'limit');
  const rawFilters = (request.data?.filters && typeof request.data.filters === 'object')
    ? request.data.filters
    : {};

  const feedCacheKey = `${uid}|${tab}|${matchBasis}|${matchTier}|${sortBy}|${JSON.stringify(rawFilters)}`;
  if (offset > 0) {
    const warmFeed = WARM_VIEWER_FEED_CACHE.get(feedCacheKey);
    if (warmFeed && warmFeed.expiresAtMs > Date.now()) {
      const cachedPageSlice =
        limit !== undefined
          ? warmFeed.validScored.slice(offset, offset + limit)
          : warmFeed.validScored.slice(offset);
      const uniquePhotoPaths = new Set<string>();
      cachedPageSlice.forEach((item) => {
        if (item.candidate?.profilePhoto) uniquePhotoPaths.add(String(item.candidate.profilePhoto));
        if (Array.isArray(item.candidate?.gallery)) {
          item.candidate.gallery.forEach((g: unknown) => {
            if (typeof g === 'string' && g) uniquePhotoPaths.add(g);
          });
        }
      });
      const preResolvedPhotoMap = new Map<string, string | null>();
      const bucket = getStorage().bucket(MATRIMONY_BUCKET);
      const expires = Date.now() + 60 * 60 * 1000;
      await Promise.all(
        Array.from(uniquePhotoPaths).map(async (p) => {
          preResolvedPhotoMap.set(p, await resolveSingleMatchPhotoUrl(bucket, p, expires));
        })
      );
      const validMatches = await Promise.all(
        cachedPageSlice.map((item) =>
          formatMatchCandidatePayload({
            candUid: item.uid,
            viewer: warmFeed.viewer,
            viewerPrivate: warmFeed.viewerPrivate,
            candidate: item.candidate,
            candPriv: item.candPriv,
            candPrefs: item.candPrefs,
            evaluation: item.evaluation,
            isShortlisted: item.isShortlisted,
            interestStatus: item.interestStatus,
            interestSentAtMs: item.interestSentAtMs,
            joinedAtMs: item.joinedAtMs,
            viewedAtMs: item.viewedAtMs,
            viewerEntitlements: warmFeed.viewerEntitlements,
            unlockedContactSet: warmFeed.unlockedContactSet,
            photoRequestStatus: warmFeed.photoRequestStatusMap?.get(item.uid) || null,
            candidateTierOverride: item.candTier,
            preResolvedPhotoMap,
          })
        )
      );
      return {
        success: true,
        matches: validMatches,
        totalCount: warmFeed.totalMatchedCount,
        hasMore: offset + validMatches.length < warmFeed.totalMatchedCount,
        nextOffset: offset + validMatches.length,
        totalAvailableCount: warmFeed.totalAvailableCount,
        hiddenCount: warmFeed.hiddenCount,
        viewerGender: warmFeed.viewerGender,
        targetGender: warmFeed.targetGender,
        viewerPhoto: warmFeed.viewerPhoto,
        viewerPreferencesFilter: warmFeed.viewerPreferencesFilter,
        preferencesUpdatedAtMs: warmFeed.preferencesUpdatedAtMs,
        viewerEntitlements: warmFeed.viewerEntitlements,
        lockedAdvancedFilters: warmFeed.lockedAdvancedFilters,
      };
    }
  }

  await assertMatrimonyProfileActive(db, uid);

  const rawEduFilter = Array.isArray(rawFilters.education)
    ? rawFilters.education
        .map((x: unknown) => optionalString(x, 120))
        .filter((x: string | undefined): x is string => Boolean(x))
        .slice(0, 30)
    : undefined;
  const createdWithinRaw = optionalString(rawFilters.createdWithin, 16);
  const createdWithin =
    createdWithinRaw === 'today' ||
    createdWithinRaw === '3d' ||
    createdWithinRaw === '1w' ||
    createdWithinRaw === '1m'
      ? createdWithinRaw
      : 'all';

  const filters: FilterInput = {
    minAge: optionalNumber(rawFilters.minAge, 18, 85, 'minAge'),
    maxAge: optionalNumber(rawFilters.maxAge, 18, 90, 'maxAge'),
    minHeightCm: optionalNumber(rawFilters.minHeightCm, 120, 220, 'minHeightCm'),
    maxHeightCm: optionalNumber(rawFilters.maxHeightCm, 120, 230, 'maxHeightCm'),
    profileCreatedBy: optionalString(rawFilters.profileCreatedBy, 40),
    maritalStatus: optionalString(rawFilters.maritalStatus, 40),
    motherTongue: optionalString(rawFilters.motherTongue, 60),
    physicalStatus: optionalString(rawFilters.physicalStatus, 40),
    baptized: optionalString(rawFilters.baptized, 20),
    baptizedOnly: optionalBoolean(rawFilters.baptizedOnly),
    denomination: optionalString(rawFilters.denomination, 80),
    division: optionalString(rawFilters.division, 80),
    occupation: optionalString(rawFilters.occupation, 100),
    annualIncome: optionalString(rawFilters.annualIncome, 80),
    employmentType: optionalString(rawFilters.employmentType, 80),
    education: rawEduFilter && rawEduFilter.length > 0 ? rawEduFilter : undefined,
    nearbyProfiles: optionalBoolean(rawFilters.nearbyProfiles),
    sameCity: optionalBoolean(rawFilters.sameCity),
    sameState: optionalBoolean(rawFilters.sameState),
    country: optionalString(rawFilters.country, 80),
    state: optionalString(rawFilters.state, 80),
    city: optionalString(rawFilters.city, 120),
    eatingHabits: optionalString(rawFilters.eatingHabits, 40),
    drinkingHabits: optionalString(rawFilters.drinkingHabits, 40),
    smokingHabits: optionalString(rawFilters.smokingHabits, 40),
    familyStatus: optionalString(rawFilters.familyStatus, 60),
    familyType: optionalString(rawFilters.familyType, 40),
    familyValues: optionalString(rawFilters.familyValues, 40),
    createdWithin,
    mutualMatchesOnly: optionalBoolean(rawFilters.mutualMatchesOnly),
    withPhotoOnly: optionalBoolean(rawFilters.withPhotoOnly),
    sharedInterestsOnly: optionalBoolean(rawFilters.sharedInterestsOnly),
  };

  const [
    viewerProfSnap,
    viewerPrivateSnap,
    viewerPrefsSnap,
    shortlistDocs,
    blockDocs,
    sentInterestsSnap,
    shortlistedByDocs,
    viewDocs,
    viewedByDocs,
    activeSubsSnap,
    sentPhotoReqSnap,
  ] = await Promise.all([
    getProfileRef(db, uid).get(),
    readPrivateSnap(db, uid),
    readPrefsSnap(db, uid),
    readShortlistDocs(db, uid),
    readBlockDocs(db, uid),
    db.collection(COLLECTIONS.INTERESTS).where('senderUid', '==', uid).get(),
    tab === 'shortlisted_you' ? readShortlistedByDocs(db, uid) : Promise.resolve([]),
    tab === 'viewed_by_you' ? readViewDocs(db, uid) : Promise.resolve([]),
    tab === 'viewed_you' ? readViewedByDocs(db, uid) : Promise.resolve([]),
    db.collection(COLLECTIONS.SUBSCRIPTIONS).where('status', '==', 'active').get(),
    getSentPhotoRequestsCol(db, uid).get(),
  ]);

  if (!viewerProfSnap.exists) {
    return {
      success: true,
      matches: [],
      totalCount: 0,
      viewerGender: null,
      targetGender: null,
      viewerPhoto: null,
    };
  }

  const viewer: Record<string, any> = { ...(viewerProfSnap.data() || {}), uid };
  const photoRequestStatusMap = new Map<string, 'pending' | 'approved' | 'declined'>();
  sentPhotoReqSnap.docs.forEach((d) => {
    const st = String(d.data()?.status || 'pending');
    if (st === 'pending' || st === 'approved' || st === 'declined') {
      photoRequestStatusMap.set(String(d.data()?.targetUid || d.id), st);
    }
  });
  const viewerEntitlements = await resolveMemberEntitlements(db, uid, viewer);
  const unlockedContactSet = new Set(viewerEntitlements.unlockedContactUids);
  const viewerPrivate = viewerPrivateSnap.exists ? viewerPrivateSnap.data() || {} : {};
  const viewerPrefs = viewerPrefsSnap.exists ? viewerPrefsSnap.data() || {} : {};
  const viewerGender = normalizeGender(viewer.gender);

  // Enforce Gold/Platinum-only Advanced Filters on the backend
  let lockedAdvancedFilters = false;
  if (!viewerEntitlements.advancedFilters) {
    const advancedKeys: (keyof FilterInput)[] = [
      'annualIncome',
      'occupation',
      'employmentType',
      'eatingHabits',
      'drinkingHabits',
      'smokingHabits',
      'familyStatus',
      'familyType',
      'familyValues',
      'mutualMatchesOnly',
    ];
    for (const key of advancedKeys) {
      if (filters[key] !== undefined && filters[key] !== false && filters[key] !== '') {
        lockedAdvancedFilters = true;
        delete filters[key];
      }
    }
  }
  const viewerPhoto = viewer.profilePhoto
    ? (await resolveMatchPhotoUrls([viewer.profilePhoto]))[0] || null
    : null;

  if (!viewerGender) {
    return {
      success: true,
      matches: [],
      totalCount: 0,
      viewerGender: null,
      targetGender: null,
      viewerPhoto,
    };
  }

  const targetGender: BinaryGender = viewerGender === 'male' ? 'female' : 'male';
  const shortlistedSet = new Set(shortlistDocs.map((d) => d.id));
  const shortlistedBySet = new Set(shortlistedByDocs.map((d) => d.id));
  const viewedMap = new Map<string, number>();
  viewDocs.forEach((d) => {
    viewedMap.set(d.id, toTimestampMs(d.data()?.viewedAt) || toTimestampMs(d.data()?.updatedAt));
  });
  const viewedByMap = new Map<string, number>();
  viewedByDocs.forEach((d) => {
    viewedByMap.set(d.id, toTimestampMs(d.data()?.viewedAt) || toTimestampMs(d.data()?.updatedAt));
  });
  const blockedSet = new Set(blockDocs.map((d) => d.id));
  const interestStatusMap = new Map<string, string>();
  const interestSentAtMap = new Map<string, number>();
  sentInterestsSnap.docs.forEach((doc) => {
    const d = doc.data();
    if (d?.receiverUid) {
      const targetId = String(d.receiverUid);
      interestStatusMap.set(targetId, String(d.status || 'pending'));
      interestSentAtMap.set(
        targetId,
        toTimestampMs(d.updatedAt) || toTimestampMs(d.createdAt)
      );
    }
  });

  const candidatesSnap = await db
    .collection(COLLECTIONS.PROFILES)
    .where('churchId', '==', DEFAULT_CHURCH_ID)
    .where('profileStatus', '==', 'approved')
    .get();

  const activeSubTierByUid = new Map<string, 'silver' | 'gold' | 'platinum'>();
  const nowCheckMs = Date.now();
  activeSubsSnap.docs.forEach((sDoc) => {
    const sData = sDoc.data() || {};
    const sTier = String(sData.tier || '').toLowerCase();
    const sEnd = typeof sData.expiryDateMs === 'number' ? sData.expiryDateMs : 0;
    if (
      (sTier === 'silver' || sTier === 'gold' || sTier === 'platinum') &&
      (sEnd === 0 || sEnd > nowCheckMs)
    ) {
      activeSubTierByUid.set(String(sData.uid || sDoc.id), sTier);
    }
  });

  // Filter strictly opposite gender and non-self / non-dismissed before fetching preferences
  const eligibleDocs = candidatesSnap.docs.filter((doc) => {
    if (doc.id === uid) return false;
    if (blockedSet.has(doc.id)) return false;
    const data = doc.data();
    if (data.visibility === 'hidden') return false;
    const candGender = normalizeGender(data.gender);
    // Strict opposite-gender requirement: men -> women, women -> men only
    return candGender === targetGender;
  });

  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isActivityListTab =
    tab === 'shortlisted' ||
    tab === 'shortlisted_by_you' ||
    tab === 'shortlisted_you' ||
    tab === 'viewed_you' ||
    tab === 'viewed_by_you' ||
    tab === 'looking_for_you';
  const effectiveBasis: 'partner_preferences' | 'all_filters' = isActivityListTab
    ? 'all_filters'
    : matchBasis;

  // Pre-filter cheap metadata & tab membership BEFORE reading subcollections or signing photos
  const candidatePool = eligibleDocs.filter((doc) => {
    const candidate = doc.data();
    const profTier = resolveActiveTierFromProfile(candidate);
    const resolvedTier = profTier !== 'free' ? profTier : activeSubTierByUid.get(doc.id) || 'free';
    if (matchTier === 'prime' && resolvedTier === 'free') {
      return false;
    }

    const isShortlisted = shortlistedSet.has(doc.id);
    const createdOrApprovedMs =
      toTimestampMs(candidate.approvedAt) ||
      toTimestampMs(candidate.submittedAt) ||
      toTimestampMs(candidate.createdAt);

    if ((tab === 'shortlisted' || tab === 'shortlisted_by_you') && !isShortlisted) return false;
    if (tab === 'viewed_you' && !viewedByMap.has(doc.id)) return false;
    if (tab === 'viewed_by_you' && !viewedMap.has(doc.id)) return false;
    if (tab === 'newly_joined' && createdOrApprovedMs > 0 && createdOrApprovedMs < thirtyDaysAgoMs) {
      return false;
    }
    if (filters.createdWithin && filters.createdWithin !== 'all') {
      const refMs = createdOrApprovedMs || toTimestampMs(candidate.updatedAt);
      const daysMap = { today: 1, '3d': 3, '1w': 7, '1m': 30 } as const;
      const cutoffMs = Date.now() - daysMap[filters.createdWithin] * 24 * 60 * 60 * 1000;
      if (!refMs || refMs < cutoffMs) return false;
    }
    return true;
  });

  // Batch-read all candidate prefs & private docs in 2 grouped db.getAll RPCs instead of 2N single .get() calls
  const prefsRefs = candidatePool.map((d) => getPrefsRef(db, d.id));
  const privRefs = candidatePool.map((d) => getPrivateRef(db, d.id));
  const [subDocMap, legacyShortlistFlags] = await Promise.all([
    batchGetDocMap(db, [...prefsRefs, ...privRefs]),
    tab === 'shortlisted_you'
      ? Promise.all(
          candidatePool.map(async (d) => {
            if (shortlistedBySet.has(d.id)) return true;
            const legacy = await getShortlistsCol(db, d.id).doc(uid).get().catch(() => null);
            return Boolean(legacy?.exists);
          })
        )
      : Promise.resolve([] as boolean[]),
  ]);

  // Fallback legacy collections only for UIDs missing subcollection docs
  const missingLegacyPrefsRefs: DocumentReference[] = [];
  const missingLegacyPrivRefs: DocumentReference[] = [];
  candidatePool.forEach((d) => {
    const pSnap = subDocMap.get(getPrefsRef(db, d.id).path);
    if (!pSnap?.exists) missingLegacyPrefsRefs.push(db.collection(COLLECTIONS.PREFERENCES).doc(d.id));
    const vSnap = subDocMap.get(getPrivateRef(db, d.id).path);
    if (!vSnap?.exists) missingLegacyPrivRefs.push(db.collection(COLLECTIONS.PRIVATE).doc(d.id));
  });
  const legacyDocMap =
    missingLegacyPrefsRefs.length > 0 || missingLegacyPrivRefs.length > 0
      ? await batchGetDocMap(db, [...missingLegacyPrefsRefs, ...missingLegacyPrivRefs])
      : new Map<string, DocumentSnapshot>();

  // Step 1: Score & evaluate eligibility WITHOUT expensive GCS photo signing or comparison tables
  const scoredResults = candidatePool.map((doc, idx) => {
      const candidate = doc.data();
      if (tab === 'shortlisted_you' && !legacyShortlistFlags[idx]) {
        return null;
      }

      const subPrefsSnap = subDocMap.get(getPrefsRef(db, doc.id).path);
      const candPrefsSnap = subPrefsSnap?.exists
        ? subPrefsSnap
        : legacyDocMap.get(db.collection(COLLECTIONS.PREFERENCES).doc(doc.id).path);
      const subPrivSnap = subDocMap.get(getPrivateRef(db, doc.id).path);
      const candPrivSnap = subPrivSnap?.exists
        ? subPrivSnap
        : legacyDocMap.get(db.collection(COLLECTIONS.PRIVATE).doc(doc.id).path);

      const candPrefs = candPrefsSnap?.exists ? candPrefsSnap.data() || {} : {};
      const candPriv = candPrivSnap?.exists ? candPrivSnap.data() || {} : {};

      const evaluation = evaluateCompatibility(
        viewer,
        viewerPrivate,
        viewerPrefs,
        candidate,
        candPriv,
        candPrefs,
        filters,
        effectiveBasis
      );

      if (!evaluation.eligible) return null;

      if (tab === 'shared_interests' && evaluation.sharedInterests.length === 0) {
        return null;
      }
      if (!matchesViewerPreferenceTab(tab, viewer, viewerPrefs, candidate, candPrefs)) {
        return null;
      }

      const isShortlisted = shortlistedSet.has(doc.id);
      const createdOrApprovedMs =
        toTimestampMs(candidate.approvedAt) ||
        toTimestampMs(candidate.submittedAt) ||
        toTimestampMs(candidate.createdAt);
      const updatedAtMs = toTimestampMs(candidate.updatedAt) || createdOrApprovedMs;
      const profTier = resolveActiveTierFromProfile(candidate);
      const candTier: 'free' | 'silver' | 'gold' | 'platinum' =
        profTier !== 'free' ? profTier : activeSubTierByUid.get(doc.id) ?? 'free';
      const visibilityPriority = candTier === 'platinum' ? 2 : candTier === 'gold' ? 1 : 0;
      const hasPhoto = Boolean(candidate.profilePhoto);
      const photoCount =
        (candidate.profilePhoto ? 1 : 0) +
        (Array.isArray(candidate.gallery) ? candidate.gallery.length : 0);

      return {
        uid: doc.id,
        candidate,
        candPriv,
        candPrefs,
        evaluation,
        isShortlisted,
        interestStatus: interestStatusMap.get(doc.id) || null,
        interestSentAtMs: interestSentAtMap.get(doc.id) || 0,
        joinedAtMs: createdOrApprovedMs,
        updatedAtMs,
        viewedAtMs:
          tab === 'viewed_you'
            ? viewedByMap.get(doc.id) || 0
            : tab === 'viewed_by_you'
            ? viewedMap.get(doc.id) || 0
            : 0,
        age: typeof candidate.age === 'number' ? candidate.age : null,
        location: candidate.location || {},
        matchScore: evaluation.score,
        sharedInterests: evaluation.sharedInterests,
        candTier,
        visibilityPriority,
        photoCount,
        hasPhoto,
      };
  });

  const validScored = scoredResults.filter((m): m is NonNullable<typeof m> => m !== null);

  const viewerCityNorm = normalizeAnyOption(viewer.location?.village || viewer.location?.city);
  const viewerStateNorm = normalizeAnyOption(viewer.location?.state);
  const viewerCountryNorm = normalizeAnyOption(viewer.location?.country);

  const locationRank = (candLoc: any): number => {
    const cCity = normalizeAnyOption(candLoc?.village || candLoc?.city);
    const cState = normalizeAnyOption(candLoc?.state);
    const cCountry = normalizeAnyOption(candLoc?.country);
    if (viewerCityNorm !== 'any' && cCity === viewerCityNorm) return 3;
    if (viewerStateNorm !== 'any' && cState === viewerStateNorm) return 2;
    if (viewerCountryNorm !== 'any' && cCountry === viewerCountryNorm) return 1;
    return 0;
  };

  // Step 2: Sort lightweight ranked items BEFORE slicing & signing photos
  validScored.sort((a, b) => {
    if (tab === 'viewed_you') {
      const diff = (viewedByMap.get(b.uid) || 0) - (viewedByMap.get(a.uid) || 0);
      if (diff !== 0) return diff;
    }
    if (tab === 'viewed_by_you') {
      const diff = (viewedMap.get(b.uid) || 0) - (viewedMap.get(a.uid) || 0);
      if (diff !== 0) return diff;
    }
    if ((tab === 'nearby' || tab === 'location_pref') && sortBy === 'best_match') {
      const diff = locationRank(b.location) - locationRank(a.location);
      if (diff !== 0) return diff;
    }
    if (sortBy === 'last_active') {
      const aActive = a.updatedAtMs || a.joinedAtMs;
      const bActive = b.updatedAtMs || b.joinedAtMs;
      if (bActive !== aActive) return bActive - aActive;
      return b.matchScore - a.matchScore;
    }
    if (sortBy === 'date_created' || sortBy === 'newest' || tab === 'newly_joined') {
      if (b.joinedAtMs !== a.joinedAtMs) return b.joinedAtMs - a.joinedAtMs;
      return b.matchScore - a.matchScore;
    }
    if (sortBy === 'distance') {
      const diff = locationRank(b.location) - locationRank(a.location);
      if (diff !== 0) return diff;
      return b.matchScore - a.matchScore;
    }
    if (sortBy === 'latest_photos') {
      const aHas = a.photoCount > 0 ? 1 : 0;
      const bHas = b.photoCount > 0 ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      const aTime = a.updatedAtMs || a.joinedAtMs;
      const bTime = b.updatedAtMs || b.joinedAtMs;
      if (bTime !== aTime) return bTime - aTime;
      if (b.photoCount !== a.photoCount) return b.photoCount - a.photoCount;
      return b.matchScore - a.matchScore;
    }
    if (sortBy === 'age_asc') {
      return (a.age ?? 99) - (b.age ?? 99);
    }
    if (sortBy === 'age_desc') {
      return (b.age ?? 0) - (a.age ?? 0);
    }
    if (sortBy === 'most_shared_interests') {
      if (b.sharedInterests.length !== a.sharedInterests.length) {
        return b.sharedInterests.length - a.sharedInterests.length;
      }
      return b.matchScore - a.matchScore;
    }
    // Default: best_match
    // - On PRIME (paid-only): rank by Platinum/Gold tier priority then compatibility score.
    // - On Regular (all paid + free): blend compatibility score with a gentle visibility boost (+6 Platinum, +3 Gold)
    //   so both unpaid (Free) and paid members appear naturally near the top.
    if (matchTier === 'prime') {
      const aTierRank = a.matchScore >= 40 ? (a.visibilityPriority ?? 0) : -1;
      const bTierRank = b.matchScore >= 40 ? (b.visibilityPriority ?? 0) : -1;
      if (bTierRank !== aTierRank) return bTierRank - aTierRank;
    } else {
      const aBoost = a.matchScore >= 40 ? (a.visibilityPriority ?? 0) * 3 : 0;
      const bBoost = b.matchScore >= 40 ? (b.visibilityPriority ?? 0) * 3 : 0;
      const aWeighted = a.matchScore + aBoost;
      const bWeighted = b.matchScore + bBoost;
      if (bWeighted !== aWeighted) return bWeighted - aWeighted;
    }
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (b.sharedInterests.length !== a.sharedInterests.length) {
      return b.sharedInterests.length - a.sharedInterests.length;
    }
    if ((b.hasPhoto ? 1 : 0) !== (a.hasPhoto ? 1 : 0)) {
      return (b.hasPhoto ? 1 : 0) - (a.hasPhoto ? 1 : 0);
    }
    return b.joinedAtMs - a.joinedAtMs;
  });

  // Step 3: Slice only the requested page, pre-dedupe photo signing, and cache scored feed for instant Page 2
  const totalMatchedCount = validScored.length;
  const pageSlice =
    limit !== undefined ? validScored.slice(offset, offset + limit) : validScored.slice(offset);

  const uniquePagePhotoPaths = new Set<string>();
  pageSlice.forEach((item) => {
    if (item.candidate?.profilePhoto) uniquePagePhotoPaths.add(String(item.candidate.profilePhoto));
    if (Array.isArray(item.candidate?.gallery)) {
      item.candidate.gallery.forEach((g: unknown) => {
        if (typeof g === 'string' && g) uniquePagePhotoPaths.add(g);
      });
    }
  });
  const preResolvedPhotoMap = new Map<string, string | null>();
  if (uniquePagePhotoPaths.size > 0) {
    const bucket = getStorage().bucket(MATRIMONY_BUCKET);
    const expires = Date.now() + 60 * 60 * 1000;
    await Promise.all(
      Array.from(uniquePagePhotoPaths).map(async (p) => {
        preResolvedPhotoMap.set(p, await resolveSingleMatchPhotoUrl(bucket, p, expires));
      })
    );
  }

  const validMatches = await Promise.all(
    pageSlice.map((item) =>
      formatMatchCandidatePayload({
        candUid: item.uid,
        viewer,
        viewerPrivate,
        candidate: item.candidate,
        candPriv: item.candPriv,
        candPrefs: item.candPrefs,
        evaluation: item.evaluation,
        isShortlisted: item.isShortlisted,
        interestStatus: item.interestStatus,
        interestSentAtMs: item.interestSentAtMs,
        joinedAtMs: item.joinedAtMs,
        viewedAtMs: item.viewedAtMs,
        viewerEntitlements,
        unlockedContactSet,
        photoRequestStatus: photoRequestStatusMap.get(item.uid) || null,
        candidateTierOverride: item.candTier,
        preResolvedPhotoMap,
      })
    )
  );

  const viewerPreferencesFilter = mapViewerPrefsToFilter(viewerPrefs);
  const preferencesUpdatedAtMs = toTimestampMs(viewerPrefs.updatedAt);

  if (offset === 0) {
    WARM_VIEWER_FEED_CACHE.set(feedCacheKey, {
      expiresAtMs: Date.now() + 10_000,
      viewer,
      viewerPrivate,
      viewerEntitlements,
      unlockedContactSet,
      lockedAdvancedFilters,
      totalMatchedCount,
      totalAvailableCount: eligibleDocs.length,
      hiddenCount: blockDocs.filter((d) => d.data()?.type === 'dont_show').length,
      viewerGender,
      targetGender,
      viewerPhoto,
      viewerPreferencesFilter,
      preferencesUpdatedAtMs,
      photoRequestStatusMap,
      validScored,
    });
    // Cap memory usage for warm container caches
    if (WARM_VIEWER_FEED_CACHE.size > 40) {
      const oldestKey = WARM_VIEWER_FEED_CACHE.keys().next().value;
      if (oldestKey) WARM_VIEWER_FEED_CACHE.delete(oldestKey);
    }
  }

  return {
    success: true,
    matches: validMatches,
    totalCount: totalMatchedCount,
    hasMore: offset + validMatches.length < totalMatchedCount,
    nextOffset: offset + validMatches.length,
    totalAvailableCount: eligibleDocs.length,
    hiddenCount: blockDocs.filter((d) => d.data()?.type === 'dont_show').length,
    viewerGender,
    targetGender,
    viewerPhoto,
    viewerPreferencesFilter,
    preferencesUpdatedAtMs,
    viewerEntitlements,
    lockedAdvancedFilters,
  };
});

/**
 * 2. toggleMatrimonyShortlist
 */
export const toggleMatrimonyShortlist = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const desiredShortlist = optionalBoolean(request.data?.shortlist);
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);
  const ref = getShortlistsCol(db, uid).doc(targetUid);
  const reverseRef = getShortlistedByCol(db, targetUid).doc(uid);
  const legacyRef = db.collection(COLLECTIONS.SHORTLISTS).doc(uid).collection('saved').doc(targetUid);
  const [snap, legacySnap] = await Promise.all([ref.get(), legacyRef.get()]);

  const shouldRemove =
    desiredShortlist !== undefined ? !desiredShortlist : snap.exists || legacySnap.exists;

  if (shouldRemove) {
    await Promise.all([
      ref.delete().catch(() => undefined),
      reverseRef.delete().catch(() => undefined),
      legacyRef.delete().catch(() => undefined),
    ]);
    return { success: true, shortlisted: false };
  }

  // Enforce tier-based shortlist cap (Free: 10, Silver: 25, Gold: 50, Platinum: 70)
  const [entitlements, existingShortlists, prevReverseSnap, senderSnap, targetSnap] = await Promise.all([
    resolveMemberEntitlements(db, uid),
    readShortlistDocs(db, uid),
    reverseRef.get(),
    getProfileRef(db, uid).get(),
    getProfileRef(db, targetUid).get(),
  ]);
  if (
    entitlements.shortlistLimit >= 0 &&
    existingShortlists.length >= entitlements.shortlistLimit
  ) {
    throw new HttpsError(
      'resource-exhausted',
      `Your ${entitlements.planName} plan allows up to ${entitlements.shortlistLimit} shortlisted profiles. Remove one or upgrade to shortlist more.`,
      {
        reasonCode: 'SHORTLIST_LIMIT_REACHED',
        limit: entitlements.shortlistLimit,
        used: existingShortlists.length,
        tier: entitlements.tier,
      }
    );
  }

  const nowMs = Date.now();
  const prevNotifiedAtMs = Number(prevReverseSnap.data()?.lastNotifiedAtMs || 0);
  const senderData = senderSnap.exists ? (senderSnap.data() || {}) : {};
  const targetData = targetSnap.exists ? (targetSnap.data() || {}) : {};
  const sGender = normalizeGender(senderData.gender);
  const tGender = normalizeGender(targetData.gender);
  const shouldNotify =
    nowMs - prevNotifiedAtMs >= 12 * 60 * 60 * 1000 &&
    senderSnap.exists &&
    targetSnap.exists &&
    Boolean(sGender && tGender && sGender !== tGender);

  const now = FieldValue.serverTimestamp();
  await Promise.all([
    ref.set({
      uid,
      targetUid,
      createdAt: now,
    }),
    reverseRef.set(
      {
        viewerUid: uid,
        uid: targetUid,
        createdAt: prevReverseSnap.exists ? prevReverseSnap.data()?.createdAt || now : now,
        updatedAt: now,
        ...(shouldNotify ? { lastNotifiedAtMs: nowMs } : {}),
      },
      { merge: true }
    ),
  ]);

  if (shouldNotify) {
    const canSeePhoto = canViewerSeeCandidatePhotos({
      viewerUid: targetUid,
      candidate: senderData,
      interestStatus: null,
    });
    const thumb =
      canSeePhoto && senderData.profilePhoto
        ? await resolveNotificationPhotoUrl(String(senderData.profilePhoto))
        : null;
    await sendMatrimonyNotification({
      db,
      recipientUid: targetUid,
      recipientProfile: targetData,
      senderUid: uid,
      prefKey: 'shortlist',
      type: 'PROFILE_SHORTLISTED',
      title: 'You were shortlisted!',
      body: `${senderData.displayName || 'A Rhema member'} shortlisted your profile. Take a look!`,
      imageUrl: thumb,
      tag: `matrimony_shortlist_${uid}`,
      data: { targetUid: uid, screen: 'MatrimonyMatches' },
    });
  }

  return { success: true, shortlisted: true };
});

/**
 * 2b. recordMatrimonyProfileView
 * Records that the signed-in member viewed another member's profile.
 */
export const recordMatrimonyProfileView = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  if (uid === targetUid) return { success: true, recorded: false };

  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);

  const viewedByRef = getViewedByCol(db, targetUid).doc(uid);
  const [prevViewedBySnap, senderSnap, targetSnap] = await Promise.all([
    viewedByRef.get(),
    getProfileRef(db, uid).get(),
    getProfileRef(db, targetUid).get(),
  ]);

  const nowMs = Date.now();
  const prevNotifiedAtMs = Number(prevViewedBySnap.data()?.lastNotifiedAtMs || 0);
  const senderData = senderSnap.exists ? (senderSnap.data() || {}) : {};
  const targetData = targetSnap.exists ? (targetSnap.data() || {}) : {};
  const sGender = normalizeGender(senderData.gender);
  const tGender = normalizeGender(targetData.gender);
  const shouldNotify =
    nowMs - prevNotifiedAtMs >= 12 * 60 * 60 * 1000 &&
    senderSnap.exists &&
    targetSnap.exists &&
    Boolean(sGender && tGender && sGender !== tGender);

  const now = FieldValue.serverTimestamp();
  await Promise.all([
    getViewsCol(db, uid).doc(targetUid).set(
      { uid, targetUid, viewedAt: now, updatedAt: now },
      { merge: true }
    ),
    viewedByRef.set(
      {
        viewerUid: uid,
        uid: targetUid,
        viewedAt: now,
        updatedAt: now,
        ...(shouldNotify ? { lastNotifiedAtMs: nowMs } : {}),
      },
      { merge: true }
    ),
  ]);

  if (shouldNotify) {
    const canSeePhoto = canViewerSeeCandidatePhotos({
      viewerUid: targetUid,
      candidate: senderData,
      interestStatus: null,
    });
    const thumb =
      canSeePhoto && senderData.profilePhoto
        ? await resolveNotificationPhotoUrl(String(senderData.profilePhoto))
        : null;
    const pronoun = getObjectPronoun(senderData.gender);
    await sendMatrimonyNotification({
      db,
      recipientUid: targetUid,
      recipientProfile: targetData,
      senderUid: uid,
      prefKey: 'profileViews',
      type: 'PROFILE_VIEW',
      title: 'Rhema Matrimony',
      body: `${senderData.displayName || 'A Rhema member'} viewed your profile. Do you like ${pronoun}?`,
      imageUrl: thumb,
      tag: `matrimony_profile_view_${uid}`,
      data: { targetUid: uid, screen: 'MatrimonyMatches' },
    });
  }

  return { success: true, recorded: true };
});

/**
 * 3. dismissMatrimonyMatch ("Don't Show" / Ignored or Blocked)
 */
export const dismissMatrimonyMatch = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const rawType = optionalString(request.data?.type, 20);
  const blockType: 'dont_show' | 'blocked' = rawType === 'blocked' ? 'blocked' : 'dont_show';
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);

  const batch = db.batch();
  batch.set(getBlocksCol(db, uid).doc(targetUid), {
    uid,
    targetUid,
    type: blockType,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.delete(getShortlistsCol(db, uid).doc(targetUid));
  batch.delete(db.collection(COLLECTIONS.SHORTLISTS).doc(uid).collection('saved').doc(targetUid));
  await batch.commit();

  return { success: true, dismissed: true, type: blockType };
});

/**
 * 3b. restoreMatrimonyMatches (Undo / Unignore / Unblock)
 */
export const restoreMatrimonyMatches = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = optionalString(request.data?.targetUid, 128);
  const rawType = optionalString(request.data?.type, 20);
  const targetType: 'dont_show' | 'blocked' | 'all' =
    rawType === 'blocked' ? 'blocked' : rawType === 'all' ? 'all' : 'dont_show';
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);
  const colRef = getBlocksCol(db, uid);
  const legacyColRef = db.collection(COLLECTIONS.BLOCKS).doc(uid).collection('blocked');

  const matchesTargetType = (docType: unknown) => {
    if (targetType === 'all') return true;
    if (targetType === 'blocked') return docType === 'blocked';
    return !docType || docType === 'dont_show';
  };

  if (targetUid) {
    const [docRef, legacyRef] = [colRef.doc(targetUid), legacyColRef.doc(targetUid)];
    const [snap, legacySnap] = await Promise.all([docRef.get(), legacyRef.get()]);
    let restored = 0;
    if (snap.exists && matchesTargetType(snap.data()?.type)) {
      await docRef.delete();
      restored = 1;
    }
    if (legacySnap.exists && matchesTargetType(legacySnap.data()?.type)) {
      await legacyRef.delete();
      restored = 1;
    }
    return { success: true, restoredCount: restored };
  }

  const [snap, legacySnap] =
    targetType === 'all'
      ? await Promise.all([colRef.get(), legacyColRef.get()])
      : await Promise.all([
          colRef.where('type', '==', targetType).get(),
          legacyColRef.where('type', '==', targetType).get(),
        ]);
  if (snap.empty && legacySnap.empty) {
    return { success: true, restoredCount: 0 };
  }

  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  legacySnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  return { success: true, restoredCount: Math.max(snap.size, legacySnap.size) };
});

/**
 * 3c. getMatrimonyHiddenProfiles
 * Returns ignored ('dont_show') or blocked ('blocked') profiles with basic summary for Account Settings.
 */
export const getMatrimonyHiddenProfiles = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const rawType = optionalString(request.data?.type, 20);
  const targetType: 'dont_show' | 'blocked' = rawType === 'blocked' ? 'blocked' : 'dont_show';
  const db = getFirestore();

  const [, subSnap, legacySnap] = await Promise.all([
    assertMatrimonyProfileActive(db, uid),
    getBlocksCol(db, uid).get(),
    db.collection(COLLECTIONS.BLOCKS).doc(uid).collection('blocked').get(),
  ]);

  const entryMap = new Map<string, number>();
  const collect = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
    docs.forEach((d) => {
      const data = d.data() || {};
      const docType = String(data.type || 'dont_show');
      if (docType !== targetType) return;
      const tUid = String(data.targetUid || d.id);
      if (!tUid || tUid === uid) return;
      const ms = toTimestampMs(data.createdAt);
      if (!entryMap.has(tUid) || ms > (entryMap.get(tUid) || 0)) {
        entryMap.set(tUid, ms);
      }
    });
  };
  collect(subSnap.docs);
  collect(legacySnap.docs);

  if (entryMap.size === 0) {
    return { success: true, profiles: [] };
  }

  const targetUids = Array.from(entryMap.keys());
  const profRefs = targetUids.map((tUid) => getProfileRef(db, tUid));
  const profMap = await batchGetDocMap(db, profRefs);

  let bucket: ReturnType<ReturnType<typeof getStorage>['bucket']> | null = null;
  const expires = Date.now() + 60 * 60 * 1000;

  const profiles = (
    await Promise.all(
      targetUids.map(async (targetUid) => {
        const hiddenAtMs = entryMap.get(targetUid) || 0;
        const profSnap = profMap.get(getProfileRef(db, targetUid).path);
        if (!profSnap?.exists) return null;
        const p = profSnap.data() || {};
        if (p.profileStatus === 'deleted') return null;

        let signedProfilePhoto: string | null = null;
        if (p.profilePhoto && p.photoVisibility !== 'protect_photo') {
          const photoStr = String(p.profilePhoto);
          if (photoStr.startsWith('https://') || photoStr.startsWith('http://')) {
            signedProfilePhoto = photoStr;
          } else {
            if (!bucket) bucket = getStorage().bucket(MATRIMONY_BUCKET);
            signedProfilePhoto = await resolveSingleMatchPhotoUrl(bucket, photoStr, expires);
          }
        }

        return {
          uid: targetUid,
          displayName: String(p.displayName || 'Rhema Member'),
          profileCode: String(p.matrimonyId || `RM${targetUid.slice(0, 7).toUpperCase()}`),
          age: typeof p.age === 'number' ? p.age : null,
          heightCm: typeof p.heightCm === 'number' ? p.heightCm : null,
          occupation: String(
            p.career?.profession ||
              p.career?.occupationCategory ||
              p.education?.qualification ||
              ''
          ).trim(),
          city: String(p.location?.village || p.location?.city || p.location?.state || '').trim(),
          signedProfilePhoto,
          hiddenAtMs,
        };
      })
    )
  )
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.hiddenAtMs || 0) - (a.hiddenAtMs || 0));

  return { success: true, profiles };
});

/**
 * 4. sendMatrimonyInterest
 */
export const sendMatrimonyInterest = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  if (uid === targetUid) {
    throw new HttpsError('invalid-argument', 'Cannot send interest to your own profile.');
  }

  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);
  const [senderSnap, targetSnap, targetMemberSnap] = await Promise.all([
    getProfileRef(db, uid).get(),
    getProfileRef(db, targetUid).get(),
    db
      .collection('Rhema Church')
      .doc(DEFAULT_CHURCH_ID)
      .collection('members')
      .doc(targetUid)
      .get(),
  ]);

  if (!senderSnap.exists || !targetSnap.exists) {
    throw new HttpsError('not-found', 'Profile not found.');
  }

  const sender = senderSnap.data() || {};
  const target = targetSnap.data() || {};
  if (sender.selfDeactivated === true) {
    throw new HttpsError(
      'failed-precondition',
      'Your profile is currently deactivated. Reactivate it in Account Settings to contact members.'
    );
  }
  if (target.selfDeactivated === true) {
    throw new HttpsError(
      'failed-precondition',
      'This profile is currently deactivated.'
    );
  }
  if (sender.profileStatus !== 'approved' || target.profileStatus !== 'approved') {
    throw new HttpsError(
      'failed-precondition',
      'This profile is currently unavailable for sending interests.'
    );
  }
  const sGender = normalizeGender(sender.gender);
  const tGender = normalizeGender(target.gender);
  if (!sGender || !tGender || sGender === tGender) {
    throw new HttpsError('failed-precondition', 'Profiles are not compatible for matching.');
  }

  const entitlements = await resolveMemberEntitlements(db, uid, sender);
  const monthKey = getCurrentMonthKey();
  const nowMs = Date.now();
  const hourKey = new Date(nowMs + 330 * 60 * 1000).toISOString().slice(0, 13);
  const docId = `${uid}_${targetUid}`;
  const reverseDocId = `${targetUid}_${uid}`;
  const interestRef = db.collection(COLLECTIONS.INTERESTS).doc(docId);
  const reverseRef = db.collection(COLLECTIONS.INTERESTS).doc(reverseDocId);
  const usageRef = getUsageRef(db, uid);
  const now = FieldValue.serverTimestamp();

  const txResult = await db.runTransaction(async (tx) => {
    const [existingSnap, reverseSnap, usageSnap] = await Promise.all([
      tx.get(interestRef),
      tx.get(reverseRef),
      tx.get(usageRef),
    ]);

    const reverseStatus = reverseSnap.exists ? reverseSnap.data()?.status : null;
    const isMutual = reverseStatus === 'pending' || reverseStatus === 'accepted';
    const status = isMutual ? 'accepted' : 'pending';

    const usageData = usageSnap.exists ? usageSnap.data() || {} : {};
    const currentMonthCount =
      usageData.currentMonthKey === monthKey ? Number(usageData.interestsSentThisMonth || 0) : 0;
    const currentHourCount =
      usageData.hourKey === hourKey ? Number(usageData.interestsSentThisHour || 0) : 0;
    const lastSentMs = Number(usageData.lastInterestSentAtMs || 0);

    const existingStatus = existingSnap.exists ? String(existingSnap.data()?.status || '') : '';
    const isFreshInterest =
      !existingSnap.exists || existingStatus === 'withdrawn' || existingStatus === 'declined';

    let nextMonthCount = currentMonthCount;
    if (isFreshInterest) {
      if (lastSentMs > 0 && nowMs - lastSentMs < 1500) {
        throw new HttpsError(
          'resource-exhausted',
          'Please wait a moment before sending another interest.',
          { reasonCode: 'COOLDOWN_ACTIVE' }
        );
      }
      if (currentHourCount >= 40) {
        throw new HttpsError(
          'resource-exhausted',
          'Hourly interest limit reached for spam protection. Please try again shortly.',
          { reasonCode: 'HOURLY_BURST_LIMIT' }
        );
      }
      if (
        entitlements.monthlyInterestLimit >= 0 &&
        currentMonthCount >= entitlements.monthlyInterestLimit
      ) {
        throw new HttpsError(
          'resource-exhausted',
          `You have reached your ${entitlements.planName} limit of ${entitlements.monthlyInterestLimit} interests this month. Upgrade to send unlimited interests.`,
          {
            reasonCode: 'MONTHLY_INTEREST_LIMIT_REACHED',
            limit: entitlements.monthlyInterestLimit,
            used: currentMonthCount,
            tier: entitlements.tier,
            monthKey,
          }
        );
      }
      nextMonthCount = currentMonthCount + 1;
      tx.set(
        usageRef,
        {
          uid,
          currentMonthKey: monthKey,
          interestsSentThisMonth: nextMonthCount,
          hourKey,
          interestsSentThisHour: currentHourCount + 1,
          lastInterestSentAtMs: nowMs,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    tx.set(
      interestRef,
      {
        senderUid: uid,
        receiverUid: targetUid,
        status,
        churchId: DEFAULT_CHURCH_ID,
        createdAt: existingSnap.exists ? existingSnap.data()?.createdAt || now : now,
        updatedAt: now,
      },
      { merge: true }
    );

    if (isMutual) {
      tx.set(reverseRef, { status: 'accepted', updatedAt: now }, { merge: true });
      const pair = [uid, targetUid].sort();
      tx.set(
        db.collection(COLLECTIONS.MATCHES).doc(`${pair[0]}_${pair[1]}`),
        {
          participantIds: pair,
          churchId: DEFAULT_CHURCH_ID,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    if (isFreshInterest || isMutual) {
      tx.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
        recipientUid: targetUid,
        senderUid: uid,
        type: isMutual ? 'MUTUAL_MATCH' : 'INTEREST_RECEIVED',
        title: isMutual ? 'New Mutual Match!' : 'New Matrimony Interest',
        body: isMutual
          ? `${sender.displayName || 'A Rhema member'} also expressed interest in your profile.`
          : `${sender.displayName || 'A Rhema member'} sent you a Matrimony interest.`,
        read: false,
        createdAt: now,
      });
    }

    return { isMutual, status, interestsSentThisMonth: nextMonthCount };
  });

  if (txResult.isMutual) {
    await seedMutualMatchChatOnAccept(db, uid, targetUid);
  }

  // Best-effort push notification (respects recipient's notificationPreferences & all registered device tokens)
  try {
    void targetMemberSnap;
    const canSeePhoto = canViewerSeeCandidatePhotos({
      viewerUid: targetUid,
      candidate: sender,
      interestStatus: txResult.status,
    });
    const thumb =
      canSeePhoto && sender.profilePhoto
        ? await resolveNotificationPhotoUrl(String(sender.profilePhoto))
        : null;
    await sendMatrimonyNotification({
      db,
      recipientUid: targetUid,
      recipientProfile: target,
      senderUid: uid,
      prefKey: txResult.isMutual ? 'interestAcceptance' : 'request',
      type: txResult.isMutual ? 'MUTUAL_MATCH' : 'INTEREST_RECEIVED',
      title: txResult.isMutual ? 'New Mutual Match!' : 'New Matrimony Interest',
      body: txResult.isMutual
        ? `${sender.displayName || 'A Rhema member'} also expressed interest in your profile.`
        : `${sender.displayName || 'A Rhema member'} expressed interest in your Matrimony profile.`,
      imageUrl: thumb,
      tag: `matrimony_interest_${uid}`,
      data: { targetUid: uid, screen: 'MatrimonyInterestsHub' },
      writeInAppDoc: false,
    });
  } catch (err) {
    console.warn('sendMatrimonyInterest push warning:', err);
  }

  const interestsRemaining =
    entitlements.monthlyInterestLimit < 0
      ? -1
      : Math.max(0, entitlements.monthlyInterestLimit - txResult.interestsSentThisMonth);

  return {
    success: true,
    interestStatus: txResult.status,
    isMutual: txResult.isMutual,
    interestsSentThisMonth: txResult.interestsSentThisMonth,
    interestsRemaining,
    monthlyInterestLimit: entitlements.monthlyInterestLimit,
  };
});

/**
 * 4b. unlockMatrimonyContact
 * Unlocks verified contact phone & DOB for a target profile, consuming 1 contact credit
 * for Silver (10) / Gold (40) or free for Platinum (-1). Idempotent within active cycle.
 */
export const unlockMatrimonyContact = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
    const uid = requireAuthUid(request);
    const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
    if (uid === targetUid) {
      throw new HttpsError('invalid-argument', 'Cannot unlock your own contact.');
    }

    const db = getFirestore();
    const viewerData = await assertMatrimonyProfileActive(db, uid);
    if (viewerData.selfDeactivated === true) {
      throw new HttpsError(
        'failed-precondition',
        'Your profile is currently deactivated. Reactivate it in Account Settings to unlock contacts.'
      );
    }

    const [targetProfSnap, targetPrivSnap, blockAB, blockBA, entitlements] = await Promise.all([
      getProfileRef(db, targetUid).get(),
      readPrivateSnap(db, targetUid),
      db.collection(COLLECTIONS.BLOCKS).doc(`${uid}_${targetUid}`).get(),
      db.collection(COLLECTIONS.BLOCKS).doc(`${targetUid}_${uid}`).get(),
      resolveMemberEntitlements(db, uid),
    ]);

    if (!targetProfSnap.exists) {
      throw new HttpsError('not-found', 'Profile not found.');
    }
    if (blockAB.exists || blockBA.exists) {
      throw new HttpsError('permission-denied', 'This profile is unavailable.');
    }

    const targetData = targetProfSnap.data() || {};
    if (targetData.profileStatus !== 'approved') {
      throw new HttpsError('failed-precondition', 'Profile is not approved.');
    }
    if (targetData.selfDeactivated === true) {
      throw new HttpsError('failed-precondition', 'This profile is currently deactivated.');
    }
    if (targetData.mobilePrivacy === 'messages_only') {
      throw new HttpsError(
        'failed-precondition',
        'This member prefers to be contacted via Messages only.',
        { reasonCode: 'MOBILE_PRIVACY_MESSAGES_ONLY' }
      );
    }

    if (entitlements.contactNumberLimit === 0 || entitlements.tier === 'free') {
      throw new HttpsError(
        'permission-denied',
        'Upgrade to Silver, Gold, or Platinum to view verified contact details.',
        { reasonCode: 'UPGRADE_REQUIRED', tier: entitlements.tier }
      );
    }

    const targetPriv = targetPrivSnap.exists ? targetPrivSnap.data() || {} : {};
    const contactPhone = String(
      targetPriv.phone || targetPriv.mobile || targetPriv.contactPhone || targetData.phone || ''
    ).trim() || null;
    const dob = String(targetPriv.dob || targetData.dob || '').trim() || null;

    const unlockRef = getUnlockedContactsCol(db, uid).doc(targetUid);
    const usageRef = getUsageRef(db, uid);
    const now = FieldValue.serverTimestamp();
    const nowMs = Date.now();

    const txRes = await db.runTransaction(async (tx) => {
      const [unlockSnap, usageSnap] = await Promise.all([tx.get(unlockRef), tx.get(usageRef)]);
      const unlockData = unlockSnap.exists ? unlockSnap.data() || {} : null;
      const sameCycle =
        unlockData &&
        (!entitlements.subscriptionId ||
          !unlockData.subscriptionId ||
          unlockData.subscriptionId === entitlements.subscriptionId);

      const usageData = usageSnap.exists ? usageSnap.data() || {} : {};
      const currentViewed =
        entitlements.subscriptionId && usageData.subscriptionId === entitlements.subscriptionId
          ? Math.max(
              Number(usageData.contactNumbersViewedCount || 0),
              entitlements.contactNumbersViewedCount
            )
          : entitlements.contactNumbersViewedCount;

      if (sameCycle) {
        return {
          alreadyUnlocked: true,
          contactNumbersViewedCount: currentViewed,
        };
      }

      if (
        entitlements.contactNumberLimit >= 0 &&
        currentViewed >= entitlements.contactNumberLimit
      ) {
        throw new HttpsError(
          'resource-exhausted',
          `You have used all ${entitlements.contactNumberLimit} contact number views in your ${entitlements.planName} plan. Upgrade to Platinum for unlimited contacts.`,
          {
            reasonCode: 'CONTACT_UNLOCK_LIMIT_REACHED',
            limit: entitlements.contactNumberLimit,
            used: currentViewed,
            tier: entitlements.tier,
          }
        );
      }

      const nextViewed = currentViewed + 1;
      tx.set(
        unlockRef,
        {
          targetUid,
          subscriptionId: entitlements.subscriptionId,
          tier: entitlements.tier,
          unlockedAt: now,
          unlockedAtMs: nowMs,
        },
        { merge: true }
      );
      tx.set(
        usageRef,
        {
          uid,
          subscriptionId: entitlements.subscriptionId,
          contactNumbersViewedCount: nextViewed,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        alreadyUnlocked: false,
        contactNumbersViewedCount: nextViewed,
      };
    });

    if (!txRes.alreadyUnlocked) {
      await db.collection(COLLECTIONS.AUDIT_LOGS).add({
        action: 'MATRIMONY_CONTACT_UNLOCKED',
        actorUid: uid,
        targetUid,
        tier: entitlements.tier,
        subscriptionId: entitlements.subscriptionId,
        createdAt: now,
      });
    }

    const contactNumbersRemaining =
      entitlements.contactNumberLimit < 0
        ? -1
        : Math.max(0, entitlements.contactNumberLimit - txRes.contactNumbersViewedCount);

    return {
      success: true,
      alreadyUnlocked: txRes.alreadyUnlocked,
      contactPhone,
      dob,
      contactNumbersViewedCount: txRes.contactNumbersViewedCount,
      contactNumbersRemaining,
    };
  }
);

/**
 * 5. getMatrimonyInterestsHub
 * Returns real received and sent interest records with hydrated candidate profiles.
 */
export const getMatrimonyInterestsHub = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);

  const [
    viewerProfSnap,
    viewerPrivSnap,
    viewerPrefsSnap,
    shortlistDocs,
    receivedSnap,
    sentSnap,
    sentPhotoReqSnap,
  ] = await Promise.all([
    getProfileRef(db, uid).get(),
    readPrivateSnap(db, uid),
    readPrefsSnap(db, uid),
    readShortlistDocs(db, uid),
    db.collection(COLLECTIONS.INTERESTS).where('receiverUid', '==', uid).get(),
    db.collection(COLLECTIONS.INTERESTS).where('senderUid', '==', uid).get(),
    getSentPhotoRequestsCol(db, uid).get(),
  ]);

  if (!viewerProfSnap.exists) {
    return { success: true, received: [], sent: [] };
  }

  const viewer = viewerProfSnap.data() || {};
  const viewerPrivate = viewerPrivSnap.exists ? viewerPrivSnap.data() || {} : {};
  const viewerPrefs = viewerPrefsSnap.exists ? viewerPrefsSnap.data() || {} : {};
  const shortlistedSet = new Set(shortlistDocs.map((d) => d.id));
  const photoReqStatusMap = new Map<string, 'pending' | 'approved' | 'declined'>();
  sentPhotoReqSnap.docs.forEach((d) => {
    const st = String(d.data()?.status || 'pending');
    if (st === 'pending' || st === 'approved' || st === 'declined') {
      photoReqStatusMap.set(String(d.data()?.targetUid || d.id), st);
    }
  });
  const viewerEntitlements = await resolveMemberEntitlements(db, uid, viewer);
  const unlockedContactSet = new Set(viewerEntitlements.unlockedContactUids);

  const normalizeStatus = (raw: unknown): 'pending' | 'accepted' | 'declined' => {
    const s = String(raw || '').toLowerCase();
    if (s === 'accepted' || s === 'replied') return 'accepted';
    if (s === 'declined' || s === 'rejected') return 'declined';
    return 'pending';
  };

  const counterpartUids = new Set<string>();
  const counterpartStatusMap = new Map<string, string>();
  receivedSnap.docs.forEach((d) => {
    const s = d.data()?.senderUid;
    if (s && s !== uid) {
      const k = String(s);
      counterpartUids.add(k);
      counterpartStatusMap.set(k, normalizeStatus(d.data()?.status));
    }
  });
  sentSnap.docs.forEach((d) => {
    const r = d.data()?.receiverUid;
    if (r && r !== uid) {
      const k = String(r);
      counterpartUids.add(k);
      if (!counterpartStatusMap.has(k) || normalizeStatus(d.data()?.status) === 'accepted') {
        counterpartStatusMap.set(k, normalizeStatus(d.data()?.status));
      }
    }
  });

  const candidateMap = new Map<string, Awaited<ReturnType<typeof formatMatchCandidatePayload>>>();

  await Promise.all(
    Array.from(counterpartUids).map(async (otherUid) => {
      const [profSnap, privSnap, prefsSnap] = await Promise.all([
        getProfileRef(db, otherUid).get(),
        readPrivateSnap(db, otherUid),
        readPrefsSnap(db, otherUid),
      ]);
      if (!profSnap.exists) return;
      const candData = profSnap.data() || {};
      if (candData.profileStatus !== 'approved') return;

      const candPriv = privSnap.exists ? privSnap.data() || {} : {};
      const candPrefs = prefsSnap.exists ? prefsSnap.data() || {} : {};
      const evaluation = evaluateCompatibility(
        viewer,
        viewerPrivate,
        viewerPrefs,
        candData,
        candPriv,
        candPrefs,
        {}
      );
      const joinedAtMs =
        toTimestampMs(candData.approvedAt) ||
        toTimestampMs(candData.submittedAt) ||
        toTimestampMs(candData.createdAt);

      const payload = await formatMatchCandidatePayload({
        candUid: otherUid,
        viewer: { ...viewer, uid },
        viewerPrivate,
        candidate: candData,
        candPriv,
        candPrefs,
        evaluation,
        isShortlisted: shortlistedSet.has(otherUid),
        interestStatus: counterpartStatusMap.get(otherUid) || 'pending',
        joinedAtMs,
        viewerEntitlements,
        unlockedContactSet,
        photoRequestStatus: photoReqStatusMap.get(otherUid) || null,
      });
      candidateMap.set(otherUid, payload);
    })
  );

  const received = receivedSnap.docs
    .map((d) => {
      const data = d.data() || {};
      const otherUid = String(data.senderUid || '');
      const cand = candidateMap.get(otherUid);
      if (!cand) return null;
      const status = normalizeStatus(data.status);
      return {
        id: d.id,
        direction: 'received' as const,
        status,
        createdAtMs: toTimestampMs(data.createdAt),
        updatedAtMs: toTimestampMs(data.updatedAt) || toTimestampMs(data.createdAt),
        candidate: { ...cand, interestStatus: status },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.updatedAtMs || b.createdAtMs) - (a.updatedAtMs || a.createdAtMs));

  const sent = sentSnap.docs
    .map((d) => {
      const data = d.data() || {};
      const otherUid = String(data.receiverUid || '');
      const cand = candidateMap.get(otherUid);
      if (!cand) return null;
      const status = normalizeStatus(data.status);
      const createdAtMs = toTimestampMs(data.createdAt);
      const updatedAtMs = toTimestampMs(data.updatedAt) || createdAtMs;
      return {
        id: d.id,
        direction: 'sent' as const,
        status,
        createdAtMs,
        updatedAtMs,
        candidate: {
          ...cand,
          interestStatus: status,
          interestSentAtMs: updatedAtMs,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.updatedAtMs || b.createdAtMs) - (a.updatedAtMs || a.createdAtMs));

  return { success: true, received, sent, viewerEntitlements };
});

/**
 * 6. respondMatrimonyInterest
 * Accept / Decline received interest, or Withdraw sent pending interest.
 */
export const respondMatrimonyInterest = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const action = optionalString(request.data?.action, 20);

  if (action !== 'accept' && action !== 'decline' && action !== 'withdraw') {
    throw new HttpsError('invalid-argument', 'action must be accept, decline, or withdraw.');
  }

  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);
  const now = FieldValue.serverTimestamp();

  if (action === 'withdraw') {
    const sentRef = db.collection(COLLECTIONS.INTERESTS).doc(`${uid}_${targetUid}`);
    const sentSnap = await sentRef.get();
    if (!sentSnap.exists) {
      throw new HttpsError('not-found', 'Interest request not found.');
    }
    if (sentSnap.data()?.status === 'accepted') {
      throw new HttpsError('failed-precondition', 'Accepted interests cannot be withdrawn.');
    }
    await sentRef.delete();
    return { success: true, status: 'withdrawn' };
  }

  const incomingRef = db.collection(COLLECTIONS.INTERESTS).doc(`${targetUid}_${uid}`);
  const incomingSnap = await incomingRef.get();
  if (!incomingSnap.exists) {
    throw new HttpsError('not-found', 'Incoming interest not found.');
  }

  const nextStatus = action === 'accept' ? 'accepted' : 'declined';
  const batch = db.batch();
  batch.update(incomingRef, { status: nextStatus, updatedAt: now });

  if (action === 'accept') {
    batch.set(
      db.collection(COLLECTIONS.INTERESTS).doc(`${uid}_${targetUid}`),
      {
        senderUid: uid,
        receiverUid: targetUid,
        status: 'accepted',
        churchId: DEFAULT_CHURCH_ID,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    const pair = [uid, targetUid].sort();
    batch.set(
      db.collection(COLLECTIONS.MATCHES).doc(`${pair[0]}_${pair[1]}`),
      {
        participantIds: pair,
        churchId: DEFAULT_CHURCH_ID,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
      recipientUid: targetUid,
      senderUid: uid,
      type: 'MUTUAL_MATCH',
      title: 'Interest Accepted!',
      body: 'Your Matrimony interest was accepted.',
      read: false,
      createdAt: now,
    });
  }

  await batch.commit();
  if (action === 'accept') {
    const [, accepterSnap, targetSnap] = await Promise.all([
      seedMutualMatchChatOnAccept(db, uid, targetUid),
      getProfileRef(db, uid).get(),
      getProfileRef(db, targetUid).get(),
    ]);
    const accepterData = accepterSnap.exists ? (accepterSnap.data() || {}) : {};
    const targetData = targetSnap.exists ? (targetSnap.data() || {}) : null;
    const canSeePhoto = canViewerSeeCandidatePhotos({
      viewerUid: targetUid,
      candidate: accepterData,
      interestStatus: 'accepted',
    });
    const thumb =
      canSeePhoto && accepterData.profilePhoto
        ? await resolveNotificationPhotoUrl(String(accepterData.profilePhoto))
        : null;
    await sendMatrimonyNotification({
      db,
      recipientUid: targetUid,
      recipientProfile: targetData,
      senderUid: uid,
      prefKey: 'interestAcceptance',
      type: 'MUTUAL_MATCH',
      title: 'Interest Accepted!',
      body: `${accepterData.displayName || 'A Rhema member'} accepted your Matrimony interest.`,
      imageUrl: thumb,
      tag: `matrimony_interest_accepted_${uid}`,
      data: { targetUid: uid, screen: 'MatrimonyInterestsHub' },
      writeInAppDoc: false,
    });
  }
  return { success: true, status: nextStatus };
});

/**
 * 7. reportMatrimonyProfile
 * Allows an active member to report a profile or chat user; attaches report for Admin review.
 */
export const reportMatrimonyProfile = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const category = assertNonEmptyString(request.data?.category, 'category', 100);
  const reason = optionalString(request.data?.reason, 500) || category;
  const source = request.data?.source === 'chat' ? 'chat' : 'profile';
  const alsoHide = Boolean(request.data?.alsoHide);

  if (uid === targetUid) {
    throw new HttpsError('invalid-argument', 'You cannot report your own profile.');
  }

  const db = getFirestore();
  const reporter = await assertMatrimonyProfileActive(db, uid);

  const [targetSnap, existingReportsSnap] = await Promise.all([
    getProfileRef(db, targetUid).get(),
    db
      .collection(COLLECTIONS.REPORTS)
      .where('targetUid', '==', targetUid)
      .where('reporterUid', '==', uid)
      .get(),
  ]);

  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'Reported profile not found.');
  }

  const hasOpenReport = existingReportsSnap.docs.some(
    (d) => String(d.data()?.status || 'open') === 'open'
  );
  if (hasOpenReport) {
    throw new HttpsError(
      'already-exists',
      'You have already reported this profile. Church Administration is reviewing it.'
    );
  }

  const target = targetSnap.data() || {};
  const now = FieldValue.serverTimestamp();
  const reportRef = db.collection(COLLECTIONS.REPORTS).doc();
  const batch = db.batch();

  batch.set(reportRef, {
    churchId: DEFAULT_CHURCH_ID,
    targetUid,
    targetName: target.displayName || 'Rhema Member',
    targetCode: target.matrimonyId || `RM${targetUid.slice(0, 7).toUpperCase()}`,
    reporterUid: uid,
    reporterName: reporter.displayName || 'Rhema Member',
    reporterCode: reporter.matrimonyId || `RM${uid.slice(0, 7).toUpperCase()}`,
    category,
    reason,
    source,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(
    getAdminProfileRef(db, targetUid),
    {
      openReportCount: FieldValue.increment(1),
      totalReportCount: FieldValue.increment(1),
      lastReportedAt: now,
      lastReportCategory: category,
      lastReportReason: reason,
    },
    { merge: true }
  );

  if (alsoHide) {
    batch.set(getBlocksCol(db, uid).doc(targetUid), {
      uid,
      targetUid,
      type: 'dont_show',
      createdAt: now,
    });
    batch.delete(getShortlistsCol(db, uid).doc(targetUid));
  }

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_PROFILE_REPORTED',
    actorUid: uid,
    targetUid,
    reportId: reportRef.id,
    category,
    reason,
    source,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();

  return {
    success: true,
    reportId: reportRef.id,
    hidden: alsoHide,
  };
});

function invalidateWarmFeedForUid(uid: string): void {
  const prefix = `${uid}|`;
  for (const key of Array.from(WARM_VIEWER_FEED_CACHE.keys())) {
    if (key.startsWith(prefix)) WARM_VIEWER_FEED_CACHE.delete(key);
  }
}

/**
 * 8. requestMatrimonyPhotoAccess
 * Requests permission from a member with Protect Photo / restricted photos to view their photo.
 */
export const requestMatrimonyPhotoAccess = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
    const uid = requireAuthUid(request);
    const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
    if (uid === targetUid) {
      throw new HttpsError('invalid-argument', 'Cannot request access to your own photo.');
    }

    const db = getFirestore();
    const sender = await assertMatrimonyProfileActive(db, uid);
    if (sender.selfDeactivated === true) {
      throw new HttpsError(
        'failed-precondition',
        'Your profile is currently deactivated. Reactivate it in Account Settings to send photo requests.'
      );
    }

    const [targetSnap, targetMemberSnap, viewerBlocks, targetBlocks] = await Promise.all([
      getProfileRef(db, targetUid).get(),
      db
        .collection('Rhema Church')
        .doc(DEFAULT_CHURCH_ID)
        .collection('members')
        .doc(targetUid)
        .get(),
      readBlockDocs(db, uid),
      readBlockDocs(db, targetUid),
    ]);

    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'Member profile not found.');
    }
    const target = targetSnap.data() || {};
    if (target.profileStatus !== 'approved' || target.selfDeactivated === true) {
      throw new HttpsError('failed-precondition', 'This profile is currently unavailable.');
    }
    if (
      viewerBlocks.some((d) => d.id === targetUid && d.data()?.type === 'blocked') ||
      targetBlocks.some((d) => d.id === uid && d.data()?.type === 'blocked')
    ) {
      throw new HttpsError('permission-denied', 'Cannot request photo access for this member.');
    }

    const allowedUids: string[] = Array.isArray(target.protectedPhotoAllowedUids)
      ? target.protectedPhotoAllowedUids
      : [];
    if (allowedUids.includes(uid)) {
      return { success: true, status: 'approved', alreadyAllowed: true };
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(
      getPhotoRequestsCol(db, targetUid).doc(uid),
      {
        uid: targetUid,
        requesterUid: uid,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getSentPhotoRequestsCol(db, uid).doc(targetUid),
      {
        uid,
        targetUid,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
      recipientUid: targetUid,
      senderUid: uid,
      type: 'PHOTO_REQUEST_RECEIVED',
      title: 'Photo Access Request',
      body: `${sender.displayName || 'A Rhema member'} requested to view your protected photo.`,
      read: false,
      createdAt: now,
    });
    await batch.commit();

    invalidateWarmFeedForUid(uid);

    try {
      void targetMemberSnap;
      const canSeePhoto = canViewerSeeCandidatePhotos({
        viewerUid: targetUid,
        candidate: sender,
        interestStatus: null,
      });
      const thumb =
        canSeePhoto && sender.profilePhoto
          ? await resolveNotificationPhotoUrl(String(sender.profilePhoto))
          : null;
      await sendMatrimonyNotification({
        db,
        recipientUid: targetUid,
        recipientProfile: target,
        senderUid: uid,
        prefKey: 'request',
        type: 'PHOTO_REQUEST_RECEIVED',
        title: 'Photo Access Request',
        body: `${sender.displayName || 'A Rhema member'} requested to view your protected photo.`,
        imageUrl: thumb,
        tag: `matrimony_photo_req_${uid}`,
        data: { targetUid: uid, screen: 'MatrimonyPrivacySettings' },
        writeInAppDoc: false,
      });
    } catch (err) {
      console.warn('requestMatrimonyPhotoAccess push warning:', err);
    }

    return { success: true, status: 'pending', alreadyAllowed: false };
  }
);

/**
 * 9. getMatrimonyPhotoRequests
 * Lists incoming photo access requests received by the signed-in member.
 */
export const getMatrimonyPhotoRequests = onCall(
  { invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 10, maxInstances: 10 },
  async (request) => {
    const uid = requireAuthUid(request);
    const db = getFirestore();
    const viewer = await assertMatrimonyProfileActive(db, uid);

    const [
      reqSnap,
      viewerPrivSnap,
      viewerPrefsSnap,
      shortlistDocs,
      receivedIntSnap,
      sentIntSnap,
      sentPhotoReqSnap,
    ] = await Promise.all([
      getPhotoRequestsCol(db, uid).get(),
      readPrivateSnap(db, uid),
      readPrefsSnap(db, uid),
      readShortlistDocs(db, uid),
      db.collection(COLLECTIONS.INTERESTS).where('receiverUid', '==', uid).get(),
      db.collection(COLLECTIONS.INTERESTS).where('senderUid', '==', uid).get(),
      getSentPhotoRequestsCol(db, uid).get(),
    ]);
    if (reqSnap.empty) {
      return { success: true, requests: [] };
    }

    const reqEntries = reqSnap.docs
      .map((d) => {
        const data = d.data() || {};
        const requesterUid = String(data.requesterUid || d.id);
        const statusRaw = String(data.status || 'pending');
        const status: 'pending' | 'approved' | 'declined' =
          statusRaw === 'approved' || statusRaw === 'declined' ? statusRaw : 'pending';
        return {
          requesterUid,
          status,
          createdAtMs: toTimestampMs(data.createdAt),
          updatedAtMs: toTimestampMs(data.updatedAt),
        };
      })
      .filter((r) => r.requesterUid && r.requesterUid !== uid);

    if (reqEntries.length === 0) {
      return { success: true, requests: [] };
    }

    const viewerPrivate = viewerPrivSnap.exists ? viewerPrivSnap.data() || {} : {};
    const viewerPrefs = viewerPrefsSnap.exists ? viewerPrefsSnap.data() || {} : {};
    const shortlistedSet = new Set(shortlistDocs.map((d) => d.id));
    const viewerEntitlements = await resolveMemberEntitlements(db, uid, viewer);
    const unlockedContactSet = new Set(viewerEntitlements.unlockedContactUids);

    const normalizeStatus = (raw: unknown): 'pending' | 'accepted' | 'declined' => {
      const s = String(raw || '').toLowerCase();
      if (s === 'accepted' || s === 'replied') return 'accepted';
      if (s === 'declined' || s === 'rejected') return 'declined';
      return 'pending';
    };
    const interestStatusByUid = new Map<string, string>();
    receivedIntSnap.docs.forEach((d) => {
      const s = String(d.data()?.senderUid || '');
      if (s) interestStatusByUid.set(s, normalizeStatus(d.data()?.status));
    });
    sentIntSnap.docs.forEach((d) => {
      const r = String(d.data()?.receiverUid || '');
      const st = normalizeStatus(d.data()?.status);
      if (r && (!interestStatusByUid.has(r) || st === 'accepted')) {
        interestStatusByUid.set(r, st);
      }
    });

    const sentPhotoReqStatusMap = new Map<string, 'pending' | 'approved' | 'declined'>();
    sentPhotoReqSnap.docs.forEach((d) => {
      const st = String(d.data()?.status || 'pending');
      if (st === 'pending' || st === 'approved' || st === 'declined') {
        sentPhotoReqStatusMap.set(String(d.data()?.targetUid || d.id), st);
      }
    });

    const profMap = await batchGetDocMap(
      db,
      reqEntries.map((r) => getProfileRef(db, r.requesterUid))
    );

    const requests = (
      await Promise.all(
        reqEntries.map(async (entry) => {
          const profSnap = profMap.get(getProfileRef(db, entry.requesterUid).path);
          if (!profSnap?.exists) return null;
          const p = profSnap.data() || {};
          if (p.profileStatus === 'deleted') return null;

          const [candPrivSnap, candPrefsSnap] = await Promise.all([
            readPrivateSnap(db, entry.requesterUid),
            readPrefsSnap(db, entry.requesterUid),
          ]);
          const candPriv = candPrivSnap.exists ? candPrivSnap.data() || {} : {};
          const candPrefs = candPrefsSnap.exists ? candPrefsSnap.data() || {} : {};
          const evaluation = evaluateCompatibility(
            viewer,
            viewerPrivate,
            viewerPrefs,
            p,
            candPriv,
            candPrefs,
            {}
          );
          const joinedAtMs =
            toTimestampMs(p.approvedAt) ||
            toTimestampMs(p.submittedAt) ||
            toTimestampMs(p.createdAt);

          const candidate = await formatMatchCandidatePayload({
            candUid: entry.requesterUid,
            viewer: { ...viewer, uid },
            viewerPrivate,
            candidate: p,
            candPriv,
            candPrefs,
            evaluation,
            isShortlisted: shortlistedSet.has(entry.requesterUid),
            interestStatus: interestStatusByUid.get(entry.requesterUid) || null,
            joinedAtMs,
            ...(viewerEntitlements ? { viewerEntitlements } : {}),
            unlockedContactSet,
            photoRequestStatus: sentPhotoReqStatusMap.get(entry.requesterUid) || null,
          });

          return {
            uid: entry.requesterUid,
            displayName: candidate.displayName,
            profileCode: candidate.profileCode,
            age: candidate.age,
            heightCm: candidate.heightCm,
            occupation: String(
              p.career?.profession ||
                p.career?.occupationCategory ||
                p.education?.qualification ||
                ''
            ).trim(),
            city: String(p.location?.village || p.location?.city || p.location?.state || '').trim(),
            signedProfilePhoto: candidate.signedProfilePhoto,
            status: entry.status,
            createdAtMs: entry.createdAtMs,
            updatedAtMs: entry.updatedAtMs,
            candidate,
          };
        })
      )
    )
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return (b.updatedAtMs || b.createdAtMs) - (a.updatedAtMs || a.createdAtMs);
      });

    return { success: true, requests };
  }
);

/**
 * 10. respondMatrimonyPhotoRequest
 * Approves or declines a member's request to view your protected photos.
 */
export const respondMatrimonyPhotoRequest = onCall(
  { invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 10, maxInstances: 10 },
  async (request) => {
    const uid = requireAuthUid(request);
    const requesterUid = assertNonEmptyString(request.data?.requesterUid, 'requesterUid', 128);
    const actionRaw = assertNonEmptyString(request.data?.action, 'action', 20).toLowerCase();
    if (actionRaw !== 'approve' && actionRaw !== 'decline') {
      throw new HttpsError('invalid-argument', 'Action must be approve or decline.');
    }

    const db = getFirestore();
    const owner = await assertMatrimonyProfileActive(db, uid);
    const nextStatus: 'approved' | 'declined' = actionRaw === 'approve' ? 'approved' : 'declined';
    const now = FieldValue.serverTimestamp();

    const batch = db.batch();
    batch.set(
      getPhotoRequestsCol(db, uid).doc(requesterUid),
      {
        uid,
        requesterUid,
        status: nextStatus,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getSentPhotoRequestsCol(db, requesterUid).doc(uid),
      {
        uid: requesterUid,
        targetUid: uid,
        status: nextStatus,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getProfileRef(db, uid),
      {
        protectedPhotoAllowedUids:
          nextStatus === 'approved'
            ? FieldValue.arrayUnion(requesterUid)
            : FieldValue.arrayRemove(requesterUid),
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getAdminProfileRef(db, uid),
      {
        protectedPhotoAllowedUids:
          nextStatus === 'approved'
            ? FieldValue.arrayUnion(requesterUid)
            : FieldValue.arrayRemove(requesterUid),
        updatedAt: now,
      },
      { merge: true }
    );
    if (nextStatus === 'approved') {
      batch.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
        recipientUid: requesterUid,
        senderUid: uid,
        type: 'PHOTO_REQUEST_APPROVED',
        title: 'Photo Request Approved',
        body: `${owner.displayName || 'A Rhema member'} allowed you to view their protected photo.`,
        read: false,
        createdAt: now,
      });
    }
    await batch.commit();

    invalidateWarmFeedForUid(requesterUid);
    invalidateWarmFeedForUid(uid);

    if (nextStatus === 'approved') {
      try {
        const thumb = owner.profilePhoto
          ? await resolveNotificationPhotoUrl(String(owner.profilePhoto))
          : null;
        await sendMatrimonyNotification({
          db,
          recipientUid: requesterUid,
          senderUid: uid,
          type: 'PHOTO_REQUEST_APPROVED',
          title: 'Photo Request Approved',
          body: `${owner.displayName || 'A Rhema member'} allowed you to view their protected photo.`,
          imageUrl: thumb,
          tag: `matrimony_photo_approved_${uid}`,
          data: { targetUid: uid, screen: 'MatrimonyMatches' },
          writeInAppDoc: false,
        });
      } catch (err) {
        console.warn('respondMatrimonyPhotoRequest push warning:', err);
      }
    }

    return { success: true, status: nextStatus };
  }
);

/**
 * 11. getMatrimonyNotificationsFeed
 * Returns the signed-in member's Rhema Matrimony in-app notifications inbox,
 * enriched with viewer-safe sender metadata and hydrated match cards.
 */
export const getMatrimonyNotificationsFeed = onCall(
  { invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 10, maxInstances: 10 },
  async (request) => {
    const uid = requireAuthUid(request);
    const db = getFirestore();

    const [
      viewerSnap,
      notifSnap,
      viewerPrivSnap,
      viewerPrefsSnap,
      shortlistDocs,
      receivedIntSnap,
      sentIntSnap,
      sentPhotoReqSnap,
      photoReqSnap,
    ] = await Promise.all([
      getProfileRef(db, uid).get(),
      db.collection(COLLECTIONS.NOTIFICATIONS).where('recipientUid', '==', uid).limit(120).get(),
      readPrivateSnap(db, uid),
      readPrefsSnap(db, uid),
      readShortlistDocs(db, uid),
      db.collection(COLLECTIONS.INTERESTS).where('receiverUid', '==', uid).get(),
      db.collection(COLLECTIONS.INTERESTS).where('senderUid', '==', uid).get(),
      getSentPhotoRequestsCol(db, uid).get(),
      getPhotoRequestsCol(db, uid).get(),
    ]);

    if (notifSnap.empty) {
      return { success: true, notifications: [], unreadCount: 0 };
    }

    const viewer = viewerSnap.exists ? { ...(viewerSnap.data() || {}), uid } : { uid };
    const viewerPrivate = viewerPrivSnap.exists ? viewerPrivSnap.data() || {} : {};
    const viewerPrefs = viewerPrefsSnap.exists ? viewerPrefsSnap.data() || {} : {};
    const viewerEntitlements = viewerSnap.exists
      ? await resolveMemberEntitlements(db, uid, viewer)
      : undefined;
    const unlockedContactSet = new Set(viewerEntitlements?.unlockedContactUids || []);
    const shortlistedSet = new Set(shortlistDocs.map((d) => d.id));

    const normalizeStatus = (raw: unknown): 'pending' | 'accepted' | 'declined' => {
      const s = String(raw || '').toLowerCase();
      if (s === 'accepted' || s === 'replied') return 'accepted';
      if (s === 'declined' || s === 'rejected') return 'declined';
      return 'pending';
    };
    const interestStatusByUid = new Map<string, string>();
    receivedIntSnap.docs.forEach((d) => {
      const s = String(d.data()?.senderUid || '');
      if (s) interestStatusByUid.set(s, normalizeStatus(d.data()?.status));
    });
    sentIntSnap.docs.forEach((d) => {
      const r = String(d.data()?.receiverUid || '');
      const st = normalizeStatus(d.data()?.status);
      if (r && (!interestStatusByUid.has(r) || st === 'accepted')) {
        interestStatusByUid.set(r, st);
      }
    });

    const sentPhotoReqStatusMap = new Map<string, 'pending' | 'approved' | 'declined'>();
    sentPhotoReqSnap.docs.forEach((d) => {
      const st = String(d.data()?.status || 'pending');
      if (st === 'pending' || st === 'approved' || st === 'declined') {
        sentPhotoReqStatusMap.set(String(d.data()?.targetUid || d.id), st);
      }
    });
    const incomingPhotoReqStatusMap = new Map<string, 'pending' | 'approved' | 'declined'>();
    photoReqSnap.docs.forEach((d) => {
      const st = String(d.data()?.status || 'pending');
      if (st === 'pending' || st === 'approved' || st === 'declined') {
        incomingPhotoReqStatusMap.set(String(d.data()?.requesterUid || d.id), st);
      }
    });

    const sortedDocs = notifSnap.docs
      .map((d) => ({ id: d.id, data: d.data() || {}, createdAtMs: toTimestampMs(d.data()?.createdAt) }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 80);

    const uniqueSenderUids = Array.from(
      new Set(
        sortedDocs
          .map((item) => (typeof item.data.senderUid === 'string' ? item.data.senderUid.trim() : ''))
          .filter((s) => Boolean(s) && s !== uid)
      )
    );

    const candidateByUid = new Map<string, any>();
    if (uniqueSenderUids.length > 0) {
      const profMap = await batchGetDocMap(
        db,
        uniqueSenderUids.map((sUid) => getProfileRef(db, sUid))
      );
      await Promise.all(
        uniqueSenderUids.map(async (sUid) => {
          const profSnap = profMap.get(getProfileRef(db, sUid).path);
          if (!profSnap?.exists) return;
          const p = profSnap.data() || {};
          if (p.profileStatus === 'deleted') return;

          const [candPrivSnap, candPrefsSnap] = await Promise.all([
            readPrivateSnap(db, sUid),
            readPrefsSnap(db, sUid),
          ]);
          const candPriv = candPrivSnap.exists ? candPrivSnap.data() || {} : {};
          const candPrefs = candPrefsSnap.exists ? candPrefsSnap.data() || {} : {};
          const evaluation = evaluateCompatibility(
            viewer,
            viewerPrivate,
            viewerPrefs,
            p,
            candPriv,
            candPrefs,
            {}
          );
          const joinedAtMs =
            toTimestampMs(p.approvedAt) ||
            toTimestampMs(p.submittedAt) ||
            toTimestampMs(p.createdAt);

          const candidate = await formatMatchCandidatePayload({
            candUid: sUid,
            viewer,
            viewerPrivate,
            candidate: p,
            candPriv,
            candPrefs,
            evaluation,
            isShortlisted: shortlistedSet.has(sUid),
            interestStatus: interestStatusByUid.get(sUid) || null,
            joinedAtMs,
            ...(viewerEntitlements ? { viewerEntitlements } : {}),
            unlockedContactSet,
            photoRequestStatus:
              sentPhotoReqStatusMap.get(sUid) ||
              incomingPhotoReqStatusMap.get(sUid) ||
              null,
          });
          candidateByUid.set(sUid, candidate);
        })
      );
    }

    const INTERACTION_TYPES = new Set([
      'PROFILE_VIEW',
      'PROFILE_SHORTLISTED',
      'INTEREST_RECEIVED',
      'MUTUAL_MATCH',
      'PHOTO_REQUEST_RECEIVED',
      'PHOTO_REQUEST_APPROVED',
    ]);
    const URGENT_TYPES = new Set([
      'INTEREST_RECEIVED',
      'PHOTO_REQUEST_RECEIVED',
      'MUTUAL_MATCH',
      'MEMBERSHIP_OFFERS',
      'PROFILE_REJECTED',
      'CORRECTION_REQUESTED',
    ]);

    let unreadCount = 0;
    const notifications = sortedDocs.map((entry) => {
      const d = entry.data;
      const type = String(d.type || 'GENERAL');
      const senderUid = typeof d.senderUid === 'string' && d.senderUid.trim() ? d.senderUid.trim() : null;
      const candidate = senderUid ? candidateByUid.get(senderUid) || null : null;
      const read = d.read === true;
      if (!read) unreadCount += 1;

      const isInteraction = INTERACTION_TYPES.has(type);
      const isUrgent = URGENT_TYPES.has(type);

      let actionType:
        | 'view_profile'
        | 'view_matches'
        | 'view_photo_requests'
        | 'view_interests'
        | 'view_offers'
        | 'view_status' = 'view_matches';
      let actionLabel = 'View matches';

      if (candidate && (isInteraction || type === 'DAILY_RECOMMENDATION')) {
        actionType = 'view_profile';
        actionLabel = 'View profile';
      } else if (type === 'PHOTO_REQUEST_RECEIVED') {
        actionType = 'view_photo_requests';
        actionLabel = 'View request';
      } else if (type === 'INTEREST_RECEIVED' || type === 'MUTUAL_MATCH') {
        actionType = 'view_interests';
        actionLabel = 'View interest';
      } else if (type === 'MEMBERSHIP_OFFERS') {
        actionType = 'view_offers';
        actionLabel = 'View offers';
      } else if (
        type === 'PROFILE_APPROVED' ||
        type === 'PROFILE_REJECTED' ||
        type === 'CORRECTION_REQUESTED' ||
        type === 'PROFILE_INACTIVATED'
      ) {
        actionType = 'view_status';
        actionLabel = 'View status';
      }

      const senderPhoto = candidate
        ? candidate.signedProfilePhoto || null
        : typeof d.imageUrl === 'string' && d.imageUrl.startsWith('https://')
          ? d.imageUrl
          : null;

      let incomingPhotoRequestStatus: 'pending' | 'approved' | 'declined' | null = null;
      if (type === 'PHOTO_REQUEST_RECEIVED' && senderUid) {
        const reqSt = incomingPhotoReqStatusMap.get(senderUid);
        const allowedList: string[] = Array.isArray((viewer as any).protectedPhotoAllowedUids)
          ? (viewer as any).protectedPhotoAllowedUids
          : [];
        if (allowedList.includes(senderUid)) {
          incomingPhotoRequestStatus = 'approved';
        } else if (reqSt === 'approved' || reqSt === 'declined' || reqSt === 'pending') {
          incomingPhotoRequestStatus = reqSt;
        } else {
          incomingPhotoRequestStatus = 'pending';
        }
      }

      return {
        id: entry.id,
        type,
        prefKey: typeof d.prefKey === 'string' ? d.prefKey : null,
        category: isInteraction ? 'interactions' : 'alerts',
        isUrgent,
        senderUid,
        senderName: candidate?.displayName || null,
        senderGender: candidate?.gender || null,
        senderPhoto,
        title: String(d.title || 'Rhema Matrimony'),
        body: String(d.body || ''),
        read,
        createdAtMs: entry.createdAtMs,
        actionType,
        actionLabel,
        incomingPhotoRequestStatus,
        candidate,
      };
    });

    return {
      success: true,
      notifications,
      unreadCount,
    };
  }
);

/**
 * 12. manageMatrimonyNotification
 * Marks one or all notifications as read, or deletes a notification owned by the caller.
 */
export const manageMatrimonyNotification = onCall(
  { invoker: 'public' },
  async (request) => {
    const uid = requireAuthUid(request);
    const action = assertNonEmptyString(request.data?.action, 'action', 30).toLowerCase();
    const notificationId = optionalString(request.data?.notificationId, 128);
    const db = getFirestore();

    if (action === 'mark_all_read') {
      const snap = await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .where('recipientUid', '==', uid)
        .get();
      const unreadDocs = snap.docs.filter((d) => d.data()?.read !== true);
      if (unreadDocs.length > 0) {
        const CHUNK = 400;
        for (let i = 0; i < unreadDocs.length; i += CHUNK) {
          const batch = db.batch();
          unreadDocs.slice(i, i + CHUNK).forEach((d) => {
            batch.update(d.ref, { read: true, readAt: FieldValue.serverTimestamp() });
          });
          await batch.commit();
        }
      }
      return { success: true, updated: unreadDocs.length };
    }

    if (!notificationId) {
      throw new HttpsError('invalid-argument', 'notificationId is required.');
    }

    const ref = db.collection(COLLECTIONS.NOTIFICATIONS).doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists) {
      return { success: true, deleted: action === 'delete', read: action === 'mark_read' };
    }
    if (snap.data()?.recipientUid !== uid) {
      throw new HttpsError('permission-denied', 'Cannot modify another user’s notification.');
    }

    if (action === 'mark_read') {
      await ref.update({ read: true, readAt: FieldValue.serverTimestamp() });
      return { success: true, read: true };
    }
    if (action === 'delete') {
      await ref.delete();
      return { success: true, deleted: true };
    }

    throw new HttpsError('invalid-argument', 'Unsupported notification action.');
  }
);

/**
 * 13. getMatrimonyCandidatePhotos
 * Resolves viewer-authorized signed photo URLs for a single candidate profile
 * so live unlocks immediately load real images without requiring a full feed refresh.
 */
export const getMatrimonyCandidatePhotos = onCall(
  { invoker: 'public' },
  async (request) => {
    const uid = requireAuthUid(request);
    const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
    const db = getFirestore();

    const [viewer, targetSnap, sentIntSnap, recvIntSnap, sentPhotoReqSnap] = await Promise.all([
      assertMatrimonyProfileActive(db, uid),
      getProfileRef(db, targetUid).get(),
      db.collection(COLLECTIONS.INTERESTS).doc(`${uid}_${targetUid}`).get(),
      db.collection(COLLECTIONS.INTERESTS).doc(`${targetUid}_${uid}`).get(),
      getSentPhotoRequestsCol(db, uid).doc(targetUid).get(),
    ]);

    if (!targetSnap.exists) {
      return {
        success: true,
        canSeePhotos: false,
        signedProfilePhoto: null,
        signedGallery: [],
      };
    }

    const candidate = targetSnap.data() || {};
    const sentSt = sentIntSnap.exists ? String(sentIntSnap.data()?.status || '') : '';
    const recvSt = recvIntSnap.exists ? String(recvIntSnap.data()?.status || '') : '';
    const interestStatus =
      sentSt === 'accepted' || recvSt === 'accepted'
        ? 'accepted'
        : sentSt || recvSt || null;
    const reqStRaw = sentPhotoReqSnap.exists
      ? String(sentPhotoReqSnap.data()?.status || '')
      : '';
    const photoRequestStatus =
      reqStRaw === 'pending' || reqStRaw === 'approved' || reqStRaw === 'declined'
        ? (reqStRaw as 'pending' | 'approved' | 'declined')
        : null;

    const viewerEntitlements = await resolveMemberEntitlements(db, uid, viewer);
    const canSee = canViewerSeeCandidatePhotos({
      viewerUid: uid,
      candidate,
      interestStatus,
      viewerEntitlements,
      photoRequestStatus,
    });

    if (!canSee) {
      return {
        success: true,
        canSeePhotos: false,
        signedProfilePhoto: null,
        signedGallery: [],
      };
    }

    const rawPaths = [
      typeof candidate.profilePhoto === 'string' ? candidate.profilePhoto : null,
      ...(Array.isArray(candidate.gallery) ? candidate.gallery : []),
    ].filter((x): x is string => Boolean(x));

    const resolved = await resolveMatchPhotoUrls(rawPaths);
    return {
      success: true,
      canSeePhotos: true,
      signedProfilePhoto: resolved[0] || null,
      signedGallery: resolved.slice(1),
    };
  }
);
