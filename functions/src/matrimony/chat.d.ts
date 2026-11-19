export declare const MATRIMONY_RTDB_URL = "https://rhema-global-ministries-default-rtdb.firebaseio.com";
/**
 * 1. ensureMatrimonyChatRoom
 * Verifies mutual-match eligibility and provisions participants & inbox metadata in RTDB.
 */
export declare const ensureMatrimonyChatRoom: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    roomId: string;
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
 */
export declare const getMatrimonyChatContacts: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
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
 * Sends a push notification to the recipient when a real-time chat message is sent.
 */
export declare const notifyMatrimonyChatMessage: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    sent: boolean;
}>, unknown>;
export declare function seedMutualMatchChatOnAccept(db: FirebaseFirestore.Firestore, uidA: string, uidB: string): Promise<void>;
//# sourceMappingURL=chat.d.ts.map