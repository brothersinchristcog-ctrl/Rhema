import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
/**
 * 🔔 SEND MEETING NOTIFICATION
 * Triggered when a new online meeting is scheduled in Firestore.
 * Sends a notification to the church's topic with strict atomic deduplication to prevent 5x duplicates.
 */
export const pushMeetingLive = onDocumentCreated('churches/{churchId}/online_meetings/{meetingId}', async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const meetingId = event.params.meetingId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const meetingRef = snap.ref;
    // 1. ATOMIC DEDUPLICATION: Run transaction to ensure notification is sent EXACTLY ONCE
    let shouldSend = false;
    try {
        shouldSend = await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(meetingRef);
            if (!freshDoc.exists)
                return false;
            const data = freshDoc.data();
            if (data?.notificationSent === true) {
                return false;
            }
            transaction.update(meetingRef, {
                notificationSent: true,
                notificationSentAt: FieldValue.serverTimestamp(),
            });
            return true;
        });
    }
    catch (txErr) {
        console.warn('Transaction error checking notificationSent:', txErr);
        // If transaction fails (e.g. concurrent race), check in-memory data
        if (snap.data()?.notificationSent === true) {
            return;
        }
        shouldSend = true;
    }
    if (!shouldSend) {
        console.log(`🛑 Skipping duplicate meeting push notification for: ${meetingId}`);
        return;
    }
    const meeting = snap.data();
    // Format the start time
    let timeString = '';
    try {
        if (meeting.startTime?.toDate) {
            const startDate = meeting.startTime.toDate();
            timeString = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        }
    }
    catch (_) { }
    const timeNotice = timeString ? ` for today at ${timeString}` : '';
    const payload = {
        notification: {
            title: `📅 New Online Meeting`,
            body: `${meeting.title || 'An online meeting'} has been scheduled${timeNotice}. Tap to join!`,
        },
        data: {
            type: 'online_meeting',
            meetingId: meetingId,
            churchId: churchId,
            provider: meeting.provider || '',
            url: meeting.meetingLink || meeting.meetingUrl || meeting.url || '',
            password: meeting.password || '',
        },
        topic: `church_${churchId}`,
    };
    try {
        const response = await getMessaging().send(payload);
        console.log('Successfully sent meeting creation notification:', response);
    }
    catch (error) {
        console.error('Error sending meeting notification:', error);
    }
});
/**
 * 🛡️ DEPRECATED DUPLICATE TRIGGERS:
 * Deployed under old names in Firebase (alertMeetingPush, sendMeetingNotification, sendMeetingPush, meetingPushV1).
 * Replaced with no-ops here so when deployed they will NEVER send duplicate notifications.
 */
export const alertMeetingPush = onDocumentCreated('churches/{churchId}/online_meetings/{meetingId}', async () => {
    console.log('alertMeetingPush is deprecated; handled by pushMeetingLive');
});
export const sendMeetingNotification = onDocumentCreated('churches/{churchId}/online_meetings/{meetingId}', async () => {
    console.log('sendMeetingNotification is deprecated; handled by pushMeetingLive');
});
export const sendMeetingPush = onDocumentCreated('churches/{churchId}/online_meetings/{meetingId}', async () => {
    console.log('sendMeetingPush is deprecated; handled by pushMeetingLive');
});
/**
 * 🙏 HELPER: DISPATCH PRAYER REQUEST PUSH TO ADMINS ONLY
 * Guarantees that only users with role admin, pastor, or super receive prayer alerts.
 * Regular church members NEVER receive these administrative prayer alerts.
 */
