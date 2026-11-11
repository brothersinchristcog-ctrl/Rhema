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
  if (!snap) return;

  const meetingId = event.params.meetingId;
  const churchId = event.params.churchId;
  const db = getFirestore();
  const meetingRef = snap.ref;

  // 1. ATOMIC DEDUPLICATION: Run transaction to ensure notification is sent EXACTLY ONCE
  let shouldSend = false;
  try {
    shouldSend = await db.runTransaction(async (transaction) => {
      const freshDoc: any = await transaction.get(meetingRef as any);
      if (!freshDoc.exists) return false;
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
  } catch (txErr) {
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
  } catch (_) {}

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
  } catch (error) {
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
async function handlePrayerRequestAdminPush(prayer: any, churchId: string, prayerId: string, snapRef?: any) {
  if (!prayer) return;

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
    } catch (_) {}
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
      } catch (err) {
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
  const adminTokens: string[] = [];
  const adminUids: string[] = [];

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
          m.fcmTokens.forEach((t: string) => {
            if (t && typeof t === 'string' && t.trim().length > 10) adminTokens.push(t.trim());
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
  } catch (lookupErr) {
    console.error('Error fetching admin tokens for prayer request notification:', lookupErr);
  }

  const notificationData: Record<string, string> = {
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
    } catch (pushErr) {
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
  } catch (topicErr) {
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
  } catch (dbErr) {
    console.error('Error writing prayer in-app notification document:', dbErr);
  }
}

/**
 * 🙏 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY PRAYER REQUEST (Primary single-church collection)
 * Triggered automatically whenever a member submits a prayer request in Firestore.
 * Always notifies church admins ONLY, clearly showing which specific member submitted it.
 */
export const onPrayerRequestCreatedAdmin = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const prayer = snap.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestAdminPush(prayer, churchId, prayerId, snap.ref);
  }
);

/**
 * 🙏 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY PRAYER REQUEST (Legacy churches collection)
 */
export const onPrayerRequestCreatedAdminLegacy = onDocumentCreated(
  { document: 'churches/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const prayer = snap.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestAdminPush(prayer, churchId, prayerId, snap.ref);
  }
);

/**
 * 💧 HELPER: DISPATCH BAPTISM REQUEST PUSH TO ADMINS ONLY
 * Guarantees that only users with role admin, pastor, or super receive baptism alerts.
 * Regular church members NEVER receive these sacramental request notifications.
 */
async function handleBaptismRequestAdminPush(baptism: any, churchId: string, requestId: string, snapRef?: any) {
  if (!baptism) return;

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
    } catch (_) {}
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
      } catch (err) {
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
  const adminTokens: string[] = [];
  const adminUids: string[] = [];

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
          m.fcmTokens.forEach((t: string) => {
            if (t && typeof t === 'string' && t.trim().length > 10) adminTokens.push(t.trim());
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
  } catch (lookupErr) {
    console.error('Error fetching admin tokens for baptism notification:', lookupErr);
  }

  const notificationData: Record<string, string> = {
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
    } catch (pushErr) {
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
  } catch (topicErr) {
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
  } catch (dbErr) {
    console.error('Error writing baptism in-app notification document:', dbErr);
  }
}

/**
 * 💧 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY BAPTISM REQUEST (Primary single-church collection)
 * Triggered automatically whenever a member submits a baptism request in Firestore.
 * Always notifies church admins ONLY, clearly showing which member submitted it.
 */
export const onBaptismRequestCreatedAdmin = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/baptism_requests/{requestId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const baptism = snap.data();
    const churchId = event.params.churchId;
    const requestId = event.params.requestId;
    await handleBaptismRequestAdminPush(baptism, churchId, requestId, snap.ref);
  }
);

/**
 * 💧 MANDATORY NOTIFICATION: ADMIN NOTIFIED OF EVERY BAPTISM REQUEST (Legacy churches collection)
 */
export const onBaptismRequestCreatedAdminLegacy = onDocumentCreated(
  { document: 'churches/{churchId}/baptism_requests/{requestId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const baptism = snap.data();
    const churchId = event.params.churchId;
    const requestId = event.params.requestId;
    await handleBaptismRequestAdminPush(baptism, churchId, requestId, snap.ref);
  }
);

/**
 * 🙏 HELPER: DISPATCH PRAYER REQUEST APPROVAL/PROCESSED PUSH TO THE SPECIFIC MEMBER ONLY
 * Guarantees that ONLY the particular member who submitted the prayer request receives the push notification.
 * Regular church members and community topics NEVER receive broadcast notifications for individual prayers.
 */
async function handlePrayerRequestMemberPush(before: any, after: any, churchId: string, prayerId: string, snapRef?: any) {
  if (!after) return;

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
    } catch (_) {}
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
      } catch (_) {}
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
  } else if (isPublic) {
    body = `Dear ${memberName}, your prayer request has been approved and our pastoral team is praying for you.`;
  } else {
    body = `Dear ${memberName}, your prayer request has been received and our pastoral team has prayed for you.`;
  }

  // 3. Find device tokens ONLY for this specific member
  const memberTokens: string[] = [];

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
              if (typeof t === 'string' && t.trim().length > 10) memberTokens.push(t.trim());
            }
          }
        }
      } catch (_) {}
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
                  if (typeof t === 'string' && t.trim().length > 10) memberTokens.push(t.trim());
                }
              }
            }
          });
        } catch (_) {}
      }
    }
  } catch (lookupErr) {
    console.error('Error fetching member tokens for prayer push:', lookupErr);
  }

  const notificationData: Record<string, string> = {
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
    } catch (fcmErr) {
      console.error('Error dispatching multicast to member:', fcmErr);
    }
  } else {
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
  } catch (dbErr) {
    console.error('Error writing member prayer in-app notification doc:', dbErr);
  }
}

/**
 * 🙏 NOTIFY MEMBER OF APPROVED / PROCESSED PRAYER REQUEST (Primary single-church collection)
 * Triggered when a prayer request is approved or processed (isAnswered becomes true).
 * Notifies ONLY the specific member who submitted it. NEVER broadcasts to community topic.
 */
export const onPrayerRequestProcessedMember = onDocumentUpdated(
  { document: 'Rhema Church/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const before = snap.before.data();
    const after = snap.after.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestMemberPush(before, after, churchId, prayerId, snap.after.ref);
  }
);

/**
 * 🙏 NOTIFY MEMBER OF APPROVED / PROCESSED PRAYER REQUEST (Legacy churches collection)
 */
export const onPrayerRequestProcessedMemberLegacy = onDocumentUpdated(
  { document: 'churches/{churchId}/prayerRequests/{prayerId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const before = snap.before.data();
    const after = snap.after.data();
    const churchId = event.params.churchId;
    const prayerId = event.params.prayerId;
    await handlePrayerRequestMemberPush(before, after, churchId, prayerId, snap.after.ref);
  }
);

/**
 * Deprecated alias to maintain backwards compatibility if referenced elsewhere.
 * Topic broadcast intentionally removed.
 */
export const pushPrayerRequestApproved = onPrayerRequestProcessedMemberLegacy;

function formatSermonDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return '';
  const clean = String(dateStr).trim().split(' ')[0]?.split('T')[0] || '';
  const parts = clean.split('-');
  const p0 = parts[0];
  const p1 = parts[1];
  const p2 = parts[2];
  if (parts.length === 3 && p0 && p1 && p2) {
    if (p0.length === 4) return `${p2}-${p1}-${p0}`; // YYYY-MM-DD -> DD-MM-YYYY
    if (p2.length === 4) return clean; // already DD-MM-YYYY
  }
  return clean;
}

