/**
 * 🔍 HELPER: Resolves valid FCM tokens for a member or candidate across:
 * 1. Rhema Church/{churchId}/members/{candidateId} (fcmToken, fcmTokens, and auth user pointer)
 * 2. users/{candidateId}
 * 3. Legacy churches/{churchId}/members/{candidateId}
 * 4. Phone number search if provided
 * 5. Display name search in members
 */
export declare function resolveCandidateFcmTokens(db: FirebaseFirestore.Firestore, churchId: string, candidateId: string, candidatePhone?: string, candidateName?: string): Promise<string[]>;
/**
 * 📲 HELPER: Sends assignment push notification & records in-app notification
 */
export declare function sendCandidateAssignmentPush(params: {
    db: FirebaseFirestore.Firestore;
    churchId: string;
    serviceId: string;
    roleId: string;
    roleTitle: string;
    candidate: {
        candidateId: string;
        candidateName: string;
        candidatePhone?: string;
    };
    candidateIndex: number;
    queueRef: FirebaseFirestore.DocumentReference;
    timeoutMinutes: number;
    isCascade?: boolean;
}): Promise<{
    success: boolean;
    tokensCount: number;
    error?: string | undefined;
}>;
/**
 * 🔔 1. ON SERVICE ASSIGNMENT QUEUE DISPATCHED (Written: Create + Update)
 * Fired whenever an assignment queue document is created or updated in Firestore.
 * Sends targeted push notifications to the active candidate with Accept/Decline options.
 */
export declare const onServiceAssignmentQueueDispatched: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    churchId: string;
    serviceId: string;
    roleId: string;
}>>;
/**
 * ⚡ 2. ON SERVICE ASSIGNMENT RESPONDED (CASCADE ADVANCER)
 * Fired when an assignment queue is updated. If the active candidate declined or timed out,
 * this function automatically cascades the request to Candidate 2, Candidate 3, etc.
 */
export declare const onServiceAssignmentResponded: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
    churchId: string;
    serviceId: string;
    roleId: string;
}>>;
/**
 * ⏰ 3. ASSIGNMENT TIMEOUT CHECKER CRON JOB
 * Dedicated Cloud Scheduler running every 15 minutes.
 * Scans active queues with status == 'pending' and marks candidates as 'timed_out'
 * if their deadline has elapsed, allowing the cascade trigger above to take over.
 */
export declare const checkServiceAssignmentTimeoutsCron: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * ⏰ 4. SERVICE ROSTER REMINDERS CRON JOB
 * Dedicated Cloud Scheduler running daily at 08:00 AM IST.
 * Sends 24-hour reminders to all confirmed volunteers for tomorrow's services.
 */
export declare const sendServiceRosterRemindersCron: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 🌐 5. HTTP TRIGGER TO TEST ROSTER TIMEOUTS
 */
export declare const triggerCheckRosterTimeoutsHttp: import("firebase-functions/v2/https").HttpsFunction;
/**
 * 🌐 5B. HTTP TRIGGER TO MANUALLY DISPATCH OR RETRY ASSIGNMENT NOTIFICATION
 */
export declare const dispatchServiceAssignmentNotificationHttp: import("firebase-functions/v2/https").HttpsFunction;
/**
 * 🎶 6. ON SERVICE REHEARSAL CREATED
 * Fired when a rehearsal is scheduled for a worship service.
 * Alerts all invited team members and assigned band musicians via FCM.
 */
export declare const onServiceRehearsalCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    serviceId: string;
    rehearsalId: string;
}>>;
//# sourceMappingURL=rosterNotifications.d.ts.map