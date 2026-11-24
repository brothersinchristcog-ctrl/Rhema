import { onSchedule } from 'firebase-functions/v2/scheduler';
import { DocumentReference, DocumentSnapshot, FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from './constants.js';
import { ensureDefaultPlansSeeded, resolveActiveTierFromProfile, resolveMemberEntitlements } from './entitlements.js';
import {
  areEducationsClose,
  areProfessionsClose,
  canViewerSeeCandidatePhotos,
  evaluateCompatibility,
  normalizeAnyOption,
  normalizeGender,
  toTimestampMs,
} from './matches.js';
import {
  isNotificationPrefEnabled,
  resolveNotificationPhotoUrl,
  sendMatrimonyNotification,
} from './notifications.js';
import {
  getPrefsRef,
  getProfileRef,
  readBlockDocs,
  readShortlistDocs,
  readViewDocs,
} from './store.js';

const NOTIF_STATE_DOC_ID = 'notif_state';

function getNotifStateRef(db: Firestore, uid: string): DocumentReference {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.PRIVATE).doc(NOTIF_STATE_DOC_ID);
}

function getIstDateKey(nowMs = Date.now()): string {
  const istMs = nowMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function getIstWeekKey(nowMs = Date.now()): string {
  const ist = new Date(nowMs + 5.5 * 60 * 60 * 1000);
  const startOfYear = new Date(Date.UTC(ist.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((ist.getTime() - startOfYear.getTime()) / (24 * 3600 * 1000));
  const weekNum = Math.ceil((dayOfYear + startOfYear.getUTCDay() + 1) / 7);
  return `${ist.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function batchGetDocsByRefs(
  db: Firestore,
  refs: DocumentReference[]
): Promise<Map<string, DocumentSnapshot>> {
  const map = new Map<string, DocumentSnapshot>();
  if (refs.length === 0) return map;
  const CHUNK = 200;
  const chunks: DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += CHUNK) {
    chunks.push(refs.slice(i, i + CHUNK));
  }
  const results = await Promise.all(chunks.map((c) => db.getAll(...c)));
  for (const snaps of results) {
    for (const snap of snaps) {
      map.set(snap.ref.path, snap);
    }
  }
  return map;
}

interface ActiveDigestContext {
  activeProfiles: Array<{ uid: string; data: Record<string, any> }>;
  profileByUid: Map<string, Record<string, any>>;
  prefsByUid: Map<string, Record<string, any>>;
  males: Array<{ uid: string; data: Record<string, any> }>;
  females: Array<{ uid: string; data: Record<string, any> }>;
}

async function loadActiveDigestContext(db: Firestore): Promise<ActiveDigestContext> {
  const [approvedSnap, activeBansSnap] = await Promise.all([
    db.collection(COLLECTIONS.PROFILES).where('profileStatus', '==', 'approved').get(),
    db.collection(COLLECTIONS.BANS).where('active', '==', true).get(),
  ]);

  const bannedUids = new Set<string>();
  activeBansSnap.docs.forEach((d) => {
    const data = d.data() || {};
    if (data.source !== 'console_delete') {
      bannedUids.add(d.id);
    }
  });

  const activeProfiles: Array<{ uid: string; data: Record<string, any> }> = [];
  const profileByUid = new Map<string, Record<string, any>>();
  const males: Array<{ uid: string; data: Record<string, any> }> = [];
  const females: Array<{ uid: string; data: Record<string, any> }> = [];

  for (const doc of approvedSnap.docs) {
    const data = doc.data() || {};
    if (data.selfDeactivated === true || bannedUids.has(doc.id)) continue;
    const gender = normalizeGender(data.gender);
    if (!gender) continue;
    const entry = { uid: doc.id, data };
    activeProfiles.push(entry);
    profileByUid.set(doc.id, data);
    if (gender === 'male') males.push(entry);
    else females.push(entry);
  }

  const prefRefs = activeProfiles.map((p) => getPrefsRef(db, p.uid));
  const prefSnapMap = await batchGetDocsByRefs(db, prefRefs);
  const prefsByUid = new Map<string, Record<string, any>>();
  for (const p of activeProfiles) {
    const ref = getPrefsRef(db, p.uid);
    const snap = prefSnapMap.get(ref.path);
    prefsByUid.set(p.uid, snap?.exists ? snap.data() || {} : {});
  }

  return { activeProfiles, profileByUid, prefsByUid, males, females };
}

function getProfileJoinedAtMs(profile: Record<string, any>): number {
  return (
    toTimestampMs(profile.approvedAt) ||
    toTimestampMs(profile.submittedAt) ||
    toTimestampMs(profile.createdAt) ||
    0
  );
}

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    await Promise.allSettled(slice.map((item) => worker(item)));
  }
}

function sharesAttributes(a: Record<string, any>, b: Record<string, any>): boolean {
  if (areProfessionsClose(a.career?.profession || a.career?.occupationCategory, b.career?.profession || b.career?.occupationCategory) !== 'none') {
    return true;
  }
  if (areEducationsClose(a.education?.qualification, b.education?.qualification) !== 'none') {
    return true;
  }
  const aCity = normalizeAnyOption(a.location?.village || a.location?.city);
  const bCity = normalizeAnyOption(b.location?.village || b.location?.city);
  if (aCity !== 'any' && bCity !== 'any' && aCity === bCity) {
    return true;
  }
  const aDenom = normalizeAnyOption(a.faithSummary?.denomination);
  const bDenom = normalizeAnyOption(b.faithSummary?.denomination);
  if (aDenom !== 'any' && bDenom !== 'any' && aDenom === bDenom) {
    return true;
  }
  if (typeof a.age === 'number' && typeof b.age === 'number' && Math.abs(a.age - b.age) <= 2) {
    return true;
  }
  return false;
}

/**
 * Daily Scheduled Matrimony Alerts (08:30 AM IST):
 * - dailyMatches
 * - recentlyJoined
 * - newMatches
 * - dailyRecommendations
 * - similarMatches
 * - basedOnActivity
 */
export const sendDailyMatrimonyMatchNotifications = onSchedule(
  {
    schedule: '30 8 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async () => {
    const db = getFirestore();
    const ctx = await loadActiveDigestContext(db);
    if (ctx.activeProfiles.length < 2) return;

    const nowMs = Date.now();
    const todayKey = getIstDateKey(nowMs);
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    await runInBatches(ctx.activeProfiles, 8, async ({ uid, data: viewer }) => {
      const anyDailyEnabled =
        isNotificationPrefEnabled(viewer, 'dailyMatches') ||
        isNotificationPrefEnabled(viewer, 'recentlyJoined') ||
        isNotificationPrefEnabled(viewer, 'newMatches') ||
        isNotificationPrefEnabled(viewer, 'dailyRecommendations') ||
        isNotificationPrefEnabled(viewer, 'similarMatches') ||
        isNotificationPrefEnabled(viewer, 'basedOnActivity');
      if (!anyDailyEnabled) return;

      const viewerGender = normalizeGender(viewer.gender);
      const pool = viewerGender === 'male' ? ctx.females : ctx.males;
      if (pool.length === 0) return;

      const [
        blocks,
        shortlists,
        views,
        sentSnap,
        recvSnap,
        notifStateSnap,
        viewerEntitlements,
      ] = await Promise.all([
        readBlockDocs(db, uid),
        readShortlistDocs(db, uid),
        readViewDocs(db, uid),
        db.collection(COLLECTIONS.INTERESTS).where('senderUid', '==', uid).get(),
        db.collection(COLLECTIONS.INTERESTS).where('receiverUid', '==', uid).get(),
        getNotifStateRef(db, uid).get(),
        resolveMemberEntitlements(db, uid, viewer),
      ]);

      const blockedSet = new Set(blocks.map((d) => d.id));
      const shortlistedSet = new Set(shortlists.map((d) => d.id));
      const viewedSet = new Set(views.map((d) => d.id));
      const contactedSet = new Set<string>();
      const interestStatusMap = new Map<string, string>();

      sentSnap.docs.forEach((d) => {
        const s = d.data() || {};
        if (s.receiverUid) {
          contactedSet.add(s.receiverUid);
          if (s.status) interestStatusMap.set(s.receiverUid, String(s.status));
        }
      });
      recvSnap.docs.forEach((d) => {
        const r = d.data() || {};
        if (r.senderUid && r.status && !interestStatusMap.has(r.senderUid)) {
          interestStatusMap.set(r.senderUid, String(r.status));
        }
      });

      const viewerPrefs = ctx.prefsByUid.get(uid) || {};
      const compatible: Array<{
        uid: string;
        data: Record<string, any>;
        score: number;
        joinedAtMs: number;
      }> = [];

      for (const cand of pool) {
        if (cand.uid === uid || blockedSet.has(cand.uid)) continue;
        const candPrefs = ctx.prefsByUid.get(cand.uid) || {};
        const evaluation = evaluateCompatibility(
          viewer,
          {},
          viewerPrefs,
          cand.data,
          {},
          candPrefs,
          {},
          'partner_preferences'
        );
        if (!evaluation.eligible) continue;
        compatible.push({
          uid: cand.uid,
          data: cand.data,
          score: evaluation.score,
          joinedAtMs: getProfileJoinedAtMs(cand.data),
        });
      }

      if (compatible.length === 0) return;

      compatible.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.joinedAtMs - a.joinedAtMs;
      });

      const notifState = notifStateSnap.exists ? notifStateSnap.data() || {} : {};
      const stateUpdates: Record<string, any> = {};

      const resolveSafeThumb = async (cand: { uid: string; data: Record<string, any> }) => {
        const canSee = canViewerSeeCandidatePhotos({
          viewerUid: uid,
          candidate: cand.data,
          interestStatus: interestStatusMap.get(cand.uid) || null,
          viewerEntitlements,
        });
        if (!canSee || !cand.data.profilePhoto) return null;
        return resolveNotificationPhotoUrl(String(cand.data.profilePhoto));
      };

      const uncontactedCompatible = compatible.filter((c) => !contactedSet.has(c.uid));

      // 1. Daily Matches
      if (
        isNotificationPrefEnabled(viewer, 'dailyMatches') &&
        notifState.lastDailyMatchesDate !== todayKey
      ) {
        const dailyPool = uncontactedCompatible.length > 0 ? uncontactedCompatible : compatible;
        const topMatch = dailyPool[0];
        if (topMatch) {
          const thumb = await resolveSafeThumb(topMatch);
          await sendMatrimonyNotification({
            db,
            recipientUid: uid,
            recipientProfile: viewer,
            prefKey: 'dailyMatches',
            type: 'DAILY_MATCHES',
            title: 'Your Daily Matches are ready',
            body: "You've got new matches waiting for you! Take a look. 👀",
            imageUrl: thumb,
            tag: 'matrimony_daily_matches',
            data: { count: dailyPool.length, screen: 'MatrimonyMatches' },
          });
          stateUpdates.lastDailyMatchesDate = todayKey;
        }
      }

      // 2. Recently Joined
      if (isNotificationPrefEnabled(viewer, 'recentlyJoined')) {
        const minJoinThreshold = Math.max(
          nowMs - seventyTwoHoursMs,
          Number(notifState.lastRecentlyJoinedMaxJoinMs || 0)
        );
        const recentPool = uncontactedCompatible.filter((c) => c.joinedAtMs > minJoinThreshold);
        recentPool.sort((a, b) => b.joinedAtMs - a.joinedAtMs);
        const topRecent = recentPool[0];
        if (topRecent) {
          const thumb = await resolveSafeThumb(topRecent);
          const body =
            recentPool.length === 1
              ? `${topRecent.data.displayName || 'A Rhema member'} recently joined Rhema Matrimony and matches your preferences.`
              : `${recentPool.length} members matching your preferences recently joined Rhema Matrimony.`;
          await sendMatrimonyNotification({
            db,
            recipientUid: uid,
            recipientProfile: viewer,
            prefKey: 'recentlyJoined',
            type: 'RECENTLY_JOINED',
            title: 'Recently Joined Matches',
            body,
            imageUrl: thumb,
            tag: 'matrimony_recently_joined',
            data: { count: recentPool.length, screen: 'MatrimonyMatches' },
          });
          stateUpdates.lastRecentlyJoinedMaxJoinMs = Math.max(
            ...recentPool.map((r) => r.joinedAtMs)
          );
        }
      }

      // 3. New Matches (Everyday)
      if (
        isNotificationPrefEnabled(viewer, 'newMatches') &&
        notifState.lastNewMatchesDate !== todayKey
      ) {
        const newPool = uncontactedCompatible.filter(
          (c) => !viewedSet.has(c.uid) || c.joinedAtMs >= nowMs - sevenDaysMs
        );
        const topNew = newPool[0];
        if (topNew) {
          const thumb = await resolveSafeThumb(topNew);
          await sendMatrimonyNotification({
            db,
            recipientUid: uid,
            recipientProfile: viewer,
            prefKey: 'newMatches',
            type: 'NEW_MATCHES',
            title: 'New Matches for You',
            body: `${newPool.length} new compatible ${newPool.length === 1 ? 'match is' : 'matches are'} waiting to connect with you.`,
            imageUrl: thumb,
            tag: 'matrimony_new_matches',
            data: { count: newPool.length, screen: 'MatrimonyMatches' },
          });
          stateUpdates.lastNewMatchesDate = todayKey;
        }
      }

      // 4. Daily Recommendations (Everyday)
      if (
        isNotificationPrefEnabled(viewer, 'dailyRecommendations') &&
        notifState.lastDailyRecDate !== todayKey
      ) {
        const recPool = uncontactedCompatible.length > 0 ? uncontactedCompatible : compatible;
        const lastRecUid = String(notifState.lastDailyRecUid || '');
        const chosenRec =
          recPool.find((c) => c.uid !== lastRecUid && !viewedSet.has(c.uid)) ||
          recPool.find((c) => c.uid !== lastRecUid) ||
          recPool[0];
        if (chosenRec) {
          const recCity =
            chosenRec.data.location?.village ||
            chosenRec.data.location?.city ||
            chosenRec.data.location?.state ||
            '';
          const agePart = typeof chosenRec.data.age === 'number' ? `, ${chosenRec.data.age}` : '';
          const cityPart = recCity ? ` from ${recCity}` : '';
          const thumb = await resolveSafeThumb(chosenRec);
          await sendMatrimonyNotification({
            db,
            recipientUid: uid,
            recipientProfile: viewer,
            senderUid: chosenRec.uid,
            prefKey: 'dailyRecommendations',
            type: 'DAILY_RECOMMENDATION',
            title: 'Daily Recommendation',
            body: `Meet ${chosenRec.data.displayName || 'a Rhema member'}${agePart}${cityPart} — selected just for you!`,
            imageUrl: thumb,
            tag: 'matrimony_daily_recommendation',
            data: { targetUid: chosenRec.uid, screen: 'MatrimonyMatches' },
          });
          stateUpdates.lastDailyRecDate = todayKey;
          stateUpdates.lastDailyRecUid = chosenRec.uid;
        }
      }

      // 5. Similar Matches (based on recently contacted members)
      if (
        isNotificationPrefEnabled(viewer, 'similarMatches') &&
        notifState.lastSimilarDate !== todayKey &&
        contactedSet.size > 0
      ) {
        const contactedRefs = Array.from(contactedSet)
          .map((cUid) => ctx.profileByUid.get(cUid))
          .filter((p): p is Record<string, any> => Boolean(p));

        if (contactedRefs.length > 0) {
          const simPool = uncontactedCompatible.filter((cand) =>
            contactedRefs.some((refProfile) => sharesAttributes(cand.data, refProfile))
          );
          const topSim = simPool[0];
          if (topSim) {
            const thumb = await resolveSafeThumb(topSim);
            await sendMatrimonyNotification({
              db,
              recipientUid: uid,
              recipientProfile: viewer,
              prefKey: 'similarMatches',
              type: 'SIMILAR_MATCHES',
              title: 'Similar Matches for You',
              body: `Found ${simPool.length} ${simPool.length === 1 ? 'profile' : 'profiles'} similar to members you contacted recently.`,
              imageUrl: thumb,
              tag: 'matrimony_similar_matches',
              data: { count: simPool.length, screen: 'MatrimonyMatches' },
            });
            stateUpdates.lastSimilarDate = todayKey;
          }
        }
      }

      // 6. Based on your activity (shortlists + views)
      if (
        isNotificationPrefEnabled(viewer, 'basedOnActivity') &&
        notifState.lastActivityDate !== todayKey &&
        (shortlistedSet.size > 0 || viewedSet.size > 0)
      ) {
        const activityUids = new Set<string>([...shortlistedSet, ...viewedSet]);
        const activityRefs = Array.from(activityUids)
          .map((aUid) => ctx.profileByUid.get(aUid))
          .filter((p): p is Record<string, any> => Boolean(p));

        if (activityRefs.length > 0) {
          const actPool = uncontactedCompatible.filter(
            (cand) =>
              !shortlistedSet.has(cand.uid) &&
              !viewedSet.has(cand.uid) &&
              activityRefs.some((refProfile) => sharesAttributes(cand.data, refProfile))
          );
          const topAct = actPool[0];
          if (topAct) {
            const thumb = await resolveSafeThumb(topAct);
            await sendMatrimonyNotification({
              db,
              recipientUid: uid,
              recipientProfile: viewer,
              prefKey: 'basedOnActivity',
              type: 'BASED_ON_ACTIVITY',
              title: 'Matches Based on Your Activity',
              body: `${topAct.data.displayName || 'New profile'}${actPool.length > 1 ? ` and ${actPool.length - 1} others` : ''} match profiles you liked!`,
              imageUrl: thumb,
              tag: 'matrimony_activity_matches',
              data: { count: actPool.length, screen: 'MatrimonyMatches' },
            });
            stateUpdates.lastActivityDate = todayKey;
          }
        }
      }

      if (Object.keys(stateUpdates).length > 0) {
        await getNotifStateRef(db, uid).set(
          { ...stateUpdates, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    });
  }
);

/**
 * Weekly Scheduled Matrimony Alerts (Sundays 09:00 AM IST):
 * - cityMatches
 * - photoMatches
 * - membershipOffers
 */
export const sendWeeklyMatrimonyDigestNotifications = onSchedule(
  {
    schedule: '0 9 * * 0',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async () => {
    const db = getFirestore();
    const [ctx, plans] = await Promise.all([
      loadActiveDigestContext(db),
      ensureDefaultPlansSeeded(db),
    ]);
    if (ctx.activeProfiles.length === 0) return;

    const nowMs = Date.now();
    const weekKey = getIstWeekKey(nowMs);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const bestDiscount = plans
      .filter((p) => p.isActive !== false && typeof p.discountPercentage === 'number')
      .reduce((max, p) => Math.max(max, p.discountPercentage || 0), 0);

    await runInBatches(ctx.activeProfiles, 8, async ({ uid, data: viewer }) => {
      const wantCity = isNotificationPrefEnabled(viewer, 'cityMatches');
      const wantPhoto = isNotificationPrefEnabled(viewer, 'photoMatches');
      const wantOffers = isNotificationPrefEnabled(viewer, 'membershipOffers');
      if (!wantCity && !wantPhoto && !wantOffers) return;

      const viewerGender = normalizeGender(viewer.gender);
      const pool = viewerGender === 'male' ? ctx.females : ctx.males;
      const viewerPrefs = ctx.prefsByUid.get(uid) || {};

      const [blocks, notifStateSnap, viewerEntitlements] = await Promise.all([
        readBlockDocs(db, uid),
        getNotifStateRef(db, uid).get(),
        resolveMemberEntitlements(db, uid, viewer),
      ]);

      const blockedSet = new Set(blocks.map((d) => d.id));
      const notifState = notifStateSnap.exists ? notifStateSnap.data() || {} : {};
      const stateUpdates: Record<string, any> = {};

      const compatible: Array<{ uid: string; data: Record<string, any>; score: number }> = [];
      if (wantCity || wantPhoto) {
        for (const cand of pool) {
          if (cand.uid === uid || blockedSet.has(cand.uid)) continue;
          const candPrefs = ctx.prefsByUid.get(cand.uid) || {};
          const evaluation = evaluateCompatibility(
            viewer,
            {},
            viewerPrefs,
            cand.data,
            {},
            candPrefs,
            {},
            'partner_preferences'
          );
          if (!evaluation.eligible) continue;
          compatible.push({ uid: cand.uid, data: cand.data, score: evaluation.score });
        }
        compatible.sort((a, b) => b.score - a.score);
      }

      // 1. City Matches (Weekly)
      if (wantCity && notifState.lastCityMatchesWeek !== weekKey && compatible.length > 0) {
        const viewerCityRaw = String(viewer.location?.village || viewer.location?.city || '').trim();
        const viewerCityNorm = normalizeAnyOption(viewerCityRaw);
        const viewerStateRaw = String(viewer.location?.state || '').trim();
        const viewerStateNorm = normalizeAnyOption(viewerStateRaw);

        const cityPool =
          viewerCityNorm !== 'any'
            ? compatible.filter(
                (c) =>
                  normalizeAnyOption(c.data.location?.village || c.data.location?.city) ===
                  viewerCityNorm
              )
            : viewerStateNorm !== 'any'
              ? compatible.filter(
                  (c) => normalizeAnyOption(c.data.location?.state) === viewerStateNorm
                )
              : [];

        const topCity = cityPool[0];
        if (topCity) {
          const areaLabel = viewerCityRaw || viewerStateRaw || 'your city';
          const canSee = canViewerSeeCandidatePhotos({
            viewerUid: uid,
            candidate: topCity.data,
            interestStatus: null,
            viewerEntitlements,
          });
          const thumb =
            canSee && topCity.data.profilePhoto
              ? await resolveNotificationPhotoUrl(String(topCity.data.profilePhoto))
              : null;

          await sendMatrimonyNotification({
            db,
            recipientUid: uid,
            recipientProfile: viewer,
            prefKey: 'cityMatches',
            type: 'CITY_MATCHES',
            title: 'Weekly City Matches',
            body: `${cityPool.length} compatible ${cityPool.length === 1 ? 'match' : 'matches'} living in ${areaLabel} waiting to connect.`,
            imageUrl: thumb,
            tag: 'matrimony_city_matches',
            data: { count: cityPool.length, screen: 'MatrimonyMatches' },
          });
          stateUpdates.lastCityMatchesWeek = weekKey;
        }
      }

      // 2. Photo Matches (Weekly)
      if (wantPhoto && notifState.lastPhotoMatchesWeek !== weekKey && compatible.length > 0) {
        const photoPool = compatible.filter((c) => {
          if (!c.data.profilePhoto) return false;
          const canSee = canViewerSeeCandidatePhotos({
            viewerUid: uid,
            candidate: c.data,
            interestStatus: null,
            viewerEntitlements,
          });
          if (!canSee) return false;
          const photoTs =
            toTimestampMs(c.data.photoUpdatedAt) ||
            toTimestampMs(c.data.updatedAt) ||
            getProfileJoinedAtMs(c.data);
          return photoTs >= nowMs - sevenDaysMs;
        });

        const topPhoto = photoPool[0];
        if (topPhoto) {
          const thumb = await resolveNotificationPhotoUrl(String(topPhoto.data.profilePhoto));
          await sendMatrimonyNotification({
            db,
            recipientUid: uid,
            recipientProfile: viewer,
            prefKey: 'photoMatches',
            type: 'PHOTO_MATCHES',
            title: 'Matches with New Photos',
            body: `${photoPool.length} matching ${photoPool.length === 1 ? 'member' : 'members'} recently added profile photos.`,
            imageUrl: thumb,
            tag: 'matrimony_photo_matches',
            data: { count: photoPool.length, screen: 'MatrimonyMatches' },
          });
          stateUpdates.lastPhotoMatchesWeek = weekKey;
        }
      }

      // 3. Membership Offers (Weekly for Free or soon-to-expire members)
      if (wantOffers && notifState.lastOffersWeek !== weekKey) {
        const tier = resolveActiveTierFromProfile(viewer);
        const expiryMs = viewerEntitlements.expiryDateMs || 0;
        const expiringSoon =
          tier !== 'free' && expiryMs > nowMs && expiryMs - nowMs <= sevenDaysMs;

        if (tier === 'free' || expiringSoon) {
          const title = expiringSoon
            ? 'Renew Your Matrimony Membership'
            : 'Matrimony Membership Offers';
          const body = expiringSoon
            ? `Your ${viewerEntitlements.planName} plan expires soon — renew now to keep direct contact & chat access!`
            : bestDiscount > 0
              ? `Save up to ${bestDiscount}% on Silver, Gold & Platinum plans — unlock direct contacts & chat!`
              : `Upgrade to Silver, Gold or Platinum to unlock direct contacts, chat & priority visibility!`;

          await sendMatrimonyNotification({
            db,
            recipientUid: uid,
            recipientProfile: viewer,
            prefKey: 'membershipOffers',
            type: 'MEMBERSHIP_OFFERS',
            title,
            body,
            tag: 'matrimony_membership_offers',
            data: { screen: 'MatrimonyUpgrade' },
          });
          stateUpdates.lastOffersWeek = weekKey;
        }
      }

      if (Object.keys(stateUpdates).length > 0) {
        await getNotifStateRef(db, uid).set(
          { ...stateUpdates, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    });
  }
);
