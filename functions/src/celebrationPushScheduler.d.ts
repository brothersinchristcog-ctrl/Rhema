import { type Firestore } from 'firebase-admin/firestore';
import { type Messaging } from 'firebase-admin/messaging';
export type CelebrationCategory = 'birthday' | 'baptism' | 'anniversary';
interface ParsedMonthDay {
    year: number;
    month: number;
    day: number;
}
interface ChurchSweepSummary {
    churchId: string;
    rootCollection: string;
    matchedCount: number;
    sentMemberCount: number;
    skippedAlreadySentCount: number;
    noTokenMemberCount: number;
    totalTokensTargeted: number;
    totalSuccessTokens: number;
    totalFailedTokens: number;
    prunedInvalidTokens: number;
    targets: Array<{
        memberName: string;
        canonicalKey: string;
        tokenCount: number;
        status: string;
    }>;
}
export interface CelebrationRunReport {
    category: CelebrationCategory;
    istDateStr: string;
    dryRun: boolean;
    churchesProcessed: number;
    totalMatched: number;
    totalSentMembers: number;
    totalSkippedAlreadySent: number;
    totalNoTokenMembers: number;
    totalTokensTargeted: number;
    totalSuccessTokens: number;
    totalFailedTokens: number;
    churches: ChurchSweepSummary[];
}
export declare function parseCelebrationDateParts(rawVal: unknown): ParsedMonthDay | null;
export declare function runCelebrationPushDispatch(category: CelebrationCategory, options?: {
    churchIdFilter?: string;
    memberIdFilter?: string;
    dateOverride?: string;
    dryRun?: boolean;
    force?: boolean;
    db?: Firestore;
    messaging?: Messaging;
}): Promise<CelebrationRunReport>;
/**
 * 🎂 Daily Birthday Wishes — 6:30 AM IST (`Asia/Kolkata`)
 */
export declare const sendDailyBirthdayPushScheduled: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 🕊️ Daily Baptism Anniversary Wishes — 7:00 AM IST (`Asia/Kolkata`)
 */
export declare const sendDailyBaptismAnniversaryPushScheduled: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 💐 Daily Wedding Anniversary Wishes — 7:30 AM IST (`Asia/Kolkata`)
 */
export declare const sendDailyWeddingAnniversaryPushScheduled: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * 🧪 Manual/Verification HTTP endpoint for celebration push dispatches.
 * Defaults to `dryRun=true` so accidental hits never notify live members.
 */
export declare const triggerCelebrationPushManual: import("firebase-functions/v2/https").HttpsFunction;
export {};
//# sourceMappingURL=celebrationPushScheduler.d.ts.map