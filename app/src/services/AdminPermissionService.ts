import { firestore, functions } from './firebaseConfig';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';
import {
  AdminModuleKey,
  buildDefaultNewAdminModules,
  buildOptionAExistingAdminModules,
  canAdminAccessModule,
  DELEGABLE_MODULE_KEYS,
} from '../constants/AdminModules';
import {
  getInstantMemory,
  makeScopedCacheKey,
  writeInstantCache,
} from '../utils/instantCache';

export interface AdminDirectoryEntry {
  uid: string;
  name: string;
  phone: string;
  email: string;
  userType: string;
  role: string;
  isSuperAdmin: boolean;
  modules: Record<string, boolean>;
  hasExplicitDoc: boolean;
  updatedAtMs: number | null;
  updatedByUid: string;
  updatedByName: string;
}

export interface LiveAdminPermissionState {
  modules: Record<string, boolean> | null;
  hasExplicitPermissionDoc: boolean;
  defaultTemplateConfigured: boolean;
  updatedAtMs: number | null;
  updatedByName: string;
}

export interface AdminPermissionAuditLog {
  id: string;
  targetUid: string;
  targetName: string;
  actorUid: string;
  actorName: string;
  action: string;
  addedModules: string[];
  removedModules: string[];
  createdAtMs: number | null;
}

export interface CurrentAuthAccessSnapshot {
  uid: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  modules: Record<string, boolean> | null;
  hasExplicitPermissionDoc: boolean;
  defaultTemplateConfigured: boolean;
}

const DEFAULT_PERM_STATE: LiveAdminPermissionState = {
  modules: null,
  hasExplicitPermissionDoc: false,
  defaultTemplateConfigured: false,
  updatedAtMs: null,
  updatedByName: '',
};

const DEFAULT_AUTH_SNAPSHOT: CurrentAuthAccessSnapshot = {
  uid: null,
  isAdmin: false,
  isSuperAdmin: false,
  modules: null,
  hasExplicitPermissionDoc: false,
  defaultTemplateConfigured: false,
};

const ACTIVE_PERMISSION_CACHE_KEYS = new Set<string>();

function normalizeChurch(churchId?: string | null): string {
  const clean = String(churchId || RHEMA_CHURCH_ID).trim();
  return !clean || clean === 'default' ? RHEMA_CHURCH_ID : clean;
}

function getPermissionCallable(name: string) {
  return functions().app.functions('asia-south1').httpsCallable(name);
}

function isFunctionNotDeployedError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toUpperCase();
  return (
    code.includes('not-found') ||
    code.includes('unimplemented') ||
    msg.includes('NOT_FOUND')
  );
}

function isSuperAdminData(data: any): boolean {
  if (!data) return false;
  const roleStr = `${data.userType || ''} ${data.role || ''}`.toUpperCase();
  return Boolean(
    data.isSuperAdmin === true ||
    data.superadmin === true ||
    roleStr.includes('SUPER')
  );
}

function isChurchAdminData(data: any): boolean {
  if (!data) return false;
  if (isSuperAdminData(data) || data.isAdmin === true) return true;
  const roleStr = `${data.userType || ''} ${data.role || ''}`.toLowerCase();
  return (
    roleStr.includes('admin') ||
    roleStr.includes('pastor') ||
    roleStr.includes('super')
  );
}

function tsToMillis(raw: any): number | null {
  if (!raw) return null;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (typeof raw?._seconds === 'number') return raw._seconds * 1000;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return null;
}

class AdminPermissionServiceClass {
  private authSnapshot: CurrentAuthAccessSnapshot = { ...DEFAULT_AUTH_SNAPSHOT };

  setCurrentAuthAccessSnapshot(snapshot: CurrentAuthAccessSnapshot) {
    this.authSnapshot = {
      ...snapshot,
      modules: snapshot.modules ? { ...snapshot.modules } : null,
    };
  }

  canCurrentUserAccessModuleKey(
    moduleKey: AdminModuleKey | null | undefined,
    hasCareCellAccess = false
  ): boolean {
    if (!moduleKey) return true;
    return canAdminAccessModule({
      moduleKey,
      isSuperAdmin: this.authSnapshot.isSuperAdmin,
      isAdmin: this.authSnapshot.isAdmin,
      modules: this.authSnapshot.modules,
      hasExplicitPermissionDoc: this.authSnapshot.hasExplicitPermissionDoc,
      defaultTemplateConfigured: this.authSnapshot.defaultTemplateConfigured,
      hasCareCellAccess,
    });
  }