async function handlePrayerRequestAdminPush(prayer, churchId, prayerId, snapRef) {
    if (!prayer)
        return;
    const db = getFirestore();
    const messaging = getMessaging();
    // Deduplication guard
    if (prayer.adminPushSent === true) {
        console.log(`🛑 Skipping duplicate prayer admin push for request: ${prayerId}`);
        return;
    }
    if (snapRef) {
        try {
            await snapRef.update({
                adminPushSent: true,
                adminPushSentAt: FieldValue.serverTimestamp(),
            });
        }
        catch (_) { }
    }
    // 1. Identify the specific submitting member's name
    let memberName = (prayer.name || prayer.memberName || prayer.authorName || '').trim();
    if (!memberName || memberName.toLowerCase() === 'faithful member' || memberName.toLowerCase() === 'church member' || memberName.toLowerCase() === 'a church member') {
        const memberId = prayer.uid || prayer.authorId || prayer.contactId;
        if (memberId) {
            try {
                let mSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(memberId).get();
                if (!mSnap.exists) {
                    mSnap = await db.collection('churches').doc(churchId).collection('members').doc(memberId).get();
                }
                if (mSnap.exists && mSnap.data()?.name) {
                    memberName = mSnap.data().name;
                }
                else {
                    const uSnap = await db.collection('users').doc(memberId).get();
                    if (uSnap.exists && (uSnap.data()?.name || uSnap.data()?.displayName)) {
                        memberName = uSnap.data().name || uSnap.data().displayName;
                    }
                }
            }
            catch (err) {
                console.warn('Could not resolve prayer member name from Firestore:', err);
            }
        }
    }
    if (!memberName) {
        memberName = 'A Church Member';
    }
    // 2. Extract request excerpt
    const rawText = (prayer.request || prayer.text || prayer.requestEn || '').trim();
    const excerpt = rawText.length > 80 ? `${rawText.substring(0, 80)}...` : rawText;
    // 3. Formulate clear notification title and body identifying member and request
    const title = `🙏 New Prayer Request: ${memberName}`;
    const body = excerpt
        ? `${memberName} submitted a prayer request: "${excerpt}". Tap to review.`
        : `${memberName} has submitted a new prayer request. Tap to review in Admin Dashboard.`;
    // 4. Query all admins strictly for this church to collect direct device tokens
    const adminTokens = [];
    const adminUids = [];
    try {
        // A. Check Rhema Church members
        let membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
        if (membersSnap.empty) {
            membersSnap = await db.collection('churches').doc(churchId).collection('members').get();
        }
        membersSnap.forEach(doc => {
            const m = doc.data();
            const role = String(m.userType || m.role || '').toLowerCase();
            const isAdmin = role.includes('admin') || role.includes('pastor') || role.includes('super');
            if (isAdmin) {
                adminUids.push(doc.id);
                if (m.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                    adminTokens.push(m.fcmToken.trim());
                }
            }
        });
        // B. Check church document for admin UIDs
        let churchDoc = await db.collection('Rhema Church').doc(churchId).get();
        if (!churchDoc.exists) {
            churchDoc = await db.collection('churches').doc(churchId).get();
        }
        if (churchDoc.exists) {
            const cData = churchDoc.data();
            const ownerUids = [cData?.adminUid, cData?.createdBy, cData?.pastorUid].filter(Boolean);
            for (const uid of ownerUids) {
                if (!adminUids.includes(uid)) {
                    adminUids.push(uid);
                }
            }
        }
        // C. Check users collection for admin tokens
        for (const uid of adminUids) {
            try {
                const uSnap = await db.collection('users').doc(uid).get();
                const uData = uSnap.data();
                if (uData?.fcmToken && typeof uData.fcmToken === 'string' && uData.fcmToken.trim().length > 10) {
                    const t = uData.fcmToken.trim();
                    if (!adminTokens.includes(t)) {
                        adminTokens.push(t);
                    }
                }
            }
            catch (_) { }
        }
    }
    catch (lookupErr) {
        console.error('Error fetching admin tokens for prayer request notification:', lookupErr);
    }
    const notificationData = {
        type: 'prayer_request_admin',
        churchId: churchId,
        prayerId: prayerId,
        requestId: prayerId,
        screen: 'AdminRoot',
        targetTab: 'Prayers',
        memberName: memberName,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    // 5. Direct multicast push to admin devices ONLY
    const uniqueTokens = Array.from(new Set(adminTokens));
    if (uniqueTokens.length > 0) {
        try {
            const sendRes = await messaging.sendEachForMulticast({
                notification: { title, body },
                data: notificationData,
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
            console.log(`✅ Sent prayer request notification to ${sendRes.successCount} admin devices (${sendRes.failureCount} failed).`);
        }
        catch (pushErr) {
            console.error('Error sending multicast prayer admin notification:', pushErr);
        }
    }
    // 6. Broadcast to church admin topic church_{churchId}_admin ONLY (never general church topic)
    try {
        await messaging.send({
            notification: { title, body },
            data: notificationData,
            topic: `church_${churchId}_admin`,
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
        console.log(`✅ Broadcasted prayer request notification to topic: church_${churchId}_admin`);
    }
    catch (topicErr) {
        console.error('Error sending to church admin topic:', topicErr);
    }
    // 7. Write in-app notification doc for admins in Rhema Church notifications
    try {
        const notifPayload = {
            type: 'prayer_request_admin',
            title,
            body,
            memberName,
            prayerId,
            requestId: prayerId,
            requestExcerpt: excerpt,
            category: prayer.category || '',
            isPublic: prayer.isPublic ?? false,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        };
        await db.collection('Rhema Church').doc(churchId).collection('notifications').add(notifPayload);
        try {
            await db.collection('churches').doc(churchId).collection('notifications').add(notifPayload);
        }
        catch (_) { }
    }
    catch (dbErr) {
        console.error('Error writing prayer in-app notification document:', dbErr);
    }
}
/**
 * 🙏 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY PRAYER REQUEST (Primary single-church collection)
 * Triggered automatically whenever a member submits a prayer request in Firestore.
 * Always notifies church admins ONLY, clearly showing which specific member submitted it.
 */
export const onPrayerRequestCreatedAdmin = onDocumentCreated({ document: 'Rhema Church/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const prayer = snap.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestAdminPush(prayer, churchId, prayerId, snap.ref);
});
/**
 * 🙏 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY PRAYER REQUEST (Legacy churches collection)
 */
export const onPrayerRequestCreatedAdminLegacy = onDocumentCreated({ document: 'churches/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const prayer = snap.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestAdminPush(prayer, churchId, prayerId, snap.ref);
});
/**
 * 💧 HELPER: DISPATCH BAPTISM REQUEST PUSH TO ADMINS ONLY
 * Guarantees that only users with role admin, pastor, or super receive baptism alerts.
 * Regular church members NEVER receive these sacramental request notifications.
 */
async function handleBaptismRequestAdminPush(baptism, churchId, requestId, snapRef) {
    if (!baptism)
        return;
    const db = getFirestore();
    const messaging = getMessaging();
    // Deduplication guard
    if (baptism.adminPushSent === true) {
        console.log(`🛑 Skipping duplicate baptism admin push for request: ${requestId}`);
        return;
    }
    if (snapRef) {
        try {
            await snapRef.update({
                adminPushSent: true,
                adminPushSentAt: FieldValue.serverTimestamp(),
            });
        }
        catch (_) { }
    }
    // 1. Identify member name and preferred date
    let memberName = (baptism.memberName || baptism.name || '').trim();
    if (!memberName) {
        const memberId = baptism.memberId || baptism.uid || baptism.userId;
        if (memberId) {
            try {
                let mSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(memberId).get();
                if (!mSnap.exists) {
                    mSnap = await db.collection('churches').doc(churchId).collection('members').doc(memberId).get();
                }
                if (mSnap.exists && mSnap.data()?.name) {
                    memberName = mSnap.data().name;
                }
                else {
                    const uSnap = await db.collection('users').doc(memberId).get();
                    if (uSnap.exists && (uSnap.data()?.name || uSnap.data()?.displayName)) {
                        memberName = uSnap.data().name || uSnap.data().displayName;
                    }
                }
            }
            catch (err) {
                console.warn('Could not resolve baptism member name:', err);
            }
        }
    }
    if (!memberName) {
        memberName = 'A Church Member';
    }
    const prefDate = (baptism.preferredDate || '').trim();
    const title = `💧 New Baptism Request: ${memberName}`;
    const body = prefDate
        ? `${memberName} has requested baptism for ${prefDate}. Tap to review in Admin Dashboard.`
        : `${memberName} has submitted a new baptism request. Tap to review in Admin Dashboard.`;
    // 2. Query all admins strictly for this church
    const adminTokens = [];
    const adminUids = [];
    try {
        // A. Check Rhema Church members
        let membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
        if (membersSnap.empty) {
            membersSnap = await db.collection('churches').doc(churchId).collection('members').get();
        }
        membersSnap.forEach(doc => {
            const m = doc.data();
            const role = String(m.userType || m.role || '').toLowerCase();
            const isAdmin = role.includes('admin') || role.includes('pastor') || role.includes('super');
            if (isAdmin) {
                adminUids.push(doc.id);
                if (m.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                    adminTokens.push(m.fcmToken.trim());
                }
            }
        });
        // B. Check church document for admin UIDs
        let churchDoc = await db.collection('Rhema Church').doc(churchId).get();
        if (!churchDoc.exists) {
            churchDoc = await db.collection('churches').doc(churchId).get();
        }
        if (churchDoc.exists) {
            const cData = churchDoc.data();
            const ownerUids = [cData?.adminUid, cData?.createdBy, cData?.pastorUid].filter(Boolean);
            for (const uid of ownerUids) {
                if (!adminUids.includes(uid)) {
                    adminUids.push(uid);
                }
            }
        }
        // C. Check users collection for admin tokens
        for (const uid of adminUids) {
            try {
                const uSnap = await db.collection('users').doc(uid).get();
                const uData = uSnap.data();
                if (uData?.fcmToken && typeof uData.fcmToken === 'string' && uData.fcmToken.trim().length > 10) {
                    const t = uData.fcmToken.trim();
                    if (!adminTokens.includes(t)) {
                        adminTokens.push(t);
                    }
                }
            }
            catch (_) { }
        }
    }
    catch (lookupErr) {
        console.error('Error fetching admin tokens for baptism notification:', lookupErr);
    }
    const notificationData = {
        type: 'baptism_request_admin',
        churchId: churchId,
        requestId: requestId,
        screen: 'AdminRoot',
        targetTab: 'Baptism',
        memberName: memberName,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    // 3. Direct multicast push to admin devices ONLY
    const uniqueTokens = Array.from(new Set(adminTokens));
    if (uniqueTokens.length > 0) {
        try {
            const sendRes = await messaging.sendEachForMulticast({
                notification: { title, body },
                data: notificationData,
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
            console.log(`✅ Sent baptism request notification to ${sendRes.successCount} admin devices (${sendRes.failureCount} failed).`);
        }
        catch (pushErr) {
            console.error('Error sending multicast baptism admin notification:', pushErr);
        }
    }
    // 4. Send to church admin topic church_{churchId}_admin ONLY (never general church topic)
    try {
        await messaging.send({
            notification: { title, body },
            data: notificationData,
            topic: `church_${churchId}_admin`,
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
        console.log(`✅ Broadcasted baptism request notification to topic: church_${churchId}_admin`);
    }
    catch (topicErr) {
        console.error('Error sending to church admin topic:', topicErr);
    }
    // 5. Write in-app notification doc for admins in Rhema Church notifications
    try {
        const notifPayload = {
            type: 'baptism_request_admin',
            title,
            body,
            memberName,
            memberPhone: baptism.memberPhone || baptism.contactPhone || '',
            requestId,
            preferredDate: prefDate,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        };
        await db.collection('Rhema Church').doc(churchId).collection('notifications').add(notifPayload);
        try {
            await db.collection('churches').doc(churchId).collection('notifications').add(notifPayload);
        }
        catch (_) { }
    }
    catch (dbErr) {
        console.error('Error writing baptism in-app notification document:', dbErr);
    }
}
/**
 * 💧 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY BAPTISM REQUEST (Primary single-church collection)
 * Triggered automatically whenever a member submits a baptism request in Firestore.
 * Always notifies church admins ONLY, clearly showing which member submitted it.
 */
export const onBaptismRequestCreatedAdmin = onDocumentCreated({ document: 'Rhema Church/{churchId}/baptism_requests/{requestId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const baptism = snap.data();
    const churchId = event.params.churchId;
    const requestId = event.params.requestId;
    await handleBaptismRequestAdminPush(baptism, churchId, requestId, snap.ref);
});
/**
 * 💧 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY BAPTISM REQUEST (Legacy churches collection)
 */
export const onBaptismRequestCreatedAdminLegacy = onDocumentCreated({ document: 'churches/{churchId}/baptism_requests/{requestId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const baptism = snap.data();
    const churchId = event.params.churchId;
    const requestId = event.params.requestId;
    await handleBaptismRequestAdminPush(baptism, churchId, requestId, snap.ref);
});
/**
 * 🙏 HELPER: DISPATCH PRAYER REQUEST APPROVAL/PROCESSED PUSH TO THE SPECIFIC MEMBER ONLY
 * Guarantees that ONLY the particular member who submitted the prayer request receives the push notification.
 * Regular church members and community topics NEVER receive broadcast notifications for individual prayers.
 */
async function handlePrayerRequestMemberPush(before, after, churchId, prayerId, snapRef) {
    if (!after)
        return;
    // Trigger when prayer request is newly answered/processed, or when admin adds a response
    const justAnswered = (!before?.isAnswered && after.isAnswered);
    const newResponseAdded = Boolean(after.lastAdminResponse && after.lastAdminResponse !== before?.lastAdminResponse);
    if (!justAnswered && !newResponseAdded) {
        return;
    }
    // Deduplication guard
    if (after.memberPushSent === true && !newResponseAdded) {
        console.log(`🛑 Skipping duplicate prayer member push for request: ${prayerId}`);
        return;
    }
    const db = getFirestore();
    const messaging = getMessaging();
    if (snapRef) {
        try {
            await snapRef.update({
                memberPushSent: true,
                memberPushSentAt: FieldValue.serverTimestamp(),
            });
        }
        catch (_) { }
    }
    // 1. Identify the specific submitting member
    const memberId = (after.uid || after.authorId || after.contactId || '').trim();
    const memberPhone = (after.phone || after.contactPhone || after.mobile || '').trim();
    let memberName = (after.name || after.memberName || after.authorName || '').trim();
    if (!memberName || memberName.toLowerCase() === 'faithful member' || memberName.toLowerCase() === 'church member' || memberName.toLowerCase() === 'a church member') {
        if (memberId) {
            try {
                let mSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(memberId).get();
                if (!mSnap.exists) {
                    mSnap = await db.collection('churches').doc(churchId).collection('members').doc(memberId).get();
                }
                if (mSnap.exists && mSnap.data()?.name) {
                    memberName = mSnap.data().name;
                }
                else {
                    const uSnap = await db.collection('users').doc(memberId).get();
                    if (uSnap.exists && (uSnap.data()?.name || uSnap.data()?.displayName)) {
                        memberName = uSnap.data().name || uSnap.data().displayName;
                    }
                }
            }
            catch (_) { }
        }
    }
    if (!memberName) {
        memberName = 'Church Member';
    }
    const isPublic = after.isPublic === true;
    const adminComment = (after.lastAdminResponse || '').trim();
    // 2. Compose personalized notification title and body
    const title = isPublic
        ? '🙏 Prayer Request Approved'
        : '🙏 Pastoral Prayer Response';
    let body = '';
    if (adminComment) {
        const preview = adminComment.length > 90 ? `${adminComment.substring(0, 87)}...` : adminComment;
        body = `Pastor has responded to your prayer request: "${preview}"`;
    }
    else if (isPublic) {
        body = `Dear ${memberName}, your prayer request has been approved and our pastoral team is praying for you.`;
    }
    else {
        body = `Dear ${memberName}, your prayer request has been received and our pastoral team has prayed for you.`;
    }
    // 3. Find device tokens ONLY for this specific member
    const memberTokens = [];
    try {
        // Check Rhema Church members
        if (memberId) {
            try {
                const mSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(memberId).get();
                if (mSnap.exists) {
                    const m = mSnap.data();
                    if (m?.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                        memberTokens.push(m.fcmToken.trim());
                    }
                    if (Array.isArray(m?.fcmTokens)) {
                        for (const t of m.fcmTokens) {
                            if (typeof t === 'string' && t.trim().length > 10)
                                memberTokens.push(t.trim());
                        }
                    }
                }
            }
            catch (_) { }
            // Check legacy churches members
            try {
                const mSnap = await db.collection('churches').doc(churchId).collection('members').doc(memberId).get();
                if (mSnap.exists) {
                    const m = mSnap.data();
                    if (m?.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                        memberTokens.push(m.fcmToken.trim());
                    }
                    if (Array.isArray(m?.fcmTokens)) {
                        for (const t of m.fcmTokens) {
                            if (typeof t === 'string' && t.trim().length > 10)
                                memberTokens.push(t.trim());
                        }
                    }
                }
            }
            catch (_) { }
            // Check users collection by UID
            try {
                const uSnap = await db.collection('users').doc(memberId).get();
                if (uSnap.exists) {
                    const u = uSnap.data();
                    if (u?.fcmToken && typeof u.fcmToken === 'string' && u.fcmToken.trim().length > 10) {
                        memberTokens.push(u.fcmToken.trim());
                    }
                    if (Array.isArray(u?.fcmTokens)) {
                        for (const t of u.fcmTokens) {
                            if (typeof t === 'string' && t.trim().length > 10)
                                memberTokens.push(t.trim());
                        }
                    }
                }
            }
            catch (_) { }
        }
        // Check by Phone number across members and users
        if (memberPhone) {
            const cleanDigits = memberPhone.replace(/\D/g, '').slice(-10);
            if (cleanDigits.length >= 7) {
                try {
                    const memQuery = await db.collection('Rhema Church').doc(churchId).collection('members').get();
                    memQuery.forEach(doc => {
                        const m = doc.data();
                        const p = String(m.phone || m.mobile || '').replace(/\D/g, '').slice(-10);
                        if (p === cleanDigits) {
                            if (m?.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                                memberTokens.push(m.fcmToken.trim());
                            }
                            if (Array.isArray(m?.fcmTokens)) {
                                for (const t of m.fcmTokens) {
                                    if (typeof t === 'string' && t.trim().length > 10)
                                        memberTokens.push(t.trim());
                                }
                            }
                        }
                    });
                }
                catch (_) { }
                try {
                    const uQuery = await db.collection('users').get();
                    uQuery.forEach(doc => {
                        const u = doc.data();
                        const p = String(u.phone || u.mobile || u.phoneNumber || '').replace(/\D/g, '').slice(-10);
                        if (p === cleanDigits) {
                            if (u?.fcmToken && typeof u.fcmToken === 'string' && u.fcmToken.trim().length > 10) {
                                memberTokens.push(u.fcmToken.trim());
                            }
                            if (Array.isArray(u?.fcmTokens)) {
                                for (const t of u.fcmTokens) {
                                    if (typeof t === 'string' && t.trim().length > 10)
                                        memberTokens.push(t.trim());
                                }
                            }
                        }
                    });
                }
                catch (_) { }
            }
        }
    }
    catch (lookupErr) {
        console.error('Error fetching member tokens for prayer push:', lookupErr);
    }
    const notificationData = {
        type: 'prayer_request_member',
        churchId: churchId,
        prayerId: prayerId,
        requestId: prayerId,
        screen: 'PrayerWall',
        isPublic: String(isPublic),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    // 4. Send direct push ONLY to the specific member's registered devices (NEVER topic broadcast)
    const uniqueTokens = Array.from(new Set(memberTokens));
    if (uniqueTokens.length > 0) {
        try {
            const sendRes = await messaging.sendEachForMulticast({
                notification: { title, body },
                data: notificationData,
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
            console.log(`✅ Direct prayer request notification sent to member (${memberName}): ${sendRes.successCount} success, ${sendRes.failureCount} failed.`);
        }
        catch (fcmErr) {
            console.error('Error dispatching multicast to member:', fcmErr);
        }
    }
    else {
        console.log(`ℹ️ No direct FCM tokens found for member (${memberName} - ID: ${memberId}, Phone: ${memberPhone}). In-app notification doc written.`);
    }
    // 5. In-app notification document strictly targeted to this member
    try {
        const notifPayload = {
            type: 'prayer_request_member',
            title,
            body,
            memberName,
            memberPhone,
            targetMemberId: memberId,
            targetPhone: memberPhone,
            targetUid: memberId,
            prayerId,
            requestId: prayerId,
            isPublic,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        };
        await db.collection('Rhema Church').doc(churchId).collection('notifications').add(notifPayload);
        try {
            await db.collection('churches').doc(churchId).collection('notifications').add(notifPayload);
        }
        catch (_) { }
    }
    catch (dbErr) {
        console.error('Error writing member prayer in-app notification doc:', dbErr);
    }
}
/**
 * 🙏 NOTIFY MEMBER OF APPROVED / PROCESSED PRAYER REQUEST (Primary single-church collection)
 * Triggered when a prayer request is approved or processed (isAnswered becomes true).
 * Notifies ONLY the specific member who submitted it. NEVER broadcasts to community topic.
 */
export const onPrayerRequestProcessedMember = onDocumentUpdated({ document: 'Rhema Church/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const before = snap.before.data();
    const after = snap.after.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestMemberPush(before, after, churchId, prayerId, snap.after.ref);
});
/**
 * 🙏 NOTIFY MEMBER OF APPROVED / PROCESSED PRAYER REQUEST (Legacy churches collection)
 */
export const onPrayerRequestProcessedMemberLegacy = onDocumentUpdated({ document: 'churches/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const before = snap.before.data();
    const after = snap.after.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestMemberPush(before, after, churchId, prayerId, snap.after.ref);
});
/**
 * Deprecated alias to maintain backwards compatibility if referenced elsewhere.
 * Topic broadcast intentionally removed.
 */
export const pushPrayerRequestApproved = onPrayerRequestProcessedMemberLegacy;
function formatSermonDateDisplay(dateStr) {
    if (!dateStr)
        return '';
    const clean = String(dateStr).trim().split(' ')[0]?.split('T')[0] || '';
    const parts = clean.split('-');
    const p0 = parts[0];
    const p1 = parts[1];
    const p2 = parts[2];
    if (parts.length === 3 && p0 && p1 && p2) {
        if (p0.length === 4)
            return `${p2}-${p1}-${p0}`; // YYYY-MM-DD -> DD-MM-YYYY
        if (p2.length === 4)
            return clean; // already DD-MM-YYYY
    }
    return clean;
}
function toStandardDateStr(dateStr) {
    if (!dateStr)
        return '';
    const clean = String(dateStr).trim().split(' ')[0]?.split('T')[0] || '';
    const parts = clean.split('-');
    const p0 = parts[0];
    const p1 = parts[1];
    const p2 = parts[2];
    if (parts.length === 3 && p0 && p1 && p2) {
        if (p0.length === 4)
            return clean; // YYYY-MM-DD
        if (p2.length === 4)
            return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`; // DD-MM-YYYY -> YYYY-MM-DD
    }
    return clean;
}
/**
 * 🎙️ CHECK & AUTO-PUBLISH SCHEDULED SERMONS
 * Checks if any sermon with status 'Scheduled' has reached its scheduledPublishAt
 * or scheduledDate + scheduledTime. Automatically publishes the sermon, updates Firestore,
 * and sends an FCM push notification to church members.
 */
export async function checkAndPublishScheduledSermons(sermonsRef, churchId, churchDocRef) {
    try {
        const snap = await sermonsRef.where('status', '==', 'Scheduled').get();
        if (!snap || snap.empty)
            return;
        const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const nowStr = `${nowIst.getFullYear()}-${String(nowIst.getMonth() + 1).padStart(2, '0')}-${String(nowIst.getDate()).padStart(2, '0')}`;
        const nowTime = `${String(nowIst.getHours()).padStart(2, '0')}:${String(nowIst.getMinutes()).padStart(2, '0')}`;
        const nowMillis = Date.now();
        for (const doc of snap.docs) {
            const sermon = doc.data();
            if (sermon.notificationSent === true)
                continue;
            let shouldPublish = false;
            if (sermon.scheduledPublishAt) {
                let pubTime = NaN;
                if (typeof sermon.scheduledPublishAt === 'number') {
                    pubTime = sermon.scheduledPublishAt;
                }
                else if (typeof sermon.scheduledPublishAt.toMillis === 'function') {
                    pubTime = sermon.scheduledPublishAt.toMillis();
                }
                else if (sermon.scheduledPublishAt.seconds) {
                    pubTime = sermon.scheduledPublishAt.seconds * 1000;
                }
                else if (typeof sermon.scheduledPublishAt === 'string') {
                    pubTime = new Date(sermon.scheduledPublishAt).getTime();
                }
                if (!isNaN(pubTime) && pubTime <= nowMillis) {
                    shouldPublish = true;
                }
            }
            else if (sermon.scheduledDate) {
                const sDate = toStandardDateStr(sermon.scheduledDate);
                let sTime24 = '00:00';
                if (sermon.scheduledTime) {
                    const match = String(sermon.scheduledTime).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
                    if (match && match[1] && match[2]) {
                        let h = parseInt(match[1], 10);
                        const m = match[2];
                        const ampm = match[3]?.toUpperCase();
                        if (ampm === 'PM' && h < 12)
                            h += 12;
                        if (ampm === 'AM' && h === 12)
                            h = 0;
                        sTime24 = `${String(h).padStart(2, '0')}:${m}`;
                    }
                }
                if (sDate < nowStr || (sDate === nowStr && sTime24 <= nowTime)) {
                    shouldPublish = true;
                }
            }
            else if (sermon.date) {
                const sDate = toStandardDateStr(sermon.date);
                if (sDate && sDate <= nowStr) {
                    shouldPublish = true;
                }
            }
            if (shouldPublish) {
                // 1. Atomic check: ensure notification hasn't been claimed/sent already
                const freshSnap = await doc.ref.get();
                if (freshSnap.data()?.notificationSent === true) {
                    continue;
                }
                // 2. Mark published & claimed first to prevent any race condition
                await doc.ref.update({
                    status: 'Published',
                    notificationSent: true,
                    publishedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                const sermonTitle = sermon.titleEn || sermon.title || 'New Sermon';
                const pastorName = sermon.pastor || 'Pastor';
                const pushTitle = `🎧 New Sermon: ${sermonTitle}`;
                const formattedPreachedDate = formatSermonDateDisplay(sermon.date) || formatSermonDateDisplay(nowStr);
                const pushBody = `New sermon "${sermonTitle}" preached on ${formattedPreachedDate} by ${pastorName} is now available. Watch/listen now!`;
                // 3. Create broadcast with deterministic ID (sermon_${doc.id}) so onDocumentCreated NEVER fires twice!
                const targetRef = churchDocRef || doc.ref.parent.parent;
                if (targetRef) {
                    const bcastDocRef = targetRef.collection('broadcasts').doc(`sermon_${doc.id}`);
                    const bcastSnap = await bcastDocRef.get();
                    if (!bcastSnap.exists) {
                        await bcastDocRef.set({
                            title: pushTitle,
                            content: pushBody,
                            type: 'sermon',
                            id: doc.id,
                            sermonId: doc.id,
                            date: nowStr,
                            sermonDate: sermon.date || nowStr,
                            targetChurchId: churchId,
                            createdAt: FieldValue.serverTimestamp(),
                        }).catch(() => { });
                    }
                    const notifDocRef = targetRef.collection('notifications').doc(`sermon_${doc.id}`);
                    const notifSnap = await notifDocRef.get();
                    if (!notifSnap.exists) {
                        await notifDocRef.set({
                            title: pushTitle,
                            body: pushBody,
                            type: 'sermon',
                            id: doc.id,
                            sermonId: doc.id,
                            churchId: churchId,
                            read: false,
                            createdAt: FieldValue.serverTimestamp(),
                        }).catch(() => { });
                    }
                }
                console.log(`✅ Auto-published scheduled sermon: ${doc.id} (${sermonTitle}) for church ${churchId}`);
            }
        }
    }
    catch (err) {
        console.error(`Error in checkAndPublishScheduledSermons for church ${churchId}:`, err);
    }
}
/**
 * ⏱ CHECK ONLINE MEETINGS (CRON JOB)
 * Cron Job: Runs every minute to check if any online meeting is starting now (or within 5 minutes)
 */
/**
 * 🎙️ AUTOMATED SCHEDULED SERMONS PUBLISHER & NOTIFIER (CRON JOB)
 * Cloud Scheduler runs this every minute (Asia/Kolkata, region: asia-south1).
 * Matches the architecture and region of automatedDailyPromise.
 */
export const publishScheduledSermons = onSchedule({ schedule: '* * * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async (event) => {
    try {
        const db = getFirestore();
        console.log('⏰ [publishScheduledSermons] Checking for due scheduled sermons...');
        // 1. Check active Rhema Church collection
        const rhemaChurchRef = db.collection('Rhema Church').doc('rhema');
        await checkAndPublishScheduledSermons(rhemaChurchRef.collection('sermons'), 'rhema', rhemaChurchRef);
        // 2. Check legacy churches collection
        const churchesSnapshot = await db.collection('churches').get();
        for (const churchDoc of churchesSnapshot.docs) {
            await checkAndPublishScheduledSermons(churchDoc.ref.collection('sermons'), churchDoc.id, churchDoc.ref);
        }
    }
    catch (err) {
        console.error('Error in publishScheduledSermons cron job:', err);
    }
});
export const monitorMeetingLive = onSchedule({ schedule: '* * * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async (event) => {
    const db = getFirestore();
    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    try {
        const churchesSnapshot = await db.collection('churches').get();
        for (const churchDoc of churchesSnapshot.docs) {
            const churchId = churchDoc.id;
            // Query meetings that are scheduled or live
            const meetingsSnapshot = await churchDoc.ref.collection('online_meetings')
                .where('status', 'in', ['scheduled', 'live'])
                .get();
            for (const meetingDoc of meetingsSnapshot.docs) {
                const meeting = meetingDoc.data();
                if (!meeting.startTime)
                    continue;
                const startTime = meeting.startTime.toDate();
                const updates = {};
                // 1. Check for "Live" notification
                if (startTime <= now && !meeting.liveNotified) {
                    const payload = {
                        notification: {
                            title: `🔴 Live Meeting Now`,
                            body: `${meeting.title} is now live.`,
                        },
                        data: {
                            type: 'online_meeting',
                            meetingId: meetingDoc.id,
                            churchId: churchId,
                            provider: meeting.provider || '',
                            url: meeting.meetingLink || meeting.meetingUrl || meeting.url || '',
                        },
                        topic: `church_${churchId}`,
                    };
                    await getMessaging().send(payload).catch(e => console.error('Error sending Live notification', e));
                    updates.liveNotified = true;
                    if (meeting.status !== 'live')
                        updates.status = 'live';
                }
                // 2. Check for "Reminder" notification (5 mins after start)
                if (startTime <= fiveMinsAgo && !meeting.reminderNotified) {
                    const payload = {
                        notification: {
                            title: `🔔 Meeting Reminder`,
                            body: `${meeting.title} is still live. Join now to participate.`,
                        },
                        data: {
                            type: 'online_meeting',
                            meetingId: meetingDoc.id,
                            churchId: churchId,
                            provider: meeting.provider || '',
                            url: meeting.meetingLink || meeting.meetingUrl || meeting.url || '',
                        },
                        topic: `church_${churchId}`,
                    };
                    await getMessaging().send(payload).catch(e => console.error('Error sending Reminder notification', e));
                    updates.reminderNotified = true;
                }
                // Apply updates if any notifications were sent
                if (Object.keys(updates).length > 0) {
                    await meetingDoc.ref.update(updates);
                }
            }
            // ─── 2.5 Check Scheduled Sermons for this church ───
            try {
                await checkAndPublishScheduledSermons(churchDoc.ref.collection('sermons'), churchId, churchDoc.ref);
            }
            catch (sermonErr) {
                console.error('Error checking scheduled sermons for church ' + churchId + ':', sermonErr);
            }
            // ─── 3. Check Scheduled Bible Quizzes (Release & Broadcast at exact scheduled time) ───
            if (churchId && churchId !== 'global') {
                try {
                    const quizzesSnapshot = await churchDoc.ref.collection('bibleQuizzes')
                        .where('status', '==', 'scheduled')
                        .get();
                    const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
                    const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }); // HH:MM
                    for (const quizDoc of quizzesSnapshot.docs) {
                        const quiz = quizDoc.data();
                        if (quiz.scheduledNotified)
                            continue;
                        const qDate = quiz.scheduledDate || '';
                        const qTime = quiz.scheduledTime || '00:00';
                        // Check if scheduled time has arrived or passed
                        if (qDate && (qDate < nowStr || (qDate === nowStr && qTime <= nowTime))) {
                            const quizTitle = quiz.title || 'Bible Quiz';
                            const pushTitle = `📖 Bible Quiz is Now Live: ${quizTitle}`;
                            const pushBody = `The scheduled Bible quiz is now unlocked and available to play! Tap to test your knowledge.`;
                            const payload = {
                                notification: { title: pushTitle, body: pushBody },
                                data: {
                                    type: 'quiz',
                                    quizId: quizDoc.id,
                                    id: quizDoc.id,
                                    relatedId: quizDoc.id,
                                    screen: 'BibleQuizDetail',
                                    churchId: churchId,
                                },
                                topic: `church_${churchId}`,
                            };
                            await getMessaging().send(payload).catch((e) => console.error('Error sending Quiz Live notification', e));
                            // Record in broadcasts so members see in Updates
                            await churchDoc.ref.collection('broadcasts').add({
                                title: pushTitle,
                                content: pushBody,
                                type: 'quiz',
                                id: quizDoc.id,
                                quizId: quizDoc.id,
                                relatedId: quizDoc.id,
                                screen: 'BibleQuizDetail',
                                churchId: churchId,
                                silent: true,
                                createdAt: FieldValue.serverTimestamp(),
                            }).catch(() => { });
                            // Record in notifications
                            await churchDoc.ref.collection('notifications').add({
                                title: pushTitle,
                                body: pushBody,
                                type: 'quiz',
                                id: quizDoc.id,
                                quizId: quizDoc.id,
                                relatedId: quizDoc.id,
                                screen: 'BibleQuizDetail',
                                churchId: churchId,
                                read: false,
                                createdAt: FieldValue.serverTimestamp(),
                            }).catch(() => { });
                            // Mark quiz as published and notified
                            await quizDoc.ref.update({
                                status: 'published',
                                scheduledNotified: true,
                                updatedAt: FieldValue.serverTimestamp(),
                            }).catch(() => { });
                        }
                    }
                }
                catch (quizErr) {
                    console.error(`Error checking scheduled quizzes for church ${churchId}:`, quizErr);
                }
            }
            // ─── 4. Check YouTube Live Status for this church ───
            try {
                await checkChurchYouTubeLive(churchDoc, churchId, db);
            }
            catch (ytErr) {
                console.warn(`Notice checking YouTube Live for church ${churchId}:`, ytErr);
            }
        }
        // ─── Check Scheduled Sermons for active Rhema Church collection ───
        try {
            const rhemaChurchRef = db.collection('Rhema Church').doc('rhema');
            await checkAndPublishScheduledSermons(rhemaChurchRef.collection('sermons'), 'rhema', rhemaChurchRef);
        }
        catch (schedSermonErr) {
            console.warn('Error checking scheduled sermons for Rhema Church in monitorMeetingLive:', schedSermonErr);
        }
        // ─── Check YouTube Live for active Rhema Church collection (Single Church) ───
        try {
            const rhemaChurchRef = db.collection('Rhema Church').doc('rhema');
            const rhemaDoc = await rhemaChurchRef.get();
            if (rhemaDoc.exists) {
                await checkChurchYouTubeLive(rhemaDoc, 'rhema', db);
            }
        }
        catch (rhemaYtErr) {
            console.warn('Error checking YouTube Live for Rhema Church in monitorMeetingLive:', rhemaYtErr);
        }
        // ─── 4. Check Super Admin Daily Bible Quiz Scheduled Notification ───
        try {
            await sendDailyQuizNotificationInternal(false);
        }
        catch (dailySchedErr) {
            console.warn('Notice checking daily quiz schedule in monitorMeetingLive:', dailySchedErr);
        }
    }
    catch (error) {
        console.error('Error in checkOnlineMeetings cron job:', error);
    }
});
const YOUTUBE_DATA_API_KEY = 'AIzaSyBGkm7DNk_jpM-XKJI0JPk_vJlufS4Q7-Q';
const ytChannelCache = {};
/**
 * Resolves the YouTube channel ID from a channel handle or URL.
 */
async function resolveYouTubeChannelId(rawYtUrl) {
    const clean = rawYtUrl.trim();
    if (ytChannelCache[clean])
        return ytChannelCache[clean] || null;
    if (clean.includes('/channel/')) {
        const parts = clean.split('/channel/')[1];
        if (parts) {
            const cid = parts.split('/')[0]?.split('?')[0];
            if (cid) {
                ytChannelCache[clean] = cid;
                return cid;
            }
        }
    }
    let handle = '';
    if (clean.includes('@')) {
        const parts = clean.split('@')[1];
        if (parts) {
            handle = parts.split('/')[0]?.split('?')[0] || '';
        }
    }
    else if (!clean.startsWith('http') && !clean.startsWith('UC')) {
        handle = clean.replace(/^@/, '');
    }
    if (handle) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${YOUTUBE_DATA_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                const cid = data.items[0]?.id;
                if (cid) {
                    ytChannelCache[clean] = cid;
                    return cid;
                }
            }
        }
        catch (_) { }
    }
    if (clean.startsWith('UC') && clean.length > 20) {
        ytChannelCache[clean] = clean;
        return clean;
    }
    return null;
}
/**
 * 🔴 Automatically check if church's YouTube channel is currently streaming live.
 * Uses the official YouTube Data API v3 (reliable in cloud datacenters) with scrape fallback.
 * When a stream starts, immediately dispatches push notification to topic church_{churchId}
 * and adds to broadcasts, saving live state directly on the church document (NO extra documents or subcollections).
 */
/**
 * Formats meaningful, uplifting, church-appropriate notification titles and messages for YouTube Live broadcasts.
 */
function formatLiveNotification(churchName, rawTitle) {
    return {
        pushTitle: '🔴 We Are LIVE Now!',
        pushBody: "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!",
    };
}
async function checkChurchYouTubeLive(churchDoc, churchId, db) {
    if (!churchId || churchId === 'global')
        return;
    const cData = churchDoc.data() || {};
    let rawYtUrl = cData.socialLinks?.youtube?.trim();
    // Fix typos in raw URL
    rawYtUrl = rawYtUrl.replace(/https?:\/\/(www\w*)\.(?:yyoutube|youtube)\.com/i, 'https://www.youtube.com');
    rawYtUrl = rawYtUrl.replace(/Brothersinchhristfellowship/gi, 'Brothersinchristfellowship');
    // Single-church default fallback
    if (!rawYtUrl && churchId === 'rhema') {
        rawYtUrl = 'https://www.youtube.com/@Brothersinchristfellowship/live';
    }
    if (!rawYtUrl)
        return;
    try {
        let isLive = false;
        let videoId = '';
        let streamTitle = '';
        // ── Method 1: Official YouTube Data API v3 (100% reliable in Google Cloud) ──
        const channelId = await resolveYouTubeChannelId(rawYtUrl);
        if (channelId) {
            try {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${YOUTUBE_DATA_API_KEY}`;
                const apiRes = await fetch(searchUrl);
                if (apiRes.ok) {
                    const apiData = await apiRes.json();
                    if (apiData.items && apiData.items.length > 0) {
                        isLive = true;
                        videoId = apiData.items[0].id?.videoId || '';
                        streamTitle = apiData.items[0].snippet?.title || '';
                        console.log(`🔴 [YouTube API] Live stream detected for church ${churchId}: ${videoId} - "${streamTitle}"`);
                    }
                }
            }
            catch (apiErr) {
                console.warn('[checkChurchYouTubeLive] YouTube API query notice:', apiErr);
            }
        }
        // ── Method 2: Scrape Fallback (if API quota or network fails) ──
        if (!isLive) {
            let liveCheckUrl = rawYtUrl;
            if (liveCheckUrl.includes('@') && !liveCheckUrl.includes('/live') && !liveCheckUrl.includes('/streams')) {
                liveCheckUrl = liveCheckUrl.endsWith('/') ? `${liveCheckUrl}live` : `${liveCheckUrl}/live`;
            }
            else if (liveCheckUrl.includes('/channel/') && !liveCheckUrl.includes('/live')) {
                liveCheckUrl = liveCheckUrl.endsWith('/') ? `${liveCheckUrl}live` : `${liveCheckUrl}/live`;
            }
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 6000);
                const res = await fetch(liveCheckUrl, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                }).catch(() => null);
                clearTimeout(timeout);
                if (res && res.ok) {
                    const html = await res.text().catch(() => '');
                    if ((html.includes('"isLive":true') ||
                        html.includes('"style":"LIVE"') ||
                        html.includes('LIVE_STREAM') ||
                        html.includes('"status":"LIVE"')) &&
                        !html.includes('"isUpcoming":true')) {
                        isLive = true;
                        const match = (res.url && res.url.match(/watch\?v=([\w-]{11})/)) ||
                            html.match(/"videoId":"([\w-]{11})"/) ||
                            html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})">/) ||
                            html.match(/"liveStreamability".*?"videoId":"([^"]+)"/) ||
                            html.match(/"videoRenderer".*?"videoId":"([^"]+)"/);
                        if (match && match[1])
                            videoId = match[1];
                        const titleMatch = html.match(/<title>([^<]+)<\/title>/) ||
                            html.match(/"title":{"runs":\[{"text":"([^"]+)"}\]}/) ||
                            html.match(/<meta name="title" content="([^"]+)"/);
                        if (titleMatch && titleMatch[1]) {
                            streamTitle = titleMatch[1].replace(/ - YouTube$/i, '').trim();
                        }
                    }
                }
            }
            catch (_) { }
        }
        const prevState = cData.youtubeLiveState || { isLive: false };
        const liveWatchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawYtUrl;
        if (isLive) {
            // Clean up streamTitle if it matched YouTube promo junk
            if (!streamTitle ||
                streamTitle.includes('Want to watch this again later') ||
                streamTitle.includes('Sign in to add this') ||
                streamTitle.toLowerCase() === 'youtube') {
                streamTitle = 'Join the live worship service now! 🎥🙏';
            }
            // Check if we already notified for this stream:
            // 1. Same videoId already notified
            // 2. Or prevState was already marked as isLive (same ongoing live session)
            // 3. Or last notification was sent less than 2 hours ago (strict cooldown)
            const lastNotifiedMillis = prevState?.lastNotifiedAt?.toMillis?.() ||
                (prevState?.lastNotifiedAt?._seconds ? prevState.lastNotifiedAt._seconds * 1000 : 0);
            const isWithinCooldown = lastNotifiedMillis > 0 && Date.now() - lastNotifiedMillis < 2 * 60 * 60 * 1000;
            const alreadyNotified = Boolean(prevState?.isLive) ||
                isWithinCooldown ||
                (Boolean(videoId) && prevState?.lastNotifiedVideoId === videoId);
            const resolvedVideoId = videoId || prevState?.videoId || '';
            // Save live state directly as a field on the church document (NO extra documents)
            await churchDoc.ref.set({
                youtubeLiveState: {
                    isLive: true,
                    url: liveWatchUrl,
                    videoId: resolvedVideoId,
                    title: streamTitle || prevState?.title || '',
                    lastChecked: FieldValue.serverTimestamp(),
                },
            }, { merge: true }).catch(() => { });
            // ONLY dispatch a push notification if NOT already notified AND we have a valid 11-char video ID
            if (!alreadyNotified && resolvedVideoId && resolvedVideoId.length === 11) {
                const churchName = cData.name || 'Rhema Global Ministries';
                const { pushTitle, pushBody } = formatLiveNotification(churchName, streamTitle);
                console.log(`🚨 Auto YouTube Live detected for church ${churchId} (${churchName})! Sending push...`);
                // 1. Send push to topic church_${churchId} with interactive "Join Live Now" action category
                const topicMessage = {
                    data: {
                        type: 'youtube_live',
                        videoId: resolvedVideoId,
                        url: liveWatchUrl,
                        churchId: churchId,
                        title: streamTitle || pushTitle,
                        pushTitle: pushTitle,
                        pushBody: pushBody,
                    },
                    topic: `church_${churchId}`,
                    android: {
                        priority: 'high',
                    },
                    apns: {
                        headers: { 'apns-priority': '10' },
                        payload: {
                            aps: {
                                alert: {
                                    title: pushTitle,
                                    body: pushBody,
                                },
                                sound: 'default',
                                badge: 1,
                                category: 'youtube_live',
                            },
                        },
                    },
                };
                await getMessaging()
                    .send(topicMessage)
                    .catch((e) => console.error('Error sending YouTube Live topic push:', e));
                // 2. Add to existing broadcasts subcollection
                const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                await churchDoc.ref.collection('broadcasts').add({
                    title: pushTitle,
                    content: pushBody,
                    date: dateStr,
                    type: 'youtube_live',
                    url: liveWatchUrl,
                    videoId: resolvedVideoId,
                    silent: true,
                    createdAt: FieldValue.serverTimestamp(),
                }).catch(() => { });
                // 3. Mark lastNotifiedVideoId in youtubeLiveState
                await churchDoc.ref.set({
                    youtubeLiveState: {
                        lastNotifiedVideoId: resolvedVideoId,
                        lastNotifiedAt: FieldValue.serverTimestamp(),
                    },
                }, { merge: true }).catch(() => { });
            }
        }
        else {
            // Offline: reset isLive on church document if previously live
            if (prevState?.isLive) {
                await churchDoc.ref.set({
                    youtubeLiveState: {
                        isLive: false,
                        lastChecked: FieldValue.serverTimestamp(),
                    },
                }, { merge: true }).catch(() => { });
            }
        }
    }
    catch (err) {
        console.warn(`[checkChurchYouTubeLive] Notice for church ${churchId}:`, err?.message);
    }
}
/**
 * 🏛️ NOTIFY SUPER ADMINS OF NEW CHURCH REGISTRATION
 * Triggered automatically when a new church document is created in Firestore.
 */
export const pushNewChurchRegistered = onDocumentCreated('churches/{churchId}', async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const church = snap.data();
    const churchId = event.params.churchId;
    const churchName = church.name || 'A New Church';
    const regDate = church.createdAt?.toDate ? church.createdAt.toDate() : new Date();
    const dateFormatted = regDate.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    });
    const timeFormatted = regDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
    });
    const dateTimeStr = `${dateFormatted} at ${timeFormatted}`;
    const title = '🏛️ New Church Registered';
    const pastorInfo = church.pastorName || church.adminName ? ` (Pastor: ${church.pastorName || church.adminName})` : '';
    const body = `"${churchName}"${pastorInfo} was registered on ${dateTimeStr}.`;
    const db = getFirestore();
    const messaging = getMessaging();
    try {
        // 1. Query all platform super admins
        const adminsSnapshot = await db.collection('platform_admins').get();
        if (adminsSnapshot.empty) {
            console.log('ℹ️ No platform super admins found in Firestore.');
            return;
        }
        const adminIds = adminsSnapshot.docs.map(d => d.id);
        const tokens = [];
        for (const adminId of adminIds) {
            const userSnap = await db.collection('users').doc(adminId).get();
            const data = userSnap.data();
            if (data?.fcmToken && typeof data.fcmToken === 'string') {
                tokens.push(data.fcmToken);
            }
        }
        // 2. Multicast push to Super Admin devices
        if (tokens.length > 0) {
            const payload = {
                notification: { title, body },
                data: {
                    type: 'new_church',
                    churchId,
                    churchName,
                    registrationDate: dateTimeStr,
                },
                tokens,
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'daily_verse',
                        sound: 'default',
                    },
                },
            };
            const response = await messaging.sendEachForMulticast(payload);
            console.log(`✅ Sent new church notification to ${response.successCount} super admin device(s).`);
        }
        // 3. Also send to topic 'platform_super_admins'
        try {
            await messaging.send({
                topic: 'platform_super_admins',
                notification: { title, body },
                data: {
                    type: 'new_church',
                    churchId,
                    churchName,
                    registrationDate: dateTimeStr,
                },
            });
        }
        catch (topicErr) {
            console.log('ℹ️ Topic broadcast completed or skipped');
        }
        // 4. Log in platform_notifications collection
        await db.collection('platform_notifications').add({
            type: 'new_church',
            title,
            body,
            churchId,
            churchName,
            pastorName: church.pastorName || church.adminName || '',
            registrationDateTime: dateTimeStr,
            createdAt: FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        console.error('❌ Error sending new church super admin notification:', error);
    }
});
/**
 * 📖 NOTIFY CHURCH MEMBERS OF PUBLISHED BIBLE QUIZ
 * Triggered automatically when an Admin creates or publishes a Bible Quiz in Firestore.
 * Dispatches push notification to topic church_{churchId} and multicast tokens.
 */
