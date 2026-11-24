import * as crypto from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { COLLECTIONS, DEFAULT_CHURCH_ID } from './constants.js';
import {
  DEFAULT_PAID_PLANS,
  downgradeExpiredSubscription,
  ensureDefaultPlansSeeded,
  getCurrentMonthKey,
  getPlanById,
  resolveMemberEntitlements,
  syncEntitlementsToRtdb,
} from './entitlements.js';
import {
  assertMatrimonyProfileActive,
  getAdminProfileRef,
  getEntitlementRef,
  getProfileRef,
  getSubscriptionRef,
  getUsageRef,
} from './store.js';

export type MatrimonyMembershipPlan = 'silver' | 'gold' | 'platinum';

function requireAuthUid(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return uid;
}

function getRazorpayCredentials(): { keyId: string; keySecret: string } {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    throw new HttpsError(
      'failed-precondition',
      'Razorpay credentials are not configured on the server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend environment variables.'
    );
  }
  return { keyId, keySecret };
}

function parsePlanId(raw: unknown): string {
  const clean = String(raw || '').trim().toLowerCase();
  if (clean) return clean;
  throw new HttpsError('invalid-argument', 'Invalid membership plan selected.');
}

/**
 * 0. getMatrimonyPlans
 * Returns active Silver / Gold / Platinum plans from matrimony_plans (auto-seeding defaults if empty).
 */
export const getMatrimonyPlans = onCall({ invoker: 'public' }, async (request) => {
  requireAuthUid(request);
  const db = getFirestore();
  const plans = await ensureDefaultPlansSeeded(db);
  return { success: true, plans };
});

/**
 * 0b. getMemberEntitlements
 * Returns active membership tier, usage counters, and remaining monthly interest / contact / shortlist quotas.
 */
export const getMemberEntitlements = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const db = getFirestore();
  const entitlements = await resolveMemberEntitlements(db, uid);
  return { success: true, entitlements };
});

/**
 * 1. createMatrimonyUpgradeOrder
 * Creates a server-priced Razorpay order using the authoritative plan price from matrimony_plans.
 */
export const createMatrimonyUpgradeOrder = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
    const uid = requireAuthUid(request);
    const planId = parsePlanId(request.data?.plan || request.data?.planId);

    const db = getFirestore();
    await assertMatrimonyProfileActive(db, uid);

    const plan = await getPlanById(db, planId);
    if (!plan) {
      throw new HttpsError('not-found', 'Selected membership plan is unavailable.');
    }

    const { keyId, keySecret } = getRazorpayCredentials();
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });

    try {
      const order = await instance.orders.create({
        amount: Math.round(plan.priceInr * 100),
        currency: 'INR',
        receipt: `mat_${plan.planId}_${Date.now()}`,
        notes: {
          uid,
          plan: plan.tier,
          planId: plan.planId,
          churchId: DEFAULT_CHURCH_ID,
        },
      });

      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        amountInr: plan.priceInr,
        currency: order.currency,
        keyId,
        plan: plan.tier,
        planId: plan.planId,
        planName: plan.planName,
        durationMonths: plan.durationMonths,
      };
    } catch (err: any) {
      console.error('createMatrimonyUpgradeOrder error:', err);
      throw new HttpsError('internal', err?.message || 'Unable to initialize payment order.');
    }
  }
);

/**
 * 2. verifyMatrimonyUpgradePayment
 * Verifies Razorpay HMAC signature, prevents duplicate replay, and activates subscription + entitlements + usage cycle.
 */
