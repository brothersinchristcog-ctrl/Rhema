/**
 * 🔔 SEND MEETING NOTIFICATION
 * Triggered when a new online meeting is scheduled in Firestore.
 * Sends a notification to the church's topic with strict atomic deduplication to prevent 5x duplicates.
 */
export declare const pushMeetingLive: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    meetingId: string;
}>>;
/**
 * 🛡️ DEPRECATED DUPLICATE TRIGGERS:
 * Deployed under old names in Firebase (alertMeetingPush, sendMeetingNotification, sendMeetingPush, meetingPushV1).
 * Replaced with no-ops here so when deployed they will NEVER send duplicate notifications.
 */
export declare const alertMeetingPush: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    meetingId: string;
}>>;
export declare const sendMeetingNotification: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    meetingId: string;
}>>;
export declare const sendMeetingPush: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    meetingId: string;
}>>;
/**
 * 🙏 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY PRAYER REQUEST
 * Triggered automatically whenever a member submits a prayer request in Firestore.
 * Always notifies church admins (public or private), clearly showing which specific member submitted it.
 */
export declare const onPrayerRequestCreatedAdmin: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    prayerId: string;
}>>;
/**
 * 🙏 NOTIFY COMMUNITY OF APPROVED PRAYER REQUEST
 * Triggered when a prayer request is approved (isAnswered becomes true).
 */
export declare const pushPrayerRequestApproved: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
    churchId: string;
    prayerId: string;
}>>;
/**
 * 🎙️ CHECK & AUTO-PUBLISH SCHEDULED SERMONS
 * Checks if any sermon with status 'Scheduled' has reached its scheduledPublishAt
 * or scheduledDate + scheduledTime. Automatically publishes the sermon, updates Firestore,
 * and sends an FCM push notification to church members.
 */
export declare function checkAndPublishScheduledSermons(sermonsRef: any, churchId: string, churchDocRef?: any): Promise<void>;
/**
 * ⏱ CHECK ONLINE MEETINGS (CRON JOB)
 * Cron Job: Runs every minute to check if any online meeting is starting now (or within 5 minutes)
 */
/**
 * 🎙️ AUTOMATED SCHEDULED SERMONS PUBLISHER & NOTIFIER (CRON JOB)
 * Cloud Scheduler runs this every minute (Asia/Kolkata, region: asia-south1).
 * Matches the architecture and region of automatedDailyPromise.
 */
export declare const publishScheduledSermons: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const monitorMeetingLive: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 🏛️ NOTIFY SUPER ADMINS OF NEW CHURCH REGISTRATION
 * Triggered automatically when a new church document is created in Firestore.
 */
export declare const pushNewChurchRegistered: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
}>>;
export declare const pushBibleQuizCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    quizId: string;
}>>;
export declare const pushBibleQuizUpdated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
    churchId: string;
    quizId: string;
}>>;
/**
 * 📖 SEND DAILY BIBLE QUIZ NOTIFICATION (Core Engine)
 * Dispatches the daily Bible quiz challenge to church members.
 * Supports:
 * - Direct FCM Multicast to all registered device tokens with sound, max priority, and channelId 'daily_quiz'
 * - FCM Topic broadcast to each active church topic (church_{churchId})
 * - Logging into broadcasts and notifications subcollections for all churches
 * - Idempotency tracking via lastBroadcastDate
 */
export declare function sendDailyQuizNotificationInternal(force?: boolean): Promise<{
    success: boolean;
    sentCount: number;
    message: string;
}>;
/**
 * ⏰ AUTOMATED DAILY BIBLE QUIZ SCHEDULER
 * Scheduled to run every day at 06:00 AM IST (12:30 AM UTC)
 * Automatically delivers the Daily Bible Quiz push notification to members worldwide.
 */
export declare const automatedDailyQuiz: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * ⏰ PERIODIC SCHEDULED QUIZ SAFETY NET
 * Runs every 15 minutes between 05:00 AM and 09:00 AM IST
 * Ensures that if Super Admin configured a custom delivery time or a temporary network glitch occurred at 06:00,
 * the daily quiz is automatically delivered as soon as the scheduled time is reached.
 */
export declare const periodicDailyQuizSafetyNet: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 🚀 TRIGGER DAILY QUIZ NOTIFICATION (HTTP / Super Admin Test Endpoint)
 * Invokable endpoint for Super Admin to manually trigger or test the daily quiz push immediately.
 */
export declare const triggerDailyQuizNotificationHttp: import("firebase-functions/v2/https").HttpsFunction;
/**
 * 🧪 HTTP endpoint to manually check and publish scheduled sermons
 */
export declare const triggerPublishScheduledSermonsHttp: import("firebase-functions/v2/https").HttpsFunction;
/**
 * 📖 AUTOMATED DAILY VERSE MULTICAST PUSH (English & Telugu)
 * Determines the current slot (Morning, Afternoon, Evening, Night) or uses slotOverride.
 * Queries today's verse from 'daily_verses' and sends two simultaneous FCM push notifications:
 * 1. English notification ('✝️ Good Morning' + verseEn + referenceEn)
 * 2. Telugu notification ('✝️ శుభోదయం' + verseTe + referenceTe)
 */
export declare function sendDailyVersePushInternal(slotOverride?: string): Promise<{
    success: boolean;
    error: string;
    slot?: never;
    targetIndex?: never;
    verseReferenceEn?: never;
    verseReferenceTe?: never;
    totalTokens?: never;
    sentEnCount?: never;
    sentTeCount?: never;
} | {
    success: boolean;
    slot: string;
    targetIndex: number;
    verseReferenceEn: any;
    verseReferenceTe: any;
    totalTokens: number;
    sentEnCount: number;
    sentTeCount: number;
    error?: never;
}>;
/**
 * ⏰ AUTOMATED DAILY VERSE PUSH SCHEDULER
 * Runs 4 times a day at 8:00 AM, 1:00 PM, 6:00 PM, 9:00 PM IST (Asia/Kolkata).
 */
export declare const automatedDailyVersePush: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 🧪 HTTP endpoint to manually trigger the Daily Verse push (can specify ?slot=Morning/Afternoon/Evening/Night)
 * Also used by external Cloud Schedulers (Google Cloud Console or cron-job.org).
 */
export declare const triggerDailyVersePushHttp: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=notifications.d.ts.map