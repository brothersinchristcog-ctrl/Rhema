import * as crypto from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { DEFAULT_CHURCH_ID } from './constants.js';
import { assertMatrimonyProfileActive, getAdminProfileRef, getProfileRef } from './store.js';
const PLAN_CONFIGS = {
    silver: {
        id: 'silver',
        name: 'Silver',
        amountInr: 1,
        durationMonths: 3,
    },
    gold: {
        id: 'gold',
        name: 'Gold',
        amountInr: 2,
        durationMonths: 6,
    },
    platinum: {
        id: 'platinum',
        name: 'Platinum',
        amountInr: 3,
        durationMonths: 12,
    },
};
function requireAuthUid(request) {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    return uid;
}
function getRazorpayCredentials() {
    return {
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_live_TRsx05AgR0CwMk',
        keySecret: process.env.RAZORPAY_KEY_SECRET || 'Vz8oYPOYf0yOJ2st13r0abn0',
    };
}
function parsePlanId(raw) {
    if (raw === 'silver' || raw === 'gold' || raw === 'platinum') {
        return raw;
    }
    throw new HttpsError('invalid-argument', 'Invalid membership plan selected.');
}
/**
 * 1. createMatrimonyUpgradeOrder
 * Creates a server-priced Razorpay order for Silver (₹1), Gold (₹2), or Platinum (₹3).
 */
export const createMatrimonyUpgradeOrder = onCall({ invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 }, async (request) => {
    const uid = requireAuthUid(request);
    const planId = parsePlanId(request.data?.plan);
    const plan = PLAN_CONFIGS[planId];
    const db = getFirestore();
    await assertMatrimonyProfileActive(db, uid);
    const { keyId, keySecret } = getRazorpayCredentials();
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    try {
        const order = await instance.orders.create({
            amount: plan.amountInr * 100,
            currency: 'INR',
            receipt: `mat_${plan.id}_${Date.now()}`,
            notes: {
                uid,
                plan: plan.id,
                churchId: DEFAULT_CHURCH_ID,
            },
        });
        return {
            success: true,
            orderId: order.id,
            amount: order.amount,
            amountInr: plan.amountInr,
            currency: order.currency,
            keyId,
            plan: plan.id,
            planName: plan.name,
        };
    }
    catch (err) {
        console.error('createMatrimonyUpgradeOrder error:', err);
        throw new HttpsError('internal', err?.message || 'Unable to initialize payment order.');
    }
});
/**
 * 2. verifyMatrimonyUpgradePayment
 * Verifies Razorpay HMAC signature and activates Silver / Gold / Platinum on the member's profile.
 */
export const verifyMatrimonyUpgradePayment = onCall({ invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 }, async (request) => {
    const uid = requireAuthUid(request);
    const planId = parsePlanId(request.data?.plan);
    const plan = PLAN_CONFIGS[planId];
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
    const profileRef = getProfileRef(db, uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
        throw new HttpsError('failed-precondition', 'Matrimony profile not found.');
    }
    const existingMembership = profileSnap.data()?.membership || {};
    const baseMs = typeof existingMembership.validUntilMs === 'number' && existingMembership.validUntilMs > Date.now()
        ? existingMembership.validUntilMs
        : Date.now();
    const expiryDate = new Date(baseMs);
    expiryDate.setMonth(expiryDate.getMonth() + plan.durationMonths);
    const validUntilMs = expiryDate.getTime();
    const now = FieldValue.serverTimestamp();
    const membershipPayload = {
        tier: plan.id,
        planName: plan.name,
        status: 'active',
        amountInr: plan.amountInr,
        durationMonths: plan.durationMonths,
        validUntilMs,
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
        activatedAtMs: Date.now(),
        updatedAt: now,
    };
    const batch = db.batch();
    batch.set(profileRef, {
        membership: membershipPayload,
        updatedAt: now,
    }, { merge: true });
    batch.set(getAdminProfileRef(db, uid), {
        membership: membershipPayload,
        syncedAt: now,
    }, { merge: true });
    batch.set(profileRef.collection('payments').doc(razorpayPaymentId), {
        uid,
        churchId: DEFAULT_CHURCH_ID,
        plan: plan.id,
        planName: plan.name,
        amountInr: plan.amountInr,
        currency: 'INR',
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
        status: 'captured',
        validUntilMs,
        createdAt: now,
    });
    await batch.commit();
    return {
        success: true,
        membership: {
            tier: plan.id,
            planName: plan.name,
            status: 'active',
            amountInr: plan.amountInr,
            durationMonths: plan.durationMonths,
            validUntilMs,
            paymentId: razorpayPaymentId,
        },
    };
});
//# sourceMappingURL=membership.js.map