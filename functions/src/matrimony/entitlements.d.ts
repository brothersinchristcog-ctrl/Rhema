import { Firestore } from 'firebase-admin/firestore';
export type MatrimonyTier = 'free' | 'silver' | 'gold' | 'platinum';
export type PaidMatrimonyTier = 'silver' | 'gold' | 'platinum';
export interface PlanLimitsConfig {
    monthlyInterestLimit: number;
    contactNumberLimit: number;
    shortlistLimit: number;
    messageAccess: boolean;
    callAccess: boolean;
    whatsappAccess: boolean;
    advancedFilters: boolean;
    visibilityPriority: number;
    highlightStyle: 'none' | 'gold' | 'platinum';
    prioritySupport: boolean;
}
export interface MatrimonyPlanDoc {
    planId: string;
    tier: PaidMatrimonyTier;
    planName: string;
    tagline: string;
    durationMonths: number;
    priceInr: number;
    originalPriceInr: number;
    discountPercentage: number;
    badgeText: string;
    benefits: string[];
    limits: PlanLimitsConfig;
    isActive: boolean;
    sortOrder: number;
}
export interface ResolvedMemberEntitlements {
    tier: MatrimonyTier;
    planId: string | null;
    planName: string;
    subscriptionStatus: 'free' | 'active' | 'expired';
    subscriptionId: string | null;
    startDateMs: number | null;
    expiryDateMs: number | null;
    monthlyInterestLimit: number;
    interestsSentThisMonth: number;
    interestsRemaining: number;
    contactNumberLimit: number;
    contactNumbersViewedCount: number;
    contactNumbersRemaining: number;
    shortlistLimit: number;
    messageAccess: boolean;
    callAccess: boolean;
    whatsappAccess: boolean;
    advancedFilters: boolean;
    visibilityPriority: number;
    highlightStyle: 'none' | 'gold' | 'platinum';
    prioritySupport: boolean;
    unlockedContactUids: string[];
    monthKey: string;
}
export declare const FREE_LIMITS: PlanLimitsConfig;
export declare const DEFAULT_PAID_PLANS: Record<PaidMatrimonyTier, MatrimonyPlanDoc>;
export declare function getDefaultLimitsForTier(tier: MatrimonyTier): PlanLimitsConfig;
export declare function getCurrentMonthKey(date?: Date): string;
export declare function ensureDefaultPlansSeeded(db: Firestore): Promise<MatrimonyPlanDoc[]>;
export declare function getPlanById(db: Firestore, rawPlanId: string): Promise<MatrimonyPlanDoc | null>;
export declare function syncEntitlementsToRtdb(uid: string, payload: {
    tier: MatrimonyTier;
    canMessage: boolean;
    validUntilMs: number | null;
}): Promise<void>;
export declare function resolveActiveTierFromProfile(profileData?: Record<string, any> | null): MatrimonyTier;
export declare function resolveMemberEntitlements(db: Firestore, uid: string, profileDataOpt?: Record<string, any> | null): Promise<ResolvedMemberEntitlements>;
export declare function downgradeExpiredSubscription(db: Firestore, uid: string, subData: Record<string, any> | null): Promise<void>;
//# sourceMappingURL=entitlements.d.ts.map