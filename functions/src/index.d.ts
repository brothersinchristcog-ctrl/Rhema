import './globalConfig.js';
/**
 * ⏰ AUTOMATED DAILY PROMISE SCHEDULER
 * Scheduled to run every day at 05:00 AM IST (01:30 AM UTC)
 */
export declare const automatedDailyPromise: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 📣 ON BROADCAST CREATED TRIGGER (Rhema Church collection)
 * Catches all broadcasts created in 'Rhema Church/{churchId}/broadcasts/{messageId}'
 */
export declare const sendRhemaBroadcastPush: import("firebase-functions").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    churchId: string;
    messageId: string;
}>>;
/**
 * 🧪 Test HTTP endpoint to trigger today's Daily Promise push notification on-demand
 */
export declare const triggerDailyPromisePushHttp: import("firebase-functions/v2/https").HttpsFunction;
/**
 * ⏰ YOUTUBE LIVE CHECK SCHEDULER
 * Delegates to the shared transactional `checkChurchYouTubeLive` helper so concurrent
 * schedulers NEVER dispatch duplicate notifications for the same live session.
 */
export declare const checkYouTubeLive: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const triggerTestYouTubeLive: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    broadcastId: string;
}>, unknown>;
export { publishScheduledSermons, triggerPublishScheduledSermonsHttp, triggerDailyVersePushHttp, sendDailyVersePushScheduled, monitorMeetingLive, pushMeetingLive, onBaptismRequestCreatedAdmin, onBaptismRequestCreatedAdminLegacy, onPrayerRequestCreatedAdmin, onPrayerRequestCreatedAdminLegacy, onPrayerRequestProcessedMember, onPrayerRequestProcessedMemberLegacy, pushPrayerRequestApproved, pushCareCellAnnouncement, pushCareCellMeeting, pushCareCellPrayerRequest, pushCareCellVisit, onCareCellVisitResponseUpdated, onTestimonyCreatedAdmin, onTestimonyCreatedAdminLegacy, onTestimonyUpdatedWorkflow, onTestimonyUpdatedWorkflowLegacy, onVolunteerApplicationCreated, onVolunteerApplicationCreatedLegacy, onVolunteerApplicationUpdated, onVolunteerApplicationUpdatedLegacy, onEventUpdatedForVolunteers, onEventUpdatedForVolunteersLegacy, scheduledVolunteerReminders, triggerVolunteerPushTestHttp, onJobApplicationCreated, onJobApplicationUpdated, onJobOpportunityCreated, onJobOpportunityUpdated, onRegistrationRequestCreated, onRegistrationRequestUpdated, onVolunteerPostCreated, onVolunteerPostUpdated, onKidsSessionCreated, onKidsSessionUpdated, onKidsAttendanceAbsentCreated, } from './notifications.js';
export { onServiceAssignmentQueueDispatched, onServiceAssignmentResponded, checkServiceAssignmentTimeoutsCron, sendServiceRosterRemindersCron, triggerCheckRosterTimeoutsHttp, dispatchServiceAssignmentNotificationHttp, onServiceRehearsalCreated, onServicePlanPublished, bookResponsibilitySlotHttp, declineResponsibilitySlotHttp, } from './rosterNotifications.js';
export { guestInviteLanding } from './guestInvite.js';
export { startMatrimonyRegistration, saveMatrimonyDraft, submitMatrimonyProfile, resetMatrimonyProfile, getMatrimonyStatus, uploadMatrimonyPhoto, } from './matrimony/registration.js';
export { getMatrimonyAdminDashboard, getMatrimonyPendingProfiles, getMatrimonyAdminProfileDetail, approveMatrimonyProfile, rejectMatrimonyProfile, requestMatrimonyCorrection, suspendMatrimonyProfile, removeMatrimonyProfileForAbuse, deleteMatrimonyProfile, inactivateMatrimonyProfile, activateMatrimonyProfile, resolveMatrimonyReport, } from './matrimony/admin.js';
export { onMatrimonyProfileDeleted, onMatrimonyAdminProfileDeleted, } from './matrimony/triggers.js';
export { getMatrimonyMatches, toggleMatrimonyShortlist, recordMatrimonyProfileView, dismissMatrimonyMatch, restoreMatrimonyMatches, sendMatrimonyInterest, getMatrimonyInterestsHub, respondMatrimonyInterest, reportMatrimonyProfile, } from './matrimony/matches.js';
export { ensureMatrimonyChatRoom, getMatrimonyChatContacts, notifyMatrimonyChatMessage, } from './matrimony/chat.js';
export { createMatrimonyUpgradeOrder, verifyMatrimonyUpgradePayment, } from './matrimony/membership.js';
//# sourceMappingURL=index.d.ts.map