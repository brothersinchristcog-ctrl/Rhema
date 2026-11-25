import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

export type GroupCelebrationType = 'Birthday' | 'Wedding Anniversary' | 'Baptism Anniversary';

const REGION = 'asia-south1';
const IST_TIMEZONE = 'Asia/Kolkata';
const ROOT_COLLECTIONS = ['Rhema Church', 'churches'] as const;

interface IstDateParts {
  year: number;
  month: number;
  day: number;
  dateStr: string;
}

interface ParsedMonthDay {
  year: number;
  month: number;
  day: number;
}

interface CelebrantEntry {
  docId: string;
  canonicalKey: string;
  memberId: string;
  name: string;
  type: GroupCelebrationType;
  emoji: string;
  fcmTokens: string[];
}

export interface LiveCelebrationGroupSweepReport {
  istDateStr: string;
  dryRun: boolean;
  churchesProcessed: number;
  totalCelebrants: number;
  totalGroupTokensTargeted: number;
  totalSuccessTokens: number;
  totalFailedTokens: number;
  churches: Array<{
    churchId: string;
    rootCollection: string;
    celebrantCount: number;
    status: string;
    tokensTargeted: number;
    successCount: number;
    failureCount: number;
    prunedInvalidTokens: number;
    celebrants: Array<{
      name: string;
      type: GroupCelebrationType;
    }>;
  }>;
}

