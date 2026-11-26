import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import axios from 'axios';
import { assertAdminModulePermission } from './adminPermissions.js';
const getDb = () => getFirestore();
let cachedZoomToken = null;
/**
 * Build a high-priority FCM payload for online meeting alerts
 * targeting Android's 'church_alerts' channel and iOS APNs alerts.
 */
export function buildOnlineMeetingTopicMessage({ title, body, churchId, meetingId, notificationType = 'online_meeting', provider = '', url = '', password = '', date = '', startTimeLabel = '', endTimeLabel = '', teacherName = '', topic = '', bibleBook = '', }) {
    const safeTitle = String(title || '');
    const safeBody = String(body || '');
    const safePassword = password ? String(password) : '';
    return {
        notification: {
            title: safeTitle,
            body: safeBody,
        },
        data: {
            type: notificationType,
            id: String(meetingId),
            meetingId: String(meetingId),
            churchId: String(churchId),
            provider: String(provider || ''),
            url: String(url || ''),
            screen: 'OnlineMeetingDetail',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            ...(safePassword ? { password: safePassword } : {}),
            ...(date ? { date: String(date) } : {}),
            ...(startTimeLabel ? { startTimeLabel: String(startTimeLabel) } : {}),
            ...(endTimeLabel ? { endTimeLabel: String(endTimeLabel) } : {}),
            ...(teacherName ? { teacherName: String(teacherName) } : {}),
            ...(topic ? { topic: String(topic) } : {}),
            ...(bibleBook ? { bibleBook: String(bibleBook) } : {}),
            title: safeTitle,
            body: safeBody,
            channelId: 'church_alerts',
            sound: 'default',
            priority: 'high',
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'church_alerts',
                sound: 'default',
                priority: 'max',
                defaultSound: true,
                defaultVibrateTimings: true,
                visibility: 'public',
            },
        },
        apns: {
            headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert',
            },
            payload: {
                aps: {
                    alert: {
                        title: safeTitle,
                        body: safeBody,
                    },
                    sound: 'default',
                    badge: 1,
                },
            },
        },
        topic: `church_${churchId}`,
    };
}
function collectTokensFromSnapshot(snap, tokenSet) {
    if (!snap)
        return;
    snap.forEach((doc) => {
        const d = doc.data();
        if (!d)
            return;
        if (d.fcmToken && typeof d.fcmToken === 'string' && d.fcmToken.trim().length > 10) {
            tokenSet.add(d.fcmToken.trim());
        }
        if (Array.isArray(d.fcmTokens)) {
            d.fcmTokens.forEach((tk) => {
                if (typeof tk === 'string' && tk.trim().length > 10) {
                    tokenSet.add(tk.trim());
                }
            });
        }
    });
}
async function collectChurchMemberTokens(db, churchId) {
    const tokenSet = new Set();
    const [rhemaMembersRes, legacyMembersRes, usersRes] = await Promise.allSettled([
        db.collection('Rhema Church').doc(churchId).collection('members').get(),
        db.collection('churches').doc(churchId).collection('members').get(),
        db.collection('users').get(),
    ]);
    if (rhemaMembersRes.status === 'fulfilled') {
        collectTokensFromSnapshot(rhemaMembersRes.value, tokenSet);
    }
    if (legacyMembersRes.status === 'fulfilled') {
        collectTokensFromSnapshot(legacyMembersRes.value, tokenSet);
    }
    if (usersRes.status === 'fulfilled' && usersRes.value) {
        usersRes.value.forEach((doc) => {
            const u = doc.data();
            if (!u)
                return;
            const uChurch = normalizeChurchId(u.primaryChurchId || u.churchId || 'rhema');
            if (uChurch !== churchId)
                return;
            if (u.fcmToken && typeof u.fcmToken === 'string' && u.fcmToken.trim().length > 10) {
                tokenSet.add(u.fcmToken.trim());
            }
            if (Array.isArray(u.fcmTokens)) {
                u.fcmTokens.forEach((tk) => {
                    if (typeof tk === 'string' && tk.trim().length > 10) {
                        tokenSet.add(tk.trim());
                    }
                });
            }
        });
    }
    return Array.from(tokenSet);
}
async function dispatchOnlineMeetingAlert({ db, churchId, meetingId, notifDocId, eventKind, meetingData, }) {
    const title = String(meetingData.title || 'Online Meeting').trim();
    const provider = String(meetingData.provider || meetingData.meetingType || 'google_meet');
    const providerLabel = provider === 'google_meet' ? 'Google Meet' : 'Zoom Meeting';
    const meetingLink = String(meetingData.meetingLink || meetingData.meetingUrl || meetingData.url || '').trim();
    const teacherName = String(meetingData.teacherName || meetingData.teacher || '').trim();
    const date = String(meetingData.date || meetingData.scheduledDate || '').trim();
    const startTimeLabel = String(meetingData.startTimeLabel || '').trim();
    const endTimeLabel = String(meetingData.endTimeLabel || '').trim();
    const topic = String(meetingData.topic || '').trim();
    const bibleBook = String(meetingData.bibleBook || '').trim();
    const password = String(meetingData.password || '').trim();
    const timeRange = startTimeLabel && endTimeLabel
        ? `${startTimeLabel} - ${endTimeLabel}`
        : startTimeLabel;
    let pushTitle = '';
    let pushBody = '';
    if (eventKind === 'scheduled') {
        pushTitle = `New Meeting Scheduled: ${title}`;
        const detailParts = [
            providerLabel,
            date ? `on ${date}` : '',
            timeRange ? `at ${timeRange}` : '',
            teacherName ? `Host: ${teacherName}` : '',
            topic || bibleBook || '',
        ].filter(Boolean);
        pushBody = `${detailParts.join(' • ')}. Tap to view meeting details.`;
    }
    else {
        pushTitle = `🔴 Live Now: ${title}`;
        const liveParts = [
            providerLabel,
            teacherName ? `hosted by ${teacherName}` : '',
            'is now live',
        ].filter(Boolean);
        pushBody = `${liveParts.join(' ')}! Tap to join the live meeting.`;
    }
    const notificationType = eventKind === 'live' ? 'online_meeting' : 'online_meeting_scheduled';
    // Persist deterministic in-app notification docs so Member View -> Notifications
    // shows both Scheduled & Live alerts cleanly without duplicate entries or duplicate push triggers.
    const churchRef = db.collection('Rhema Church').doc(churchId);
    const notifRef = churchRef.collection('notifications').doc(notifDocId);
    const bcastRef = churchRef.collection('broadcasts').doc(notifDocId);
    const inAppPayload = {
        id: notifDocId,
        meetingId,
        churchId,
        type: notificationType,
        eventKind,
        title: pushTitle,
        body: pushBody,
        content: pushBody,
        provider,
        meetingType: provider,
        url: meetingLink,
        meetingLink,
        date,
        startTimeLabel,
        endTimeLabel,
        teacherName,
        topic,
        bibleBook,
        password,
        status: eventKind === 'live' ? 'live' : 'scheduled',
        screen: 'OnlineMeetingDetail',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
    };
    let inAppWritten = false;
    try {
        const existingNotifSnap = await notifRef.get();
        if (!existingNotifSnap.exists) {
            await Promise.all([
                notifRef.set(inAppPayload, { merge: true }),
                bcastRef.set({ ...inAppPayload, silent: true }, { merge: true }),
            ]);
            inAppWritten = true;
        }
        else {
            inAppWritten = true;
        }
    }
    catch (inAppErr) {
        console.warn('[dispatchOnlineMeetingAlert] In-app notification write warning:', inAppErr?.message || inAppErr);
    }
    const payload = buildOnlineMeetingTopicMessage({
        title: pushTitle,
        body: pushBody,
        churchId,
        meetingId,
        notificationType,
        provider,
        url: meetingLink,
        password,
        date,
        startTimeLabel,
        endTimeLabel,
        teacherName,
        topic,
        bibleBook,
    });
    let pushSent = false;
    try {
        const tokens = await collectChurchMemberTokens(db, churchId);
        if (tokens.length > 0) {
            const { topic: _omitTopic, ...multicastBase } = payload;
            for (let i = 0; i < tokens.length; i += 500) {
                const batch = tokens.slice(i, i + 500);
                const res = await getMessaging().sendEachForMulticast({
                    ...multicastBase,
                    tokens: batch,
                });
                if (res.successCount > 0) {
                    pushSent = true;
                }
            }
        }
        else {
            await getMessaging().send(payload);
            pushSent = true;
        }
    }
    catch (pushErr) {
        console.warn('[dispatchOnlineMeetingAlert] FCM push warning:', pushErr?.message || pushErr);
    }
    return { pushSent, inAppWritten };
}
/**
 * Helper: Acquire Server-to-Server OAuth access token from Zoom
 */
