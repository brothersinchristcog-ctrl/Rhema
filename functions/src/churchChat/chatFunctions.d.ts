/**
 * Admin-only callable to create a Rhema Church Group Chat.
 * Enforces Church Admin / Pastor role against Firestore and sets initial RTDB + Firestore state.
 */
export declare const createRhemaChatGroup: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    roomId: string;
}>, unknown>;
/**
 * Push notification fan-out when a new message is written in Rhema Chat RTDB.
 * Respects mute flags, user-to-user blocks, and active room presence.
 */
export declare const onRhemaChatMessageCreated: import("firebase-functions").CloudFunction<import("firebase-functions/v2/database").DatabaseEvent<import("firebase-functions/v2/database").DataSnapshot, {
    churchId: string;
    msgId: string;
    roomId: string;
}>>;
//# sourceMappingURL=chatFunctions.d.ts.map