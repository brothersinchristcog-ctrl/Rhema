export declare const MATRIMONY_RTDB_URL = "https://rhema-global-ministries-default-rtdb.firebaseio.com";
/**
 * 1. ensureMatrimonyChatRoom
 * Verifies mutual-match eligibility, resolves viewer's messageAccess entitlement,
 * exposes contactPhone ONLY if Platinum or explicitly unlocked, and provisions RTDB room.
 * Free/expired members keep read access to existing chat history with canMessage=false.
 */
export declare const ensureMatrimonyChatRoom: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    roomId: string;
    canMessage: boolean;
    viewerTier: import("./entitlements.js").MatrimonyTier;
    peer: {
        uid: string;
        displayName: any;
        profileCode: any;
        signedProfilePhoto: string | null;
        age: number | null;
        city: any;
        contactPhone: any;
    };
    self: {
        uid: string;
        displayName: any;
        signedProfilePhoto: string | null;
    };
}>, unknown>;
/**
 * 2. getMatrimonyChatContacts
 * Ensures RTDB chat rooms & inbox entries exist for all Mutual Matches of the viewer.
 * Respects viewer's contact unlock entitlement and exposes messageAccess status.
 */
export declare const getMatrimonyChatContacts: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    canMessage: boolean;
    viewerTier: string;
    contacts: never[];
    self: {
        uid: string;
        displayName: string;
        signedProfilePhoto: null;
    };
} | {
    success: boolean;
    canMessage: boolean;
    viewerTier: import("./entitlements.js").MatrimonyTier;
    contacts: {
        roomId: string;
        uid: string;
        displayName: string;
        profileCode: string;
        signedProfilePhoto: string | null;
        age: number | null;
        city: string;
        contactPhone: string | null;
        matchTierEligible: boolean;
    }[];
    self: {
        uid: string;
        displayName: any;
        signedProfilePhoto: string | null;
    };
}>, unknown>;
/**
 * 3. notifyMatrimonyChatMessage
 * Verifies messageAccess entitlement and sends a push notification to the recipient.
 */
export declare const notifyMatrimonyChatMessage: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    sent: boolean;
}>, unknown>;
/**
 * 4. sendMatrimonyMessage
 * Server-validated personalised message action (checks active paid plan + mutual match + block status).
 */
export declare const sendMatrimonyMessage: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    roomId: string;
    messageId: string;
}>, unknown>;
export declare function seedMutualMatchChatOnAccept(db: FirebaseFirestore.Firestore, uidA: string, uidB: string): Promise<void>;
//# sourceMappingURL=chat.d.ts.map