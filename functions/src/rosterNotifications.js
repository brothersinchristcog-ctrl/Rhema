import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const RHEMA_ROOT_COLLECTION = 'Rhema Church';
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
function formatDateMonthYear(dateStr) {
    if (!dateStr)
        return '';
    try {
        const clean = String(dateStr).trim();
        if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(clean))
            return clean;
        const datePart = clean.split('T')[0] ?? '';
        const parts = datePart.split(/[-/]/);
        if (parts.length === 3) {
            let y = 0, m = -1, d = 0;
            const p0 = parts[0] ?? '';
            const p1 = parts[1] ?? '';
            const p2 = parts[2] ?? '';
            if (p0.length === 4) {
                y = parseInt(p0, 10);
                m = parseInt(p1, 10) - 1;
                d = parseInt(p2, 10);
            }
            else if (p2.length === 4) {
                d = parseInt(p0, 10);
                m = parseInt(p1, 10) - 1;
                y = parseInt(p2, 10);
            }
            if (y > 0 && d > 0 && m >= 0 && m < 12) {
                return `${String(d).padStart(2, '0')} ${MONTH_NAMES[m]} ${y}`;
            }
        }
    }
    catch { }
    return String(dateStr);
}
function formatTimeTo12Hour(timeStr) {
    if (!timeStr)
        return '';
    try {
        const clean = String(timeStr).trim();
        if (/^(1[0-2]|0?[1-9]):[0-5][0-9]\s*(AM|PM)$/i.test(clean)) {
            return clean.toUpperCase();
        }
        const isPM = /pm/i.test(clean);
        const isAM = /am/i.test(clean);
        const parts = clean.replace(/[^\d:]/g, '').split(':').map(Number);
        if (parts.length >= 2) {
            let h = parts[0] || 0;
            const m = parts[1] || 0;
            let period = 'AM';
            if (isPM)
                period = 'PM';
            else if (isAM)
                period = 'AM';
            else
                period = h >= 12 ? 'PM' : 'AM';
            const displayH = h % 12 === 0 ? 12 : h % 12;
            return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
        }
    }
    catch { }
    return String(timeStr);
}
/**
 * 🔍 HELPER: Resolves valid FCM tokens for a member or candidate across:
 * 1. Rhema Church/{churchId}/members/{candidateId} (fcmToken, fcmTokens, and auth user pointer)
 * 2. users/{candidateId}
 * 3. Legacy churches/{churchId}/members/{candidateId}
 * 4. Phone number search if provided
 * 5. Display name search in members
 */