async function sendBibleQuizPublishNotification(churchId, quizId, quiz) {
    const db = getFirestore();
    const messaging = getMessaging();
    const title = `📖 New Bible Quiz: ${quiz.title || 'Challenge Your Bible Knowledge'}`;
    const details = quiz.book
        ? `${quiz.book}${quiz.chapterStart ? ` (Ch. ${quiz.chapterStart}${quiz.chapterEnd && quiz.chapterEnd !== quiz.chapterStart ? `-${quiz.chapterEnd}` : ''})` : ''}`
        : (quiz.topic || quiz.category || 'Holy Scripture');
    const body = `A new Bible quiz is now live: "${details}". Tap to test your knowledge!`;
    const notificationData = {
        type: 'quiz',
        quizId: String(quizId),
        id: String(quizId),
        relatedId: String(quizId),
        churchId: String(churchId),
        screen: 'BibleQuizDetail',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    // 1. Send to church topic (instant broadcast to all members subscribed to this church)
    if (churchId && churchId !== 'global') {
        try {
            await messaging.send({
                notification: { title, body },
                data: notificationData,
                topic: `church_${churchId}`,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        priority: 'max',
                        channelId: 'church_alerts',
                    },
                },
                apns: {
                    headers: { 'apns-priority': '10' },
                    payload: { aps: { sound: 'default', badge: 1 } },
                },
            });
            console.log(`✅ Sent Bible quiz notification to topic: church_${churchId}`);
        }
        catch (topicErr) {
            console.warn(`Error sending quiz notification to topic church_${churchId}:`, topicErr);
        }
    }
    // 2. Also send multicast to registered tokens in users and members
    try {
        const tokenSet = new Set();
        if (churchId && churchId !== 'global') {
            const usersSnap = await db.collection('users').where('primaryChurchId', '==', churchId).get();
            usersSnap.forEach((doc) => {
                const u = doc.data();
                if (u.fcmToken)
                    tokenSet.add(u.fcmToken);
            });
            const membersSnap = await db.collection('churches').doc(churchId).collection('members').get();
            membersSnap.forEach((doc) => {
                const m = doc.data();
                if (m.fcmToken)
                    tokenSet.add(m.fcmToken);
            });
        }
        else {
            const usersSnap = await db.collection('users').limit(500).get();
            usersSnap.forEach((doc) => {
                const u = doc.data();
                if (u.fcmToken)
                    tokenSet.add(u.fcmToken);
            });
        }
        const tokens = Array.from(tokenSet);
        if (tokens.length > 0) {
            const response = await messaging.sendEachForMulticast({
                notification: { title, body },
                data: notificationData,
                tokens,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        priority: 'max',
                        channelId: 'church_alerts',
                    },
                },
                apns: {
                    headers: { 'apns-priority': '10' },
                    payload: { aps: { sound: 'default', badge: 1 } },
                },
            });
            console.log(`✅ Sent Bible quiz multicast notification to ${response.successCount} devices (${response.failureCount} failed).`);
        }
    }
    catch (multicastErr) {
        console.error('Error sending multicast quiz notification:', multicastErr);
    }
    // 3. Write in-app notification document
    if (churchId && churchId !== 'global') {
        try {
            await db.collection('churches').doc(churchId).collection('notifications').add({
                type: 'quiz',
                title,
                body,
                quizId,
                quizTitle: quiz.title || '',
                category: quiz.category || '',
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            });
        }
        catch (dbErr) {
            console.warn('Error saving quiz in-app notification:', dbErr);
        }
    }
}
export const pushBibleQuizCreated = onDocumentCreated('churches/{churchId}/bibleQuizzes/{quizId}', async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const quiz = snap.data();
    if (quiz?.status !== 'published')
        return;
    const churchId = event.params.churchId;
    const quizId = event.params.quizId;
    await sendBibleQuizPublishNotification(churchId, quizId, quiz);
    try {
        await snap.ref.update({ notificationSent: true });
    }
    catch (e) { }
});
export const pushBibleQuizUpdated = onDocumentUpdated('churches/{churchId}/bibleQuizzes/{quizId}', async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const before = snap.before.data();
    const after = snap.after.data();
    // If status transitioned to 'published' and notification hasn't been sent yet
    if (before?.status !== 'published' && after?.status === 'published' && !after?.notificationSent) {
        const churchId = event.params.churchId;
        const quizId = event.params.quizId;
        await sendBibleQuizPublishNotification(churchId, quizId, after);
        try {
            await snap.after.ref.update({ notificationSent: true });
        }
        catch (e) { }
    }
});
/**
 * 📖 SEND DAILY BIBLE QUIZ NOTIFICATION (Core Engine)
 * Dispatches the daily Bible quiz challenge to church members.
 * Supports:
 * - Direct FCM Multicast to all registered device tokens with sound, max priority, and channelId 'daily_quiz'
 * - FCM Topic broadcast to each active church topic (church_{churchId})
 * - Logging into broadcasts and notifications subcollections for all churches
 * - Idempotency tracking via lastBroadcastDate
 */