export async function getZoomServerToServerToken() {
    const accountId = process.env.ZOOM_ACCOUNT_ID?.trim();
    const clientId = process.env.ZOOM_CLIENT_ID?.trim();
    const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
    if (!accountId || !clientId || !clientSecret) {
        throw new Error('Zoom Server-to-Server credentials missing in backend environment. Please set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET in functions/.env.');
    }
    // Check in-memory cached token (with 60-second buffer)
    if (cachedZoomToken && Date.now() < cachedZoomToken.expiresAt - 60000) {
        return cachedZoomToken.token;
    }
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;
    const response = await axios.post(tokenUrl, null, {
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    const { access_token, expires_in } = response.data;
    if (!access_token) {
        throw new Error('Failed to obtain access token from Zoom OAuth.');
    }
    cachedZoomToken = {
        token: access_token,
        expiresAt: Date.now() + (expires_in || 3600) * 1000,
    };
    return access_token;
}
export function extractZoomUserId(accessToken) {
    try {
        const parts = accessToken.split('.');
        if (parts.length >= 2 && parts[1]) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload && payload.uid)
                return payload.uid;
        }
    }
    catch {
        // fallback
    }
    return 'me';
}
async function scheduleZoomMeetingOnApi(params) {
    const accessToken = await getZoomServerToServerToken();
    const userId = extractZoomUserId(accessToken);
    const startDt = params.startTime ? new Date(params.startTime) : new Date();
    let durationMinutes = Number(params.duration) || 0;
    if (!durationMinutes) {
        const endDt = params.endTime
            ? new Date(params.endTime)
            : new Date(startDt.getTime() + 60 * 60 * 1000);
        durationMinutes = Math.max(15, Math.round((endDt.getTime() - startDt.getTime()) / 60000));
    }
    const response = await axios.post(`https://api.zoom.us/v2/users/${userId}/meetings`, {
        topic: params.topic,
        agenda: params.description || '',
        type: 2, // Scheduled meeting
        start_time: startDt.toISOString(),
        duration: Math.max(15, durationMinutes),
        timezone: 'UTC',
        password: String(params.password || Math.floor(100000 + Math.random() * 900000)),
        settings: {
            host_video: true,
            participant_video: true,
            join_before_host: true,
            mute_upon_entry: true,
            waiting_room: false,
            approval_type: 0,
        },
    }, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });
    const meetingData = response.data;
    return {
        success: true,
        meetingId: String(meetingData.id),
        meetingUrl: meetingData.join_url,
        meetingUri: meetingData.join_url,
        password: meetingData.password || '',
        startUrl: meetingData.start_url || '',
    };
}
/**
 * 📹 GENERATE ZOOM MEETING LINK (Callable Function in asia-south1)
 * Called by AdminZoomMeetingsCreate.tsx when tapping "+ Generate Zoom Meet Link".
 */
