import './globalConfig.js';
export declare const DELEGABLE_MODULE_KEYS: readonly ["promises", "sermons", "songs", "events", "pastor_events", "prayer_wall", "testimonies", "attendance", "kids_ministry", "service_roster", "job_circle", "volunteers", "members", "approvals", "celebrations", "gallery", "notifications", "whatsapp", "online_meetings", "bible_quiz", "baptism", "matrimony", "support_team", "church_settings"];
export declare const PROTECTED_SUPER_ADMIN_MODULE_KEYS: Set<string>;
export declare const ALL_MODULE_KEYS: Set<string>;
export declare function normalizeChurchId(raw: unknown): string;
export declare function isSuperAdminRecord(record: Record<string, any> | undefined, token?: Record<string, any>): boolean;
export declare function isChurchAdminRecord(record: Record<string, any> | undefined): boolean;
/**
 * Strips any unknown or Super-Admin-protected keys (care_cells, expense, donations,
 * daily_verses, app_admin) and always forces `dashboard: true`.
 */
export declare function sanitizeModulesPatch(rawModules: unknown): Record<string, boolean>;
export declare function buildOptionAExistingAdminModules(): Record<string, boolean>;
export declare function buildDefaultNewAdminModules(templateModules?: Record<string, boolean> | null): Record<string, boolean>;
export declare function computeModulesDiff(prevModules: Record<string, boolean> | undefined | null, nextModules: Record<string, boolean>): {
    addedModules: string[];
    removedModules: string[];
};
export declare function checkIsSuperAdminCaller(db: FirebaseFirestore.Firestore, uid: string, token: Record<string, any> | undefined, churchId: string): Promise<{
    isSuperAdmin: boolean;
    actorName: string;
}>;
export declare function assertSuperAdminCaller(db: FirebaseFirestore.Firestore, auth: {
    uid?: string;
    token?: Record<string, any>;
} | undefined, churchId: string): Promise<{
    uid: string;
    actorName: string;
}>;
/**
 * Backend enforcement for delegable Admin modules.
 * - Super Admins always pass.
 * - Protected modules (`care_cells`, `expense`, `donations`, `daily_verses`, `app_admin`)
 *   reject non-Super-Admin callers immediately.
 * - Delegable modules check `admin_permissions/{uid}.modules[moduleKey] === true` when
 *   explicitly stored or once `admin_permission_settings/default_template` exists.
 */
export declare function assertAdminModulePermission(db: FirebaseFirestore.Firestore, auth: {
    uid?: string;
    token?: Record<string, any>;
} | undefined, churchId: string, moduleKey: string): Promise<{
    uid: string;
    isSuperAdmin: boolean;
}>;
/**
 * Filters candidate admin UIDs and their FCM tokens by module permission.
 * - Super Admins are ALWAYS preserved.
 * - Protected Super Admin modules strictly allow Super Admins only.
 * - Pre-rollout Option A (neither `default_template` nor any `admin_permissions` docs exist):
 *   preserves all candidate admins without disruption.
 */
export declare function filterAuthorizedAdminRecipientsForModule(db: FirebaseFirestore.Firestore, churchId: string, moduleKey: string, candidates: Array<{
    uid: string;
    tokens?: string[];
}>, unattributedTokens?: string[]): Promise<{
    adminUids: string[];
    tokens: string[];
}>;
export declare function isChurchAdminPermissionConfigured(db: FirebaseFirestore.Firestore, churchId: string): Promise<boolean>;
/**
 * Resolves all authorized Admin UIDs and deduplicated FCM device tokens for a moduleKey
 * across members, church owner metadata, users, and platform_admins.
 */
export declare function resolveAuthorizedModuleAdminRecipients(db: FirebaseFirestore.Firestore, churchId: string, moduleKey: string): Promise<{
    adminUids: string[];
    tokens: string[];
    isPermissionConfigured: boolean;
}>;
export declare const listChurchAdminsWithPermissions: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    churchId: string;
    admins: {
        modules: Record<string, boolean>;
        hasExplicitDoc: boolean;
        updatedAtMs: any;
        updatedByUid: any;
        updatedByName: any;
        version: number;
        uid: string;
        name: string;
        phone: string;
        email: string;
        userType: string;
        role: string;
        isSuperAdmin: boolean;
    }[];
    defaultModules: Record<string, boolean>;
    auditLogs: {
        id: string;
        targetUid: any;
        targetName: any;
        actorUid: any;
        actorName: any;
        action: any;
        addedModules: any[];
        removedModules: any[];
        createdAtMs: any;
    }[];
}>, unknown>;
export declare const saveAdminModulePermissions: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    targetUid: string;
    modules: Record<string, boolean>;
    version: number;
    addedModules: string[];
    removedModules: string[];
    updatedByName: string;
    updatedAtMs: number;
}>, unknown>;
export declare const saveDefaultAdminPermissions: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    defaultModules: Record<string, boolean>;
    updatedByName: string;
    updatedAtMs: number;
}>, unknown>;
/**
 * Super-Admin-only role promotion/demotion endpoint (prevents delegated
 * Members-tab admins from promoting themselves or modifying Super Admin roles).
 */
export declare const promoteOrDemoteChurchAdmin: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    memberId: string;
    userType: string;
}>, unknown>;
/**
 * Backup safety trigger: whenever any member gains an Admin/Pastor role and does
 * not yet have `admin_permissions/{memberId}` (and is not Super Admin),
 * initialize strictly with `default_template.defaultModules` (fail-closed default).
 */
export declare const onMemberAdminRoleWritten: import("firebase-functions").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    churchId: string;
    memberId: string;
}>>;
//# sourceMappingURL=adminPermissions.d.ts.map