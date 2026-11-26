import './globalConfig.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DEFAULT_CHURCH_ID = 'rhema';

export const DELEGABLE_MODULE_KEYS = [
  'promises',
  'sermons',
  'songs',
  'events',
  'pastor_events',
  'prayer_wall',
  'testimonies',
  'attendance',
  'kids_ministry',
  'service_roster',
  'job_circle',
  'volunteers',
  'members',
  'approvals',
  'celebrations',
  'gallery',
  'notifications',
  'whatsapp',
  'online_meetings',
  'bible_quiz',
  'baptism',
  'matrimony',
  'support_team',
  'church_settings',
] as const;

export const PROTECTED_SUPER_ADMIN_MODULE_KEYS = new Set<string>([
  'care_cells',
  'expense',
  'donations',
  'daily_verses',
  'app_admin',
]);

export const ALL_MODULE_KEYS = new Set<string>([
  'dashboard',
  ...DELEGABLE_MODULE_KEYS,
  ...PROTECTED_SUPER_ADMIN_MODULE_KEYS,
]);

export function normalizeChurchId(raw: unknown): string {
  const clean = String(raw || DEFAULT_CHURCH_ID).trim();
  if (!clean || clean === 'default') return DEFAULT_CHURCH_ID;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(clean)) {
    throw new HttpsError('invalid-argument', 'Invalid churchId.');
  }
  return clean;
}

export function isSuperAdminRecord(
  record: Record<string, any> | undefined,
  token?: Record<string, any>
): boolean {
  if (token?.superadmin === true || token?.super_admin === true) return true;
  if (!record) return false;
  const roleStr = `${record.userType || ''} ${record.role || ''}`.toUpperCase();
  return (
    record.superadmin === true ||
    record.isSuperAdmin === true ||
    roleStr.includes('SUPER')
  );
}

export function isChurchAdminRecord(record: Record<string, any> | undefined): boolean {
  if (!record) return false;
  if (isSuperAdminRecord(record)) return true;
  if (record.isAdmin === true) return true;
  const roleStr = `${record.userType || ''} ${record.role || ''}`.toLowerCase();
  return (
    roleStr.includes('admin') ||
    roleStr.includes('pastor') ||
    roleStr.includes('super')
  );
}

/**
 * Strips any unknown or Super-Admin-protected keys (care_cells, expense, donations,
 * daily_verses, app_admin) and always forces `dashboard: true`.
 */
export function sanitizeModulesPatch(
  rawModules: unknown
): Record<string, boolean> {
  const src =
    rawModules && typeof rawModules === 'object' && !Array.isArray(rawModules)
      ? (rawModules as Record<string, unknown>)
      : {};
  const cleaned: Record<string, boolean> = {
    dashboard: true,
  };
  for (const key of DELEGABLE_MODULE_KEYS) {
    cleaned[key] = src[key] === true;
  }
  return cleaned;
}

export function buildOptionAExistingAdminModules(): Record<string, boolean> {
  const map: Record<string, boolean> = { dashboard: true };
  for (const key of DELEGABLE_MODULE_KEYS) {
    map[key] = true;
  }
  return map;
}

export function buildDefaultNewAdminModules(
  templateModules?: Record<string, boolean> | null
): Record<string, boolean> {
  return sanitizeModulesPatch(templateModules || { dashboard: true });
}

export function computeModulesDiff(
  prevModules: Record<string, boolean> | undefined | null,
  nextModules: Record<string, boolean>
): { addedModules: string[]; removedModules: string[] } {
  const prev = prevModules || {};
  const addedModules: string[] = [];
  const removedModules: string[] = [];
  for (const key of DELEGABLE_MODULE_KEYS) {
    const before = prev[key] === true;
    const after = nextModules[key] === true;
    if (!before && after) addedModules.push(key);
    if (before && !after) removedModules.push(key);
  }
  return { addedModules, removedModules };
}

