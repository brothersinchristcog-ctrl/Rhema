import './globalConfig.js';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildOnlineMeetingTopicMessage } from './meetings.js';
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
                const mSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(memberId).get();
                if (mSnap.exists) {
                    const mData = mSnap.data();
                    memberName = mData?.name || mData?.displayName || (mData?.firstName ? `${mData.firstName} ${mData.lastName || ''}`.trim() : '');
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
        const membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
        membersSnap.forEach(doc => {
            const m = doc.data();
            const role = String(m.userType || m.role || '').toLowerCase();
            const isAdmin = role.includes('admin') || role.includes('pastor') || role.includes('super');
            if (isAdmin) {
                adminUids.push(doc.id);
                if (m.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                    adminTokens.push(m.fcmToken.trim());
                }
                if (Array.isArray(m.fcmTokens)) {
                    m.fcmTokens.forEach((t) => {
                        if (t && typeof t === 'string' && t.trim().length > 10)
                            adminTokens.push(t.trim());
                    });
                }
            }
        });
        // B. Check church document for admin UIDs
        const churchDoc = await db.collection('Rhema Church').doc(churchId).get();
        if (churchDoc.exists) {
            const cData = churchDoc.data();
            const ownerUids = [cData?.adminUid, cData?.createdBy, cData?.pastorUid].filter(Boolean);
            for (const uid of ownerUids) {
                if (!adminUids.includes(uid)) {
                    adminUids.push(uid);
                }
            }
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
                const mSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(memberId).get();
                if (mSnap.exists) {
                    const mData = mSnap.data();
                    memberName = mData?.name || mData?.displayName || (mData?.firstName ? `${mData.firstName} ${mData.lastName || ''}`.trim() : '');
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
        const membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
        membersSnap.forEach(doc => {
            const m = doc.data();
            const role = String(m.userType || m.role || '').toLowerCase();
            const isAdmin = role.includes('admin') || role.includes('pastor') || role.includes('super');
            if (isAdmin) {
                adminUids.push(doc.id);
                if (m.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                    adminTokens.push(m.fcmToken.trim());
                }
                if (Array.isArray(m.fcmTokens)) {
                    m.fcmTokens.forEach((t) => {
                        if (t && typeof t === 'string' && t.trim().length > 10)
                            adminTokens.push(t.trim());
                    });
                }
            }
        });
        // B. Check church document for admin UIDs
        const churchDoc = await db.collection('Rhema Church').doc(churchId).get();
        if (churchDoc.exists) {
            const cData = churchDoc.data();
            const ownerUids = [cData?.adminUid, cData?.createdBy, cData?.pastorUid].filter(Boolean);
            for (const uid of ownerUids) {
                if (!adminUids.includes(uid)) {
                    adminUids.push(uid);
                }
            }
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
                const mSnap = await db.collection('Rhema Church').doc(churchId).collection('members').doc(memberId).get();
                if (mSnap.exists) {
                    const mData = mSnap.data();
                    memberName = mData?.name || mData?.displayName || (mData?.firstName ? `${mData.firstName} ${mData.lastName || ''}`.trim() : '');
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
        }
        // Check by Phone number across members and users
        if (memberPhone) {
            const cleanDigits = memberPhone.replace(/\D/g, '').slice(-10);
            if (cleanDigits.length >= 7) {
                try {
                    const memQuery = await db.collection('Rhema Church').doc(churchId).collection('members').get();
                    memQuery.forEach(doc => {
                        const m = doc.data();
                        const p = String(m.phone || m.mobile || m.phoneNumber || '').replace(/\D/g, '').slice(-10);
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
        const churchesSnapshot = await db.collection('Rhema Church').get();
        for (const churchDoc of churchesSnapshot.docs) {
            await checkAndPublishScheduledSermons(churchDoc.ref.collection('sermons'), churchDoc.id, churchDoc.ref);
        }
    }
    catch (err) {
        console.error('Error in publishScheduledSermons cron job:', err);
    }
});
function parseMeetingDate(value) {
    if (!value)
        return null;
    const dt = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
}
export const monitorMeetingLive = onSchedule({ schedule: '* * * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async (event) => {
    const db = getFirestore();
    const now = new Date();
    try {
        const churchesSnapshot = await db.collection('Rhema Church').get();
        for (const churchDoc of churchesSnapshot.docs) {
            const churchId = churchDoc.id;
            // Only silently expire past meetings whose end window has passed.
            // Meetings NEVER auto-transition to 'live' or auto-send push notifications;
            // live notifications are sent exclusively when an Admin triggers Start Meeting.
            const meetingsSnapshot = await churchDoc.ref.collection('online_meetings')
                .where('status', 'in', ['scheduled', 'upcoming', 'live'])
                .get();
            for (const meetingDoc of meetingsSnapshot.docs) {
                const meeting = meetingDoc.data();
                const startTime = parseMeetingDate(meeting.startTime);
                if (!startTime)
                    continue;
                const endTime = parseMeetingDate(meeting.endTime) ||
                    new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
                const staleExpiry = new Date(endTime.getTime() + 60 * 60 * 1000);
                const shouldExpire = meeting.status === 'live' ? staleExpiry <= now : endTime <= now;
                if (shouldExpire) {
                    const updates = {
                        status: 'completed',
                        updatedAt: FieldValue.serverTimestamp(),
                    };
                    await meetingDoc.ref.update(updates);
                    await db
                        .collection('churches')
                        .doc('default')
                        .collection('online_meetings')
                        .doc(meetingDoc.id)
                        .update(updates)
                        .catch(() => { });
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
const RHEMA_OFFICIAL_YOUTUBE_URL = 'https://www.youtube.com/@RhemaGlobalMinistries';
const RHEMA_OFFICIAL_CHANNEL_ID = 'UCd7Ge98_3YHmo_Z3czAkUoQ';
const ytChannelCache = {
    [RHEMA_OFFICIAL_YOUTUBE_URL]: RHEMA_OFFICIAL_CHANNEL_ID,
    'https://www.youtube.com/@rhemaglobalministries': RHEMA_OFFICIAL_CHANNEL_ID,
    '@RhemaGlobalMinistries': RHEMA_OFFICIAL_CHANNEL_ID,
    '@rhemaglobalministries': RHEMA_OFFICIAL_CHANNEL_ID,
};
const ytLastCheckMsByChannel = {};
/**
 * Resolves the YouTube channel ID from a channel handle or URL.
 */
async function resolveYouTubeChannelId(rawYtUrl) {
    const clean = rawYtUrl.trim();
    const cleanLower = clean.toLowerCase();
    if (ytChannelCache[clean])
        return ytChannelCache[clean] || null;
    if (ytChannelCache[cleanLower])
        return ytChannelCache[cleanLower] || null;
    if (cleanLower.includes('rhemaglobalministries')) {
        ytChannelCache[clean] = RHEMA_OFFICIAL_CHANNEL_ID;
        return RHEMA_OFFICIAL_CHANNEL_ID;
    }
    if (clean.includes('/channel/')) {
        const parts = clean.split('/channel/')[1];
        if (parts) {
            const cid = parts.split('/')[0]?.split('?')[0];
            if (cid && /^UC[\w-]{22}$/.test(cid)) {
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
        if (handle.toLowerCase() === 'rhemaglobalministries') {
            ytChannelCache[clean] = RHEMA_OFFICIAL_CHANNEL_ID;
            return RHEMA_OFFICIAL_CHANNEL_ID;
        }
        try {
            const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${YOUTUBE_DATA_API_KEY}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    const cid = data.items[0]?.id;
                    if (cid && /^UC[\w-]{22}$/.test(cid)) {
                        ytChannelCache[clean] = cid;
                        return cid;
                    }
                }
            }
        }
        catch (_) { }
    }
    if (/^UC[\w-]{22}$/.test(clean)) {
        ytChannelCache[clean] = clean;
        return clean;
    }
    return null;
}
/**
 * Authoritatively verifies via YouTube Data API v3 `videos.list` (1 quota unit)
 * whether any candidate videoId BOTH strictly belongs to `expectedChannelId`
 * AND is currently broadcasting live right now (started and not ended).
 * Prevents sidebar/recommended/foreign videos from EVER triggering a live alert.
 */
async function verifyVideosLiveForChannel(candidateIds, expectedChannelId) {
    const uniqueIds = Array.from(new Set(candidateIds.filter((id) => typeof id === 'string' && /^[\w-]{11}$/.test(id)))).slice(0, 15);
    if (uniqueIds.length === 0) {
        return { ok: true, liveVideo: null };
    }
    try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(uniqueIds.join(','))}&key=${YOUTUBE_DATA_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`[verifyVideosLiveForChannel] videos.list HTTP ${res.status}`);
            return { ok: false, liveVideo: null };
        }
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
            const ownerChannelId = item?.snippet?.channelId || '';
            const liveBroadcastContent = item?.snippet?.liveBroadcastContent || '';
            const liveDetails = item?.liveStreamingDetails || {};
            const actualStartTime = liveDetails?.actualStartTime;
            const actualEndTime = liveDetails?.actualEndTime;
            if (ownerChannelId !== expectedChannelId) {
                console.warn(`🚫 [YouTube Live Guard] Rejected foreign video ${item?.id} owned by ${ownerChannelId} ("${item?.snippet?.channelTitle}") — expected ${expectedChannelId}`);
                continue;
            }
            if (liveBroadcastContent === 'live' && actualStartTime && !actualEndTime) {
                return {
                    ok: true,
                    liveVideo: {
                        videoId: item.id,
                        title: item?.snippet?.title || '',
                    },
                };
            }
        }
        return { ok: true, liveVideo: null };
    }
    catch (err) {
        console.warn('[verifyVideosLiveForChannel] Error:', err?.message);
        return { ok: false, liveVideo: null };
    }
}
/**
 * 🔴 Automatically check if church's YouTube channel is currently streaming live.
 * Uses low-quota YouTube Data API v3 (`UULV` live playlist + channel RSS + `videos.list`, 2 quota units total,
 * ZERO `search.list` calls) with strict channel ownership verification so foreign or ended videos can NEVER trigger alerts.
 */
function formatLiveNotification(churchName, rawTitle) {
    return {
        pushTitle: '🔴 We Are LIVE Now!',
        pushBody: "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!",
    };
}
export async function checkChurchYouTubeLive(churchDoc, churchId, db) {
    if (!churchId || churchId === 'global')
        return;
    const cData = churchDoc.data() || {};
    let rawYtUrl = cData.socialLinks?.youtube?.trim() || '';
    // Fix typos in raw URL and discard legacy Brothers in Christ placeholder handles for Rhema
    rawYtUrl = rawYtUrl.replace(/https?:\/\/(www\w*)\.(?:yyoutube|youtube)\.com/i, 'https://www.youtube.com');
    if (churchId === 'rhema' &&
        (!rawYtUrl || /brothersinchrist/i.test(rawYtUrl) || /uc3j_2zp2biucweia_asvghw/i.test(rawYtUrl))) {
        rawYtUrl = RHEMA_OFFICIAL_YOUTUBE_URL;
    }
    if (!rawYtUrl)
        return;
    try {
        const channelId = await resolveYouTubeChannelId(rawYtUrl);
        if (!channelId) {
            console.warn(`[checkChurchYouTubeLive] Could not resolve channelId for ${churchId} (${rawYtUrl}); skipping.`);
            return;
        }
        // Prevent back-to-back redundant checks within 35s in the same instance
        const nowCheckMs = Date.now();
        const lastLocalCheck = ytLastCheckMsByChannel[channelId] || 0;
        if (nowCheckMs - lastLocalCheck < 35_000) {
            return;
        }
        ytLastCheckMsByChannel[channelId] = nowCheckMs;
        const prevState = cData.youtubeLiveState || { isLive: false };
        let isLive = false;
        let videoId = '';
        let streamTitle = '';
        // ── Method 1: Channel-Scoped Live Streams Playlist (UULV) + Channel RSS + videos.list (2 quota units, ZERO search.list) ──
        const candidateIds = [];
        if (prevState?.isLive && typeof prevState?.videoId === 'string' && /^[\w-]{11}$/.test(prevState.videoId)) {
            candidateIds.push(prevState.videoId);
        }
        const channelSuffix = channelId.slice(2);
        let uulvSucceeded = false;
        // 1a. Live Streams Playlist (UULV...) — 1 quota unit
        try {
            const uulvUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=UULV${channelSuffix}&maxResults=5&key=${YOUTUBE_DATA_API_KEY}`;
            const uulvRes = await fetch(uulvUrl);
            if (uulvRes.ok) {
                uulvSucceeded = true;
                const uulvData = await uulvRes.json();
                for (const item of uulvData.items || []) {
                    const vid = item?.contentDetails?.videoId;
                    if (vid)
                        candidateIds.push(vid);
                }
            }
        }
        catch (uulvErr) {
            console.warn('[checkChurchYouTubeLive] UULV playlist notice:', uulvErr?.message);
        }
        // 1b. Channel Atom RSS Feed — 0 quota units (catches brand-new streams & uploads immediately)
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
                signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timeout);
            if (rssRes && rssRes.ok) {
                const xml = await rssRes.text();
                const rssMatches = xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g);
                let count = 0;
                for (const m of rssMatches) {
                    if (m[1])
                        candidateIds.push(m[1]);
                    count++;
                    if (count >= 6)
                        break;
                }
            }
        }
        catch (_) { }
        // 1c. If UULV failed and RSS yielded nothing, check Uploads Playlist (UU...) — 1 quota unit
        if (!uulvSucceeded && candidateIds.length === 0) {
            try {
                const uuUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=UU${channelSuffix}&maxResults=5&key=${YOUTUBE_DATA_API_KEY}`;
                const uuRes = await fetch(uuUrl);
                if (uuRes.ok) {
                    const uuData = await uuRes.json();
                    for (const item of uuData.items || []) {
                        const vid = item?.contentDetails?.videoId;
                        if (vid)
                            candidateIds.push(vid);
                    }
                }
            }
            catch (_) { }
        }
        const verifiedCandidates = new Set(candidateIds);
        const verification = await verifyVideosLiveForChannel(candidateIds, channelId);
        if (verification.liveVideo) {
            isLive = true;
            videoId = verification.liveVideo.videoId;
            streamTitle = verification.liveVideo.title;
            console.log(`🔴 [YouTube Live Verified] Church ${churchId} (${channelId}) is LIVE: ${videoId} - "${streamTitle}"`);
        }
        // ── Method 2: Fast-Start Hardened `/channel/{id}/live` Check (ALWAYS gated by videos.list channel verification) ──
        if (!isLive) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                    redirect: 'follow',
                }).catch(() => null);
                clearTimeout(timeout);
                if (res && res.ok) {
                    const html = await res.text().catch(() => '');
                    // Strictly parse ONLY the primary player's `videoDetails` object (NEVER sidebar/related videos!)
                    const isBotWall = html.includes('"status":"LOGIN_REQUIRED"');
                    const vdMatch = !isBotWall
                        ? html.match(/"videoDetails":\{"videoId":"([\w-]{11})"([\s\S]{0,2000})/)
                        : null;
                    if (vdMatch && vdMatch[1]) {
                        const candidateId = vdMatch[1];
                        const vdChunk = vdMatch[2] || '';
                        const matchesOwner = vdChunk.includes(`"channelId":"${channelId}"`);
                        const looksLiveInPlayer = vdChunk.includes('"isLive":true') && !vdChunk.includes('"isUpcoming":true');
                        if (matchesOwner && looksLiveInPlayer && !verifiedCandidates.has(candidateId)) {
                            // Mandatory final authoritative gate via YouTube Data API v3 `videos.list`
                            const finalCheck = await verifyVideosLiveForChannel([candidateId], channelId);
                            if (finalCheck.liveVideo) {
                                isLive = true;
                                videoId = finalCheck.liveVideo.videoId;
                                streamTitle = finalCheck.liveVideo.title;
                                console.log(`🔴 [YouTube /live Verified] Church ${churchId} (${channelId}) is LIVE: ${videoId} - "${streamTitle}"`);
                            }
                        }
                    }
                }
            }
            catch (_) { }
        }
        const liveWatchUrl = videoId
            ? `https://www.youtube.com/watch?v=${videoId}`
            : rawYtUrl;
        if (isLive && videoId && /^[\w-]{11}$/.test(videoId)) {
            // Clean up streamTitle if empty
            if (!streamTitle ||
                streamTitle.includes('Want to watch this again later') ||
                streamTitle.includes('Sign in to add this') ||
                streamTitle.toLowerCase() === 'youtube') {
                streamTitle = 'Join the live worship service now! 🎥🙏';
            }
            const resolvedVideoId = videoId;
            // Atomic Firestore Transaction so concurrent schedulers (monitorMeetingLive + checkYouTubeLive)
            // claim a short pending lease first and mark completion ONLY after push delivery succeeds.
            const YT_CLAIM_TTL_MS = 2 * 60 * 1000;
            let shouldSendPush = false;
            if (resolvedVideoId && resolvedVideoId.length === 11) {
                try {
                    shouldSendPush = await db.runTransaction(async (tx) => {
                        const freshSnap = await tx.get(churchDoc.ref);
                        const freshData = freshSnap.exists ? freshSnap.data() || {} : {};
                        const curState = freshData.youtubeLiveState || { isLive: false };
                        const nowMs = Date.now();
                        const lastNotifiedMillis = curState?.lastNotifiedAt?.toMillis?.() ||
                            (curState?.lastNotifiedAt?._seconds ? curState.lastNotifiedAt._seconds * 1000 : 0);
                        const isWithinSameVideoCooldown = lastNotifiedMillis > 0 && nowMs - lastNotifiedMillis < 4 * 60 * 60 * 1000;
                        const isWithinGlobalCooldown = lastNotifiedMillis > 0 && nowMs - lastNotifiedMillis < 15 * 60 * 1000;
                        const isSameVideoAsLastNotified = curState?.lastNotifiedVideoId === resolvedVideoId;
                        const isOngoingLegacyStream = Boolean(curState?.isLive) &&
                            !curState?.lastNotifiedVideoId &&
                            curState?.videoId === resolvedVideoId;
                        const hasActivePendingClaim = curState?.pendingNotifyVideoId === resolvedVideoId &&
                            typeof curState?.pendingNotifyAt === 'number' &&
                            nowMs - curState.pendingNotifyAt < YT_CLAIM_TTL_MS;
                        const alreadyNotified = hasActivePendingClaim ||
                            isWithinGlobalCooldown ||
                            (isSameVideoAsLastNotified && (Boolean(curState?.isLive) || isWithinSameVideoCooldown)) ||
                            isOngoingLegacyStream;
                        const nextState = {
                            isLive: true,
                            url: liveWatchUrl,
                            videoId: resolvedVideoId,
                            channelId,
                            title: streamTitle || curState?.title || '',
                            lastChecked: FieldValue.serverTimestamp(),
                        };
                        if (!alreadyNotified) {
                            nextState.pendingNotifyVideoId = resolvedVideoId;
                            nextState.pendingNotifyAt = nowMs;
                        }
                        tx.set(churchDoc.ref, { youtubeLiveState: nextState }, { merge: true });
                        return !alreadyNotified;
                    });
                }
                catch (txErr) {
                    console.warn('[checkChurchYouTubeLive] Transaction check error:', txErr);
                    shouldSendPush = false;
                }
            }
            else {
                await churchDoc.ref
                    .set({
                    youtubeLiveState: {
                        isLive: true,
                        url: liveWatchUrl,
                        videoId: resolvedVideoId,
                        title: streamTitle || prevState?.title || '',
                        lastChecked: FieldValue.serverTimestamp(),
                    },
                }, { merge: true })
                    .catch(() => { });
            }
            if (shouldSendPush) {
                const churchName = cData.name || 'Rhema Global Ministries';
                const { pushTitle, pushBody } = formatLiveNotification(churchName, streamTitle);
                console.log(`🚨 Auto YouTube Live detected for church ${churchId} (${churchName})! Sending single push for ${resolvedVideoId}...`);
                // 1. Send data-only push to Android (rendered cleanly via NotificationService.displayLiveNotification
                // with "📺 Join Live Now" action button) and categorized alert to iOS APNs.
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
                // 1. Always persist deterministically in broadcasts subcollection (youtube_live_{videoId})
                // so the Updates screen ALWAYS shows the live alert immediately with zero duplicates.
                const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                await churchDoc.ref
                    .collection('broadcasts')
                    .doc(`youtube_live_${resolvedVideoId}`)
                    .set({
                    title: pushTitle,
                    content: pushBody,
                    date: dateStr,
                    type: 'youtube_live',
                    url: liveWatchUrl,
                    videoId: resolvedVideoId,
                    channelId,
                    silent: true,
                    createdAt: FieldValue.serverTimestamp(),
                }, { merge: true })
                    .catch((bErr) => {
                    console.error('Error writing YouTube Live broadcast for Updates screen:', bErr);
                });
                // 2. Send topic push to all church members
                try {
                    await getMessaging().send(topicMessage);
                    // Record completion only after FCM topic delivery succeeded
                    await churchDoc.ref
                        .update({
                        'youtubeLiveState.lastNotifiedVideoId': resolvedVideoId,
                        'youtubeLiveState.lastNotifiedAt': FieldValue.serverTimestamp(),
                        'youtubeLiveState.pendingNotifyVideoId': FieldValue.delete(),
                        'youtubeLiveState.pendingNotifyAt': FieldValue.delete(),
                    })
                        .catch(() => { });
                }
                catch (sendErr) {
                    console.error('Error sending YouTube Live topic push; releasing pending claim for retry:', sendErr);
                    await churchDoc.ref
                        .update({
                        'youtubeLiveState.pendingNotifyVideoId': FieldValue.delete(),
                        'youtubeLiveState.pendingNotifyAt': FieldValue.delete(),
                    })
                        .catch(() => { });
                }
            }
        }
        else {
            // Offline: reset isLive and clear stale video fields on church document if previously live
            if (prevState?.isLive) {
                await churchDoc.ref.set({
                    youtubeLiveState: {
                        isLive: false,
                        videoId: '',
                        url: '',
                        title: '',
                        channelId,
                        pendingNotifyVideoId: FieldValue.delete(),
                        pendingNotifyAt: FieldValue.delete(),
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
        for (const adminDoc of adminsSnapshot.docs) {
            const aData = adminDoc.data();
            if (aData?.fcmToken && typeof aData.fcmToken === 'string') {
                tokens.push(aData.fcmToken);
            }
            try {
                const mSnap = await db.collection('Rhema Church').doc('rhema').collection('members').doc(adminDoc.id).get();
                const mData = mSnap.data();
                if (mData?.fcmToken && typeof mData.fcmToken === 'string') {
                    tokens.push(mData.fcmToken);
                }
            }
            catch (_) { }
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
        const targetChurch = (churchId && churchId !== 'global') ? churchId : 'rhema';
        const membersSnap = await db.collection('Rhema Church').doc(targetChurch).collection('members').get();
        membersSnap.forEach((doc) => {
            const m = doc.data();
            if (m.fcmToken)
                tokenSet.add(m.fcmToken);
            if (Array.isArray(m.fcmTokens))
                m.fcmTokens.forEach((t) => tokenSet.add(t));
        });
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
    try {
        const targetChurch = (churchId && churchId !== 'global') ? churchId : 'rhema';
        await db.collection('Rhema Church').doc(targetChurch).collection('notifications').add({
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
    // ── ATOMIC FIRESTORE TRANSACTION IDEMPOTENCY LOCK ──────────────────────────
    // Because automatedDailyQuiz, periodicDailyQuizSafetyNet, and monitorMeetingLive
    // can all fire at 06:00:00 IST simultaneously, use a true Firestore transaction
    // so strictly ONE invocation acquires today's broadcast lock.
    const lockRef = scheduleDocRef ||
        db.collection('Rhema Church').doc('rhema').collection('settings').doc('daily_quiz_schedule');
    if (!force) {
        try {
            const acquired = await db.runTransaction(async (tx) => {
                const snap = await tx.get(lockRef);
                const cur = snap.exists ? snap.data() || {} : {};
                if (cur.lastBroadcastDate === dStr) {
                    return false;
                }
                tx.set(lockRef, { lastBroadcastDate: dStr, lastBroadcastAt: FieldValue.serverTimestamp() }, { merge: true });
                return true;
            });
            if (!acquired) {
                console.log(`ℹ️ [DailyQuiz] Transaction lock already claimed for ${dStr}; skipping duplicate run.`);
                return { success: true, sentCount: 0, message: 'Already sent today' };
            }
            await db
                .collection('settings')
                .doc('daily_quiz_schedule')
                .set({ lastBroadcastDate: dStr, lastBroadcastAt: FieldValue.serverTimestamp() }, { merge: true })
                .catch(() => { });
            console.log(`🔒 [DailyQuiz] Atomic transaction lock acquired for ${dStr}. Proceeding with delivery...`);
        }
        catch (lockErr) {
            console.warn('[DailyQuiz] Transaction lock error; aborting to avoid duplicate delivery:', lockErr);
            return { success: false, sentCount: 0, message: 'Lock error' };
        }
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
    // 3. Collect registered FCM tokens from members
    const tokenSet = new Set();
    try {
        const membersSnap = await db.collectionGroup('members').get();
        membersSnap.forEach((doc) => {
            const data = doc.data();
            if (data?.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.trim().length > 10) {
                tokenSet.add(data.fcmToken.trim());
            }
            if (Array.isArray(data?.fcmTokens)) {
                data.fcmTokens.forEach((tk) => {
                    if (typeof tk === 'string' && tk.trim().length > 10)
                        tokenSet.add(tk.trim());
                });
            }
        });
    }
    catch (tokenErr) {
        console.warn('[DailyQuiz] Error collecting member tokens:', tokenErr);
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
    // 5. Persist ONE deterministic broadcast entry per day (doc ID = daily_quiz_YYYY-MM-DD)
    // Do NOT also write a duplicate doc into `notifications` because UpdatesScreen merges both collections!
    try {
        const churchesSnap = await db.collection('Rhema Church').get();
        for (const cDoc of churchesSnap.docs) {
            const churchId = cDoc.id;
            if (churchId === 'global')
                continue;
            await cDoc.ref
                .collection('broadcasts')
                .doc(quizId)
                .set({
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
            }, { merge: true })
                .catch(() => { });
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
            title: "Good Morning · Today's Verse (నేటి వాక్యం)",
            titleEn: "Good Morning",
            titleTe: "Today's Verse (నేటి వాక్యం)",
        },
        Afternoon: {
            index: 1,
            title: "Blessed Afternoon · Daily Peace (అనుదిన శాంతి)",
            titleEn: "Blessed Afternoon",
            titleTe: "Daily Peace (అనుదిన శాంతి)",
        },
        Evening: {
            index: 2,
            title: "Evening Prayer · Faith & Grace (విశ్వాసం - కృప)",
            titleEn: "Evening Prayer",
            titleTe: "Faith & Grace (విశ్వాసం - కృప)",
        },
        Night: {
            index: 3,
            title: "Good Night · God's Protection (దేవుని కాపుదల)",
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
    // 2. Resolve today's verse index dynamically from the anchor schedule date
    // 100% synchronized with SuperAdminVersesManager, HomeScreen, and VerseOfTheDayScreen
    let totalVerses = 5863;
    let epochStr = '2026-10-30';
    try {
        const metaDoc = await db.collection('daily_verses_meta').doc('metadata').get();
        if (metaDoc.exists) {
            const mData = metaDoc.data() || {};
            if (mData.totalVerses && typeof mData.totalVerses === 'number') {
                totalVerses = mData.totalVerses;
            }
            if (mData.scheduleStartDate && typeof mData.scheduleStartDate === 'string') {
                epochStr = mData.scheduleStartDate;
            }
        }
    }
    catch (mErr) {
        console.warn('[sendDailyVersePushInternal] Metadata fetch warning, using defaults:', mErr);
    }
    // Calculate calendar days diff from epoch in IST
    const parts = epochStr.split('-').map(Number);
    const eY = parts[0] || 2026;
    const eM = parts[1] || 10;
    const eD = parts[2] || 30;
    const epochUtc = Date.UTC(eY, eM - 1, eD);
    const targetUtc = Date.UTC(nowIst.getFullYear(), nowIst.getMonth(), nowIst.getDate());
    const diffDays = Math.floor((targetUtc - epochUtc) / (24 * 60 * 60 * 1000));
    const base = diffDays * 4;
    const todayIndices = [
        ((base + 0) % totalVerses + totalVerses) % totalVerses,
        ((base + 1) % totalVerses + totalVerses) % totalVerses,
        ((base + 2) % totalVerses + totalVerses) % totalVerses,
        ((base + 3) % totalVerses + totalVerses) % totalVerses,
    ];
    const targetIndex = (todayIndices[slotInfo.index] !== undefined ? todayIndices[slotInfo.index] : todayIndices[0]) ?? 0;
    console.log(`[sendDailyVersePushInternal] Target verse index: ${targetIndex} for slot ${slot} (epoch: ${epochStr}, diffDays: ${diffDays}, slotIdx: ${slotInfo.index}, todayIndices: [${todayIndices.join(', ')}])`);
    let verseDocData = null;
    let verseId = `verse_${targetIndex}`;
    // 1. Primary Source of Truth: Firestore 'daily_verses' collection
    try {
        // 1a. Direct doc lookup by deterministic ID
        const directDoc = await db.collection('daily_verses').doc(`verse_${targetIndex}`).get();
        if (directDoc.exists) {
            verseDocData = directDoc.data();
            verseId = directDoc.id;
            console.log(`✨ [sendDailyVersePushInternal] Loaded verse via direct doc verse_${targetIndex}: ${verseDocData.referenceEn || verseDocData.referenceTe}`);
        }
    }
    catch (dErr) {
        console.warn('[sendDailyVersePushInternal] Direct doc lookup failed, falling back to index query:', dErr);
    }
    // 1b. If not found by direct ID, query by index field
    if (!verseDocData) {
        try {
            const snap = await db.collection('daily_verses')
                .where('index', '==', targetIndex)
                .get();
            if (!snap.empty && snap.docs.length > 0) {
                let bestDoc = snap.docs[0];
                let bestTime = 0;
                snap.docs.forEach((doc) => {
                    const d = doc.data();
                    const t = d.updatedAt?.toMillis ? d.updatedAt.toMillis() : (d.updatedAt || d.createdAt?.toMillis?.() || d.createdAt || 0);
                    if (t >= bestTime) {
                        bestTime = t;
                        bestDoc = doc;
                    }
                });
                if (bestDoc) {
                    verseDocData = bestDoc.data();
                    verseId = bestDoc.id;
                    console.log(`✨ [sendDailyVersePushInternal] Loaded verse from daily_verses for slot '${slot}' (index ${targetIndex}): ${verseDocData.referenceEn || verseDocData.referenceTe}`);
                }
            }
        }
        catch (err) {
            console.warn('[sendDailyVersePushInternal] Could not query daily_verses by index:', err);
        }
    }
    // 2. Secondary fallback: Rhema Church/rhema/daily_verses
    if (!verseDocData) {
        try {
            const rhemaSnap = await db.collection('Rhema Church')
                .doc(targetChurchId)
                .collection('daily_verses')
                .where('index', '==', targetIndex)
                .limit(1)
                .get();
            if (!rhemaSnap.empty) {
                verseDocData = rhemaSnap.docs[0]?.data();
                verseId = rhemaSnap.docs[0]?.id || verseId;
            }
        }
        catch (_) { }
    }
    // 3. Third fallback & reference backfill: bulk_verses.json bundled asset
    let bundledVerseFallback = null;
    try {
        const fsMod = await import('fs');
        const pathMod = await import('path');
        const candidates = [
            pathMod.join(process.cwd(), 'bulk_verses.json'),
            pathMod.join(process.cwd(), '../bulk_verses.json'),
            pathMod.join(process.cwd(), 'app/assets/bulk_verses.json'),
            pathMod.join(process.cwd(), '../app/assets/bulk_verses.json'),
        ];
        for (const p of candidates) {
            if (fsMod.existsSync(p)) {
                const raw = fsMod.readFileSync(p, 'utf-8');
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    if (list[targetIndex]) {
                        bundledVerseFallback = list[targetIndex];
                    }
                    // If verseDocData came from Firestore but is missing a reference, also match by verse text if needed
                    if (verseDocData && (!verseDocData.referenceEn || !verseDocData.referenceTe)) {
                        const vEnNorm = String(verseDocData.verseEn || '').trim().toLowerCase();
                        const vTeNorm = String(verseDocData.verseTe || verseDocData.verse || '').trim();
                        if (bundledVerseFallback && ((vEnNorm && String(bundledVerseFallback.verseEn || '').trim().toLowerCase() === vEnNorm) ||
                            (vTeNorm && String(bundledVerseFallback.verseTe || '').trim() === vTeNorm))) {
                            // bundledVerseFallback at targetIndex already matches
                        }
                        else if (vEnNorm || vTeNorm) {
                            const matched = list.find((item) => (vEnNorm && String(item?.verseEn || '').trim().toLowerCase() === vEnNorm) ||
                                (vTeNorm && String(item?.verseTe || '').trim() === vTeNorm));
                            if (matched) {
                                bundledVerseFallback = matched;
                            }
                        }
                    }
                    if (!verseDocData && bundledVerseFallback) {
                        verseDocData = bundledVerseFallback;
                        verseId = `bulk_${targetIndex}`;
                    }
                    break;
                }
            }
        }
    }
    catch (_) { }
    if (!verseDocData) {
        console.warn(`[sendDailyVersePushInternal] No verse found for index ${targetIndex}`);
        return { success: false, error: `Verse not found for index ${targetIndex}` };
    }
    // Resolve verse and reference fields across all possible property names + bundled fallback
    const verseEnText = (verseDocData.verseEn ||
        verseDocData.english ||
        verseDocData.textEn ||
        bundledVerseFallback?.verseEn ||
        '').trim();
    const verseTeText = (verseDocData.verseTe ||
        verseDocData.verse ||
        verseDocData.telugu ||
        verseDocData.textTe ||
        bundledVerseFallback?.verseTe ||
        '').trim();
    let refEnText = (verseDocData.referenceEn ||
        verseDocData.refEn ||
        verseDocData.verseReferenceEn ||
        bundledVerseFallback?.referenceEn ||
        '').trim();
    let refTeText = (verseDocData.referenceTe ||
        verseDocData.reference ||
        verseDocData.refTe ||
        verseDocData.verseReferenceTe ||
        bundledVerseFallback?.referenceTe ||
        '').trim();
    // Bidirectional English <-> Telugu Bible book name map so neither reference is ever missing or untranslated
    const BOOK_EN_TO_TE = {
        'Genesis': 'ఆదికాండము', 'Exodus': 'నిర్గమకాండము', 'Leviticus': 'లేవీయకాండము', 'Numbers': 'సంఖ్యాకాండము', 'Deuteronomy': 'ద్వితీయోపదేశకాండము',
        'Joshua': 'యెహోషువ', 'Judges': 'న్యాయాధిపతులు', 'Ruth': 'రూతు', '1 Samuel': '1 సమూయేలు', '2 Samuel': '2 సమూయేలు',
        '1 Kings': '1 రాజులు', '2 Kings': '2 రాజులు', '1 Chronicles': '1 దినవృత్తాంతములు', '2 Chronicles': '2 దినవృత్తాంతములు',
        'Ezra': 'ఎజ్రా', 'Nehemiah': 'నెహెమ్యా', 'Esther': 'ఎస్తేరు', 'Job': 'యోబు', 'Psalms': 'కీర్తనలు', 'Psalm': 'కీర్తనలు',
        'Proverbs': 'సామెతలు', 'Ecclesiastes': 'ప్రసంగి', 'Song of Solomon': 'పరమగీతము', 'Song of Songs': 'పరమగీతము',
        'Isaiah': 'యెషయా', 'Jeremiah': 'యిర్మీయా', 'Lamentations': 'విలాపవాక్యములు', 'Ezekiel': 'యెహెజ్కేలు', 'Daniel': 'దానియేలు',
        'Hosea': 'హోషేయ', 'Joel': 'యోవేలు', 'Amos': 'ఆమోసు', 'Obadiah': 'ఓబద్యా', 'Jonah': 'యోనా', 'Micah': 'మీకా',
        'Nahum': 'నహూము', 'Habakkuk': 'హబక్కూకు', 'Zephaniah': 'జెఫన్యా', 'Haggai': 'హగ్గయి', 'Zechariah': 'జెకర్యా', 'Malachi': 'మలాకీ',
        'Matthew': 'మత్తయి', 'Mark': 'మార్కు', 'Luke': 'లూకా', 'John': 'యోహాను', 'Acts': 'అపొస్తలుల కార్యములు',
        'Romans': 'రోమీయులకు', '1 Corinthians': '1 కొరింథీయులకు', '2 Corinthians': '2 కొరింథీయులకు', 'Galatians': 'గలతీయులకు',
        'Ephesians': 'ఎఫెసీయులకు', 'Philippians': 'ఫిలిప్పీయులకు', 'Colossians': 'కొలొస్సయులకు',
        '1 Thessalonians': '1 థెస్సలొనీకయులకు', '2 Thessalonians': '2 థెస్సలొనీకయులకు',
        '1 Timothy': '1 తిమోతికి', '2 Timothy': '2 తిమోతికి', 'Titus': 'తీతుకు', 'Philemon': 'ఫిలేమోనుకు',
        'Hebrews': 'హెబ్రీయులకు', 'James': 'యాకోబు', '1 Peter': '1 పేతురు', '2 Peter': '2 పేతురు',
        '1 John': '1 యోహాను', '2 John': '2 యోహాను', '3 John': '3 యోహాను', 'Jude': 'యూదా', 'Revelation': 'ప్రకటన గ్రంథము',
    };
    if (refEnText && (!refTeText || refTeText === refEnText)) {
        if (bundledVerseFallback?.referenceTe && bundledVerseFallback.referenceTe !== refEnText) {
            refTeText = String(bundledVerseFallback.referenceTe).trim();
        }
        else {
            const m = refEnText.match(/^(.+?)\s+(\d+:\d+(?:-\d+)?)$/);
            if (m && m[1] && m[2] && BOOK_EN_TO_TE[m[1].trim()]) {
                refTeText = `${BOOK_EN_TO_TE[m[1].trim()]} ${m[2]}`;
            }
        }
    }
    else if (refTeText && !refEnText) {
        if (bundledVerseFallback?.referenceEn) {
            refEnText = String(bundledVerseFallback.referenceEn).trim();
        }
        else {
            for (const [enBook, teBook] of Object.entries(BOOK_EN_TO_TE)) {
                if (refTeText.startsWith(teBook + ' ')) {
                    refEnText = enBook + refTeText.slice(teBook.length);
                    break;
                }
            }
        }
    }
    // 4. Collect member device FCM tokens
    const tokenSet = new Set();
    try {
        const membersSnap = await db.collection('Rhema Church').doc('rhema').collection('members').get();
        membersSnap.forEach((d) => {
            const data = d.data();
            if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.length > 10) {
                tokenSet.add(data.fcmToken);
            }
            if (Array.isArray(data.fcmTokens)) {
                data.fcmTokens.forEach((tk) => {
                    if (typeof tk === 'string' && tk.length > 10)
                        tokenSet.add(tk);
                });
            }
        });
    }
    catch (_) { }
    const tokens = Array.from(tokenSet);
    console.log(`[sendDailyVersePushInternal] Collected ${tokens.length} FCM tokens for dispatch.`);
    let enSuccess = 0;
    let teSuccess = 0;
    // 4. Format EXACTLY ONE combined bilingual notification (Telugu + English + Bible Reference)
    // Ensures the Bible reference is NEVER missing, truncated, or separated across all 4 time slots.
    // Bible references are attached directly inline with each verse, guaranteeing 100% visibility
    // even on devices where Android's notification drawer limits visible vertical lines.
    const unifiedTitle = slotInfo.title;
    let unifiedBody = '';
    const cleanVerseTe = (verseTeText || '').replace(/^["“”'‘]+|["“”'‘]+$/g, '').trim();
    const cleanVerseEn = (verseEnText || '').replace(/^["“”'‘]+|["“”'‘]+$/g, '').trim();
    let cleanRefTe = (refTeText || '').trim();
    let cleanRefEn = (refEnText || '').trim();
    // Safeguard: If either reference is still missing, resolve from bundled backup
    if ((!cleanRefEn || !cleanRefTe) && bundledVerseFallback) {
        if (!cleanRefEn && bundledVerseFallback.referenceEn) {
            cleanRefEn = String(bundledVerseFallback.referenceEn).trim();
        }
        if (!cleanRefTe && bundledVerseFallback.referenceTe) {
            cleanRefTe = String(bundledVerseFallback.referenceTe).trim();
        }
    }
    const combinedRef = (cleanRefTe && cleanRefEn && cleanRefTe !== cleanRefEn)
        ? `${cleanRefTe} | ${cleanRefEn}`
        : (cleanRefTe || cleanRefEn);
    // Directly attach the respective Bible reference inline so it can NEVER be pushed off
    // or truncated by Android/iOS notification drawer height constraints.
    const teInline = (cleanRefTe && !cleanVerseTe.includes(cleanRefTe))
        ? `${cleanVerseTe} — ${cleanRefTe}`
        : cleanVerseTe;
    const enInline = (cleanRefEn && !cleanVerseEn.includes(cleanRefEn))
        ? `${cleanVerseEn} — ${cleanRefEn}`
        : cleanVerseEn;
    if (teInline && enInline && cleanVerseTe !== cleanVerseEn) {
        unifiedBody = `${teInline}\n${enInline}`;
    }
    else {
        unifiedBody = teInline || enInline;
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
                verseId: String(verseId),
                period: slot,
                churchId: targetChurchId,
                title: unifiedTitle,
                body: unifiedBody,
                verseTe: cleanVerseTe,
                refTe: cleanRefTe,
                verseEn: cleanVerseEn,
                refEn: cleanRefEn,
            },
            android: {
                priority: 'high',
                collapseKey: 'daily_verse',
                notification: {
                    sound: 'default',
                    priority: 'max',
                    channelId: 'daily_verse',
                    tag: 'daily_verse',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                },
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-collapse-id': 'daily_verse',
                },
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                        alert: {
                            title: unifiedTitle,
                            body: unifiedBody,
                        },
                    },
                },
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
                        verseId: String(verseId),
                        period: slot,
                        churchId: targetChurchId,
                        title: unifiedTitle,
                        body: unifiedBody,
                        verseTe: cleanVerseTe,
                        refTe: cleanRefTe,
                        verseEn: cleanVerseEn,
                        refEn: cleanRefEn,
                    },
                    android: {
                        priority: 'high',
                        collapseKey: 'daily_verse',
                        notification: {
                            sound: 'default',
                            priority: 'max',
                            channelId: 'daily_verse',
                            tag: 'daily_verse',
                            defaultSound: true,
                            defaultVibrateTimings: true,
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
    if (scope === 'All_Cells') {
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
                scope: 'All_Cells',
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
            console.log(`Successfully sent church-wide care cell announcement push for ${announcementId}`);
        }
        catch (err) {
            console.error('Error sending church-wide care cell announcement notification:', err);
        }
    }
    else {
        // Cell-scoped announcement: send push strictly to active members of this specific Care Cell
        if (!data.cellId)
            return;
        try {
            const membershipsSnap = await db
                .collection('Rhema Church')
                .doc(churchId)
                .collection('careCellMemberships')
                .where('cellId', '==', data.cellId)
                .where('membershipStatus', '==', 'Active')
                .get();
            const memberIds = membershipsSnap.docs.map((d) => d.data().memberId).filter(Boolean);
            if (memberIds.length === 0) {
                console.log(`No active members found in care cell ${data.cellId} for announcement push.`);
                return;
            }
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
                const messagePayload = {
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
                        scope: 'Cell',
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
                console.log(`Successfully sent Care Cell announcement push to ${response.successCount}/${tokens.length} members for ${announcementId}`);
            }
        }
        catch (err) {
            console.error('Error sending care cell announcement notification:', err);
        }
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
    const endTimeStr = data.endTime ? ` – ${data.endTime}` : '';
    const locationStr = data.location ? ` at ${data.location}` : '';
    const messaging = getMessaging();
    try {
        // 1. Fetch active members assigned ONLY to this specific Care Cell
        const membershipsSnap = await db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('careCellMemberships')
            .where('cellId', '==', data.cellId)
            .where('membershipStatus', '==', 'Active')
            .get();
        let memberIds = membershipsSnap.docs.map((d) => d.data().memberId).filter(Boolean);
        if (Array.isArray(data.targetMemberIds) && data.targetMemberIds.length > 0) {
            memberIds = memberIds.filter((id) => data.targetMemberIds.includes(id));
        }
        if (memberIds.length === 0) {
            console.log(`No active members found in care cell ${data.cellId} for meeting push.`);
            return;
        }
        // 2. Collect FCM tokens strictly for these specific members
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
            const notifTitle = `🤝 ${cellName} Gathering: ${title}`;
            const notifBody = `${title} on ${dateStr} at ${timeStr}${endTimeStr}${locationStr}. Tap to view Scripture & location!`;
            const messagePayload = {
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
                    date: String(dateStr),
                    startTime: String(timeStr),
                    location: String(data.location || ''),
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
            console.log(`Successfully sent Care Cell meeting push to ${response.successCount}/${tokens.length} members for meeting ${meetingId}`);
        }
        else {
            console.log(`No valid FCM tokens found for members in care cell ${data.cellId}`);
        }
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
        let memberIds = membershipsSnap.docs.map((d) => d.data().memberId).filter(Boolean);
        if (Array.isArray(data.targetMemberIds) && data.targetMemberIds.length > 0) {
            memberIds = memberIds.filter((id) => data.targetMemberIds.includes(id));
        }
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
/**
 * 🏡 CARE CELL VISIT RESPONSE UPDATED PUSH
 * Sends push notification strictly to the respective Care Cell Leader / Admin when a member
 * responds with acceptance/decline or submits their preferred visiting time.
 */
export const onCareCellVisitResponseUpdated = onDocumentUpdated({ document: 'Rhema Church/{churchId}/careCellVisits/{visitId}', region: 'asia-south1' }, async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!beforeSnap || !afterSnap)
        return;
    const churchId = event.params.churchId;
    const visitId = event.params.visitId;
    const beforeData = beforeSnap.data();
    const afterData = afterSnap.data();
    const beforeResponses = beforeData?.responses || {};
    const afterResponses = afterData?.responses || {};
    // Identify which member's response or preferredTime changed
    const changedMemberIds = [];
    for (const [mId, afterResp] of Object.entries(afterResponses)) {
        const beforeResp = beforeResponses[mId];
        const statusChanged = afterResp.response !== beforeResp?.response &&
            (afterResp.response === 'Accepted' || afterResp.response === 'Declined');
        const timeChanged = afterResp.preferredTime &&
            afterResp.preferredTime !== beforeResp?.preferredTime;
        if (statusChanged || timeChanged) {
            changedMemberIds.push(mId);
        }
    }
    if (changedMemberIds.length === 0)
        return;
    const db = getFirestore();
    const messaging = getMessaging();
    try {
        // 1. Fetch Care Cell record to get leader information
        const cellId = afterData.cellId;
        if (!cellId)
            return;
        const cellDoc = await db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('careCells')
            .doc(cellId)
            .get();
        const cellData = cellDoc.exists ? cellDoc.data() : null;
        const targetLeaderIds = new Set();
        if (cellData?.leaderId)
            targetLeaderIds.add(cellData.leaderId);
        if (cellData?.assistantLeaderId)
            targetLeaderIds.add(cellData.assistantLeaderId);
        if (afterData.assignedLeaderId)
            targetLeaderIds.add(afterData.assignedLeaderId);
        if (targetLeaderIds.size === 0 && afterData.createdBy) {
            targetLeaderIds.add(afterData.createdBy);
        }
        // 2. Collect FCM tokens strictly for this specific Care Cell's leader(s)
        const leaderTokens = [];
        for (const leaderId of targetLeaderIds) {
            try {
                const leaderDoc = await db
                    .collection('Rhema Church')
                    .doc(churchId)
                    .collection('members')
                    .doc(leaderId)
                    .get();
                if (leaderDoc.exists) {
                    const token = leaderDoc.data()?.fcmToken;
                    if (token && typeof token === 'string' && !leaderTokens.includes(token)) {
                        leaderTokens.push(token);
                    }
                }
            }
            catch (_) { }
        }
        if (leaderTokens.length === 0) {
            console.log(`No valid FCM tokens found for Care Cell leader(s) of cell ${cellId}`);
            return;
        }
        // 3. Dispatch targeted push notification to the leader(s)
        for (const memberId of changedMemberIds) {
            // Exclude leader if the leader responded for themselves
            if (targetLeaderIds.has(memberId) && leaderTokens.length === 1)
                continue;
            const resp = afterResponses[memberId];
            const memberName = resp.memberName || 'Cell Member';
            const actionWord = resp.response === 'Accepted' ? 'accepted' : 'declined';
            const timeNote = resp.preferredTime ? ` (Preferred: ${resp.preferredTime})` : '';
            const notifTitle = `🏡 Care Cell Visit: ${memberName}`;
            const notifBody = `${memberName} ${actionWord} the visit on ${afterData.visitDate}${timeNote}.`;
            const messagePayload = {
                notification: {
                    title: notifTitle,
                    body: notifBody,
                },
                data: {
                    type: 'care_cell_visit_response',
                    title: notifTitle,
                    body: notifBody,
                    visitId: String(visitId),
                    cellId: String(cellId),
                    churchId: String(churchId),
                    memberId: String(memberId),
                    response: String(resp.response || ''),
                    preferredTime: String(resp.preferredTime || ''),
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
                tokens: leaderTokens,
            };
            const res = await messaging.sendEachForMulticast(messagePayload);
            console.log(`Successfully sent visit response push for ${memberId} to ${res.successCount} leader device(s)`);
        }
    }
    catch (err) {
        console.error('Error dispatching Care Cell visit response notification to leader:', err);
    }
});
/**
 * ✨ HELPER: NOTIFY AUTHORIZED ADMINS OF NEW TESTIMONY SUBMISSION
 * 1. Notification Trigger: Fires immediately after successful submission & upload completion in Firestore.
 * 2. Submission Status: Must be saved with 'Pending Review' (or 'Private') status.
 * 3. Admin Notification: Scoped strictly to authorized Admins of this church (never other churches).
 * 4. Exact Content:
 *    Title: "New Testimony Submitted!"
 *    Body:  "A Member has submitted a new testimony. Please review it."
 * 5. Navigation: Routes directly to AdminRoot -> Testimonies tab with exact testimonyId.
 * 6. Duplicate Prevention: Atomic transaction check-and-set prevents duplicate notifications even on retries.
 * 7. Background/Cold Start: High-priority FCM payload ensures delivery when app is closed or in background.
 */
async function handleTestimonyAdminCreatedPush(testimony, churchId, testimonyId, snapRef) {
    if (!testimony)
        return;
    // Status requirement: must be 'Pending Review' (or 'Private' submission)
    const status = testimony.status;
    if (status !== 'Pending Review' && status !== 'Private') {
        console.log(`ℹ️ [TestimonyAdminPush] Skipping notification for ${testimonyId}: Status is '${status}', not 'Pending Review' or 'Private'.`);
        return;
    }
    const db = getFirestore();
    const messaging = getMessaging();
    const docRef = snapRef || db.collection('Rhema Church').doc(churchId).collection('testimonies').doc(testimonyId);
    // Atomic deduplication lock: Only one notification per successful submission, even on retry
    let lockAcquired = false;
    try {
        lockAcquired = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(docRef);
            if (!snap.exists)
                return false;
            const data = snap.data() || {};
            if (data.adminPushSent === true) {
                return false;
            }
            transaction.update(docRef, {
                adminPushSent: true,
                adminPushSentAt: FieldValue.serverTimestamp(),
            });
            return true;
        });
    }
    catch (txErr) {
        console.warn(`[TestimonyAdminPush] Deduplication transaction error for ${testimonyId}:`, txErr);
        if (testimony.adminPushSent === true) {
            return;
        }
    }
    if (!lockAcquired) {
        console.log(`🛑 [TestimonyAdminPush] Notification already sent for testimony ${testimonyId}. Skipping duplicate.`);
        return;
    }
    // Exact Notification Content per requirements:
    const title = 'New Testimony Submitted!';
    const body = 'A Member has submitted a new testimony. Please review it.';
    const memberName = (testimony.memberName || 'Church Member').trim();
    const adminTokens = [];
    try {
        // Look up authorized church admins strictly from the corresponding church's members collection
        const membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
        membersSnap.forEach((doc) => {
            const m = doc.data();
            const role = String(m.userType || m.role || '').toLowerCase();
            const isAdmin = role.includes('admin') || role.includes('pastor') || role.includes('super');
            if (isAdmin) {
                if (m.fcmToken && typeof m.fcmToken === 'string' && m.fcmToken.trim().length > 10) {
                    adminTokens.push(m.fcmToken.trim());
                }
                if (Array.isArray(m.fcmTokens)) {
                    m.fcmTokens.forEach((tk) => {
                        if (typeof tk === 'string' && tk.trim().length > 10) {
                            adminTokens.push(tk.trim());
                        }
                    });
                }
            }
        });
    }
    catch (lookupErr) {
        console.error('Error fetching admin tokens for testimony notification:', lookupErr);
    }
    const notificationData = {
        type: 'testimony_admin',
        churchId,
        testimonyId,
        screen: 'AdminRoot',
        targetTab: 'Testimonies',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        channelId: 'church_alerts',
    };
    const uniqueAdminTokens = Array.from(new Set(adminTokens));
    if (uniqueAdminTokens.length > 0) {
        try {
            const sendRes = await messaging.sendEachForMulticast({
                notification: { title, body },
                data: notificationData,
                tokens: uniqueAdminTokens,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        priority: 'max',
                        channelId: 'church_alerts',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1,
                            contentAvailable: true,
                        },
                    },
                },
            });
            console.log(`✅ Sent testimony admin notification to ${sendRes.successCount} admin devices (${sendRes.failureCount} failed).`);
        }
        catch (pushErr) {
            console.error('Error sending multicast testimony admin notification:', pushErr);
        }
    }
    // Broadcast to corresponding church admin topic ONLY: church_{churchId}_admin
    try {
        await messaging.send({
            notification: { title, body },
            data: notificationData,
            topic: `church_${churchId}_admin`,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    priority: 'max',
                    channelId: 'church_alerts',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                        contentAvailable: true,
                    },
                },
            },
        });
        console.log(`✅ Broadcasted testimony notification to topic: church_${churchId}_admin`);
    }
    catch (topicErr) {
        console.error('Error sending testimony notification to church admin topic:', topicErr);
    }
    // Write in-app notification doc for church admins into both broadcasts and notifications
    try {
        const notifPayload = {
            type: 'testimony_admin',
            targetRole: 'admin',
            title,
            body,
            content: `${memberName} submitted a new testimony: "${testimony.title || 'Untitled'}". Please review it.`,
            memberName,
            testimonyId,
            relatedId: testimonyId,
            churchId,
            privacy: testimony.privacy || 'Public',
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        };
        await db.collection('Rhema Church').doc(churchId).collection('broadcasts').add(notifPayload);
        await db.collection('Rhema Church').doc(churchId).collection('notifications').add(notifPayload);
    }
    catch (dbErr) {
        console.error('Error writing testimony in-app broadcast/notification document:', dbErr);
    }
}
/**
 * 🔄 HELPER: HANDLE WORKFLOW STATE UPDATES (MEMBER APPROVAL/REJECTION OR CHURCH-WIDE PUBLICATION)
 */
async function handleTestimonyWorkflowUpdatedPush(before, after, churchId, testimonyId, snapRef) {
    if (!after)
        return;
    const db = getFirestore();
    const messaging = getMessaging();
    const memberName = (after.memberName || 'Church Member').trim();
    const testimonyTitle = (after.title || 'Testimony').trim();
    // ── WORKFLOW CASE 0: Resubmitted for Admin Review ──
    const isResubmittedPendingReview = before?.status !== 'Pending Review' &&
        after.status === 'Pending Review' &&
        after.adminPushSent !== true;
    if (isResubmittedPendingReview) {
        await handleTestimonyAdminCreatedPush(after, churchId, testimonyId, snapRef);
    }
    // ── WORKFLOW CASE 1: Member Status Update (Approved or Rejected) ──
    const statusChanged = before?.status !== after.status;
    const memberNeedsStatusPush = statusChanged &&
        (after.status === 'Approved' || after.status === 'Rejected') &&
        after.lastMemberNotifiedStatus !== after.status;
    if (memberNeedsStatusPush && after.memberId) {
        if (snapRef) {
            try {
                await snapRef.update({
                    lastMemberNotifiedStatus: after.status,
                    lastMemberNotifiedAt: FieldValue.serverTimestamp(),
                });
            }
            catch (_) { }
        }
        const memberTokens = [];
        try {
            // Look up submitting member directly in church members subcollection
            let memberDoc = await db
                .collection('Rhema Church')
                .doc(churchId)
                .collection('members')
                .doc(after.memberId)
                .get();
            if (memberDoc.exists) {
                const mData = memberDoc.data() || {};
                if (mData.fcmToken && typeof mData.fcmToken === 'string' && mData.fcmToken.trim().length > 10) {
                    memberTokens.push(mData.fcmToken.trim());
                }
                if (Array.isArray(mData.fcmTokens)) {
                    mData.fcmTokens.forEach((tk) => {
                        if (typeof tk === 'string' && tk.trim().length > 10) {
                            memberTokens.push(tk.trim());
                        }
                    });
                }
            }
        }
        catch (mErr) {
            console.error('Error fetching submitting member tokens:', mErr);
        }
        const isApproved = after.status === 'Approved';
        const title = isApproved ? '🎉 Testimony Approved!' : 'Testimony Review Update';
        const body = isApproved
            ? `Your testimony "${testimonyTitle}" has been approved by the church admin.`
            : `Your testimony "${testimonyTitle}" was reviewed.${after.rejectionReason ? ` Note: ${after.rejectionReason}` : ''}`;
        const uniqueMemberTokens = Array.from(new Set(memberTokens));
        if (uniqueMemberTokens.length > 0) {
            try {
                await messaging.sendEachForMulticast({
                    notification: { title, body },
                    data: {
                        type: 'testimony_member_status',
                        churchId,
                        testimonyId,
                        status: after.status,
                        rejectionReason: after.rejectionReason || '',
                        click_action: 'FLUTTER_NOTIFICATION_CLICK',
                    },
                    tokens: uniqueMemberTokens,
                    android: {
                        priority: 'high',
                        notification: { sound: 'default', channelId: 'church_alerts' },
                    },
                    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
                });
                console.log(`✅ Sent testimony review update push to member ${after.memberId}`);
            }
            catch (pushErr) {
                console.error('Error sending testimony member status push:', pushErr);
            }
        }
        // In-app broadcast for the submitting member
        try {
            const memberBroadcast = {
                type: 'testimony_member_status',
                targetMemberId: after.memberId,
                title,
                body,
                content: body,
                testimonyId,
                relatedId: testimonyId,
                churchId,
                status: after.status,
                createdAt: FieldValue.serverTimestamp(),
            };
            await db.collection('Rhema Church').doc(churchId).collection('broadcasts').add(memberBroadcast);
            await db.collection('Rhema Church').doc(churchId).collection('notifications').add(memberBroadcast);
        }
        catch (_) { }
    }
    // ── WORKFLOW CASE 2: Publication of Public Testimony (Church-wide broadcast) ──
    const isNewlyPublished = before?.status !== 'Published' &&
        after.status === 'Published' &&
        after.privacy === 'Public' &&
        after.publicationPushSent !== true;
    if (isNewlyPublished) {
        if (snapRef) {
            try {
                await snapRef.update({
                    publicationPushSent: true,
                    publicationPushSentAt: FieldValue.serverTimestamp(),
                });
            }
            catch (_) { }
        }
        const title = '✨ New Testimony Shared!';
        const body = `${memberName} shared a testimony: "${testimonyTitle}". Tap to watch or read!`;
        const notificationData = {
            type: 'testimony_published',
            churchId,
            testimonyId,
            screen: 'TestimonyDetail',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        // 1. Broadcast to general church topic
        try {
            await messaging.send({
                notification: { title, body },
                data: notificationData,
                topic: `church_${churchId}`,
                android: {
                    priority: 'high',
                    notification: { sound: 'default', channelId: 'church_alerts' },
                },
                apns: { payload: { aps: { sound: 'default', badge: 1 } } },
            });
            console.log(`✅ Broadcasted published testimony to topic: church_${churchId}`);
        }
        catch (topicErr) {
            console.error('Error broadcasting testimony to church topic:', topicErr);
        }
        // 2. Direct multicast to church members with tokens
        try {
            const membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
            const allTokens = [];
            membersSnap.forEach((doc) => {
                const d = doc.data();
                if (d.fcmToken && typeof d.fcmToken === 'string' && d.fcmToken.trim().length > 10) {
                    allTokens.push(d.fcmToken.trim());
                }
                if (Array.isArray(d.fcmTokens)) {
                    d.fcmTokens.forEach((tk) => {
                        if (typeof tk === 'string' && tk.trim().length > 10) {
                            allTokens.push(tk.trim());
                        }
                    });
                }
            });
            const uniqueTokens = Array.from(new Set(allTokens));
            // Send in batches of 500 (FCM multicast limit)
            for (let i = 0; i < uniqueTokens.length; i += 500) {
                const batch = uniqueTokens.slice(i, i + 500);
                await messaging.sendEachForMulticast({
                    notification: { title, body },
                    data: notificationData,
                    tokens: batch,
                    android: {
                        priority: 'high',
                        notification: { sound: 'default', channelId: 'church_alerts' },
                    },
                    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
                });
            }
            console.log(`✅ Sent published testimony notification to ${uniqueTokens.length} church member devices.`);
        }
        catch (multicastErr) {
            console.error('Error sending multicast published testimony notifications:', multicastErr);
        }
        // 3. In-app notification and broadcast for church members
        try {
            const pubPayload = {
                type: 'testimony_published',
                title,
                body,
                content: body,
                testimonyId,
                relatedId: testimonyId,
                memberName,
                churchId,
                createdAt: FieldValue.serverTimestamp(),
            };
            await db.collection('Rhema Church').doc(churchId).collection('broadcasts').add(pubPayload);
            await db.collection('Rhema Church').doc(churchId).collection('notifications').add(pubPayload);
        }
        catch (_) { }
    }
}
/**
 * ✨ TRIGGER 1: Member Submits Testimony (Notifies Authorized Admins)
 */
export const onTestimonyCreatedAdmin = onDocumentCreated({ document: 'Rhema Church/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const testimony = snap.data();
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyAdminCreatedPush(testimony, churchId, testimonyId, snap.ref);
});
export const onTestimonyCreatedAdminLegacy = onDocumentCreated({ document: 'churches/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const testimony = snap.data();
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyAdminCreatedPush(testimony, churchId, testimonyId, snap.ref);
});
/**
 * 🔄 TRIGGER 2: Admin Workflow Update (Member Approval/Rejection Notice or Publication Broadcast)
 */
export const onTestimonyUpdatedWorkflow = onDocumentUpdated({ document: 'Rhema Church/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after)
        return;
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyWorkflowUpdatedPush(before, after, churchId, testimonyId, snapRef);
});
export const onTestimonyUpdatedWorkflowLegacy = onDocumentUpdated({ document: 'churches/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after)
        return;
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyWorkflowUpdatedPush(before, after, churchId, testimonyId, snapRef);
});
// ─────────────────────────────────────────────────────────────────────────────
// 🤝 VOLUNTEER MANAGEMENT & RELIABLE PUSH NOTIFICATION SYSTEM
// Supports: General Church Volunteering & Event-Based Volunteering
// Multi-Tier Token Resolution (Church Members + Global Users + Phone/Email)
// High-Priority Push for Foreground, Background, and Killed/Closed App States
// Strict Idempotent Deduplication
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 🔍 TOKEN RESOLVER: Robust Member Device Token Discovery
 * Checks:
 * 1. Rhema Church/{churchId}/members/{memberId}
 * 2. churches/{churchId}/members/{memberId}
 * 3. users/{memberId}
 * 4. Rhema Church/rhema/members/{memberId} (if churchId != 'rhema')
 * 5. Phone lookup in church members & global users (if phone provided)
 * 6. Email lookup in church members & global users (if email provided)
 */
async function resolveVolunteerMemberTokens(db, churchId, memberId, memberPhone, memberEmail, memberName, directFcmToken) {
    const tokenSet = new Set();
    const addToken = (t) => {
        if (typeof t === 'string' && t.trim().length > 10) {
            tokenSet.add(t.trim());
        }
    };
    const addTokensFromArray = (arr) => {
        if (Array.isArray(arr)) {
            arr.forEach((t) => addToken(t));
        }
    };
    if (directFcmToken) {
        addToken(directFcmToken);
    }
    const extractFromDoc = (docSnap) => {
        if (docSnap && docSnap.exists) {
            const data = docSnap.data() || {};
            addToken(data.fcmToken);
            addTokensFromArray(data.fcmTokens);
        }
    };
    const cid = churchId || 'rhema';
    // 1. Direct member document in Rhema Church/{churchId}/members/{memberId}
    if (memberId) {
        try {
            const snap = await db.collection('Rhema Church').doc(cid).collection('members').doc(memberId).get();
            extractFromDoc(snap);
        }
        catch (_) { }
        // 2. Direct member document in churches/{churchId}/members/{memberId}
        try {
            const snap = await db.collection('churches').doc(cid).collection('members').doc(memberId).get();
            extractFromDoc(snap);
        }
        catch (_) { }
        // 3. User document in users/{memberId}
        try {
            const snap = await db.collection('users').doc(memberId).get();
            extractFromDoc(snap);
        }
        catch (_) { }
        // 4. Fallback check in default 'rhema' church if churchId is different
        if (cid !== 'rhema') {
            try {
                const snap = await db.collection('Rhema Church').doc('rhema').collection('members').doc(memberId).get();
                extractFromDoc(snap);
            }
            catch (_) { }
        }
        // 4b. Check members collection by `uid` field in case doc ID differs from Auth UID
        if (tokenSet.size === 0) {
            try {
                const uidSnap = await db.collection('Rhema Church').doc(cid).collection('members').where('uid', '==', memberId).limit(3).get();
                uidSnap.forEach((d) => extractFromDoc(d));
            }
            catch (_) { }
        }
    }
    // 5. Query members by phone if no token found yet
    if (tokenSet.size === 0 && memberPhone) {
        const cleanPhone = String(memberPhone).replace(/[^\d+]/g, '');
        const last10 = cleanPhone.slice(-10);
        if (last10.length >= 7) {
            try {
                const mSnap = await db.collection('Rhema Church').doc(cid).collection('members').get();
                mSnap.forEach((d) => {
                    const dPhone = String(d.data()?.phone || d.data()?.mobile || '').replace(/[^\d+]/g, '');
                    if (dPhone.endsWith(last10))
                        extractFromDoc(d);
                });
            }
            catch (_) { }
            try {
                const uSnap = await db.collection('users').get();
                uSnap.forEach((d) => {
                    const dPhone = String(d.data()?.phone || d.data()?.mobile || '').replace(/[^\d+]/g, '');
                    if (dPhone.endsWith(last10))
                        extractFromDoc(d);
                });
            }
            catch (_) { }
        }
    }
    // 6. Query members by email if no token found yet
    if (tokenSet.size === 0 && memberEmail) {
        const cleanEmail = memberEmail.trim().toLowerCase();
        if (cleanEmail.includes('@')) {
            try {
                const mSnap = await db.collection('Rhema Church').doc(cid).collection('members').where('email', '==', cleanEmail).limit(2).get();
                mSnap.forEach((d) => extractFromDoc(d));
            }
            catch (_) { }
            try {
                const uSnap = await db.collection('users').where('email', '==', cleanEmail).limit(2).get();
                uSnap.forEach((d) => extractFromDoc(d));
            }
            catch (_) { }
        }
    }
    return Array.from(tokenSet);
}
/**
 * 🔍 ADMIN TOKEN RESOLVER: Comprehensive Church Admin Token Discovery
 * Checks:
 * 1. Rhema Church/{churchId}/members for admin/pastor/super roles
 * 2. churches/{churchId}/members for admin/pastor/super roles
 * 3. Church document metadata (adminUid, createdBy, pastorUid, ownerUid, adminUids)
 * 4. Resolves tokens for all discovered admin UIDs in users/{uid} and members/{uid}
 * 5. Direct users collection scan for global admin/superadmin accounts
 */
async function resolveVolunteerAdminTokens(db, churchId) {
    const tokenSet = new Set();
    const adminUidSet = new Set();
    const addToken = (t) => {
        if (typeof t === 'string' && t.trim().length > 10) {
            tokenSet.add(t.trim());
        }
    };
    const addTokensFromArray = (arr) => {
        if (Array.isArray(arr)) {
            arr.forEach((t) => addToken(t));
        }
    };
    const checkMemberDoc = (doc) => {
        const m = doc.data() || {};
        const role = String(m.userType || m.role || '').toLowerCase();
        const isAdmin = role.includes('admin') ||
            role.includes('pastor') ||
            role.includes('super') ||
            role.includes('leader') ||
            role.includes('coordinator') ||
            Boolean(m.isAdmin) ||
            Boolean(m.isSuperAdmin);
        if (isAdmin) {
            adminUidSet.add(doc.id);
            addToken(m.fcmToken);
            addTokensFromArray(m.fcmTokens);
        }
    };
    const cid = churchId || 'rhema';
    // 1. Check Rhema Church/{churchId}/members
    try {
        const snap = await db.collection('Rhema Church').doc(cid).collection('members').get();
        snap.forEach((d) => checkMemberDoc(d));
    }
    catch (_) { }
    // 2. Check churches/{churchId}/members
    try {
        const snap = await db.collection('churches').doc(cid).collection('members').get();
        snap.forEach((d) => checkMemberDoc(d));
    }
    catch (_) { }
    // 3. Inspect church metadata document for creator / owner / pastor UIDs
    const churchDocRefs = [
        db.collection('Rhema Church').doc(cid),
        db.collection('churches').doc(cid),
    ];
    for (const cRef of churchDocRefs) {
        try {
            const cSnap = await cRef.get();
            if (cSnap.exists) {
                const cData = cSnap.data() || {};
                const specialUids = [
                    cData.adminUid,
                    cData.createdBy,
                    cData.pastorUid,
                    cData.ownerUid,
                    ...(Array.isArray(cData.adminUids) ? cData.adminUids : []),
                ].filter(Boolean);
                specialUids.forEach((uid) => adminUidSet.add(uid));
            }
        }
        catch (_) { }
    }
    // 4. For all discovered admin UIDs, query their user doc in users/{uid} and member doc
    for (const uid of Array.from(adminUidSet)) {
        try {
            const uSnap = await db.collection('users').doc(uid).get();
            if (uSnap.exists) {
                const uData = uSnap.data() || {};
                addToken(uData.fcmToken);
                addTokensFromArray(uData.fcmTokens);
            }
        }
        catch (_) { }
        try {
            const mSnap = await db.collection('Rhema Church').doc(cid).collection('members').doc(uid).get();
            if (mSnap.exists) {
                const mData = mSnap.data() || {};
                addToken(mData.fcmToken);
                addTokensFromArray(mData.fcmTokens);
            }
        }
        catch (_) { }
    }
    // 5. Query users collection directly for admin / pastor / super accounts
    try {
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach((doc) => {
            const uData = doc.data() || {};
            const role = String(uData.userType || uData.role || '').toLowerCase();
            const isAdmin = role.includes('admin') ||
                role.includes('pastor') ||
                role.includes('super') ||
                Boolean(uData.isAdmin) ||
                Boolean(uData.isSuperAdmin);
            if (isAdmin) {
                adminUidSet.add(doc.id);
                addToken(uData.fcmToken);
                addTokensFromArray(uData.fcmTokens);
            }
        });
    }
    catch (_) { }
    return {
        tokens: Array.from(tokenSet),
        adminUids: Array.from(adminUidSet),
    };
}
/**
 * 📲 HIGH PRIORITY FCM MULTICAST DISPATCHER
 * Configured for maximum reliability across foreground, background, and completely closed app states.
 */
async function sendHighPriorityPush(messaging, tokens, title, body, data, channelId = 'church_alerts') {
    if (!tokens || tokens.length === 0)
        return { successCount: 0, failureCount: 0 };
    const uniqueTokens = Array.from(new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 10)));
    if (uniqueTokens.length === 0)
        return { successCount: 0, failureCount: 0 };
    let totalSuccess = 0;
    let totalFailure = 0;
    for (let i = 0; i < uniqueTokens.length; i += 500) {
        const chunk = uniqueTokens.slice(i, i + 500);
        try {
            const res = await messaging.sendEachForMulticast({
                notification: { title, body },
                data: {
                    ...data,
                    title,
                    body,
                    channelId,
                    sound: 'default',
                    priority: 'high',
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                },
                tokens: chunk,
                android: {
                    priority: 'high',
                    notification: {
                        title,
                        body,
                        sound: 'default',
                        channelId,
                        priority: 'max',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                        visibility: 'public',
                        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
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
                                title,
                                body,
                            },
                            sound: 'default',
                            badge: 1,
                            contentAvailable: true,
                        },
                    },
                },
            });
            totalSuccess += res.successCount;
            totalFailure += res.failureCount;
            if (res.failureCount > 0) {
                res.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const tokenPreview = chunk[idx] ? chunk[idx].slice(0, 15) : 'unknown';
                        console.warn(`[VolunteerPush] Token delivery failure (${resp.error?.code}): ${tokenPreview}...`);
                    }
                });
            }
        }
        catch (batchErr) {
            console.error('[VolunteerPush] Error dispatching push chunk:', batchErr);
            totalFailure += chunk.length;
        }
    }
    return { successCount: totalSuccess, failureCount: totalFailure };
}
/**
 * 📡 HIGH PRIORITY TOPIC BROADCASTER
 */
async function sendHighPriorityTopicPush(messaging, topic, title, body, data, channelId = 'church_alerts') {
    try {
        await messaging.send({
            notification: { title, body },
            data: {
                ...data,
                title,
                body,
                channelId,
                sound: 'default',
                priority: 'high',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            topic,
            android: {
                priority: 'high',
                notification: {
                    title,
                    body,
                    sound: 'default',
                    channelId,
                    priority: 'max',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    visibility: 'public',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
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
                            title,
                            body,
                        },
                        sound: 'default',
                        badge: 1,
                        contentAvailable: true,
                    },
                },
            },
        });
        console.log(`📡 Broadcasted high-priority volunteer push to topic: ${topic}`);
        return true;
    }
    catch (topicErr) {
        console.warn(`[VolunteerPush] Topic broadcast failed for ${topic}:`, topicErr);
        return false;
    }
}
function computeVolunteerAssignmentKey(data) {
    const raw = [
        data.assignedRole || '',
        data.assignedDate || '',
        data.assignedTimeSlot || '',
        data.assignedLocation || '',
        data.assignedResponsibility || '',
    ].join('|');
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}
/**
 * Persist volunteer in-app notification deterministically across notifications,
 * silent broadcasts (prevents duplicate FCM push), and personal member subcollection.
 */
async function writeVolunteerInAppNotifications(db, churchId, docId, payload, targetMemberIds) {
    const cid = churchId || 'rhema';
    const docData = {
        ...payload,
        churchId: cid,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
    };
    const writes = [
        db.collection('Rhema Church').doc(cid).collection('notifications').doc(docId).set(docData, { merge: true }),
        db.collection('Rhema Church').doc(cid).collection('broadcasts').doc(docId).set({ ...docData, silent: true }, { merge: true }),
    ];
    const memberIds = Array.isArray(targetMemberIds)
        ? Array.from(new Set(targetMemberIds.map((id) => String(id || '').trim()).filter(Boolean)))
        : targetMemberIds
            ? [String(targetMemberIds).trim()].filter(Boolean)
            : [];
    for (const memberId of memberIds) {
        writes.push(db
            .collection('Rhema Church')
            .doc(cid)
            .collection('members')
            .doc(memberId)
            .collection('notifications')
            .doc(docId)
            .set(docData, { merge: true }));
    }
    const results = await Promise.allSettled(writes);
    let allSucceeded = true;
    for (const res of results) {
        if (res.status === 'rejected') {
            allSucceeded = false;
            console.error('Error writing volunteer in-app notification document:', res.reason);
        }
    }
    return allSucceeded;
}
/**
 * 🤝 HELPER: Notify Authorized Church Admins of a New Volunteer Application
 */
async function handleVolunteerApplicationAdminCreatedPush(appData, churchId, applicationId, snapRef) {
    if (!appData)
        return;
    const db = getFirestore();
    const messaging = getMessaging();
    const cid = churchId || 'rhema';
    // Deduplication guard
    if (appData.adminPushSent === true || appData.adminNotified === true) {
        console.log(`🛑 Skipping duplicate volunteer admin push for application: ${applicationId}`);
        return;
    }
    // 1. Resolve Member Name
    let memberName = (appData.memberName || '').trim();
    if (!memberName || memberName.toLowerCase() === 'church member') {
        const memberId = appData.memberId;
        if (memberId) {
            try {
                const mDoc = await db.collection('Rhema Church').doc(cid).collection('members').doc(memberId).get();
                if (mDoc.exists) {
                    const m = mDoc.data();
                    memberName = m?.name || m?.displayName || (m?.firstName ? `${m.firstName} ${m.lastName || ''}`.trim() : '');
                }
            }
            catch (err) {
                console.warn('Could not resolve volunteer member name:', err);
            }
        }
    }
    if (!memberName)
        memberName = 'A Church Member';
    const isEventVolunteer = appData.volunteerType === 'event';
    const eventName = (appData.eventTitle || 'Church Event').trim();
    // 2. Notification title and body according to specification
    const title = isEventVolunteer
        ? '🤝 New Event Volunteer Application!'
        : '📋 New Volunteer Application!';
    const body = isEventVolunteer
        ? `${memberName} has applied to volunteer for ${eventName}. Please review the application.`
        : `${memberName} has submitted a new General Volunteer application. Please review the application.`;
    // 3. Query authorized Admins for this church
    const { tokens: adminTokens, adminUids } = await resolveVolunteerAdminTokens(db, cid);
    const notificationData = {
        type: 'volunteer_application_admin',
        churchId: cid,
        applicationId,
        requestId: applicationId,
        volunteerType: appData.volunteerType || 'general',
        eventId: appData.eventId || '',
        eventTitle: isEventVolunteer ? eventName : '',
        memberName,
        screen: 'AdminRoot',
        targetTab: 'Volunteer Management',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    // 4. Multicast push to direct Admin devices
    if (adminTokens.length > 0) {
        const sendRes = await sendHighPriorityPush(messaging, adminTokens, title, body, notificationData, 'church_alerts');
        console.log(`✅ Sent volunteer application push to ${sendRes.successCount} admin devices (${sendRes.failureCount} failed).`);
    }
    else {
        console.warn(`⚠️ No direct admin FCM tokens resolved for church ${cid}`);
    }
    // 5. Topic Broadcast to church admin topics
    await sendHighPriorityTopicPush(messaging, `church_${cid}_admin`, title, body, notificationData, 'church_alerts');
    if (cid !== 'rhema') {
        await sendHighPriorityTopicPush(messaging, 'church_rhema_admin', title, body, notificationData, 'church_alerts');
    }
    // 6. Write in-app notification doc for admins (notifications, silent broadcast, and admin member feeds)
    await writeVolunteerInAppNotifications(db, cid, `vol_admin_${applicationId}`, {
        type: 'volunteer_application_admin',
        targetRole: 'admin',
        title,
        body,
        content: body,
        memberName,
        volunteerType: appData.volunteerType || 'general',
        eventId: appData.eventId || '',
        eventTitle: isEventVolunteer ? eventName : '',
        applicationId,
        referenceId: applicationId,
        referenceType: isEventVolunteer ? 'event_volunteer' : 'general_volunteer',
    }, adminUids);
    // 7. Atomic update on document to prevent duplicates
    if (snapRef) {
        try {
            await snapRef.update({
                adminPushSent: true,
                adminNotified: true,
                adminPushSentAt: FieldValue.serverTimestamp(),
                adminNotifiedAt: FieldValue.serverTimestamp(),
            });
        }
        catch (_) { }
    }
}
/**
 * 🤝 HELPER: Handle Volunteer Application Status Transitions (Approval, Rejection, Assignment)
 */
async function handleVolunteerApplicationWorkflowUpdatedPush(before, after, churchId, applicationId, snapRef) {
    if (!after)
        return;
    const db = getFirestore();
    const messaging = getMessaging();
    const cid = churchId || 'rhema';
    const isEventVolunteer = after.volunteerType === 'event';
    const eventName = (after.eventTitle || 'the church event').trim();
    const memberId = after.memberId;
    // Retrieve member tokens across members collection, users collection, direct token, and phone/email lookups
    const memberTokens = await resolveVolunteerMemberTokens(db, cid, memberId, after.memberPhone, after.memberEmail, after.memberName, after.memberFcmToken || after.fcmToken);
    // Status normalization
    const currentStatus = String(after.status || '').toLowerCase().trim();
    const beforeStatus = String(before?.status || '').toLowerCase().trim();
    const isStatusDecision = currentStatus === 'approved' || currentStatus === 'rejected' || currentStatus === 'declined';
    const statusChanged = beforeStatus !== currentStatus;
    const currentAssignmentHash = [
        after.assignedRole || '',
        after.assignedDate || '',
        after.assignedTimeSlot || '',
        after.assignedLocation || '',
        after.assignedResponsibility || '',
    ].join('|');
    // ── WORKFLOW TRIGGER 2 & 3: Application Status Changed (Approved / Rejected) ──
    if (isStatusDecision && after.lastNotifiedStatus !== currentStatus) {
        let title = '';
        let body = '';
        if (currentStatus === 'approved') {
            title = '🎉 Volunteer Application Approved!';
            if (isEventVolunteer) {
                body = `Your application for ${eventName} has been approved.${after.assignedRole ? ` Assigned Role: ${after.assignedRole}.` : ''} Please check your event details.`;
            }
            else {
                body = 'Your volunteer application has been approved. Thank you for your willingness to serve the church.';
            }
        }
        else {
            title = 'Volunteer Application Update';
            const reasonPart = after.rejectionReason ? ` Reason: ${after.rejectionReason}` : ' Please check your application details in the app.';
            if (isEventVolunteer) {
                body = `Your volunteer application for ${eventName} has not been approved.${reasonPart}`;
            }
            else {
                body = `Your volunteer application has not been approved.${reasonPart}`;
            }
        }
        const notificationData = {
            type: 'volunteer_application_member',
            churchId: cid,
            applicationId,
            status: currentStatus,
            volunteerType: after.volunteerType || 'general',
            eventId: after.eventId || '',
            eventTitle: isEventVolunteer ? eventName : '',
            screen: isEventVolunteer && after.eventId ? 'EventDetails' : 'Volunteer',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        if (memberTokens.length > 0) {
            const sendRes = await sendHighPriorityPush(messaging, memberTokens, title, body, notificationData, 'church_alerts');
            console.log(`✅ Sent volunteer status (${currentStatus}) push to member ${memberId}: ${sendRes.successCount} delivered.`);
        }
        else {
            console.warn(`⚠️ No device FCM tokens resolved for member ${memberId} (${after.memberName || 'Volunteer'})`);
        }
        // In-app notification record for the member
        if (memberId) {
            const normalizedKeyStatus = currentStatus === 'declined' ? 'rejected' : currentStatus;
            await writeVolunteerInAppNotifications(db, cid, `vol_status_${applicationId}_${normalizedKeyStatus}`, {
                type: 'volunteer_application_member',
                recipientId: memberId,
                recipientRole: 'member',
                targetMemberId: memberId,
                targetPhone: after.memberPhone || '',
                title,
                body,
                content: body,
                status: currentStatus,
                volunteerType: after.volunteerType || 'general',
                eventId: after.eventId || '',
                eventTitle: isEventVolunteer ? eventName : '',
                applicationId,
                referenceId: applicationId,
                referenceType: isEventVolunteer ? 'event_volunteer' : 'general_volunteer',
            }, memberId);
        }
        // Atomic update to mark status notification delivered and initialize assignment hash
        if (snapRef) {
            try {
                const updatePayload = {
                    lastNotifiedStatus: currentStatus,
                    lastNotifiedStatusAt: FieldValue.serverTimestamp(),
                };
                if (currentStatus === 'approved') {
                    updatePayload.lastNotifiedAssignmentHash = currentAssignmentHash;
                }
                await snapRef.update(updatePayload);
            }
            catch (_) { }
        }
    }
    // ── WORKFLOW TRIGGER 4: Specific Volunteer Assignment Made or Modified (Subsequent Updates Only) ──
    const beforeAssignmentHash = [
        before?.assignedRole || '',
        before?.assignedDate || '',
        before?.assignedTimeSlot || '',
        before?.assignedLocation || '',
        before?.assignedResponsibility || '',
    ].join('|');
    const assignmentChanged = currentStatus === 'approved' &&
        !statusChanged && // Prevent duplicate notification on the same approval turn
        currentAssignmentHash.trim() !== '||||' &&
        currentAssignmentHash !== beforeAssignmentHash &&
        after.lastNotifiedAssignmentHash !== currentAssignmentHash;
    if (assignmentChanged) {
        const title = '⭐ You Have Been Assigned!';
        const roleText = after.assignedRole ? `as ${after.assignedRole}` : 'a volunteer';
        const body = `You have been assigned ${roleText} for ${eventName}.${after.assignedResponsibility ? ` Duty: ${after.assignedResponsibility}.` : ''} Please check your assignment details.`;
        const notificationData = {
            type: 'volunteer_assignment',
            churchId: cid,
            applicationId,
            eventId: after.eventId || '',
            assignedRole: after.assignedRole || '',
            assignedTimeSlot: after.assignedTimeSlot || '',
            assignedLocation: after.assignedLocation || '',
            screen: 'EventDetails',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        if (memberTokens.length > 0) {
            const sendRes = await sendHighPriorityPush(messaging, memberTokens, title, body, notificationData, 'church_alerts');
            console.log(`✅ Sent volunteer assignment push to member ${memberId}: ${sendRes.successCount} delivered.`);
        }
        if (memberId) {
            const assignKey = computeVolunteerAssignmentKey({
                assignedRole: after.assignedRole,
                assignedDate: after.assignedDate,
                assignedTimeSlot: after.assignedTimeSlot,
                assignedLocation: after.assignedLocation,
                assignedResponsibility: after.assignedResponsibility,
            });
            await writeVolunteerInAppNotifications(db, cid, `vol_assign_${applicationId}_${assignKey}`, {
                type: 'volunteer_assignment',
                recipientId: memberId,
                recipientRole: 'member',
                targetMemberId: memberId,
                targetPhone: after.memberPhone || '',
                title,
                body,
                content: body,
                volunteerType: after.volunteerType || 'event',
                eventId: after.eventId || '',
                eventTitle: eventName,
                applicationId,
                referenceId: applicationId,
                referenceType: 'event_volunteer',
            }, memberId);
        }
        if (snapRef) {
            try {
                await snapRef.update({
                    lastNotifiedAssignmentHash: currentAssignmentHash,
                    assignedAt: FieldValue.serverTimestamp(),
                });
            }
            catch (_) { }
        }
    }
}
/**
 * 📢 HELPER: Handle Event Changes or Cancellation (Notifies Affected Approved Volunteers Only)
 */
async function handleEventChangesForVolunteersPush(before, after, churchId, eventId) {
    if (!after)
        return;
    const db = getFirestore();
    const messaging = getMessaging();
    const cid = churchId || 'rhema';
    const isCancelled = !before?.isCancelled && after?.isCancelled === true;
    const dateChanged = before?.date !== after?.date;
    const timeChanged = (before?.time || before?.startTime) !== (after?.time || after?.startTime);
    const locationChanged = before?.location !== after?.location;
    if (!isCancelled && !dateChanged && !timeChanged && !locationChanged) {
        return;
    }
    // Query only approved volunteers for this specific event
    try {
        const volSnap = await db
            .collection('Rhema Church')
            .doc(cid)
            .collection('volunteer_applications')
            .where('eventId', '==', eventId)
            .where('status', '==', 'approved')
            .get();
        if (volSnap.empty)
            return;
        const eventName = (after.title || after.name || 'Church Event').trim();
        let title = '';
        let body = '';
        if (isCancelled) {
            title = `⚠️ Event Cancelled: ${eventName}`;
            body = `The event "${eventName}" has been cancelled. Your volunteer assignment is cancelled. Thank you for your willingness to serve.`;
        }
        else {
            title = `📅 Volunteer Update: ${eventName}`;
            const changeParts = [];
            if (dateChanged && after.date)
                changeParts.push(`Date: ${after.date}`);
            if (timeChanged)
                changeParts.push(`Time: ${after.time || after.startTime}`);
            if (locationChanged && after.location)
                changeParts.push(`Location: ${after.location}`);
            body = `Details for "${eventName}" have changed (${changeParts.join(', ')}). Please check your updated volunteer assignment.`;
        }
        const allTokens = [];
        for (const vDoc of volSnap.docs) {
            const vd = vDoc.data();
            const mTokens = await resolveVolunteerMemberTokens(db, cid, vd.memberId, vd.memberPhone, vd.memberEmail, vd.memberName);
            allTokens.push(...mTokens);
        }
        const uniqueTokens = Array.from(new Set(allTokens));
        if (uniqueTokens.length > 0) {
            await sendHighPriorityPush(messaging, uniqueTokens, title, body, {
                type: 'volunteer_event_change',
                churchId: cid,
                eventId,
                screen: 'EventDetails',
                isCancelled: String(isCancelled),
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            }, 'church_alerts');
            console.log(`✅ Sent event change alert to ${uniqueTokens.length} approved volunteer devices.`);
        }
        // Write in-app notification doc for each approved volunteer
        for (const vDoc of volSnap.docs) {
            const vd = vDoc.data();
            const mId = vd.memberId;
            if (!mId)
                continue;
            await writeVolunteerInAppNotifications(db, cid, `vol_event_${eventId}_${mId}`, {
                type: 'volunteer_event_change',
                recipientId: mId,
                recipientRole: 'member',
                targetMemberId: mId,
                targetPhone: vd.memberPhone || '',
                title,
                body,
                content: body,
                eventId,
                eventTitle: eventName,
                referenceId: vDoc.id,
                referenceType: 'event_volunteer',
            }, mId);
        }
    }
    catch (err) {
        console.error('Error dispatching event volunteer change pushes:', err);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// 🚀 EXPORTED VOLUNTEER CLOUD FUNCTIONS (v2)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 🤝 TRIGGER 1: Member Submits Volunteer Application (Admin Notified)
 */
export const onVolunteerApplicationCreated = onDocumentCreated({ document: 'Rhema Church/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const appData = snap.data();
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationAdminCreatedPush(appData, churchId, applicationId, snap.ref);
});
export const onVolunteerApplicationCreatedLegacy = onDocumentCreated({ document: 'churches/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const appData = snap.data();
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationAdminCreatedPush(appData, churchId, applicationId, snap.ref);
});
/**
 * 🤝 TRIGGER 2, 3, 4: Status Transition & Volunteer Role Assignment (Member Notified)
 */
export const onVolunteerApplicationUpdated = onDocumentUpdated({ document: 'Rhema Church/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after)
        return;
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationWorkflowUpdatedPush(before, after, churchId, applicationId, snapRef);
});
export const onVolunteerApplicationUpdatedLegacy = onDocumentUpdated({ document: 'churches/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after)
        return;
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationWorkflowUpdatedPush(before, after, churchId, applicationId, snapRef);
});
/**
 * 📅 TRIGGER 5: Event Details or Cancellation (Affected Approved Volunteers Notified)
 */
export const onEventUpdatedForVolunteers = onDocumentUpdated({ document: 'Rhema Church/{churchId}/events/{eventId}', region: 'asia-south1' }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after)
        return;
    const churchId = event.params.churchId;
    const eventId = event.params.eventId;
    await handleEventChangesForVolunteersPush(before, after, churchId, eventId);
});
export const onEventUpdatedForVolunteersLegacy = onDocumentUpdated({ document: 'churches/{churchId}/events/{eventId}', region: 'asia-south1' }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after)
        return;
    const churchId = event.params.churchId;
    const eventId = event.params.eventId;
    await handleEventChangesForVolunteersPush(before, after, churchId, eventId);
});
/**
 * ⏰ TRIGGER 6: Scheduled 24-Hour & 2-Hour Volunteer Reminders
 * Scans upcoming events and sends reliable reminders to approved volunteers.
 */
export const scheduledVolunteerReminders = onSchedule({ schedule: '*/30 * * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();
    const now = new Date();
    console.log('⏰ Running scheduled volunteer reminder cron at:', now.toISOString());
    try {
        const churchesSnap = await db.collection('Rhema Church').get();
        for (const cDoc of churchesSnap.docs) {
            const churchId = cDoc.id;
            const eventsSnap = await db
                .collection('Rhema Church')
                .doc(churchId)
                .collection('events')
                .where('volunteerEnabled', '==', true)
                .get();
            if (eventsSnap.empty)
                continue;
            for (const eDoc of eventsSnap.docs) {
                const ev = eDoc.data();
                if (ev.isCancelled === true)
                    continue;
                const dateStr = ev.date;
                const timeStr = ev.time || ev.startTime || '10:00';
                if (!dateStr)
                    continue;
                let eventTimestamp;
                try {
                    eventTimestamp = new Date(`${dateStr}T${timeStr.includes(':') ? timeStr.split(' ')[0] : '10:00'}:00`).getTime();
                    if (isNaN(eventTimestamp)) {
                        eventTimestamp = new Date(dateStr).getTime();
                    }
                }
                catch (_) {
                    continue;
                }
                const diffHours = (eventTimestamp - now.getTime()) / (1000 * 60 * 60);
                const is24hWindow = diffHours >= 23 && diffHours <= 25;
                const is2hWindow = diffHours >= 1.5 && diffHours <= 2.5;
                if (!is24hWindow && !is2hWindow)
                    continue;
                const volSnap = await db
                    .collection('Rhema Church')
                    .doc(churchId)
                    .collection('volunteer_applications')
                    .where('eventId', '==', eDoc.id)
                    .where('status', '==', 'approved')
                    .get();
                if (volSnap.empty)
                    continue;
                for (const vDoc of volSnap.docs) {
                    const vData = vDoc.data();
                    const remindersSent = vData.remindersSent || {};
                    let shouldSend = false;
                    let reminderType = '';
                    let title = '';
                    let body = '';
                    if (is24hWindow && !remindersSent.h24) {
                        shouldSend = true;
                        reminderType = '24h';
                        title = '⏰ Volunteer Reminder: Tomorrow!';
                        body = `You are scheduled to volunteer for ${ev.title || 'Church Event'} tomorrow. Date: ${dateStr}, Time: ${timeStr}, Role: ${vData.assignedRole || vData.preferredRole || 'Volunteer'}, Location: ${ev.location || 'Church'}.`;
                    }
                    else if (is2hWindow && !remindersSent.h2) {
                        shouldSend = true;
                        reminderType = '2h';
                        title = '🔔 Volunteer Reminder: In 2 Hours!';
                        body = `Reminder: You are scheduled to volunteer for ${ev.title || 'Church Event'} in 2 hours. Role: ${vData.assignedRole || vData.preferredRole || 'Volunteer'}, Location: ${ev.location || 'Church'}.`;
                    }
                    if (!shouldSend)
                        continue;
                    const updateField = reminderType === '24h'
                        ? { 'remindersSent.h24': true, 'remindersSent.h24At': FieldValue.serverTimestamp() }
                        : { 'remindersSent.h2': true, 'remindersSent.h2At': FieldValue.serverTimestamp() };
                    try {
                        await vDoc.ref.update(updateField);
                    }
                    catch (_) { }
                    const memberId = vData.memberId;
                    if (memberId) {
                        const tokens = await resolveVolunteerMemberTokens(db, churchId, memberId, vData.memberPhone, vData.memberEmail, vData.memberName);
                        if (tokens.length > 0) {
                            await sendHighPriorityPush(messaging, tokens, title, body, {
                                type: 'volunteer_reminder',
                                churchId,
                                eventId: eDoc.id,
                                screen: 'EventDetails',
                                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                            }, 'church_alerts');
                            console.log(`✅ Sent ${reminderType} reminder to volunteer member: ${memberId}`);
                        }
                        await writeVolunteerInAppNotifications(db, churchId, `vol_rem_${reminderType}_${eDoc.id}_${memberId}`, {
                            type: 'volunteer_reminder',
                            recipientId: memberId,
                            recipientRole: 'member',
                            targetMemberId: memberId,
                            targetPhone: vData.memberPhone || '',
                            title,
                            body,
                            content: body,
                            eventId: eDoc.id,
                            eventTitle: ev.title || 'Church Event',
                            referenceId: vDoc.id,
                            referenceType: 'event_volunteer',
                        }, memberId);
                    }
                }
            }
        }
    }
    catch (cronErr) {
        console.error('Error in scheduledVolunteerReminders cron:', cronErr);
    }
});
/**
 * 🛠️ HTTP TEST ENDPOINT: Direct Volunteer Push Verification
 * Query params:
 *   action: 'admin_test' | 'member_test'
 *   churchId: string (default 'rhema')
 *   memberId: string (required for member_test)
 */
export const triggerVolunteerPushTestHttp = onRequest({ cors: true, region: 'asia-south1' }, async (req, res) => {
    try {
        const db = getFirestore();
        const messaging = getMessaging();
        const action = String(req.query.action || 'admin_test');
        const churchId = String(req.query.churchId || 'rhema');
        const memberId = String(req.query.memberId || '');
        if (action === 'admin_test') {
            const { tokens, adminUids } = await resolveVolunteerAdminTokens(db, churchId);
            const title = '📋 [Test] Volunteer Application Received';
            const body = 'This is a test notification verifying Church Admin volunteer alert delivery.';
            const sendRes = await sendHighPriorityPush(messaging, tokens, title, body, {
                type: 'volunteer_application_admin',
                churchId,
                applicationId: 'test_app_id',
                screen: 'AdminRoot',
                targetTab: 'Volunteer Management',
            }, 'church_alerts');
            res.status(200).json({
                success: true,
                action,
                churchId,
                adminUids,
                resolvedTokensCount: tokens.length,
                result: sendRes,
            });
            return;
        }
        if (action === 'member_test') {
            if (!memberId) {
                res.status(400).json({ success: false, error: 'memberId query param is required for member_test' });
                return;
            }
            const tokens = await resolveVolunteerMemberTokens(db, churchId, memberId);
            const title = '🎉 [Test] Volunteer Application Approved!';
            const body = 'This is a test notification verifying Member volunteer approval delivery.';
            const sendRes = await sendHighPriorityPush(messaging, tokens, title, body, {
                type: 'volunteer_application_member',
                churchId,
                applicationId: 'test_app_id',
                status: 'approved',
                screen: 'Volunteer',
            }, 'church_alerts');
            res.status(200).json({
                success: true,
                action,
                churchId,
                memberId,
                resolvedTokensCount: tokens.length,
                result: sendRes,
            });
            return;
        }
        res.status(400).json({ success: false, error: 'Invalid action. Use action=admin_test or action=member_test' });
    }
    catch (err) {
        console.error('Error in triggerVolunteerPushTestHttp:', err);
        res.status(500).json({ success: false, error: err?.message || String(err) });
    }
});
// ─────────────────────────────────────────────────────────────
// 💼 JOB CIRCLE & MINISTRY RECRUITMENT CLOUD TRIGGERS
// ─────────────────────────────────────────────────────────────
const JOB_CIRCLE_CLAIM_TTL_MS = 2 * 60 * 1000;
async function claimJobCircleNotificationLease(db, docRef, claimAtField, shouldSkip, claimFields = {}) {
    if (!docRef)
        return false;
    const nowMs = Date.now();
    return db.runTransaction(async (tx) => {
        const fresh = await tx.get(docRef);
        if (!fresh.exists)
            return false;
        const freshData = fresh.data() || {};
        if (shouldSkip(freshData, nowMs))
            return false;
        tx.update(docRef, {
            ...claimFields,
            [claimAtField]: nowMs,
        });
        return true;
    });
}
async function releaseJobCircleNotificationLease(docRef, fieldsToDelete) {
    if (!docRef || fieldsToDelete.length === 0)
        return;
    const payload = {};
    for (const field of fieldsToDelete) {
        payload[field] = FieldValue.delete();
    }
    await docRef.update(payload).catch(() => { });
}
/**
 * Shared Helper: Broadcast high-priority push & deterministic in-app notification
 * when a Ministry Opportunity is published (`status === 'approved'`).
 * Uses a recoverable pending lease transaction and marks `approvedNotificationSent`
 * only after delivery succeeds.
 */
async function handleJobOpportunityPublishedPush(data, churchId, opportunityId, snapRef) {
    if (!data || data.status !== 'approved')
        return;
    const cid = churchId || 'rhema';
    const db = getFirestore();
    const messaging = getMessaging();
    // Atomic recoverable lease so Create + Edit/Update or concurrent retries never double-notify
    if (snapRef) {
        const shouldSend = await claimJobCircleNotificationLease(db, snapRef, 'approvedNotificationClaimAt', (freshData, nowMs) => freshData.status !== 'approved' ||
            freshData.approvedNotificationSent === true ||
            (typeof freshData.approvedNotificationClaimAt === 'number' &&
                nowMs - freshData.approvedNotificationClaimAt < JOB_CIRCLE_CLAIM_TTL_MS));
        if (!shouldSend) {
            console.log(`🛑 [JobCircle] Skipping duplicate opportunity push for: ${opportunityId}`);
            return;
        }
    }
    else if (data.approvedNotificationSent === true) {
        return;
    }
    try {
        const oppTitle = data.title || 'Ministry Volunteer';
        const categoryText = data.categoryName ? ` in ${data.categoryName}` : '';
        const title = '💼 New Ministry Opportunity Open!';
        const body = `Rhema Church is inviting members to serve in "${oppTitle}"${categoryText}. Tap to view details and submit your calling!`;
        const tokenSet = new Set();
        const addTokens = (docData) => {
            if (!docData)
                return;
            if (Array.isArray(docData.fcmTokens)) {
                docData.fcmTokens.forEach((tk) => {
                    if (typeof tk === 'string' && tk.trim().length > 10)
                        tokenSet.add(tk.trim());
                });
            }
            if (typeof docData.fcmToken === 'string' && docData.fcmToken.trim().length > 10) {
                tokenSet.add(docData.fcmToken.trim());
            }
        };
        try {
            const membersSnap = await db.collection('Rhema Church').doc(cid).collection('members').get();
            membersSnap.forEach((mDoc) => addTokens(mDoc.data()));
        }
        catch (e) {
            console.warn('[JobCircle] Could not read Rhema Church members tokens:', e);
        }
        try {
            const altMembersSnap = await db.collection('churches').doc(cid).collection('members').get();
            altMembersSnap.forEach((mDoc) => addTokens(mDoc.data()));
        }
        catch (_) { }
        try {
            const usersSnap = await db.collection('users').get();
            usersSnap.forEach((uDoc) => {
                const uData = uDoc.data();
                if (!uData)
                    return;
                const uChurch = uData.primaryChurchId || uData.churchId || 'rhema';
                if (uChurch === cid) {
                    addTokens(uData);
                }
            });
        }
        catch (_) { }
        const memberTokens = Array.from(tokenSet);
        const pushData = {
            type: 'job_opportunity_new',
            churchId: cid,
            opportunityId,
            targetTab: 'Job Circle',
            screen: 'OpportunityDetailScreen',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        let pushDelivered = false;
        if (memberTokens.length > 0) {
            const pushRes = await sendHighPriorityPush(messaging, memberTokens, title, body, pushData, 'church_alerts');
            pushDelivered = pushRes.successCount > 0;
        }
        else {
            pushDelivered = await sendHighPriorityTopicPush(messaging, `church_${cid}`, title, body, pushData, 'church_alerts');
        }
        // Persist deterministically in church notifications for Updates screen visibility (no duplicates)
        await db
            .collection('Rhema Church')
            .doc(cid)
            .collection('notifications')
            .doc(`job_opp_${opportunityId}`)
            .set({
            type: 'job_opportunity_new',
            churchId: cid,
            title,
            body,
            content: body,
            opportunityId,
            opportunityTitle: oppTitle,
            categoryName: data.categoryName || '',
            referenceId: opportunityId,
            referenceType: 'job_circle_opportunity',
            createdAt: FieldValue.serverTimestamp(),
            read: false,
        }, { merge: true });
        if (!pushDelivered) {
            throw new Error(`[JobCircle] Opportunity FCM push failed for ${opportunityId}`);
        }
        if (snapRef) {
            await snapRef.update({
                approvedNotificationSent: true,
                approvedNotificationSentAt: FieldValue.serverTimestamp(),
                approvedNotificationClaimAt: FieldValue.delete(),
            });
        }
        console.log(`✅ [JobCircle] Broadcasted new opportunity "${oppTitle}" to ${memberTokens.length} member device(s).`);
    }
    catch (err) {
        await releaseJobCircleNotificationLease(snapRef, ['approvedNotificationClaimAt']);
        console.error('[JobCircle] Error broadcasting new opportunity push:', err);
        throw err;
    }
}
/**
 * Trigger: When a member submits a new Ministry Application
 * Notifies Church Admins so they can review the candidate and their attached CV.
 */
export const onJobApplicationCreated = onDocumentCreated({ document: 'Rhema Church/{churchId}/job_circle_applications/{applicationId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const churchId = event.params.churchId || 'rhema';
    const applicationId = event.params.applicationId;
    const db = getFirestore();
    const messaging = getMessaging();
    // Atomic recoverable lease; propagate transaction errors rather than bypassing deduplication
    const shouldSend = await claimJobCircleNotificationLease(db, snap.ref, 'adminPushClaimAt', (freshData, nowMs) => freshData.adminPushSent === true ||
        (typeof freshData.adminPushClaimAt === 'number' &&
            nowMs - freshData.adminPushClaimAt < JOB_CIRCLE_CLAIM_TTL_MS));
    if (!shouldSend) {
        console.log(`🛑 [JobCircle] Skipping duplicate admin push for application: ${applicationId}`);
        return;
    }
    try {
        const applicantName = data.memberName || 'A church member';
        const roleTitle = data.opportunityTitle || 'Ministry Position';
        const title = '💼 New Ministry Application!';
        const body = `${applicantName} has applied for "${roleTitle}". Please review their calling and attached CV.`;
        const { tokens: adminTokens, adminUids } = await resolveVolunteerAdminTokens(db, churchId);
        const pushData = {
            type: 'job_application_admin',
            churchId,
            applicationId,
            opportunityId: data.opportunityId || '',
            targetTab: 'Job Circle',
            screen: 'AdminRoot',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        let pushDelivered = false;
        if (adminTokens.length > 0) {
            const pushRes = await sendHighPriorityPush(messaging, adminTokens, title, body, pushData, 'church_alerts');
            pushDelivered = pushRes.successCount > 0;
        }
        else {
            pushDelivered = await sendHighPriorityTopicPush(messaging, `church_${churchId}_admin`, title, body, pushData, 'church_alerts');
        }
        // Persist deterministic in-app notification for admins (targetRole: 'admin' restricts from non-admins)
        const inAppDelivered = await writeVolunteerInAppNotifications(db, churchId, `job_admin_${applicationId}`, {
            type: 'job_application_admin',
            targetRole: 'admin',
            recipientRole: 'admin',
            title,
            body,
            content: body,
            memberName: applicantName,
            applicationId,
            opportunityId: data.opportunityId || '',
            opportunityTitle: roleTitle,
            applicantName,
            referenceType: 'job_circle_application',
            referenceId: applicationId,
        }, adminUids);
        if (!pushDelivered || !inAppDelivered) {
            throw new Error(`[JobCircle] Incomplete admin notification delivery for application ${applicationId}`);
        }
        await snap.ref.update({
            adminPushSent: true,
            adminPushSentAt: FieldValue.serverTimestamp(),
            adminPushClaimAt: FieldValue.delete(),
        });
        console.log(`✅ [JobCircle] Notified admins for new application: ${applicationId}`);
    }
    catch (err) {
        await releaseJobCircleNotificationLease(snap.ref, ['adminPushClaimAt']);
        console.error('[JobCircle] Error handling onJobApplicationCreated push:', err);
        throw err;
    }
});
/**
 * Trigger: When an Admin updates an Application Status (Under Review, Meeting Scheduled, Selected, Shortlisted, Rejected)
 * Sends instant push notification & personal in-app notification strictly to the applicant member.
 */
export const onJobApplicationUpdated = onDocumentUpdated({ document: 'Rhema Church/{churchId}/job_circle_applications/{applicationId}', region: 'asia-south1' }, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const before = change.before.data();
    const after = change.after.data();
    const churchId = event.params.churchId || 'rhema';
    const applicationId = event.params.applicationId;
    if (!before || !after)
        return;
    if (before.status === after.status)
        return; // Only notify on status transitions
    const status = String(after.status || '').trim();
    if (!status || status === 'withdrawn' || status === 'submitted')
        return;
    if (after.lastNotifiedStatus === status)
        return;
    const memberId = after.memberId || '';
    const roleTitle = after.opportunityTitle || 'Ministry Position';
    let title = '💼 Ministry Application Update';
    let body = `Your application for "${roleTitle}" has been updated to ${status.replace(/_/g, ' ').toUpperCase()}.`;
    if (status === 'under_review') {
        title = '🔍 Application Under Review';
        body = `Your application for "${roleTitle}" is now prayerfully under review by church ministry leaders.`;
    }
    else if (status === 'meeting_scheduled') {
        title = '📅 Ministry Interview / Meeting Scheduled!';
        const dateStr = after.meetingDate ? ` on ${after.meetingDate}` : '';
        const timeStr = after.meetingTime ? ` at ${after.meetingTime}` : '';
        const locStr = after.meetingLocation ? ` (${after.meetingLocation})` : '';
        body = `A ministry interview has been scheduled for your application for "${roleTitle}"${dateStr}${timeStr}${locStr}. Tap to view full details.`;
    }
    else if (status === 'selected') {
        title = '🎉 Congratulations! You have been Selected!';
        body = `Congratulations! You have been selected to serve in "${roleTitle}". Welcome to the ministry team!`;
    }
    else if (status === 'shortlisted') {
        title = '⭐ Application Shortlisted!';
        body = `Your application for "${roleTitle}" has been shortlisted by church ministry leaders.`;
    }
    else if (status === 'rejected') {
        title = '📋 Ministry Application Update';
        const reasonStr = after.adminNotes ? ` Note: ${after.adminNotes}` : '';
        body = `Thank you for your heart to serve. Your application for "${roleTitle}" has not been selected at this time.${reasonStr}`;
    }
    const db = getFirestore();
    const messaging = getMessaging();
    // Atomic lease check: verify the live doc still has this exact status, hasn't been notified,
    // and isn't actively claimed by another concurrent invocation for the same status.
    const shouldSend = await claimJobCircleNotificationLease(db, change.after.ref, 'statusNotifyClaimAt', (freshData, nowMs) => freshData.status !== status ||
        freshData.lastNotifiedStatus === status ||
        (freshData.statusNotifyClaimStatus === status &&
            typeof freshData.statusNotifyClaimAt === 'number' &&
            nowMs - freshData.statusNotifyClaimAt < JOB_CIRCLE_CLAIM_TTL_MS), { statusNotifyClaimStatus: status });
    if (!shouldSend) {
        console.log(`🛑 [JobCircle] Skipping stale or duplicate member status push for ${applicationId} -> ${status}`);
        return;
    }
    try {
        const tokens = await resolveVolunteerMemberTokens(db, churchId, memberId, after.memberPhone, after.memberEmail, after.memberName, after.memberFcmToken || after.fcmToken);
        let pushDelivered = tokens.length === 0;
        if (tokens.length > 0) {
            const pushRes = await sendHighPriorityPush(messaging, tokens, title, body, {
                type: 'job_application_member',
                churchId,
                applicationId,
                opportunityId: after.opportunityId || '',
                status,
                screen: after.opportunityId ? 'OpportunityDetailScreen' : 'JobCircle',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            }, 'church_alerts');
            pushDelivered = pushRes.successCount > 0;
        }
        // Target strictly to applicant member so other church members do NOT see this personal update
        const inAppDelivered = await writeVolunteerInAppNotifications(db, churchId, `job_status_${applicationId}_${status}`, {
            type: 'job_application_member',
            recipientId: memberId,
            recipientRole: 'member',
            targetMemberId: memberId,
            targetPhone: after.memberPhone || '',
            title,
            body,
            content: body,
            applicationId,
            opportunityId: after.opportunityId || '',
            opportunityTitle: roleTitle,
            status,
            referenceType: 'job_circle_application',
            referenceId: applicationId,
        }, memberId);
        if (!pushDelivered || !inAppDelivered) {
            throw new Error(`[JobCircle] Incomplete member status delivery for ${applicationId} -> ${status}`);
        }
        await db.runTransaction(async (tx) => {
            const fresh = await tx.get(change.after.ref);
            if (!fresh.exists)
                return;
            const freshData = fresh.data() || {};
            const updatePayload = {};
            if (freshData.status === status) {
                updatePayload.lastNotifiedStatus = status;
                updatePayload.lastNotifiedStatusAt = FieldValue.serverTimestamp();
            }
            if (freshData.statusNotifyClaimStatus === status) {
                updatePayload.statusNotifyClaimStatus = FieldValue.delete();
                updatePayload.statusNotifyClaimAt = FieldValue.delete();
            }
            if (Object.keys(updatePayload).length > 0) {
                tx.update(change.after.ref, updatePayload);
            }
        });
        console.log(`✅ [JobCircle] Notified member ${memberId} of status update: ${status}`);
    }
    catch (err) {
        await db
            .runTransaction(async (tx) => {
            const fresh = await tx.get(change.after.ref);
            if (!fresh.exists)
                return;
            const freshData = fresh.data() || {};
            if (freshData.statusNotifyClaimStatus === status) {
                tx.update(change.after.ref, {
                    statusNotifyClaimStatus: FieldValue.delete(),
                    statusNotifyClaimAt: FieldValue.delete(),
                });
            }
        })
            .catch(() => { });
        console.error('[JobCircle] Error handling onJobApplicationUpdated push:', err);
        throw err;
    }
});
/**
 * Trigger: When a new Ministry Opportunity is created as published (`status == 'approved'`)
 * Automatically broadcasts a high-priority push notification to all church members!
 */
export const onJobOpportunityCreated = onDocumentCreated({ document: 'Rhema Church/{churchId}/job_circle_opportunities/{opportunityId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const churchId = event.params.churchId;
    const opportunityId = event.params.opportunityId;
    if (data.status !== 'approved') {
        console.log(`[JobCircle] Opportunity ${opportunityId} created with status '${data.status}', skipping member broadcast.`);
        return;
    }
    await handleJobOpportunityPublishedPush(data, churchId, opportunityId, snap.ref);
});
/**
 * Trigger: When an existing Draft / Pending Ministry Opportunity is published (`status` transitions to 'approved')
 * Automatically broadcasts a high-priority push notification to all church members!
 */
export const onJobOpportunityUpdated = onDocumentUpdated({ document: 'Rhema Church/{churchId}/job_circle_opportunities/{opportunityId}', region: 'asia-south1' }, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const before = change.before.data();
    const after = change.after.data();
    const churchId = event.params.churchId;
    const opportunityId = event.params.opportunityId;
    if (!after)
        return;
    if (before?.status !== 'approved' && after.status === 'approved') {
        await handleJobOpportunityPublishedPush(after, churchId, opportunityId, change.after.ref);
    }
});
// ─────────────────────────────────────────────────────────────
// 🛡️ NEW MEMBER REGISTRATION – ADMIN APPROVAL NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
function isStrictAdminRole(record) {
    if (!record)
        return false;
    const role = String(record.userType || record.role || '').toLowerCase();
    return (Boolean(record.isAdmin) ||
        Boolean(record.isSuperAdmin) ||
        Boolean(record.superadmin) ||
        role.includes('admin') ||
        role.includes('pastor') ||
        role.includes('super'));
}
async function resolveChurchRegistrationAdminTokens(db, churchId) {
    const tokenSet = new Set();
    const adminUidSet = new Set();
    const cid = churchId || 'rhema';
    const collectTokens = (docData) => {
        if (!docData)
            return;
        if (typeof docData.fcmToken === 'string' && docData.fcmToken.trim().length > 10) {
            tokenSet.add(docData.fcmToken.trim());
        }
        if (Array.isArray(docData.fcmTokens)) {
            docData.fcmTokens.forEach((tk) => {
                if (typeof tk === 'string' && tk.trim().length > 10)
                    tokenSet.add(tk.trim());
            });
        }
    };
    for (const colName of ['Rhema Church', 'churches']) {
        try {
            const mSnap = await db.collection(colName).doc(cid).collection('members').get();
            mSnap.forEach((doc) => {
                const data = doc.data() || {};
                if (isStrictAdminRole(data)) {
                    adminUidSet.add(doc.id);
                    collectTokens(data);
                }
            });
        }
        catch (_) { }
        try {
            const cSnap = await db.collection(colName).doc(cid).get();
            if (cSnap.exists) {
                const cData = cSnap.data() || {};
                const ownerUids = [
                    cData.adminUid,
                    cData.createdBy,
                    cData.pastorUid,
                    cData.ownerUid,
                    ...(Array.isArray(cData.adminUids) ? cData.adminUids : []),
                ].filter(Boolean);
                ownerUids.forEach((uid) => adminUidSet.add(String(uid)));
            }
        }
        catch (_) { }
    }
    try {
        const pSnap = await db.collection('platform_admins').get();
        pSnap.forEach((doc) => {
            const data = doc.data() || {};
            if (isStrictAdminRole(data)) {
                adminUidSet.add(doc.id);
                collectTokens(data);
            }
        });
    }
    catch (_) { }
    for (const uid of Array.from(adminUidSet)) {
        try {
            const uSnap = await db.collection('users').doc(uid).get();
            if (uSnap.exists)
                collectTokens(uSnap.data());
        }
        catch (_) { }
        try {
            const mSnap = await db.collection('Rhema Church').doc(cid).collection('members').doc(uid).get();
            if (mSnap.exists)
                collectTokens(mSnap.data());
        }
        catch (_) { }
    }
    try {
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach((doc) => {
            const uData = doc.data() || {};
            const userChurch = uData.primaryChurchId || uData.churchId;
            const role = String(uData.userType || uData.role || '').toLowerCase();
            const isPlatformSuper = Boolean(uData.isSuperAdmin) || role.includes('super');
            if (isStrictAdminRole(uData) && (isPlatformSuper || !userChurch || userChurch === cid)) {
                adminUidSet.add(doc.id);
                collectTokens(uData);
            }
        });
    }
    catch (_) { }
    return {
        tokens: Array.from(tokenSet),
        adminUids: Array.from(adminUidSet),
    };
}
async function resolveRegistrationApplicantTokens(db, churchId, requestId, reqData) {
    const tokenSet = new Set();
    const cid = churchId || 'rhema';
    const collectTokens = (docData) => {
        if (!docData)
            return;
        if (typeof docData.fcmToken === 'string' && docData.fcmToken.trim().length > 10) {
            tokenSet.add(docData.fcmToken.trim());
        }
        if (Array.isArray(docData.fcmTokens)) {
            docData.fcmTokens.forEach((tk) => {
                if (typeof tk === 'string' && tk.trim().length > 10)
                    tokenSet.add(tk.trim());
            });
        }
    };
    collectTokens(reqData);
    const candidateIds = Array.from(new Set([reqData.authUid, reqData.memberId, requestId].map((v) => String(v || '').trim()).filter(Boolean)));
    for (const uid of candidateIds) {
        try {
            const uSnap = await db.collection('users').doc(uid).get();
            if (uSnap.exists)
                collectTokens(uSnap.data());
        }
        catch (_) { }
        try {
            const mSnap = await db.collection('Rhema Church').doc(cid).collection('members').doc(uid).get();
            if (mSnap.exists)
                collectTokens(mSnap.data());
        }
        catch (_) { }
    }
    if (tokenSet.size === 0 && reqData.phone) {
        const rawDigits = String(reqData.phone).replace(/\D/g, '');
        const last10 = rawDigits.slice(-10);
        const phoneVariants = Array.from(new Set([String(reqData.phone).trim(), last10 ? `+91${last10}` : '', last10].filter(Boolean)));
        for (const p of phoneVariants) {
            try {
                const uSnap = await db.collection('users').where('phone', '==', p).get();
                uSnap.forEach((d) => collectTokens(d.data()));
            }
            catch (_) { }
        }
    }
    return Array.from(tokenSet);
}
async function resolveChurchDisplayName(db, churchId) {
    try {
        const cSnap = await db.collection('Rhema Church').doc(churchId || 'rhema').get();
        if (cSnap.exists) {
            const cName = cSnap.data()?.name;
            if (typeof cName === 'string' && cName.trim())
                return cName.trim();
        }
    }
    catch (_) { }
    return 'Rhema Global Ministries';
}
async function handleRegistrationAdminPendingPush(data, churchId, requestId, snapRef) {
    if (!data || (data.status && data.status !== 'pending'))
        return;
    const cid = churchId || 'rhema';
    const db = getFirestore();
    const messaging = getMessaging();
    const shouldSend = await claimJobCircleNotificationLease(db, snapRef, 'adminPushClaimAt', (freshData, nowMs) => (freshData.status && freshData.status !== 'pending') ||
        freshData.adminPushSent === true ||
        (typeof freshData.adminPushClaimAt === 'number' &&
            nowMs - freshData.adminPushClaimAt < JOB_CIRCLE_CLAIM_TTL_MS));
    if (!shouldSend) {
        console.log(`🛑 [RegistrationApproval] Skipping duplicate admin push for request: ${requestId}`);
        return;
    }
    try {
        const applicantName = String(data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.phone || 'A new member').trim();
        const city = String(data.city || data.village || '').trim();
        const locationSuffix = city ? ` from ${city}` : '';
        const title = '🆕 New Member Registration Request';
        const body = `${applicantName}${locationSuffix} has registered and is requesting admin approval.`;
        const { tokens: adminTokens, adminUids } = await resolveChurchRegistrationAdminTokens(db, cid);
        const pushData = {
            type: 'registration_request_admin',
            churchId: cid,
            requestId,
            memberName: applicantName,
            targetTab: 'Approvals',
            screen: 'AdminRoot',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        const pushDelivered = adminTokens.length > 0
            ? (await sendHighPriorityPush(messaging, adminTokens, title, body, pushData, 'church_alerts')).successCount > 0
            : await sendHighPriorityTopicPush(messaging, `church_${cid}_admin`, title, body, pushData, 'church_alerts');
        const inAppDelivered = await writeVolunteerInAppNotifications(db, cid, `reg_admin_${requestId}`, {
            type: 'registration_request_admin',
            targetRole: 'admin',
            recipientRole: 'admin',
            title,
            body,
            content: body,
            memberName: applicantName,
            applicantName,
            memberPhone: data.phone || '',
            requestId,
            referenceId: requestId,
            referenceType: 'registration_request',
        }, adminUids);
        if (!pushDelivered || !inAppDelivered) {
            throw new Error(`[RegistrationApproval] Incomplete admin alert delivery for request ${requestId}`);
        }
        await snapRef.update({
            adminPushSent: true,
            adminPushSentAt: FieldValue.serverTimestamp(),
            adminPushClaimAt: FieldValue.delete(),
        });
        console.log(`✅ [RegistrationApproval] Notified admins of new registration: ${applicantName} (${requestId})`);
    }
    catch (err) {
        await releaseJobCircleNotificationLease(snapRef, ['adminPushClaimAt']);
        console.error('[RegistrationApproval] Error notifying admins of new registration:', err);
        throw err;
    }
}
async function handleRegistrationStatusMemberPush(after, churchId, requestId, snapRef) {
    const status = String(after.status || '').trim();
    if (status !== 'approved' && status !== 'rejected')
        return;
    const cid = churchId || 'rhema';
    const db = getFirestore();
    const messaging = getMessaging();
    const shouldSend = await claimJobCircleNotificationLease(db, snapRef, 'statusNotifyClaimAt', (freshData, nowMs) => freshData.status !== status ||
        freshData.lastNotifiedStatus === status ||
        (freshData.statusNotifyClaimStatus === status &&
            typeof freshData.statusNotifyClaimAt === 'number' &&
            nowMs - freshData.statusNotifyClaimAt < JOB_CIRCLE_CLAIM_TTL_MS), { statusNotifyClaimStatus: status });
    if (!shouldSend) {
        console.log(`🛑 [RegistrationApproval] Skipping stale/duplicate ${status} notification for: ${requestId}`);
        return;
    }
    try {
        const churchName = await resolveChurchDisplayName(db, cid);
        const applicantName = String(after.fullName || `${after.firstName || ''} ${after.lastName || ''}`.trim() || 'Member').trim();
        const isApproved = status === 'approved';
        const rejectionReason = String(after.rejectionReason || '').trim();
        const title = isApproved ? '🎉 Registration Approved!' : '📋 Registration Not Approved';
        const body = isApproved
            ? `Welcome, ${applicantName}! Your membership registration with ${churchName} has been approved. Tap to sign in and get started.`
            : `${applicantName}, your membership registration with ${churchName} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;
        const notifType = isApproved ? 'registration_approved' : 'registration_rejected';
        const memberTokens = await resolveRegistrationApplicantTokens(db, cid, requestId, after);
        let pushDelivered = memberTokens.length === 0;
        if (memberTokens.length > 0) {
            const pushRes = await sendHighPriorityPush(messaging, memberTokens, title, body, {
                type: notifType,
                churchId: cid,
                requestId,
                status,
                screen: 'ApprovalPending',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            }, 'church_alerts');
            pushDelivered = pushRes.successCount > 0;
        }
        let inAppDelivered = true;
        const targetMemberId = String(after.authUid || requestId || '').trim();
        if (isApproved && targetMemberId) {
            inAppDelivered = await writeVolunteerInAppNotifications(db, cid, `reg_status_${requestId}_${status}`, {
                type: notifType,
                recipientId: targetMemberId,
                recipientRole: 'member',
                targetMemberId,
                targetPhone: after.phone || '',
                title,
                body,
                content: body,
                requestId,
                status,
                referenceType: 'registration_request',
                referenceId: requestId,
            }, targetMemberId);
        }
        if (!pushDelivered || !inAppDelivered) {
            throw new Error(`[RegistrationApproval] Incomplete ${status} notification delivery for ${requestId}`);
        }
        await db.runTransaction(async (tx) => {
            const fresh = await tx.get(snapRef);
            if (!fresh.exists)
                return;
            const freshData = fresh.data() || {};
            const updatePayload = {};
            if (freshData.status === status) {
                updatePayload.lastNotifiedStatus = status;
                updatePayload.lastNotifiedStatusAt = FieldValue.serverTimestamp();
            }
            if (freshData.statusNotifyClaimStatus === status) {
                updatePayload.statusNotifyClaimStatus = FieldValue.delete();
                updatePayload.statusNotifyClaimAt = FieldValue.delete();
            }
            if (Object.keys(updatePayload).length > 0) {
                tx.update(snapRef, updatePayload);
            }
        });
        console.log(`✅ [RegistrationApproval] Sent ${status} notification to ${applicantName} (${memberTokens.length} device(s)).`);
    }
    catch (err) {
        await db
            .runTransaction(async (tx) => {
            const fresh = await tx.get(snapRef);
            if (!fresh.exists)
                return;
            const freshData = fresh.data() || {};
            if (freshData.statusNotifyClaimStatus === status) {
                tx.update(snapRef, {
                    statusNotifyClaimStatus: FieldValue.delete(),
                    statusNotifyClaimAt: FieldValue.delete(),
                });
            }
        })
            .catch(() => { });
        console.error(`[RegistrationApproval] Error sending ${status} member notification:`, err);
        throw err;
    }
}
/**
 * Trigger: When a new member registration request is created
 * Notifies church Admins requesting approval.
 */
export const onRegistrationRequestCreated = onDocumentCreated({ document: 'Rhema Church/{churchId}/registration_requests/{requestId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data() || {};
    const churchId = event.params.churchId || 'rhema';
    const requestId = event.params.requestId;
    await handleRegistrationAdminPendingPush(data, churchId, requestId, snap.ref);
});
/**
 * Trigger: When a registration request status changes
 * - Returning to `pending` notifies church Admins.
 * - Transitioning to `approved` or `rejected` notifies the specific registering member.
 */
export const onRegistrationRequestUpdated = onDocumentUpdated({ document: 'Rhema Church/{churchId}/registration_requests/{requestId}', region: 'asia-south1' }, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const churchId = event.params.churchId || 'rhema';
    const requestId = event.params.requestId;
    if (before.status === after.status)
        return;
    if (after.status === 'pending') {
        await handleRegistrationAdminPendingPush(after, churchId, requestId, change.after.ref);
        return;
    }
    if (after.status === 'approved' || after.status === 'rejected') {
        await handleRegistrationStatusMemberPush(after, churchId, requestId, change.after.ref);
    }
});
// ─────────────────────────────────────────────────────────────
// 📢 GENERAL VOLUNTEER CALL POSTS – MEMBER PUSH NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
async function handleVolunteerPostPublishedPush(data, churchId, postId, snapRef) {
    if (!data)
        return;
    if (data.notifyMembers === false) {
        console.log(`🛑 [VolunteerPost] notifyMembers is false for ${postId}, skipping push.`);
        return;
    }
    const db = getFirestore();
    const messaging = getMessaging();
    const cid = churchId || 'rhema';
    if (snapRef) {
        const shouldSend = await claimJobCircleNotificationLease(db, snapRef, 'postPushClaimAt', (freshData, nowMs) => freshData.postNotificationSent === true ||
            (typeof freshData.postPushClaimAt === 'number' &&
                nowMs - freshData.postPushClaimAt < JOB_CIRCLE_CLAIM_TTL_MS));
        if (!shouldSend) {
            console.log(`🛑 [VolunteerPost] Skipping duplicate push for volunteer post: ${postId}`);
            return;
        }
    }
    else if (data.postNotificationSent === true) {
        return;
    }
    try {
        const postTitle = (data.title || 'Church Volunteer Call').trim();
        const ministries = Array.isArray(data.ministries) ? data.ministries : [];
        const ministryLabels = ministries
            .map((m) => String(m || '').split('·')[0]?.trim() || String(m || '').trim())
            .filter(Boolean);
        const minPart = ministryLabels.length > 0 ? ` (${ministryLabels.slice(0, 2).join(', ')})` : '';
        const title = `🤝 Volunteer Call: ${postTitle}`;
        const body = (data.description || '').trim() ||
            `We are inviting church members to serve in "${postTitle}"${minPart}. Tap to apply and serve!`;
        const tokenSet = new Set();
        const addTokens = (docData) => {
            if (!docData)
                return;
            if (Array.isArray(docData.fcmTokens)) {
                docData.fcmTokens.forEach((tk) => {
                    if (typeof tk === 'string' && tk.trim().length > 10)
                        tokenSet.add(tk.trim());
                });
            }
            if (typeof docData.fcmToken === 'string' && docData.fcmToken.trim().length > 10) {
                tokenSet.add(docData.fcmToken.trim());
            }
        };
        try {
            const membersSnap = await db.collection('Rhema Church').doc(cid).collection('members').get();
            membersSnap.forEach((mDoc) => addTokens(mDoc.data()));
        }
        catch (e) {
            console.warn('[VolunteerPost] Could not read Rhema Church members tokens:', e);
        }
        try {
            const altMembersSnap = await db.collection('churches').doc(cid).collection('members').get();
            altMembersSnap.forEach((mDoc) => addTokens(mDoc.data()));
        }
        catch (_) { }
        try {
            const usersSnap = await db.collection('users').get();
            usersSnap.forEach((uDoc) => {
                const uData = uDoc.data();
                if (!uData)
                    return;
                const uChurch = uData.primaryChurchId || uData.churchId || 'rhema';
                if (uChurch === cid) {
                    addTokens(uData);
                }
            });
        }
        catch (_) { }
        const memberTokens = Array.from(tokenSet);
        const pushData = {
            type: 'volunteer_post_new',
            churchId: cid,
            postId,
            postTitle,
            screen: 'Volunteer',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        };
        let pushDelivered = false;
        if (memberTokens.length > 0) {
            const pushRes = await sendHighPriorityPush(messaging, memberTokens, title, body, pushData, 'church_alerts');
            pushDelivered = pushRes.successCount > 0;
        }
        else {
            pushDelivered = await sendHighPriorityTopicPush(messaging, `church_${cid}`, title, body, pushData, 'church_alerts');
        }
        const docId = `vol_post_${postId}`;
        const inAppPayload = {
            type: 'volunteer_post_new',
            churchId: cid,
            targetChurchId: cid,
            title,
            body,
            content: body,
            postId,
            postTitle,
            referenceId: postId,
            referenceType: 'general_volunteer_post',
            screen: 'Volunteer',
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        };
        await Promise.all([
            db
                .collection('Rhema Church')
                .doc(cid)
                .collection('notifications')
                .doc(docId)
                .set(inAppPayload, { merge: true }),
            db
                .collection('Rhema Church')
                .doc(cid)
                .collection('broadcasts')
                .doc(docId)
                .set({ ...inAppPayload, silent: true }, { merge: true }),
        ]);
        if (!pushDelivered) {
            throw new Error(`[VolunteerPost] Member FCM push failed for ${postId}`);
        }
        if (snapRef) {
            await snapRef.update({
                postNotificationSent: true,
                postNotificationSentAt: FieldValue.serverTimestamp(),
                postPushClaimAt: FieldValue.delete(),
            });
        }
        console.log(`✅ [VolunteerPost] Broadcasted volunteer call "${postTitle}" to ${memberTokens.length} member device(s).`);
    }
    catch (err) {
        await releaseJobCircleNotificationLease(snapRef, ['postPushClaimAt']);
        console.error('[VolunteerPost] Error broadcasting volunteer post push:', err);
        throw err;
    }
}
/**
 * Trigger: When an Admin publishes a new General Volunteer Call Post (`status == 'open'`)
 */
export const onVolunteerPostCreated = onDocumentCreated({ document: 'Rhema Church/{churchId}/volunteer_posts/{postId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data() || {};
    const churchId = event.params.churchId || 'rhema';
    const postId = event.params.postId;
    if (data.status && data.status !== 'open')
        return;
    await handleVolunteerPostPublishedPush(data, churchId, postId, snap.ref);
});
/**
 * Trigger: When a closed General Volunteer Call Post is reopened (`status` transitions to `'open'`)
 */
export const onVolunteerPostUpdated = onDocumentUpdated({ document: 'Rhema Church/{churchId}/volunteer_posts/{postId}', region: 'asia-south1' }, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const churchId = event.params.churchId || 'rhema';
    const postId = event.params.postId;
    if (before.status !== 'open' && after.status === 'open') {
        await handleVolunteerPostPublishedPush(after, churchId, postId, change.after.ref);
    }
});
/**
 * Resolve strictly the linked parent/household FCM device tokens for a Kids Ministry child.
 * Never broadcasts to church-wide topics to uphold child safety & family privacy.
 */
async function resolveKidsParentTargetsAndTokens(db, churchId, record) {
    let targetMemberId = String(record?.parentMemberId || '').trim();
    let targetAccountId = String(record?.familyId || '').trim();
    let targetPhone = String(record?.parentPhone || '').trim();
    const childDocId = String(record?.childDocId || '').trim();
    if ((!targetMemberId && !targetAccountId && !targetPhone) && childDocId) {
        try {
            const childSnap = await db
                .collection('Rhema Church')
                .doc(churchId)
                .collection('kids_children')
                .doc(childDocId)
                .get();
            if (childSnap.exists) {
                const cData = childSnap.data() || {};
                targetMemberId = String(cData.parentMemberId || '').trim();
                targetAccountId = String(cData.familyId || '').trim();
                targetPhone = String(cData.parentPhone || '').trim();
            }
        }
        catch (_) { }
    }
    const tokenSet = new Set();
    const addTokens = (d) => {
        if (!d)
            return;
        if (typeof d.fcmToken === 'string' && d.fcmToken.trim().length > 10) {
            tokenSet.add(d.fcmToken.trim());
        }
        if (Array.isArray(d.fcmTokens)) {
            d.fcmTokens.forEach((tk) => {
                if (typeof tk === 'string' && tk.trim().length > 10)
                    tokenSet.add(tk.trim());
            });
        }
    };
    const targetDigits = targetPhone.replace(/\D/g, '').slice(-10);
    const matchesParent = (docId, d) => {
        if (!d)
            return false;
        if (targetMemberId && (docId === targetMemberId || d.id === targetMemberId || d.uid === targetMemberId)) {
            return true;
        }
        if (targetAccountId && (d.accountId === targetAccountId || docId === targetAccountId)) {
            // Skip child docs without FCM tokens; parent/spouse household members match here
            return !d.isKidMember;
        }
        if (targetDigits.length >= 10) {
            const mDigits = String(d.phone || d.mobile || d.MobilePhone || '').replace(/\D/g, '').slice(-10);
            if (mDigits && mDigits === targetDigits)
                return true;
        }
        return false;
    };
    try {
        const membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();
        membersSnap.forEach((mDoc) => {
            const d = mDoc.data();
            if (matchesParent(mDoc.id, d))
                addTokens(d);
        });
    }
    catch (_) { }
    try {
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach((uDoc) => {
            const u = uDoc.data();
            if (!u)
                return;
            const uChurch = u.primaryChurchId || u.churchId || 'rhema';
            if (uChurch !== churchId)
                return;
            if (matchesParent(uDoc.id, u))
                addTokens(u);
        });
    }
    catch (_) { }
    return {
        targetMemberId,
        targetAccountId,
        targetPhone,
        tokens: Array.from(tokenSet),
    };
}
/**
 * Shared parent notification dispatcher for Kids Check-In, Check-Out, and Finalized Absent alerts.
 */
async function dispatchKidsAttendanceParentPush(params) {
    const db = getFirestore();
    const messaging = getMessaging();
    const { churchId, docId, type, title, body, record } = params;
    const targetInfo = await resolveKidsParentTargetsAndTokens(db, churchId, record);
    // Persist idempotent in-app notification using deterministic docId
    await db
        .collection('Rhema Church')
        .doc(churchId)
        .collection('notifications')
        .doc(docId)
        .set({
        type,
        churchId,
        title,
        body,
        content: body,
        targetMemberId: targetInfo.targetMemberId,
        targetAccountId: targetInfo.targetAccountId,
        targetPhone: targetInfo.targetPhone,
        childDocId: String(record?.childDocId || ''),
        childId: String(record?.childId || ''),
        childName: String(record?.childName || ''),
        programSessionId: String(record?.programSessionId || ''),
        programTitle: String(record?.programTitle || ''),
        screen: 'KidsMinistry',
        initialCategory: 'attendance',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (targetInfo.tokens.length > 0) {
        await sendHighPriorityPush(messaging, targetInfo.tokens, title, body, {
            type,
            churchId,
            childDocId: String(record?.childDocId || ''),
            programSessionId: String(record?.programSessionId || ''),
            initialCategory: 'attendance',
            screen: 'KidsMinistry',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        }, 'church_alerts');
        console.log(`✅ [KidsMinistry] Dispatched ${type} push (${docId}) to ${targetInfo.tokens.length} parent device(s).`);
    }
    else {
        console.log(`ℹ️ [KidsMinistry] No parent FCM token found for ${docId}; in-app notification recorded.`);
    }
}
/**
 * Trigger: Child Checked In -> Notify parent with class & pickup code.
 */
export const onKidsSessionCreated = onDocumentCreated({ document: 'Rhema Church/{churchId}/kids_sessions/{sessionId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data() || {};
    if (data.checkInPushSent === true || data.status !== 'active')
        return;
    const churchId = event.params.churchId || 'rhema';
    const sessionId = event.params.sessionId;
    const childName = data.childName || 'Your child';
    const programTitle = data.programTitle || 'Sunday School';
    const className = data.className || programTitle;
    const pickupCode = data.pickupCode ? ` Pickup Code: ${data.pickupCode}.` : '';
    try {
        await snap.ref.update({ checkInPushSent: true, checkInPushSentAt: FieldValue.serverTimestamp() });
        await dispatchKidsAttendanceParentPush({
            churchId,
            docId: `kids_in_${sessionId}`,
            type: 'kids_check_in',
            title: `Checked In: ${childName}`,
            body: `${childName} safely checked into ${programTitle} (${className}).${pickupCode}`,
            record: data,
        });
    }
    catch (err) {
        console.error(`[KidsMinistry] Error sending check-in push for ${sessionId}:`, err);
    }
});
/**
 * Trigger: Child Checked Out -> Notify parent with handover guardian details.
 */
export const onKidsSessionUpdated = onDocumentUpdated({ document: 'Rhema Church/{churchId}/kids_sessions/{sessionId}', region: 'asia-south1' }, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (before.status === 'checked_out' || after.status !== 'checked_out')
        return;
    if (after.checkOutPushSent === true)
        return;
    const churchId = event.params.churchId || 'rhema';
    const sessionId = event.params.sessionId;
    const childName = after.childName || 'Your child';
    const programTitle = after.programTitle || 'Sunday School';
    const guardianName = after.checkedOutByName || 'an authorized guardian';
    try {
        await change.after.ref.update({ checkOutPushSent: true, checkOutPushSentAt: FieldValue.serverTimestamp() });
        await dispatchKidsAttendanceParentPush({
            churchId,
            docId: `kids_out_${sessionId}`,
            type: 'kids_check_out',
            title: `Checked Out: ${childName}`,
            body: `${childName} was safely checked out from ${programTitle} and handed over to ${guardianName}.`,
            record: after,
        });
    }
    catch (err) {
        console.error(`[KidsMinistry] Error sending check-out push for ${sessionId}:`, err);
    }
});
/**
 * Trigger: Child Marked Absent -> Strictly verifies program attendanceFinalized === true before sending alert.
 */
export const onKidsAttendanceAbsentCreated = onDocumentCreated({ document: 'Rhema Church/{churchId}/kids_attendance/{attendanceId}', region: 'asia-south1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data() || {};
    if (data.status !== 'absent' || data.absentPushSent === true)
        return;
    const churchId = event.params.churchId || 'rhema';
    const attendanceId = event.params.attendanceId;
    const programSessionId = String(data.programSessionId || '').trim();
    if (!programSessionId)
        return;
    const db = getFirestore();
    try {
        // Strictly ensure absent notification never fires before program attendance is finalized
        const progSnap = await db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('kids_program_sessions')
            .doc(programSessionId)
            .get();
        if (!progSnap.exists || progSnap.data()?.attendanceFinalized !== true) {
            console.log(`🛑 [KidsMinistry] Skipping absent alert for ${attendanceId}: program session ${programSessionId} not finalized yet.`);
            return;
        }
        await snap.ref.update({ absentPushSent: true, absentPushSentAt: FieldValue.serverTimestamp() });
        const childName = data.childName || 'Your child';
        const programTitle = data.programTitle || 'Sunday School';
        const dateStr = data.sessionDate || '';
        await dispatchKidsAttendanceParentPush({
            churchId,
            docId: `kids_absent_${programSessionId}_${data.childDocId || attendanceId}`,
            type: 'kids_absent',
            title: `Absent Notice: ${childName}`,
            body: `${childName} was marked absent for ${programTitle}${dateStr ? ` (${dateStr})` : ''} after attendance was finalized.`,
            record: data,
        });
    }
    catch (err) {
        console.error(`[KidsMinistry] Error sending absent push for ${attendanceId}:`, err);
    }
});
function normalizeLast10(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : '';
}
function isSuperAdminDocData(data) {
    if (!data)
        return false;
    const roleText = `${data.userType || ''} ${data.role || ''}`.toUpperCase();
    return (data.superadmin === true ||
        data.isSuperAdmin === true ||
        roleText.includes('SUPER'));
}
function formatInvoiceNumberDisplayServer(invNo) {
    const raw = String(invNo || '').trim();
    if (!raw)
        return '';
    return raw.replace(/^INV[-_](?:COG|RGM)(\d+)$/i, 'Inv_RGM$1');
}
function collectDeviceTokens(targetSet, docData) {
    if (!docData)
        return;
    if (typeof docData.fcmToken === 'string' && docData.fcmToken.trim().length > 10) {
        targetSet.add(docData.fcmToken.trim());
    }
    if (Array.isArray(docData.fcmTokens)) {
        docData.fcmTokens.forEach((t) => {
            if (typeof t === 'string' && t.trim().length > 10)
                targetSet.add(t.trim());
        });
    }
}
async function resolveSuperAdminRecipients(db, churchId, targetUid, targetPhone10) {
    const superAdminTokens = new Set();
    const targetTokens = new Set();
    const verifiedSuperUids = new Set();
    const verifiedSuperPhones = new Set();
    try {
        const [platformSnap, membersSnap] = await Promise.all([
            db.collection('platform_admins').get(),
            db.collection('Rhema Church').doc(churchId).collection('members').get(),
        ]);
        const memberById = new Map();
        membersSnap.forEach((doc) => {
            const m = doc.data() || {};
            memberById.set(doc.id, m);
            if (isSuperAdminDocData(m)) {
                verifiedSuperUids.add(doc.id);
                if (typeof m.uid === 'string' && m.uid.trim())
                    verifiedSuperUids.add(m.uid.trim());
                const p10 = normalizeLast10(m.phone);
                if (p10)
                    verifiedSuperPhones.add(p10);
                collectDeviceTokens(superAdminTokens, m);
                const matchesTarget = (targetUid && (doc.id === targetUid || m.uid === targetUid)) ||
                    (targetPhone10 && p10 === targetPhone10);
                if (matchesTarget)
                    collectDeviceTokens(targetTokens, m);
            }
        });
        platformSnap.forEach((doc) => {
            const p = doc.data() || {};
            const roleStr = String(p.role || '').toLowerCase();
            if (p.superadmin === true || roleStr.includes('super')) {
                verifiedSuperUids.add(doc.id);
                const p10 = normalizeLast10(p.phone);
                if (p10)
                    verifiedSuperPhones.add(p10);
                const m = memberById.get(doc.id);
                collectDeviceTokens(superAdminTokens, p);
                collectDeviceTokens(superAdminTokens, m);
                const matchesTarget = (targetUid && doc.id === targetUid) ||
                    (targetPhone10 && p10 === targetPhone10);
                if (matchesTarget) {
                    collectDeviceTokens(targetTokens, p);
                    collectDeviceTokens(targetTokens, m);
                }
            }
        });
        if (targetUid &&
            targetTokens.size === 0 &&
            (verifiedSuperUids.has(targetUid) || (targetPhone10 && verifiedSuperPhones.has(targetPhone10)))) {
            const uSnap = await db.collection('users').doc(targetUid).get().catch(() => null);
            if (uSnap && uSnap.exists) {
                collectDeviceTokens(targetTokens, uSnap.data());
            }
        }
    }
    catch (lookupErr) {
        console.error('❌ [ExpenseApproval] Error fetching Super Admin recipients:', lookupErr);
    }
    // Only restrict to targetTokens if a verified Super Admin target was specified;
    // otherwise deliver to all verified Super Admins.
    const hasVerifiedTarget = Boolean((targetUid && verifiedSuperUids.has(targetUid)) ||
        (targetPhone10 && verifiedSuperPhones.has(targetPhone10)));
    return hasVerifiedTarget ? Array.from(targetTokens) : Array.from(superAdminTokens);
}
async function dispatchSuperAdminExpenseNotification(params) {
    const { db, messaging, churchId, expenseId, notifDocId, type, approvalSubTab, title, body, invoiceNumber, targetUid = '', targetPhone = '', extraFields = {}, allowTopicFallback, } = params;
    const targetPhone10 = normalizeLast10(targetPhone);
    const tokensToSend = await resolveSuperAdminRecipients(db, churchId, targetUid, targetPhone10);
    const notificationData = {
        type,
        targetRole: 'super_admin',
        screen: 'AdminRoot',
        targetTab: 'Expense',
        innerTab: 'approvals',
        approvalSubTab,
        expenseId,
        invoiceNumber,
        churchId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    if (tokensToSend.length > 0) {
        try {
            const sendRes = await messaging.sendEachForMulticast({
                notification: { title, body },
                data: notificationData,
                tokens: tokensToSend,
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
            console.log(`✅ [ExpenseApproval] Sent ${type} push to ${sendRes.successCount} Super Admin device(s) (${sendRes.failureCount} failed).`);
        }
        catch (pushErr) {
            console.error(`❌ [ExpenseApproval] Error dispatching ${type} multicast push:`, pushErr);
        }
    }
    else if (allowTopicFallback) {
        try {
            await messaging.send({
                topic: 'platform_super_admins',
                notification: { title, body },
                data: notificationData,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channelId: 'church_alerts',
                    },
                },
            });
            console.log(`✅ [ExpenseApproval] Sent ${type} topic fallback push to platform_super_admins.`);
        }
        catch (topicErr) {
            console.error(`❌ [ExpenseApproval] Error sending ${type} topic fallback:`, topicErr);
        }
    }
    try {
        await db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('notifications')
            .doc(notifDocId)
            .set({
            type,
            targetRole: 'super_admin',
            ...(targetUid ? { targetUid, targetMemberId: targetUid } : {}),
            ...(targetPhone ? { targetPhone } : {}),
            title,
            body,
            expenseId,
            invoiceNumber,
            churchId,
            ...extraFields,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    catch (dbErr) {
        console.error(`❌ [ExpenseApproval] Error writing ${type} in-app notification doc:`, dbErr);
    }
}
/**
 * 💼 EXPENSE APPROVAL NOTIFICATION TRIGGER (SUPER ADMIN ONLY)
 * Dispatches FCM push + deterministic in-app notification strictly to verified Super Admins
 * whenever a ledger expense transitions to 'Pending Approval', 'Approved', or 'Rejected'.
 */
export const onLedgerExpenseApproval = onDocumentWritten({ document: 'ledger_expenses/{expenseId}', region: 'asia-south1' }, async (event) => {
    const snapAfter = event.data?.after;
    if (!snapAfter || !snapAfter.exists)
        return;
    const after = snapAfter.data() || {};
    const before = event.data?.before?.exists ? (event.data.before.data() || {}) : null;
    const db = getFirestore();
    const messaging = getMessaging();
    const expenseId = event.params.expenseId;
    const churchId = String(after.churchId || 'rhema').trim() || 'rhema';
    const invoiceNumber = formatInvoiceNumberDisplayServer(after.invoiceNumber);
    const invLabel = invoiceNumber ? ` (${invoiceNumber})` : '';
    if (after.status === 'Pending Approval') {
        const requestKey = String(after.approvalRequestId || after.submittedAt || event.id);
        const statusChangedToPending = !before || before.status !== 'Pending Approval';
        const requestChanged = Boolean(after.approvalRequestId && before?.approvalRequestId !== after.approvalRequestId);
        if (!statusChangedToPending && !requestChanged)
            return;
        if (after.approvalPushSentForRequestId === requestKey) {
            console.log(`🛑 [ExpenseApproval] Skipping duplicate pending push for ${expenseId} (${requestKey})`);
            return;
        }
        try {
            await snapAfter.ref.update({
                approvalPushSentForRequestId: requestKey,
                approvalPushSentAt: FieldValue.serverTimestamp(),
            });
        }
        catch (_) { }
        const submittedBy = String(after.submittedBy || 'Super Admin').trim();
        const approverId = String(after.approverId || '').trim();
        const approverName = String(after.approverName || '').trim();
        const approverPhone = String(after.approverPhone || '').trim();
        const safeReqKey = requestKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        await dispatchSuperAdminExpenseNotification({
            db,
            messaging,
            churchId,
            expenseId,
            notifDocId: `expense_approval_${expenseId}_${safeReqKey}`,
            type: 'expense_approval',
            approvalSubTab: 'pending',
            title: 'New Expense Approval',
            body: approverName
                ? `${submittedBy} sent an expense${invLabel} to ${approverName} for approval.`
                : `${submittedBy} submitted an expense${invLabel} for Super Admin approval.`,
            invoiceNumber,
            targetUid: approverId,
            targetPhone: approverPhone,
            extraFields: {
                submittedBy,
                approverName,
                approvalRequestId: requestKey,
            },
            allowTopicFallback: !approverId && !approverPhone,
        });
        return;
    }
    if (after.status === 'Approved' || after.status === 'Rejected') {
        const isApproved = after.status === 'Approved';
        const decisionKey = String(after.decisionRequestId || after.approvedAt || event.id);
        const statusChanged = !before || before.status !== after.status;
        const decisionChanged = Boolean(after.decisionRequestId && before?.decisionRequestId !== after.decisionRequestId);
        if (!statusChanged && !decisionChanged)
            return;
        if (after.decisionPushSentForRequestId === decisionKey) {
            console.log(`🛑 [ExpenseApproval] Skipping duplicate decision push for ${expenseId} (${decisionKey})`);
            return;
        }
        try {
            await snapAfter.ref.update({
                decisionPushSentForRequestId: decisionKey,
                decisionPushSentAt: FieldValue.serverTimestamp(),
            });
        }
        catch (_) { }
        const actorName = String(after.approvedBy || 'Super Admin').trim();
        const remarks = String(after.approvalRemarks || '').trim();
        const firstCategory = Array.isArray(after.items) && after.items[0]?.category ? String(after.items[0].category) : '';
        const expenseLabel = String(after.eventName || firstCategory || 'Expense').trim();
        const recipientUid = String(after.submittedByUid || '').trim();
        const safeDecisionKey = decisionKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        await dispatchSuperAdminExpenseNotification({
            db,
            messaging,
            churchId,
            expenseId,
            notifDocId: `expense_decision_${expenseId}_${safeDecisionKey}`,
            type: isApproved ? 'expense_approved' : 'expense_rejected',
            approvalSubTab: isApproved ? 'approved' : 'rejected',
            title: isApproved ? `Expense Approved${invLabel}` : `Expense Rejected${invLabel}`,
            body: isApproved
                ? `${expenseLabel}${invLabel} was approved by ${actorName}.`
                : `${expenseLabel}${invLabel} was rejected by ${actorName}${remarks ? `. Reason: ${remarks}` : '.'}`,
            invoiceNumber,
            targetUid: recipientUid,
            extraFields: {
                approvedBy: actorName,
                approvalRemarks: remarks,
                decisionRequestId: decisionKey,
            },
            allowTopicFallback: !recipientUid,
        });
    }
});
//# sourceMappingURL=notifications.js.map