export async function resolveCandidateFcmTokens(db, churchId, candidateId, candidatePhone, candidateName) {
    const tokens = new Set();
    const addToken = (t) => {
        if (typeof t === 'string' && t.trim().length > 10) {
            tokens.add(t.trim());
        }
    };
    const addTokensFromArray = (arr) => {
        if (Array.isArray(arr)) {
            arr.forEach(t => addToken(t));
        }
    };
    if (!candidateId && !candidatePhone && !candidateName)
        return [];
    // 1. Direct candidateId lookup in Rhema Church/{churchId}/members/{candidateId}
    if (candidateId) {
        try {
            const memDoc = await db
                .collection(RHEMA_ROOT_COLLECTION)
                .doc(churchId || 'rhema')
                .collection('members')
                .doc(candidateId)
                .get();
            if (memDoc.exists) {
                const data = memDoc.data() || {};
                addToken(data.fcmToken);
                addTokensFromArray(data.fcmTokens);
                // If member record has auth pointer to users/{uid}
                const authUid = data.uid || data.userId || data.authUid;
                if (authUid && authUid !== candidateId) {
                    try {
                        const uDoc = await db.collection('users').doc(authUid).get();
                        if (uDoc.exists) {
                            const uData = uDoc.data() || {};
                            addToken(uData.fcmToken);
                            addTokensFromArray(uData.fcmTokens);
                        }
                    }
                    catch (_) { }
                }
            }
        }
        catch (e) {
            console.warn(`[RosterNotification] Error resolving memberDoc for ${candidateId}:`, e);
        }
        // 2. Direct candidateId check in users/{candidateId}
        try {
            const uDoc = await db.collection('users').doc(candidateId).get();
            if (uDoc.exists) {
                const uData = uDoc.data() || {};
                addToken(uData.fcmToken);
                addTokensFromArray(uData.fcmTokens);
            }
        }
        catch (e) {
            console.warn(`[RosterNotification] Error resolving userDoc for ${candidateId}:`, e);
        }
        // 3. Fallback to legacy churches/{churchId}/members/{candidateId}
        try {
            const legacyDoc = await db
                .collection('churches')
                .doc(churchId || 'rhema')
                .collection('members')
                .doc(candidateId)
                .get();
            if (legacyDoc.exists) {
                const data = legacyDoc.data() || {};
                addToken(data.fcmToken);
                addTokensFromArray(data.fcmTokens);
            }
        }
        catch (_) { }
    }
    // 4. Query users or members by phone number if tokens not yet found
    if (tokens.size === 0 && candidatePhone) {
        const cleanPhone = candidatePhone.replace(/[^\d+]/g, '');
        if (cleanPhone.length >= 7) {
            try {
                const uSnap = await db.collection('users').where('phone', '==', cleanPhone).limit(3).get();
                uSnap.forEach(d => {
                    addToken(d.data()?.fcmToken);
                    addTokensFromArray(d.data()?.fcmTokens);
                });
            }
            catch (_) { }
            try {
                const mSnap = await db
                    .collection(RHEMA_ROOT_COLLECTION)
                    .doc(churchId || 'rhema')
                    .collection('members')
                    .where('phone', '==', cleanPhone)
                    .limit(3)
                    .get();
                mSnap.forEach(d => {
                    addToken(d.data()?.fcmToken);
                    addTokensFromArray(d.data()?.fcmTokens);
                });
            }
            catch (_) { }
        }
    }
    // 5. Query members by name if tokens not yet found
    if (tokens.size === 0 && candidateName) {
        const trimmedName = candidateName.trim();
        if (trimmedName.length > 2) {
            try {
                const mSnap = await db
                    .collection(RHEMA_ROOT_COLLECTION)
                    .doc(churchId || 'rhema')
                    .collection('members')
                    .where('name', '==', trimmedName)
                    .limit(3)
                    .get();
                mSnap.forEach(d => {
                    addToken(d.data()?.fcmToken);
                    addTokensFromArray(d.data()?.fcmTokens);
                });
            }
            catch (_) { }
        }
    }
    return Array.from(tokens);
}
/**
 * 📲 HELPER: Sends assignment push notification & records in-app notification
 */
