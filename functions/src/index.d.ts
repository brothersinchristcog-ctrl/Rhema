/**
 * ⏰ AUTOMATED DAILY PROMISE SCHEDULER
 * Scheduled to run every day at 05:00 AM IST (01:30 AM UTC)
 */
export declare const automatedDailyPromise: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 📣 ON BROADCAST CREATED TRIGGER (Rhema Church collection)
 * Catches all broadcasts created in 'Rhema Church/{churchId}/broadcasts/{messageId}'
 */
export declare const sendRhemaBroadcastPush: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    messageId: string;
}>>;
/**
 * 🧪 Test HTTP endpoint to trigger today's Daily Promise push notification on-demand
 */
export declare const triggerDailyPromisePushHttp: import("firebase-functions/v2/https").HttpsFunction;
export { publishScheduledSermons, triggerPublishScheduledSermonsHttp, triggerDailyVersePushHttp } from './notifications.js';
//# sourceMappingURL=index.d.ts.map