import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, DEFAULT_CHURCH_ID, MATRIMONY_BUCKET } from './constants.js';
import { sendMatrimonyNotification } from './notifications.js';
import {
  ensureUniqueMatrimonyId,
  getAdminProfileRef,
  getBanRef,
  getProfileRef,
  getVerificationRef,
  isMatrimonyProfileInactiveStatus,
  purgeMatrimonyUserData,
  readPrefsSnap,
  readPrivateSnap,
  readVerificationSnap,
} from './store.js';
import { assertNonEmptyString, optionalString } from './validation.js';

function buildFirebaseTokenUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function resolveAdminPhotoUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const bucket = getStorage().bucket(MATRIMONY_BUCKET);
  const expires = Date.now() + 60 * 60 * 1000;
  const urls: string[] = [];

  for (const p of paths) {
    if (!p) continue;
    if (p.startsWith('https://')) {
      urls.push(p);
      continue;
    }
    const file = bucket.file(p);
    try {
      const [signedUrl] = await file.getSignedUrl({ action: 'read', expires });
      urls.push(signedUrl);
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
        urls.push(buildFirebaseTokenUrl(MATRIMONY_BUCKET, p, token));
      } catch (metaErr) {
        console.warn(`Unable to sign/tokenize admin matrimony photo ${p}:`, metaErr);
      }
    }
  }
  return urls;
}

async function resolveAdminPhotoUrlsFast(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const bucket = getStorage().bucket(MATRIMONY_BUCKET);
  return Promise.all(
    paths.map(async (p) => {
      if (!p) return '';
      if (p.startsWith('https://')) return p;
      try {
        const file = bucket.file(p);
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
        return buildFirebaseTokenUrl(MATRIMONY_BUCKET, p, token);
      } catch {
        return '';
      }
    })
  );
}

async function signPhotoForAdminFast(photoPath: unknown): Promise<string | null> {
  if (typeof photoPath !== 'string' || !photoPath.trim()) return null;
  const trimmed = photoPath.trim();
  if (trimmed.startsWith('https://')) return trimmed;
  const resolved = await resolveAdminPhotoUrlsFast([trimmed]);
  return resolved[0] || null;
}

async function signPhotoForAdmin(photoPath: unknown): Promise<string | null> {
  if (typeof photoPath !== 'string' || !photoPath.trim()) return null;
  const resolved = await resolveAdminPhotoUrls([photoPath.trim()]);
  return resolved[0] || null;
}

function isAdminRoleRecord(record: Record<string, any> | undefined): boolean {
  if (!record) return false;
  const roleStr = String(record.role || '').toLowerCase();
  const userTypeStr = String(record.userType || '').toLowerCase();
  return (
    record.superadmin === true ||
    record.isSuperAdmin === true ||
    roleStr === 'admin' ||
    roleStr === 'superadmin' ||
    roleStr === 'pastor' ||
    userTypeStr.includes('admin') ||
    userTypeStr.includes('pastor') ||
    userTypeStr.includes('super')
  );
}

export async function requireMatrimonyAdmin(request: {
  auth?: { uid?: string; token?: Record<string, any> };
}): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const token = request.auth?.token || {};
  if (token.matrimonyAdmin === true || token.superadmin === true) {
    return uid;
  }

  const db = getFirestore();
  const [platformSnap, memberSnap, userSnap, churchSnap] = await Promise.all([
    db.collection('platform_admins').doc(uid).get(),
    db.collection('Rhema Church').doc(DEFAULT_CHURCH_ID).collection('members').doc(uid).get(),
    db.collection('users').doc(uid).get(),
    db.collection('Rhema Church').doc(DEFAULT_CHURCH_ID).get(),
  ]);

  if (platformSnap.exists && platformSnap.data()?.superadmin === true) {
    return uid;
  }

  if (memberSnap.exists && isAdminRoleRecord(memberSnap.data())) {
    return uid;
  }

  if (userSnap.exists && isAdminRoleRecord(userSnap.data())) {
    return uid;
  }

  if (churchSnap.exists) {
    const cData = churchSnap.data() || {};
    const adminUids = [cData.adminUid, cData.createdBy, cData.pastorUid, cData.ownerUid].filter(Boolean);
    if (adminUids.includes(uid)) {
      return uid;
    }
  }

  throw new HttpsError('permission-denied', 'Matrimony admin privileges are required.');
}