export const generateZoomMeetingLink = onCall({ region: 'asia-south1', cors: true, invoker: 'public' }, async (request) => {
    const churchId = String(request.data?.churchId || 'rhema').trim() || 'rhema';
    await assertAdminModulePermission(getDb(), request.auth, churchId, 'online_meetings');
    const { topic, title, description, startTime, endTime, duration, password } = request.data || {};
    const resolvedTopic = String(topic || title || 'Church Online Meeting').trim();
    try {
        return await scheduleZoomMeetingOnApi({
            topic: resolvedTopic,
            description,
            startTime,
            endTime,
            duration,
            password,
        });
    }
    catch (err) {
        console.error('[generateZoomMeetingLink] Error:', err?.response?.data || err?.message || err);
        const msg = err?.response?.data?.message ||
            err?.message ||
            'Failed to generate Zoom meeting link via Zoom API';
        throw new HttpsError('internal', msg);
    }
});
function normalizeChurchId(raw) {
    const clean = String(raw || 'rhema').trim();
    return !clean || clean === 'default' ? 'rhema' : clean;
}
function buildMeetingPayload(data, churchId) {
    const title = String(data.title || '').trim();
    const meetingLink = String(data.meetingLink || '').trim();
    if (!title || !meetingLink) {
        throw new HttpsError('invalid-argument', 'Title and meeting link are required.');
    }
    const startMs = typeof data.startTimestamp === 'number' && !isNaN(data.startTimestamp)
        ? data.startTimestamp
        : Date.now();
    const endMs = typeof data.endTimestamp === 'number' &&
        !isNaN(data.endTimestamp) &&
        data.endTimestamp > startMs
        ? data.endTimestamp
        : startMs + 60 * 60 * 1000;
    // Convert DD-MM-YYYY -> YYYY-MM-DD when provided for scheduledDate sorting
    let scheduledDate;
    if (typeof data.date === 'string' && data.date.includes('-')) {
        const parts = data.date.trim().split('-');
        const yearPart = parts[2];
        if (parts.length === 3 && yearPart && yearPart.length === 4) {
            scheduledDate = `${yearPart}-${parts[1]}-${parts[0]}`;
        }
    }
    return {
        churchId,
        title,
        topic: String(data.topic || ''),
        description: String(data.topic || ''),
        bibleBook: String(data.bibleBook || ''),
        date: String(data.date || ''),
        scheduledDate: scheduledDate || new Date(startMs).toISOString().split('T')[0],
        startTimeLabel: String(data.startTime || ''),
        endTimeLabel: String(data.endTime || ''),
        startTime: Timestamp.fromMillis(startMs),
        endTime: Timestamp.fromMillis(endMs),
        teacherId: String(data.teacherId || 'admin'),
        teacherName: String(data.teacherName || 'Church Admin'),
        meetingLink,
        meetingUrl: meetingLink,
        url: meetingLink,
        provider: String(data.provider || 'zoom'),
        meetingType: String(data.meetingType || data.provider || 'zoom'),
        recurrence: String(data.recurrence || 'NONE'),
        ...(data.meetingId ? { meetingId: String(data.meetingId).trim() } : {}),
        ...(data.password ? { password: String(data.password).trim() } : {}),
    };
}
async function assertMeetingAdmin(auth, churchId) {
    await assertAdminModulePermission(getDb(), auth, churchId, 'online_meetings');
}
/**
 * 📅 CREATE ONLINE MEETING / BIBLE CLASS & NOTIFY MEMBERS (asia-south1)
 * Called by AdminZoomMeetingsCreate.tsx for both Google Meet and Zoom meetings.
 */
