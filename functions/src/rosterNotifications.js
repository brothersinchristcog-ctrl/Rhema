import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
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
 * 🔔 1. ON SERVICE ASSIGNMENT QUEUE DISPATCHED
 * Fired when an assignment queue is created or when a new candidate becomes active.
 * Sends an FCM push notification directly to the active candidate with Accept/Decline action payload.
 */
export const onServiceAssignmentQueueDispatched = onDocumentCreated({
    document: `${RHEMA_ROOT_COLLECTION}/{churchId}/servicePlans/{serviceId}/assignmentQueues/{roleId}`,
    region: 'asia-south1',
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const { churchId, serviceId, roleId } = event.params;
    const db = getFirestore();
    const queueRef = snap.ref;
    const queueData = snap.data();
    if (queueData.status !== 'pending')
        return;
    const currentIdx = queueData.currentCandidateIndex || 0;
    const candidates = queueData.candidates || [];
    const activeCandidate = candidates[currentIdx];
    if (!activeCandidate || activeCandidate.notificationSent)
        return;
    // Fetch candidate's member record for FCM token
    const memberDoc = await db
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(churchId)
        .collection('members')
        .doc(activeCandidate.candidateId)
        .get();
    const fcmToken = memberDoc.data()?.fcmToken;
    if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim().length < 10) {
        console.log(`[RosterNotification] Candidate ${activeCandidate.candidateName} has no valid FCM token.`);
        return;
    }
    // Fetch parent service details for context
    const serviceDoc = await db
        .collection(RHEMA_ROOT_COLLECTION)
        .doc(churchId)
        .collection('servicePlans')
        .doc(serviceId)
        .get();
    const serviceData = serviceDoc.data() || {};
    const serviceTitle = serviceData.serviceTitle || 'Worship Service';
    const serviceDate = serviceData.date || '';
    const serviceTime = serviceData.startTime || '10:00';
    const location = serviceData.location || 'Church Sanctuary';
    const roleTitle = queueData.roleTitle || 'Ministry Responsibility';
    const title = `New Service Assignment: ${roleTitle}`;
    const body = `You are requested to serve as ${roleTitle} for "${serviceTitle}" on ${formatDateMonthYear(serviceDate)} at ${formatTimeTo12Hour(serviceTime)}.`;
    try {
        await getMessaging().send({
            token: fcmToken.trim(),
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
                candidateId: activeCandidate.candidateId,
                click_action: 'OPEN_SERVICE_ASSIGNMENT'
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'church_alerts',
                    color: '#2E6B4F'
                }
            }
        });
        // Mark candidate as notified atomically
        await queueRef.update({
            [`candidates.${currentIdx}.notificationSent`]: true,
            [`candidates.${currentIdx}.notifiedAt`]: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`[RosterNotification] Push sent to candidate ${activeCandidate.candidateName} for ${roleTitle}`);
    }
    catch (err) {
        console.error(`[RosterNotification] Failed to send push to ${activeCandidate.candidateName}:`, err);
    }
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
    const beforeData = change.before.data();
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
            const timeoutMinutes = afterData.timeoutMinutes || 1440; // Default 24 hours
            const deadlineDate = new Date(Date.now() + timeoutMinutes * 60 * 1000);
            await db.runTransaction(async (transaction) => {
                transaction.update(queueRef, {
                    currentCandidateIndex: nextIdx,
                    status: 'pending',
                    [`candidates.${nextIdx}.status`]: 'pending',
                    [`candidates.${nextIdx}.requestedAt`]: FieldValue.serverTimestamp(),
                    [`candidates.${nextIdx}.deadline`]: deadlineDate.toISOString(),
                    [`candidates.${nextIdx}.notificationSent`]: false,
                    history: FieldValue.arrayUnion({
                        timestamp: new Date().toISOString(),
                        action: `auto_cascade_to_candidate_${nextIdx + 1}`,
                        candidateId: nextCandidate.candidateId,
                        candidateName: nextCandidate.candidateName
                    }),
                    updatedAt: FieldValue.serverTimestamp()
                });
            });
            // Fetch next candidate's FCM token and dispatch notification
            const memberDoc = await db
                .collection(RHEMA_ROOT_COLLECTION)
                .doc(churchId)
                .collection('members')
                .doc(nextCandidate.candidateId)
                .get();
            const fcmToken = memberDoc.data()?.fcmToken;
            if (fcmToken && typeof fcmToken === 'string' && fcmToken.trim().length > 10) {
                const serviceDoc = await db
                    .collection(RHEMA_ROOT_COLLECTION)
                    .doc(churchId)
                    .collection('servicePlans')
                    .doc(serviceId)
                    .get();
                const serviceData = serviceDoc.data() || {};
                const title = `Service Assignment Request: ${afterData.roleTitle}`;
                const body = `You are next in queue to serve as ${afterData.roleTitle} for "${serviceData.serviceTitle || 'Worship Service'}" on ${formatDateMonthYear(serviceData.date)} at ${formatTimeTo12Hour(serviceData.startTime)}. Tap to accept or decline.`;
                await getMessaging().send({
                    token: fcmToken.trim(),
                    notification: { title, body },
                    data: {
                        type: 'service_assignment',
                        churchId,
                        serviceId,
                        roleId,
                        roleTitle: afterData.roleTitle || '',
                        serviceTitle: serviceData.serviceTitle || '',
                        serviceDate: formatDateMonthYear(serviceData.date),
                        serviceTime: formatTimeTo12Hour(serviceData.startTime),
                        candidateId: nextCandidate.candidateId
                    },
                    android: {
                        priority: 'high',
                        notification: { channelId: 'church_alerts', color: '#2E6B4F' }
                    }
                });
                await queueRef.update({
                    [`candidates.${nextIdx}.notificationSent`]: true
                });
            }
        }
        else {
            // Queue exhausted! No more candidates left in queue
            await queueRef.update({
                status: 'exhausted',
                history: FieldValue.arrayUnion({
                    timestamp: new Date().toISOString(),
                    action: 'queue_exhausted_all_declined'
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
                await doc.ref.update({
                    [`candidates.${curIdx}.status`]: 'timed_out',
                    [`candidates.${curIdx}.timedOutAt`]: FieldValue.serverTimestamp(),
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
                const memberDoc = await db.collection(RHEMA_ROOT_COLLECTION).doc(churchId).collection('members').doc(qData.confirmedCandidateId).get();
                const fcmToken = memberDoc.data()?.fcmToken;
                if (fcmToken && typeof fcmToken === 'string' && fcmToken.trim().length > 10) {
                    const roleTitle = String(qData.roleTitle || 'Volunteer');
                    const svcTitle = String(sData.serviceTitle || 'Worship Service');
                    const svcTime = String(sData.startTime || '10:00');
                    await getMessaging().send({
                        token: fcmToken.trim(),
                        notification: {
                            title: `Reminder: Serving Tomorrow as ${roleTitle}`,
                            body: `Service: ${svcTitle} starts tomorrow at ${formatTimeTo12Hour(svcTime)}. Please arrive 30 mins prior for prayer & sound check.`
                        },
                        data: {
                            type: 'service_reminder',
                            serviceId: sDoc.id,
                            roleTitle: roleTitle,
                            serviceDate: formatDateMonthYear(tomorrowStr)
                        },
                        android: {
                            priority: 'high',
                            notification: { channelId: 'church_alerts', color: '#2E6B4F' }
                        }
                    });
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