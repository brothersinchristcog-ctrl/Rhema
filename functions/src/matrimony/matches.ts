import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getMessaging } from 'firebase-admin/messaging';
import { COLLECTIONS, DEFAULT_CHURCH_ID, MATRIMONY_BUCKET } from './constants.js';
import { seedMutualMatchChatOnAccept } from './chat.js';
import {
  assertMatrimonyProfileActive,
  getAdminProfileRef,
  getBlocksCol,
  getProfileRef,
  getShortlistedByCol,
  getShortlistsCol,
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

function normalizeGender(raw: unknown): BinaryGender | null {
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

function normalizeAnyOption(raw: unknown): string {
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

function toTimestampMs(val: any): number {
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
    interestsScore: number;
    heightScore: number;
    maritalScore: number;
    faithScore: number;
    careerScore: number;
    locationScore: number;
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

function areEducationsClose(aRaw: unknown, bRaw: unknown): 'exact' | 'close' | 'none' {
  const a = String(aRaw || '').trim().toLowerCase();
  const b = String(bRaw || '').trim().toLowerCase();
  if (!a || !b) return 'none';
  if (a === b || a.includes(b) || b.includes(a)) return 'exact';
  const ca = findClusterIndex(a, EDUCATION_CLUSTERS);
  const cb = findClusterIndex(b, EDUCATION_CLUSTERS);
  if (ca !== -1 && ca === cb) return 'close';
  return 'none';
}

function areProfessionsClose(aRaw: unknown, bRaw: unknown): 'exact' | 'close' | 'none' {
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

function evaluateCompatibility(
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
      interestsScore: 0,
      heightScore: 0,
      maritalScore: 0,
      faithScore: 0,
      careerScore: 0,
      locationScore: 0,
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

  // Score A: Age Criteria (14 pts)
  let ageScore = 7;
  if (cAge !== null) {
    if (cAge >= prefAgeMin && cAge <= prefAgeMax) {
      ageScore = 11;
      const cMin = candidatePrefs?.age?.min;
      const cMax = candidatePrefs?.age?.max;
      if (vAge !== null && typeof cMin === 'number' && typeof cMax === 'number' && vAge >= cMin && vAge <= cMax) {
        ageScore = 14;
        matchReasons.push('Mutual age preference');
      } else {
        matchReasons.push('Matches your age preference');
      }
    } else {
      const dist = cAge < prefAgeMin ? prefAgeMin - cAge : cAge - prefAgeMax;
      ageScore = Math.max(0, 9 - dist * 2);
    }
  }

  // Score B: Height + Marital + Mother Tongue + Physical Status (12 pts)
  let heightScore = 3;
  if (cHeight !== null) {
    if (cHeight >= minH && cHeight <= maxH) heightScore = 4;
    else if (Math.abs(cHeight < minH ? minH - cHeight : cHeight - maxH) <= 5) heightScore = 2;
    else heightScore = 0;
  }

  let maritalScore = 3;
  if (prefMaritals.length > 0 && prefMaritals.includes(cMarital)) {
    maritalScore = 3;
  }

  // Mother tongue (pref + mutual tongue bonus)
  let motherTongueScore = 0;
  const prefMT = normalizeAnyOption(viewerPrefs?.motherTongue);
  const candMT = normalizeAnyOption(candidate.motherTongue);
  const viewMT = normalizeAnyOption(viewer.motherTongue);
  if (prefMT !== 'any' && candMT !== 'any' && candMT === prefMT) {
    motherTongueScore = 4;
    matchReasons.push('Same mother tongue');
  } else if (prefMT === 'any' && viewMT !== 'any' && candMT === viewMT) {
    motherTongueScore = 4;
    matchReasons.push('Same mother tongue');
  } else if (prefMT === 'any') {
    motherTongueScore = 2;
  }

  const physicalScore = prefPhys === 'any' || candPhys === prefPhys ? 1 : 0;

  // Score C: Hobbies & Interests Overlap (14 pts)
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

  // Also count overlapping non-empty interest categories (music, sports, reading, hobbies, etc.)
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
    if (sharedInterests.length >= 4) interestsScore = 14;
    else if (sharedInterests.length === 3) interestsScore = 12;
    else if (sharedInterests.length === 2) interestsScore = 10;
    else interestsScore = 8;
    matchReasons.push(
      `${sharedInterests.length} shared ${sharedInterests.length === 1 ? 'interest' : 'interests'}`
    );
  } else if (sharedCategoryCount >= 2) {
    interestsScore = 5;
  } else if (viewerInterestList.length === 0 || candidateInterestList.length === 0) {
    interestsScore = 4;
  }

  // Score D: Religious Information Alignment (14 pts)
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
    faithScore += 2;
  } else {
    faithScore += 1;
  }

  if (candidate.faithSummary?.baptized === true) {
    faithScore += viewer.faithSummary?.baptized === true ? 3 : 2;
  }

  // Score E: Professional Information Closeness & Match (16 pts)
  let careerScore = 0;
  // E1. Education match or closeness (up to 6 pts)
  if (prefEduList.length > 0) {
    const exactOrClose = prefEduList.reduce<'exact' | 'close' | 'none'>((best, e) => {
      const res = areEducationsClose(candEdu, e);
      if (res === 'exact') return 'exact';
      if (res === 'close' && best === 'none') return 'close';
      return best;
    }, 'none');
    if (exactOrClose === 'exact') {
      careerScore += 6;
      matchReasons.push('Matches education preference');
    } else if (exactOrClose === 'close') {
      careerScore += 5;
      matchReasons.push('Close education field');
    } else {
      careerScore += 1;
    }
  } else {
    const vsViewerEdu = areEducationsClose(candEdu, viewer.education?.qualification);
    if (vsViewerEdu === 'exact') {
      careerScore += 6;
      matchReasons.push('Similar education');
    } else if (vsViewerEdu === 'close') {
      careerScore += 5;
      matchReasons.push('Close education field');
    } else {
      careerScore += 3;
    }
  }

  // E2. Occupation match or closeness (up to 5 pts)
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

  // E3. Employment type + Annual Income (up to 5 pts)
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

  // Score F: Location Proximity & Preference (12 pts)
  let locationScore = 0;
  const prefCountries: string[] = Array.isArray(viewerPrefs?.locations?.preferredCountries)
    ? viewerPrefs.locations.preferredCountries.map(normalizeAnyOption).filter((x: string) => x !== 'any')
    : [];
  const candCountry = normalizeAnyOption(candidate.location?.country);
  const viewCountry = normalizeAnyOption(viewer.location?.country);
  if (prefCountries.length === 0) {
    locationScore += candCountry === viewCountry ? 4 : 2;
  } else if (candCountry !== 'any' && prefCountries.includes(candCountry)) {
    locationScore += 4;
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
    locationScore += 4;
    matchReasons.push('Preferred city');
  } else if (candCity !== 'any' && viewCity !== 'any' && candCity === viewCity) {
    locationScore += 4;
    matchReasons.push('Same city');
  } else if (prefCities.length === 0 && viewerPrefs?.locations?.openToRelocation !== false) {
    locationScore += 2;
  }

  // Score G: Mutual Partner Preference Alignment across all 19 criteria (18 pts total, + 4 Habits pts)
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
  const mutualPrefScore = Math.round(((candRatio + viewerRatio) / 2) * 18);
  if (candRatio >= 0.75 && viewerRatio >= 0.75) {
    matchReasons.unshift('High mutual match');
  }

  if (filters.mutualMatchesOnly && (candRatio < 0.65 || viewerRatio < 0.65)) {
    return fail;
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

  // Profile completeness & verified photo trust boost (0-4 pts)
  let trustBonus = 0;
  if (candidate.profilePhoto) trustBonus += 2;
  if (Array.isArray(candidate.gallery) && candidate.gallery.length > 0) trustBonus += 1;
  if (typeof candidate.profileCompletion === 'number' && candidate.profileCompletion >= 85) {
    trustBonus += 1;
  }

  const totalScore = Math.min(
    100,
    Math.round(
      ageScore +
        heightScore +
        maritalScore +
        motherTongueScore +
        physicalScore +
        interestsScore +
        faithScore +
        careerScore +
        locationScore +
        mutualPrefScore +
        habitsScore +
        trustBonus
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
      interestsScore,
      heightScore,
      maritalScore: maritalScore + motherTongueScore + physicalScore,
      faithScore,
      careerScore,
      locationScore,
      habitsScore: habitsScore + mutualPrefScore,
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
  } = params;

  const [signedProfilePhoto, signedGallery] = await Promise.all([
    candidate.profilePhoto
      ? resolveMatchPhotoUrls([candidate.profilePhoto]).then((u) => u[0] || null)
      : Promise.resolve(null),
    Array.isArray(candidate.gallery) && candidate.gallery.length > 0
      ? resolveMatchPhotoUrls(candidate.gallery)
      : Promise.resolve([]),
  ]);

  const partnerPreferencesComparison = buildPartnerPrefComparison(
    viewer,
    viewerPrivate,
    candidate,
    candPrefs
  );

  const managedType = String(candPriv?.profileManager?.type || 'self').toLowerCase();
  const viewerTier = String(viewer?.membership?.tier || 'free').toLowerCase();
  const viewerMembershipValidUntilMs = Number(viewer?.membership?.validUntilMs || 0);
  const viewerHasPaidMembership =
    viewerTier !== 'free' &&
    viewer?.membership?.status === 'active' &&
    (viewerMembershipValidUntilMs === 0 || viewerMembershipValidUntilMs > Date.now());
  const canUnlockPrivate = interestStatus === 'accepted' || viewerHasPaidMembership;

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
    dob: canUnlockPrivate ? (candPriv?.dob || null) : null,
    maskedDob: maskDob(candPriv?.dob),
    maskedPhone: maskPhoneNumber(candPriv?.phoneNumber),
    contactPhone: canUnlockPrivate ? (candPriv?.phoneNumber || null) : null,
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
export const getMatrimonyMatches = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);

  const tab = optionalString(request.data?.tab, 30) || 'all';
  const matchBasisRaw = optionalString(request.data?.matchBasis, 30);
  const matchBasis: 'partner_preferences' | 'all_filters' =
    matchBasisRaw === 'all_filters' ? 'all_filters' : 'partner_preferences';
  const sortBy = optionalString(request.data?.sortBy, 30) || 'best_match';
  const rawFilters = (request.data?.filters && typeof request.data.filters === 'object')
    ? request.data.filters
    : {};

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

  const viewer = viewerProfSnap.data() || {};
  const viewerPrivate = viewerPrivateSnap.exists ? viewerPrivateSnap.data() || {} : {};
  const viewerPrefs = viewerPrefsSnap.exists ? viewerPrefsSnap.data() || {} : {};
  const viewerGender = normalizeGender(viewer.gender);
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

  const scoredResults = await Promise.all(
    eligibleDocs.map(async (doc) => {
      const candidate = doc.data();
      const [candPrefsSnap, candPrivSnap] = await Promise.all([
        readPrefsSnap(db, doc.id),
        readPrivateSnap(db, doc.id),
      ]);
      const candPrefs = candPrefsSnap.exists ? candPrefsSnap.data() || {} : {};
      const candPriv = candPrivSnap.exists ? candPrivSnap.data() || {} : {};

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

      const isShortlisted = shortlistedSet.has(doc.id);
      const createdOrApprovedMs =
        toTimestampMs(candidate.approvedAt) ||
        toTimestampMs(candidate.submittedAt) ||
        toTimestampMs(candidate.createdAt);

      if ((tab === 'shortlisted' || tab === 'shortlisted_by_you') && !isShortlisted) return null;
      if (tab === 'shortlisted_you') {
        let didShortlistViewer = shortlistedBySet.has(doc.id);
        if (!didShortlistViewer) {
          const legacyReverse = await getShortlistsCol(db, doc.id).doc(uid).get().catch(() => null);
          didShortlistViewer = Boolean(legacyReverse?.exists);
        }
        if (!didShortlistViewer) return null;
      }
      if (tab === 'viewed_you' && !viewedByMap.has(doc.id)) return null;
      if (tab === 'viewed_by_you' && !viewedMap.has(doc.id)) return null;
      if (tab === 'newly_joined' && createdOrApprovedMs > 0 && createdOrApprovedMs < thirtyDaysAgoMs) {
        return null;
      }
      if (tab === 'shared_interests' && evaluation.sharedInterests.length === 0) {
        return null;
      }
      if (!matchesViewerPreferenceTab(tab, viewer, viewerPrefs, candidate, candPrefs)) {
        return null;
      }
      if (filters.createdWithin && filters.createdWithin !== 'all') {
        const refMs = createdOrApprovedMs || toTimestampMs(candidate.updatedAt);
        const daysMap = { today: 1, '3d': 3, '1w': 7, '1m': 30 } as const;
        const cutoffMs = Date.now() - daysMap[filters.createdWithin] * 24 * 60 * 60 * 1000;
        if (!refMs || refMs < cutoffMs) return null;
      }

      return formatMatchCandidatePayload({
        candUid: doc.id,
        viewer,
        viewerPrivate,
        candidate,
        candPriv,
        candPrefs,
        evaluation,
        isShortlisted,
        interestStatus: interestStatusMap.get(doc.id) || null,
        interestSentAtMs: interestSentAtMap.get(doc.id) || 0,
        joinedAtMs: createdOrApprovedMs,
        viewedAtMs:
          tab === 'viewed_you'
            ? viewedByMap.get(doc.id) || 0
            : tab === 'viewed_by_you'
            ? viewedMap.get(doc.id) || 0
            : 0,
      });
    })
  );

  const validMatches = scoredResults.filter((m): m is NonNullable<typeof m> => m !== null);

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

  validMatches.sort((a, b) => {
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
    // Default: best_match (Compatibility Score desc, then shared interests, then photo, then recent)
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (b.sharedInterests.length !== a.sharedInterests.length) {
      return b.sharedInterests.length - a.sharedInterests.length;
    }
    if ((b.signedProfilePhoto ? 1 : 0) !== (a.signedProfilePhoto ? 1 : 0)) {
      return (b.signedProfilePhoto ? 1 : 0) - (a.signedProfilePhoto ? 1 : 0);
    }
    return b.joinedAtMs - a.joinedAtMs;
  });

  const viewerPreferencesFilter = mapViewerPrefsToFilter(viewerPrefs);
  const preferencesUpdatedAtMs = toTimestampMs(viewerPrefs.updatedAt);

  return {
    success: true,
    matches: validMatches,
    totalCount: validMatches.length,
    totalAvailableCount: eligibleDocs.length,
    hiddenCount: blockDocs.filter((d) => d.data()?.type === 'dont_show').length,
    viewerGender,
    targetGender,
    viewerPhoto,
    viewerPreferencesFilter,
    preferencesUpdatedAtMs,
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

  const now = FieldValue.serverTimestamp();
  await Promise.all([
    ref.set({
      uid,
      targetUid,
      createdAt: now,
    }),
    reverseRef.set({
      viewerUid: uid,
      uid: targetUid,
      createdAt: now,
    }),
  ]);
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
  const now = FieldValue.serverTimestamp();
  await Promise.all([
    getViewsCol(db, uid).doc(targetUid).set(
      { uid, targetUid, viewedAt: now, updatedAt: now },
      { merge: true }
    ),
    getViewedByCol(db, targetUid).doc(uid).set(
      { viewerUid: uid, uid: targetUid, viewedAt: now, updatedAt: now },
      { merge: true }
    ),
  ]);

  return { success: true, recorded: true };
});

/**
 * 3. dismissMatrimonyMatch ("Don't Show")
 */
export const dismissMatrimonyMatch = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);

  const batch = db.batch();
  batch.set(getBlocksCol(db, uid).doc(targetUid), {
    uid,
    targetUid,
    type: 'dont_show',
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.delete(getShortlistsCol(db, uid).doc(targetUid));
  batch.delete(db.collection(COLLECTIONS.SHORTLISTS).doc(uid).collection('saved').doc(targetUid));
  await batch.commit();

  return { success: true, dismissed: true };
});

/**
 * 3b. restoreMatrimonyMatches (Undo / Restore "Don't Show")
 */
export const restoreMatrimonyMatches = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = optionalString(request.data?.targetUid, 128);
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);
  const colRef = getBlocksCol(db, uid);
  const legacyColRef = db.collection(COLLECTIONS.BLOCKS).doc(uid).collection('blocked');

  if (targetUid) {
    const [docRef, legacyRef] = [colRef.doc(targetUid), legacyColRef.doc(targetUid)];
    const [snap, legacySnap] = await Promise.all([docRef.get(), legacyRef.get()]);
    let restored = 0;
    if (snap.exists && snap.data()?.type === 'dont_show') {
      await docRef.delete();
      restored = 1;
    }
    if (legacySnap.exists && legacySnap.data()?.type === 'dont_show') {
      await legacyRef.delete();
      restored = 1;
    }
    return { success: true, restoredCount: restored };
  }

  const [snap, legacySnap] = await Promise.all([
    colRef.where('type', '==', 'dont_show').get(),
    legacyColRef.where('type', '==', 'dont_show').get(),
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
  const [senderSnap, targetSnap] = await Promise.all([
    getProfileRef(db, uid).get(),
    getProfileRef(db, targetUid).get(),
  ]);

  if (!senderSnap.exists || !targetSnap.exists) {
    throw new HttpsError('not-found', 'Profile not found.');
  }

  const sender = senderSnap.data() || {};
  const target = targetSnap.data() || {};
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

  const now = FieldValue.serverTimestamp();
  const docId = `${uid}_${targetUid}`;
  const reverseDocId = `${targetUid}_${uid}`;
  const reverseSnap = await db.collection(COLLECTIONS.INTERESTS).doc(reverseDocId).get();
  const reverseStatus = reverseSnap.exists ? reverseSnap.data()?.status : null;

  const isMutual = reverseStatus === 'pending' || reverseStatus === 'accepted';
  const status = isMutual ? 'accepted' : 'pending';

  const batch = db.batch();
  batch.set(
    db.collection(COLLECTIONS.INTERESTS).doc(docId),
    {
      senderUid: uid,
      receiverUid: targetUid,
      status,
      churchId: DEFAULT_CHURCH_ID,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  if (isMutual) {
    batch.set(
      db.collection(COLLECTIONS.INTERESTS).doc(reverseDocId),
      { status: 'accepted', updatedAt: now },
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
  }

  batch.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
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

  await batch.commit();

  if (isMutual) {
    await seedMutualMatchChatOnAccept(db, uid, targetUid);
  }

  // Best-effort push notification
  try {
    const targetMember = await db
      .collection('Rhema Church')
      .doc(DEFAULT_CHURCH_ID)
      .collection('members')
      .doc(targetUid)
      .get();
    const fcmToken = targetMember.data()?.fcmToken;
    if (fcmToken) {
      await getMessaging().send({
        token: fcmToken,
        notification: {
          title: isMutual ? 'New Mutual Match!' : 'New Matrimony Interest',
          body: `${sender.displayName || 'A Rhema member'} expressed interest in your Matrimony profile.`,
        },
        data: { type: 'MATRIMONY_INTEREST', module: 'matrimony' },
      });
    }
  } catch (err) {
    console.warn('sendMatrimonyInterest push warning:', err);
  }

  return { success: true, interestStatus: status, isMutual };
});

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
  ] = await Promise.all([
    getProfileRef(db, uid).get(),
    readPrivateSnap(db, uid),
    readPrefsSnap(db, uid),
    readShortlistDocs(db, uid),
    db.collection(COLLECTIONS.INTERESTS).where('receiverUid', '==', uid).get(),
    db.collection(COLLECTIONS.INTERESTS).where('senderUid', '==', uid).get(),
  ]);

  if (!viewerProfSnap.exists) {
    return { success: true, received: [], sent: [] };
  }

  const viewer = viewerProfSnap.data() || {};
  const viewerPrivate = viewerPrivSnap.exists ? viewerPrivSnap.data() || {} : {};
  const viewerPrefs = viewerPrefsSnap.exists ? viewerPrefsSnap.data() || {} : {};
  const shortlistedSet = new Set(shortlistDocs.map((d) => d.id));

  const counterpartUids = new Set<string>();
  receivedSnap.docs.forEach((d) => {
    const s = d.data()?.senderUid;
    if (s && s !== uid) counterpartUids.add(String(s));
  });
  sentSnap.docs.forEach((d) => {
    const r = d.data()?.receiverUid;
    if (r && r !== uid) counterpartUids.add(String(r));
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
        viewer,
        viewerPrivate,
        candidate: candData,
        candPriv,
        candPrefs,
        evaluation,
        isShortlisted: shortlistedSet.has(otherUid),
        interestStatus: null,
        joinedAtMs,
      });
      candidateMap.set(otherUid, payload);
    })
  );

  const normalizeStatus = (raw: unknown): 'pending' | 'accepted' | 'declined' => {
    const s = String(raw || '').toLowerCase();
    if (s === 'accepted' || s === 'replied') return 'accepted';
    if (s === 'declined' || s === 'rejected') return 'declined';
    return 'pending';
  };

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

  return { success: true, received, sent };
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
    await seedMutualMatchChatOnAccept(db, uid, targetUid);
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