  subscribeToMyAdminPermissions(
    churchId: string | undefined | null,
    uid: string | undefined | null,
    onUpdate: (state: LiveAdminPermissionState) => void
  ): () => void {
    if (!uid) {
      onUpdate(DEFAULT_PERM_STATE);
      return () => {};
    }

    const cid = normalizeChurch(churchId);
    const cacheKey = makeScopedCacheKey('admin_perms_v1', cid, uid);
    ACTIVE_PERMISSION_CACHE_KEYS.add(cacheKey);

    let currentModules: Record<string, boolean> | null = null;
    let hasExplicitDoc = false;
    let defaultTemplateConfigured = false;
    let updatedAtMs: number | null = null;
    let updatedByName = '';

    const cached = getInstantMemory<LiveAdminPermissionState>(cacheKey);
    if (cached) {
      currentModules = cached.modules;
      hasExplicitDoc = cached.hasExplicitPermissionDoc;
      defaultTemplateConfigured = cached.defaultTemplateConfigured;
      updatedAtMs = cached.updatedAtMs;
      updatedByName = cached.updatedByName;
      onUpdate(cached);
    }

    const emit = () => {
      const snapshotState: LiveAdminPermissionState = {
        modules: currentModules ? { ...currentModules } : null,
        hasExplicitPermissionDoc: hasExplicitDoc,
        defaultTemplateConfigured,
        updatedAtMs,
        updatedByName,
      };
      writeInstantCache(cacheKey, snapshotState).catch(() => {});
      onUpdate(snapshotState);
    };

    const churchRef = firestore().collection(RHEMA_ROOT_COLLECTION).doc(cid);

    const unsubPerm = churchRef
      .collection('admin_permissions')
      .doc(uid)
      .onSnapshot(
        (snap) => {
          if (snap && snap.exists()) {
            const data = snap.data() || {};
            const rawModules =
              data.modules && typeof data.modules === 'object' ? data.modules : {};
            const normalized: Record<string, boolean> = { dashboard: true };
            for (const key of DELEGABLE_MODULE_KEYS) {
              normalized[key] = rawModules[key] === true;
            }
            currentModules = normalized;
            hasExplicitDoc = true;
            updatedAtMs = tsToMillis(data.updatedAt);
            updatedByName = String(data.updatedByName || '');
          } else {
            currentModules = null;
            hasExplicitDoc = false;
            updatedAtMs = null;
            updatedByName = '';
          }
          emit();
        },
        (err) => {
          console.warn('⚠️ [AdminPermissions] perm doc listener notice:', err?.message);
        }
      );

    const unsubTemplate = churchRef
      .collection('admin_permission_settings')
      .doc('default_template')
      .onSnapshot(
        (snap) => {
          defaultTemplateConfigured = Boolean(snap && snap.exists());
          emit();
        },
        (err) => {
          console.warn('⚠️ [AdminPermissions] template listener notice:', err?.message);
        }
      );

    return () => {
      unsubPerm();
      unsubTemplate();
    };
  }

  async listChurchAdminsWithPermissions(churchId?: string | null): Promise<{
    admins: AdminDirectoryEntry[];
    defaultModules: Record<string, boolean>;
    fromFirestoreFallback?: boolean;
  }> {
    const cid = normalizeChurch(churchId);
    try {
      const fn = getPermissionCallable('listChurchAdminsWithPermissions');
      const res = await fn({ churchId: cid });
      const data = (res?.data || {}) as any;
      const admins: AdminDirectoryEntry[] = Array.isArray(data.admins) ? data.admins : [];
      const defaultModules = buildDefaultNewAdminModules(data.defaultModules || null);
      return { admins, defaultModules, fromFirestoreFallback: false };
    } catch (err: any) {
      if (!isFunctionNotDeployedError(err)) {
        throw err;
      }
      return this.listChurchAdminsFromFirestoreFallback(cid);
    }
  }

