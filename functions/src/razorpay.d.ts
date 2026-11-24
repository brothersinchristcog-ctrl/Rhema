/**
 * Member Giving: Create a Razorpay Order in asia-south1.
 * Reads Razorpay Key ID & Key Secret from secure backend env vars only.
 */
export declare const createRazorpayOrder: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    keyId: string;
    key_id: string;
    orderId: string;
    amount: string | number;
    currency: string;
    order: {
        id: string;
        amount: string | number;
        currency: string;
        receipt: string | undefined;
        status: "created" | "attempted" | "paid";
    };
}>, unknown>;
/**
 * Member Giving: Verify Razorpay Checkout HMAC-SHA256 signature on backend
 * and mark church_donations + church-scoped donations completed atomically.
 */
export declare const verifyRazorpayPayment: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    verified: boolean;
    alreadyVerified: boolean;
    paymentId: string;
    orderId: string;
    donationId: string;
} | {
    success: boolean;
    verified: boolean;
    paymentId: string;
    orderId: string;
    donationId: string;
    alreadyVerified?: never;
}>, unknown>;
/**
 * Legacy donation callable aliases in asia-south1 kept compatible with backend env credentials.
 */
export declare const createRazorpayDonationOrderV6: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    orderId: string;
    keyId: string;
    amount: string | number;
    currency: string;
}>, unknown>;
export declare const verifyRazorpayDonationV6: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    verified: boolean;
    paymentId: string;
}>, unknown>;
/**
 * Platform / Church Subscription: Create Razorpay Order (default region for SubscriptionTab).
 */
export declare const createRazorpayOrderV4: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    orderId: string;
    keyId: string;
    amount: string | number;
    currency: string;
}>, unknown>;
/**
 * Platform / Church Subscription Verification (default region for SubscriptionTab).
 */
export declare const verifyRazorpaySubscriptionV3: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    verified: boolean;
    validUntil: string;
}>, unknown>;
/**
 * Razorpay Webhook endpoint for asynchronous capture / failure reconciliation.
 */
export declare const razorpayWebhookV1: import("firebase-functions/v2/https").HttpsFunction;
/**
 * Member Recurring Giving: Create Razorpay Plan (cached) + Razorpay Subscription with explicit member consent.
 */
export declare const createRazorpayRecurringDonation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    subscriptionId: string;
    planId: string;
    keyId: string;
    amount: number;
    currency: string;
    frequency: "monthly" | "weekly" | "yearly";
}>, unknown>;
/**
 * Member Recurring Giving: Verify Razorpay Subscription Checkout authorization signature
 * (`razorpay_payment_id | razorpay_subscription_id`) and record Cycle #1 receipt.
 */
export declare const verifyRazorpaySubscriptionDonation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    verified: boolean;
    subscriptionId: string;
    paymentId: string;
    donationId: string;
    nextChargeDate: string;
}>, unknown>;
/**
 * Member / Admin Recurring Control: Pause, Resume, or Cancel an authorized Razorpay Subscription mandate.
 */
export declare const manageRazorpayRecurringDonation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    status: string | undefined;
}>, unknown>;
//# sourceMappingURL=razorpay.d.ts.map