function getIstDateParts(dateOverride?: string): IstDateParts {
  if (dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride.trim())) {
    const clean = dateOverride.trim();
    const parts = clean.split('-');
    const year = parseInt(parts[0] ?? '0', 10);
    const month = parseInt(parts[1] ?? '0', 10);
    const day = parseInt(parts[2] ?? '0', 10);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day, dateStr: clean };
    }
  }

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const parts = dateStr.split('-');
  return {
    year: parseInt(parts[0] ?? '0', 10),
    month: parseInt(parts[1] ?? '0', 10),
    day: parseInt(parts[2] ?? '0', 10),
    dateStr,
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parseDateInIstFromDate(d: Date): ParsedMonthDay | null {
  if (Number.isNaN(d.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const parts = formatted.split('-');
  const year = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '0', 10);
  const day = parseInt(parts[2] ?? '0', 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year: Number.isNaN(year) ? 0 : year, month, day };
}

export function parseGroupCelebrationDate(rawVal: unknown): ParsedMonthDay | null {
  if (!rawVal) return null;

  if (rawVal instanceof Timestamp) {
    return parseDateInIstFromDate(rawVal.toDate());
  }
  if (typeof rawVal === 'object' && rawVal !== null && typeof (rawVal as { toDate?: unknown }).toDate === 'function') {
    return parseDateInIstFromDate((rawVal as { toDate: () => Date }).toDate());
  }
  if (rawVal instanceof Date) {
    return parseDateInIstFromDate(rawVal);
  }
  if (typeof rawVal !== 'string') return null;

  const trimmed = rawVal.trim();
  if (!trimmed) return null;

  const clean = (trimmed.split('T')[0] ?? '').split(' ')[0] ?? '';
  const parts = clean.split(/[-/.]/);
  if (parts.length < 3) return null;

  const p0 = parts[0] ?? '';
  const p1 = parts[1] ?? '';
  const p2 = parts[2] ?? '';

  let year = 0;
  let month = 0;
  let day = 0;

  if (p0.length === 4) {
    year = parseInt(p0, 10);
    month = parseInt(p1, 10);
    day = parseInt(p2, 10);
  } else if (p2.length === 4) {
    day = parseInt(p0, 10);
    month = parseInt(p1, 10);
    year = parseInt(p2, 10);
  } else {
    year = parseInt(p0, 10);
    month = parseInt(p1, 10);
    day = parseInt(p2, 10);
  }

  if (Number.isNaN(month) || Number.isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year: Number.isNaN(year) ? 0 : year, month, day };
}

function matchesIstCalendarDay(parsed: ParsedMonthDay, ist: IstDateParts): boolean {
  if (parsed.month === ist.month && parsed.day === ist.day) {
    return true;
  }
  if (!isLeapYear(ist.year) && parsed.month === 2 && parsed.day === 29 && ist.month === 2 && ist.day === 28) {
    return true;
  }
  return false;
}

function normalizeLast10Digits(rawPhone: unknown): string {
  if (typeof rawPhone !== 'string' && typeof rawPhone !== 'number') return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

function normalizeName(rawName: unknown): string {
  return String(rawName ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getMemberDisplayName(data: Record<string, any>): string {
  const full = String(data.name || data.Name || '').trim();
  if (full) return full;
  const combined = `${String(data.firstName || '').trim()} ${String(data.lastName || '').trim()}`.trim();
  return combined || 'Member';
}

function isEligibleMember(data: Record<string, any>): boolean {
  if (!data) return false;
  if (data.isDeleted === true || data.deleted === true || data.archived === true) {
    return false;
  }
  const status = String(data.status || '').trim().toLowerCase();
  return !(
    status === 'inactive' ||
    status === 'deceased' ||
    status === 'deleted' ||
    status === 'archived' ||
    status === 'suspended' ||
    status === 'blocked' ||
    status === 'removed'
  );
}

function trackTokensFromDoc(
  data: Record<string, any> | undefined,
  docRef: DocumentReference<DocumentData>,
  tokenSet: Set<string>,
  tokenDocRefs: Map<string, DocumentReference<DocumentData>[]>
) {
  if (!data) return;

  const addOne = (rawToken: unknown) => {
    if (typeof rawToken !== 'string') return;
    const tk = rawToken.trim();
    if (tk.length <= 10) return;
    tokenSet.add(tk);
    const existing = tokenDocRefs.get(tk) || [];
    if (!existing.some((r) => r.path === docRef.path)) {
      existing.push(docRef);
      tokenDocRefs.set(tk, existing);
    }
  };

  addOne(data.fcmToken);
  if (Array.isArray(data.fcmTokens)) {
    for (const tk of data.fcmTokens) {
      addOne(tk);
    }
  }
}

async function pruneInvalidTokens(
  invalidTokens: string[],
  tokenDocRefs: Map<string, DocumentReference<DocumentData>[]>
): Promise<number> {
  if (invalidTokens.length === 0) return 0;

  const uniqueInvalid = Array.from(new Set(invalidTokens));
  const byDocPath = new Map<string, { ref: DocumentReference<DocumentData>; tokens: string[] }>();

  for (const tk of uniqueInvalid) {
    const refs = tokenDocRefs.get(tk) || [];
    for (const ref of refs) {
      const entry = byDocPath.get(ref.path) || { ref, tokens: [] };
      entry.tokens.push(tk);
      byDocPath.set(ref.path, entry);
    }
  }

  let prunedCount = 0;
  await Promise.allSettled(
    Array.from(byDocPath.values()).map(async ({ ref, tokens }) => {
      try {
        const snap = await ref.get();
        if (!snap.exists) return;
        const data = snap.data() || {};
        const updatePayload: Record<string, any> = {
          fcmTokens: FieldValue.arrayRemove(...tokens),
        };
        if (typeof data.fcmToken === 'string' && tokens.includes(data.fcmToken.trim())) {
          updatePayload.fcmToken = FieldValue.delete();
        }
        await ref.update(updatePayload);
        prunedCount += tokens.length;
      } catch (err) {
        console.warn(`[LiveCelebrationsGroup] Failed pruning invalid token on ${ref.path}:`, err);
      }
    })
  );

  return prunedCount;
}

function buildGroupBroadcastMessage(celebrants: CelebrantEntry[]): {
  title: string;
  body: string;
} {
  const first = celebrants[0];
  if (celebrants.length === 1 && first) {
    const title = `🎉 ${first.emoji} ${first.name} — ${first.type}`;
    const body = `Today is ${first.name}'s ${first.type}! Tap to open Live Celebrations chat and send your wishes and blessings.`;
    return { title, body };
  }

  const lines = celebrants.map((c) => `${c.emoji} ${c.name} — ${c.type}`);
  const maxShown = 8;
  const visibleLines = lines.slice(0, maxShown);
  if (lines.length > maxShown) {
    visibleLines.push(`...and ${lines.length - maxShown} more celebrating today!`);
  }
  const title = `🎉 Today's Celebrations (${celebrants.length})`;
  const body = `${visibleLines.join('\n')}\nTap to open Live Celebrations chat and send your wishes!`;
  return { title, body };
}

async function claimGroupDispatchSlot(
  db: Firestore,
  rootCollection: string,
  churchId: string,
  istDateStr: string,
  celebrantCount: number,
  force: boolean
): Promise<{ claimed: boolean; logRef: DocumentReference<DocumentData> }> {
  const logRef = db
    .collection(rootCollection)
    .doc(churchId)
    .collection('live_celebration_group_push_logs')
    .doc(istDateStr);

  if (force) {
    await logRef.set(
      {
        date: istDateStr,
        churchId,
        celebrantCount,
        status: 'processing',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { claimed: true, logRef };
  }

  const nowMs = Date.now();
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (snap.exists) {
      const data = snap.data() || {};
      if (data.status === 'sent') {
        return false;
      }
      if (
        data.status === 'processing' &&
        typeof data.startedAtMs === 'number' &&
        nowMs - data.startedAtMs < 5 * 60_000
      ) {
        return false;
      }
    }
    tx.set(
      logRef,
      {
        date: istDateStr,
        churchId,
        celebrantCount,
        status: 'processing',
        startedAtMs: nowMs,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  });

  return { claimed, logRef };
}

async function sendGroupMulticastOrFallbackTopic(
  messaging: Messaging,
  tokens: string[],
  tokenDocRefs: Map<string, DocumentReference<DocumentData>[]>,
  churchId: string,
  istDateStr: string,
  title: string,
  body: string
): Promise<{ successCount: number; failureCount: number; prunedCount: number }> {
  const dataPayload: Record<string, string> = {
    type: 'LIVE_CELEBRATION',
    screen: 'LiveCelebrationsChat',
    churchId,
    dateStr: istDateStr,
    actionButton: 'JOIN LIVE CHAT',
    title,
    body,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  };

  const tag = `live_celebration_${churchId}_${istDateStr}`;

  const androidConfig = {
    priority: 'high' as const,
    collapseKey: tag,
    notification: {
      title,
      body,
      sound: 'default',
      channelId: 'church_alerts',
      priority: 'max' as const,
      tag,
      defaultSound: true,
      defaultVibrateTimings: true,
      visibility: 'public' as const,
      clickAction: 'FLUTTER_NOTIFICATION_CLICK',
    },
  };

  const apnsConfig = {
    headers: {
      'apns-priority': '10',
      'apns-push-type': 'alert',
      'apns-collapse-id': tag,
    },
    payload: {
      aps: {
        alert: { title, body },
        sound: 'default',
        badge: 1,
      },
    },
  };

  if (tokens.length === 0) {
    try {
      await messaging.send({
        topic: `church_${churchId}`,
        notification: { title, body },
        data: dataPayload,
        android: androidConfig,
        apns: apnsConfig,
      });
      return { successCount: 1, failureCount: 0, prunedCount: 0 };
    } catch (err) {
      console.error(`[LiveCelebrationsGroup] Topic fallback failed for church ${churchId}:`, err);
      return { successCount: 0, failureCount: 1, prunedCount: 0 };
    }
  }

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    try {
      const response = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: dataPayload,
        android: androidConfig,
        apns: apnsConfig,
        tokens: chunk,
      });
      successCount += response.successCount;
      failureCount += response.failureCount;

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = String(resp.error?.code || '');
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token'
            ) {
              const badToken = chunk[idx];
              if (badToken) invalidTokens.push(badToken);
            }
          }
        });
      }
    } catch (err) {
      failureCount += chunk.length;
      console.error(`[LiveCelebrationsGroup] Multicast chunk failed for ${churchId}:`, err);
    }
  }

  const prunedCount = invalidTokens.length > 0 ? await pruneInvalidTokens(invalidTokens, tokenDocRefs) : 0;
  return { successCount, failureCount, prunedCount };
}

