import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import axios from 'axios';
const getDb = () => getFirestore();
let cachedZoomToken = null;
/**
 * Build a high-priority FCM topic message for online meeting alerts
 * targeting Android's 'church_alerts' channel and iOS APNs alerts.
 */
export function buildOnlineMeetingTopicMessage({ title, body, churchId, meetingId, provider = '', url = '', password = '', }) {
    const safeTitle = String(title || '');
    const safeBody = String(body || '');
    const safePassword = password ? String(password) : '';
    return {
        notification: {
            title: safeTitle,
            body: safeBody,
        },
        data: {
            type: 'online_meeting',
            id: String(meetingId),
            meetingId: String(meetingId),
            churchId: String(churchId),
            provider: String(provider || ''),
            url: String(url || ''),
            ...(safePassword ? { password: safePassword } : {}),
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
    };
}
async function assertMeetingAdmin(uid, churchId) {
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const db = getDb();
    const [platformSnap, memberSnap] = await Promise.all([
        db.collection('platform_admins').doc(uid).get(),
        db.collection('Rhema Church').doc(churchId).collection('members').doc(uid).get(),
    ]);
    if (platformSnap.exists && platformSnap.data()?.superadmin === true) {
        return;
    }
    const roleStr = String(memberSnap.data()?.userType || memberSnap.data()?.role || '').toUpperCase();
    if (memberSnap.exists &&
        (roleStr.includes('ADMIN') || roleStr.includes('PASTOR') || roleStr.includes('SUPER'))) {
        return;
    }
    throw new HttpsError('permission-denied', 'Only church admins or pastors can manage meetings.');
}
/**
 * 📅 CREATE ONLINE MEETING / BIBLE CLASS & NOTIFY MEMBERS (asia-south1)
 * Called by AdminZoomMeetingsCreate.tsx for both Google Meet and Zoom meetings.
 */
export const createBibleClass = onCall({ region: 'asia-south1', cors: true, invoker: 'public' }, async (request) => {
    const data = request.data || {};
    const churchId = normalizeChurchId(data.churchId);
    await assertMeetingAdmin(request.auth?.uid, churchId);
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
            liveNotified: false,
            reminderNotified: false,
            notificationSent: false,
            notificationSentAt: null,
            createdAt: FieldValue.serverTimestamp(),
        };
        // Save for Member screens (Rhema Church/{churchId}/online_meetings)
        // and Admin Online Meetings dashboard (churches/default/online_meetings).
        // Notifications are NOT sent on creation; they are sent only when an admin starts the meeting live.
        await Promise.all([
            meetingRef.set(meetingDoc),
            db.collection('churches').doc('default').collection('online_meetings').doc(meetingRef.id).set(meetingDoc),
        ]);
        return {
            success: true,
            id: meetingRef.id,
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
    await assertMeetingAdmin(request.auth?.uid, churchId);
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
        const [memberSnap, adminSnap] = await Promise.all([memberRef.get(), adminRef.get()]);
        const existingData = memberSnap.exists ? memberSnap.data() : adminSnap.exists ? adminSnap.data() : null;
        if (!existingData) {
            throw new HttpsError('not-found', 'Meeting not found.');
        }
        const alreadyNotified = existingData.status === 'live' && existingData.liveNotified === true;
        const title = String(existingData.title || 'Online Meeting').trim();
        const provider = String(existingData.provider || existingData.meetingType || 'google_meet');
        const meetingLink = String(existingData.meetingLink || existingData.meetingUrl || existingData.url || '').trim();
        const teacherName = String(existingData.teacherName || existingData.teacher || '').trim();
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
        await Promise.all([
            memberRef.set(livePatch, { merge: true }),
            adminRef.set(livePatch, { merge: true }),
        ]);
        let pushSent = false;
        if (!alreadyNotified) {
            try {
                const providerLabel = provider === 'google_meet' ? 'Google Meet' : 'Zoom Meeting';
                const pushTitle = `🔴 Live Now: ${title}`;
                const pushBody = teacherName
                    ? `${providerLabel} started by ${teacherName}. Tap to join live.`
                    : `${providerLabel} is now live. Tap to join now.`;
                await getMessaging().send(buildOnlineMeetingTopicMessage({
                    title: pushTitle,
                    body: pushBody,
                    churchId,
                    meetingId,
                    provider,
                    url: meetingLink,
                    password: String(existingData.password || ''),
                }));
                pushSent = true;
            }
            catch (pushErr) {
                console.warn('[startBibleClass] FCM topic push warning:', pushErr?.message || pushErr);
            }
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
    await assertMeetingAdmin(request.auth?.uid, churchId);
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
    await assertMeetingAdmin(request.auth?.uid, churchId);
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
    await assertMeetingAdmin(request.auth?.uid, churchId);
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