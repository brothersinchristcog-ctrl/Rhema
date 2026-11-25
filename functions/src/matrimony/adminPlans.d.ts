import { FieldValue } from 'firebase-admin/firestore';
import { type MatrimonyPlanDoc, type PaidMatrimonyTier } from './entitlements.js';
export declare const adminGetMatrimonyPlansAndSubs: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    plans: MatrimonyPlanDoc[];
    subscriptions: {
        uid: string;
        memberName: string | null;
        memberProfileCode: string | null;
        memberCity: string | null;
        memberPhone: string | null;
        subscriptionId: string;
        planId: string;
        planName: string;
        tier: string;
        status: string;
        durationMonths: number;
        amountInr: number;
        source: string;
        grantedBy: string | null;
        note: string | null;
        startDateMs: number | null;
        expiryDateMs: number | null;
    }[];
    paymentHistory: {
        id: string;
        uid: string;
        memberName: string | null;
        memberProfileCode: string | null;
        memberCity: string | null;
        memberPhone: string | null;
        planId: string;
        planName: string | null;
        tier: string;
        durationMonths: number | null;
        amountInr: number;
        status: string;
        source: string;
        paymentId: string | null;
        orderId: string | null;
        note: string | null;
        startDateMs: any;
        expiryDateMs: number | null;
        createdAtMs: any;
    }[];
    summary: {
        activeCount: number;
        expiredCount: number;
        silverActive: number;
        goldActive: number;
        platinumActive: number;
        totalRevenueInr: number;
    };
}>, unknown>;
export declare const adminUpsertMatrimonyPlan: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    plan: MatrimonyPlanDoc;
}>, unknown>;
export declare const adminGrantComplimentarySubscription: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    status: string;
    tier: string;
    subscriptionId?: never;
    validUntilMs?: never;
    membership?: never;
} | {
    success: boolean;
    subscriptionId: string;
    tier: PaidMatrimonyTier;
    validUntilMs: number;
    membership: {
        tier: PaidMatrimonyTier;
        planId: string;
        planName: string;
        durationMonths: number;
        pricePaidInr: number;
        status: "active";
        subscriptionId: string;
        activatedAtMs: number;
        validUntilMs: number;
        grantedBy: string;
        note: string;
        updatedAt: FieldValue;
    };
    status?: never;
}>, unknown>;
//# sourceMappingURL=adminPlans.d.ts.map