/**
 * Group Live Celebrations Chat Push Sweep.
 *
 * Intentionally separated from personal celebration wishes (`celebrationPushScheduler.ts`):
 * - Personal wishes notify ONLY the celebrant and open private `Updates`.
 * - Group Live Celebrations notifications notify ALL eligible members in the church
 *   about today's Birthday, Wedding Anniversary, and Baptism Anniversary celebrants
 *   and open `LiveCelebrationsChat` directly when tapped.
 */
export async function runDailyCelebrationsSweep(options?: {
  churchIdFilter?: string;
  dateOverride?: string;
  dryRun?: boolean;
  force?: boolean;
  db?: Firestore;
  messaging?: Messaging;
}): Promise<LiveCelebrationGroupSweepReport> {
  const db = options?.db ?? getFirestore();
  const messaging = options?.messaging ?? getMessaging();
  const dryRun = options?.dryRun === true;
  const force = options?.force === true;
  const ist = getIstDateParts(options?.dateOverride);

  console.log(`🎉 [LiveCelebrationsGroup] Running daily group sweep for IST ${ist.dateStr} (dryRun=${dryRun})`);

  // Discover churches prioritizing 'Rhema Church' over legacy 'churches'
  const discoveredChurches = new Map<string, { churchId: string; rootCollection: string }>();
  for (const rootCol of ROOT_COLLECTIONS) {
    try {
      const snap = await db.collection(rootCol).get();
      snap.forEach((doc) => {
        if (options?.churchIdFilter && doc.id !== options.churchIdFilter) return;
        if (!discoveredChurches.has(doc.id)) {
          discoveredChurches.set(doc.id, { churchId: doc.id, rootCollection: rootCol });
        }
      });
    } catch (err) {
      console.warn(`[LiveCelebrationsGroup] Failed scanning ${rootCol}:`, err);
    }
  }

  if (options?.churchIdFilter && !discoveredChurches.has(options.churchIdFilter)) {
    discoveredChurches.set(options.churchIdFilter, {
      churchId: options.churchIdFilter,
      rootCollection: 'Rhema Church',
    });
  }

  // Index users once to map Auth UIDs & church-scoped member tokens without duplicate dispatches
  const usersByUid = new Map<string, { data: Record<string, any>; ref: DocumentReference<DocumentData> }>();
  const usersByChurch = new Map<string, Array<{ uid: string; data: Record<string, any>; ref: DocumentReference<DocumentData> }>>();

  try {
    const usersSnap = await db.collection('users').get();
    usersSnap.forEach((uDoc) => {
      const uData = uDoc.data() || {};
      const entry = { uid: uDoc.id, data: uData, ref: uDoc.ref };
      usersByUid.set(uDoc.id, { data: uData, ref: uDoc.ref });
      const uChurch = String(uData.primaryChurchId || uData.churchId || 'rhema').trim();
      const list = usersByChurch.get(uChurch) || [];
      list.push(entry);
      usersByChurch.set(uChurch, list);
    });
  } catch (err) {
    console.warn('[LiveCelebrationsGroup] Failed loading users index:', err);
  }

  const report: LiveCelebrationGroupSweepReport = {
    istDateStr: ist.dateStr,
    dryRun,
    churchesProcessed: 0,
    totalCelebrants: 0,
    totalGroupTokensTargeted: 0,
    totalSuccessTokens: 0,
    totalFailedTokens: 0,
    churches: [],
  };

  for (const church of discoveredChurches.values()) {
    const { churchId, rootCollection } = church;
    const membersSnap = await db.collection(rootCollection).doc(churchId).collection('members').get();
    if (membersSnap.empty) continue;

    report.churchesProcessed += 1;

    // Pre-index uid lookup by direct phone + name so CRM/UID duplicate member docs collapse cleanly
    const uidByPhoneAndName = new Map<string, string>();
    membersSnap.forEach((mDoc) => {
      const mData = mDoc.data() || {};
      const last10 = normalizeLast10Digits(
        mData.directPhone || mData.phone || mData.mobile || mData.MobilePhone || mData.phoneNumber
      );
      const normName = normalizeName(getMemberDisplayName(mData));
      const explicitUid = String(mData.authUid || mData.uid || '').trim();
      const candidateUid = explicitUid || (usersByUid.has(mDoc.id) ? mDoc.id : '');
      if (last10 && normName && candidateUid && !uidByPhoneAndName.has(`${last10}::${normName}`)) {
        uidByPhoneAndName.set(`${last10}::${normName}`, candidateUid);
      }
    });

    // 1. Collect today's celebrants (deduplicated per person + type) AND all eligible church member tokens
    const celebrantsMap = new Map<string, CelebrantEntry>();
    const churchTokenSet = new Set<string>();
    const churchTokenDocRefs = new Map<string, DocumentReference<DocumentData>[]>();

    membersSnap.forEach((mDoc) => {
      const mData = mDoc.data() || {};
      if (!isEligibleMember(mData)) return;

      // Gather eligible church member tokens cleanly into a single deduplicated Set
      trackTokensFromDoc(mData, mDoc.ref, churchTokenSet, churchTokenDocRefs);

      const displayName = getMemberDisplayName(mData);
      const last10 = normalizeLast10Digits(
        mData.directPhone || mData.phone || mData.mobile || mData.MobilePhone || mData.phoneNumber
      );
      const normName = normalizeName(displayName);
      const explicitUid = String(mData.authUid || mData.uid || '').trim();

      let canonicalKey = explicitUid;
      if (!canonicalKey && usersByUid.has(mDoc.id)) canonicalKey = mDoc.id;
      if (!canonicalKey && last10 && normName) {
        canonicalKey = uidByPhoneAndName.get(`${last10}::${normName}`) || '';
      }
      if (!canonicalKey) {
        canonicalKey = last10 && normName ? `${last10}_${normName.replace(/\s+/g, '_')}` : mDoc.id;
      }

      // Collect personal tokens ONLY for the celebrant doc's `celebrants` subcollection (batched wishes feature)
      const personalTokens = new Set<string>();
      const dummyRefs = new Map<string, DocumentReference<DocumentData>[]>();
      trackTokensFromDoc(mData, mDoc.ref, personalTokens, dummyRefs);
      if (explicitUid && usersByUid.has(explicitUid)) {
        const u = usersByUid.get(explicitUid);
        if (u) trackTokensFromDoc(u.data, u.ref, personalTokens, dummyRefs);
      } else if (usersByUid.has(mDoc.id)) {
        const u = usersByUid.get(mDoc.id);
        if (u) trackTokensFromDoc(u.data, u.ref, personalTokens, dummyRefs);
      }

      const checkAndRegister = (rawVal: unknown, suffix: string, type: GroupCelebrationType, emoji: string) => {
        const parsed = parseGroupCelebrationDate(rawVal);
        if (!parsed || !matchesIstCalendarDay(parsed, ist)) return;

        const key = `${canonicalKey}_${suffix}`;
        const existing = celebrantsMap.get(key);
        if (existing) {
          existing.fcmTokens = Array.from(new Set([...existing.fcmTokens, ...personalTokens]));
          return;
        }

        celebrantsMap.set(key, {
          docId: key,
          canonicalKey,
          memberId: mDoc.id,
          name: displayName,
          type,
          emoji,
          fcmTokens: Array.from(personalTokens),
        });
      };

      checkAndRegister(
        mData.Birthdate || mData.dob || mData.birthdate || mData.dateOfBirth || mData.birthday,
        'bday',
        'Birthday',
        '🎂'
      );
      checkAndRegister(
        mData.Anniversary_Date__c ||
          mData.anniversaryDate ||
          mData.marriageDate ||
          mData.weddingAnniversary ||
          mData.anniversary,
        'anniv',
        'Wedding Anniversary',
        '💍'
      );
      checkAndRegister(
        mData.Baptism_Date__c || mData.baptismDate || mData.baptism,
        'bap',
        'Baptism Anniversary',
        '🕊️'
      );
    });

    // Also include active church users from `users` collection so no logged-in church member is missed
    const churchUsers = usersByChurch.get(churchId) || [];
    for (const uEntry of churchUsers) {
      if (!isEligibleMember(uEntry.data)) continue;
      trackTokensFromDoc(uEntry.data, uEntry.ref, churchTokenSet, churchTokenDocRefs);
    }

    const celebrantsList = Array.from(celebrantsMap.values());
    if (celebrantsList.length === 0) {
      report.churches.push({
        churchId,
        rootCollection,
        celebrantCount: 0,
        status: 'no_celebrations_today',
        tokensTargeted: 0,
        successCount: 0,
        failureCount: 0,
        prunedInvalidTokens: 0,
        celebrants: [],
      });
      continue;
    }

    report.totalCelebrants += celebrantsList.length;
    const allGroupTokens = Array.from(churchTokenSet);
    const { title, body } = buildGroupBroadcastMessage(celebrantsList);

    if (dryRun) {
      report.totalGroupTokensTargeted += allGroupTokens.length;
      report.churches.push({
        churchId,
        rootCollection,
        celebrantCount: celebrantsList.length,
        status: 'dry_run_ready',
        tokensTargeted: allGroupTokens.length,
        successCount: 0,
        failureCount: 0,
        prunedInvalidTokens: 0,
        celebrants: celebrantsList.map((c) => ({ name: c.name, type: c.type })),
      });
      continue;
    }

    // Ensure today's live_celebrations room document & celebrants metadata exist under the active root collection
    const liveDocRef = db
      .collection(rootCollection)
      .doc(churchId)
      .collection('live_celebrations')
      .doc(ist.dateStr);

    await liveDocRef.set(
      {
        date: ist.dateStr,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await Promise.allSettled(
      celebrantsList.map((celebrant) =>
        liveDocRef.collection('celebrants').doc(celebrant.docId).set(
          {
            memberId: celebrant.memberId,
            canonicalKey: celebrant.canonicalKey,
            name: celebrant.name,
            type: celebrant.type,
            fcmTokens: celebrant.fcmTokens,
          },
          { merge: true }
        )
      )
    );

    // Atomic idempotency check to guarantee zero duplicate daily group pushes
    const { claimed, logRef } = await claimGroupDispatchSlot(
      db,
      rootCollection,
      churchId,
      ist.dateStr,
      celebrantsList.length,
      force
    );

    if (!claimed) {
      report.churches.push({
        churchId,
        rootCollection,
        celebrantCount: celebrantsList.length,
        status: 'skipped_already_sent',
        tokensTargeted: 0,
        successCount: 0,
        failureCount: 0,
        prunedInvalidTokens: 0,
        celebrants: celebrantsList.map((c) => ({ name: c.name, type: c.type })),
      });
      continue;
    }

    // Send ONLY the church-wide group notification opening LiveCelebrationsChat (no personal wish mixed here!)
    const dispatchRes = await sendGroupMulticastOrFallbackTopic(
      messaging,
      allGroupTokens,
      churchTokenDocRefs,
      churchId,
      ist.dateStr,
      title,
      body
    );

    await logRef.set(
      {
        status: 'sent',
        title,
        body,
        celebrants: celebrantsList.map((c) => ({ name: c.name, type: c.type })),
        tokensTargeted: allGroupTokens.length,
        successCount: dispatchRes.successCount,
        failureCount: dispatchRes.failureCount,
        prunedInvalidTokens: dispatchRes.prunedCount,
        completedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    report.totalGroupTokensTargeted += allGroupTokens.length;
    report.totalSuccessTokens += dispatchRes.successCount;
    report.totalFailedTokens += dispatchRes.failureCount;

    report.churches.push({
      churchId,
      rootCollection,
      celebrantCount: celebrantsList.length,
      status: 'sent',
      tokensTargeted: allGroupTokens.length,
      successCount: dispatchRes.successCount,
      failureCount: dispatchRes.failureCount,
      prunedInvalidTokens: dispatchRes.prunedCount,
      celebrants: celebrantsList.map((c) => ({ name: c.name, type: c.type })),
    });
  }

  console.log(
    `✅ [LiveCelebrationsGroup] Sweep complete for ${ist.dateStr}: celebrants=${report.totalCelebrants}, tokens=${report.totalGroupTokensTargeted}, success=${report.totalSuccessTokens}`
  );
  return report;
}

/**
 * Scheduled daily group push informing all church members of today's Birthdays,
 * Wedding Anniversaries, and Baptism Anniversaries and opening Live Celebrations chat.
 * Runs at 8:00 AM IST (separate from 6:30 / 7:00 / 7:30 AM personal wishes).
 */
export const weCelebrationDailySweepV3 = onSchedule(
  { schedule: '0 8 * * *', timeZone: IST_TIMEZONE, region: REGION },
  async () => {
    await runDailyCelebrationsSweep();
  }
);

/**
 * Manual / Verification HTTP endpoint for the Group Live Celebrations push sweep.
 * Defaults to `dryRun=true`.
 */
export const triggerMorningCelebrations = onRequest(
  { timeoutSeconds: 300, cors: true, region: REGION },
  async (req, res) => {
    try {
      const churchIdFilter = String(req.query.churchId || req.body?.churchId || '').trim() || undefined;
      const dateOverride = String(req.query.date || req.body?.date || '').trim() || undefined;
      const dryRun = req.query.dryRun !== 'false' && req.body?.dryRun !== false;
      const force = req.query.force === 'true' || req.body?.force === true;

      const sweepOpts: {
        churchIdFilter?: string;
        dateOverride?: string;
        dryRun?: boolean;
        force?: boolean;
      } = { dryRun, force };
      if (churchIdFilter) sweepOpts.churchIdFilter = churchIdFilter;
      if (dateOverride) sweepOpts.dateOverride = dateOverride;

      const report = await runDailyCelebrationsSweep(sweepOpts);
      res.status(200).json({
        success: true,
        message: 'Daily group celebrations sweep complete.',
        report,
      });
    } catch (e: any) {
      console.error('❌ triggerMorningCelebrations error:', e);
      res.status(500).json({ success: false, error: e?.message || 'Error running celebrations sweep.' });
    }
  }
);

export const weCelebrationBatchedWishes = onSchedule(
  { schedule: '*/10 * * * *', timeZone: IST_TIMEZONE, region: REGION },
  async () => {
    await runBatchedWishesSweep();
  }
);

/**
 * HTTP endpoint so Cloud Scheduler can force-run the batched wishes sweep.
 */
export const executeBatchedWishes = onRequest(
  { timeoutSeconds: 180, cors: true, region: REGION },
  async (_req, res) => {
    try {
      await runBatchedWishesSweep();
      res.status(200).json({ success: true, message: 'Batched wishes sweep complete.' });
    } catch (e: any) {
      console.error('❌ executeBatchedWishes error:', e);
      res.status(500).json({ error: e?.message || 'Failed to run batched wishes sweep.' });
    }
  }
);

export async function runBatchedWishesSweep(options?: { db?: Firestore; messaging?: Messaging }) {
  const db = options?.db ?? getFirestore();
  const messaging = options?.messaging ?? getMessaging();

  const celebrantsQuery = await db.collectionGroup('celebrants').where('unnotifiedWishes', '>', 0).get();
  if (celebrantsQuery.empty) {
    console.log('No celebrants with unnotified wishes.');
    return;
  }

  for (const doc of celebrantsQuery.docs) {
    const data = doc.data() || {};
    const pathParts = doc.ref.path.split('/');
    // Expected path: '{rootCollection}/{churchId}/live_celebrations/{dateId}/celebrants/{celebrantId}'
    const rootCol = pathParts[0] || 'Rhema Church';
    const churchId = pathParts[1] || 'rhema';

    const tokenSet = new Set<string>();
    const tokenDocRefs = new Map<string, DocumentReference<DocumentData>[]>();
    trackTokensFromDoc(data, doc.ref, tokenSet, tokenDocRefs);

    const unnotified = Number(data.unnotifiedWishes || 0);
    const total = Number(data.totalWishes || 0);
    const type = String(data.type || 'Celebration');
    const celebrantMemberId = String(data.memberId || doc.id.split('_')[0] || '').trim();

    if (tokenSet.size === 0 && celebrantMemberId) {
      try {
        const memberSnap = await db.collection(rootCol).doc(churchId).collection('members').doc(celebrantMemberId).get();
        if (memberSnap.exists) {
          const mData = memberSnap.data() || {};
          trackTokensFromDoc(mData, memberSnap.ref, tokenSet, tokenDocRefs);
          const linkedUid = String(mData.authUid || mData.uid || '').trim();
          if (linkedUid) {
            const uSnap = await db.collection('users').doc(linkedUid).get().catch(() => null);
            if (uSnap?.exists) trackTokensFromDoc(uSnap.data(), uSnap.ref, tokenSet, tokenDocRefs);
          }
        }
        if (tokenSet.size === 0) {
          const uSnap = await db.collection('users').doc(celebrantMemberId).get().catch(() => null);
          if (uSnap?.exists) trackTokensFromDoc(uSnap.data(), uSnap.ref, tokenSet, tokenDocRefs);
        }
      } catch (lookupErr) {
        console.warn(`[LiveCelebrationsBatchedWishes] Token lookup error for ${celebrantMemberId}:`, lookupErr);
      }

      if (tokenSet.size > 0) {
        await doc.ref.update({ fcmTokens: Array.from(tokenSet) }).catch(() => {});
      }
    }

    const tokens = Array.from(tokenSet);
    if (tokens.length === 0 || unnotified <= 0) {
      continue;
    }

    const title =
      total === unnotified
        ? `🎉 ${unnotified} New ${unnotified === 1 ? 'Wish' : 'Wishes'} on Your ${type}`
        : `❤️ ${unnotified} More ${unnotified === 1 ? 'Wish' : 'Wishes'} on Your ${type}`;
    const body =
      total === unnotified
        ? 'Your church family is celebrating with you in Live Celebrations chat!'
        : 'Your church family is sending you blessings in Live Celebrations chat!';

    try {
      const result = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: {
          type: 'LIVE_CELEBRATION',
          screen: 'LiveCelebrationsChat',
          churchId,
          actionButton: 'VIEW WISHES',
          title,
          body,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            title,
            body,
            sound: 'default',
            channelId: 'church_alerts',
            priority: 'max',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { alert: { title, body }, sound: 'default', badge: 1 } },
        },
        tokens,
      });
      console.log(`Batched wishes sent to ${celebrantMemberId}: ${result.successCount} ok, ${result.failureCount} fail`);
      await doc.ref.update({ unnotifiedWishes: 0 });
    } catch (e) {
      console.error(`Failed to send batch notification for ${doc.id}`, e);
    }
  }
}
