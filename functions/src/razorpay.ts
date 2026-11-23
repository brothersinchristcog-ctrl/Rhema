import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import * as crypto from 'node:crypto';

const DEFAULT_CHURCH_ID = 'rhema';
const MAX_DONATION_INR = 10_000_000;

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
  const completedPayload = {
    donorName: donationData.userName || donationData.donorName || 'Anonymous',
    donorPhone: donationData.phone || donationData.donorPhone || '',
    phone: donationData.phone || donationData.donorPhone || '',
    userId: donationData.userId || '',
    userName: donationData.userName || donationData.donorName || 'Anonymous',
    email: donationData.email || '',
    category: donationData.category || 'Offering',
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
}

/**
 * Member Giving: Create a Razorpay Order in asia-south1.
 * Reads Razorpay Key ID & Key Secret from secure backend env vars only.
 */
export const createRazorpayOrder = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public' },
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
          uid,
        },
      });

      if (donationId) {
        await db.collection('church_donations').doc(donationId).set(
          {
            orderId: order.id,
            currency: order.currency,
            churchId,
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
  { region: 'asia-south1', cors: true, invoker: 'public' },
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
  { region: 'asia-south1', cors: true, invoker: 'public' },
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
  { region: 'asia-south1', cors: true, invoker: 'public' },
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
  { invoker: 'public' },
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
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('razorpayWebhookV1 error:', error?.message || error);
      res.status(500).send('Webhook processing failed');
    }
  }
);
