import { Firestore, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
export declare function getProfileRef(db: Firestore, uid: string): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getPrivateRef(db: Firestore, uid: string): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getPrefsRef(db: Firestore, uid: string): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getVerificationRef(db: Firestore, uid: string): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getShortlistsCol(db: Firestore, uid: string): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getShortlistedByCol(db: Firestore, uid: string): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getViewsCol(db: Firestore, uid: string): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getViewedByCol(db: Firestore, uid: string): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getBlocksCol(db: Firestore, uid: string): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getAdminProfileRef(db: Firestore, uid: string): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
export declare function getBanRef(db: Firestore, uid: string): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
/**
 * Reads sensitive private info from matrimony_profiles/{uid}/private/info,
 * falling back to legacy matrimony_private/{uid} during migration.
 */
export declare function readPrivateSnap(db: Firestore, uid: string): Promise<DocumentSnapshot>;
/**
 * Reads partner preferences from matrimony_profiles/{uid}/preferences/partner,
 * falling back to legacy matrimony_preferences/{uid} during migration.
 */
export declare function readPrefsSnap(db: Firestore, uid: string): Promise<DocumentSnapshot>;
/**
 * Reads verification status from matrimony_profiles/{uid}/verification/status,
 * falling back to legacy matrimony_verifications/{uid} during migration.
 */
export declare function readVerificationSnap(db: Firestore, uid: string): Promise<DocumentSnapshot>;
export declare function readShortlistDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]>;
export declare function readShortlistedByDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]>;
export declare function readViewDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]>;
export declare function readViewedByDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]>;
export declare function readBlockDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]>;
export declare function isMatrimonyProfileInactiveStatus(status: unknown): boolean;
export declare function isMatrimonyBanned(db: Firestore, uid: string): Promise<{
    banned: boolean;
    reason?: string;
}>;
export declare function assertMatrimonyNotBanned(db: Firestore, uid: string): Promise<void>;
export declare function assertMatrimonyProfileActive(db: Firestore, uid: string): Promise<Record<string, any>>;
export interface PurgeUserOptions {
    banOnDelete?: boolean;
    banReason?: string;
    actorUid?: string;
    source?: 'admin_action' | 'console_delete' | 'self_reset';
    auditAction?: string;
}
/**
 * Purges a user's Matrimony profile, all subcollections, consolidated admin doc,
 * legacy root docs, Storage photos, and cross-user interests/matches.
 * Leaves their main Rhema Church membership record untouched.
 */
export declare function purgeMatrimonyUserData(db: Firestore, targetUid: string, options?: PurgeUserOptions): Promise<void>;
//# sourceMappingURL=store.d.ts.map