async function sendMatrimonyPush(
  targetUid: string,
  title: string,
  body: string,
  type: string
): Promise<void> {
  await sendMatrimonyNotification({
    recipientUid: targetUid,
    type,
    title,
    body,
    tag: `matrimony_${type.toLowerCase()}`,
    writeInAppDoc: true,
    allowNonApprovedRecipient: true,
  });
}

interface FormattedReportItem {
  id: string;
  targetUid: string;
  targetName: string;
  targetCode: string;
  reporterUid: string;
  reporterName: string;
  reporterCode: string;
  category: string;
  reason: string;
  source: 'profile' | 'chat';
  status: 'open' | 'action_taken' | 'resolved' | 'dismissed';
  createdAtMs: number;
  resolvedAtMs: number | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

function toMs(val: any): number {
  if (!val) return 0;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val?._seconds) return val._seconds * 1000;
  return 0;
}

function formatReportDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): FormattedReportItem {
  const d = doc.data() || {};
  const rawStatus = String(d.status || 'open');
  const status: FormattedReportItem['status'] =
    rawStatus === 'action_taken' || rawStatus === 'resolved' || rawStatus === 'dismissed'
      ? rawStatus
      : 'open';
  return {
    id: doc.id,
    targetUid: String(d.targetUid || ''),
    targetName: String(d.targetName || 'Rhema Member'),
    targetCode: String(d.targetCode || ''),
    reporterUid: String(d.reporterUid || ''),
    reporterName: String(d.reporterName || 'Rhema Member'),
    reporterCode: String(d.reporterCode || ''),
    category: String(d.category || 'Reported Profile'),
    reason: String(d.reason || ''),
    source: d.source === 'chat' ? 'chat' : 'profile',
    status,
    createdAtMs: toMs(d.createdAt),
    resolvedAtMs: toMs(d.resolvedAt) || null,
    resolvedBy: d.resolvedBy ? String(d.resolvedBy) : null,
    resolutionNote: d.resolutionNote ? String(d.resolutionNote) : null,
  };
}

interface ReportAggregate {
  openReportCount: number;
  totalReportCount: number;
  latestReportAtMs: number;
  reports: FormattedReportItem[];
}

function buildReportSummaryMap(
  reportDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Map<string, ReportAggregate> {
  const map = new Map<string, ReportAggregate>();
  reportDocs.forEach((doc) => {
    const formatted = formatReportDoc(doc);
    if (!formatted.targetUid) return;
    const entry = map.get(formatted.targetUid) || {
      openReportCount: 0,
      totalReportCount: 0,
      latestReportAtMs: 0,
      reports: [],
    };
    entry.totalReportCount += 1;
    if (formatted.status === 'open') {
      entry.openReportCount += 1;
    }
    if (formatted.createdAtMs > entry.latestReportAtMs) {
      entry.latestReportAtMs = formatted.createdAtMs;
    }
    entry.reports.push(formatted);
    map.set(formatted.targetUid, entry);
  });

  map.forEach((entry) => {
    entry.reports.sort((a, b) => b.createdAtMs - a.createdAtMs);
  });
  return map;
}

function buildCountsFromDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  reportMap: Map<string, ReportAggregate> = new Map()
): {
  total: number;
  verified: number;
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
  correction_requested: number;
  suspended: number;
  inactive: number;
  reported: number;
  openReports: number;
} {
  const counts = {
    total: 0,
    verified: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    correction_requested: 0,
    suspended: 0,
    inactive: 0,
    reported: 0,
    openReports: 0,
  };

  docs.forEach((doc) => {
    const status = String(doc.data()?.profileStatus || 'draft');
    if (status === 'not_started' || status === 'deleted') return;
    if (status === 'draft') {
      counts.draft += 1;
      return;
    }
    counts.total += 1;
    if (status === 'pending') counts.pending += 1;
    else if (status === 'approved') {
      counts.approved += 1;
      counts.verified += 1;
    } else if (status === 'rejected') counts.rejected += 1;
    else if (status === 'correction_requested') counts.correction_requested += 1;
    else if (status === 'suspended' || status === 'inactive') {
      counts.inactive += 1;
      if (status === 'suspended') counts.suspended += 1;
    }

    const rep = reportMap.get(doc.id);
    if (rep && rep.totalReportCount > 0) {
      counts.reported += 1;
      counts.openReports += rep.openReportCount;
    }
  });

  return counts;
}