export const createBibleClass = onCall({ region: 'asia-south1', cors: true, invoker: 'public' }, async (request) => {
    const data = request.data || {};
    const churchId = normalizeChurchId(data.churchId);
    await assertMeetingAdmin(request.auth, churchId);
    const baseFields = buildMeetingPayload(data, churchId);
    try {
        const db = getDb();
        const meetingRef = db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('online_meetings')
            .doc();
        const meetingDoc = {
            id: meetingRef.id,
            ...baseFields,
            status: 'scheduled',
            scheduledNotified: true,
            scheduledNotifiedAt: FieldValue.serverTimestamp(),
            liveNotified: false,
            reminderNotified: false,
            notificationSent: false,
            notificationSentAt: null,
            createdAt: FieldValue.serverTimestamp(),
        };
        // Save for Member screens (Rhema Church/{churchId}/online_meetings)
        // and Admin Online Meetings dashboard (churches/default/online_meetings).
        // Send only the Scheduled alert here; Live notification is triggered strictly by startBibleClass.
        await Promise.all([
            meetingRef.set(meetingDoc),
            db.collection('churches').doc('default').collection('online_meetings').doc(meetingRef.id).set(meetingDoc),
        ]);
        const { pushSent } = await dispatchOnlineMeetingAlert({
            db,
            churchId,
            meetingId: meetingRef.id,
            notifDocId: `meeting_sched_${meetingRef.id}`,
            eventKind: 'scheduled',
            meetingData: meetingDoc,
        });
        return {
            success: true,
            id: meetingRef.id,
            scheduledNotified: pushSent,
        };
    }
    catch (err) {
        if (err instanceof HttpsError)
            throw err;
        console.error('[createBibleClass] Error:', err);
        throw new HttpsError('internal', err?.message || 'Failed to schedule meeting.');
    }
});
/**
 * 🔴 START ONLINE MEETING LIVE & NOTIFY MEMBERS (asia-south1)
 * Transitions meeting status to 'live' and sends member push notifications once.
 */