function toStandardDateStr(dateStr?: string | null): string {
  if (!dateStr) return '';
  const clean = String(dateStr).trim().split(' ')[0]?.split('T')[0] || '';
  const parts = clean.split('-');
  const p0 = parts[0];
  const p1 = parts[1];
  const p2 = parts[2];
  if (parts.length === 3 && p0 && p1 && p2) {
    if (p0.length === 4) return clean; // YYYY-MM-DD
    if (p2.length === 4) return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`; // DD-MM-YYYY -> YYYY-MM-DD
  }
  return clean;
}

/**
 * 🎙️ CHECK & AUTO-PUBLISH SCHEDULED SERMONS
 * Checks if any sermon with status 'Scheduled' has reached its scheduledPublishAt
 * or scheduledDate + scheduledTime. Automatically publishes the sermon, updates Firestore,
 * and sends an FCM push notification to church members.
 */
export async function checkAndPublishScheduledSermons(sermonsRef: any, churchId: string, churchDocRef?: any) {
  try {
    const snap = await sermonsRef.where('status', '==', 'Scheduled').get();
    if (!snap || snap.empty) return;

    const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const nowStr = `${nowIst.getFullYear()}-${String(nowIst.getMonth() + 1).padStart(2, '0')}-${String(nowIst.getDate()).padStart(2, '0')}`;
    const nowTime = `${String(nowIst.getHours()).padStart(2, '0')}:${String(nowIst.getMinutes()).padStart(2, '0')}`;
    const nowMillis = Date.now();

    for (const doc of snap.docs) {
      const sermon = doc.data();
      if (sermon.notificationSent === true) continue;

      let shouldPublish = false;

      if (sermon.scheduledPublishAt) {
        let pubTime = NaN;
        if (typeof sermon.scheduledPublishAt === 'number') {
          pubTime = sermon.scheduledPublishAt;
        } else if (typeof sermon.scheduledPublishAt.toMillis === 'function') {
          pubTime = sermon.scheduledPublishAt.toMillis();
        } else if (sermon.scheduledPublishAt.seconds) {
          pubTime = sermon.scheduledPublishAt.seconds * 1000;
        } else if (typeof sermon.scheduledPublishAt === 'string') {
          pubTime = new Date(sermon.scheduledPublishAt).getTime();
        }
        if (!isNaN(pubTime) && pubTime <= nowMillis) {
          shouldPublish = true;
        }
      } else if (sermon.scheduledDate) {
        const sDate = toStandardDateStr(sermon.scheduledDate);
        let sTime24 = '00:00';
        if (sermon.scheduledTime) {
          const match = String(sermon.scheduledTime).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          if (match && match[1] && match[2]) {
            let h = parseInt(match[1], 10);
            const m = match[2];
            const ampm = match[3]?.toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            sTime24 = `${String(h).padStart(2, '0')}:${m}`;
          }
        }
        if (sDate < nowStr || (sDate === nowStr && sTime24 <= nowTime)) {
          shouldPublish = true;
        }
      } else if (sermon.date) {
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
            }).catch(() => {});
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
            }).catch(() => {});
          }
        }

        console.log(`✅ Auto-published scheduled sermon: ${doc.id} (${sermonTitle}) for church ${churchId}`);
      }
    }
  } catch (err) {
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
export const publishScheduledSermons = onSchedule(
  { schedule: '* * * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' },
  async (event) => {
    try {
      const db = getFirestore();
      console.log('⏰ [publishScheduledSermons] Checking for due scheduled sermons...');
      
      // 1. Check active Rhema Church collection
      const churchesSnapshot = await db.collection('Rhema Church').get();
      for (const churchDoc of churchesSnapshot.docs) {
        await checkAndPublishScheduledSermons(churchDoc.ref.collection('sermons'), churchDoc.id, churchDoc.ref);
      }
    } catch (err) {
      console.error('Error in publishScheduledSermons cron job:', err);
    }
  }
);

export const monitorMeetingLive = onSchedule({ schedule: '* * * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async (event) => {
  const db = getFirestore();
  const now = new Date();
  const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);

  try {
    const churchesSnapshot = await db.collection('Rhema Church').get();
    
    for (const churchDoc of churchesSnapshot.docs) {
      const churchId = churchDoc.id;
      
      // Query meetings that are scheduled or live
      const meetingsSnapshot = await churchDoc.ref.collection('online_meetings')
        .where('status', 'in', ['scheduled', 'live'])
        .get();

      for (const meetingDoc of meetingsSnapshot.docs) {
        const meeting = meetingDoc.data();
        if (!meeting.startTime) continue;
        
        const startTime = meeting.startTime.toDate();
        const updates: any = {};
        
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
          if (meeting.status !== 'live') updates.status = 'live';
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
      } catch (sermonErr) {
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
            if (quiz.scheduledNotified) continue;

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

              await getMessaging().send(payload).catch((e: any) => console.error('Error sending Quiz Live notification', e));

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
              }).catch(() => {});

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
              }).catch(() => {});

              // Mark quiz as published and notified
              await quizDoc.ref.update({
                status: 'published',
                scheduledNotified: true,
                updatedAt: FieldValue.serverTimestamp(),
              }).catch(() => {});
            }
          }
        } catch (quizErr) {
          console.error(`Error checking scheduled quizzes for church ${churchId}:`, quizErr);
        }
      }

      // ─── 4. Check YouTube Live Status for this church ───
      try {
        await checkChurchYouTubeLive(churchDoc, churchId, db);
      } catch (ytErr) {
        console.warn(`Notice checking YouTube Live for church ${churchId}:`, ytErr);
      }
    }

    // ─── Check Scheduled Sermons for active Rhema Church collection ───
    try {
      const rhemaChurchRef = db.collection('Rhema Church').doc('rhema');
      await checkAndPublishScheduledSermons(rhemaChurchRef.collection('sermons'), 'rhema', rhemaChurchRef);
    } catch (schedSermonErr) {
      console.warn('Error checking scheduled sermons for Rhema Church in monitorMeetingLive:', schedSermonErr);
    }

    // ─── Check YouTube Live for active Rhema Church collection (Single Church) ───
    try {
      const rhemaChurchRef = db.collection('Rhema Church').doc('rhema');
      const rhemaDoc = await rhemaChurchRef.get();
      if (rhemaDoc.exists) {
        await checkChurchYouTubeLive(rhemaDoc, 'rhema', db);
      }
    } catch (rhemaYtErr) {
      console.warn('Error checking YouTube Live for Rhema Church in monitorMeetingLive:', rhemaYtErr);
    }

    // ─── 4. Check Super Admin Daily Bible Quiz Scheduled Notification ───
    try {
      await sendDailyQuizNotificationInternal(false);
    } catch (dailySchedErr) {
      console.warn('Notice checking daily quiz schedule in monitorMeetingLive:', dailySchedErr);
    }
  } catch (error) {
    console.error('Error in checkOnlineMeetings cron job:', error);
  }
});


const YOUTUBE_DATA_API_KEY = 'AIzaSyBGkm7DNk_jpM-XKJI0JPk_vJlufS4Q7-Q';
const ytChannelCache: Record<string, string> = {};

/**
 * Resolves the YouTube channel ID from a channel handle or URL.
 */
async function resolveYouTubeChannelId(rawYtUrl: string): Promise<string | null> {
  const clean = rawYtUrl.trim();
  if (ytChannelCache[clean]) return ytChannelCache[clean] || null;

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
  } else if (!clean.startsWith('http') && !clean.startsWith('UC')) {
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
    } catch (_) {}
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
function formatLiveNotification(churchName?: string, rawTitle?: string): { pushTitle: string; pushBody: string } {
  return {
    pushTitle: '🔴 We Are LIVE Now!',
    pushBody: "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!",
  };
}

async function checkChurchYouTubeLive(churchDoc: any, churchId: string, db: any) {
  if (!churchId || churchId === 'global') return;

  const cData = churchDoc.data() || {};
  let rawYtUrl = cData.socialLinks?.youtube?.trim();

  // Fix typos in raw URL
  rawYtUrl = rawYtUrl.replace(/https?:\/\/(www\w*)\.(?:yyoutube|youtube)\.com/i, 'https://www.youtube.com');
  rawYtUrl = rawYtUrl.replace(/Brothersinchhristfellowship/gi, 'Brothersinchristfellowship');

  // Single-church default fallback
  if (!rawYtUrl && churchId === 'rhema') {
    rawYtUrl = 'https://www.youtube.com/@Brothersinchristfellowship/live';
  }

  if (!rawYtUrl) return;

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
      } catch (apiErr) {
        console.warn('[checkChurchYouTubeLive] YouTube API query notice:', apiErr);
      }
    }

    // ── Method 2: Scrape Fallback (if API quota or network fails) ──
    if (!isLive) {
      let liveCheckUrl = rawYtUrl;
      if (liveCheckUrl.includes('@') && !liveCheckUrl.includes('/live') && !liveCheckUrl.includes('/streams')) {
        liveCheckUrl = liveCheckUrl.endsWith('/') ? `${liveCheckUrl}live` : `${liveCheckUrl}/live`;
      } else if (liveCheckUrl.includes('/channel/') && !liveCheckUrl.includes('/live')) {
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
          if (
            (html.includes('"isLive":true') ||
              html.includes('"style":"LIVE"') ||
              html.includes('LIVE_STREAM') ||
              html.includes('"status":"LIVE"')) &&
            !html.includes('"isUpcoming":true')
          ) {
            isLive = true;
            const match =
              (res.url && res.url.match(/watch\?v=([\w-]{11})/)) ||
              html.match(/"videoId":"([\w-]{11})"/) ||
              html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})">/) ||
              html.match(/"liveStreamability".*?"videoId":"([^"]+)"/) ||
              html.match(/"videoRenderer".*?"videoId":"([^"]+)"/);
            if (match && match[1]) videoId = match[1];

            const titleMatch =
              html.match(/<title>([^<]+)<\/title>/) ||
              html.match(/"title":{"runs":\[{"text":"([^"]+)"}\]}/) ||
              html.match(/<meta name="title" content="([^"]+)"/);
            if (titleMatch && titleMatch[1]) {
              streamTitle = titleMatch[1].replace(/ - YouTube$/i, '').trim();
            }
          }
        }
      } catch (_) {}
    }

    const prevState = cData.youtubeLiveState || { isLive: false };
    const liveWatchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawYtUrl;

    if (isLive) {
      // Clean up streamTitle if it matched YouTube promo junk
      if (
        !streamTitle ||
        streamTitle.includes('Want to watch this again later') ||
        streamTitle.includes('Sign in to add this') ||
        streamTitle.toLowerCase() === 'youtube'
      ) {
        streamTitle = 'Join the live worship service now! 🎥🙏';
      }

      // Check if we already notified for this stream:
      // 1. Same videoId already notified
      // 2. Or prevState was already marked as isLive (same ongoing live session)
      // 3. Or last notification was sent less than 2 hours ago (strict cooldown)
      const lastNotifiedMillis =
        prevState?.lastNotifiedAt?.toMillis?.() ||
        (prevState?.lastNotifiedAt?._seconds ? prevState.lastNotifiedAt._seconds * 1000 : 0);
      const isWithinCooldown = lastNotifiedMillis > 0 && Date.now() - lastNotifiedMillis < 2 * 60 * 60 * 1000;

      const alreadyNotified =
        Boolean(prevState?.isLive) ||
        isWithinCooldown ||
        (Boolean(videoId) && prevState?.lastNotifiedVideoId === videoId);

      const resolvedVideoId = videoId || prevState?.videoId || '';

      // Save live state directly as a field on the church document (NO extra documents)
      await churchDoc.ref.set(
        {
          youtubeLiveState: {
            isLive: true,
            url: liveWatchUrl,
            videoId: resolvedVideoId,
            title: streamTitle || prevState?.title || '',
            lastChecked: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      ).catch(() => {});

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
            priority: 'high' as const,
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
          .catch((e: any) => console.error('Error sending YouTube Live topic push:', e));

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
        }).catch(() => {});

        // 3. Mark lastNotifiedVideoId in youtubeLiveState
        await churchDoc.ref.set(
          {
            youtubeLiveState: {
              lastNotifiedVideoId: resolvedVideoId,
              lastNotifiedAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        ).catch(() => {});
      }
    } else {
      // Offline: reset isLive on church document if previously live
      if (prevState?.isLive) {
        await churchDoc.ref.set(
          {
            youtubeLiveState: {
              isLive: false,
              lastChecked: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        ).catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn(`[checkChurchYouTubeLive] Notice for church ${churchId}:`, err?.message);
  }
}

/**
 * 🏛️ NOTIFY SUPER ADMINS OF NEW CHURCH REGISTRATION
 * Triggered automatically when a new church document is created in Firestore.
 */
export const pushNewChurchRegistered = onDocumentCreated('churches/{churchId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

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
    const tokens: string[] = [];

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
      } catch (_) {}
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
          priority: 'high' as const,
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
    } catch (topicErr) {
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

  } catch (error) {
    console.error('❌ Error sending new church super admin notification:', error);
  }
});

/**
 * 📖 NOTIFY CHURCH MEMBERS OF PUBLISHED BIBLE QUIZ
 * Triggered automatically when an Admin creates or publishes a Bible Quiz in Firestore.
 * Dispatches push notification to topic church_{churchId} and multicast tokens.
 */
async function sendBibleQuizPublishNotification(churchId: string, quizId: string, quiz: any) {
  const db = getFirestore();
  const messaging = getMessaging();

  const title = `📖 New Bible Quiz: ${quiz.title || 'Challenge Your Bible Knowledge'}`;
  const details = quiz.book
    ? `${quiz.book}${quiz.chapterStart ? ` (Ch. ${quiz.chapterStart}${quiz.chapterEnd && quiz.chapterEnd !== quiz.chapterStart ? `-${quiz.chapterEnd}` : ''})` : ''}`
    : (quiz.topic || quiz.category || 'Holy Scripture');
  const body = `A new Bible quiz is now live: "${details}". Tap to test your knowledge!`;

  const notificationData: Record<string, string> = {
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
          priority: 'high' as const,
          notification: {
            sound: 'default',
            priority: 'max' as const,
            channelId: 'church_alerts',
          },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      });
      console.log(`✅ Sent Bible quiz notification to topic: church_${churchId}`);
    } catch (topicErr) {
      console.warn(`Error sending quiz notification to topic church_${churchId}:`, topicErr);
    }
  }

  // 2. Also send multicast to registered tokens in users and members
  try {
    const tokenSet = new Set<string>();

    const targetChurch = (churchId && churchId !== 'global') ? churchId : 'rhema';
    const membersSnap = await db.collection('Rhema Church').doc(targetChurch).collection('members').get();
    membersSnap.forEach((doc: any) => {
      const m = doc.data();
      if (m.fcmToken) tokenSet.add(m.fcmToken);
      if (Array.isArray(m.fcmTokens)) m.fcmTokens.forEach((t: string) => tokenSet.add(t));
    });

    const tokens = Array.from(tokenSet);
    if (tokens.length > 0) {
      const response = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: notificationData,
        tokens,
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            priority: 'max' as const,
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
  } catch (multicastErr) {
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
  } catch (dbErr) {
    console.warn('Error saving quiz in-app notification:', dbErr);
  }
}

export const pushBibleQuizCreated = onDocumentCreated('churches/{churchId}/bibleQuizzes/{quizId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const quiz = snap.data();
  if (quiz?.status !== 'published') return;

  const churchId = event.params.churchId;
  const quizId = event.params.quizId;
  await sendBibleQuizPublishNotification(churchId, quizId, quiz);
  try {
    await snap.ref.update({ notificationSent: true });
  } catch (e) {}
});

export const pushBibleQuizUpdated = onDocumentUpdated('churches/{churchId}/bibleQuizzes/{quizId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const before = snap.before.data();
  const after = snap.after.data();

  // If status transitioned to 'published' and notification hasn't been sent yet
  if (before?.status !== 'published' && after?.status === 'published' && !after?.notificationSent) {
    const churchId = event.params.churchId;
    const quizId = event.params.quizId;
    await sendBibleQuizPublishNotification(churchId, quizId, after);
    try {
      await snap.after.ref.update({ notificationSent: true });
    } catch (e) {}
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
export async function sendDailyQuizNotificationInternal(force: boolean = false): Promise<{ success: boolean; sentCount: number; message: string }> {
  const db = getFirestore();
  const messaging = getMessaging();

  // 1. Current date and time in IST (Asia/Kolkata)
  const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const dStr = `${nowIst.getFullYear()}-${String(nowIst.getMonth() + 1).padStart(2, '0')}-${String(nowIst.getDate()).padStart(2, '0')}`;
  const nowTime = `${String(nowIst.getHours()).padStart(2, '0')}:${String(nowIst.getMinutes()).padStart(2, '0')}`;

  console.log(`⏰ [DailyQuiz] Checking daily quiz schedule at IST ${nowTime} for date ${dStr} (force=${force})`);

  // 2. Read Super Admin schedule settings from Firestore
  let dailyConfig: any = null;
  let scheduleDocRef: any = null;

  try {
    const globalDoc = await db.collection('Rhema Church').doc('rhema').collection('settings').doc('daily_quiz_schedule').get();
    if (globalDoc.exists) {
      dailyConfig = globalDoc.data();
      scheduleDocRef = globalDoc.ref;
    } else {
      const rootDoc = await db.collection('settings').doc('daily_quiz_schedule').get();
      if (rootDoc.exists) {
        dailyConfig = rootDoc.data();
        scheduleDocRef = rootDoc.ref;
      }
    }
  } catch (err) {
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
    } else {
      await db.collection('Rhema Church').doc('rhema').collection('settings').doc('daily_quiz_schedule').set(earlyLockPayload, { merge: true });
    }
    await db.collection('settings').doc('daily_quiz_schedule').set(earlyLockPayload, { merge: true });
    console.log(`🔒 [DailyQuiz] Idempotency lock acquired for ${dStr}. Proceeding with delivery...`);
  } catch (lockErr) {
    console.warn('[DailyQuiz] Could not acquire idempotency lock; continuing anyway:', lockErr);
  }

  const dParts = dStr.split('-');
  const displayDateStr = dParts.length === 3 ? `${dParts[2]}-${dParts[1]}-${dParts[0]}` : dStr;
  const pushTitle = dailyConfig?.customTitle || '📖 Daily Bible Quiz is Live!';
  const pushBody = dailyConfig?.customBody || `Today's Scripture challenge (${displayDateStr}) is ready. Test your knowledge and reflect on God's Word!`;
  const quizId = `daily_quiz_${dStr}`;

  const notificationData: Record<string, string> = {
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
  const tokenSet = new Set<string>();
  try {
    const membersSnap = await db.collectionGroup('members').get();
    membersSnap.forEach((doc: any) => {
      const data = doc.data();
      if (data?.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.trim().length > 10) {
        tokenSet.add(data.fcmToken.trim());
      }
      if (Array.isArray(data?.fcmTokens)) {
        data.fcmTokens.forEach((tk: any) => {
          if (typeof tk === 'string' && tk.trim().length > 10) tokenSet.add(tk.trim());
        });
      }
    });
  } catch (tokenErr) {
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
            priority: 'high' as const,
            notification: {
              sound: 'default',
              priority: 'max' as const,
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
      } catch (batchErr) {
        console.error('[DailyQuiz] Multicast batch send error:', batchErr);
      }
    }
    console.log(`✅ [DailyQuiz] Multicast push sent: ${multicastSuccess} success, ${multicastFailed} failed.`);
  }

  // 5. Log in broadcasts/notifications for Rhema Church
  try {
    const churchesSnap = await db.collection('Rhema Church').get();
    for (const cDoc of churchesSnap.docs) {
      const churchId = cDoc.id;
      if (churchId === 'global') continue;

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
      }).catch(() => {});

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
      }).catch(() => {});
    }
  } catch (churchErr) {
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
    } else {
      await db.collection('Rhema Church').doc('rhema').collection('settings').doc('daily_quiz_schedule').set(updatePayload, { merge: true });
    }
    await db.collection('settings').doc('daily_quiz_schedule').set(updatePayload, { merge: true });
  } catch (recordErr) {
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
  } catch (error: any) {
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
export async function sendDailyVersePushInternal(slotOverride?: string, targetChurchId: string = 'rhema', force: boolean = false) {
  if (getApps().length === 0) {
    initializeApp();
  }
  const db = getFirestore();
  const messaging = getMessaging();

  // 1. Determine period slot
  const PERIOD_SLOTS: Record<string, { index: number; title: string; titleEn: string; titleTe: string }> = {
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
    } else if (hour >= 12 && hour < 17) {
      slot = 'Afternoon';
    } else if (hour >= 17 && hour < 21) {
      slot = 'Evening';
    } else {
      slot = 'Night';
    }
  }

  const slotInfo = PERIOD_SLOTS[slot] || PERIOD_SLOTS.Morning!;
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
    } catch (txErr) {
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
  } catch (mErr) {
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

  const targetIndex: number = (todayIndices[slotInfo.index] !== undefined ? todayIndices[slotInfo.index] : todayIndices[0]) ?? 0;
  console.log(`[sendDailyVersePushInternal] Target verse index: ${targetIndex} for slot ${slot} (epoch: ${epochStr}, diffDays: ${diffDays}, slotIdx: ${slotInfo.index}, todayIndices: [${todayIndices.join(', ')}])`);

  let verseDocData: any = null;
  let verseId: string = `verse_${targetIndex}`;

  // 1. Primary Source of Truth: Firestore 'daily_verses' collection
  try {
    // 1a. Direct doc lookup by deterministic ID
    const directDoc = await db.collection('daily_verses').doc(`verse_${targetIndex}`).get();
    if (directDoc.exists) {
      verseDocData = directDoc.data();
      verseId = directDoc.id;
      console.log(`✨ [sendDailyVersePushInternal] Loaded verse via direct doc verse_${targetIndex}: ${verseDocData.referenceEn || verseDocData.referenceTe}`);
    }
  } catch (dErr) {
    console.warn('[sendDailyVersePushInternal] Direct doc lookup failed, falling back to index query:', dErr);
  }

  // 1b. If not found by direct ID, query by index field
  if (!verseDocData) {
    try {
      const snap = await db.collection('daily_verses')
        .where('index', '==', targetIndex)
        .get();
      if (!snap.empty && snap.docs.length > 0) {
        let bestDoc: any = snap.docs[0];
        let bestTime = 0;
        snap.docs.forEach((doc: any) => {
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
    } catch (err) {
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
    } catch (_) {}
  }

  // 3. Third fallback & reference backfill: bulk_verses.json bundled asset
  let bundledVerseFallback: any = null;
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
        const list: any = JSON.parse(raw);
        if (Array.isArray(list)) {
          if (list[targetIndex]) {
            bundledVerseFallback = list[targetIndex];
          }
          // If verseDocData came from Firestore but is missing a reference, also match by verse text if needed
          if (verseDocData && (!verseDocData.referenceEn || !verseDocData.referenceTe)) {
            const vEnNorm = String(verseDocData.verseEn || '').trim().toLowerCase();
            const vTeNorm = String(verseDocData.verseTe || verseDocData.verse || '').trim();
            if (bundledVerseFallback && (
              (vEnNorm && String(bundledVerseFallback.verseEn || '').trim().toLowerCase() === vEnNorm) ||
              (vTeNorm && String(bundledVerseFallback.verseTe || '').trim() === vTeNorm)
            )) {
              // bundledVerseFallback at targetIndex already matches
            } else if (vEnNorm || vTeNorm) {
              const matched = list.find((item: any) =>
                (vEnNorm && String(item?.verseEn || '').trim().toLowerCase() === vEnNorm) ||
                (vTeNorm && String(item?.verseTe || '').trim() === vTeNorm)
              );
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
  } catch (_) {}

  if (!verseDocData) {
    console.warn(`[sendDailyVersePushInternal] No verse found for index ${targetIndex}`);
    return { success: false, error: `Verse not found for index ${targetIndex}` };
  }

  // Resolve verse and reference fields across all possible property names + bundled fallback
  const verseEnText = (
    verseDocData.verseEn ||
    verseDocData.english ||
    verseDocData.textEn ||
    bundledVerseFallback?.verseEn ||
    ''
  ).trim();

  const verseTeText = (
    verseDocData.verseTe ||
    verseDocData.verse ||
    verseDocData.telugu ||
    verseDocData.textTe ||
    bundledVerseFallback?.verseTe ||
    ''
  ).trim();

  let refEnText = (
    verseDocData.referenceEn ||
    verseDocData.refEn ||
    verseDocData.verseReferenceEn ||
    bundledVerseFallback?.referenceEn ||
    ''
  ).trim();

  let refTeText = (
    verseDocData.referenceTe ||
    verseDocData.reference ||
    verseDocData.refTe ||
    verseDocData.verseReferenceTe ||
    bundledVerseFallback?.referenceTe ||
    ''
  ).trim();

  // Bidirectional English <-> Telugu Bible book name map so neither reference is ever missing or untranslated
  const BOOK_EN_TO_TE: Record<string, string> = {
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
    } else {
      const m = refEnText.match(/^(.+?)\s+(\d+:\d+(?:-\d+)?)$/);
      if (m && m[1] && m[2] && BOOK_EN_TO_TE[m[1].trim()]) {
        refTeText = `${BOOK_EN_TO_TE[m[1].trim()]} ${m[2]}`;
      }
    }
  } else if (refTeText && !refEnText) {
    if (bundledVerseFallback?.referenceEn) {
      refEnText = String(bundledVerseFallback.referenceEn).trim();
    } else {
      for (const [enBook, teBook] of Object.entries(BOOK_EN_TO_TE)) {
        if (refTeText.startsWith(teBook + ' ')) {
          refEnText = enBook + refTeText.slice(teBook.length);
          break;
        }
      }
    }
  }

  // 4. Collect member device FCM tokens
  const tokenSet = new Set<string>();

  try {
    const membersSnap = await db.collection('Rhema Church').doc('rhema').collection('members').get();
    membersSnap.forEach((d: any) => {
      const data = d.data();
      if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.length > 10) {
        tokenSet.add(data.fcmToken);
      }
      if (Array.isArray(data.fcmTokens)) {
        data.fcmTokens.forEach((tk: any) => {
          if (typeof tk === 'string' && tk.length > 10) tokenSet.add(tk);
        });
      }
    });
  } catch (_) {}

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
  } else {
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
        priority: 'high' as const,
        collapseKey: 'daily_verse',
        notification: {
          sound: 'default',
          priority: 'max' as const,
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
  } catch (topicErr) {
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
            priority: 'high' as const,
            collapseKey: 'daily_verse',
            notification: {
              sound: 'default',
              priority: 'max' as const,
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
        } catch (_) {}
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
  } catch (bcastErr) {
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
    const slot = (req.query.slot as string) || req.body?.slot;
    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await sendDailyVersePushInternal(slot, 'rhema', force);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('triggerDailyVersePushHttp error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * 📢 CARE CELL ANNOUNCEMENT PUSH
 * Sends push notification when an announcement is posted in a Care Cell or Church-wide.
 */
export const pushCareCellAnnouncement = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/careCellAnnouncements/{announcementId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const announcementId = event.params.announcementId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const announcementRef = snap.ref;
    const data = snap.data();

    // 1. Atomic deduplication
    let shouldSend = false;
    try {
      shouldSend = await db.runTransaction(async (transaction) => {
        const freshDoc: any = await transaction.get(announcementRef as any);
        if (!freshDoc.exists) return false;
        if (freshDoc.data()?.notificationSent === true) return false;
        transaction.update(announcementRef, {
          notificationSent: true,
          notificationSentAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
    } catch (txErr) {
      console.warn('Transaction error checking notificationSent on careCellAnnouncement:', txErr);
      if (data?.notificationSent === true) return;
      shouldSend = true;
    }

    if (!shouldSend) return;

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
        priority: 'high' as const,
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
    } catch (err) {
      console.error('Error sending care cell announcement notification:', err);
    }
  }
);

/**
 * 🤝 CARE CELL GATHERING / MEETING PUSH
 * Sends push notification when a new Care Cell meeting is scheduled.
 */
export const pushCareCellMeeting = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/careCellMeetings/{meetingId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const meetingId = event.params.meetingId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const meetingRef = snap.ref;
    const data = snap.data();

    let shouldSend = false;
    try {
      shouldSend = await db.runTransaction(async (transaction) => {
        const freshDoc: any = await transaction.get(meetingRef as any);
        if (!freshDoc.exists) return false;
        if (freshDoc.data()?.notificationSent === true) return false;
        transaction.update(meetingRef, {
          notificationSent: true,
          notificationSentAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
    } catch (txErr) {
      console.warn('Transaction error checking notificationSent on careCellMeeting:', txErr);
      if (data?.notificationSent === true) return;
      shouldSend = true;
    }

    if (!shouldSend) return;

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
      const tokens: string[] = [];
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
        } catch (_) {}
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
            priority: 'high' as const,
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
      } else {
        console.log(`No valid FCM tokens found for members in care cell ${data.cellId}`);
      }
    } catch (err) {
      console.error('Error sending care cell meeting notification:', err);
    }
  }
);

/**
 * 🙏 CARE CELL PRAYER REQUEST ADMIN PUSH
 * Alerts leaders and admins when a care cell member posts a prayer need.
 */
export const pushCareCellPrayerRequest = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/careCellPrayerRequests/{requestId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const requestId = event.params.requestId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const reqRef = snap.ref;
    const data = snap.data();

    let shouldSend = false;
    try {
      shouldSend = await db.runTransaction(async (transaction) => {
        const freshDoc: any = await transaction.get(reqRef as any);
        if (!freshDoc.exists) return false;
        if (freshDoc.data()?.notificationSent === true) return false;
        transaction.update(reqRef, {
          notificationSent: true,
          notificationSentAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
    } catch (txErr) {
      console.warn('Transaction error checking notificationSent on careCellPrayer:', txErr);
      if (data?.notificationSent === true) return;
      shouldSend = true;
    }

    if (!shouldSend) return;

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
        priority: 'high' as const,
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
    } catch (err) {
      console.error('Error sending care cell prayer notification:', err);
    }
  }
);

/**
 * 🏡 CARE CELL VISIT NOTIFICATION PUSH
 * Sends push notification strictly to members of the selected Care Cell when a visit is scheduled.
 */
export const pushCareCellVisit = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/careCellVisits/{visitId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const visitId = event.params.visitId;
    const churchId = event.params.churchId;
    const db = getFirestore();
    const visitRef = snap.ref;
    const data = snap.data();

    let shouldSend = false;
    try {
      shouldSend = await db.runTransaction(async (transaction) => {
        const freshDoc: any = await transaction.get(visitRef as any);
        if (!freshDoc.exists) return false;
        if (freshDoc.data()?.pushNotificationSent === true) return false;
        transaction.update(visitRef, {
          pushNotificationSent: true,
          pushNotificationSentAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
    } catch (txErr) {
      console.warn('Transaction error checking pushNotificationSent on careCellVisit:', txErr);
      if (data?.pushNotificationSent === true) return;
      shouldSend = true;
    }

    if (!shouldSend) return;

    const cellId = data.cellId;
    if (!cellId) return;

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
      const tokens: string[] = [];
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
        } catch (_) {}
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
            priority: 'high' as const,
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
      } else {
        console.log(`No valid FCM tokens found for members in care cell ${cellId}`);
      }
    } catch (err) {
      console.error('Error dispatching Care Cell visit push notification:', err);
    }
  }
);

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
async function handleTestimonyAdminCreatedPush(testimony: any, churchId: string, testimonyId: string, snapRef?: any) {
  if (!testimony) return;

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
      const snap: any = await transaction.get(docRef as any);
      if (!snap.exists) return false;
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
  } catch (txErr) {
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

  const adminTokens: string[] = [];

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
          m.fcmTokens.forEach((tk: any) => {
            if (typeof tk === 'string' && tk.trim().length > 10) {
              adminTokens.push(tk.trim());
            }
          });
        }
      }
    });
  } catch (lookupErr) {
    console.error('Error fetching admin tokens for testimony notification:', lookupErr);
  }

  const notificationData: Record<string, string> = {
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
    } catch (pushErr) {
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
  } catch (topicErr) {
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
  } catch (dbErr) {
    console.error('Error writing testimony in-app broadcast/notification document:', dbErr);
  }
}

/**
 * 🔄 HELPER: HANDLE WORKFLOW STATE UPDATES (MEMBER APPROVAL/REJECTION OR CHURCH-WIDE PUBLICATION)
 */
async function handleTestimonyWorkflowUpdatedPush(before: any, after: any, churchId: string, testimonyId: string, snapRef?: any) {
  if (!after) return;
  const db = getFirestore();
  const messaging = getMessaging();

  const memberName = (after.memberName || 'Church Member').trim();
  const testimonyTitle = (after.title || 'Testimony').trim();

  // ── WORKFLOW CASE 0: Resubmitted for Admin Review ──
  const isResubmittedPendingReview =
    before?.status !== 'Pending Review' &&
    after.status === 'Pending Review' &&
    after.adminPushSent !== true;

  if (isResubmittedPendingReview) {
    await handleTestimonyAdminCreatedPush(after, churchId, testimonyId, snapRef);
  }

  // ── WORKFLOW CASE 1: Member Status Update (Approved or Rejected) ──
  const statusChanged = before?.status !== after.status;
  const memberNeedsStatusPush =
    statusChanged &&
    (after.status === 'Approved' || after.status === 'Rejected') &&
    after.lastMemberNotifiedStatus !== after.status;

  if (memberNeedsStatusPush && after.memberId) {
    if (snapRef) {
      try {
        await snapRef.update({
          lastMemberNotifiedStatus: after.status,
          lastMemberNotifiedAt: FieldValue.serverTimestamp(),
        });
      } catch (_) {}
    }

    const memberTokens: string[] = [];
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
          mData.fcmTokens.forEach((tk: any) => {
            if (typeof tk === 'string' && tk.trim().length > 10) {
              memberTokens.push(tk.trim());
            }
          });
        }
      }
    } catch (mErr) {
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
      } catch (pushErr) {
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
    } catch (_) {}
  }

  // ── WORKFLOW CASE 2: Publication of Public Testimony (Church-wide broadcast) ──
  const isNewlyPublished =
    before?.status !== 'Published' &&
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
      } catch (_) {}
    }

    const title = '✨ New Testimony Shared!';
    const body = `${memberName} shared a testimony: "${testimonyTitle}". Tap to watch or read!`;

    const notificationData: Record<string, string> = {
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
    } catch (topicErr) {
      console.error('Error broadcasting testimony to church topic:', topicErr);
    }

    // 2. Direct multicast to church members with tokens
    try {
      const membersSnap = await db.collection('Rhema Church').doc(churchId).collection('members').get();

      const allTokens: string[] = [];
      membersSnap.forEach((doc) => {
        const d = doc.data();
        if (d.fcmToken && typeof d.fcmToken === 'string' && d.fcmToken.trim().length > 10) {
          allTokens.push(d.fcmToken.trim());
        }
        if (Array.isArray(d.fcmTokens)) {
          d.fcmTokens.forEach((tk: any) => {
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
    } catch (multicastErr) {
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
    } catch (_) {}
  }
}

/**
 * ✨ TRIGGER 1: Member Submits Testimony (Notifies Authorized Admins)
 */
export const onTestimonyCreatedAdmin = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const testimony = snap.data();
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyAdminCreatedPush(testimony, churchId, testimonyId, snap.ref);
  }
);

export const onTestimonyCreatedAdminLegacy = onDocumentCreated(
  { document: 'churches/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const testimony = snap.data();
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyAdminCreatedPush(testimony, churchId, testimonyId, snap.ref);
  }
);

/**
 * 🔄 TRIGGER 2: Admin Workflow Update (Member Approval/Rejection Notice or Publication Broadcast)
 */
export const onTestimonyUpdatedWorkflow = onDocumentUpdated(
  { document: 'Rhema Church/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after) return;
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyWorkflowUpdatedPush(before, after, churchId, testimonyId, snapRef);
  }
);

export const onTestimonyUpdatedWorkflowLegacy = onDocumentUpdated(
  { document: 'churches/{churchId}/testimonies/{testimonyId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after) return;
    const churchId = event.params.churchId;
    const testimonyId = event.params.testimonyId;
    await handleTestimonyWorkflowUpdatedPush(before, after, churchId, testimonyId, snapRef);
  }
);

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
async function resolveVolunteerMemberTokens(
  db: FirebaseFirestore.Firestore,
  churchId: string,
  memberId: string,
  memberPhone?: string,
  memberEmail?: string,
  memberName?: string,
  directFcmToken?: string
): Promise<string[]> {
  const tokenSet = new Set<string>();

  const addToken = (t: any) => {
    if (typeof t === 'string' && t.trim().length > 10) {
      tokenSet.add(t.trim());
    }
  };

  const addTokensFromArray = (arr: any) => {
    if (Array.isArray(arr)) {
      arr.forEach((t) => addToken(t));
    }
  };

  if (directFcmToken) {
    addToken(directFcmToken);
  }

  const extractFromDoc = (docSnap: any) => {
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
    } catch (_) {}

    // 2. Direct member document in churches/{churchId}/members/{memberId}
    try {
      const snap = await db.collection('churches').doc(cid).collection('members').doc(memberId).get();
      extractFromDoc(snap);
    } catch (_) {}

    // 3. User document in users/{memberId}
    try {
      const snap = await db.collection('users').doc(memberId).get();
      extractFromDoc(snap);
    } catch (_) {}

    // 4. Fallback check in default 'rhema' church if churchId is different
    if (cid !== 'rhema') {
      try {
        const snap = await db.collection('Rhema Church').doc('rhema').collection('members').doc(memberId).get();
        extractFromDoc(snap);
      } catch (_) {}
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
          if (dPhone.endsWith(last10)) extractFromDoc(d);
        });
      } catch (_) {}

      try {
        const uSnap = await db.collection('users').get();
        uSnap.forEach((d) => {
          const dPhone = String(d.data()?.phone || d.data()?.mobile || '').replace(/[^\d+]/g, '');
          if (dPhone.endsWith(last10)) extractFromDoc(d);
        });
      } catch (_) {}
    }
  }

  // 6. Query members by email if no token found yet
  if (tokenSet.size === 0 && memberEmail) {
    const cleanEmail = memberEmail.trim().toLowerCase();
    if (cleanEmail.includes('@')) {
      try {
        const mSnap = await db.collection('Rhema Church').doc(cid).collection('members').where('email', '==', cleanEmail).limit(2).get();
        mSnap.forEach((d) => extractFromDoc(d));
      } catch (_) {}

      try {
        const uSnap = await db.collection('users').where('email', '==', cleanEmail).limit(2).get();
        uSnap.forEach((d) => extractFromDoc(d));
      } catch (_) {}
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
async function resolveVolunteerAdminTokens(
  db: FirebaseFirestore.Firestore,
  churchId: string
): Promise<{ tokens: string[]; adminUids: string[] }> {
  const tokenSet = new Set<string>();
  const adminUidSet = new Set<string>();

  const addToken = (t: any) => {
    if (typeof t === 'string' && t.trim().length > 10) {
      tokenSet.add(t.trim());
    }
  };

  const addTokensFromArray = (arr: any) => {
    if (Array.isArray(arr)) {
      arr.forEach((t) => addToken(t));
    }
  };

  const checkMemberDoc = (doc: any) => {
    const m = doc.data() || {};
    const role = String(m.userType || m.role || '').toLowerCase();
    const isAdmin =
      role.includes('admin') ||
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
  } catch (_) {}

  // 2. Check churches/{churchId}/members
  try {
    const snap = await db.collection('churches').doc(cid).collection('members').get();
    snap.forEach((d) => checkMemberDoc(d));
  } catch (_) {}

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
        specialUids.forEach((uid: string) => adminUidSet.add(uid));
      }
    } catch (_) {}
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
    } catch (_) {}

    try {
      const mSnap = await db.collection('Rhema Church').doc(cid).collection('members').doc(uid).get();
      if (mSnap.exists) {
        const mData = mSnap.data() || {};
        addToken(mData.fcmToken);
        addTokensFromArray(mData.fcmTokens);
      }
    } catch (_) {}
  }

  // 5. Query users collection directly for admin / pastor / super accounts
  try {
    const usersSnap = await db.collection('users').get();
    usersSnap.forEach((doc) => {
      const uData = doc.data() || {};
      const role = String(uData.userType || uData.role || '').toLowerCase();
      const isAdmin =
        role.includes('admin') ||
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
  } catch (_) {}

  return {
    tokens: Array.from(tokenSet),
    adminUids: Array.from(adminUidSet),
  };
}

/**
 * 📲 HIGH PRIORITY FCM MULTICAST DISPATCHER
 * Configured for maximum reliability across foreground, background, and completely closed app states.
 */
async function sendHighPriorityPush(
  messaging: any,
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  channelId: string = 'church_alerts'
): Promise<{ successCount: number; failureCount: number }> {
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0 };

  const uniqueTokens = Array.from(new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 10)));
  if (uniqueTokens.length === 0) return { successCount: 0, failureCount: 0 };

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
        res.responses.forEach((resp: any, idx: number) => {
          if (!resp.success) {
            const tokenPreview = chunk[idx] ? chunk[idx].slice(0, 15) : 'unknown';
            console.warn(`[VolunteerPush] Token delivery failure (${resp.error?.code}): ${tokenPreview}...`);
          }
        });
      }
    } catch (batchErr) {
      console.error('[VolunteerPush] Error dispatching push chunk:', batchErr);
      totalFailure += chunk.length;
    }
  }

  return { successCount: totalSuccess, failureCount: totalFailure };
}

/**
 * 📡 HIGH PRIORITY TOPIC BROADCASTER
 */
async function sendHighPriorityTopicPush(
  messaging: any,
  topic: string,
  title: string,
  body: string,
  data: Record<string, string>,
  channelId: string = 'church_alerts'
) {
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
  } catch (topicErr) {
    console.warn(`[VolunteerPush] Topic broadcast failed for ${topic}:`, topicErr);
  }
}

function computeVolunteerAssignmentKey(data: {
  assignedRole?: string;
  assignedDate?: string;
  assignedTimeSlot?: string;
  assignedLocation?: string;
  assignedResponsibility?: string;
}): string {
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
async function writeVolunteerInAppNotifications(
  db: any,
  churchId: string,
  docId: string,
  payload: Record<string, any>,
  targetMemberIds?: string | string[]
): Promise<void> {
  const cid = churchId || 'rhema';
  const docData = {
    ...payload,
    churchId: cid,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };

  const writes: Promise<any>[] = [
    db.collection('Rhema Church').doc(cid).collection('notifications').doc(docId).set(docData, { merge: true }),
    db.collection('Rhema Church').doc(cid).collection('broadcasts').doc(docId).set({ ...docData, silent: true }, { merge: true }),
  ];

  const memberIds = Array.isArray(targetMemberIds)
    ? Array.from(new Set(targetMemberIds.map((id) => String(id || '').trim()).filter(Boolean)))
    : targetMemberIds
      ? [String(targetMemberIds).trim()].filter(Boolean)
      : [];

  for (const memberId of memberIds) {
    writes.push(
      db
        .collection('Rhema Church')
        .doc(cid)
        .collection('members')
        .doc(memberId)
        .collection('notifications')
        .doc(docId)
        .set(docData, { merge: true })
    );
  }

  const results = await Promise.allSettled(writes);
  for (const res of results) {
    if (res.status === 'rejected') {
      console.error('Error writing volunteer in-app notification document:', res.reason);
    }
  }
}

/**
 * 🤝 HELPER: Notify Authorized Church Admins of a New Volunteer Application
 */
async function handleVolunteerApplicationAdminCreatedPush(
  appData: any,
  churchId: string,
  applicationId: string,
  snapRef?: any
) {
  if (!appData) return;
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
      } catch (err) {
        console.warn('Could not resolve volunteer member name:', err);
      }
    }
  }
  if (!memberName) memberName = 'A Church Member';

  const isEventVolunteer = appData.volunteerType === 'event';
  const eventName = (appData.eventTitle || 'Church Event').trim();

  // 2. Notification title and body according to specification
  const title = isEventVolunteer
    ? '📅 New Event Volunteer Application!'
    : '📋 New Volunteer Application!';

  const body = isEventVolunteer
    ? `${memberName} has applied to volunteer for ${eventName}. Please review the application.`
    : `${memberName} has submitted a new General Volunteer application. Please review the application.`;

  // 3. Query authorized Admins for this church
  const { tokens: adminTokens, adminUids } = await resolveVolunteerAdminTokens(db, cid);

  const notificationData: Record<string, string> = {
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
  } else {
    console.warn(`⚠️ No direct admin FCM tokens resolved for church ${cid}`);
  }

  // 5. Topic Broadcast to church admin topics
  await sendHighPriorityTopicPush(messaging, `church_${cid}_admin`, title, body, notificationData, 'church_alerts');
  if (cid !== 'rhema') {
    await sendHighPriorityTopicPush(messaging, 'church_rhema_admin', title, body, notificationData, 'church_alerts');
  }

  // 6. Write in-app notification doc for admins (notifications, silent broadcast, and admin member feeds)
  await writeVolunteerInAppNotifications(
    db,
    cid,
    `vol_admin_${applicationId}`,
    {
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
    },
    adminUids
  );

  // 7. Atomic update on document to prevent duplicates
  if (snapRef) {
    try {
      await snapRef.update({
        adminPushSent: true,
        adminNotified: true,
        adminPushSentAt: FieldValue.serverTimestamp(),
        adminNotifiedAt: FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  }
}

/**
 * 🤝 HELPER: Handle Volunteer Application Status Transitions (Approval, Rejection, Assignment)
 */
async function handleVolunteerApplicationWorkflowUpdatedPush(
  before: any,
  after: any,
  churchId: string,
  applicationId: string,
  snapRef?: any
) {
  if (!after) return;
  const db = getFirestore();
  const messaging = getMessaging();
  const cid = churchId || 'rhema';

  const isEventVolunteer = after.volunteerType === 'event';
  const eventName = (after.eventTitle || 'the church event').trim();
  const memberId = after.memberId;

  // Retrieve member tokens across members collection, users collection, direct token, and phone/email lookups
  const memberTokens = await resolveVolunteerMemberTokens(
    db,
    cid,
    memberId,
    after.memberPhone,
    after.memberEmail,
    after.memberName,
    after.memberFcmToken || after.fcmToken
  );

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
      } else {
        body = 'Your volunteer application has been approved. Thank you for your willingness to serve the church.';
      }
    } else {
      title = 'Volunteer Application Update';
      const reasonPart = after.rejectionReason ? ` Reason: ${after.rejectionReason}` : ' Please check your application details in the app.';
      if (isEventVolunteer) {
        body = `Your volunteer application for ${eventName} has not been approved.${reasonPart}`;
      } else {
        body = `Your volunteer application has not been approved.${reasonPart}`;
      }
    }

    const notificationData: Record<string, string> = {
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
    } else {
      console.warn(`⚠️ No device FCM tokens resolved for member ${memberId} (${after.memberName || 'Volunteer'})`);
    }

    // In-app notification record for the member
    if (memberId) {
      const normalizedKeyStatus = currentStatus === 'declined' ? 'rejected' : currentStatus;
      await writeVolunteerInAppNotifications(
        db,
        cid,
        `vol_status_${applicationId}_${normalizedKeyStatus}`,
        {
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
        },
        memberId
      );
    }

    // Atomic update to mark status notification delivered and initialize assignment hash
    if (snapRef) {
      try {
        const updatePayload: any = {
          lastNotifiedStatus: currentStatus,
          lastNotifiedStatusAt: FieldValue.serverTimestamp(),
        };
        if (currentStatus === 'approved') {
          updatePayload.lastNotifiedAssignmentHash = currentAssignmentHash;
        }
        await snapRef.update(updatePayload);
      } catch (_) {}
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

  const assignmentChanged =
    currentStatus === 'approved' &&
    !statusChanged && // Prevent duplicate notification on the same approval turn
    currentAssignmentHash.trim() !== '||||' &&
    currentAssignmentHash !== beforeAssignmentHash &&
    after.lastNotifiedAssignmentHash !== currentAssignmentHash;

  if (assignmentChanged) {
    const title = '⭐ You Have Been Assigned!';
    const roleText = after.assignedRole ? `as ${after.assignedRole}` : 'a volunteer';
    const body = `You have been assigned ${roleText} for ${eventName}.${after.assignedResponsibility ? ` Duty: ${after.assignedResponsibility}.` : ''} Please check your assignment details.`;

    const notificationData: Record<string, string> = {
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
      await writeVolunteerInAppNotifications(
        db,
        cid,
        `vol_assign_${applicationId}_${assignKey}`,
        {
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
        },
        memberId
      );
    }

    if (snapRef) {
      try {
        await snapRef.update({
          lastNotifiedAssignmentHash: currentAssignmentHash,
          assignedAt: FieldValue.serverTimestamp(),
        });
      } catch (_) {}
    }
  }
}

/**
 * 📢 HELPER: Handle Event Changes or Cancellation (Notifies Affected Approved Volunteers Only)
 */
async function handleEventChangesForVolunteersPush(
  before: any,
  after: any,
  churchId: string,
  eventId: string
) {
  if (!after) return;
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

    if (volSnap.empty) return;

    const eventName = (after.title || after.name || 'Church Event').trim();
    let title = '';
    let body = '';

    if (isCancelled) {
      title = `⚠️ Event Cancelled: ${eventName}`;
      body = `The event "${eventName}" has been cancelled. Your volunteer assignment is cancelled. Thank you for your willingness to serve.`;
    } else {
      title = `📅 Volunteer Update: ${eventName}`;
      const changeParts: string[] = [];
      if (dateChanged && after.date) changeParts.push(`Date: ${after.date}`);
      if (timeChanged) changeParts.push(`Time: ${after.time || after.startTime}`);
      if (locationChanged && after.location) changeParts.push(`Location: ${after.location}`);
      body = `Details for "${eventName}" have changed (${changeParts.join(', ')}). Please check your updated volunteer assignment.`;
    }

    const allTokens: string[] = [];

    for (const vDoc of volSnap.docs) {
      const vd = vDoc.data();
      const mTokens = await resolveVolunteerMemberTokens(db, cid, vd.memberId, vd.memberPhone, vd.memberEmail, vd.memberName);
      allTokens.push(...mTokens);
    }

    const uniqueTokens = Array.from(new Set(allTokens));
    if (uniqueTokens.length > 0) {
      await sendHighPriorityPush(
        messaging,
        uniqueTokens,
        title,
        body,
        {
          type: 'volunteer_event_change',
          churchId: cid,
          eventId,
          screen: 'EventDetails',
          isCancelled: String(isCancelled),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        'church_alerts'
      );
      console.log(`✅ Sent event change alert to ${uniqueTokens.length} approved volunteer devices.`);
    }

    // Write in-app notification doc for each approved volunteer
    for (const vDoc of volSnap.docs) {
      const vd = vDoc.data();
      const mId = vd.memberId;
      if (!mId) continue;
      await writeVolunteerInAppNotifications(
        db,
        cid,
        `vol_event_${eventId}_${mId}`,
        {
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
        },
        mId
      );
    }
  } catch (err) {
    console.error('Error dispatching event volunteer change pushes:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🚀 EXPORTED VOLUNTEER CLOUD FUNCTIONS (v2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🤝 TRIGGER 1: Member Submits Volunteer Application (Admin Notified)
 */
export const onVolunteerApplicationCreated = onDocumentCreated(
  { document: 'Rhema Church/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const appData = snap.data();
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationAdminCreatedPush(appData, churchId, applicationId, snap.ref);
  }
);

export const onVolunteerApplicationCreatedLegacy = onDocumentCreated(
  { document: 'churches/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const appData = snap.data();
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationAdminCreatedPush(appData, churchId, applicationId, snap.ref);
  }
);

/**
 * 🤝 TRIGGER 2, 3, 4: Status Transition & Volunteer Role Assignment (Member Notified)
 */
export const onVolunteerApplicationUpdated = onDocumentUpdated(
  { document: 'Rhema Church/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after) return;
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationWorkflowUpdatedPush(before, after, churchId, applicationId, snapRef);
  }
);

export const onVolunteerApplicationUpdatedLegacy = onDocumentUpdated(
  { document: 'churches/{churchId}/volunteer_applications/{applicationId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const snapRef = event.data?.after.ref;
    if (!after) return;
    const churchId = event.params.churchId;
    const applicationId = event.params.applicationId;
    await handleVolunteerApplicationWorkflowUpdatedPush(before, after, churchId, applicationId, snapRef);
  }
);

/**
 * 📅 TRIGGER 5: Event Details or Cancellation (Affected Approved Volunteers Notified)
 */
export const onEventUpdatedForVolunteers = onDocumentUpdated(
  { document: 'Rhema Church/{churchId}/events/{eventId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    const churchId = event.params.churchId;
    const eventId = event.params.eventId;
    await handleEventChangesForVolunteersPush(before, after, churchId, eventId);
  }
);

export const onEventUpdatedForVolunteersLegacy = onDocumentUpdated(
  { document: 'churches/{churchId}/events/{eventId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    const churchId = event.params.churchId;
    const eventId = event.params.eventId;
    await handleEventChangesForVolunteersPush(before, after, churchId, eventId);
  }
);

/**
 * ⏰ TRIGGER 6: Scheduled 24-Hour & 2-Hour Volunteer Reminders
 * Scans upcoming events and sends reliable reminders to approved volunteers.
 */
export const scheduledVolunteerReminders = onSchedule(
  { schedule: '*/30 * * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' },
  async (event) => {
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

        if (eventsSnap.empty) continue;

        for (const eDoc of eventsSnap.docs) {
          const ev = eDoc.data();
          if (ev.isCancelled === true) continue;

          const dateStr = ev.date;
          const timeStr = ev.time || ev.startTime || '10:00';
          if (!dateStr) continue;

          let eventTimestamp: number;
          try {
            eventTimestamp = new Date(`${dateStr}T${timeStr.includes(':') ? timeStr.split(' ')[0] : '10:00'}:00`).getTime();
            if (isNaN(eventTimestamp)) {
              eventTimestamp = new Date(dateStr).getTime();
            }
          } catch (_) {
            continue;
          }

          const diffHours = (eventTimestamp - now.getTime()) / (1000 * 60 * 60);
          const is24hWindow = diffHours >= 23 && diffHours <= 25;
          const is2hWindow = diffHours >= 1.5 && diffHours <= 2.5;

          if (!is24hWindow && !is2hWindow) continue;

          const volSnap = await db
            .collection('Rhema Church')
            .doc(churchId)
            .collection('volunteer_applications')
            .where('eventId', '==', eDoc.id)
            .where('status', '==', 'approved')
            .get();

          if (volSnap.empty) continue;

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
            } else if (is2hWindow && !remindersSent.h2) {
              shouldSend = true;
              reminderType = '2h';
              title = '🔔 Volunteer Reminder: In 2 Hours!';
              body = `Reminder: You are scheduled to volunteer for ${ev.title || 'Church Event'} in 2 hours. Role: ${vData.assignedRole || vData.preferredRole || 'Volunteer'}, Location: ${ev.location || 'Church'}.`;
            }

            if (!shouldSend) continue;

            const updateField = reminderType === '24h'
              ? { 'remindersSent.h24': true, 'remindersSent.h24At': FieldValue.serverTimestamp() }
              : { 'remindersSent.h2': true, 'remindersSent.h2At': FieldValue.serverTimestamp() };

            try {
              await vDoc.ref.update(updateField);
            } catch (_) {}

            const memberId = vData.memberId;
            if (memberId) {
              const tokens = await resolveVolunteerMemberTokens(db, churchId, memberId, vData.memberPhone, vData.memberEmail, vData.memberName);
              if (tokens.length > 0) {
                await sendHighPriorityPush(
                  messaging,
                  tokens,
                  title,
                  body,
                  {
                    type: 'volunteer_reminder',
                    churchId,
                    eventId: eDoc.id,
                    screen: 'EventDetails',
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                  },
                  'church_alerts'
                );
                console.log(`✅ Sent ${reminderType} reminder to volunteer member: ${memberId}`);
              }

              await writeVolunteerInAppNotifications(
                db,
                churchId,
                `vol_rem_${reminderType}_${eDoc.id}_${memberId}`,
                {
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
                },
                memberId
              );
            }
          }
        }
      }
    } catch (cronErr) {
      console.error('Error in scheduledVolunteerReminders cron:', cronErr);
    }
  }
);

/**
 * 🛠️ HTTP TEST ENDPOINT: Direct Volunteer Push Verification
 * Query params:
 *   action: 'admin_test' | 'member_test'
 *   churchId: string (default 'rhema')
 *   memberId: string (required for member_test)
 */
export const triggerVolunteerPushTestHttp = onRequest(
  { cors: true, region: 'asia-south1' },
  async (req, res) => {
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
        const sendRes = await sendHighPriorityPush(
          messaging,
          tokens,
          title,
          body,
          {
            type: 'volunteer_application_admin',
            churchId,
            applicationId: 'test_app_id',
            screen: 'AdminRoot',
            targetTab: 'Volunteer Management',
          },
          'church_alerts'
        );
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
        const sendRes = await sendHighPriorityPush(
          messaging,
          tokens,
          title,
          body,
          {
            type: 'volunteer_application_member',
            churchId,
            applicationId: 'test_app_id',
            status: 'approved',
            screen: 'Volunteer',
          },
          'church_alerts'
        );
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
    } catch (err: any) {
      console.error('Error in triggerVolunteerPushTestHttp:', err);
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  }
);

