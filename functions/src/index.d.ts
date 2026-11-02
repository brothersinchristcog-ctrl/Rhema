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
/**
 * ⏰ YOUTUBE LIVE CHECK SCHEDULER
 * Runs every 5 minutes to check if YouTube channel is live
 */
export declare const checkYouTubeLive: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const triggerTestYouTubeLive: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    sent?: never;
    failed?: never;
    broadcastId?: never;
} | {
    success: boolean;
    sent: any;
    failed: any;
    broadcastId: any;
    message?: never;
}>, unknown>;
export { publishScheduledSermons, triggerPublishScheduledSermonsHttp, triggerDailyVersePushHttp, monitorMeetingLive, pushMeetingLive } from './notifications.js';
//# sourceMappingURL=index.d.ts.map