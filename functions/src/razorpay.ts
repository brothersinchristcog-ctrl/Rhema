import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import * as crypto from 'node:crypto';
import { sendTargetedMemberDonationPush } from './pledgeReminders.js';

const DEFAULT_CHURCH_ID = 'rhema';
const MAX_DONATION_INR = 10_000_000;
const VALID_RECURRING_FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const;
type RecurringFrequency = (typeof VALID_RECURRING_FREQUENCIES)[number];

function deriveGivingGroup(category: string, pledgeId?: string): 'Tithe' | 'Offering' | 'Pledge' {
  if (pledgeId) return 'Pledge';
  const lower = category.toLowerCase();
  if (lower.includes('tithe')) return 'Tithe';
  return 'Offering';
}

function addFrequencyDateYmd(startDateYmd: string, frequency: string): string {
  const safeBase = /^\d{4}-\d{2}-\d{2}/.test(startDateYmd)
    ? startDateYmd.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const dt = new Date(`${safeBase}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const f = frequency.toLowerCase();
  if (f === 'weekly') {
    dt.setUTCDate(dt.getUTCDate() + 7);
  } else if (f === 'yearly') {
    dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  } else {
    dt.setUTCMonth(dt.getUTCMonth() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

async function applyVerifiedDonationToPledgeTx(
  db: FirebaseFirestore.Firestore,
  churchId: string,
  pledgeId: string,
  donationId: string,
  paidAmountInr: number,
  paymentId: string
): Promise<void> {
  if (!pledgeId || paidAmountInr <= 0) return;

  const pledgeRef = db.collection('Rhema Church').doc(churchId).collection('pledges').doc(pledgeId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(pledgeRef);
    if (!snap.exists) return;

    const p = snap.data() || {};
    const existingIds: string[] = Array.isArray(p.linkedDonationIds) ? p.linkedDonationIds : [];
    if (existingIds.includes(donationId)) {
      return; // Already accounted for cleanly
    }

    const totalPledged = Number(p.pledgeAmount) || 0;
    const prevReceived = Number(p.receivedAmount) || 0;
    const newReceived = Math.round((prevReceived + paidAmountInr) * 100) / 100;
    const newPending = Math.max(0, Math.round((totalPledged - newReceived) * 100) / 100);
    const freq = String(p.frequency || 'monthly').toLowerCase();
    const todayYmd = new Date().toISOString().slice(0, 10);

    const newStatus =
      newPending <= 0
        ? 'fulfilled'
        : newReceived > 0
        ? 'partially_paid'
        : p.status || 'active';

    const nextDueDate =
      newStatus === 'fulfilled'
        ? p.nextDueDate || todayYmd
        : freq === 'event_wise'
        ? p.nextDueDate || p.eventDate || todayYmd
        : addFrequencyDateYmd(p.nextDueDate || p.startDate || todayYmd, freq);

    tx.set(
      pledgeRef,
      {
        receivedAmount: newReceived,
        pendingAmount: newPending,
        status: newStatus,
        nextDueDate,
        linkedDonationIds: FieldValue.arrayUnion(donationId),
        lastPaymentId: paymentId,
        lastPaidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

/**
 * Resolve Razorpay credentials from backend environment variables only.
 * Never hardcode credentials or expose Key Secret to clients.
 */
function readEnvKeyPair(prefix: 'RAZORPAY_GIVING' | 'RAZORPAY'): RazorpayCredentials | null {
  const keyId = (process.env[`${prefix}_KEY_ID`] || '').trim();
  const keySecret = (process.env[`${prefix}_KEY_SECRET`] || '').trim();

  if (keyId && !keySecret) {
    throw new HttpsError(
      'failed-precondition',
      `Incomplete Razorpay configuration: ${prefix}_KEY_ID is set without ${prefix}_KEY_SECRET.`
    );
  }
  if (!keyId && keySecret) {
    throw new HttpsError(
      'failed-precondition',
      `Incomplete Razorpay configuration: ${prefix}_KEY_SECRET is set without ${prefix}_KEY_ID.`
    );
  }
  if (!keyId || !keySecret) {
    return null;
  }

  return { keyId, keySecret };
}

/**
 * Giving/Donations credentials prioritize RAZORPAY_GIVING_KEY_ID / RAZORPAY_GIVING_KEY_SECRET
 * (allowing Covenant Synergy test credentials to be swapped to Rhema credentials in env config
 * with zero code changes), falling back to RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.
 */
function getGivingRazorpayCredentials(): RazorpayCredentials {
  const givingCreds = readEnvKeyPair('RAZORPAY_GIVING');
  if (givingCreds) {
    return givingCreds;
  }

  const defaultCreds = readEnvKeyPair('RAZORPAY');
  if (defaultCreds) {
    return defaultCreds;
  }

  throw new HttpsError(
    'failed-precondition',
    'Razorpay credentials are not configured on the server. Set RAZORPAY_GIVING_KEY_ID and RAZORPAY_GIVING_KEY_SECRET in backend environment variables.'
  );
}

/**
 * Platform/Subscription credentials strictly read RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.
 */
function getPlatformRazorpayCredentials(): RazorpayCredentials {
  const defaultCreds = readEnvKeyPair('RAZORPAY');
  if (defaultCreds) {
    return defaultCreds;
  }

  throw new HttpsError(
    'failed-precondition',
    'Razorpay platform credentials are not configured on the server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend environment variables.'
  );
}

function createRazorpayClient(creds: RazorpayCredentials): Razorpay {
  return new Razorpay({
    key_id: creds.keyId,
    key_secret: creds.keySecret,
  });
}

function verifyHmacSha256Signature(
  payload: string,
  receivedSignature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(receivedSignature.trim(), 'utf8');

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

function parseAmountInr(rawAmount: unknown): number {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX_DONATION_INR) {
    throw new HttpsError(
      'invalid-argument',
      `Amount must be between 1 and ${MAX_DONATION_INR} INR.`
    );
  }
  return Math.round(amount * 100) / 100;
}

function sanitizeReceipt(rawReceipt: unknown, fallbackPrefix = 'rcpt'): string {
  const cleaned = String(rawReceipt || `${fallbackPrefix}_${Date.now()}`)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.slice(0, 40) || `${fallbackPrefix}_${Date.now()}`.slice(0, 40);
}

async function resolveDonationDoc(
  db: FirebaseFirestore.Firestore,
  donationId?: string,
  orderId?: string
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  if (donationId) {
    const byId = await db.collection('church_donations').doc(donationId).get();
    if (byId.exists) {
      return byId;
    }
  }
  if (orderId) {
    const byOrder = await db
      .collection('church_donations')
      .where('orderId', '==', orderId)
      .limit(1)
      .get();
    if (!byOrder.empty && byOrder.docs[0]) {
      return byOrder.docs[0];
    }
  }
  return null;
}

async function mirrorCompletedChurchDonation(
  db: FirebaseFirestore.Firestore,
  churchId: string,
  docId: string,
  donationData: Record<string, any>,
  paymentId: string,
  orderId: string
): Promise<void> {
  const category = String(donationData.category || 'Offering').trim() || 'Offering';
  const pledgeId = String(donationData.pledgeId || '').trim();
  const givingGroup = donationData.givingGroup || deriveGivingGroup(category, pledgeId);
  const recurringType = donationData.recurringType === 'recurring' ? 'recurring' : 'one_time';
  const paymentGateway = String(donationData.paymentGateway || 'Razorpay');
  const appId = String(donationData.appId || churchId || DEFAULT_CHURCH_ID);
  const sourceChannel = String(donationData.sourceChannel || 'member_app');

  const completedPayload = {
    donorName: donationData.userName || donationData.donorName || 'Anonymous',
    donorPhone: donationData.phone || donationData.donorPhone || '',
    phone: donationData.phone || donationData.donorPhone || '',
    userId: donationData.userId || '',
    userName: donationData.userName || donationData.donorName || 'Anonymous',
    email: donationData.email || '',
    category,
    givingGroup,
    recurringType,
    frequency: donationData.frequency || null,
    subscriptionId: donationData.subscriptionId || null,
    pledgeId: pledgeId || null,
    eventId: donationData.eventId || null,
    eventTitle: donationData.eventTitle || null,
    paymentGateway,
    appId,
    appName: donationData.appName || 'Rhema Global Ministries',
    sourceChannel,
    amount: Number(donationData.amount) || 0,
    date: donationData.date || new Date().toISOString(),
    paymentMethod: 'Razorpay',
    paymentId,
    orderId,
    status: 'completed',
    verified: true,
    churchId,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await Promise.all([
    db.collection('church_donations').doc(docId).set(
      {
        givingGroup,
        recurringType,
        frequency: donationData.frequency || null,
        subscriptionId: donationData.subscriptionId || null,
        pledgeId: pledgeId || null,
        eventId: donationData.eventId || null,
        eventTitle: donationData.eventTitle || null,
        paymentGateway,
        appId,
        appName: donationData.appName || 'Rhema Global Ministries',
        sourceChannel,
        status: 'completed',
        paymentId,
        orderId,
        paymentMethod: 'Razorpay',
        churchId,
        verified: true,
        verifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    db
      .collection('Rhema Church')
      .doc(churchId)
      .collection('donations')
      .doc(docId)
      .set(
        {
          ...completedPayload,
          createdAt: donationData.timestamp || donationData.createdAt || FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
  ]);

  if (pledgeId) {
    await applyVerifiedDonationToPledgeTx(
      db,
      churchId,
      pledgeId,
      docId,
      Number(donationData.amount) || 0,
      paymentId
    );
  }
}

/**
 * Member Giving: Create a Razorpay Order in asia-south1.
 * Reads Razorpay Key ID & Key Secret from secure backend env vars only.
 */
export const createRazorpayOrder = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 3 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Please sign in to make a donation.');
    }

    const data = request.data || {};
    const amountInr = parseAmountInr(data.amount);
    const currency = String(data.currency || 'INR').trim().toUpperCase() || 'INR';
    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;
    const donationId = String(data.donationId || data.receipt || '').trim();
    const category = String(data.category || 'Offering').trim().slice(0, 80);
    const pledgeId = String(data.pledgeId || '').trim();
    const eventId = String(data.eventId || '').trim();
    const givingGroup = deriveGivingGroup(category, pledgeId);
    const receipt = sanitizeReceipt(data.receipt || donationId, 'don');

    const db = getFirestore();
    if (donationId) {
      const existingSnap = await db.collection('church_donations').doc(donationId).get();
      if (existingSnap.exists) {
        const ownerUid = existingSnap.data()?.userId;
        if (ownerUid && ownerUid !== uid) {
          throw new HttpsError('permission-denied', 'Unauthorized donation reference.');
        }
      }
    }

    const creds = getGivingRazorpayCredentials();
    const razorpay = createRazorpayClient(creds);

    try {
      const order = await razorpay.orders.create({
        amount: Math.round(amountInr * 100),
        currency,
        receipt,
        notes: {
          type: String(data.type || 'donation').slice(0, 40),
          churchId,
          donationId,
          category,
          givingGroup,
          pledgeId,
          eventId,
          recurringType: 'one_time',
          uid,
        },
      });

      if (donationId) {
        await db.collection('church_donations').doc(donationId).set(
          {
            orderId: order.id,
            currency: order.currency,
            churchId,
            givingGroup,
            recurringType: 'one_time',
            paymentGateway: 'Razorpay',
            appId: churchId,
            sourceChannel: 'member_app',
            pledgeId: pledgeId || null,
            eventId: eventId || null,
            paymentMethod: 'Razorpay',
            status: 'order_created',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return {
        success: true,
        keyId: creds.keyId,
        key_id: creds.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
        },
      };
    } catch (error: any) {
      console.error('createRazorpayOrder error:', error?.message || error);
      const rzpDesc = error?.error?.description || error?.message || 'Unable to create payment order.';
      throw new HttpsError('internal', rzpDesc);
    }
  }
);

/**
 * Member Giving: Verify Razorpay Checkout HMAC-SHA256 signature on backend
 * and mark church_donations + church-scoped donations completed atomically.
 */
export const verifyRazorpayPayment = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 3 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required to verify payment.');
    }

    const data = request.data || {};
    const razorpayOrderId = String(data.razorpay_order_id || '').trim();
    const razorpayPaymentId = String(data.razorpay_payment_id || '').trim();
    const razorpaySignature = String(data.razorpay_signature || '').trim();
    const requestedDonationId = String(data.donationId || '').trim();
    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new HttpsError('invalid-argument', 'Missing Razorpay payment verification parameters.');
    }

    const { keySecret } = getGivingRazorpayCredentials();
    const db = getFirestore();
    const donationSnap = await resolveDonationDoc(db, requestedDonationId, razorpayOrderId);

    if (donationSnap) {
      const existingData = donationSnap.data() || {};
      if (existingData.userId && existingData.userId !== uid) {
        throw new HttpsError('permission-denied', 'Unauthorized donation verification attempt.');
      }
      if (existingData.orderId && existingData.orderId !== razorpayOrderId) {
        throw new HttpsError('invalid-argument', 'Order ID does not match the donation record.');
      }
    }

    const isSignatureValid = verifyHmacSha256Signature(
      `${razorpayOrderId}|${razorpayPaymentId}`,
      razorpaySignature,
      keySecret
    );

    if (!isSignatureValid) {
      if (donationSnap && donationSnap.data()?.status !== 'completed') {
        await donationSnap.ref.set(
          {
            status: 'failed',
            verificationError: 'invalid_signature',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      throw new HttpsError('invalid-argument', 'Payment signature verification failed.');
    }

    if (donationSnap) {
      const existingData = donationSnap.data() || {};
      const targetChurchId = existingData.churchId || churchId;
      if (existingData.status === 'completed' && existingData.paymentId === razorpayPaymentId) {
        return {
          success: true,
          verified: true,
          alreadyVerified: true,
          paymentId: razorpayPaymentId,
          orderId: razorpayOrderId,
          donationId: donationSnap.id,
        };
      }

      await mirrorCompletedChurchDonation(
        db,
        targetChurchId,
        donationSnap.id,
        existingData,
        razorpayPaymentId,
        razorpayOrderId
      );

      return {
        success: true,
        verified: true,
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
        donationId: donationSnap.id,
      };
    }

    // Fallback record creation if client verified without a pre-existing donationId
    const fallbackRef = db.collection('church_donations').doc(requestedDonationId || razorpayPaymentId);
    const fallbackData = {
      amount: Number(data.amount) || 0,
      category: String(data.category || 'Offering').trim(),
      userId: uid,
      userName: String(data.donorName || 'Anonymous').trim(),
      phone: String(data.donorPhone || '').trim(),
      email: String(data.donorEmail || '').trim(),
      date: new Date().toISOString(),
      timestamp: FieldValue.serverTimestamp(),
    };
    await fallbackRef.set(fallbackData, { merge: true });
    await mirrorCompletedChurchDonation(
      db,
      churchId,
      fallbackRef.id,
      fallbackData,
      razorpayPaymentId,
      razorpayOrderId
    );

    return {
      success: true,
      verified: true,
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      donationId: fallbackRef.id,
    };
  }
);

/**
 * Legacy donation callable aliases in asia-south1 kept compatible with backend env credentials.
 */
export const createRazorpayDonationOrderV6 = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 3 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be signed in to donate.');
    }

    const data = request.data || {};
    const amountInr = parseAmountInr(data.amount);
    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;
    const receipt = sanitizeReceipt(data.receipt, 'don_v6');

    const creds = getGivingRazorpayCredentials();
    const instance = createRazorpayClient(creds);

    try {
      const order = await instance.orders.create({
        amount: Math.round(amountInr * 100),
        currency: 'INR',
        receipt,
        notes: {
          churchId,
          uid,
          type: 'church_donation',
        },
      });

      return {
        orderId: order.id,
        keyId: creds.keyId,
        amount: order.amount,
        currency: order.currency,
      };
    } catch (error: any) {
      console.error('createRazorpayDonationOrderV6 error:', error?.message || error);
      throw new HttpsError('internal', error?.message || 'Unable to create Razorpay donation order.');
    }
  }
);

export const verifyRazorpayDonationV6 = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 3 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const data = request.data || {};
    const razorpayOrderId = String(data.razorpay_order_id || '').trim();
    const razorpayPaymentId = String(data.razorpay_payment_id || '').trim();
    const razorpaySignature = String(data.razorpay_signature || '').trim();
    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;
    const donationId = String(data.donationId || '').trim();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new HttpsError('invalid-argument', 'Missing Razorpay verification fields.');
    }

    const { keySecret } = getGivingRazorpayCredentials();
    if (!verifyHmacSha256Signature(`${razorpayOrderId}|${razorpayPaymentId}`, razorpaySignature, keySecret)) {
      throw new HttpsError('invalid-argument', 'Payment signature verification failed.');
    }

    const db = getFirestore();
    if (donationId) {
      await db
        .collection('Rhema Church')
        .doc(churchId)
        .collection('donations')
        .doc(donationId)
        .set(
          {
            status: 'completed',
            paymentId: razorpayPaymentId,
            orderId: razorpayOrderId,
            verified: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }

    return { success: true, verified: true, paymentId: razorpayPaymentId };
  }
);

/**
 * Platform / Church Subscription: Create Razorpay Order (default region for SubscriptionTab).
 */
export const createRazorpayOrderV4 = onCall(
  { cors: true, invoker: 'public' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const data = request.data || {};
    const amountInr = parseAmountInr(data.amount);
    const receipt = sanitizeReceipt(data.receipt, 'sub');

    const creds = getPlatformRazorpayCredentials();
    const instance = createRazorpayClient(creds);

    try {
      const order = await instance.orders.create({
        amount: Math.round(amountInr * 100),
        currency: 'INR',
        receipt,
      });

      return {
        orderId: order.id,
        keyId: creds.keyId,
        amount: order.amount,
        currency: order.currency,
      };
    } catch (error: any) {
      console.error('createRazorpayOrderV4 error:', error?.message || error);
      throw new HttpsError('internal', error?.message || 'Unable to create subscription order.');
    }
  }
);

/**
 * Platform / Church Subscription Verification (default region for SubscriptionTab).
 */
export const verifyRazorpaySubscriptionV3 = onCall(
  { cors: true, invoker: 'public' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const data = request.data || {};
    const razorpayPaymentId = String(data.razorpay_payment_id || '').trim();
    const razorpayOrderId = String(data.razorpay_order_id || '').trim();
    const razorpaySignature = String(data.razorpay_signature || '').trim();
    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;
    const amount = Number(data.amount) || 0;
    const plan = String(data.plan || 'annual').trim();

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      throw new HttpsError('invalid-argument', 'Missing Razorpay verification fields.');
    }

    const { keySecret } = getPlatformRazorpayCredentials();
    if (!verifyHmacSha256Signature(`${razorpayOrderId}|${razorpayPaymentId}`, razorpaySignature, keySecret)) {
      throw new HttpsError('invalid-argument', 'Payment signature verification failed.');
    }

    const db = getFirestore();
    const targetUserId = String(data.userId || uid).trim();
    if (targetUserId !== uid) {
      throw new HttpsError('permission-denied', 'Unauthorized subscription update.');
    }

    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + 1);
    const validUntilIso = validUntil.toISOString();

    const churchRef = db.collection('Rhema Church').doc(churchId);
    const churchSnap = await churchRef.get();
    if (churchSnap.exists) {
      await churchRef.set(
        {
          subscription: {
            status: 'active',
            plan,
            amount,
            validUntil: validUntilIso,
            lastPaymentId: razorpayPaymentId,
            lastOrderId: razorpayOrderId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          isActive: true,
        },
        { merge: true }
      );
    }

    await churchRef.collection('subscriptions').doc(razorpayPaymentId).set({
      churchId,
      userId: uid,
      amount,
      plan,
      status: 'completed',
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      validUntil: validUntilIso,
      date: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true, verified: true, validUntil: validUntilIso };
  }
);

/**
 * Razorpay Webhook endpoint for asynchronous capture / failure reconciliation.
 */
export const razorpayWebhookV1 = onRequest(
  { invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 10 },
  async (req, res) => {
    const webhookSecret = (
      process.env.RAZORPAY_GIVING_WEBHOOK_SECRET ||
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      ''
    ).trim();

    if (!webhookSecret) {
      console.error('Razorpay webhook secret is not configured in environment variables.');
      res.status(500).send('Webhook not configured');
      return;
    }

    const signature = String(req.headers['x-razorpay-signature'] || '').trim();
    if (!signature) {
      res.status(400).send('Missing signature');
      return;
    }

    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    if (!verifyHmacSha256Signature(rawBody, signature, webhookSecret)) {
      res.status(400).send('Invalid signature');
      return;
    }

    const event = req.body?.event;
    const paymentEntity = req.body?.payload?.payment?.entity;
    const orderEntity = req.body?.payload?.order?.entity;
    const orderId = String(paymentEntity?.order_id || orderEntity?.id || '').trim();
    const paymentId = String(paymentEntity?.id || '').trim();
    const notes = paymentEntity?.notes || orderEntity?.notes || {};
    const donationId = String(notes?.donationId || '').trim();
    const churchId = String(notes?.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;

    try {
      const db = getFirestore();
      if ((event === 'payment.captured' || event === 'order.paid') && orderId) {
        const donationSnap = await resolveDonationDoc(db, donationId, orderId);
        if (donationSnap) {
          const existingData = donationSnap.data() || {};
          await mirrorCompletedChurchDonation(
            db,
            existingData.churchId || churchId,
            donationSnap.id,
            existingData,
            paymentId || existingData.paymentId || '',
            orderId
          );
        }
      } else if (event === 'payment.failed' && orderId) {
        const donationSnap = await resolveDonationDoc(db, donationId, orderId);
        if (donationSnap && donationSnap.data()?.status !== 'completed') {
          await donationSnap.ref.set(
            {
              status: 'failed',
              paymentId: paymentId || undefined,
              errorReason: paymentEntity?.error_description || 'Payment failed',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      } else if (event === 'subscription.charged' || event === 'invoice.paid') {
        const subscriptionEntity = req.body?.payload?.subscription?.entity;
        const invoiceEntity = req.body?.payload?.invoice?.entity;
        const subscriptionId = String(
          subscriptionEntity?.id ||
            invoiceEntity?.subscription_id ||
            paymentEntity?.notes?.subscriptionId ||
            ''
        ).trim();

        if (subscriptionId) {
          const mandateRef = db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('recurring_mandates')
            .doc(subscriptionId);
          const mandateSnap = await mandateRef.get();
          const mandate = mandateSnap.exists ? mandateSnap.data() || {} : null;

          if (mandate) {
            const chargePaymentId = paymentId || String(invoiceEntity?.payment_id || `inv_${invoiceEntity?.id || Date.now()}`);
            const cycleDocId = `sub_${subscriptionId}_${chargePaymentId}`;
            const cycleAmountInr =
              Number(paymentEntity?.amount ? paymentEntity.amount / 100 : invoiceEntity?.amount_paid ? invoiceEntity.amount_paid / 100 : mandate.amount) ||
              Number(mandate.amount) ||
              0;

            const existingCycleSnap = await db.collection('church_donations').doc(cycleDocId).get();
            if (!existingCycleSnap.exists || existingCycleSnap.data()?.status !== 'completed') {
              await mirrorCompletedChurchDonation(
                db,
                mandate.churchId || churchId,
                cycleDocId,
                {
                  userId: mandate.memberUid,
                  userName: mandate.memberName || 'Member',
                  phone: mandate.memberPhone || '',
                  email: mandate.memberEmail || '',
                  category: mandate.category || 'Tithe',
                  givingGroup: mandate.givingGroup || deriveGivingGroup(mandate.category || 'Tithe', mandate.pledgeId),
                  recurringType: 'recurring',
                  frequency: mandate.frequency || 'monthly',
                  subscriptionId,
                  pledgeId: mandate.pledgeId || '',
                  paymentGateway: 'Razorpay',
                  appId: mandate.appId || churchId,
                  appName: mandate.appName || 'Rhema Global Ministries',
                  sourceChannel: 'member_app',
                  amount: cycleAmountInr,
                  date: new Date().toISOString(),
                },
                chargePaymentId,
                String(paymentEntity?.order_id || invoiceEntity?.order_id || subscriptionId)
              );

              await sendTargetedMemberDonationPush({
                churchId: mandate.churchId || churchId,
                memberUid: mandate.memberUid,
                memberPhone: mandate.memberPhone,
                memberName: mandate.memberName,
                type: 'recurring_donation_receipt',
                title: `✅ Recurring Gift Received · ₹${cycleAmountInr.toLocaleString('en-IN')}`,
                body: `Thank you! Your ${mandate.frequency || 'monthly'} ${mandate.category || 'Giving'} donation of ₹${cycleAmountInr.toLocaleString('en-IN')} was processed. Tap to view receipt.`,
                subscriptionId,
                donationId: cycleDocId,
                pledgeId: mandate.pledgeId || '',
                screen: 'GivingHistory',
              });
            }

            const nextChargeDate = addFrequencyDateYmd(new Date().toISOString().slice(0, 10), mandate.frequency || 'monthly');
            await mandateRef.set(
              {
                status: subscriptionEntity?.status || 'active',
                totalPaidCount: Number(subscriptionEntity?.paid_count || (Number(mandate.totalPaidCount || 0) + 1)),
                nextChargeDate,
                lastChargedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      } else if (
        event === 'subscription.activated' ||
        event === 'subscription.paused' ||
        event === 'subscription.resumed' ||
        event === 'subscription.cancelled' ||
        event === 'subscription.completed' ||
        event === 'subscription.halted'
      ) {
        const subscriptionEntity = req.body?.payload?.subscription?.entity;
        const subscriptionId = String(subscriptionEntity?.id || '').trim();
        if (subscriptionId) {
          const mandateRef = db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('recurring_mandates')
            .doc(subscriptionId);
          const mandateSnap = await mandateRef.get();
          const newStatus = event.replace('subscription.', '');
          await mandateRef.set(
            {
              status: newStatus,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          if (event === 'subscription.halted' && mandateSnap.exists) {
            const mandate = mandateSnap.data() || {};
            await sendTargetedMemberDonationPush({
              churchId: mandate.churchId || churchId,
              memberUid: mandate.memberUid,
              memberPhone: mandate.memberPhone,
              memberName: mandate.memberName,
              type: 'recurring_donation_failed',
              title: '⚠️ Recurring Donation Action Needed',
              body: `Your recurring ${mandate.category || 'Giving'} payment of ₹${Number(mandate.amount || 0).toLocaleString('en-IN')} was paused by the bank. Tap to pay or update.`,
              subscriptionId,
              pledgeId: mandate.pledgeId || '',
              screen: 'Give',
            });
          }
        }
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('razorpayWebhookV1 error:', error?.message || error);
      res.status(500).send('Webhook processing failed');
    }
  }
);

/**
 * Member Recurring Giving: Create Razorpay Plan (cached) + Razorpay Subscription with explicit member consent.
 */
export const createRazorpayRecurringDonation = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 3 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Please sign in to set up recurring donations.');
    }

    const data = request.data || {};
    const amountInr = parseAmountInr(data.amount);
    const rawFrequency = String(data.frequency || 'monthly').trim().toLowerCase();
    if (!VALID_RECURRING_FREQUENCIES.includes(rawFrequency as RecurringFrequency)) {
      throw new HttpsError('invalid-argument', 'Recurring frequency must be weekly, monthly, or yearly.');
    }
    const frequency = rawFrequency as RecurringFrequency;

    if (data.consentConfirmed !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Explicit recurring payment consent confirmation is required.'
      );
    }

    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;
    const category = String(data.category || 'Tithe').trim().slice(0, 80);
    const pledgeId = String(data.pledgeId || '').trim();
    const givingGroup = deriveGivingGroup(category, pledgeId);
    const consentText = String(
      data.consentText ||
        `I authorize recurring ${frequency} donations of ₹${amountInr} via Razorpay until paused or cancelled.`
    ).slice(0, 500);

    const totalCountRaw = Number(data.totalCount);
    const defaultCycles = frequency === 'yearly' ? 15 : frequency === 'weekly' ? 156 : 120;
    const totalCount =
      Number.isFinite(totalCountRaw) && totalCountRaw >= 1 && totalCountRaw <= 500
        ? Math.floor(totalCountRaw)
        : defaultCycles;

    const creds = getGivingRazorpayCredentials();
    const razorpay = createRazorpayClient(creds);
    const db = getFirestore();

    const planKey = `plan_${frequency}_${Math.round(amountInr * 100)}_${category.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 80);
    const planDocRef = db.collection('Rhema Church').doc(churchId).collection('razorpay_plans').doc(planKey);

    try {
      let planId = '';
      const cachedPlan = await planDocRef.get();
      if (cachedPlan.exists && cachedPlan.data()?.planId) {
        planId = String(cachedPlan.data()?.planId);
      } else {
        const plan = await razorpay.plans.create({
          period: frequency,
          interval: 1,
          item: {
            name: `${category} (${frequency})`,
            amount: Math.round(amountInr * 100),
            currency: 'INR',
            description: `Recurring ${frequency} ${category} for ${churchId}`,
          },
          notes: {
            churchId,
            category,
            frequency,
          },
        });
        planId = plan.id;
        await planDocRef.set({
          planId,
          amountInr,
          frequency,
          category,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      const subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        total_count: totalCount,
        customer_notify: 1,
        notes: {
          type: 'recurring_donation',
          uid,
          churchId,
          category,
          givingGroup,
          frequency,
          pledgeId,
        },
      });

      const donorName = String(data.donorName || 'Anonymous').trim();
      const donorPhone = String(data.donorPhone || '').trim();
      const donorEmail = String(data.donorEmail || '').trim();
      const nextChargeDate = addFrequencyDateYmd(new Date().toISOString().slice(0, 10), frequency);

      await db
        .collection('Rhema Church')
        .doc(churchId)
        .collection('recurring_mandates')
        .doc(subscription.id)
        .set({
          subscriptionId: subscription.id,
          planId,
          churchId,
          appId: churchId,
          appName: String(data.appName || 'Rhema Global Ministries'),
          memberUid: uid,
          memberName: donorName,
          memberPhone: donorPhone,
          memberEmail: donorEmail,
          category,
          givingGroup,
          pledgeId: pledgeId || null,
          amount: amountInr,
          currency: 'INR',
          frequency,
          totalCount,
          totalPaidCount: 0,
          nextChargeDate,
          consentConfirmed: true,
          consentText,
          consentAcceptedAt: FieldValue.serverTimestamp(),
          status: 'created',
          paymentGateway: 'Razorpay',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

      return {
        success: true,
        subscriptionId: subscription.id,
        planId,
        keyId: creds.keyId,
        amount: Math.round(amountInr * 100),
        currency: 'INR',
        frequency,
      };
    } catch (error: any) {
      console.error('createRazorpayRecurringDonation error:', error?.error || error?.message || error);
      const desc = error?.error?.description || error?.message || 'Unable to set up recurring donation.';
      const isFeatureDisabled =
        typeof desc === 'string' &&
        (desc.toLowerCase().includes('subscription') || desc.toLowerCase().includes('not enabled'));
      throw new HttpsError(
        isFeatureDisabled ? 'failed-precondition' : 'internal',
        isFeatureDisabled
          ? `Razorpay Subscriptions may not be enabled on this merchant account yet (${desc}). You can still submit a recurring Pledge reminder.`
          : desc
      );
    }
  }
);

/**
 * Member Recurring Giving: Verify Razorpay Subscription Checkout authorization signature
 * (`razorpay_payment_id | razorpay_subscription_id`) and record Cycle #1 receipt.
 */
export const verifyRazorpaySubscriptionDonation = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 3 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const data = request.data || {};
    const razorpayPaymentId = String(data.razorpay_payment_id || '').trim();
    const razorpaySubscriptionId = String(data.razorpay_subscription_id || '').trim();
    const razorpaySignature = String(data.razorpay_signature || '').trim();
    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;

    if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) {
      throw new HttpsError('invalid-argument', 'Missing recurring payment verification parameters.');
    }

    const db = getFirestore();
    const mandateRef = db
      .collection('Rhema Church')
      .doc(churchId)
      .collection('recurring_mandates')
      .doc(razorpaySubscriptionId);
    const mandateSnap = await mandateRef.get();

    if (mandateSnap.exists && mandateSnap.data()?.memberUid && mandateSnap.data()?.memberUid !== uid) {
      throw new HttpsError('permission-denied', 'Unauthorized mandate verification.');
    }

    const { keySecret } = getGivingRazorpayCredentials();
    // Razorpay Subscriptions verify signature on payment_id|subscription_id
    const isValid = verifyHmacSha256Signature(
      `${razorpayPaymentId}|${razorpaySubscriptionId}`,
      razorpaySignature,
      keySecret
    );

    if (!isValid) {
      if (mandateSnap.exists && mandateSnap.data()?.status !== 'active') {
        await mandateRef.set({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      throw new HttpsError('invalid-argument', 'Recurring payment signature verification failed.');
    }

    const mandate = mandateSnap.exists ? mandateSnap.data() || {} : {};
    const frequency = String(mandate.frequency || data.frequency || 'monthly');
    const nextChargeDate = addFrequencyDateYmd(new Date().toISOString().slice(0, 10), frequency);
    const cycleDocId = `sub_${razorpaySubscriptionId}_${razorpayPaymentId}`;
    const amountInr = Number(mandate.amount || data.amount || 0);

    await mandateRef.set(
      {
        status: 'active',
        initialPaymentId: razorpayPaymentId,
        totalPaidCount: Math.max(1, Number(mandate.totalPaidCount || 0) + 1),
        nextChargeDate,
        lastChargedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (amountInr > 0) {
      await mirrorCompletedChurchDonation(
        db,
        churchId,
        cycleDocId,
        {
          userId: uid,
          userName: mandate.memberName || String(data.donorName || 'Anonymous'),
          phone: mandate.memberPhone || String(data.donorPhone || ''),
          email: mandate.memberEmail || String(data.donorEmail || ''),
          category: mandate.category || String(data.category || 'Tithe'),
          givingGroup: mandate.givingGroup || deriveGivingGroup(String(data.category || 'Tithe'), mandate.pledgeId),
          recurringType: 'recurring',
          frequency,
          subscriptionId: razorpaySubscriptionId,
          pledgeId: mandate.pledgeId || String(data.pledgeId || ''),
          paymentGateway: 'Razorpay',
          appId: churchId,
          appName: mandate.appName || 'Rhema Global Ministries',
          sourceChannel: 'member_app',
          amount: amountInr,
          date: new Date().toISOString(),
        },
        razorpayPaymentId,
        razorpaySubscriptionId
      );
    }

    return {
      success: true,
      verified: true,
      subscriptionId: razorpaySubscriptionId,
      paymentId: razorpayPaymentId,
      donationId: cycleDocId,
      nextChargeDate,
    };
  }
);

/**
 * Member / Admin Recurring Control: Pause, Resume, or Cancel an authorized Razorpay Subscription mandate.
 */
export const manageRazorpayRecurringDonation = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public', cpu: 1, memory: '256MiB', concurrency: 40, maxInstances: 3 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const data = request.data || {};
    const subscriptionId = String(data.subscriptionId || '').trim();
    const action = String(data.action || '').trim().toLowerCase();
    const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;

    if (!subscriptionId || !['cancel', 'pause', 'resume'].includes(action)) {
      throw new HttpsError('invalid-argument', 'Valid subscriptionId and action (cancel/pause/resume) are required.');
    }

    const db = getFirestore();
    const mandateRef = db
      .collection('Rhema Church')
      .doc(churchId)
      .collection('recurring_mandates')
      .doc(subscriptionId);
    const mandateSnap = await mandateRef.get();

    if (!mandateSnap.exists) {
      throw new HttpsError('not-found', 'Recurring mandate not found.');
    }

    const mandate = mandateSnap.data() || {};
    if (mandate.memberUid !== uid) {
      const callerSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(uid).get();
      const userType = String(callerSnap.data()?.userType || '').toLowerCase();
      if (!['admin', 'super_admin', 'super admin'].includes(userType)) {
        throw new HttpsError('permission-denied', 'You are not authorized to modify this recurring mandate.');
      }
    }

    const razorpay = createRazorpayClient(getGivingRazorpayCredentials());
    try {
      if (action === 'cancel') {
        await razorpay.subscriptions.cancel(subscriptionId, false);
      } else if (action === 'pause') {
        await razorpay.subscriptions.pause(subscriptionId, { pause_at: 'now' });
      } else {
        await razorpay.subscriptions.resume(subscriptionId, { resume_at: 'now' });
      }

      const statusMap: Record<string, string> = {
        cancel: 'cancelled',
        pause: 'paused',
        resume: 'active',
      };

      await mandateRef.set(
        {
          status: statusMap[action],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { success: true, status: statusMap[action] };
    } catch (error: any) {
      console.error('manageRazorpayRecurringDonation error:', error?.error || error?.message || error);
      throw new HttpsError('internal', error?.error?.description || error?.message || 'Failed to update mandate.');
    }
  }
);
