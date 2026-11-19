export type MatrimonyMembershipPlan = 'silver' | 'gold' | 'platinum';
/**
 * 1. createMatrimonyUpgradeOrder
 * Creates a server-priced Razorpay order for Silver (₹1), Gold (₹2), or Platinum (₹3).
 */
export declare const createMatrimonyUpgradeOrder: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    orderId: string;
    amount: string | number;
    amountInr: number;
    currency: string;
    keyId: string;
    plan: MatrimonyMembershipPlan;
    planName: string;
}>, unknown>;
/**
 * 2. verifyMatrimonyUpgradePayment
 * Verifies Razorpay HMAC signature and activates Silver / Gold / Platinum on the member's profile.
 */
export declare const verifyMatrimonyUpgradePayment: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    membership: {
        tier: MatrimonyMembershipPlan;
        planName: string;
        status: string;
        amountInr: number;
        durationMonths: number;
        validUntilMs: number;
        paymentId: string;
    };
}>, unknown>;
//# sourceMappingURL=membership.d.ts.map