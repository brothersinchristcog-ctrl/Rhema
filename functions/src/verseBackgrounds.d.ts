/**
 * Core helper that ensures verses for the specified window have Unsplash backgrounds.
 */
export declare function syncVerseBackgroundsInternal(daysAhead?: number): Promise<{
    totalChecked: number;
    updatedCount: number;
}>;
/**
 * Scheduled cron job to run every day at 11:00 PM (23:00) server time.
 * It fetches the next 3 days of verses and ensures they have a backgroundUrl.
 */
export declare const generateVerseBackgroundsV2: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Manual HTTP trigger for admins or testing to populate missing backgrounds.
 */
export declare const triggerGenerateVerseBackgrounds: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=verseBackgrounds.d.ts.map