export const startBibleClass = onCall({ region: 'asia-south1', cors: true, invoker: 'public' }, async (request) => {
    const data = request.data || {};
    const churchId = normalizeChurchId(data.churchId);
    const meetingId = String(data.meetingId || data.id || '').trim();
    if (!meetingId) {
        throw new HttpsError('invalid-argument', 'Meeting ID is required.');
    }
    await assertMeetingAdmin(request.auth, churchId);
    try {
        const db = getDb();
        const memberRef = db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('online_meetings')
            .doc(meetingId);
        const adminRef = db
            .collection('churches')
            .doc('default')
            .collection('online_meetings')
            .doc(meetingId);
        const txResult = await db.runTransaction(async (tx) => {
            const [memberSnap, adminSnap] = await Promise.all([
                tx.get(memberRef),
                tx.get(adminRef),
            ]);
            const existingData = memberSnap.exists
                ? memberSnap.data()
                : adminSnap.exists
                    ? adminSnap.data()
                    : null;
            if (!existingData) {
                throw new HttpsError('not-found', 'Meeting not found.');
            }
            const shouldSendLiveAlert = existingData.liveNotified !== true;
            const livePatch = {
                ...existingData,
                id: meetingId,
                churchId,
                status: 'live',
                liveNotified: true,
                notificationSent: true,
                notificationSentAt: FieldValue.serverTimestamp(),
                startedAt: FieldValue.serverTimestamp(),
                startedBy: request.auth?.uid || 'admin',
                updatedAt: FieldValue.serverTimestamp(),
            };
            tx.set(memberRef, livePatch, { merge: true });
            return { existingData, livePatch, shouldSendLiveAlert };
        });
        await adminRef.set(txResult.livePatch, { merge: true });
        let pushSent = false;
        if (txResult.shouldSendLiveAlert) {
            const dispatchRes = await dispatchOnlineMeetingAlert({
                db,
                churchId,
                meetingId,
                notifDocId: `meeting_live_${meetingId}`,
                eventKind: 'live',
                meetingData: txResult.livePatch,
            });
            pushSent = dispatchRes.pushSent;
        }
        return {
            success: true,
            id: meetingId,
            status: 'live',
            pushSent,
        };
    }
    catch (err) {
        if (err instanceof HttpsError)
            throw err;
        console.error('[startBibleClass] Error:', err);
        throw new HttpsError('internal', err?.message || 'Failed to start meeting live.');
    }
});
/**
 * ⏹️ END ONLINE MEETING (asia-south1)
 * Marks a live or scheduled meeting as 'completed' without sending notifications.
 */