/**
 * 1. getMatrimonyAdminDashboard
 * Returns profile counts (total, verified/approved, pending, rejected, inactive, reported) for Admin Dashboard.
 */
export const getMatrimonyAdminDashboard = onCall({ invoker: 'public' }, async (request) => {
  await requireMatrimonyAdmin(request);
  const db = getFirestore();
  const [snap, reportsSnap] = await Promise.all([
    db.collection(COLLECTIONS.PROFILES).where('churchId', '==', DEFAULT_CHURCH_ID).get(),
    db.collection(COLLECTIONS.REPORTS).where('churchId', '==', DEFAULT_CHURCH_ID).get(),
  ]);

  const reportMap = buildReportSummaryMap(reportsSnap.docs);

  return {
    success: true,
    counts: buildCountsFromDocs(snap.docs, reportMap),
  };
});

/**
 * 2. getMatrimonyPendingProfiles
 * Lists matrimony profiles filtered by status ('pending', 'approved', 'rejected', 'inactive', 'reported', 'draft', or 'all') + counts.
 */
export const getMatrimonyPendingProfiles = onCall(
  { invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 20, maxInstances: 10 },
  async (request) => {
  await requireMatrimonyAdmin(request);
  const statusFilter = optionalString(request.data?.status, 40) || 'pending';
  const searchTerm = (optionalString(request.data?.search, 120) || '').trim().toLowerCase();
  const db = getFirestore();

  const [snap, reportsSnap] = await Promise.all([
    db.collection(COLLECTIONS.PROFILES).where('churchId', '==', DEFAULT_CHURCH_ID).get(),
    db.collection(COLLECTIONS.REPORTS).where('churchId', '==', DEFAULT_CHURCH_ID).get(),
  ]);

  const reportMap = buildReportSummaryMap(reportsSnap.docs);
  const counts = buildCountsFromDocs(snap.docs, reportMap);

  const matchingDocs = snap.docs
    .filter((doc) => {
      const data = doc.data() || {};
      const s = String(data.profileStatus || 'draft');
      if (s === 'not_started' || s === 'deleted') return false;

      if (searchTerm) {
        if (
          statusFilter !== 'all' &&
          statusFilter !== 'draft' &&
          statusFilter !== 'reported' &&
          statusFilter !== 'inactive'
        ) {
          if (s !== statusFilter) return false;
        } else if (statusFilter === 'draft' && s !== 'draft') {
          return false;
        } else if (statusFilter === 'inactive' && !isMatrimonyProfileInactiveStatus(s)) {
          return false;
        } else if (
          statusFilter === 'reported' &&
          (reportMap.get(doc.id)?.totalReportCount || 0) <= 0
        ) {
          return false;
        }

        const haystack = [
          doc.id,
          data.matrimonyId,
          data.profileCode,
          data.displayName,
          data.location?.city,
          data.location?.village,
          data.location?.state,
          data.faithSummary?.denomination,
          data.career?.profession,
          data.motherTongue,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      }

      if (statusFilter === 'all') return true;
      if (s === 'draft') return statusFilter === 'draft';
      if (statusFilter === 'inactive') return isMatrimonyProfileInactiveStatus(s);
      if (statusFilter === 'reported') {
        return (reportMap.get(doc.id)?.totalReportCount || 0) > 0;
      }
      return s === statusFilter;
    })
    .sort((a, b) => {
      const aTest = a.data()?.isTestUser === true ? 1 : 0;
      const bTest = b.data()?.isTestUser === true ? 1 : 0;
      if (aTest !== bTest) return aTest - bTest;

      if (statusFilter === 'reported') {
        const aRep = reportMap.get(a.id);
        const bRep = reportMap.get(b.id);
        const openDiff = (bRep?.openReportCount || 0) - (aRep?.openReportCount || 0);
        if (openDiff !== 0) return openDiff;
        return (bRep?.latestReportAtMs || 0) - (aRep?.latestReportAtMs || 0);
      }
      if (statusFilter === 'all') {
        const aPending = a.data()?.profileStatus === 'pending' ? 1 : 0;
        const bPending = b.data()?.profileStatus === 'pending' ? 1 : 0;
        if (aPending !== bPending) return bPending - aPending;
      }
      const aMs =
        a.data()?.submittedAt?.toMillis?.() ||
        a.data()?.updatedAt?.toMillis?.() ||
        0;
      const bMs =
        b.data()?.submittedAt?.toMillis?.() ||
        b.data()?.updatedAt?.toMillis?.() ||
        0;
      return bMs - aMs;
    });

  // Always retain all real church members; cap seeded test profiles cleanly so list & photos load fast
  const realDocs = matchingDocs.filter((doc) => doc.data()?.isTestUser !== true);
  const testDocs = matchingDocs.filter((doc) => doc.data()?.isTestUser === true);
  const remainingCap = Math.max(0, 60 - realDocs.length);
  const filteredDocs = [...realDocs, ...testDocs.slice(0, remainingCap)];

  const profiles = await Promise.all(
    filteredDocs.map(async (doc) => {
      const data = doc.data();
      const signedPhoto = await signPhotoForAdminFast(data.profilePhoto);
      const rep = reportMap.get(doc.id);
      return {
        uid: doc.id,
        ...data,
        signedPhoto,
        signedProfilePhoto: signedPhoto,
        openReportCount: rep?.openReportCount || 0,
        totalReportCount: rep?.totalReportCount || 0,
        latestReport: rep?.reports?.[0] || null,
      };
    })
  );

  return { success: true, profiles, counts };
});

/**
 * 2b. getMatrimonyAdminProfileDetail
 * Returns full hydrated matrimony profile, contact info, family details, preferences, photos, and attached reports for admin review.
 */
export const getMatrimonyAdminProfileDetail = onCall({ invoker: 'public' }, async (request) => {
  await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const db = getFirestore();

  const [profSnap, privSnap, prefsSnap, verSnap, reportsSnap, banSnap] = await Promise.all([
    getProfileRef(db, targetUid).get(),
    readPrivateSnap(db, targetUid),
    readPrefsSnap(db, targetUid),
    readVerificationSnap(db, targetUid),
    db.collection(COLLECTIONS.REPORTS).where('targetUid', '==', targetUid).get(),
    getBanRef(db, targetUid).get(),
  ]);

  const reports = reportsSnap.docs
    .map(formatReportDoc)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  if (!profSnap.exists) {
    if (banSnap.exists && banSnap.data()?.active !== false) {
      const banData = banSnap.data() || {};
      const memberSnap = await db
        .collection('Rhema Church')
        .doc(DEFAULT_CHURCH_ID)
        .collection('members')
        .doc(targetUid)
        .get();
      const m = memberSnap.exists ? memberSnap.data() || {} : {};
      const fullName =
        String(m.displayName || m.name || m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Rhema Member').trim();
      const photoUrl = m.photoURL ? String(m.photoURL) : null;
      return {
        success: true,
        eligible: true,
        registrationId: targetUid,
        isLegacyBan: true,
        inactiveReason: banData.reason || 'Deactivated by Church Administration.',
        contactInfo: {
          fullName,
          email: String(m.email || ''),
          phone: String(m.phone || ''),
          dob: String(m.dob || ''),
        },
        profile: {
          uid: targetUid,
          churchId: DEFAULT_CHURCH_ID,
          displayName: fullName,
          gender: String(m.gender || ''),
          age: null,
          maritalStatus: String(m.maritalStatus || 'Single'),
          motherTongue: m.motherTongue ? String(m.motherTongue) : '',
          location: {
            city: String(m.city || m.village || ''),
            state: String(m.state || ''),
            country: String(m.nationality || 'India'),
          },
          profilePhoto: photoUrl,
          signedProfilePhoto: photoUrl,
          gallery: [],
          signedGallery: [],
          profileStatus: 'inactive',
          verificationStatus: 'unverified',
          visibility: 'hidden',
          profileCompletion: 0,
          inactiveReason: banData.reason || 'Deactivated by Church Administration.',
        },
        familyDetails: null,
        incomeDetails: null,
        consent: null,
        preferences: null,
        verification: null,
        rejectionReason: null,
        reports,
      };
    }
    throw new HttpsError('not-found', 'Matrimony profile not found.');
  }

  const profileData = profSnap.data() || {};
  const privateData = privSnap.exists ? (privSnap.data() || {}) : {};
  const prefsData = prefsSnap.exists ? (prefsSnap.data() || {}) : {};
  const verData = verSnap.exists ? (verSnap.data() || {}) : {};

  const [signedProfilePhoto, signedGallery] = await Promise.all([
    signPhotoForAdmin(profileData.profilePhoto),
    Array.isArray(profileData.gallery)
      ? resolveAdminPhotoUrls(profileData.gallery)
      : Promise.resolve([]),
  ]);

  return {
    success: true,
    eligible: true,
    registrationId: targetUid,
    isLegacyBan: false,
    inactiveReason: profileData.inactiveReason || null,
    deletionReason: profileData.deletionReason || null,
    deletedAtMs: profileData.deletedAtMs || null,
    contactInfo: {
      fullName: privateData.fullLegalName || profileData.displayName || '',
      email: privateData.personalEmail || '',
      phone: privateData.phoneNumber || '',
      dob: privateData.dob || '',
    },
    profile: {
      ...profileData,
      signedProfilePhoto,
      signedGallery,
    },
    familyDetails: privateData.familyDetails || null,
    incomeDetails: privateData.incomeDetails || null,
    consent: privateData.consent || null,
    preferences: prefsData,
    verification: verData,
    rejectionReason: verData?.approval?.rejectionReason || null,
    reports,
  };
});

/**
 * 3. approveMatrimonyProfile
 */
export const approveMatrimonyProfile = onCall({ invoker: 'public' }, async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const db = getFirestore();

  const profileRef = getProfileRef(db, targetUid);
  const verRef = getVerificationRef(db, targetUid);
  const adminProfileRef = getAdminProfileRef(db, targetUid);
  const banRef = getBanRef(db, targetUid);

  const [profileSnap, banSnap] = await Promise.all([profileRef.get(), banRef.get()]);
  if (!profileSnap.exists && !banSnap.exists) {
    throw new HttpsError('not-found', 'Matrimony profile not found.');
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  if (banSnap.exists && banSnap.data()?.active !== false) {
    batch.set(
      banRef,
      {
        active: false,
        unbannedBy: adminUid,
        unbannedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  if (profileSnap.exists) {
    const matrimonyId = await ensureUniqueMatrimonyId(
      db,
      targetUid,
      profileSnap.data()?.matrimonyId
    );
    batch.set(
      profileRef,
      {
        matrimonyId,
        profileStatus: 'approved',
        verificationStatus: 'verified',
        approvalType: 'manual_admin',
        visibility: 'discoverable',
        inactiveReason: null,
        inactivatedBy: null,
        inactivatedAt: null,
        rejectionReason: null,
        approvedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const approvalPayload = {
      status: 'approved',
      type: 'manual_review',
      reviewedBy: adminUid,
      reviewedAt: now,
      rejectionReason: null,
    };

    batch.set(
      verRef,
      {
        approval: approvalPayload,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(
      adminProfileRef,
      {
        matrimonyId,
        profileStatus: 'approved',
        verificationStatus: 'verified',
        visibility: 'discoverable',
        inactiveReason: null,
        inactivatedBy: null,
        inactivatedAt: null,
        verification: { approval: approvalPayload },
        syncedAt: now,
      },
      { merge: true }
    );
  }

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_PROFILE_APPROVED',
    actorUid: adminUid,
    targetUid,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  await sendMatrimonyPush(
    targetUid,
    'Rhema Matrimony Approved',
    'Your Matrimony profile has been approved and is now active.',
    'PROFILE_APPROVED'
  );

  return { success: true, profileStatus: 'approved' };
});

/**
 * 4. rejectMatrimonyProfile
 */
export const rejectMatrimonyProfile = onCall({ invoker: 'public' }, async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const reason =
    optionalString(request.data?.reason, 500) || 'Profile did not meet verification requirements.';
  const db = getFirestore();

  const profileRef = getProfileRef(db, targetUid);
  const verRef = getVerificationRef(db, targetUid);
  const adminProfileRef = getAdminProfileRef(db, targetUid);

  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    throw new HttpsError('not-found', 'Matrimony profile not found.');
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(
    profileRef,
    {
      profileStatus: 'rejected',
      verificationStatus: 'rejected',
      visibility: 'hidden',
      rejectionReason: reason,
      rejectedBy: adminUid,
      rejectedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  const approvalPayload = {
    status: 'rejected',
    type: 'manual_review',
    reviewedBy: adminUid,
    reviewedAt: now,
    rejectionReason: reason,
  };

  batch.set(
    verRef,
    {
      approval: approvalPayload,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    adminProfileRef,
    {
      profileStatus: 'rejected',
      verificationStatus: 'rejected',
      visibility: 'hidden',
      verification: { approval: approvalPayload },
      syncedAt: now,
    },
    { merge: true }
  );

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_PROFILE_REJECTED',
    actorUid: adminUid,
    targetUid,
    reason,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  await sendMatrimonyPush(
    targetUid,
    'Rhema Matrimony Update',
    'Your Matrimony profile needs attention. Open Rhema Matrimony to view details.',
    'PROFILE_REJECTED'
  );

  return { success: true, profileStatus: 'rejected' };
});

/**
 * 5. requestMatrimonyCorrection
 */
export const requestMatrimonyCorrection = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const reason = assertNonEmptyString(request.data?.reason, 'reason', 500);
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  const approvalPayload = {
    status: 'correction_requested',
    type: 'manual_review',
    reviewedBy: adminUid,
    reviewedAt: now,
    rejectionReason: reason,
  };

  batch.set(
    getProfileRef(db, targetUid),
    {
      profileStatus: 'correction_requested',
      visibility: 'hidden',
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    getVerificationRef(db, targetUid),
    {
      approval: approvalPayload,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    getAdminProfileRef(db, targetUid),
    {
      profileStatus: 'correction_requested',
      visibility: 'hidden',
      verification: { approval: approvalPayload },
      syncedAt: now,
    },
    { merge: true }
  );

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_CORRECTION_REQUESTED',
    actorUid: adminUid,
    targetUid,
    reason,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  await sendMatrimonyPush(
    targetUid,
    'Rhema Matrimony Action Required',
    'Please update your Matrimony profile details and resubmit.',
    'PROFILE_REVIEW_REQUIRED'
  );

  return { success: true, profileStatus: 'correction_requested' };
});

/**
 * 6. suspendMatrimonyProfile
 */
export const suspendMatrimonyProfile = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const reason = assertNonEmptyString(request.data?.reason, 'reason', 500);
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(
    getProfileRef(db, targetUid),
    {
      profileStatus: 'suspended',
      visibility: 'hidden',
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    getAdminProfileRef(db, targetUid),
    {
      profileStatus: 'suspended',
      visibility: 'hidden',
      syncedAt: now,
    },
    { merge: true }
  );

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_PROFILE_SUSPENDED',
    actorUid: adminUid,
    targetUid,
    reason,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  return { success: true, profileStatus: 'suspended' };
});

/**
 * 7. removeMatrimonyProfileForAbuse
 * Permanently removes a member's Matrimony profile + subcollections + photos and blocks
 * them from Rhema Matrimony only (keeping their main Rhema Church app access intact).
 */
export const removeMatrimonyProfileForAbuse = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const reason =
    optionalString(request.data?.reason, 500) ||
    'Deleted by Church Administration.';
  const db = getFirestore();

  await purgeMatrimonyUserData(db, targetUid, {
    banOnDelete: false,
    banReason: reason,
    actorUid: adminUid,
    source: 'admin_action',
    auditAction: 'MATRIMONY_PROFILE_DELETED_ADMIN',
  });

  await getBanRef(db, targetUid).set(
    {
      active: false,
      unbannedBy: adminUid,
      unbannedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  ).catch(() => undefined);

  return { success: true, removed: true, bannedFromMatrimony: false };
});

/**
 * 7b. deleteMatrimonyProfile
 * Deletes a member's Matrimony profile, subcollections, and photos in Firebase
 * WITHOUT restricting them, so they can set up a fresh profile and go through approval again.
 */
export const deleteMatrimonyProfile = onCall(
  { invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 10, maxInstances: 10 },
  async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const reason =
    optionalString(request.data?.reason, 500) ||
    'Profile deleted by Church Administration. You may create a new profile for review.';
  const db = getFirestore();

  await Promise.all([
    getProfileRef(db, targetUid).set({ selfReset: true }, { merge: true }).catch(() => undefined),
    getAdminProfileRef(db, targetUid).set({ selfReset: true }, { merge: true }).catch(() => undefined),
  ]);

  await purgeMatrimonyUserData(db, targetUid, {
    banOnDelete: false,
    banReason: reason,
    actorUid: adminUid,
    source: 'admin_action',
    auditAction: 'MATRIMONY_PROFILE_DELETED_ADMIN',
  });

  await getBanRef(db, targetUid).set(
    {
      active: false,
      unbannedBy: adminUid,
      unbannedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  ).catch(() => undefined);

  return { success: true, deleted: true, canReRegister: true };
});

/**
 * 8. inactivateMatrimonyProfile
 * Temporarily makes a member's Matrimony profile inactive & hidden without deleting their data.
 * Attached reports stay visible and are marked 'action_taken'.
 */
export const inactivateMatrimonyProfile = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const reason =
    optionalString(request.data?.reason, 500) ||
    'Your Rhema Matrimony profile is currently inactive under Church Administration review.';
  const db = getFirestore();

  const profileRef = getProfileRef(db, targetUid);
  const adminProfileRef = getAdminProfileRef(db, targetUid);

  const [profileSnap, openReportsSnap] = await Promise.all([
    profileRef.get(),
    db
      .collection(COLLECTIONS.REPORTS)
      .where('targetUid', '==', targetUid)
      .where('status', '==', 'open')
      .get(),
  ]);

  if (!profileSnap.exists) {
    throw new HttpsError('not-found', 'Matrimony profile not found.');
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(
    profileRef,
    {
      profileStatus: 'inactive',
      visibility: 'hidden',
      inactiveReason: reason,
      inactivatedBy: adminUid,
      inactivatedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    adminProfileRef,
    {
      profileStatus: 'inactive',
      visibility: 'hidden',
      inactiveReason: reason,
      inactivatedBy: adminUid,
      inactivatedAt: now,
      openReportCount: 0,
      syncedAt: now,
    },
    { merge: true }
  );

  openReportsSnap.docs.forEach((repDoc) => {
    batch.set(
      repDoc.ref,
      {
        status: 'action_taken',
        resolvedBy: adminUid,
        resolvedAt: now,
        resolutionNote: reason,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_PROFILE_INACTIVATED',
    actorUid: adminUid,
    targetUid,
    reason,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  await sendMatrimonyPush(
    targetUid,
    'Rhema Matrimony Profile Inactive',
    'Your Rhema Matrimony profile has been set to inactive by Church Administration.',
    'PROFILE_INACTIVATED'
  );

  return { success: true, profileStatus: 'inactive' };
});

/**
 * 9. activateMatrimonyProfile
 * Reactivates an inactive/suspended (or legacy-banned) Matrimony profile so the member can continue.
 */
export const activateMatrimonyProfile = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const db = getFirestore();

  const profileRef = getProfileRef(db, targetUid);
  const verRef = getVerificationRef(db, targetUid);
  const adminProfileRef = getAdminProfileRef(db, targetUid);
  const banRef = getBanRef(db, targetUid);

  const [profileSnap, banSnap, reportsSnap] = await Promise.all([
    profileRef.get(),
    banRef.get(),
    db.collection(COLLECTIONS.REPORTS).where('targetUid', '==', targetUid).get(),
  ]);

  if (!profileSnap.exists && !banSnap.exists) {
    throw new HttpsError('not-found', 'Matrimony profile not found.');
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  let wasLegacyBan = false;

  if (banSnap.exists && banSnap.data()?.active !== false) {
    wasLegacyBan = !profileSnap.exists;
    batch.set(
      banRef,
      {
        active: false,
        unbannedBy: adminUid,
        unbannedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  if (profileSnap.exists) {
    const matrimonyId = await ensureUniqueMatrimonyId(
      db,
      targetUid,
      profileSnap.data()?.matrimonyId
    );
    batch.set(
      profileRef,
      {
        matrimonyId,
        profileStatus: 'approved',
        verificationStatus: 'verified',
        approvalType: 'manual_admin',
        visibility: 'discoverable',
        inactiveReason: null,
        inactivatedBy: null,
        inactivatedAt: null,
        reactivatedBy: adminUid,
        reactivatedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const approvalPayload = {
      status: 'approved',
      type: 'manual_review',
      reviewedBy: adminUid,
      reviewedAt: now,
      rejectionReason: null,
    };

    batch.set(
      verRef,
      {
        approval: approvalPayload,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(
      adminProfileRef,
      {
        matrimonyId,
        profileStatus: 'approved',
        verificationStatus: 'verified',
        visibility: 'discoverable',
        inactiveReason: null,
        inactivatedBy: null,
        inactivatedAt: null,
        reactivatedBy: adminUid,
        reactivatedAt: now,
        openReportCount: 0,
        verification: { approval: approvalPayload },
        syncedAt: now,
      },
      { merge: true }
    );
  }

  reportsSnap.docs.forEach((repDoc) => {
    const s = String(repDoc.data()?.status || 'open');
    if (s === 'open' || s === 'action_taken') {
      batch.set(
        repDoc.ref,
        {
          status: 'resolved',
          resolvedBy: adminUid,
          resolvedAt: now,
          resolutionNote: 'Profile reactivated by Church Administration.',
          updatedAt: now,
        },
        { merge: true }
      );
    }
  });

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_PROFILE_ACTIVATED',
    actorUid: adminUid,
    targetUid,
    wasLegacyBan,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  await sendMatrimonyPush(
    targetUid,
    'Rhema Matrimony Profile Active',
    wasLegacyBan
      ? 'Your Rhema Matrimony access is active again. Open Rhema Matrimony to continue.'
      : 'Your Rhema Matrimony profile is now active again. You can continue using Rhema Matrimony.',
    'PROFILE_ACTIVATED'
  );

  return {
    success: true,
    profileStatus: wasLegacyBan ? 'not_started' : 'approved',
    wasLegacyBan,
  };
});

/**
 * 10. resolveMatrimonyReport
 * Marks an individual attached report as 'resolved' or 'dismissed'.
 */
export const resolveMatrimonyReport = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const reportId = assertNonEmptyString(request.data?.reportId, 'reportId', 128);
  const resolutionStatusRaw = assertNonEmptyString(
    request.data?.resolutionStatus,
    'resolutionStatus',
    30
  );
  if (resolutionStatusRaw !== 'resolved' && resolutionStatusRaw !== 'dismissed') {
    throw new HttpsError('invalid-argument', 'resolutionStatus must be resolved or dismissed.');
  }
  const resolutionNote =
    optionalString(request.data?.resolutionNote, 400) ||
    (resolutionStatusRaw === 'dismissed'
      ? 'Dismissed by Church Administration.'
      : 'Resolved by Church Administration.');

  const db = getFirestore();
  const reportRef = db.collection(COLLECTIONS.REPORTS).doc(reportId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError('not-found', 'Report not found.');
  }

  const repData = reportSnap.data() || {};
  const targetUid = String(repData.targetUid || '');
  const wasOpen = String(repData.status || 'open') === 'open';
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();
  batch.set(
    reportRef,
    {
      status: resolutionStatusRaw,
      resolvedBy: adminUid,
      resolvedAt: now,
      resolutionNote,
      updatedAt: now,
    },
    { merge: true }
  );

  if (wasOpen && targetUid) {
    batch.set(
      getAdminProfileRef(db, targetUid),
      {
        openReportCount: FieldValue.increment(-1),
        syncedAt: now,
      },
      { merge: true }
    );
  }

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_REPORT_RESOLVED',
    actorUid: adminUid,
    targetUid,
    reportId,
    resolutionStatus: resolutionStatusRaw,
    resolutionNote,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  return { success: true, reportId, status: resolutionStatusRaw };
});