export async function checkIsSuperAdminCaller(
  db: FirebaseFirestore.Firestore,
  uid: string,
  token: Record<string, any> | undefined,
  churchId: string
): Promise<{ isSuperAdmin: boolean; actorName: string }> {
  if (token?.superadmin === true || token?.super_admin === true) {
    const memberSnap = await db
      .collection('Rhema Church')
      .doc(churchId)
      .collection('members')
      .doc(uid)
      .get();
    return {
      isSuperAdmin: true,
      actorName: String(memberSnap.data()?.name || token?.name || 'Super Admin'),
    };
  }

  const [platformSnap, memberSnap, userSnap] = await Promise.all([
    db.collection('platform_admins').doc(uid).get(),
    db.collection('Rhema Church').doc(churchId).collection('members').doc(uid).get(),
    db.collection('users').doc(uid).get(),
  ]);

  const pData = platformSnap.exists ? platformSnap.data() : undefined;
  const mData = memberSnap.exists ? memberSnap.data() : undefined;
  const uData = userSnap.exists ? userSnap.data() : undefined;

  const isPlatformSuper = Boolean(
    pData &&
      (pData.superadmin === true ||
        String(pData.role || '').toLowerCase().includes('super'))
  );
  const isMemberSuper = isSuperAdminRecord(mData);
  const isUserSuper = isSuperAdminRecord(uData);

  const actorName = String(
    mData?.name || pData?.name || uData?.name || 'Super Admin'
  ).trim();

  return {
    isSuperAdmin: isPlatformSuper || isMemberSuper || isUserSuper,
    actorName,
  };
}

export async function assertSuperAdminCaller(
  db: FirebaseFirestore.Firestore,
  auth: { uid?: string; token?: Record<string, any> } | undefined,
  churchId: string
): Promise<{ uid: string; actorName: string }> {
  const uid = auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const { isSuperAdmin, actorName } = await checkIsSuperAdminCaller(
    db,
    uid,
    auth?.token,
    churchId
  );
  if (!isSuperAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only a Super Admin can perform this action.'
    );
  }
  return { uid, actorName };
}