export async function sendCandidateAssignmentPush(params) {
    const { db, churchId, serviceId, roleId, roleTitle, candidate, candidateIndex, queueRef, timeoutMinutes, isCascade } = params;
    // 1. Fetch parent service details for context
    const serviceDoc = await db
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(churchId)
        .collection('servicePlans')
        .doc(serviceId)
        .get();
    const serviceData = serviceDoc.data() || {};
    const serviceTitle = String(serviceData.serviceTitle || 'Worship Service');
    const serviceDate = String(serviceData.date || '');
    const serviceTime = String(serviceData.startTime || '10:00');
    const location = String(serviceData.location || 'Church Sanctuary');
    const timeoutHours = Math.max(1, Math.round(timeoutMinutes / 60));
    const title = isCascade
        ? `Service Assignment Request: ${roleTitle}`
        : `New Service Assignment: ${roleTitle}`;
    const body = `You are requested to serve as ${roleTitle} for "${serviceTitle}" on ${formatDateMonthYear(serviceDate)} at ${formatTimeTo12Hour(serviceTime)} (${location}). Response deadline: ${timeoutHours} hour(s). Tap to Accept or Decline.`;
    // 2. In-app notification payload
    const inAppPayload = {
        type: 'service_assignment',
        title,
        body,
        churchId,
        serviceId,
        roleId,
        roleTitle,
        serviceTitle,
        serviceDate: formatDateMonthYear(serviceDate),
        serviceTime: formatTimeTo12Hour(serviceTime),
        location,
        candidateId: candidate.candidateId,
        candidateName: candidate.candidateName,
        timeoutMinutes,
        status: 'pending',
        read: false,
        createdAt: FieldValue.serverTimestamp()
    };
    try {
        await db
            .collection(RHEMA_ROOT_COLLECTION)
            .doc(churchId)
            .collection('members')
            .doc(candidate.candidateId)
            .collection('notifications')
            .add(inAppPayload);
    }
    catch (e) {
        console.warn(`[RosterNotification] Could not write member in-app notif for ${candidate.candidateName}:`, e);
    }
    try {
        await db
            .collection('users')
            .doc(candidate.candidateId)
            .collection('notifications')
            .add(inAppPayload);
    }
    catch (_) { }
    // 3. Resolve FCM tokens
    const tokens = await resolveCandidateFcmTokens(db, churchId, candidate.candidateId, candidate.candidatePhone, candidate.candidateName);
    if (tokens.length === 0) {
        console.log(`[RosterNotification] Candidate ${candidate.candidateName} (${candidate.candidateId}) has no registered FCM push token. (In-app notification saved).`);
        // Still mark notification as attempted in queue record
        try {
            const qSnap = await queueRef.get();
            if (qSnap.exists) {
                const qData = qSnap.data() || {};
                const cands = [...(qData.candidates || [])];
                if (cands[candidateIndex]) {
                    cands[candidateIndex] = {
                        ...cands[candidateIndex],
                        notificationSent: true,
                        notifiedAt: new Date().toISOString(),
                        noFcmToken: true
                    };
                    await queueRef.update({
                        candidates: cands,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }
            }
        }
        catch (e) {
            console.warn(`[RosterNotification] Could not update queue for noFcmToken:`, e);
        }
        return { success: true, tokensCount: 0 };
    }
    // 4. Dispatch FCM push to each device token
    let sentCount = 0;
    let lastError;
    for (const token of tokens) {
        try {
            await getMessaging().send({
                token,
                notification: { title, body },
                data: {
                    type: 'service_assignment',
                    churchId,
                    serviceId,
                    roleId,
                    roleTitle,
                    serviceTitle,
                    serviceDate: formatDateMonthYear(serviceDate),
                    serviceTime: formatTimeTo12Hour(serviceTime),
                    location,
                    candidateId: candidate.candidateId,
                    timeoutHours: String(timeoutHours),
                    click_action: 'OPEN_SERVICE_ASSIGNMENT'
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'church_alerts',
                        color: '#2E6B4F',
                        sound: 'default'
                    }
                },
                apns: {
                    headers: {
                        'apns-priority': '10'
                    },
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                }
            });
            sentCount++;
            console.log(`[RosterNotification] Push sent to candidate ${candidate.candidateName} for ${roleTitle} (${token.slice(0, 10)}...)`);
        }
        catch (err) {
            console.error(`[RosterNotification] Push send failed to token for ${candidate.candidateName}:`, err);
            lastError = err?.message || String(err);
        }
    }
    // 5. Update queue document state
    try {
        const qSnap = await queueRef.get();
        if (qSnap.exists) {
            const qData = qSnap.data() || {};
            const cands = [...(qData.candidates || [])];
            if (cands[candidateIndex]) {
                cands[candidateIndex] = {
                    ...cands[candidateIndex],
                    notificationSent: true,
                    notifiedAt: new Date().toISOString(),
                    pushSentCount: sentCount
                };
                await queueRef.update({
                    candidates: cands,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }
    }
    catch (e) {
        console.warn(`[RosterNotification] Could not update queue candidate state:`, e);
    }
    return { success: sentCount > 0, tokensCount: sentCount, error: lastError };
}
/**
 * 🔔 1. ON SERVICE ASSIGNMENT QUEUE DISPATCHED (Written: Create + Update)
 * Fired whenever an assignment queue document is created or updated in Firestore.
 * Sends targeted push notifications to the active candidate with Accept/Decline options.
 */
export const onServiceAssignmentQueueDispatched = onDocumentWritten({
    document: `${RHEMA_ROOT_COLLECTION}/{churchId}/servicePlans/{serviceId}/assignmentQueues/{roleId}`,
    region: 'asia-south1',
}, async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists)
        return;
    const { churchId, serviceId, roleId } = event.params;
    const db = getFirestore();
    const queueRef = afterSnap.ref;
    const queueData = afterSnap.data();
    if (!queueData)
        return;
    if (queueData.status !== 'pending')
        return;
    const currentIdx = queueData.currentCandidateIndex || 0;
    const candidates = queueData.candidates || [];
    const activeCandidate = candidates[currentIdx];
    // Only dispatch if active candidate has not yet received push notification
    if (!activeCandidate || activeCandidate.notificationSent === true)
        return;
    console.log(`[RosterNotification] Processing assignment queue push for role "${queueData.roleTitle}" (Candidate: ${activeCandidate.candidateName})`);
    await sendCandidateAssignmentPush({
        db,
        churchId,
        serviceId,
        roleId,
        roleTitle: queueData.roleTitle || 'Ministry Responsibility',
        candidate: activeCandidate,
        candidateIndex: currentIdx,
        queueRef,
        timeoutMinutes: queueData.timeoutMinutes || 120,
        isCascade: currentIdx > 0
    });
});
/**
 * ⚡ 2. ON SERVICE ASSIGNMENT RESPONDED (CASCADE ADVANCER)
 * Fired when an assignment queue is updated. If the active candidate declined or timed out,
 * this function automatically cascades the request to Candidate 2, Candidate 3, etc.
 */
export const onServiceAssignmentResponded = onDocumentUpdated({
    document: `${RHEMA_ROOT_COLLECTION}/{churchId}/servicePlans/{serviceId}/assignmentQueues/{roleId}`,
    region: 'asia-south1',
}, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const afterData = change.after.data();
    const queueRef = change.after.ref;
    const { churchId, serviceId, roleId } = event.params;
    const db = getFirestore();
    const curIdx = afterData.currentCandidateIndex || 0;
    const candidates = afterData.candidates || [];
    const activeCandidate = candidates[curIdx];
    // If already confirmed or exhausted, do nothing
    if (afterData.status === 'confirmed' || afterData.status === 'exhausted')
        return;
    // Check if current candidate has declined or timed out
    if (activeCandidate && (activeCandidate.status === 'declined' || activeCandidate.status === 'timed_out')) {
        const nextIdx = curIdx + 1;
        if (nextIdx < candidates.length) {
            // Cascade to next candidate
            const nextCandidate = candidates[nextIdx];
            const timeoutMinutes = afterData.timeoutMinutes || 120; // 2 hours default
            const deadlineDate = new Date(Date.now() + timeoutMinutes * 60 * 1000);
            await db.runTransaction(async (transaction) => {
                const freshSnap = await transaction.get(queueRef);
                if (!freshSnap.exists)
                    return;
                const freshData = freshSnap.data() || {};
                const freshCands = [...(freshData.candidates || [])];
                if (freshCands[nextIdx]) {
                    freshCands[nextIdx] = {
                        ...freshCands[nextIdx],
                        status: 'pending',
                        requestedAt: new Date().toISOString(),
                        deadline: deadlineDate.toISOString(),
                        notificationSent: false
                    };
                }
                transaction.update(queueRef, {
                    currentCandidateIndex: nextIdx,
                    status: 'pending',
                    candidates: freshCands,
                    history: FieldValue.arrayUnion({
                        timestamp: new Date().toISOString(),
                        action: `auto_cascade_to_candidate_${nextIdx + 1}`,
                        candidateId: nextCandidate.candidateId,
                        candidateName: nextCandidate.candidateName,
                        details: `Cascaded to Candidate #${nextIdx + 1} (${nextCandidate.candidateName}) after Candidate #${curIdx + 1} ${activeCandidate.status}.`
                    }),
                    updatedAt: FieldValue.serverTimestamp()
                });
            });
            console.log(`[RosterNotification] Auto-cascading role "${afterData.roleTitle}" to Candidate #${nextIdx + 1} (${nextCandidate.candidateName})`);
            // Send push notification to the newly activated candidate
            await sendCandidateAssignmentPush({
                db,
                churchId,
                serviceId,
                roleId,
                roleTitle: afterData.roleTitle || 'Ministry Responsibility',
                candidate: nextCandidate,
                candidateIndex: nextIdx,
                queueRef,
                timeoutMinutes,
                isCascade: true
            });
        }
        else {
            // Queue exhausted! No more candidates left in queue
            await queueRef.update({
                status: 'exhausted',
                history: FieldValue.arrayUnion({
                    timestamp: new Date().toISOString(),
                    action: 'queue_exhausted_all_declined',
                    details: `All ${candidates.length} candidate(s) declined or timed out. Admin manual assignment required.`
                }),
                updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`[RosterNotification] Queue exhausted for role ${roleId} in service ${serviceId}. Alerting admins.`);
        }
    }
});
/**
 * ⏰ 3. ASSIGNMENT TIMEOUT CHECKER CRON JOB
 * Dedicated Cloud Scheduler running every 15 minutes.
 * Scans active queues with status == 'pending' and marks candidates as 'timed_out'
 * if their deadline has elapsed, allowing the cascade trigger above to take over.
 */
export const checkServiceAssignmentTimeoutsCron = onSchedule({
    schedule: '*/5 * * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
}, async () => {
    console.log('[RosterCron] Checking service assignment timeouts...');
    const db = getFirestore();
    const now = new Date();
    // Query across all assignmentQueues collectionGroup
    const activeQueuesSnap = await db
        .collectionGroup('assignmentQueues')
        .where('status', '==', 'pending')
        .get();
    let timedOutCount = 0;
    for (const doc of activeQueuesSnap.docs) {
        const data = doc.data();
        const curIdx = data.currentCandidateIndex || 0;
        const candidates = data.candidates || [];
        const activeCandidate = candidates[curIdx];
        if (activeCandidate && activeCandidate.status === 'pending' && activeCandidate.deadline) {
            const deadlineDate = new Date(activeCandidate.deadline);
            if (now > deadlineDate) {
                console.log(`[RosterCron] Candidate ${activeCandidate.candidateName} timed out on doc ${doc.id}`);
                const freshCands = [...candidates];
                if (freshCands[curIdx]) {
                    freshCands[curIdx] = {
                        ...freshCands[curIdx],
                        status: 'timed_out',
                        timedOutAt: new Date().toISOString()
                    };
                }
                await doc.ref.update({
                    candidates: freshCands,
                    history: FieldValue.arrayUnion({
                        timestamp: new Date().toISOString(),
                        action: `candidate_${curIdx + 1}_timed_out`,
                        candidateId: activeCandidate.candidateId,
                        candidateName: activeCandidate.candidateName
                    }),
                    updatedAt: FieldValue.serverTimestamp()
                });
                timedOutCount++;
            }
        }
    }
    console.log(`[RosterCron] Done checking timeouts. Marked ${timedOutCount} candidate(s) timed out.`);
});
/**
 * ⏰ 4. SERVICE ROSTER REMINDERS CRON JOB
 * Dedicated Cloud Scheduler running daily at 08:00 AM IST.
 * Sends 24-hour reminders to all confirmed volunteers for tomorrow's services.
 */
export const sendServiceRosterRemindersCron = onSchedule({
    schedule: '0 8 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
}, async () => {
    console.log('[RosterCron] Checking tomorrow service reminders...');
    const db = getFirestore();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';
    const servicesSnap = await db
        .collectionGroup('servicePlans')
        .where('status', '==', 'published')
        .where('date', '==', tomorrowStr)
        .get();
    for (const sDoc of servicesSnap.docs) {
        const sData = sDoc.data();
        const queuesSnap = await sDoc.ref.collection('assignmentQueues').where('status', '==', 'confirmed').get();
        for (const qDoc of queuesSnap.docs) {
            const qData = qDoc.data();
            if (qData.confirmedCandidateId) {
                const churchId = sData.churchId || 'rhema';
                const tokens = await resolveCandidateFcmTokens(db, churchId, qData.confirmedCandidateId, undefined, qData.confirmedCandidateName);
                const roleTitle = String(qData.roleTitle || 'Volunteer');
                const svcTitle = String(sData.serviceTitle || 'Worship Service');
                const svcTime = String(sData.startTime || '10:00');
                const title = `Reminder: Serving Tomorrow as ${roleTitle}`;
                const body = `Service: ${svcTitle} starts tomorrow at ${formatTimeTo12Hour(svcTime)}. Please arrive 30 mins prior for prayer & sound check.`;
                for (const token of tokens) {
                    try {
                        await getMessaging().send({
                            token,
                            notification: { title, body },
                            data: {
                                type: 'service_reminder',
                                serviceId: sDoc.id,
                                roleTitle: roleTitle,
                                serviceDate: formatDateMonthYear(tomorrowStr)
                            },
                            android: {
                                priority: 'high',
                                notification: { channelId: 'church_alerts', color: '#2E6B4F', sound: 'default' }
                            }
                        });
                    }
                    catch (remErr) {
                        console.error(`[RosterCron] Failed sending reminder to ${qData.confirmedCandidateName}:`, remErr);
                    }
                }
            }
        }
    }
});
/**
 * 🌐 5. HTTP TRIGGER TO TEST ROSTER TIMEOUTS
 */
export const triggerCheckRosterTimeoutsHttp = onRequest({ cors: true, region: 'asia-south1' }, async (req, res) => {
    try {
        const db = getFirestore();
        const snap = await db.collectionGroup('assignmentQueues').where('status', '==', 'pending').get();
        res.json({ success: true, pendingQueuesCount: snap.size });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 🌐 5B. HTTP TRIGGER TO MANUALLY DISPATCH OR RETRY ASSIGNMENT NOTIFICATION
 */
export const dispatchServiceAssignmentNotificationHttp = onRequest({ cors: true, region: 'asia-south1' }, async (req, res) => {
    try {
        const { churchId, serviceId, roleId } = req.body || req.query;
        if (!serviceId || !roleId) {
            res.status(400).json({ error: 'serviceId and roleId are required' });
            return;
        }
        const db = getFirestore();
        const targetChurch = String(churchId || 'rhema');
        const queueRef = db
            .collection(RHEMA_ROOT_COLLECTION)
            .doc(targetChurch)
            .collection('servicePlans')
            .doc(String(serviceId))
            .collection('assignmentQueues')
            .doc(String(roleId));
        const qSnap = await queueRef.get();
        if (!qSnap.exists) {
            res.status(404).json({ error: 'Assignment queue document not found' });
            return;
        }
        const qData = qSnap.data() || {};
        const curIdx = qData.currentCandidateIndex || 0;
        const candidates = qData.candidates || [];
        const activeCandidate = candidates[curIdx];
        if (!activeCandidate) {
            res.status(400).json({ error: 'No active candidate in assignment queue' });
            return;
        }
        const result = await sendCandidateAssignmentPush({
            db,
            churchId: targetChurch,
            serviceId: String(serviceId),
            roleId: String(roleId),
            roleTitle: qData.roleTitle || 'Ministry Responsibility',
            candidate: activeCandidate,
            candidateIndex: curIdx,
            queueRef,
            timeoutMinutes: qData.timeoutMinutes || 120,
            isCascade: curIdx > 0
        });
        res.json({ ...result, candidate: activeCandidate.candidateName });
    }
    catch (err) {
        console.error('dispatchServiceAssignmentNotificationHttp error:', err);
        res.status(500).json({ error: err.message });
    }
});
/**
 * 🎶 6. ON SERVICE REHEARSAL CREATED
 * Fired when a rehearsal is scheduled for a worship service.
 * Alerts all invited team members and assigned band musicians via FCM.
 */
export const onServiceRehearsalCreated = onDocumentCreated({
    document: `${RHEMA_ROOT_COLLECTION}/{churchId}/servicePlans/{serviceId}/rehearsals/{rehearsalId}`,
    region: 'asia-south1',
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const { churchId, serviceId } = event.params;
    const db = getFirestore();
    const rData = snap.data();
    const rehearsalName = String(rData.rehearsalName || 'Worship Rehearsal');
    const date = String(rData.date || '');
    const startTime = String(rData.startTime || '18:00');
    const location = String(rData.location || 'Church Sanctuary');
    const participantSet = new Set();
    (rData.participantMemberIds || []).forEach((id) => participantSet.add(id));
    // If teams are assigned, include all members of those teams
    const assignedTeamIds = rData.assignedTeamIds || [];
    for (const teamId of assignedTeamIds) {
        try {
            const teamDoc = await db.collection(RHEMA_ROOT_COLLECTION).doc(churchId).collection('ministryTeams').doc(teamId).get();
            if (teamDoc.exists) {
                const members = teamDoc.data()?.memberIds || [];
                members.forEach((mId) => participantSet.add(mId));
            }
        }
        catch (err) {
            console.error(`[RosterNotification] Error fetching team ${teamId} members:`, err);
        }
    }
    if (participantSet.size === 0)
        return;
    // Fetch parent service plan for title
    const serviceDoc = await db.collection(RHEMA_ROOT_COLLECTION).doc(churchId).collection('servicePlans').doc(serviceId).get();
    const serviceTitle = serviceDoc.data()?.serviceTitle || 'Upcoming Service';
    const title = `Rehearsal Scheduled: ${rehearsalName}`;
    const body = `Practice for "${serviceTitle}" on ${formatDateMonthYear(date)} at ${formatTimeTo12Hour(startTime)} (${location}). Tap to review songs & notes.`;
    for (const memberId of participantSet) {
        try {
            const memberDoc = await db.collection(RHEMA_ROOT_COLLECTION).doc(churchId).collection('members').doc(memberId).get();
            const fcmToken = memberDoc.data()?.fcmToken;
            if (fcmToken && typeof fcmToken === 'string' && fcmToken.trim().length > 10) {
                await getMessaging().send({
                    token: fcmToken.trim(),
                    notification: { title, body },
                    data: {
                        type: 'rehearsal_alert',
                        churchId,
                        serviceId,
                        rehearsalId: event.params.rehearsalId,
                        date: formatDateMonthYear(date),
                        startTime: formatTimeTo12Hour(startTime),
                        location
                    },
                    android: {
                        priority: 'high',
                        notification: { channelId: 'church_alerts', color: '#2E6B4F' }
                    }
                });
            }
        }
        catch (err) {
            console.error(`[RosterNotification] Failed to alert member ${memberId} for rehearsal:`, err);
        }
    }
    console.log(`[RosterNotification] Dispatched rehearsal alerts to ${participantSet.size} participants.`);
});
//# sourceMappingURL=rosterNotifications.js.map