export const endBibleClass = onCall({ region: 'asia-south1', cors: true, invoker: 'public' }, async (request) => {
    const data = request.data || {};
    const churchId = normalizeChurchId(data.churchId);
    const meetingId = String(data.meetingId || data.id || '').trim();
    if (!meetingId) {
        throw new HttpsError('invalid-argument', 'Meeting ID is required.');
    }
    await assertMeetingAdmin(request.auth, churchId);
    try {
        const db = getDb();
        const endPatch = {
            status: 'completed',
            endedAt: FieldValue.serverTimestamp(),
            endedBy: request.auth?.uid || 'admin',
            updatedAt: FieldValue.serverTimestamp(),
        };
        await Promise.all([
            db
                .collection('Rhema Church')
                .doc(churchId)
                .collection('online_meetings')
                .doc(meetingId)
                .set(endPatch, { merge: true }),
            db
                .collection('churches')
                .doc('default')
                .collection('online_meetings')
                .doc(meetingId)
                .set(endPatch, { merge: true }),
        ]);
        return {
            success: true,
            id: meetingId,
            status: 'completed',
        };
    }
    catch (err) {
        if (err instanceof HttpsError)
            throw err;
        console.error('[endBibleClass] Error:', err);
        throw new HttpsError('internal', err?.message || 'Failed to end meeting.');
    }
});
/**
 * ✏️ UPDATE ONLINE MEETING / BIBLE CLASS (asia-south1)
 * Updates both member-facing and admin dashboard collections atomically.
 */
export const updateBibleClass = onCall({ region: 'asia-south1', cors: true, invoker: 'public' }, async (request) => {
    const data = request.data || {};
    const churchId = normalizeChurchId(data.churchId);
    const meetingId = String(data.meetingId || data.id || '').trim();
    if (!meetingId) {
        throw new HttpsError('invalid-argument', 'Meeting ID is required.');
    }
    await assertMeetingAdmin(request.auth, churchId);
    const baseFields = buildMeetingPayload(data, churchId);
    try {
        const db = getDb();
        const updateDoc = {
            id: meetingId,
            ...baseFields,
            updatedAt: FieldValue.serverTimestamp(),
        };
        await Promise.all([
            db
                .collection('Rhema Church')
                .doc(churchId)
                .collection('online_meetings')
                .doc(meetingId)
                .set(updateDoc, { merge: true }),
            db
                .collection('churches')
                .doc('default')
                .collection('online_meetings')
                .doc(meetingId)
                .set(updateDoc, { merge: true }),
        ]);
        return {
            success: true,
            id: meetingId,
        };
    }
    catch (err) {
        if (err instanceof HttpsError)
            throw err;
        console.error('[updateBibleClass] Error:', err);
        throw new HttpsError('internal', err?.message || 'Failed to update meeting.');
    }
});
/**
 * 🗑️ DELETE ONLINE MEETING / BIBLE CLASS (asia-south1)
 */
export const deleteBibleClass = onCall({ region: 'asia-south1', cors: true, invoker: 'public' }, async (request) => {
    const data = request.data || {};
    const churchId = normalizeChurchId(data.churchId);
    const meetingId = String(data.meetingId || data.id || '').trim();
    if (!meetingId) {
        throw new HttpsError('invalid-argument', 'Meeting ID is required.');
    }
    await assertMeetingAdmin(request.auth, churchId);
    try {
        const db = getDb();
        await Promise.all([
            db.collection('Rhema Church').doc(churchId).collection('online_meetings').doc(meetingId).delete(),
            db.collection('churches').doc('default').collection('online_meetings').doc(meetingId).delete(),
        ]);
        return { success: true, id: meetingId };
    }
    catch (err) {
        if (err instanceof HttpsError)
            throw err;
        console.error('[deleteBibleClass] Error:', err);
        throw new HttpsError('internal', err?.message || 'Failed to delete meeting.');
    }
});
//# sourceMappingURL=meetings.js.map