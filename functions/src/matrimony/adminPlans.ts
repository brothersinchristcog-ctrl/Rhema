import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireMatrimonyAdmin } from './admin.js';
import { COLLECTIONS, DEFAULT_CHURCH_ID } from './constants.js';
import {
  DEFAULT_PAID_PLANS,
  downgradeExpiredSubscription,
  ensureDefaultPlansSeeded,
  syncEntitlementsToRtdb,
  type MatrimonyPlanDoc,
  type PaidMatrimonyTier,
  type PlanLimitsConfig,
} from './entitlements.js';
import {
  getAdminProfileRef,
  getEntitlementRef,
  getProfileRef,
  getSubscriptionRef,
} from './store.js';
import {
  assertNonEmptyString,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
} from './validation.js';

function isPaidTier(val: string): val is PaidMatrimonyTier {
  return val === 'silver' || val === 'gold' || val === 'platinum';
}

function parseLimitInt(val: unknown, fallback: number, allowUnlimited: boolean): number {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  if (allowUnlimited && n < 0) return -1;
  return Math.max(0, Math.min(50000, n));
}

export const adminGetMatrimonyPlansAndSubs = onCall({ invoker: 'public' }, async (request) => {
  await requireMatrimonyAdmin(request);
  const db = getFirestore();

  await ensureDefaultPlansSeeded(db);

  const [plansSnap, subsSnap, paymentsSnap] = await Promise.all([
    db.collection(COLLECTIONS.PLANS).get(),
    db.collection(COLLECTIONS.SUBSCRIPTIONS).limit(250).get(),
    db.collection(COLLECTIONS.PAYMENT_HISTORY).limit(100).get(),
  ]);

  const plans: MatrimonyPlanDoc[] = plansSnap.docs
    .map((d) => d.data() as MatrimonyPlanDoc)
    .filter((p) => Boolean(p && p.planId))
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const nowMs = Date.now();
  let activeCount = 0;
  let expiredCount = 0;
  let silverActive = 0;
  let goldActive = 0;
  let platinumActive = 0;

  const subscriptions = subsSnap.docs
    .map((d) => {
      const data = d.data() || {};
      const endMs = typeof data.expiryDateMs === 'number' ? data.expiryDateMs : null;
      const effectiveStatus =
        data.status === 'active' && endMs && endMs <= nowMs ? 'expired' : String(data.status || 'expired');
      const tier = String(data.tier || 'free').toLowerCase();
      if (effectiveStatus === 'active') {
        activeCount++;
        if (tier === 'silver') silverActive++;
        else if (tier === 'gold') goldActive++;
        else if (tier === 'platinum') platinumActive++;
      } else {
        expiredCount++;
      }
      return {
        uid: String(data.uid || d.id),
        subscriptionId: String(data.subscriptionId || d.id),
        planId: String(data.planId || tier),
        planName: String(data.planName || tier),
        tier,
        status: effectiveStatus,
        durationMonths: Number(data.durationMonths || 0),
        amountInr: Number(data.amountInr || 0),
        source: String(data.source || 'razorpay'),
        grantedBy: data.grantedBy ? String(data.grantedBy) : null,
        note: data.note ? String(data.note) : null,
        startDateMs: typeof data.startDateMs === 'number' ? data.startDateMs : null,
        expiryDateMs: endMs,
      };
    })
    .sort((a, b) => (b.startDateMs || 0) - (a.startDateMs || 0));

  let totalRevenueInr = 0;
  const paymentHistory = paymentsSnap.docs
    .map((d) => {
      const data = d.data() || {};
      const amt = Number(data.amountInr || 0);
      if (data.status === 'captured' && amt > 0) {
        totalRevenueInr += amt;
      }
      return {
        id: d.id,
        uid: String(data.uid || ''),
        planId: String(data.planId || ''),
        tier: String(data.tier || ''),
        amountInr: amt,
        status: String(data.status || ''),
        source: String(data.source || 'razorpay'),
        paymentId: data.paymentId ? String(data.paymentId) : null,
        orderId: data.orderId ? String(data.orderId) : null,
        createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : 0,
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  return {
    success: true,
    plans,
    subscriptions,
    paymentHistory,
    summary: {
      activeCount,
      expiredCount,
      silverActive,
      goldActive,
      platinumActive,
      totalRevenueInr,
    },
  };
});

export const adminUpsertMatrimonyPlan = onCall({ invoker: 'public' }, async (request) => {
  const adminUid = await requireMatrimonyAdmin(request);
  const rawPlanId = assertNonEmptyString(request.data?.planId, 'planId', 40).toLowerCase();
  if (!isPaidTier(rawPlanId)) {
    throw new HttpsError('invalid-argument', 'planId must be silver, gold, or platinum.');
  }

  const db = getFirestore();
  const planRef = db.collection(COLLECTIONS.PLANS).doc(rawPlanId);
  const existingSnap = await planRef.get();
  const base = existingSnap.exists
    ? (existingSnap.data() as MatrimonyPlanDoc)
    : DEFAULT_PAID_PLANS[rawPlanId];

  const priceInr =
    optionalNumber(request.data?.priceInr, 1, 500000, 'priceInr') ?? base.priceInr;
  const originalPriceInr =
    optionalNumber(request.data?.originalPriceInr, 1, 500000, 'originalPriceInr') ??
    Math.max(priceInr, base.originalPriceInr || priceInr);
  const discountPercentage =
    optionalNumber(request.data?.discountPercentage, 0, 95, 'discountPercentage') ??
    (originalPriceInr > priceInr
      ? Math.round(((originalPriceInr - priceInr) / originalPriceInr) * 100)
      : 0);

  const rawLimits = (request.data?.limits || {}) as Record<string, unknown>;
  const limits: PlanLimitsConfig = {
    monthlyInterestLimit: parseLimitInt(
      rawLimits.monthlyInterestLimit,
      base.limits.monthlyInterestLimit,
      true
    ),
    contactNumberLimit: parseLimitInt(
      rawLimits.contactNumberLimit,
      base.limits.contactNumberLimit,
      true
    ),
    shortlistLimit: parseLimitInt(rawLimits.shortlistLimit, base.limits.shortlistLimit, true),
    messageAccess: optionalBoolean(rawLimits.messageAccess) ?? base.limits.messageAccess,
    callAccess: optionalBoolean(rawLimits.callAccess) ?? base.limits.callAccess,
    whatsappAccess: optionalBoolean(rawLimits.whatsappAccess) ?? base.limits.whatsappAccess,
    advancedFilters: optionalBoolean(rawLimits.advancedFilters) ?? base.limits.advancedFilters,
    visibilityPriority:
      optionalNumber(rawLimits.visibilityPriority, 0, 10, 'visibilityPriority') ??
      base.limits.visibilityPriority,
    highlightStyle:
      rawLimits.highlightStyle === 'gold' ||
      rawLimits.highlightStyle === 'platinum' ||
      rawLimits.highlightStyle === 'none'
        ? rawLimits.highlightStyle
        : base.limits.highlightStyle,
    prioritySupport: optionalBoolean(rawLimits.prioritySupport) ?? base.limits.prioritySupport,
  };

  const benefits = Array.isArray(request.data?.benefits)
    ? optionalStringArray(request.data.benefits, 12, 160)
    : base.benefits;

  const updatedPlan: MatrimonyPlanDoc = {
    planId: rawPlanId,
    tier: rawPlanId,
    planName: optionalString(request.data?.planName, 60) || base.planName,
    tagline: optionalString(request.data?.tagline, 140) || base.tagline,
    durationMonths:
      optionalNumber(request.data?.durationMonths, 1, 36, 'durationMonths') ?? base.durationMonths,
    priceInr,
    originalPriceInr,
    discountPercentage,
    badgeText: optionalString(request.data?.badgeText, 40) ?? base.badgeText,
    benefits: benefits.length > 0 ? benefits : base.benefits,
    limits,
    isActive: optionalBoolean(request.data?.isActive) ?? base.isActive,
    sortOrder: base.sortOrder,
  };

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(
    planRef,
    {
      ...updatedPlan,
      updatedBy: adminUid,
      updatedAt: now,
    },
    { merge: true }
  );
  batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
    action: 'MATRIMONY_PLAN_UPDATED',
    actorUid: adminUid,
    planId: rawPlanId,
    priceInr: updatedPlan.priceInr,
    durationMonths: updatedPlan.durationMonths,
    isActive: updatedPlan.isActive,
    churchId: DEFAULT_CHURCH_ID,
    createdAt: now,
  });
  await batch.commit();

  return { success: true, plan: updatedPlan };
});

export const adminGrantComplimentarySubscription = onCall(
  { invoker: 'public' },
  async (request) => {
    const adminUid = await requireMatrimonyAdmin(request);
    const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
    const action = optionalString(request.data?.action, 20) || 'grant';

    const db = getFirestore();
    const profSnap = await getProfileRef(db, targetUid).get();
    if (!profSnap.exists) {
      throw new HttpsError('not-found', 'Matrimony profile not found for this user.');
    }

    if (action === 'revoke') {
      await downgradeExpiredSubscription(db, targetUid, { revokedBy: adminUid });
      await db.collection(COLLECTIONS.AUDIT_LOGS).add({
        action: 'MATRIMONY_SUBSCRIPTION_REVOKED_BY_ADMIN',
        actorUid: adminUid,
        targetUid,
        churchId: DEFAULT_CHURCH_ID,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { success: true, status: 'revoked', tier: 'free' };
    }

    const rawPlanId = assertNonEmptyString(
      request.data?.planId || request.data?.tier,
      'planId',
      40
    ).toLowerCase();
    if (!isPaidTier(rawPlanId)) {
      throw new HttpsError('invalid-argument', 'planId must be silver, gold, or platinum.');
    }

    await ensureDefaultPlansSeeded(db);
    const planDocSnap = await db.collection(COLLECTIONS.PLANS).doc(rawPlanId).get();
    const plan: MatrimonyPlanDoc = planDocSnap.exists
      ? (planDocSnap.data() as MatrimonyPlanDoc)
      : DEFAULT_PAID_PLANS[rawPlanId];

    const durationMonths =
      optionalNumber(request.data?.durationMonths, 1, 36, 'durationMonths') ??
      plan.durationMonths;
    const note =
      optionalString(request.data?.note, 300) || 'Complimentary grant by Church Administration';

    const nowMs = Date.now();
    const validUntilMs = nowMs + durationMonths * 30 * 24 * 60 * 60 * 1000;
    const subscriptionId = `admin_${plan.tier}_${nowMs}`;
    const now = FieldValue.serverTimestamp();

    const membershipPayload = {
      tier: plan.tier,
      planId: plan.planId,
      planName: plan.planName,
      durationMonths,
      pricePaidInr: 0,
      status: 'active' as const,
      subscriptionId,
      activatedAtMs: nowMs,
      validUntilMs,
      grantedBy: adminUid,
      note,
      updatedAt: now,
    };

    const batch = db.batch();
    batch.set(
      getSubscriptionRef(db, targetUid),
      {
        uid: targetUid,
        subscriptionId,
        planId: plan.planId,
        planName: plan.planName,
        tier: plan.tier,
        status: 'active',
        source: 'admin_complimentary',
        grantedBy: adminUid,
        note,
        startDateMs: nowMs,
        expiryDateMs: validUntilMs,
        durationMonths,
        amountInr: 0,
        currency: 'INR',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(
      getEntitlementRef(db, targetUid),
      {
        uid: targetUid,
        tier: plan.tier,
        planId: plan.planId,
        subscriptionId,
        ...plan.limits,
        validUntilMs,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(getProfileRef(db, targetUid), { membership: membershipPayload, updatedAt: now }, { merge: true });
    batch.set(
      getAdminProfileRef(db, targetUid),
      { membership: membershipPayload, syncedAt: now },
      { merge: true }
    );

    batch.set(db.collection(COLLECTIONS.PAYMENT_HISTORY).doc(), {
      uid: targetUid,
      subscriptionId,
      planId: plan.planId,
      tier: plan.tier,
      durationMonths,
      amountInr: 0,
      currency: 'INR',
      status: 'complimentary',
      source: 'admin_complimentary',
      grantedBy: adminUid,
      note,
      createdAtMs: nowMs,
      createdAt: now,
    });

    batch.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
      recipientUid: targetUid,
      senderUid: adminUid,
      type: 'SUBSCRIPTION_GRANTED',
      title: `${plan.planName} Membership Activated`,
      body: `Church Administration has granted you ${durationMonths} month(s) of ${plan.planName} Matrimony access.`,
      read: false,
      createdAt: now,
    });

    batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
      action: 'MATRIMONY_COMPLIMENTARY_SUBSCRIPTION_GRANTED',
      actorUid: adminUid,
      targetUid,
      planId: plan.planId,
      tier: plan.tier,
      durationMonths,
      note,
      churchId: DEFAULT_CHURCH_ID,
      createdAt: now,
    });

    await batch.commit();
    await syncEntitlementsToRtdb(targetUid, {
      tier: plan.tier,
      canMessage: plan.limits.messageAccess,
      validUntilMs,
    });

    return {
      success: true,
      subscriptionId,
      tier: plan.tier,
      validUntilMs,
      membership: membershipPayload,
    };
  }
);