async function isActiveChurchAdmin(
  db: FirebaseFirestore.Firestore,
  uid: string,
  token: Record<string, any> | undefined,
  churchId: string
): Promise<boolean> {
  if (token?.admin === true && (!token?.churchId || token.churchId === churchId)) {
    return true;
  }

  const [memberSnap, userSnap, churchSnap] = await Promise.all([
    db.collection('Rhema Church').doc(churchId).collection('members').doc(uid).get(),
    db.collection('users').doc(uid).get(),
    db.collection('Rhema Church').doc(churchId).get(),
  ]);

  if (memberSnap.exists && isChurchAdminRecord(memberSnap.data())) {
    return true;
  }

  if (userSnap.exists) {
    const uData = userSnap.data() || {};
    const uChurch = uData.primaryChurchId || uData.churchId;
    if (isChurchAdminRecord(uData) && (!uChurch || uChurch === churchId)) {
      return true;
    }
  }

  if (churchSnap.exists) {
    const cData = churchSnap.data() || {};
    const adminList = Array.isArray(cData.adminUids) ? cData.adminUids : [];
    if (
      cData.adminUid === uid ||
      cData.createdBy === uid ||
      cData.pastorUid === uid ||
      cData.ownerUid === uid ||
      adminList.includes(uid)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Backend enforcement for delegable Admin modules.
 * - Super Admins always pass.
 * - Protected modules (`care_cells`, `expense`, `donations`, `daily_verses`, `app_admin`)
 *   reject non-Super-Admin callers immediately.
 * - Delegable modules check `admin_permissions/{uid}.modules[moduleKey] === true` when
 *   explicitly stored or once `admin_permission_settings/default_template` exists.
 */
export async function assertAdminModulePermission(
  db: FirebaseFirestore.Firestore,
  auth: { uid?: string; token?: Record<string, any> } | undefined,
  churchId: string,
  moduleKey: string
): Promise<{ uid: string; isSuperAdmin: boolean }> {
  const uid = auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const { isSuperAdmin } = await checkIsSuperAdminCaller(
    db,
    uid,
    auth?.token,
    churchId
  );
  if (isSuperAdmin) {
    return { uid, isSuperAdmin: true };
  }

  if (PROTECTED_SUPER_ADMIN_MODULE_KEYS.has(moduleKey)) {
    throw new HttpsError(
      'permission-denied',
      `Super Admin access is required for "${moduleKey}".`
    );
  }

  const isAdmin = await isActiveChurchAdmin(db, uid, auth?.token, churchId);
  if (!isAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Church administrator permission is required.'
    );
  }

  if (moduleKey === 'dashboard') {
    return { uid, isSuperAdmin: false };
  }

  const churchDocRef = db.collection('Rhema Church').doc(churchId);
  const [permSnap, templateSnap] = await Promise.all([
    churchDocRef.collection('admin_permissions').doc(uid).get(),
    churchDocRef
      .collection('admin_permission_settings')
      .doc('default_template')
      .get(),
  ]);

  if (permSnap.exists) {
    const modules = (permSnap.data()?.modules || {}) as Record<string, unknown>;
    if (modules[moduleKey] === true) {
      return { uid, isSuperAdmin: false };
    }
    throw new HttpsError(
      'permission-denied',
      `Access to module "${moduleKey}" has not been granted for this administrator.`
    );
  }

  if (templateSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      `No module permissions configured for this administrator ("${moduleKey}" denied).`
    );
  }

  // Pre-rollout Option A zero-disruption grace when default_template has not been initialized yet
  return { uid, isSuperAdmin: false };
}

/**
 * Filters candidate admin UIDs and their FCM tokens by module permission.
 * - Super Admins are ALWAYS preserved.
 * - Protected Super Admin modules strictly allow Super Admins only.
 * - Pre-rollout Option A (neither `default_template` nor any `admin_permissions` docs exist):
 *   preserves all candidate admins without disruption.
 */
export async function filterAuthorizedAdminRecipientsForModule(
  db: FirebaseFirestore.Firestore,
  churchId: string,
  moduleKey: string,
  candidates: Array<{ uid: string; tokens?: string[] }>,
  unattributedTokens: string[] = []
): Promise<{ adminUids: string[]; tokens: string[] }> {
  const cleanChurchId = normalizeChurchId(churchId);
  const churchRef = db.collection('Rhema Church').doc(cleanChurchId);
  const [templateSnap, permsSnap, platformSnap] = await Promise.all([
    churchRef.collection('admin_permission_settings').doc('default_template').get(),
    churchRef.collection('admin_permissions').get(),
    db.collection('platform_admins').get(),
  ]);

  const platformSuperIds = new Set<string>();
  platformSnap.docs.forEach((d) => {
    if (isSuperAdminRecord(d.data())) {
      platformSuperIds.add(d.id);
    }
  });

  const permsMap = new Map<string, Record<string, unknown>>();
  permsSnap.docs.forEach((d) => {
    const data = d.data() || {};
    const modules =
      data.modules && typeof data.modules === 'object' ? data.modules : {};
    permsMap.set(d.id, modules);
  });

  const isProtected = PROTECTED_SUPER_ADMIN_MODULE_KEYS.has(moduleKey);
  const isPreRollout = !templateSnap.exists && permsMap.size === 0;

  if (!isProtected && isPreRollout) {
    const uidSet = new Set<string>();
    const tokenSet = new Set<string>(unattributedTokens);
    for (const c of candidates) {
      if (c.uid) uidSet.add(c.uid);
      for (const t of c.tokens || []) {
        if (t && t.trim().length > 10) tokenSet.add(t.trim());
      }
    }
    return { adminUids: Array.from(uidSet), tokens: Array.from(tokenSet) };
  }

  const candidateUids = Array.from(
    new Set(candidates.map((c) => c.uid).filter(Boolean))
  );
  const memberSuperSet = new Set<string>();
  await Promise.all(
    candidateUids.map(async (uid) => {
      if (platformSuperIds.has(uid)) {
        memberSuperSet.add(uid);
        return;
      }
      const mSnap = await churchRef
        .collection('members')
        .doc(uid)
        .get()
        .catch(() => null);
      if (mSnap?.exists && isSuperAdminRecord(mSnap.data())) {
        memberSuperSet.add(uid);
      }
    })
  );

  const allowedUidSet = new Set<string>();
  const tokenSet = new Set<string>();

  for (const c of candidates) {
    if (!c.uid) continue;
    const isSuper = platformSuperIds.has(c.uid) || memberSuperSet.has(c.uid);
    const hasDelegated =
      !isProtected && permsMap.get(c.uid)?.[moduleKey] === true;
    if (isSuper || hasDelegated) {
      allowedUidSet.add(c.uid);
      for (const t of c.tokens || []) {
        if (t && t.trim().length > 10) tokenSet.add(t.trim());
      }
    }
  }

  return {
    adminUids: Array.from(allowedUidSet),
    tokens: Array.from(tokenSet),
  };
}

/**
 * Queries all registered Church Administrators & Platform Super Admins for `churchId`.
 */
async function collectChurchAdmins(
  db: FirebaseFirestore.Firestore,
  churchId: string
) {
  const churchRef = db.collection('Rhema Church').doc(churchId);
  const membersRef = churchRef.collection('members');
  const adminRoleValues = [
    'Admin',
    'admin',
    'Pastor',
    'pastor',
    'Super Admin',
    'super_admin',
    'superadmin',
    'Youth Pastor',
    'Senior Pastor',
    'Associate Pastor',
  ];

  const [byFlagSnap, bySuperFlagSnap, bySuperLowerSnap, byUserTypeSnap, byRoleSnap, platformSnap] =
    await Promise.all([
      membersRef.where('isAdmin', '==', true).limit(150).get().catch(() => null),
      membersRef.where('isSuperAdmin', '==', true).limit(150).get().catch(() => null),
      membersRef.where('superadmin', '==', true).limit(150).get().catch(() => null),
      membersRef
        .where('userType', 'in', adminRoleValues)
        .limit(150)
        .get()
        .catch(() => null),
      membersRef
        .where('role', 'in', adminRoleValues)
        .limit(150)
        .get()
        .catch(() => null),
      db.collection('platform_admins').limit(100).get().catch(() => null),
    ]);

  const platformSuperIds = new Set<string>();
  const platformAdminDocs = new Map<string, any>();
  platformSnap?.docs?.forEach((d) => {
    const data = d.data() || {};
    if (isSuperAdminRecord(data)) {
      platformSuperIds.add(d.id);
    }
    platformAdminDocs.set(d.id, data);
  });

  const adminMap = new Map<
    string,
    {
      uid: string;
      name: string;
      phone: string;
      email: string;
      userType: string;
      role: string;
      isSuperAdmin: boolean;
    }
  >();

  const ingestMemberDoc = (doc: FirebaseFirestore.DocumentSnapshot) => {
    const d = doc.data() || {};
    if (!isChurchAdminRecord(d) && !platformSuperIds.has(doc.id)) return;
    const isSuper = isSuperAdminRecord(d) || platformSuperIds.has(doc.id);
    const existing = adminMap.get(doc.id);
    const name = String(
      d.name ||
        `${d.firstName || ''} ${d.lastName || ''}`.trim() ||
        existing?.name ||
        'Administrator'
    ).trim();
    adminMap.set(doc.id, {
      uid: doc.id,
      name,
      phone: String(d.phone || existing?.phone || ''),
      email: String(d.email || existing?.email || ''),
      userType: String(d.userType || d.role || existing?.userType || 'Admin'),
      role: String(d.role || d.userType || existing?.role || 'Admin'),
      isSuperAdmin: Boolean(existing?.isSuperAdmin || isSuper),
    });
  };

  [byFlagSnap, bySuperFlagSnap, bySuperLowerSnap, byUserTypeSnap, byRoleSnap].forEach((snap) => {
    snap?.docs?.forEach((doc: any) => ingestMemberDoc(doc));
  });

  // Ensure any platform_admins member missing from queried batches is still listed
  for (const [uid, pData] of platformAdminDocs.entries()) {
    if (!adminMap.has(uid) && isSuperAdminRecord(pData)) {
      adminMap.set(uid, {
        uid,
        name: String(pData.name || 'Super Admin'),
        phone: String(pData.phone || ''),
        email: String(pData.email || ''),
        userType: 'Super Admin',
        role: String(pData.role || 'Super Admin'),
        isSuperAdmin: true,
      });
    }
  }

  return Array.from(adminMap.values()).sort((a, b) => {
    if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Option A Baseline Seeding:
 * On first Admin Permissions access, initializes `default_template` (Dashboard ON by default)
 * and seeds existing standard Church Admins with all current delegable tabs ON (`true`),
 * logging each initialized baseline entry in `admin_permission_audit_logs`.
 */
async function ensureOptionABaselineSeeded(
  db: FirebaseFirestore.Firestore,
  churchId: string,
  admins: Awaited<ReturnType<typeof collectChurchAdmins>>,
  actorUid: string,
  actorName: string
): Promise<Record<string, boolean>> {
  const churchRef = db.collection('Rhema Church').doc(churchId);
  const templateRef = churchRef
    .collection('admin_permission_settings')
    .doc('default_template');
  const templateSnap = await templateRef.get();

  if (templateSnap.exists) {
    return buildDefaultNewAdminModules(templateSnap.data()?.defaultModules);
  }

  const defaultModules = buildDefaultNewAdminModules(null);
  const optionAModules = buildOptionAExistingAdminModules();
  const permsCol = churchRef.collection('admin_permissions');
  const existingPermsSnap = await permsCol.get();
  const existingPermUids = new Set(existingPermsSnap.docs.map((d) => d.id));

  const batch = db.batch();
  batch.set(templateRef, {
    churchId,
    defaultModules,
    rolloutPolicy: 'OPTION_A_EXISTING_ENABLED',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actorUid,
    updatedByName: actorName,
  });

  for (const adm of admins) {
    if (adm.isSuperAdmin || existingPermUids.has(adm.uid)) continue;
    batch.set(permsCol.doc(adm.uid), {
      uid: adm.uid,
      churchId,
      adminName: adm.name,
      adminPhone: adm.phone,
      adminRole: adm.userType,
      isSuperAdmin: false,
      modules: optionAModules,
      version: 1,
      seededByOptionA: true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: actorUid,
      updatedByName: actorName,
    });
    const logRef = churchRef.collection('admin_permission_audit_logs').doc();
    batch.set(logRef, {
      targetUid: adm.uid,
      targetName: adm.name,
      actorUid,
      actorName,
      action: 'INIT_EXISTING_ADMIN_OPTION_A',
      previousModules: {},
      nextModules: optionAModules,
      addedModules: DELEGABLE_MODULE_KEYS.slice(),
      removedModules: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return defaultModules;
}

export const listChurchAdminsWithPermissions = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public' },
  async (request) => {
    const db = getFirestore();
    const churchId = normalizeChurchId(request.data?.churchId);
    const { uid: actorUid, actorName } = await assertSuperAdminCaller(
      db,
      request.auth,
      churchId
    );

    const admins = await collectChurchAdmins(db, churchId);
    const defaultModules = await ensureOptionABaselineSeeded(
      db,
      churchId,
      admins,
      actorUid,
      actorName
    );

    const churchRef = db.collection('Rhema Church').doc(churchId);
    const [permsSnap, logsSnap] = await Promise.all([
      churchRef.collection('admin_permissions').get(),
      churchRef
        .collection('admin_permission_audit_logs')
        .orderBy('createdAt', 'desc')
        .limit(35)
        .get()
        .catch(() => null),
    ]);

    const permMap = new Map<string, any>();
    permsSnap.docs.forEach((d) => permMap.set(d.id, d.data()));

    const enrichedAdmins = admins.map((adm) => {
      const permDoc = permMap.get(adm.uid);
      const updatedAtMs =
        typeof permDoc?.updatedAt?.toMillis === 'function'
          ? permDoc.updatedAt.toMillis()
          : null;
      return {
        ...adm,
        modules: adm.isSuperAdmin
          ? buildOptionAExistingAdminModules()
          : permDoc?.modules
            ? sanitizeModulesPatch(permDoc.modules)
            : buildDefaultNewAdminModules(defaultModules),
        hasExplicitDoc: Boolean(permDoc),
        updatedAtMs,
        updatedByUid: permDoc?.updatedByUid || null,
        updatedByName: permDoc?.updatedByName || null,
        version: Number(permDoc?.version || 0),
      };
    });

    const auditLogs = (logsSnap?.docs || []).map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        targetUid: data.targetUid || '',
        targetName: data.targetName || '',
        actorUid: data.actorUid || '',
        actorName: data.actorName || '',
        action: data.action || 'UPDATE_ADMIN_PERMISSIONS',
        addedModules: Array.isArray(data.addedModules) ? data.addedModules : [],
        removedModules: Array.isArray(data.removedModules)
          ? data.removedModules
          : [],
        createdAtMs:
          typeof data.createdAt?.toMillis === 'function'
            ? data.createdAt.toMillis()
            : null,
      };
    });

    return {
      success: true,
      churchId,
      admins: enrichedAdmins,
      defaultModules,
      auditLogs,
    };
  }
);

export const saveAdminModulePermissions = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public' },
  async (request) => {
    const db = getFirestore();
    const churchId = normalizeChurchId(request.data?.churchId);
    const { uid: actorUid, actorName } = await assertSuperAdminCaller(
      db,
      request.auth,
      churchId
    );

    const targetUid = String(request.data?.targetUid || '').trim();
    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'targetUid is required.');
    }

    const churchRef = db.collection('Rhema Church').doc(churchId);
    const targetMemberRef = churchRef.collection('members').doc(targetUid);
    const [targetPlatformSnap, targetMemberSnap, targetPermSnap] =
      await Promise.all([
        db.collection('platform_admins').doc(targetUid).get(),
        targetMemberRef.get(),
        churchRef.collection('admin_permissions').doc(targetUid).get(),
      ]);

    const targetIsSuper =
      (targetPlatformSnap.exists &&
        isSuperAdminRecord(targetPlatformSnap.data())) ||
      (targetMemberSnap.exists && isSuperAdminRecord(targetMemberSnap.data()));

    if (targetIsSuper) {
      throw new HttpsError(
        'failed-precondition',
        'Super Admin permissions are protected and cannot be modified or restricted.'
      );
    }

    if (!targetMemberSnap.exists || !isChurchAdminRecord(targetMemberSnap.data())) {
      throw new HttpsError(
        'failed-precondition',
        'Target user is not an active Church Administrator.'
      );
    }

    const sanitizedNext = sanitizeModulesPatch(request.data?.modules);
    const prevDoc = targetPermSnap.exists ? targetPermSnap.data() : undefined;
    const prevModules = prevDoc?.modules
      ? sanitizeModulesPatch(prevDoc.modules)
      : {};
    const { addedModules, removedModules } = computeModulesDiff(
      prevModules,
      sanitizedNext
    );

    const targetData = targetMemberSnap.data() || {};
    const targetName = String(
      targetData.name ||
        `${targetData.firstName || ''} ${targetData.lastName || ''}`.trim() ||
        'Administrator'
    ).trim();
    const nextVersion = Number(prevDoc?.version || 0) + 1;

    const batch = db.batch();
    batch.set(
      churchRef.collection('admin_permissions').doc(targetUid),
      {
        uid: targetUid,
        churchId,
        adminName: targetName,
        adminPhone: String(targetData.phone || ''),
        adminRole: String(targetData.userType || targetData.role || 'Admin'),
        isSuperAdmin: false,
        modules: sanitizedNext,
        version: nextVersion,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: actorUid,
        updatedByName: actorName,
      },
      { merge: true }
    );

    const logRef = churchRef.collection('admin_permission_audit_logs').doc();
    batch.set(logRef, {
      targetUid,
      targetName,
      actorUid,
      actorName,
      action: 'UPDATE_ADMIN_PERMISSIONS',
      previousModules: prevModules,
      nextModules: sanitizedNext,
      addedModules,
      removedModules,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {
      success: true,
      targetUid,
      modules: sanitizedNext,
      version: nextVersion,
      addedModules,
      removedModules,
      updatedByName: actorName,
      updatedAtMs: Date.now(),
    };
  }
);

export const saveDefaultAdminPermissions = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public' },
  async (request) => {
    const db = getFirestore();
    const churchId = normalizeChurchId(request.data?.churchId);
    const { uid: actorUid, actorName } = await assertSuperAdminCaller(
      db,
      request.auth,
      churchId
    );

    const nextDefaults = sanitizeModulesPatch(request.data?.defaultModules);
    const churchRef = db.collection('Rhema Church').doc(churchId);
    const templateRef = churchRef
      .collection('admin_permission_settings')
      .doc('default_template');
    const prevSnap = await templateRef.get();
    const prevDefaults = prevSnap.exists
      ? sanitizeModulesPatch(prevSnap.data()?.defaultModules)
      : {};
    const { addedModules, removedModules } = computeModulesDiff(
      prevDefaults,
      nextDefaults
    );

    const batch = db.batch();
    batch.set(
      templateRef,
      {
        churchId,
        defaultModules: nextDefaults,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: actorUid,
        updatedByName: actorName,
      },
      { merge: true }
    );
    batch.set(churchRef.collection('admin_permission_audit_logs').doc(), {
      targetUid: 'default_template',
      targetName: 'Default New Admin Template',
      actorUid,
      actorName,
      action: 'UPDATE_DEFAULT_TEMPLATE',
      previousModules: prevDefaults,
      nextModules: nextDefaults,
      addedModules,
      removedModules,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return {
      success: true,
      defaultModules: nextDefaults,
      updatedByName: actorName,
      updatedAtMs: Date.now(),
    };
  }
);

/**
 * Super-Admin-only role promotion/demotion endpoint (prevents delegated
 * Members-tab admins from promoting themselves or modifying Super Admin roles).
 */
export const promoteOrDemoteChurchAdmin = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public' },
  async (request) => {
    const db = getFirestore();
    const churchId = normalizeChurchId(request.data?.churchId);
    const { uid: actorUid, actorName } = await assertSuperAdminCaller(
      db,
      request.auth,
      churchId
    );

    const targetUid = String(request.data?.memberId || '').trim();
    const nextRole = String(request.data?.userType || '').trim();
    if (!targetUid || (nextRole !== 'Admin' && nextRole !== 'Member')) {
      throw new HttpsError(
        'invalid-argument',
        'Valid memberId and userType ("Admin" or "Member") are required.'
      );
    }

    const churchRef = db.collection('Rhema Church').doc(churchId);
    const membersCol = churchRef.collection('members');
    const targetRef = membersCol.doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'Member document not found.');
    }
    const targetData = targetSnap.data() || {};
    if (isSuperAdminRecord(targetData)) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot change role of a Super Admin via this endpoint.'
      );
    }

    const targetName = String(
      targetData.name ||
        `${targetData.firstName || ''} ${targetData.lastName || ''}`.trim() ||
        'Member'
    ).trim();

    const batch = db.batch();
    const rolePatch =
      nextRole === 'Admin'
        ? {
            userType: 'Admin',
            role: 'Admin',
            isAdmin: true,
            updatedAt: FieldValue.serverTimestamp(),
          }
        : {
            userType: 'Member',
            role: 'Member',
            isAdmin: false,
            updatedAt: FieldValue.serverTimestamp(),
          };
    batch.update(targetRef, rolePatch);

    // Sync linked member docs sharing the same phone (preserving legacy behavior)
    const rawPhone = String(targetData.phone || '').replace(/\D/g, '');
    const last10 = rawPhone.slice(-10);
    if (last10) {
      const variants = [last10, `+91${last10}`, `91${last10}`, targetData.phone];
      const dupSnaps = await Promise.all(
        variants
          .filter(Boolean)
          .map((p) => membersCol.where('phone', '==', p).get().catch(() => null))
      );
      dupSnaps.forEach((snap) => {
        snap?.docs?.forEach((d: any) => {
          if (d.id !== targetUid && !isSuperAdminRecord(d.data())) {
            batch.update(d.ref, rolePatch);
          }
        });
      });
    }

    if (nextRole === 'Admin') {
      const [permSnap, templateSnap] = await Promise.all([
        churchRef.collection('admin_permissions').doc(targetUid).get(),
        churchRef
          .collection('admin_permission_settings')
          .doc('default_template')
          .get(),
      ]);
      if (!permSnap.exists) {
        const defaultModules = buildDefaultNewAdminModules(
          templateSnap.exists ? templateSnap.data()?.defaultModules : null
        );
        batch.set(churchRef.collection('admin_permissions').doc(targetUid), {
          uid: targetUid,
          churchId,
          adminName: targetName,
          adminPhone: String(targetData.phone || ''),
          adminRole: 'Admin',
          isSuperAdmin: false,
          modules: defaultModules,
          version: 1,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: actorUid,
          updatedByName: actorName,
        });
        batch.set(churchRef.collection('admin_permission_audit_logs').doc(), {
          targetUid,
          targetName,
          actorUid,
          actorName,
          action: 'INIT_NEW_ADMIN',
          previousModules: {},
          nextModules: defaultModules,
          addedModules: Object.keys(defaultModules).filter(
            (k) => k !== 'dashboard' && defaultModules[k]
          ),
          removedModules: [],
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      batch.delete(churchRef.collection('admin_permissions').doc(targetUid));
      batch.set(churchRef.collection('admin_permission_audit_logs').doc(), {
        targetUid,
        targetName,
        actorUid,
        actorName,
        action: 'REVOKE_ADMIN_ROLE',
        previousModules: {},
        nextModules: {},
        addedModules: [],
        removedModules: [],
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    return { success: true, memberId: targetUid, userType: nextRole };
  }
);

/**
 * Backup safety trigger: whenever any member gains an Admin/Pastor role and does
 * not yet have `admin_permissions/{memberId}` (and is not Super Admin),
 * initialize strictly with `default_template.defaultModules` (fail-closed default).
 */
export const onMemberAdminRoleWritten = onDocumentWritten(
  {
    document: 'Rhema Church/{churchId}/members/{memberId}',
    region: 'asia-south1',
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) return;

    const churchId = event.params.churchId || DEFAULT_CHURCH_ID;
    const memberId = event.params.memberId;
    const afterData = afterSnap.data() || {};

    if (!isChurchAdminRecord(afterData) || isSuperAdminRecord(afterData)) {
      return;
    }

    const db = getFirestore();
    const churchRef = db.collection('Rhema Church').doc(churchId);
    const permRef = churchRef.collection('admin_permissions').doc(memberId);
    const [permSnap, templateSnap, platformSnap] = await Promise.all([
      permRef.get(),
      churchRef
        .collection('admin_permission_settings')
        .doc('default_template')
        .get(),
      db.collection('platform_admins').doc(memberId).get(),
    ]);

    if (permSnap.exists) return;
    if (platformSnap.exists && isSuperAdminRecord(platformSnap.data())) return;

    // Wait until default_template exists so new admins strictly receive configured defaults
    // rather than pre-rollout Option A legacy admins.
    if (!templateSnap.exists) return;

    const defaultModules = buildDefaultNewAdminModules(
      templateSnap.data()?.defaultModules
    );
    const memberName = String(
      afterData.name ||
        `${afterData.firstName || ''} ${afterData.lastName || ''}`.trim() ||
        'Administrator'
    ).trim();

    await permRef.set({
      uid: memberId,
      churchId,
      adminName: memberName,
      adminPhone: String(afterData.phone || ''),
      adminRole: String(afterData.userType || afterData.role || 'Admin'),
      isSuperAdmin: false,
      modules: defaultModules,
      version: 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: 'system_default_template',
      updatedByName: 'Default Admin Template',
    });

    await churchRef.collection('admin_permission_audit_logs').add({
      targetUid: memberId,
      targetName: memberName,
      actorUid: 'system_default_template',
      actorName: 'Default Admin Template',
      action: 'INIT_NEW_ADMIN',
      previousModules: {},
      nextModules: defaultModules,
      addedModules: Object.keys(defaultModules).filter(
        (k) => k !== 'dashboard' && defaultModules[k]
      ),
      removedModules: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  }
);
