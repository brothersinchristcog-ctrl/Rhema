import { DocumentReference, Firestore } from 'firebase-admin/firestore';
export type MatrimonyNotificationPrefKey = 'request' | 'shortlist' | 'profileViews' | 'interestAcceptance' | 'recentlyJoined' | 'dailyMatches' | 'cityMatches' | 'photoMatches' | 'similarMatches' | 'newMatches' | 'dailyRecommendations' | 'basedOnActivity' | 'membershipOffers';
export interface SendMatrimonyNotificationParams {
    db?: Firestore;
    recipientUid: string;
    recipientProfile?: Record<string, any> | null;
    senderUid?: string | null;
    prefKey?: MatrimonyNotificationPrefKey;
    type: string;
    title: string;
    body: string;
    imageUrl?: string | null;
    tag?: string;
    data?: Record<string, string | number | boolean | null | undefined>;
    writeInAppDoc?: boolean;
    allowNonApprovedRecipient?: boolean;
}
export declare function resolveNotificationPhotoUrl(pathOrUrl?: string | null): Promise<string | null>;
export declare function extractTokensFromDoc(data: Record<string, any> | undefined): string[];
export declare function collectMemberFcmTokens(db: Firestore, uid: string): Promise<{
    tokens: string[];
    refs: DocumentReference[];
}>;
export declare function isNotificationPrefEnabled(profile: Record<string, any> | null | undefined, prefKey?: MatrimonyNotificationPrefKey): boolean;
export declare function getObjectPronoun(genderRaw: unknown): 'her' | 'him' | 'them';
export declare function sendMatrimonyNotification(params: SendMatrimonyNotificationParams): Promise<{
    sent: boolean;
    reason?: string;
    successCount?: number;
}>;
export interface NotifyAuthorizedMatrimonyAdminsParams {
    db?: Firestore;
    docId: string;
    type: 'matrimony_profile_admin' | 'matrimony_report_admin';
    title: string;
    body: string;
    data?: Record<string, string | number | boolean | null | undefined>;
}
/**
 * Dispatches Matrimony admin alerts (push + Updates screen doc) strictly to Super Admins
 * and Admins who have the `matrimony` tab permission enabled. Never falls back to global admin topics.
 */
export declare function notifyAuthorizedMatrimonyAdmins(params: NotifyAuthorizedMatrimonyAdminsParams): Promise<{
    adminUids: string[];
    successCount: number;
}>;
//# sourceMappingURL=notifications.d.ts.map