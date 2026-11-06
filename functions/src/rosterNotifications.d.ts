/**
 * 🔔 1. ON SERVICE ASSIGNMENT QUEUE DISPATCHED
 * Fired when an assignment queue is created or when a new candidate becomes active.
 * Sends an FCM push notification directly to the active candidate with Accept/Decline action payload.
 */
export declare const onServiceAssignmentQueueDispatched: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
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