export async function sendDailyQuizNotificationInternal(force = false) {
    const db = getFirestore();
    const messaging = getMessaging();
    // 1. Current date and time in IST (Asia/Kolkata)
    const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dStr = `${nowIst.getFullYear()}-${String(nowIst.getMonth() + 1).padStart(2, '0')}-${String(nowIst.getDate()).padStart(2, '0')}`;
    const nowTime = `${String(nowIst.getHours()).padStart(2, '0')}:${String(nowIst.getMinutes()).padStart(2, '0')}`;
    console.log(`⏰ [DailyQuiz] Checking daily quiz schedule at IST ${nowTime} for date ${dStr} (force=${force})`);
    // 2. Read Super Admin schedule settings from Firestore
    let dailyConfig = null;
    let scheduleDocRef = null;
    try {
        const globalDoc = await db.collection('Rhema Church').doc('rhema').collection('settings').doc('daily_quiz_schedule').get();
        if (globalDoc.exists) {
            dailyConfig = globalDoc.data();
            scheduleDocRef = globalDoc.ref;
        }
        else {
            const rootDoc = await db.collection('settings').doc('daily_quiz_schedule').get();
            if (rootDoc.exists) {
                dailyConfig = rootDoc.data();
                scheduleDocRef = rootDoc.ref;
            }
        }
    }
    catch (err) {
        console.warn('[DailyQuiz] Notice reading daily_quiz_schedule settings:', err);
    }
    // Check if disabled by Super Admin
    if (dailyConfig && dailyConfig.enabled === false && !force) {
        console.log('🔇 [DailyQuiz] Automation is disabled in Super Admin settings.');
        return { success: false, sentCount: 0, message: 'Disabled in Super Admin settings' };
    }
    // Check scheduled time (default: 06:00 AM)
    const targetTime = dailyConfig?.time24 || dailyConfig?.scheduledTime || '06:00';
    if (!force) {
        if (dailyConfig?.lastBroadcastDate === dStr) {
            console.log(`ℹ️ [DailyQuiz] Already broadcasted today (${dStr}).`);
            return { success: true, sentCount: 0, message: 'Already sent today' };
        }
        if (nowTime < targetTime) {
            console.log(`⏳ [DailyQuiz] Current time ${nowTime} is before scheduled time ${targetTime}. Waiting for scheduled time.`);
            return { success: false, sentCount: 0, message: `Scheduled for ${targetTime}` };
        }
    }
    // ── ATOMIC EARLY IDEMPOTENCY GUARD ─────────────────────────────────────────
    // Write lastBroadcastDate NOW — before any network I/O — so that any other
    // concurrent scheduler invocation (automatedDailyQuiz / periodicDailyQuizSafetyNet
    // / monitorMeetingLive) that reads Firestore will see today's date and exit early.
    try {
        const earlyLockPayload = { lastBroadcastDate: dStr, lastBroadcastAt: FieldValue.serverTimestamp() };
        if (scheduleDocRef) {
            await scheduleDocRef.set(earlyLockPayload, { merge: true });
        }
        else {
            await db.collection('Rhema Church').doc('rhema').collection('settings').doc('daily_quiz_schedule').set(earlyLockPayload, { merge: true });
        }
        await db.collection('settings').doc('daily_quiz_schedule').set(earlyLockPayload, { merge: true });
        console.log(`🔒 [DailyQuiz] Idempotency lock acquired for ${dStr}. Proceeding with delivery...`);
    }
    catch (lockErr) {
        console.warn('[DailyQuiz] Could not acquire idempotency lock; continuing anyway:', lockErr);
    }
    const dParts = dStr.split('-');
    const displayDateStr = dParts.length === 3 ? `${dParts[2]}-${dParts[1]}-${dParts[0]}` : dStr;
    const pushTitle = dailyConfig?.customTitle || '📖 Daily Bible Quiz is Live!';
    const pushBody = dailyConfig?.customBody || `Today's Scripture challenge (${displayDateStr}) is ready. Test your knowledge and reflect on God's Word!`;
    const quizId = `daily_quiz_${dStr}`;
    const notificationData = {
        type: 'bible_quiz',
        quizId: quizId,
        id: quizId,
        relatedId: quizId,
        scheduledDate: dStr,
        screen: 'BibleQuizDetail',
        churchId: 'global',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    // 3. Collect registered FCM tokens from users and members
    const tokenSet = new Set();
    try {
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach((doc) => {
            const data = doc.data();
            if (data?.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.trim().length > 10) {
                tokenSet.add(data.fcmToken.trim());
            }
        });
        const membersSnap = await db.collectionGroup('members').get();
        membersSnap.forEach((doc) => {
            const data = doc.data();
            if (data?.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.trim().length > 10) {
                tokenSet.add(data.fcmToken.trim());
            }
        });
    }
    catch (tokenErr) {
        console.warn('[DailyQuiz] Error collecting user tokens:', tokenErr);
    }
    const tokens = Array.from(tokenSet);
    let multicastSuccess = 0;
    let multicastFailed = 0;
    // 4. Send high-priority multicast push to all registered devices (in batches of 500)
    if (tokens.length > 0) {
        for (let i = 0; i < tokens.length; i += 500) {
            const batchTokens = tokens.slice(i, i + 500);
            try {
                const fcmResponse = await messaging.sendEachForMulticast({
                    notification: {
                        title: pushTitle,
                        body: pushBody,
                    },
                    data: notificationData,
                    tokens: batchTokens,
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            priority: 'max',
                            channelId: 'daily_quiz',
                        },
                    },
                    apns: {
                        headers: { 'apns-priority': '10' },
                        payload: { aps: { sound: 'default', badge: 1 } },
                    },
                });
                multicastSuccess += fcmResponse.successCount;
                multicastFailed += fcmResponse.failureCount;
            }
            catch (batchErr) {
                console.error('[DailyQuiz] Multicast batch send error:', batchErr);
            }
        }
        console.log(`✅ [DailyQuiz] Multicast push sent: ${multicastSuccess} success, ${multicastFailed} failed.`);
    }
    // 5. Log in broadcasts/notifications for each church (silent — push already sent via multicast above)
    // NOTE: Topic broadcast has been intentionally REMOVED to prevent duplicate deliveries.
    // Users subscribed to church_{churchId} topics would receive BOTH the direct multicast push
    // AND the topic push, resulting in 2× (or more) notifications. Delivery is solely via multicast.
    try {
        const churchesSnap = await db.collection('churches').get();
        for (const cDoc of churchesSnap.docs) {
            const churchId = cDoc.id;
            if (churchId === 'global')
                continue;
            // Add to broadcasts collection (silent — no secondary push)
            await cDoc.ref.collection('broadcasts').add({
                title: pushTitle,
                content: pushBody,
                type: 'quiz',
                quizId: quizId,
                id: quizId,
                relatedId: quizId,
                screen: 'BibleQuizDetail',
                churchId: churchId,
                silent: true,
                createdAt: FieldValue.serverTimestamp(),
            }).catch(() => { });
            // Add to notifications collection
            await cDoc.ref.collection('notifications').add({
                title: pushTitle,
                body: pushBody,
                type: 'quiz',
                quizId: quizId,
                id: quizId,
                relatedId: quizId,
                screen: 'BibleQuizDetail',
                churchId: churchId,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            }).catch(() => { });
        }
    }
    catch (churchErr) {
        console.warn('[DailyQuiz] Error logging to churches:', churchErr);
    }
    // 6. Update lastBroadcastDate record with final delivery count (lock was already written at Step 0)
    try {
        const updatePayload = {
            lastBroadcastDate: dStr,
            lastBroadcastAt: FieldValue.serverTimestamp(),
            lastSuccessCount: multicastSuccess,
        };
        if (scheduleDocRef) {
            await scheduleDocRef.set(updatePayload, { merge: true });
        }
        else {
            await db.collection('Rhema Church').doc('rhema').collection('settings').doc('daily_quiz_schedule').set(updatePayload, { merge: true });
        }
        await db.collection('settings').doc('daily_quiz_schedule').set(updatePayload, { merge: true });
    }
    catch (recordErr) {
        console.warn('[DailyQuiz] Error updating lastBroadcastDate record:', recordErr);
    }
    console.log(`🎉 [DailyQuiz] Successfully delivered for ${dStr} (${multicastSuccess} devices reached)`);
    return { success: true, sentCount: multicastSuccess, message: `Delivered to ${multicastSuccess} devices` };
}
/**
 * ⏰ AUTOMATED DAILY BIBLE QUIZ SCHEDULER
 * Scheduled to run every day at 06:00 AM IST (12:30 AM UTC)
 * Automatically delivers the Daily Bible Quiz push notification to members worldwide.
 */
