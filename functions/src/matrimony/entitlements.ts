import { getApp } from 'firebase-admin/app';
import { getDatabaseWithUrl } from 'firebase-admin/database';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, DEFAULT_CHURCH_ID } from './constants.js';
import {
  getAdminProfileRef,
  getEntitlementRef,
  getProfileRef,
  getSubscriptionRef,
  getUnlockedContactsCol,
  getUsageRef,
} from './store.js';

export type MatrimonyTier = 'free' | 'silver' | 'gold' | 'platinum';
export type PaidMatrimonyTier = 'silver' | 'gold' | 'platinum';

export interface PlanLimitsConfig {
  monthlyInterestLimit: number; // -1 = unlimited
  contactNumberLimit: number;   // -1 = unlimited, 0 = locked
  shortlistLimit: number;       // 10, 25, 50, 70
  messageAccess: boolean;
  callAccess: boolean;
  whatsappAccess: boolean;
  advancedFilters: boolean;
  visibilityPriority: number;   // 0=Free, 1=Silver, 2=Gold, 3=Platinum
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
  interestsRemaining: number; // -1 = unlimited
  contactNumberLimit: number;
  contactNumbersViewedCount: number;
  contactNumbersRemaining: number; // -1 = unlimited
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

export const FREE_LIMITS: PlanLimitsConfig = {
  monthlyInterestLimit: 20,
  contactNumberLimit: 0,
  shortlistLimit: 10,
  messageAccess: false,
  callAccess: false,
  whatsappAccess: false,
  advancedFilters: false,
  visibilityPriority: 0,
  highlightStyle: 'none',
  prioritySupport: false,
};

export const DEFAULT_PAID_PLANS: Record<PaidMatrimonyTier, MatrimonyPlanDoc> = {
  silver: {
    planId: 'silver',
    tier: 'silver',
    planName: 'Silver',
    tagline: 'Essential verified connections',
    durationMonths: 3,
    priceInr: 1,
    originalPriceInr: 1,
    discountPercentage: 0,
    badgeText: 'ESSENTIAL',
    benefits: [
      'Valid for 3 months',
      'View 20 Phone Nos & DOB',
      'Send unlimited messages',
      'Shortlist up to 25 profiles',
    ],
    limits: {
      monthlyInterestLimit: -1,
      contactNumberLimit: 20,
      shortlistLimit: 25,
      messageAccess: true,
      callAccess: true,
      whatsappAccess: true,
      advancedFilters: false,
      visibilityPriority: 1,
      highlightStyle: 'none',
      prioritySupport: false,
    },
    isActive: true,
    sortOrder: 1,
  },
  gold: {
    planId: 'gold',
    tier: 'gold',
    planName: 'Gold',
    tagline: 'Accelerated matchmaking & visibility',
    durationMonths: 6,
    priceInr: 2,
    originalPriceInr: 2,
    discountPercentage: 0,
    badgeText: 'MOST POPULAR',
    benefits: [
      'Valid for 6 months',
      'View 50 Phone Nos & DOB',
      'Send unlimited messages',
      'Unlimited Shortlists & Advanced Filters',
    ],
    limits: {
      monthlyInterestLimit: -1,
      contactNumberLimit: 50,
      shortlistLimit: -1,
      messageAccess: true,
      callAccess: true,
      whatsappAccess: true,
      advancedFilters: true,
      visibilityPriority: 2,
      highlightStyle: 'gold',
      prioritySupport: false,
    },
    isActive: true,
    sortOrder: 2,
  },
  platinum: {
    planId: 'platinum',
    tier: 'platinum',
    planName: 'Platinum',
    tagline: 'Royal unlimited access & top spotlight',
    durationMonths: 12,
    priceInr: 3,
    originalPriceInr: 3,
    discountPercentage: 0,
    badgeText: 'ROYAL ELITE',
    benefits: [
      'Valid for 12 months',
      'View unlimited Phone Nos & DOB',
      'Send unlimited messages',
      'Unlimited Shortlists & Priority Spotlight',
    ],
    limits: {
      monthlyInterestLimit: -1,
      contactNumberLimit: -1,
      shortlistLimit: -1,
      messageAccess: true,
      callAccess: true,
      whatsappAccess: true,
      advancedFilters: true,
      visibilityPriority: 3,
      highlightStyle: 'platinum',
      prioritySupport: true,
    },
    isActive: true,
    sortOrder: 3,
  },
};

export function getDefaultLimitsForTier(tier: MatrimonyTier): PlanLimitsConfig {
  if (tier === 'free') return FREE_LIMITS;
  return DEFAULT_PAID_PLANS[tier].limits;
}

export function getCurrentMonthKey(date = new Date()): string {
  // Use IST (Asia/Kolkata) calendar month consistently for Indian church members
  const istStr = date.toLocaleString('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  });
  // en-CA yields YYYY-MM-DD or YYYY-MM
  const match = istStr.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function ensureDefaultPlansSeeded(db: Firestore): Promise<MatrimonyPlanDoc[]> {
  const snap = await db.collection(COLLECTIONS.PLANS).get();
  if (!snap.empty) {
    return snap.docs
      .map((d) => d.data() as MatrimonyPlanDoc)
      .filter((p) => p && p.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  const list = Object.values(DEFAULT_PAID_PLANS);
  for (const plan of list) {
    batch.set(
      db.collection(COLLECTIONS.PLANS).doc(plan.planId),
      { ...plan, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }
  await batch.commit();
  return list;
}

export async function getPlanById(
  db: Firestore,
  rawPlanId: string
): Promise<MatrimonyPlanDoc | null> {
  const clean = String(rawPlanId || '').trim().toLowerCase();
  if (!clean) return null;

  const docSnap = await db.collection(COLLECTIONS.PLANS).doc(clean).get();
  if (docSnap.exists) {
    const data = docSnap.data() as MatrimonyPlanDoc;
    if (data.isActive !== false) return data;
    return null;
  }

  if (clean === 'silver' || clean === 'gold' || clean === 'platinum') {
    await ensureDefaultPlansSeeded(db).catch(() => undefined);
    return DEFAULT_PAID_PLANS[clean];
  }
  return null;
}

export async function syncEntitlementsToRtdb(
  uid: string,
  payload: {
    tier: MatrimonyTier;
    canMessage: boolean;
    validUntilMs: number | null;
  }
): Promise<void> {
  try {
    const rtdb = getDatabaseWithUrl(
      'https://rhema-global-ministries-default-rtdb.firebaseio.com',
      getApp()
    );
    await rtdb.ref(`matrimony_entitlements/${uid}`).set({
      tier: payload.tier,
      canMessage: payload.canMessage,
      validUntilMs: payload.validUntilMs ?? null,
      updatedAtMs: Date.now(),
    });
  } catch (err) {
    console.warn('syncEntitlementsToRtdb warning:', err);
  }
}

export function resolveActiveTierFromProfile(profileData?: Record<string, any> | null): MatrimonyTier {
  const m = profileData?.membership;
  if (!m || typeof m !== 'object') return 'free';
  const rawTier = String(m.tier || 'free').toLowerCase();
  if (rawTier !== 'silver' && rawTier !== 'gold' && rawTier !== 'platinum') return 'free';
  if (m.status !== 'active') return 'free';
  const validUntilMs = typeof m.validUntilMs === 'number' ? m.validUntilMs : 0;
  if (validUntilMs > 0 && validUntilMs <= Date.now()) return 'free';
  return rawTier;
}

export async function resolveMemberEntitlements(
  db: Firestore,
  uid: string,
  profileDataOpt?: Record<string, any> | null
): Promise<ResolvedMemberEntitlements> {
  const nowMs = Date.now();
  const monthKey = getCurrentMonthKey(new Date(nowMs));

  const [subSnap, entSnap, usageSnap, unlockedSnap, profSnap] = await Promise.all([
    getSubscriptionRef(db, uid).get(),
    getEntitlementRef(db, uid).get(),
    getUsageRef(db, uid).get(),
    getUnlockedContactsCol(db, uid).get(),
    profileDataOpt ? Promise.resolve(null) : getProfileRef(db, uid).get(),
  ]);

  const profileData = profileDataOpt ?? (profSnap?.exists ? profSnap.data() || {} : {});
  const subData = subSnap.exists ? subSnap.data() || {} : null;
  const entData = entSnap.exists ? entSnap.data() || {} : null;
  const usageData = usageSnap.exists ? usageSnap.data() || {} : {};

  let activeTier: MatrimonyTier = 'free';
  let planId: string | null = null;
  let planName = 'Free';
  let subscriptionStatus: 'free' | 'active' | 'expired' = 'free';
  let subscriptionId: string | null = null;
  let startDateMs: number | null = null;
  let expiryDateMs: number | null = null;
  let limits: PlanLimitsConfig = FREE_LIMITS;

  if (subData) {
    const rawTier = String(subData.tier || 'free').toLowerCase();
    const expMs = typeof subData.expiryDateMs === 'number' ? subData.expiryDateMs : 0;
    const isPaidTier = rawTier === 'silver' || rawTier === 'gold' || rawTier === 'platinum';

    if (isPaidTier && subData.status === 'active' && (expMs === 0 || expMs > nowMs)) {
      activeTier = rawTier;
      planId = String(subData.planId || rawTier);
      planName = String(subData.planName || DEFAULT_PAID_PLANS[rawTier].planName);
      subscriptionStatus = 'active';
      subscriptionId = subData.paymentId ? String(subData.paymentId) : null;
      startDateMs = typeof subData.startDateMs === 'number' ? subData.startDateMs : null;
      expiryDateMs = expMs || null;
      limits = {
        ...DEFAULT_PAID_PLANS[rawTier].limits,
        ...(subData.limitsSnapshot && typeof subData.limitsSnapshot === 'object'
          ? subData.limitsSnapshot
          : {}),
      };
    } else if (isPaidTier && subData.status === 'active' && expMs > 0 && expMs <= nowMs) {
      // Lazy auto-expire on read so expired users cleanly revert to Free rules
      subscriptionStatus = 'expired';
      expiryDateMs = expMs;
      await downgradeExpiredSubscription(db, uid, subData).catch(() => undefined);
    } else if (subData.status === 'expired') {
      subscriptionStatus = 'expired';
      expiryDateMs = expMs || null;
    }
  } else {
    // Legacy compatibility: profile.membership written before matrimony_subscriptions existed
    const profTier = resolveActiveTierFromProfile(profileData);
    if (profTier !== 'free') {
      activeTier = profTier;
      planId = profTier;
      planName = String(profileData?.membership?.planName || DEFAULT_PAID_PLANS[profTier].planName);
      subscriptionStatus = 'active';
      subscriptionId = profileData?.membership?.paymentId
        ? String(profileData.membership.paymentId)
        : null;
      startDateMs =
        typeof profileData?.membership?.activatedAtMs === 'number'
          ? profileData.membership.activatedAtMs
          : null;
      expiryDateMs =
        typeof profileData?.membership?.validUntilMs === 'number'
          ? profileData.membership.validUntilMs
          : null;
      limits = DEFAULT_PAID_PLANS[profTier].limits;
    } else if (profileData?.membership?.tier && profileData.membership.tier !== 'free') {
      // Expired legacy profile membership
      subscriptionStatus = 'expired';
      await downgradeExpiredSubscription(db, uid, null).catch(() => undefined);
    }
  }

  // Allow explicit overrides from matrimony_entitlements/{uid} if active and matching tier
  if (entData && activeTier !== 'free' && entData.tier === activeTier) {
    limits = {
      monthlyInterestLimit:
        typeof entData.monthlyInterestLimit === 'number'
          ? entData.monthlyInterestLimit
          : limits.monthlyInterestLimit,
      contactNumberLimit:
        typeof entData.contactNumberLimit === 'number'
          ? entData.contactNumberLimit
          : limits.contactNumberLimit,
      shortlistLimit:
        typeof entData.shortlistLimit === 'number' ? entData.shortlistLimit : limits.shortlistLimit,
      messageAccess:
        typeof entData.messageAccess === 'boolean' ? entData.messageAccess : limits.messageAccess,
      callAccess: typeof entData.callAccess === 'boolean' ? entData.callAccess : limits.callAccess,
      whatsappAccess:
        typeof entData.whatsappAccess === 'boolean' ? entData.whatsappAccess : limits.whatsappAccess,
      advancedFilters:
        typeof entData.advancedFilters === 'boolean'
          ? entData.advancedFilters
          : limits.advancedFilters,
      visibilityPriority:
        typeof entData.visibilityPriority === 'number'
          ? entData.visibilityPriority
          : limits.visibilityPriority,
      highlightStyle:
        entData.highlightStyle === 'gold' || entData.highlightStyle === 'platinum'
          ? entData.highlightStyle
          : limits.highlightStyle,
      prioritySupport:
        typeof entData.prioritySupport === 'boolean'
          ? entData.prioritySupport
          : limits.prioritySupport,
    };
  }

  const interestsSentThisMonth =
    usageData.currentMonthKey === monthKey ? Number(usageData.interestsSentThisMonth || 0) : 0;

  const interestsRemaining =
    limits.monthlyInterestLimit < 0
      ? -1
      : Math.max(0, limits.monthlyInterestLimit - interestsSentThisMonth);

  // Filter unlocked contacts belonging to the current subscription cycle (or all if legacy)
  const unlockedContactUids: string[] = [];
  unlockedSnap.docs.forEach((d) => {
    const data = d.data() || {};
    if (!subscriptionId || !data.subscriptionId || data.subscriptionId === subscriptionId) {
      unlockedContactUids.push(d.id);
    }
  });

  const contactNumbersViewedCount =
    activeTier === 'free'
      ? 0
      : subscriptionId && usageData.subscriptionId === subscriptionId
      ? Math.max(Number(usageData.contactNumbersViewedCount || 0), unlockedContactUids.length)
      : unlockedContactUids.length;

  const contactNumbersRemaining =
    limits.contactNumberLimit < 0
      ? -1
      : Math.max(0, limits.contactNumberLimit - contactNumbersViewedCount);

  return {
    tier: activeTier,
    planId,
    planName,
    subscriptionStatus,
    subscriptionId,
    startDateMs,
    expiryDateMs,
    monthlyInterestLimit: limits.monthlyInterestLimit,
    interestsSentThisMonth,
    interestsRemaining,
    contactNumberLimit: limits.contactNumberLimit,
    contactNumbersViewedCount,
    contactNumbersRemaining,
    shortlistLimit: limits.shortlistLimit,
    messageAccess: limits.messageAccess,
    callAccess: limits.callAccess,
    whatsappAccess: limits.whatsappAccess,
    advancedFilters: limits.advancedFilters,
    visibilityPriority: limits.visibilityPriority,
    highlightStyle: limits.highlightStyle,
    prioritySupport: limits.prioritySupport,
    unlockedContactUids,
    monthKey,
  };
}

export async function downgradeExpiredSubscription(
  db: Firestore,
  uid: string,
  subData: Record<string, any> | null
): Promise<void> {
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  const freeMembershipPayload = {
    tier: 'free',
    planName: 'Free',
    status: 'expired',
    expiredAtMs: Date.now(),
    updatedAt: now,
  };

  if (subData) {
    batch.set(
      getSubscriptionRef(db, uid),
      { status: 'expired', expiredAt: now, updatedAt: now },
      { merge: true }
    );
  }

  batch.set(
    getEntitlementRef(db, uid),
    {
      uid,
      tier: 'free',
      ...FREE_LIMITS,
      validUntilMs: null,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    getProfileRef(db, uid),
    { membership: freeMembershipPayload, updatedAt: now },
    { merge: true }
  );

  batch.set(
    getAdminProfileRef(db, uid),
    { membership: freeMembershipPayload, syncedAt: now },
    { merge: true }
  );

  batch.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
    recipientUid: uid,
    type: 'SUBSCRIPTION_EXPIRED',
    title: 'Membership Expired',
    body: 'Your Rhema Matrimony membership has expired and reverted to Free. Renew anytime to continue messaging and viewing contact numbers.',
    read: false,
    createdAt: now,
  });

  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_SUBSCRIPTION_EXPIRED',
    actorUid: 'system',
    targetUid: uid,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });

  await batch.commit();
  await syncEntitlementsToRtdb(uid, {
    tier: 'free',
    canMessage: false,
    validUntilMs: null,
  });
}
