import { type Firestore } from 'firebase-admin/firestore';
import { type Messaging } from 'firebase-admin/messaging';
export type GroupCelebrationType = 'Birthday' | 'Wedding Anniversary' | 'Baptism Anniversary';
interface ParsedMonthDay {
    year: number;
    month: number;
    day: number;
}
export interface LiveCelebrationGroupSweepReport {
    istDateStr: string;
    dryRun: boolean;
    churchesProcessed: number;
    totalCelebrants: number;
    totalGroupTokensTargeted: number;
    totalSuccessTokens: number;
    totalFailedTokens: number;
    churches: Array<{
        churchId: string;
        rootCollection: string;
        celebrantCount: number;
        status: string;
        tokensTargeted: number;
        successCount: number;
        failureCount: number;
        prunedInvalidTokens: number;
        celebrants: Array<{
            name: string;
            type: GroupCelebrationType;
        }>;
    }>;
}
export declare function parseGroupCelebrationDate(rawVal: unknown): ParsedMonthDay | null;
/**
 * Group Live Celebrations Chat Push Sweep.
 *
 * Intentionally separated from personal celebration wishes (`celebrationPushScheduler.ts`):
 * - Personal wishes notify ONLY the celebrant and open private `Updates`.
 * - Group Live Celebrations notifications notify ALL eligible members in the church
 *   about today's Birthday, Wedding Anniversary, and Baptism Anniversary celebrants
 *   and open `LiveCelebrationsChat` directly when tapped.
 */
export declare function runDailyCelebrationsSweep(options?: {
    churchIdFilter?: string;
    dateOverride?: string;
    dryRun?: boolean;
    force?: boolean;
    db?: Firestore;
    messaging?: Messaging;
}): Promise<LiveCelebrationGroupSweepReport>;
/**
 * Scheduled daily group push informing all church members of today's Birthdays,
 * Wedding Anniversaries, and Baptism Anniversaries and opening Live Celebrations chat.
 * Runs at 8:00 AM IST (separate from 6:30 / 7:00 / 7:30 AM personal wishes).
 */
export declare const weCelebrationDailySweepV3: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Manual / Verification HTTP endpoint for the Group Live Celebrations push sweep.
 * Defaults to `dryRun=true`.
 */
export declare const triggerMorningCelebrations: import("firebase-functions/v2/https").HttpsFunction;
export declare const weCelebrationBatchedWishes: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * HTTP endpoint so Cloud Scheduler can force-run the batched wishes sweep.
 */
export declare const executeBatchedWishes: import("firebase-functions/v2/https").HttpsFunction;
export declare function runBatchedWishesSweep(options?: {
    db?: Firestore;
    messaging?: Messaging;
}): Promise<void>;
export {};
//# sourceMappingURL=celebrations.d.ts.map