export const automatedDailyQuiz = onSchedule({ schedule: '0 6 * * *', timeZone: 'Asia/Kolkata' }, async (event) => {
    console.log('⏰ Running automatedDailyQuiz 06:00 AM IST scheduler...');
    await sendDailyQuizNotificationInternal(false);
});
/**
 * ⏰ PERIODIC SCHEDULED QUIZ SAFETY NET
 * Runs every 15 minutes between 05:00 AM and 09:00 AM IST
 * Ensures that if Super Admin configured a custom delivery time or a temporary network glitch occurred at 06:00,
 * the daily quiz is automatically delivered as soon as the scheduled time is reached.
 */
export const periodicDailyQuizSafetyNet = onSchedule({ schedule: '*/15 5-9 * * *', timeZone: 'Asia/Kolkata' }, async (event) => {
    await sendDailyQuizNotificationInternal(false);
});
/**
 * 🚀 TRIGGER DAILY QUIZ NOTIFICATION (HTTP / Super Admin Test Endpoint)
 * Invokable endpoint for Super Admin to manually trigger or test the daily quiz push immediately.
 */
export const triggerDailyQuizNotificationHttp = onRequest({ cors: true }, async (req, res) => {
    try {
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await sendDailyQuizNotificationInternal(force);
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * 🧪 HTTP endpoint to manually check and publish scheduled sermons
 */
export const triggerPublishScheduledSermonsHttp = onRequest({ cors: true }, async (req, res) => {
    const db = getFirestore();
    const rhemaChurchRef = db.collection('Rhema Church').doc('rhema');
    await checkAndPublishScheduledSermons(rhemaChurchRef.collection('sermons'), 'rhema', rhemaChurchRef);
    res.json({ success: true, message: 'Scheduled sermons check completed.' });
});
/**
 * 📖 AUTOMATED DAILY VERSE MULTICAST PUSH (English & Telugu)
 * Determines the current slot (Morning, Afternoon, Evening, Night) or uses slotOverride.
 * Queries today's verse from 'daily_verses' and sends two simultaneous FCM push notifications:
 * 1. English notification ('✝️ Good Morning' + verseEn + referenceEn)
 * 2. Telugu notification ('✝️ శుభోదయం' + verseTe + referenceTe)
 */
/**
 * ⏰ SCHEDULED DAILY VERSE PUSH
 * Automatically dispatches Daily Verse push notifications 4 times a day:
 * Morning (06:00 AM IST), Afternoon (12:00 PM IST), Evening (06:00 PM IST), Night (09:00 PM IST)
 */
export const sendDailyVersePushScheduled = onSchedule({
    schedule: '0 6,12,18,21 * * *',
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',
}, async () => {
    console.log('⏰ [sendDailyVersePushScheduled] Running scheduled Daily Verse push...');
    await sendDailyVersePushInternal();
});
/**
 * 📖 AUTOMATED DAILY VERSE MULTICAST PUSH (English & Telugu)
 * Determines the current slot (Morning, Afternoon, Evening, Night) or uses slotOverride.
 * Queries today's verse for Rhema Church and dispatches FCM push notifications:
 * 1. Multicast to registered member tokens (Rhema members & users)
 * 2. Topic broadcast to 'church_rhema' for 100% member delivery
 */
export async function sendDailyVersePushInternal(slotOverride, targetChurchId = 'rhema', force = false) {
    if (getApps().length === 0) {
        initializeApp();
    }
    const db = getFirestore();
    const messaging = getMessaging();
    // 1. Determine period slot
    const PERIOD_SLOTS = {
        Morning: {
            index: 0,
            title: "Good Morning\nToday's Verse (నేటి వాక్యం)",
            titleEn: "Good Morning",
            titleTe: "Today's Verse (నేటి వాక్యం)",
        },
        Afternoon: {
            index: 1,
            title: "Blessed Afternoon\nDaily Peace (అనుదిన శాంతి)",
            titleEn: "Blessed Afternoon",
            titleTe: "Daily Peace (అనుదిన శాంతి)",
        },
        Evening: {
            index: 2,
            title: "Evening Prayer\nFaith & Grace (విశ్వాసం - కృప)",
            titleEn: "Evening Prayer",
            titleTe: "Faith & Grace (విశ్వాసం - కృప)",
        },
        Night: {
            index: 3,
            title: "Good Night\nGod's Protection (దేవుని కాపుదల)",
            titleEn: "Good Night",
            titleTe: "God's Protection (దేవుని కాపుదల)",
        },
    };
    const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    let slot = slotOverride;
    if (!slot || !PERIOD_SLOTS[slot]) {
        const hour = nowIst.getHours();
        if (hour >= 5 && hour < 12) {
            slot = 'Morning';
        }
        else if (hour >= 12 && hour < 17) {
            slot = 'Afternoon';
        }
        else if (hour >= 17 && hour < 21) {
            slot = 'Evening';
        }
        else {
            slot = 'Night';
        }
    }
    const slotInfo = PERIOD_SLOTS[slot] || PERIOD_SLOTS.Morning;
    const todayStr = `${nowIst.getFullYear()}-${String(nowIst.getMonth() + 1).padStart(2, '0')}-${String(nowIst.getDate()).padStart(2, '0')}`;
    const slotLockKey = `${todayStr}_${slot}`;
    console.log(`[sendDailyVersePushInternal] Running for slot: ${slot} (slot index: ${slotInfo.index}, lock key: ${slotLockKey})`);
    // ── ATOMIC DISTRIBUTED IDEMPOTENCY LOCK ──────────────────────────────
    // Prevents duplicate deliveries when Google Cloud Scheduler retries,
    // or multiple schedulers/endpoints fire concurrently within the same slot.
    if (!force) {
        const lockRef = db.collection('Rhema Church').doc(targetChurchId).collection('settings').doc('daily_verse_lock');
        let lockAcquired = false;
        try {
            lockAcquired = await db.runTransaction(async (transaction) => {
                const lockSnap = await transaction.get(lockRef);
                if (lockSnap.exists) {
                    const lockData = lockSnap.data() || {};
                    if (lockData.lastSlotKey === slotLockKey) {
                        console.log(`🔒 [DailyVerse] Slot '${slotLockKey}' was already dispatched at ${lockData.dispatchedAt ? new Date(lockData.dispatchedAt.toMillis?.() || lockData.dispatchedAt).toISOString() : 'earlier'}. Skipping duplicate.`);
                        return false;
                    }
                }
                transaction.set(lockRef, {
                    lastSlotKey: slotLockKey,
                    slot: slot,
                    date: todayStr,
                    dispatchedAt: FieldValue.serverTimestamp(),
                    targetChurchId: targetChurchId,
                }, { merge: true });
                return true;
            });
        }
        catch (txErr) {
            console.warn('[DailyVerse] Transaction lock acquisition failed/contended:', txErr);
            return { success: true, message: `Concurrency contention for slot ${slotLockKey}, skipping duplicate delivery.`, skipped: true };
        }
        if (!lockAcquired) {
            return { success: true, message: `Daily verse already dispatched for slot ${slotLockKey}. Skipped duplicate.`, skipped: true };
        }
        console.log(`🔑 [DailyVerse] Lock acquired for slot ${slotLockKey}. Dispatching notification...`);
    }
    // 2. Compute today's verse index
    let totalVerses = 5863;
    try {
        const metaDoc = await db.collection('daily_verses_meta').doc('metadata').get();
        if (metaDoc.exists) {
            totalVerses = metaDoc.data()?.totalVerses || 5863;
        }
    }
    catch (_) { }
    const EPOCH = new Date('2026-10-30T00:00:00Z');
    const todayLocal = new Date(nowIst.getFullYear(), nowIst.getMonth(), nowIst.getDate());
    const epochDate = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    const daysSinceEpoch = Math.floor((todayLocal.getTime() - epochDate.getTime()) / (1000 * 60 * 60 * 24));
    // RHEMA has its own independent Scripture offset so it never displays the same verses as WeChristian
    const RHEMA_DAILY_VERSE_OFFSET = 2931;
    const offset = targetChurchId === 'rhema' ? RHEMA_DAILY_VERSE_OFFSET : 0;
    const targetIndex = (daysSinceEpoch * 4 + slotInfo.index + offset) % totalVerses;
    console.log(`[sendDailyVersePushInternal] Target verse index: ${targetIndex} (total: ${totalVerses}, offset: ${offset})`);
    // 3. Priority: Curated Thematic Daily Verses strictly matched to time of day & <= 130 chars:
    // - Morning: New beginnings, hope, strength, God's guidance
    // - Afternoon: Encouragement, wisdom, patience, staying strong
    // - Evening: Peace, gratitude, protection, trusting God
    // - Night: Rest, comfort, safety, God's care
    let verseDocData = null;
    let verseId = `thematic_${slot.toLowerCase()}_${daysSinceEpoch}`;
    try {
        const fsMod = await import('fs');
        const pathMod = await import('path');
        const candidates = [
            pathMod.join(process.cwd(), 'thematic_daily_verses.json'),
            pathMod.join(process.cwd(), 'src/thematic_daily_verses.json'),
            pathMod.join(process.cwd(), 'functions/thematic_daily_verses.json'),
            pathMod.join(process.cwd(), 'functions/src/thematic_daily_verses.json'),
            pathMod.join(process.cwd(), 'app/assets/thematic_daily_verses.json'),
            pathMod.join(process.cwd(), '../app/assets/thematic_daily_verses.json'),
        ];
        for (const p of candidates) {
            if (fsMod.existsSync(p)) {
                const raw = fsMod.readFileSync(p, 'utf-8');
                const data = JSON.parse(raw);
                const slotList = data[slot] || data.Morning;
                if (slotList && slotList.length > 0) {
                    const slotIdx = ((daysSinceEpoch % slotList.length) + slotList.length) % slotList.length;
                    verseDocData = slotList[slotIdx];
                    console.log(`✨ [sendDailyVersePushInternal] Selected curated thematic verse for slot '${slot}': ${verseDocData.referenceEn} - ${verseDocData.theme || ''}`);
                    break;
                }
            }
        }
    }
    catch (tErr) {
        console.warn('[sendDailyVersePushInternal] Could not load thematic verses:', tErr);
    }
    // Fallback: Query Firestore if thematic list not loaded
    try {
        const rhemaSnap = await db.collection('Rhema Church').doc('rhema').collection('daily_verses').where('index', '==', targetIndex).limit(1).get();
        if (!rhemaSnap.empty) {
            verseDocData = rhemaSnap.docs[0]?.data();
            verseId = rhemaSnap.docs[0]?.id || verseId;
        }
    }
    catch (_) { }
    if (!verseDocData) {
        try {
            const snap = await db.collection('daily_verses').where('index', '==', targetIndex).limit(1).get();
            if (!snap.empty) {
                verseDocData = snap.docs[0]?.data();
                verseId = snap.docs[0]?.id || verseId;
            }
        }
        catch (_) { }
    }
    // Fallback to bulk_verses.json if not found in Firestore
    if (!verseDocData) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const candidates = [
                path.join(process.cwd(), 'bulk_verses.json'),
                path.join(process.cwd(), '../bulk_verses.json'),
                path.join(process.cwd(), 'app/assets/bulk_verses.json'),
            ];
            for (const p of candidates) {
                if (fs.existsSync(p)) {
                    const raw = fs.readFileSync(p, 'utf-8');
                    const list = JSON.parse(raw);
                    if (list && list[targetIndex]) {
                        verseDocData = list[targetIndex];
                        break;
                    }
                }
            }
        }
        catch (_) { }
    }
    if (!verseDocData) {
        console.warn(`[sendDailyVersePushInternal] No verse found for index ${targetIndex}`);
        return { success: false, error: `Verse not found for index ${targetIndex}` };
    }
    // Feature requirement: Daily Bible Verses must be short (<= 130 chars) and fit within 2 lines
    // If the verse is a lengthy passage, select the nearest concise, inspiring verse
    if (verseDocData && ((verseDocData.verseEn && verseDocData.verseEn.length > 130) || (verseDocData.verseTe && verseDocData.verseTe.length > 130))) {
        try {
            const fsMod = await import('fs');
            const pathMod = await import('path');
            const candidates = [
                pathMod.join(process.cwd(), 'bulk_verses.json'),
                pathMod.join(process.cwd(), '../bulk_verses.json'),
                pathMod.join(process.cwd(), 'app/assets/bulk_verses.json'),
            ];
            for (const p of candidates) {
                if (fsMod.existsSync(p)) {
                    const raw = fsMod.readFileSync(p, 'utf-8');
                    const list = JSON.parse(raw);
                    if (list && list.length > 0) {
                        let hops = 0;
                        let curr = targetIndex;
                        while (hops < 15) {
                            curr = (curr + 1) % list.length;
                            if (list[curr] && list[curr].verseEn && list[curr].verseEn.length <= 130 && list[curr].verseTe && list[curr].verseTe.length <= 130) {
                                verseDocData = list[curr];
                                verseId = `verse_${curr}`;
                                break;
                            }
                            hops++;
                        }
                        break;
                    }
                }
            }
        }
        catch (_) { }
    }
    const verseEnText = verseDocData.verseEn || '';
    const refEnText = verseDocData.referenceEn || '';
    const verseTeText = verseDocData.verseTe || verseEnText;
    const refTeText = verseDocData.referenceTe || refEnText;
    // 4. Collect member device FCM tokens
    const tokenSet = new Set();
    try {
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach((d) => {
            const data = d.data();
            if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.length > 10) {
                tokenSet.add(data.fcmToken);
            }
        });
    }
    catch (_) { }
    try {
        const membersSnap = await db.collection('Rhema Church').doc('rhema').collection('members').get();
        membersSnap.forEach((d) => {
            const data = d.data();
            if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.length > 10) {
                tokenSet.add(data.fcmToken);
            }
        });
    }
    catch (_) { }
    const tokens = Array.from(tokenSet);
    console.log(`[sendDailyVersePushInternal] Collected ${tokens.length} FCM tokens for dispatch.`);
    let enSuccess = 0;
    let teSuccess = 0;
    // 4. Send EXACTLY ONE Unified Notification to the Church Topic (church_rhema)
    // Using Android 'tag' and 'collapseKey' guarantees that Android OS displays EXACTLY ONE banner.
    const unifiedTitle = slotInfo.title;
    let unifiedBody = '';
    const combinedRef = (refTeText && refEnText && refTeText !== refEnText)
        ? `${refTeText} | ${refEnText}`
        : (refTeText || refEnText);
    const cleanVerseTe = (verseTeText || '').replace(/^["“”']+|["“”']+$/g, '').trim();
    const cleanVerseEn = (verseEnText || '').replace(/^["“”']+|["“”']+$/g, '').trim();
    // Android notification shade collapses empty newlines unless there is a character.
    // Using '\n \n' guarantees a visible vertical gap below verses on Android and iOS.
    const GAP = '\n \n';
    if (cleanVerseTe && cleanVerseEn && cleanVerseTe !== cleanVerseEn) {
        unifiedBody = `${cleanVerseTe}${GAP}${cleanVerseEn}${GAP}${combinedRef}`;
    }
    else {
        unifiedBody = `${cleanVerseTe || cleanVerseEn}${GAP}${combinedRef}`;
    }
    try {
        const topicMessage = {
            topic: `church_${targetChurchId}`,
            notification: {
                title: unifiedTitle,
                body: unifiedBody,
            },
            data: {
                type: 'daily_verse',
                verseId: verseId,
                period: slot,
                churchId: targetChurchId,
            },
            android: {
                priority: 'high',
                collapseKey: `daily_verse_${slot}`,
                notification: {
                    sound: 'default',
                    priority: 'max',
                    channelId: 'daily_verse',
                    tag: `daily_verse_${slot}`,
                },
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-collapse-id': `daily_verse_${slot}`,
                },
                payload: { aps: { sound: 'default', badge: 1 } },
            },
        };
        await messaging.send(topicMessage);
        console.log(`[sendDailyVersePushInternal] Successfully sent single unified notification to topic church_${targetChurchId}`);
    }
    catch (topicErr) {
        console.warn('[sendDailyVersePushInternal] Topic broadcast notice, falling back to member tokens:', topicErr);
        // Fallback: If topic broadcast fails, send a single unified message to member tokens
        if (tokens.length > 0) {
            for (let i = 0; i < tokens.length; i += 500) {
                const batchTokens = tokens.slice(i, i + 500);
                const batchMsg = {
                    notification: {
                        title: unifiedTitle,
                        body: unifiedBody,
                    },
                    data: {
                        type: 'daily_verse',
                        verseId: verseId,
                        period: slot,
                        churchId: targetChurchId,
                    },
                    android: {
                        priority: 'high',
                        collapseKey: `daily_verse_${slot}`,
                        notification: {
                            sound: 'default',
                            priority: 'max',
                            channelId: 'daily_verse',
                            tag: `daily_verse_${slot}`,
                        },
                    },
                    tokens: batchTokens,
                };
                try {
                    await messaging.sendEachForMulticast(batchMsg);
                }
                catch (_) { }
            }
        }
    }
    // 5. Log to broadcasts feed for historical viewing in Updates screen
    try {
        const rhemaChurchRef = db.collection('Rhema Church').doc('rhema');
        await rhemaChurchRef.collection('broadcasts').add({
            title: unifiedTitle,
            content: unifiedBody,
            date: todayStr,
            type: 'daily_verse',
            period: slot,
            verseId: verseId,
            silent: true,
            createdAt: FieldValue.serverTimestamp(),
        });
    }
    catch (bcastErr) {
        console.warn('[sendDailyVersePushInternal] Could not log to broadcasts:', bcastErr);
    }
    return {
        success: true,
        slot,
        targetIndex,
        verseReferenceEn: refEnText,
        verseReferenceTe: refTeText,
        totalTokens: tokens.length,
        sentEnCount: enSuccess,
        sentTeCount: teSuccess,
    };
}
/**
 * 🧪 HTTP endpoint to manually trigger the Daily Verse push (can specify ?slot=Morning/Afternoon/Evening/Night)
 */
export const triggerDailyVersePushHttp = onRequest({ cors: true, timeoutSeconds: 120, region: 'asia-south1' }, async (req, res) => {
    try {
        const slot = req.query.slot || req.body?.slot;
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await sendDailyVersePushInternal(slot, 'rhema', force);
        res.status(200).json(result);
    }
    catch (error) {
        console.error('triggerDailyVersePushHttp error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * 📢 CARE CELL ANNOUNCEMENT PUSH
 * Sends push notification when an announcement is posted in a Care Cell or Church-wide.
 */
export const pushCareCellAnnouncement = onDocumentCreated({ document: 'Rhema Church/{churchId}/careCellAnnouncements/{announcementId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const announcementId = event.params.announcementId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const announcementRef = snap.ref;
    const data = snap.data();
    // 1. Atomic deduplication
    let shouldSend = false;
    try {
        shouldSend = await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(announcementRef);
            if (!freshDoc.exists)
                return false;
            if (freshDoc.data()?.notificationSent === true)
                return false;
            transaction.update(announcementRef, {
                notificationSent: true,
                notificationSentAt: FieldValue.serverTimestamp(),
            });
            return true;
        });
    }
    catch (txErr) {
        console.warn('Transaction error checking notificationSent on careCellAnnouncement:', txErr);
        if (data?.notificationSent === true)
            return;
        shouldSend = true;
    }
    if (!shouldSend)
        return;
    const title = data.title || 'Care Cell Announcement';
    const message = data.message || '';
    const scope = data.scope || 'Cell';
    const cellName = data.cellName || 'Care Cell';
    const messaging = getMessaging();
    const notifTitle = scope === 'All_Cells' ? `📢 Church Notice: ${title}` : `📢 ${cellName}: ${title}`;
    const notifBody = message.length > 120 ? `${message.substring(0, 117)}...` : message;
    const payload = {
        notification: {
            title: notifTitle,
            body: notifBody,
        },
        data: {
            type: 'care_cell_announcement',
            title: notifTitle,
            body: notifBody,
            announcementId: String(announcementId),
            churchId: String(churchId),
            cellId: String(data.cellId || ''),
            scope: String(scope),
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
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
        topic: `church_${churchId}`,
    };
    try {
        await messaging.send(payload);
        console.log(`Successfully sent care cell announcement push for ${announcementId}`);
    }
    catch (err) {
        console.error('Error sending care cell announcement notification:', err);
    }
});
/**
 * 🤝 CARE CELL GATHERING / MEETING PUSH
 * Sends push notification when a new Care Cell meeting is scheduled.
 */
export const pushCareCellMeeting = onDocumentCreated({ document: 'Rhema Church/{churchId}/careCellMeetings/{meetingId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const meetingId = event.params.meetingId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const meetingRef = snap.ref;
    const data = snap.data();
    let shouldSend = false;
    try {
        shouldSend = await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(meetingRef);
            if (!freshDoc.exists)
                return false;
            if (freshDoc.data()?.notificationSent === true)
                return false;
            transaction.update(meetingRef, {
                notificationSent: true,
                notificationSentAt: FieldValue.serverTimestamp(),
            });
            return true;
        });
    }
    catch (txErr) {
        console.warn('Transaction error checking notificationSent on careCellMeeting:', txErr);
        if (data?.notificationSent === true)
            return;
        shouldSend = true;
    }
    if (!shouldSend)
        return;
    const title = data.title || 'Fellowship Gathering';
    const cellName = data.cellName || 'Care Cell';
    const dateStr = data.date || '';
    const timeStr = data.startTime || '7:00 PM';
    const messaging = getMessaging();
    const notifTitle = `🤝 ${cellName} Gathering`;
    const notifBody = `${title} on ${dateStr} at ${timeStr}. Tap to view Scripture & location!`;
    const payload = {
        notification: {
            title: notifTitle,
            body: notifBody,
        },
        data: {
            type: 'care_cell_meeting',
            title: notifTitle,
            body: notifBody,
            meetingId: String(meetingId),
            churchId: String(churchId),
            cellId: String(data.cellId || ''),
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
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
        topic: `church_${churchId}`,
    };
    try {
        await messaging.send(payload);
        console.log(`Successfully sent care cell meeting push for ${meetingId}`);
    }
    catch (err) {
        console.error('Error sending care cell meeting notification:', err);
    }
});
/**
 * 🙏 CARE CELL PRAYER REQUEST ADMIN PUSH
 * Alerts leaders and admins when a care cell member posts a prayer need.
 */
export const pushCareCellPrayerRequest = onDocumentCreated({ document: 'Rhema Church/{churchId}/careCellPrayerRequests/{requestId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const requestId = event.params.requestId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const reqRef = snap.ref;
    const data = snap.data();
    let shouldSend = false;
    try {
        shouldSend = await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(reqRef);
            if (!freshDoc.exists)
                return false;
            if (freshDoc.data()?.notificationSent === true)
                return false;
            transaction.update(reqRef, {
                notificationSent: true,
                notificationSentAt: FieldValue.serverTimestamp(),
            });
            return true;
        });
    }
    catch (txErr) {
        console.warn('Transaction error checking notificationSent on careCellPrayer:', txErr);
        if (data?.notificationSent === true)
            return;
        shouldSend = true;
    }
    if (!shouldSend)
        return;
    const memberName = data.memberName || 'Cell Member';
    const cellName = data.cellName || 'Care Cell';
    const prayerTitle = data.title || 'Prayer Request';
    const messaging = getMessaging();
    const notifTitle = `🙏 Care Cell Prayer: ${memberName}`;
    const notifBody = `[${cellName}] ${prayerTitle}`;
    const payload = {
        notification: {
            title: notifTitle,
            body: notifBody,
        },
        data: {
            type: 'care_cell_prayer',
            title: notifTitle,
            body: notifBody,
            requestId: String(requestId),
            churchId: String(churchId),
            cellId: String(data.cellId || ''),
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
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
        topic: `church_${churchId}_admin`,
    };
    try {
        await messaging.send(payload);
        console.log(`Successfully sent care cell prayer request push for ${requestId}`);
    }
    catch (err) {
        console.error('Error sending care cell prayer notification:', err);
    }
});
/**
 * 🏡 CARE CELL VISIT NOTIFICATION PUSH
 * Sends push notification strictly to members of the selected Care Cell when a visit is scheduled.
 */
export const pushCareCellVisit = onDocumentCreated({ document: 'Rhema Church/{churchId}/careCellVisits/{visitId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const visitId = event.params.visitId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const visitRef = snap.ref;
    const data = snap.data();
    let shouldSend = false;
    try {
        shouldSend = await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(visitRef);
            if (!freshDoc.exists)
                return false;
            if (freshDoc.data()?.pushNotificationSent === true)
                return false;
            transaction.update(visitRef, {
                pushNotificationSent: true,
                pushNotificationSentAt: FieldValue.serverTimestamp(),
            });
            return true;
        });
    }
    catch (txErr) {
        console.warn('Transaction error checking pushNotificationSent on careCellVisit:', txErr);
        if (data?.pushNotificationSent === true)
            return;
        shouldSend = true;
    }
    if (!shouldSend)
        return;
    const cellId = data.cellId;
    if (!cellId)
        return;
    const title = data.title || 'Pastoral Care Cell Visit';
    const cellName = data.cellName || 'Care Cell';
    const visitDate = data.visitDate || '';
    const visitTime = data.visitTime || '';
    const visitors = data.visitors || 'Cell Leaders';
    const messaging = getMessaging();
    try {
        // Fetch active members of THIS specific Care Cell
        const membershipsSnap = await db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('careCellMemberships')
            .where('cellId', '==', cellId)
            .where('membershipStatus', '==', 'Active')
            .get();
        const memberIds = membershipsSnap.docs.map((d) => d.data().memberId).filter(Boolean);
        if (memberIds.length === 0) {
            console.log(`No active members found in care cell ${cellId} for visit push.`);
            return;
        }
        // Collect FCM tokens for these members
        const tokens = [];
        for (const mId of memberIds) {
            try {
                const memDoc = await db
                    .collection('Rhema Church')
                    .doc(churchId)
                    .collection('members')
                    .doc(mId)
                    .get();
                if (memDoc.exists) {
                    const token = memDoc.data()?.fcmToken;
                    if (token && typeof token === 'string' && !tokens.includes(token)) {
                        tokens.push(token);
                    }
                }
            }
            catch (_) { }
        }
        if (tokens.length > 0) {
            const notifTitle = `🏡 ${cellName}: ${title}`;
            const notifBody = `Visit on ${visitDate} at ${visitTime} by ${visitors}. Tap to confirm your availability & preferred visit time!`;
            const messagePayload = {
                notification: {
                    title: notifTitle,
                    body: notifBody,
                },
                data: {
                    type: 'care_cell_visit',
                    title: notifTitle,
                    body: notifBody,
                    visitId: String(visitId),
                    cellId: String(cellId),
                    churchId: String(churchId),
                    visitDate: String(visitDate),
                    visitTime: String(visitTime),
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                },
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
                tokens,
            };
            const response = await messaging.sendEachForMulticast(messagePayload);
            console.log(`Successfully sent Care Cell visit push to ${response.successCount}/${tokens.length} members for ${visitId}`);
        }
        else {
            console.log(`No valid FCM tokens found for members in care cell ${cellId}`);
        }
    }
    catch (err) {
        console.error('Error dispatching Care Cell visit push notification:', err);
    }
});
//# sourceMappingURL=notifications.js.map