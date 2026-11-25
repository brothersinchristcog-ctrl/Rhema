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
  getPrivateRef,
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

  // Hydrate member Name, Matrimony Profile ID, Village/City, and Mobile Number for Subscribers & Payments
  const uidSet = new Set<string>();
  subsSnap.docs.forEach((d) => {
    const uid = String(d.data()?.uid || d.id || '').trim();
    if (uid) uidSet.add(uid);
  });
  paymentsSnap.docs.forEach((d) => {
    const uid = String(d.data()?.uid || '').trim();
    if (uid) uidSet.add(uid);
  });

  const memberMetaMap = new Map<
    string,
    {
      memberName: string | null;
      memberProfileCode: string | null;
      memberCity: string | null;
      memberPhone: string | null;
    }
  >();
  const uniqueUids = Array.from(uidSet);
  if (uniqueUids.length > 0) {
    const profRefs = uniqueUids.map((u) => getProfileRef(db, u));
    const privRefs = uniqueUids.map((u) => getPrivateRef(db, u));
    const [profSnaps, privSnaps] = await Promise.all([
      db.getAll(...profRefs),
      db.getAll(...privRefs),
    ]);
    uniqueUids.forEach((u, idx) => {
      const pData = profSnaps[idx]?.exists ? profSnaps[idx].data() || {} : {};
      const prData = privSnaps[idx]?.exists ? privSnaps[idx].data() || {} : {};
      const memberName =
        String(pData.displayName || prData.fullLegalName || '').trim() || null;
      const memberProfileCode = String(
        pData.matrimonyId || pData.profileCode || `RM${u.slice(0, 7).toUpperCase()}`
      )
        .trim()
        .toUpperCase();
      const locParts = [
        pData.location?.village,
        pData.location?.city,
        pData.location?.state,
        prData.address?.village,
        prData.address?.city,
      ]
        .map((val) => String(val || '').trim())
        .filter((val, pos, arr) => Boolean(val) && arr.indexOf(val) === pos);
      const memberCity = locParts.slice(0, 2).join(', ') || null;
      const memberPhone =
        String(prData.phoneNumber || pData.phoneNumber || '').trim() || null;
      memberMetaMap.set(u, {
        memberName,
        memberProfileCode,
        memberCity,
        memberPhone,
      });
    });
  }

  const nowMs = Date.now();
  let activeCount = 0;
  let expiredCount = 0;
  let silverActive = 0;
  let goldActive = 0;
  let platinumActive = 0;

  const subscriptions = subsSnap.docs
    .map((d) => {
      const data = d.data() || {};
      const subUid = String(data.uid || d.id);
      const meta = memberMetaMap.get(subUid);
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
        uid: subUid,
        memberName: meta?.memberName || null,
        memberProfileCode: meta?.memberProfileCode || null,
        memberCity: meta?.memberCity || null,
        memberPhone: meta?.memberPhone || null,
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
      const payUid = String(data.uid || '');
      const meta = memberMetaMap.get(payUid);
      const amt = Number(data.amountInr || 0);
      if (data.status === 'captured' && amt > 0) {
        totalRevenueInr += amt;
      }
      const createdTsMs =
        typeof data.createdAtMs === 'number'
          ? data.createdAtMs
          : typeof data.startDateMs === 'number'
          ? data.startDateMs
          : typeof data.createdAt?.toMillis === 'function'
          ? data.createdAt.toMillis()
          : 0;
      const startMs =
        typeof data.startDateMs === 'number' ? data.startDateMs : createdTsMs || null;
      const expiryMs =
        typeof data.validUntilMs === 'number'
          ? data.validUntilMs
          : typeof data.expiryDateMs === 'number'
          ? data.expiryDateMs
          : null;
      const tier = String(data.tier || data.plan || data.planId || '').toLowerCase();
      return {
        id: d.id,
        uid: payUid,
        memberName: meta?.memberName || null,
        memberProfileCode: meta?.memberProfileCode || null,
        memberCity: meta?.memberCity || null,
        memberPhone: meta?.memberPhone || null,
        planId: String(data.planId || tier),
        planName: data.planName ? String(data.planName) : null,
        tier,
        durationMonths: Number(data.durationMonths || 0) || null,
        amountInr: amt,
        status: String(data.status || ''),
        source: String(data.source || (data.type === 'razorpay_subscription' ? 'razorpay' : 'razorpay')),
        paymentId: data.paymentId ? String(data.paymentId) : null,
        orderId: data.orderId ? String(data.orderId) : null,
        note: data.note ? String(data.note) : null,
        startDateMs: startMs,
        expiryDateMs: expiryMs,
        createdAtMs: createdTsMs,
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

async function resolveMatrimonyTargetByUidOrCode(
  db: FirebaseFirestore.Firestore,
  rawInput: string
): Promise<string | null> {
  const clean = rawInput.trim();
  if (!clean) return null;

  // 1. Direct Firebase UID match
  const directSnap = await getProfileRef(db, clean).get();
  if (directSnap.exists) {
    return directSnap.id;
  }

  // 2. Exact Rhema Matrimony Profile ID (matrimonyId / profileCode) match
  const upperCode = clean.toUpperCase();
  const [byMatIdSnap, byCodeSnap] = await Promise.all([
    db.collection(COLLECTIONS.PROFILES).where('matrimonyId', '==', upperCode).limit(1).get(),
    db.collection(COLLECTIONS.PROFILES).where('profileCode', '==', upperCode).limit(1).get(),
  ]);
  if (!byMatIdSnap.empty && byMatIdSnap.docs[0]) return byMatIdSnap.docs[0].id;
  if (!byCodeSnap.empty && byCodeSnap.docs[0]) return byCodeSnap.docs[0].id;

  // 3. Fallback RM<first 7 chars of uid> match for profiles without stored matrimonyId
  if (upperCode.startsWith('RM')) {
    const allSnap = await db.collection(COLLECTIONS.PROFILES).get();
    for (const doc of allSnap.docs) {
      const data = doc.data() || {};
      const code = String(
        data.matrimonyId || data.profileCode || `RM${doc.id.slice(0, 7).toUpperCase()}`
      )
        .trim()
        .toUpperCase();
      if (code === upperCode) {
        return doc.id;
      }
    }
  }

  return null;
}

export const adminGrantComplimentarySubscription = onCall(
  { invoker: 'public' },
  async (request) => {
    const adminUid = await requireMatrimonyAdmin(request);
    const rawTarget = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
    const action = optionalString(request.data?.action, 20) || 'grant';

    const db = getFirestore();
    const targetUid = await resolveMatrimonyTargetByUidOrCode(db, rawTarget);
    if (!targetUid) {
      throw new HttpsError(
        'not-found',
        'No Matrimony member found for that Name, Profile ID, or UID.'
      );
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
      planName: plan.planName,
      tier: plan.tier,
      durationMonths,
      amountInr: 0,
      currency: 'INR',
      status: 'complimentary',
      source: 'admin_complimentary',
      grantedBy: adminUid,
      note,
      startDateMs: nowMs,
      validUntilMs,
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
