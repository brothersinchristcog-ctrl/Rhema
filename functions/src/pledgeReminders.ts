import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { assertAdminModulePermission } from './adminPermissions.js';

const DEFAULT_CHURCH_ID = 'rhema';

export interface TargetedMemberPushParams {
  churchId: string;
  memberUid?: string;
  memberPhone?: string;
  memberName?: string;
  type: 'pledge_reminder' | 'recurring_donation_receipt' | 'recurring_donation_failed' | 'recurring_pre_debit_reminder';
  title: string;
  body: string;
  pledgeId?: string;
  subscriptionId?: string;
  donationId?: string;
  eventId?: string;
  screen?: string;
}

/**
 * Resolve FCM tokens strictly for one specific church member (never topic broadcast)
 * and write a targeted in-app notification document.
 */
export async function sendTargetedMemberDonationPush(params: TargetedMemberPushParams): Promise<{ sent: number }> {
  const {
    churchId = DEFAULT_CHURCH_ID,
    memberUid = '',
    memberPhone = '',
    memberName = 'Member',
    type,
    title,
    body,
    pledgeId = '',
    subscriptionId = '',
    donationId = '',
    eventId = '',
    screen = 'Give',
  } = params;

  const db = getFirestore();
  const messaging = getMessaging();
  const memberTokens: string[] = [];

  const collectTokensFromObj = (obj: Record<string, any> | undefined) => {
    if (!obj) return;
    if (typeof obj.fcmToken === 'string' && obj.fcmToken.trim().length > 10) {
      memberTokens.push(obj.fcmToken.trim());
    }
    if (Array.isArray(obj.fcmTokens)) {
      for (const tok of obj.fcmTokens) {
        if (typeof tok === 'string' && tok.trim().length > 10) {
          memberTokens.push(tok.trim());
        }
      }
    }
  };

  try {
    if (memberUid) {
      const [memberSnap, userSnap] = await Promise.all([
        db.collection('Rhema Church').doc(churchId).collection('members').doc(memberUid).get().catch(() => null),
        db.collection('users').doc(memberUid).get().catch(() => null),
      ]);
      if (memberSnap?.exists) collectTokensFromObj(memberSnap.data());
      if (userSnap?.exists) collectTokensFromObj(userSnap.data());
    }

    if (memberTokens.length === 0 && memberPhone) {
      const cleanDigits = memberPhone.replace(/\D/g, '').slice(-10);
      if (cleanDigits.length >= 7) {
        const membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
        membersSnap.forEach((doc) => {
          const m = doc.data();
          const digits = String(m.phone || m.mobile || m.phoneNumber || '').replace(/\D/g, '').slice(-10);
          if (digits === cleanDigits) {
            collectTokensFromObj(m);
          }
        });
      }
    }
  } catch (err) {
    console.warn('[DonationPush] Token lookup error:', err);
  }

  let sentCount = 0;
  const uniqueTokens = Array.from(new Set(memberTokens));

  const dataPayload: Record<string, string> = {
    type,
    churchId,
    screen,
    pledgeId,
    subscriptionId,
    donationId,
    eventId,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  };

  if (uniqueTokens.length > 0) {
    try {
      const res = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: dataPayload,
        tokens: uniqueTokens,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'church_alerts',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });
      sentCount = res.successCount;
    } catch (fcmErr) {
      console.error('[DonationPush] Multicast send failed:', fcmErr);
    }
  }

  try {
    await db
      .collection('Rhema Church')
      .doc(churchId)
      .collection('notifications')
      .add({
        type,
        title,
        body,
        memberName,
        memberPhone,
        targetMemberId: memberUid,
        targetUid: memberUid,
        targetPhone: memberPhone,
        pledgeId: pledgeId || undefined,
        subscriptionId: subscriptionId || undefined,
        donationId: donationId || undefined,
        eventId: eventId || undefined,
        screen,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (dbErr) {
    console.warn('[DonationPush] Could not persist in-app notification:', dbErr);
  }

  return { sent: sentCount };
}

function toIstDateString(date: Date = new Date()): string {
  const istMs = date.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function diffDaysYmd(targetYmd: string, baseYmd: string): number {
  const target = new Date(`${targetYmd}T00:00:00Z`).getTime();
  const base = new Date(`${baseYmd}T00:00:00Z`).getTime();
  if (Number.isNaN(target) || Number.isNaN(base)) return 9999;
  return Math.round((target - base) / (24 * 60 * 60 * 1000));
}

function normalizeYmd(rawDate: unknown): string {
  const str = String(rawDate || '').trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export async function runPledgeAndMandateReminderSweep(targetChurchId?: string): Promise<{
  pledgesChecked: number;
  pledgeRemindersSent: number;
  mandateRemindersSent: number;
}> {
  const db = getFirestore();
  const todayIst = toIstDateString();
  let pledgesChecked = 0;
  let pledgeRemindersSent = 0;
  let mandateRemindersSent = 0;

  let churchIds: string[] = [];
  if (targetChurchId) {
    churchIds = [targetChurchId];
  } else {
    const churchesSnap = await db.collection('Rhema Church').get();
    churchIds = churchesSnap.empty ? [DEFAULT_CHURCH_ID] : churchesSnap.docs.map((d) => d.id);
  }

  for (const churchId of churchIds) {
    // 1. Evaluate Active / Partial / Overdue Pledges
    const pledgesSnap = await db
      .collection('Rhema Church')
      .doc(churchId)
      .collection('pledges')
      .where('status', 'in', ['active', 'partially_paid', 'overdue'])
      .get();

    for (const pledgeDoc of pledgesSnap.docs) {
      pledgesChecked++;
      const pledge = pledgeDoc.data() || {};
      if (pledge.reminderEnabled === false) continue;

      const pendingAmt = Number(pledge.pendingAmount ?? (Number(pledge.pledgeAmount || 0) - Number(pledge.receivedAmount || 0)));
      if (pendingAmt <= 0) {
        await pledgeDoc.ref.set({ status: 'fulfilled', pendingAmount: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        continue;
      }

      const frequency = String(pledge.frequency || 'monthly').toLowerCase();
      const endDateYmd = normalizeYmd(pledge.endDate);
      const installmentAmt = Number(pledge.installmentAmount || pendingAmt || pledge.pledgeAmount || 0);
      const displayAmt = Math.min(pendingAmt, installmentAmt > 0 ? installmentAmt : pendingAmt);

      let dueDateYmd = normalizeYmd(pledge.nextDueDate || pledge.startDate);
      let eventTitle = String(pledge.eventTitle || '').trim();

      if (frequency === 'event_wise' && pledge.eventId) {
        try {
          const eventSnap = await db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('events')
            .doc(String(pledge.eventId))
            .get();
          if (eventSnap.exists) {
            const evData = eventSnap.data() || {};
            dueDateYmd = normalizeYmd(evData.date || pledge.eventDate || dueDateYmd);
            eventTitle = String(evData.title || evData.name || eventTitle).trim();
          }
        } catch (_) {}
      }

      if (!dueDateYmd) continue;

      const daysUntilDue = diffDaysYmd(dueDateYmd, todayIst);
      let reminderKey = '';
      let isOverdue = false;
      let reminderBody = '';

      if (frequency === 'event_wise') {
        if (daysUntilDue === 7 || daysUntilDue === 1 || daysUntilDue === 0) {
          reminderKey = `event_${pledge.eventId || pledgeDoc.id}_d${daysUntilDue}_${dueDateYmd}`;
          const whenLabel = daysUntilDue === 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : 'in 7 days';
          reminderBody = `Event Pledge Reminder: Your ${pledge.category || 'Pledge'} commitment of ₹${displayAmt.toLocaleString('en-IN')}${eventTitle ? ` for "${eventTitle}"` : ''} is due ${whenLabel}. Tap to give securely.`;
        } else if (daysUntilDue < 0) {
          isOverdue = true;
          const weekStamp = todayIst.slice(0, 7);
          reminderKey = `event_${pledge.eventId || pledgeDoc.id}_overdue_${weekStamp}`;
          reminderBody = `Pending Event Pledge: ₹${pendingAmt.toLocaleString('en-IN')}${eventTitle ? ` for "${eventTitle}"` : ''} is still pending. Tap to fulfill via Razorpay.`;
        }
      } else {
        if (endDateYmd && todayIst > endDateYmd && daysUntilDue < 0) {
          isOverdue = true;
        }
        const shouldRemindSoon = daysUntilDue >= 0 && daysUntilDue <= 2;
        if (shouldRemindSoon) {
          reminderKey = `${frequency}_${dueDateYmd}_due`;
          const whenLabel = daysUntilDue === 0 ? 'today' : `on ${dueDateYmd}`;
          const freqLabel = frequency === 'weekly' ? 'Weekly' : frequency === 'yearly' ? 'Yearly' : 'Monthly';
          reminderBody = `${freqLabel} Pledge Reminder: Your ${pledge.category || 'Giving'} commitment of ₹${displayAmt.toLocaleString('en-IN')} is due ${whenLabel}. Tap to pay via Razorpay.`;
        } else if (daysUntilDue < 0) {
          isOverdue = true;
          const overdueBucket = frequency === 'weekly' ? todayIst : todayIst.slice(0, 7);
          reminderKey = `${frequency}_${dueDateYmd}_overdue_${overdueBucket}`;
          reminderBody = `Pending Pledge Reminder: ₹${pendingAmt.toLocaleString('en-IN')} towards ${pledge.category || 'Giving'} (due ${dueDateYmd}) is awaiting payment. Tap to contribute.`;
        }
      }

      if (isOverdue && pledge.status !== 'overdue') {
        await pledgeDoc.ref.set({ status: 'overdue', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      if (!reminderKey || pledge.lastReminderKey === reminderKey) {
        continue;
      }

      await sendTargetedMemberDonationPush({
        churchId,
        memberUid: pledge.memberUid,
        memberPhone: pledge.memberPhone,
        memberName: pledge.memberName,
        type: 'pledge_reminder',
        title: `🙏 Giving Reminder · ₹${displayAmt.toLocaleString('en-IN')}`,
        body: reminderBody,
        pledgeId: pledgeDoc.id,
        eventId: pledge.eventId || '',
        screen: 'Give',
      });

      await pledgeDoc.ref.set(
        {
          lastReminderKey: reminderKey,
          lastReminderSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      pledgeRemindersSent++;
    }

    // 2. Evaluate Active Recurring Mandates (courtesy pre-debit reminder 1-2 days before nextChargeAt)
    const mandatesSnap = await db
      .collection('Rhema Church')
      .doc(churchId)
      .collection('recurring_mandates')
      .where('status', '==', 'active')
      .get();

    for (const mandateDoc of mandatesSnap.docs) {
      const m = mandateDoc.data() || {};
      const nextChargeYmd = normalizeYmd(m.nextChargeDate);
      if (!nextChargeYmd) continue;

      const daysUntilCharge = diffDaysYmd(nextChargeYmd, todayIst);
      if (daysUntilCharge < 1 || daysUntilCharge > 2) continue;

      const preDebitKey = `pre_debit_${nextChargeYmd}`;
      if (m.lastPreDebitReminderKey === preDebitKey) continue;

      const freqLabel = m.frequency === 'weekly' ? 'weekly' : m.frequency === 'yearly' ? 'yearly' : 'monthly';
      await sendTargetedMemberDonationPush({
        churchId,
        memberUid: m.memberUid,
        memberPhone: m.memberPhone,
        memberName: m.memberName,
        type: 'recurring_pre_debit_reminder',
        title: `🔁 Upcoming ${freqLabel.charAt(0).toUpperCase() + freqLabel.slice(1)} Gift`,
        body: `Your authorized ${freqLabel} ${m.category || 'Giving'} gift of ₹${Number(m.amount || 0).toLocaleString('en-IN')} is scheduled for ${nextChargeYmd}. You can manage mandates anytime in Giving History.`,
        subscriptionId: mandateDoc.id,
        pledgeId: m.pledgeId || '',
        screen: 'GivingHistory',
      });

      await mandateDoc.ref.set(
        {
          lastPreDebitReminderKey: preDebitKey,
          lastPreDebitReminderSentAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      mandateRemindersSent++;
    }
  }

  return { pledgesChecked, pledgeRemindersSent, mandateRemindersSent };
}

/**
 * Daily Automated Pledge & Recurring Mandate Reminder Job (09:00 AM IST in asia-south1).
 */
export const sendPledgeRemindersScheduled = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
  },
  async () => {
    const summary = await runPledgeAndMandateReminderSweep();
    console.log('[PledgeReminders] Daily sweep summary:', summary);
  }
);

/**
 * Admin callable to test / manually trigger pledge payment reminders on demand.
 */
export const triggerPledgeRemindersManual = onCall(
  { region: 'asia-south1', cors: true, invoker: 'public' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const churchId = String(request.data?.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;
    const db = getFirestore();
    await assertAdminModulePermission(db, request.auth, churchId, 'donations');

    const summary = await runPledgeAndMandateReminderSweep(churchId);
    return { success: true, ...summary };
  }
);
