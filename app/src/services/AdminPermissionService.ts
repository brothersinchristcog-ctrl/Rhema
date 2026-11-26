import { firestore, functions } from './firebaseConfig';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';
import {
  AdminModuleKey,
  buildDefaultNewAdminModules,
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
  }> {
    const cid = normalizeChurch(churchId);
    const fn = getPermissionCallable('listChurchAdminsWithPermissions');
    const res = await fn({ churchId: cid });
    const data = (res?.data || {}) as any;
    const admins: AdminDirectoryEntry[] = Array.isArray(data.admins) ? data.admins : [];
    const defaultModules = buildDefaultNewAdminModules(data.defaultModules || null);
    return { admins, defaultModules };
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
    const res = await fn({
      churchId: cid,
      targetUid: params.targetUid,
      modules: params.modules,
    });
    return res.data as any;
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
    const res = await fn({
      churchId: cid,
      defaultModules: params.defaultModules,
    });
    return res.data as any;
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
    const res = await fn({
      churchId: cid,
      targetUid: params.targetUid,
      newUserType: params.newUserType,
      ...(params.modules ? { modules: params.modules } : {}),
    });
    return res.data as any;
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