  private async listChurchAdminsFromFirestoreFallback(cid: string): Promise<{
    admins: AdminDirectoryEntry[];
    defaultModules: Record<string, boolean>;
    fromFirestoreFallback: boolean;
  }> {
    const churchRef = firestore().collection(RHEMA_ROOT_COLLECTION).doc(cid);
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

    const [
      byFlagSnap,
      bySuperFlagSnap,
      bySuperLowerSnap,
      byUserTypeSnap,
      byRoleSnap,
      platformSnap,
      permsSnap,
      templateSnap,
    ] = await Promise.all([
      membersRef.where('isAdmin', '==', true).limit(150).get().catch(() => null),
      membersRef.where('isSuperAdmin', '==', true).limit(150).get().catch(() => null),
      membersRef.where('superadmin', '==', true).limit(150).get().catch(() => null),
      membersRef.where('userType', 'in', adminRoleValues).limit(150).get().catch(() => null),
      membersRef.where('role', 'in', adminRoleValues).limit(150).get().catch(() => null),
      firestore().collection('platform_admins').limit(100).get().catch(() => null),
      churchRef.collection('admin_permissions').get().catch(() => null),
      churchRef.collection('admin_permission_settings').doc('default_template').get().catch(() => null),
    ]);

    const platformSuperIds = new Set<string>();
    const platformDocs = new Map<string, any>();
    platformSnap?.docs?.forEach((doc: any) => {
      const data = doc.data() || {};
      if (isSuperAdminData(data)) {
        platformSuperIds.add(doc.id);
      }
      platformDocs.set(doc.id, data);
    });

    const permsByUid = new Map<string, any>();
    permsSnap?.docs?.forEach((doc: any) => {
      permsByUid.set(doc.id, doc.data() || {});
    });

    const optionABaseline = buildOptionAExistingAdminModules();
    const defaultModules = buildDefaultNewAdminModules(
      templateSnap?.exists() ? templateSnap.data()?.defaultModules : null
    );
    const templateExists = Boolean(templateSnap && templateSnap.exists());

    const adminMap = new Map<string, AdminDirectoryEntry>();
    const ingestMemberDoc = (doc: any) => {
      const d = doc.data() || {};
      if (!isChurchAdminData(d) && !platformSuperIds.has(doc.id)) return;
      const isSuper = isSuperAdminData(d) || platformSuperIds.has(doc.id);
      const existing = adminMap.get(doc.id);
      const pDoc = permsByUid.get(doc.id);
      const hasExplicitDoc = Boolean(pDoc && pDoc.modules);

      let resolvedModules: Record<string, boolean>;
      if (isSuper) {
        resolvedModules = optionABaseline;
      } else if (hasExplicitDoc) {
        resolvedModules = { dashboard: true };
        for (const key of DELEGABLE_MODULE_KEYS) {
          resolvedModules[key] = pDoc.modules[key] === true;
        }
      } else if (!templateExists) {
        resolvedModules = optionABaseline;
      } else {
        resolvedModules = defaultModules;
      }

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
        userType: String(d.userType || d.role || existing?.userType || (isSuper ? 'Super Admin' : 'Admin')),
        role: String(d.role || d.userType || existing?.role || (isSuper ? 'Super Admin' : 'Admin')),
        isSuperAdmin: Boolean(existing?.isSuperAdmin || isSuper),
        modules: resolvedModules,
        hasExplicitDoc,
        updatedAtMs: tsToMillis(pDoc?.updatedAt) || tsToMillis(d.updatedAt),
        updatedByUid: String(pDoc?.updatedByUid || ''),
        updatedByName: String(pDoc?.updatedByName || ''),
      });
    };

    [byFlagSnap, bySuperFlagSnap, bySuperLowerSnap, byUserTypeSnap, byRoleSnap].forEach((snap) => {
      snap?.docs?.forEach((doc: any) => ingestMemberDoc(doc));
    });

    for (const [uid, pData] of platformDocs.entries()) {
      if (!adminMap.has(uid) && isSuperAdminData(pData)) {
        adminMap.set(uid, {
          uid,
          name: String(pData.name || 'Super Admin'),
          phone: String(pData.phone || ''),
          email: String(pData.email || ''),
          userType: 'Super Admin',
          role: String(pData.role || 'Super Admin'),
          isSuperAdmin: true,
          modules: optionABaseline,
          hasExplicitDoc: false,
          updatedAtMs: tsToMillis(pData.updatedAt),
          updatedByUid: String(pData.grantedBy || ''),
          updatedByName: String(pData.grantedByName || ''),
        });
      }
    }

    const admins = Array.from(adminMap.values()).sort((a, b) => {
      if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      admins,
      defaultModules,
      fromFirestoreFallback: true,
    };
  }

  async saveAdminModulePermissions(params: {
    churchId?: string | null;
    targetUid: string;
    modules: Record<string, boolean>;
  }): Promise<{
    success: boolean;
    targetUid: string;
    modules: Record<string, boolean>;
    addedModules: string[];
    removedModules: string[];
  }> {
    const cid = normalizeChurch(params.churchId);
    const fn = getPermissionCallable('saveAdminModulePermissions');
    try {
      const res = await fn({
        churchId: cid,
        targetUid: params.targetUid,
        modules: params.modules,
      });
      return res.data as any;
    } catch (err: any) {
      if (isFunctionNotDeployedError(err)) {
        throw new Error(
          'Admin Permissions Cloud Functions are not deployed yet. Run "firebase deploy --only functions,firestore:rules" first.'
        );
      }
      throw err;
    }
  }

  async saveDefaultAdminPermissions(params: {
    churchId?: string | null;
    defaultModules: Record<string, boolean>;
  }): Promise<{
    success: boolean;
    defaultModules: Record<string, boolean>;
  }> {
    const cid = normalizeChurch(params.churchId);
    const fn = getPermissionCallable('saveDefaultAdminPermissions');
    try {
      const res = await fn({
        churchId: cid,
        defaultModules: params.defaultModules,
      });
      return res.data as any;
    } catch (err: any) {
      if (isFunctionNotDeployedError(err)) {
        throw new Error(
          'Admin Permissions Cloud Functions are not deployed yet. Run "firebase deploy --only functions,firestore:rules" first.'
        );
      }
      throw err;
    }
  }

  async promoteOrDemoteChurchAdmin(params: {
    churchId?: string | null;
    targetUid: string;
    newUserType: string;
    modules?: Record<string, boolean>;
  }): Promise<{
    success: boolean;
    targetUid: string;
    newUserType: string;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    initializedModules?: Record<string, boolean> | null;
  }> {
    const cid = normalizeChurch(params.churchId);
    const fn = getPermissionCallable('promoteOrDemoteChurchAdmin');
    try {
      const res = await fn({
        churchId: cid,
        targetUid: params.targetUid,
        newUserType: params.newUserType,
        ...(params.modules ? { modules: params.modules } : {}),
      });
      return res.data as any;
    } catch (err: any) {
      if (isFunctionNotDeployedError(err)) {
        throw new Error(
          'Admin Role Cloud Functions are not deployed yet. Run "firebase deploy --only functions,firestore:rules" first.'
        );
      }
      throw err;
    }
  }

  async listPermissionAuditLogs(
    churchId?: string | null,
    limitCount = 40
  ): Promise<AdminPermissionAuditLog[]> {
    const cid = normalizeChurch(churchId);
    const snap = await firestore()
      .collection(RHEMA_ROOT_COLLECTION)
      .doc(cid)
      .collection('admin_permission_audit_logs')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();

    return snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        targetUid: String(d.targetUid || ''),
        targetName: String(d.targetName || d.targetUid || 'Admin'),
        actorUid: String(d.actorUid || ''),
        actorName: String(d.actorName || 'Super Admin'),
        action: String(d.action || 'UPDATE'),
        addedModules: Array.isArray(d.addedModules) ? d.addedModules : [],
        removedModules: Array.isArray(d.removedModules) ? d.removedModules : [],
        createdAtMs: tsToMillis(d.createdAt),
      };
    });
  }

  clearCache() {
    ACTIVE_PERMISSION_CACHE_KEYS.clear();
    this.authSnapshot = { ...DEFAULT_AUTH_SNAPSHOT };
  }
}

export const AdminPermissionService = new AdminPermissionServiceClass();
export default AdminPermissionService;
