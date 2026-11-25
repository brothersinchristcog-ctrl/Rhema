export interface TargetedMemberPushParams {
    churchId: string;
    memberUid?: string;
    memberPhone?: string;
    memberName?: string;
    type: 'pledge_reminder' | 'recurring_donation_receipt' | 'recurring_donation_failed' | 'recurring_pre_debit_reminder';
    title: string;
    body: string;
    pledgeId?: string;
    subscriptionId?: string;
    donationId?: string;
    eventId?: string;
    screen?: string;
}
/**
 * Resolve FCM tokens strictly for one specific church member (never topic broadcast)
 * and write a targeted in-app notification document.
 */
export declare function sendTargetedMemberDonationPush(params: TargetedMemberPushParams): Promise<{
    sent: number;
}>;
export declare function runPledgeAndMandateReminderSweep(targetChurchId?: string): Promise<{
    pledgesChecked: number;
    pledgeRemindersSent: number;
    mandateRemindersSent: number;
}>;
/**
 * Daily Automated Pledge & Recurring Mandate Reminder Job (09:00 AM IST in asia-south1).
 */
export declare const sendPledgeRemindersScheduled: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Admin callable to test / manually trigger pledge payment reminders on demand.
 */
export declare const triggerPledgeRemindersManual: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    pledgesChecked: number;
    pledgeRemindersSent: number;
    mandateRemindersSent: number;
    success: boolean;
}>, unknown>;
//# sourceMappingURL=pledgeReminders.d.ts.map