export const verifyMatrimonyUpgradePayment = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
    const uid = requireAuthUid(request);
    const planId = parsePlanId(request.data?.plan || request.data?.planId);

    const razorpayPaymentId = String(request.data?.razorpay_payment_id || '').trim();
    const razorpayOrderId = String(request.data?.razorpay_order_id || '').trim();
    const razorpaySignature = String(request.data?.razorpay_signature || '').trim();

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      throw new HttpsError('invalid-argument', 'Missing payment verification credentials.');
    }

    const { keySecret } = getRazorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      throw new HttpsError('invalid-argument', 'Invalid payment signature.');
    }

    const db = getFirestore();
    const plan =
      (await getPlanById(db, planId)) ||
      (planId === 'silver' || planId === 'gold' || planId === 'platinum'
        ? DEFAULT_PAID_PLANS[planId]
        : null);
    if (!plan) {
      throw new HttpsError('not-found', 'Membership plan not found.');
    }

    const profileRef = getProfileRef(db, uid);
    const paymentHistRef = db.collection(COLLECTIONS.PAYMENT_HISTORY).doc(razorpayPaymentId);

    const [profileSnap, existingPaymentSnap, existingSubSnap] = await Promise.all([
      profileRef.get(),
      paymentHistRef.get(),
      getSubscriptionRef(db, uid).get(),
    ]);
    if (!profileSnap.exists) {
      throw new HttpsError('failed-precondition', 'Matrimony profile not found.');
    }

    // Duplicate-payment / replay protection
    if (existingPaymentSnap.exists) {
      const prev = existingPaymentSnap.data() || {};
      if (prev.uid === uid) {
        const entitlements = await resolveMemberEntitlements(db, uid);
        return {
          success: true,
          alreadyProcessed: true,
          membership: profileSnap.data()?.membership || null,
          entitlements,
        };
      }
      throw new HttpsError('already-exists', 'Payment ID has already been processed.');
    }

    const existingMembership = profileSnap.data()?.membership || {};
    const existingSub = existingSubSnap.exists ? existingSubSnap.data() || {} : {};
    const currentExpiry = Math.max(
      typeof existingMembership.validUntilMs === 'number' ? existingMembership.validUntilMs : 0,
      typeof existingSub.expiryDateMs === 'number' ? existingSub.expiryDateMs : 0
    );
    const startMs = Date.now();
    const baseMs = currentExpiry > startMs ? currentExpiry : startMs;

    const expiryDate = new Date(baseMs);
    expiryDate.setMonth(expiryDate.getMonth() + plan.durationMonths);
    const validUntilMs = expiryDate.getTime();
    const now = FieldValue.serverTimestamp();
    const monthKey = getCurrentMonthKey(new Date(startMs));

    const membershipPayload = {
      tier: plan.tier,
      planId: plan.planId,
      planName: plan.planName,
      status: 'active' as const,
      amountInr: plan.priceInr,
      durationMonths: plan.durationMonths,
      validUntilMs,
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      activatedAtMs: startMs,
      updatedAt: now,
    };

    const batch = db.batch();
    batch.set(
      profileRef,
      {
        membership: membershipPayload,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getAdminProfileRef(db, uid),
      {
        membership: membershipPayload,
        syncedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getSubscriptionRef(db, uid),
      {
        uid,
        churchId: DEFAULT_CHURCH_ID,
        tier: plan.tier,
        planId: plan.planId,
        planName: plan.planName,
        durationMonths: plan.durationMonths,
        amountInr: plan.priceInr,
        status: 'active',
        startDateMs: startMs,
        expiryDateMs: validUntilMs,
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
        limitsSnapshot: plan.limits,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getEntitlementRef(db, uid),
      {
        uid,
        churchId: DEFAULT_CHURCH_ID,
        tier: plan.tier,
        planId: plan.planId,
        ...plan.limits,
        validUntilMs,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      getUsageRef(db, uid),
      {
        uid,
        currentMonthKey: monthKey,
        subscriptionId: razorpayPaymentId,
        contactNumbersViewedCount: 0,
        billingPeriodStartMs: startMs,
        billingPeriodEndMs: validUntilMs,
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(paymentHistRef, {
      uid,
      churchId: DEFAULT_CHURCH_ID,
      type: 'razorpay_subscription',
      plan: plan.tier,
      planId: plan.planId,
      planName: plan.planName,
      durationMonths: plan.durationMonths,
      amountInr: plan.priceInr,
      currency: 'INR',
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      status: 'captured',
      startDateMs: startMs,
      validUntilMs,
      createdAt: now,
    });
    batch.set(profileRef.collection('payments').doc(razorpayPaymentId), {
      uid,
      churchId: DEFAULT_CHURCH_ID,
      plan: plan.tier,
      planId: plan.planId,
      planName: plan.planName,
      amountInr: plan.priceInr,
      currency: 'INR',
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      status: 'captured',
      validUntilMs,
      createdAt: now,
    });
    batch.set(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), {
      action: 'MATRIMONY_SUBSCRIPTION_ACTIVATED',
      actorUid: uid,
      targetUid: uid,
      planId: plan.planId,
      tier: plan.tier,
      paymentId: razorpayPaymentId,
      amountInr: plan.priceInr,
      churchId: DEFAULT_CHURCH_ID,
      createdAt: now,
    });
    await batch.commit();

    await syncEntitlementsToRtdb(uid, {
      tier: plan.tier,
      canMessage: plan.limits.messageAccess,
      validUntilMs,
    });

    const entitlements = await resolveMemberEntitlements(db, uid);

    return {
      success: true,
      membership: {
        tier: plan.tier,
        planId: plan.planId,
        planName: plan.planName,
        status: 'active',
        amountInr: plan.priceInr,
        durationMonths: plan.durationMonths,
        validUntilMs,
        paymentId: razorpayPaymentId,
      },
      entitlements,
    };
  }
);

/**
 * 3. expireMatrimonySubscriptions (Daily Scheduled Job)
 * Reverts expired paid subscriptions back to Free while preserving profiles, matches, interests, and chat history.
 */
export const expireMatrimonySubscriptions = onSchedule(
  { schedule: '15 0 * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' },
  async () => {
    const db = getFirestore();
    const nowMs = Date.now();
    const activeSubs = await db
      .collection(COLLECTIONS.SUBSCRIPTIONS)
      .where('status', '==', 'active')
      .get();

    for (const doc of activeSubs.docs) {
      const data = doc.data() || {};
      const expMs = typeof data.expiryDateMs === 'number' ? data.expiryDateMs : 0;
      if (expMs > 0 && expMs <= nowMs) {
        await downgradeExpiredSubscription(db, doc.id, data).catch((err) =>
          console.warn(`expireMatrimonySubscriptions failed for ${doc.id}:`, err)
        );
      }
    }
  }
);
