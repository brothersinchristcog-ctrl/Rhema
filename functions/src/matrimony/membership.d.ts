export type MatrimonyMembershipPlan = 'silver' | 'gold' | 'platinum';
/**
 * 0. getMatrimonyPlans
 * Returns active Silver / Gold / Platinum plans from matrimony_plans (auto-seeding defaults if empty).
 */
export declare const getMatrimonyPlans: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    plans: import("./entitlements.js").MatrimonyPlanDoc[];
}>, unknown>;
/**
 * 0b. getMemberEntitlements
 * Returns active membership tier, usage counters, and remaining monthly interest / contact / shortlist quotas.
 */
export declare const getMemberEntitlements: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    entitlements: import("./entitlements.js").ResolvedMemberEntitlements;
}>, unknown>;
/**
 * 1. createMatrimonyUpgradeOrder
 * Creates a server-priced Razorpay order using the authoritative plan price from matrimony_plans.
 */
export declare const createMatrimonyUpgradeOrder: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    orderId: string;
    amount: string | number;
    amountInr: number;
    currency: string;
    keyId: string;
    plan: import("./entitlements.js").PaidMatrimonyTier;
    planId: string;
    planName: string;
    durationMonths: number;
}>, unknown>;
/**
 * 2. verifyMatrimonyUpgradePayment
 * Verifies Razorpay HMAC signature, prevents duplicate replay, and activates subscription + entitlements + usage cycle.
 */
export declare const verifyMatrimonyUpgradePayment: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    alreadyProcessed: boolean;
    membership: any;
    entitlements: import("./entitlements.js").ResolvedMemberEntitlements;
} | {
    success: boolean;
    membership: {
        tier: import("./entitlements.js").PaidMatrimonyTier;
        planId: string;
        planName: string;
        status: string;
        amountInr: number;
        durationMonths: number;
        validUntilMs: number;
        paymentId: string;
    };
    entitlements: import("./entitlements.js").ResolvedMemberEntitlements;
    alreadyProcessed?: never;
}>, unknown>;
/**
 * 3. expireMatrimonySubscriptions (Daily Scheduled Job)
 * Reverts expired paid subscriptions back to Free while preserving profiles, matches, interests, and chat history.
 */
export declare const expireMatrimonySubscriptions: import("firebase-functions/v2/scheduler").ScheduleFunction;
//# sourceMappingURL=membership.d.ts.map