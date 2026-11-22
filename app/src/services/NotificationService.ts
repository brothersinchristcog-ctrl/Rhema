import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { messaging, firestore, auth } from './firebaseConfig';

const LAST_LIVE_NOTIF_STORAGE_KEY = '@last_yt_live_notif';
const LIVE_NOTIF_SAME_VIDEO_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const LIVE_NOTIF_FALLBACK_COOLDOWN_MS = 15 * 60 * 1000;

class NotificationService {
  private notificationHandlerConfigured = false;
  private lastLiveNotifKey = '';
  private lastLiveNotifAt = 0;
  private recentSystemNotifs = new Map<string, number>();

  messaging() {
    return messaging();
  }

  async requestUserPermission() {
    console.log('🧐 Requesting Notification Permissions...');
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      console.log('🤖 Android Notification Status:', granted);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    console.log('📱 Permission Enabled:', enabled);
    return enabled;
  }

  async getFcmToken() {
    try {
      const token = await messaging().getToken();
      if (token) {
        console.log('✅ FCM Token Found:', token);
        await this.saveTokenToFirestore(token);
        return token;
      } else {
        console.log('❌ No FCM token returned from messaging()');
      }
    } catch (error) {
      console.error('❌ FCM Token Error:', error);
    }
    return null;
  }

  async saveTokenToFirestore(token: string) {
    try {
      const user = auth().currentUser;
      if (!user) {
        console.log('⚠️ Cannot save token: No user logged in');
        return;
      }

      console.log('📤 Fetching user global church association to save token for UID:', user.uid);
      const FirestoreService = require('./FirestoreService').default;
      const globalUser = await FirestoreService.getGlobalUser(user.uid);
      const targetChurchId =
        globalUser?.primaryChurchId ||
        (await FirestoreService.getChurchId().catch(() => null)) ||
        'rhema';

      // Save token to root users document, and update any EXISTING matching member doc(s) in members/
      // (using update on existing docs only, so it never creates a duplicate nameless stub doc)
      const membersCol = firestore().collection('Rhema Church').doc(targetChurchId).collection('members');
      const tokenUpdatePayload = {
        fcmToken: token,
        fcmTokens: firestore.FieldValue.arrayUnion(token),
        lastTokenUpdate: firestore.FieldValue.serverTimestamp(),
        platform: Platform.OS,
      };

      const matchedMemberRefs = new Map<string, any>();

      const directRef = membersCol.doc(user.uid);
      const directSnap = await directRef.get().catch(() => null);
      const directExists =
        directSnap &&
        (typeof (directSnap as any).exists === 'function'
          ? (directSnap as any).exists()
          : Boolean(directSnap.exists));
      if (directExists) {
        matchedMemberRefs.set(directRef.path, directRef);
      }

      try {
        const authUidSnap = await membersCol.where('authUid', '==', user.uid).get();
        authUidSnap.forEach((d: any) => matchedMemberRefs.set(d.ref.path, d.ref));
      } catch (_) {}

      const rawPhone = String(user.phoneNumber || globalUser?.phone || '').trim();
      const digits10 = rawPhone.replace(/\D/g, '').slice(-10);
      if (digits10.length === 10) {
        const phoneCandidates = Array.from(new Set([rawPhone, `+91${digits10}`, digits10].filter(Boolean)));
        for (const pVal of phoneCandidates) {
          try {
            const pDocRef = membersCol.doc(pVal);
            const pDocSnap = await pDocRef.get().catch(() => null);
            const pDocExists =
              pDocSnap &&
              (typeof (pDocSnap as any).exists === 'function'
                ? (pDocSnap as any).exists()
                : Boolean(pDocSnap.exists));
            if (pDocExists) {
              matchedMemberRefs.set(pDocRef.path, pDocRef);
            }
          } catch (_) {}
          try {
            const pQuerySnap = await membersCol.where('phone', '==', pVal).get();
            pQuerySnap.forEach((d: any) => matchedMemberRefs.set(d.ref.path, d.ref));
          } catch (_) {}
        }
      }

      await Promise.allSettled([
        ...Array.from(matchedMemberRefs.values()).map((ref) =>
          ref.set(tokenUpdatePayload, { merge: true })
        ),
        firestore()
          .collection('users')
          .doc(user.uid)
          .set(
            {
              ...tokenUpdatePayload,
              primaryChurchId: targetChurchId,
            },
            { merge: true }
          ),
      ]);

      console.log('✨ Token saved successfully to member profile!');
    } catch (err) {
      console.error('❌ Firestore Token Save Error:', err);
    }
  }

  async setupCategoriesAndChannels() {
    try {
      if (!this.notificationHandlerConfigured) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        this.notificationHandlerConfigured = true;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('church_alerts', {
          name: 'Church Live & Updates',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#E02424',
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
        });

        await Notifications.setNotificationChannelAsync('church_chat', {
          name: 'Church Messages & Groups',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 180, 120, 180],
          lightColor: '#22C55E',
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
        });
      }

      await Notifications.setNotificationCategoryAsync('youtube_live', [
        {
          identifier: 'join_live_now',
          buttonTitle: '📺 Join Live Now',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('youtube_live_category', [
        {
          identifier: 'join_live_now',
          buttonTitle: '📺 Join Live Now',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);
      console.log('✅ [NotificationService] Registered YouTube Live category with "📺 Join Live Now" action button');
    } catch (e) {
      console.warn('⚠️ [NotificationService] setupCategoriesAndChannels notice:', e);
    }
  }

  async displayLiveNotification(data: any, title?: string, body?: string): Promise<boolean> {
    try {
      await this.setupCategoriesAndChannels();
      const pushTitle = title || data?.pushTitle || data?.title || '🔴 We Are LIVE Now!';
      const pushBody = body || data?.pushBody || data?.body || "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!";

      const liveUrl = (data && data.url) || '';
      const videoId = (data && data.videoId) || '';
      const churchId = (data && data.churchId) || 'rhema';

      const dedupKey = videoId || liveUrl || 'active';
      const cooldownMs = videoId ? LIVE_NOTIF_SAME_VIDEO_COOLDOWN_MS : LIVE_NOTIF_FALLBACK_COOLDOWN_MS;
      const now = Date.now();

      if (this.lastLiveNotifKey === dedupKey && now - this.lastLiveNotifAt < cooldownMs) {
        console.log('ℹ️ [NotificationService] Suppressed duplicate YouTube Live notification (in-memory):', dedupKey);
        return false;
      }

      try {
        const storedRaw = await AsyncStorage.getItem(LAST_LIVE_NOTIF_STORAGE_KEY);
        if (storedRaw) {
          const parsed = JSON.parse(storedRaw);
          if (parsed?.key === dedupKey && now - Number(parsed?.timestamp || 0) < cooldownMs) {
            this.lastLiveNotifKey = dedupKey;
            this.lastLiveNotifAt = Number(parsed.timestamp);
            console.log('ℹ️ [NotificationService] Suppressed duplicate YouTube Live notification (storage):', dedupKey);
            return false;
          }
        }
      } catch {
        // Non-fatal storage read error
      }

      this.lastLiveNotifKey = dedupKey;
      this.lastLiveNotifAt = now;
      AsyncStorage.setItem(
        LAST_LIVE_NOTIF_STORAGE_KEY,
        JSON.stringify({ key: dedupKey, timestamp: now })
      ).catch(() => {});

      const identifier = videoId ? `youtube_live_${videoId}` : 'youtube_live_active';

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: pushTitle,
          body: pushBody,
          data: {
            type: 'youtube_live',
            url: liveUrl,
            videoId: videoId,
            churchId: churchId,
            title: pushTitle,
          },
          categoryIdentifier: 'youtube_live',
          sound: 'default',
          color: '#E02424',
          autoDismiss: true,
        },
        trigger: Platform.OS === 'android' ? { channelId: 'church_alerts' } : null,
      });
      console.log('✅ [NotificationService] Posted YouTube Live notification with "Join Live Now" button to device notification panel');
      return true;
    } catch (err) {
      console.error('❌ [NotificationService] Failed to post live notification to panel:', err);
      return false;
    }
  }

  /**
   * Posts a high-priority system tray notification banner (with sound & vibration on 'church_alerts')
   * when the app is in the foreground or via real-time broadcast listener, with strict deduplication.
   */
  async displaySystemPushNotification(
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<boolean> {
    try {
      await this.setupCategoriesAndChannels();
      const cleanTitle = (title || 'Rhema Church Update').trim();
      const cleanBody = (body || '').trim();
      if (!cleanTitle && !cleanBody) return false;

      const rawId = String(
        data?.postId ||
          data?.opportunityId ||
          data?.applicationId ||
          data?.requestId ||
          data?.eventId ||
          data?.referenceId ||
          data?.id ||
          ''
      )
        .replace(/^vol_post_/, '')
        .trim();
      const dedupKey = `${data?.type || 'general'}|${rawId}|${cleanTitle}`;
      const now = Date.now();
      const prevAt = this.recentSystemNotifs.get(dedupKey) || 0;
      if (now - prevAt < 20000) {
        return false;
      }
      this.recentSystemNotifs.set(dedupKey, now);

      const identifier = rawId
        ? `rhema_push_${data?.type || 'notif'}_${rawId}`
        : `rhema_push_${now}`;

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: cleanTitle,
          body: cleanBody,
          data: data || {},
          sound: 'default',
          autoDismiss: true,
        },
        trigger: Platform.OS === 'android' ? { channelId: 'church_alerts' } : null,
      });
      return true;
    } catch (err) {
      console.warn('⚠️ [NotificationService] displaySystemPushNotification notice:', err);
      return false;
    }
  }

  // Handle navigation when a notification is clicked
  handleNotificationNavigation(remoteMessage: any, navigation: any) {
    if (!remoteMessage) return;

    // We can import the global ref to check if the navigator is fully ready
    const { navigationRef } = require('../../App');
    
    // Determine which navigation object to use
    let nav = null;
    if (navigationRef.isReady()) {
      nav = navigationRef;
    } else if (navigation && typeof navigation.navigate === 'function') {
      nav = navigation;
    }

    if (!nav) {
      console.log('⚠️ Navigation not fully ready yet, skipping notification navigation.');
      return;
    }

    const rawData = remoteMessage?.data || remoteMessage || {};
    const type = ((rawData.type || (rawData.screen === 'BibleQuizDetail' || rawData.quizId ? 'quiz' : '')) as string).toLowerCase();
    const id = rawData.quizId || rawData.relatedId || rawData.id;
    console.log('🚀 Navigating for notification type:', type);

    try {
      switch (type) {
        case 'sermon': {
          const sermonId = rawData.sermonId || rawData.relatedId || (id ? String(id).replace(/^sermon_/, '') : null);
          if (sermonId) {
            nav.navigate('SermonVideo', { sermonId });
          } else {
            nav.navigate('Sermons');
          }
          break;
        }
        case 'event':
        case 'church_event':
        case 'event_rsvp': {
          const eventId = rawData.eventId || rawData.id || id;
          console.log('📅 [NotificationService] Routing to EventDetails:', { eventId });
          if (eventId) {
            nav.navigate('EventDetails', { eventId, id: eventId });
          } else {
            nav.navigate('Events');
          }
          break;
        }
        case 'online_meeting':
        case 'online_meeting_scheduled': {
          const meetingId = rawData.meetingId || rawData.id || id;
          const churchId = rawData.churchId || 'rhema';
          try {
            if (meetingId) {
              nav.navigate('OnlineMeetingDetail', {
                meetingId: String(meetingId),
                churchId: String(churchId),
                meeting: {
                  id: String(meetingId),
                  churchId: String(churchId),
                  title: rawData.title || '',
                  meetingLink: rawData.url || rawData.meetingLink || '',
                  meetingUrl: rawData.url || rawData.meetingLink || '',
                  url: rawData.url || rawData.meetingLink || '',
                  provider: rawData.provider || 'google_meet',
                  meetingType: rawData.provider || 'google_meet',
                  password: rawData.password || '',
                  date: rawData.date || '',
                  startTimeLabel: rawData.startTimeLabel || '',
                  endTimeLabel: rawData.endTimeLabel || '',
                  teacherName: rawData.teacherName || '',
                  topic: rawData.topic || '',
                  bibleBook: rawData.bibleBook || '',
                  status: type === 'online_meeting' ? 'live' : 'scheduled',
                },
              });
            } else {
              nav.navigate('OnlineMeetings');
            }
          } catch (_) {
            try {
              nav.navigate('OnlineMeetings');
            } catch (e) {
              console.warn('Navigation to online meetings failed:', e);
            }
          }
          break;
        }
        case 'invoice':
          nav.navigate('AdminRoot', { targetTab: 'Expense', highlightInvoiceId: id });
          break;
        case 'promise':
          nav.navigate('Updates');
          break;
        case 'daily_verse': {
          const rawPeriod = rawData.period || '';
          const normalizedPeriod = rawPeriod
            ? rawPeriod.charAt(0).toUpperCase() + rawPeriod.slice(1).toLowerCase()
            : undefined;
          nav.navigate('VerseOfTheDay', {
            verseId: rawData.verseId,
            period: normalizedPeriod,
            lang: rawData.lang,
          });
          break;
        }
        case 'attendance':
          nav.navigate('AttendanceScreen');
          break;
        case 'birthday':
        case 'anniversary':
        case 'celebration':
        case 'emergency':
          nav.navigate('Updates', { highlightId: id, highlightType: type });
          break;
        case 'baptism_request_admin':
        case 'baptism_request':
        case 'baptism': {
          const reqId = rawData.requestId || rawData.id || id;
          console.log('💧 [NotificationService] Routing to Admin Baptism tab:', { reqId });
          nav.navigate('AdminRoot', {
            targetTab: 'Baptism',
            requestId: reqId,
            timestamp: Date.now(),
          });
          break;
        }
        case 'baptism_request_member': {
          const reqId = rawData.requestId || rawData.id || id;
          console.log('💧 [NotificationService] Routing to Member BaptismRequest screen:', { reqId });
          nav.navigate('BaptismRequest', { requestId: reqId });
          break;
        }
        case 'youtube_live': {
          const liveUrl = (remoteMessage?.data && remoteMessage.data.url) || rawData?.url || '';
          const videoId = rawData.videoId || (remoteMessage?.data && remoteMessage.data.videoId) || '';
          const title = rawData.title || (remoteMessage?.notification && remoteMessage.notification.title) || '';
          const targetChurchId = rawData.churchId || (remoteMessage?.data && remoteMessage.data.churchId) || 'rhema';
          console.log('🎥 [NotificationService] Routing directly to YouTubeLive screen:', { liveUrl, videoId, title, churchId: targetChurchId });
          nav.navigate('YouTubeLive', { url: liveUrl, videoId, title, churchId: targetChurchId });
          break;
        }
        case 'LIVE_CELEBRATION':
          nav.navigate('LiveCelebrationsChat', {});
          break;
        case 'new_church':
          nav.navigate('AdminRoot', { targetTab: 'App Admin' });
          break;
        case 'prayer_request_admin':
        case 'prayer_request':
        case 'prayer': {
          const prayerId = rawData.prayerId || rawData.requestId || id;
          console.log('🙏 [NotificationService] Direct routing to Admin Prayers tab:', { prayerId });
          nav.navigate('AdminRoot', {
            targetTab: 'Prayers',
            prayerId: prayerId,
            requestId: prayerId,
            timestamp: Date.now(),
          });
          break;
        }
        case 'prayer_request_member':
          nav.navigate('PrayerWall', { prayerId: rawData.prayerId || rawData.requestId || id });
          break;
        case 'prayer_request_public':
          nav.navigate('PrayerWall', { tab: 'public_requests' });
          break;
        case 'quiz':
        case 'quiz_scheduled':
        case 'bible_quiz': {
          const quizTargetId = rawData.quizId || rawData.relatedId || rawData.id || id;
          const targetChurchId = rawData.churchId;
          console.log('📖 [NotificationService] Routing directly to Bible quiz:', { quizTargetId, targetChurchId });
          if (quizTargetId) {
            nav.navigate('BibleQuizDetail', {
              quizId: quizTargetId,
              id: quizTargetId,
              relatedId: rawData.relatedId || quizTargetId,
              churchId: targetChurchId,
            });
          } else {
            nav.navigate('ChurchQuizzes');
          }
          break;
        }
        case 'care_cell':
        case 'care_cell_visit':
        case 'care_cell_announcement':
        case 'care_cell_meeting':
        case 'care_cell_prayer': {
          nav.navigate('CareCell', {
            visitId: rawData.visitId,
            initialTab: rawData.type === 'care_cell_visit' ? 'visits' : undefined,
          });
          break;
        }
        case 'admin_roster_alert': {
          nav.navigate('AdminRoot', {
            targetTab: 'Service Roster',
            serviceId: rawData.serviceId,
            roleId: rawData.roleId,
            timestamp: Date.now(),
          });
          break;
        }
        case 'service_responsibility_broadcast':
        case 'service_reminder':
        case 'rehearsal_alert':
        case 'service_assignment':
        case 'service_roster':
        case 'roster_assignment': {
          const initialTab =
            type === 'service_assignment' ||
            type === 'service_responsibility_broadcast' ||
            type === 'service_reminder'
              ? 'responsibilities'
              : 'roster';
          nav.navigate('MyService', {
            serviceId: rawData.serviceId,
            initialTab,
          });
          break;
        }
        case 'testimony_admin': {
          const testimonyId = rawData.testimonyId || rawData.id || id;
          console.log('✨ [NotificationService] Routing to Admin Testimonies tab:', { testimonyId });
          nav.navigate('AdminRoot', {
            targetTab: 'Testimonies',
            testimonyId,
            timestamp: Date.now(),
          });
          break;
        }
        case 'testimony_member_status': {
          const testimonyId = rawData.testimonyId || rawData.id || id;
          console.log('✨ [NotificationService] Routing to Member Testimony:', { testimonyId });
          if (testimonyId) {
            nav.navigate('TestimonyDetail', {
              testimonyId,
              churchId: rawData.churchId || 'rhema',
            });
          } else {
            nav.navigate('Testimonies', { initialTab: 'mine' });
          }
          break;
        }
        case 'testimony_published':
        case 'testimony': {
          const testimonyId = rawData.testimonyId || rawData.id || id;
          console.log('✨ [NotificationService] Routing to Published Testimony:', { testimonyId });
          nav.navigate('TestimonyDetail', {
            testimonyId,
            churchId: rawData.churchId || 'rhema',
          });
          break;
        }
        case 'volunteer_application_admin': {
          const appId = rawData.applicationId || rawData.requestId || id;
          console.log('🤝 [NotificationService] Routing to Admin Volunteer Management tab:', { appId });
          nav.navigate('AdminRoot', {
            targetTab: 'Volunteer Management',
            applicationId: appId,
            subType: rawData.volunteerType || rawData.subType || 'general',
            timestamp: Date.now(),
          });
          break;
        }
        case 'volunteer_application_member': {
          const appId = rawData.applicationId || rawData.requestId || id;
          const eventId = rawData.eventId;
          console.log('🤝 [NotificationService] Routing to Member Volunteer screen:', { appId, eventId });
          if (eventId) {
            nav.navigate('EventDetails', { eventId, id: eventId });
          } else {
            nav.navigate('Volunteer');
          }
          break;
        }
        case 'volunteer_assignment':
        case 'volunteer_reminder':
        case 'volunteer_event_change': {
          const eventId = rawData.eventId || id;
          console.log('⭐ [NotificationService] Routing to Event Assignment/Reminder:', { eventId });
          if (eventId) {
            nav.navigate('EventDetails', { eventId, id: eventId });
          } else {
            nav.navigate('Volunteer');
          }
          break;
        }
        case 'volunteer_post_new': {
          const rawPostId = String(rawData.postId || rawData.referenceId || id || '').replace(/^vol_post_/, '');
          console.log('🤝 [NotificationService] Routing to General Volunteer Call Post:', { postId: rawPostId });
          nav.navigate('Volunteer', { postId: rawPostId });
          break;
        }
        case 'job_opportunity_new': {
          const oppId = rawData.opportunityId || rawData.referenceId || id;
          console.log('💼 [NotificationService] Routing to Ministry Opportunity:', { oppId });
          if (oppId) {
            nav.navigate('OpportunityDetailScreen', { opportunityId: oppId });
          } else {
            nav.navigate('JobCircle', { skipSplash: true });
          }
          break;
        }
        case 'job_application_admin': {
          const appId = rawData.applicationId || rawData.referenceId || id;
          console.log('💼 [NotificationService] Routing Admin to Job Circle Applications:', { appId });
          nav.navigate('AdminRoot', {
            targetTab: 'Job Circle',
            applicationId: appId,
            timestamp: Date.now(),
          });
          break;
        }
        case 'job_application_member': {
          const appId = rawData.applicationId || rawData.referenceId || id;
          const oppId = rawData.opportunityId;
          console.log('💼 [NotificationService] Routing Member to Application Details:', { appId, oppId });
          if (oppId) {
            nav.navigate('OpportunityDetailScreen', {
              opportunityId: oppId,
              applicationId: appId,
              timestamp: Date.now(),
            });
          } else {
            nav.navigate('JobCircle', {
              skipSplash: true,
              initialTab: 'applications',
              applicationId: appId,
              timestamp: Date.now(),
            });
          }
          break;
        }
        case 'registration_request_admin': {
          const reqId = rawData.requestId || rawData.referenceId || id;
          console.log('🆕 [NotificationService] Routing Admin to Registration Approvals:', { reqId });
          nav.navigate('AdminRoot', {
            targetTab: 'Approvals',
            requestId: reqId,
            timestamp: Date.now(),
          });
          break;
        }
        case 'registration_approved':
        case 'registration_rejected': {
          const routeNames = nav.getState?.()?.routeNames || [];
          if (routeNames.includes('ApprovalPending')) {
            nav.navigate('ApprovalPending', {
              requestId: rawData.requestId || rawData.referenceId || id,
              churchId: rawData.churchId,
            });
          } else if (routeNames.includes('Updates')) {
            nav.navigate('Updates', { highlightId: id, highlightType: type });
          } else if (routeNames.includes('Tabs')) {
            nav.navigate('Tabs');
          }
          break;
        }
        case 'kids_check_in':
        case 'kids_check_out':
        case 'kids_absent':
        case 'kids_teacher_enrollment': {
          const initialCategory =
            rawData.initialCategory ||
            (type === 'kids_teacher_enrollment' ? 'consent' : 'attendance');
          nav.navigate('KidsMinistry', {
            initialCategory,
            childDocId: rawData.childDocId,
            programSessionId: rawData.programSessionId,
            timestamp: Date.now(),
          });
          break;
        }
        case 'CHURCH_CHAT': {
          nav.navigate('ChurchChat', {
            roomId: rawData.roomId,
            roomType: rawData.roomType || 'direct',
            title: rawData.roomTitle || rawData.senderName || 'Chat',
            avatarUrl: rawData.avatarUrl || null,
            peerUid: rawData.peerUid || undefined,
          });
          break;
        }
        default:
          if (id) {
            nav.navigate('Updates', { highlightId: id, highlightType: type });
          } else {
            console.log('Unknown notification type, staying on current screen');
          }
      }
    } catch (e) {
      console.error('❌ Notification navigation failed:', e);
    }
  }

  // Handle background notifications
  setupBackgroundHandler() {
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Message handled in the background!', remoteMessage);
    });
  }

  async subscribeToChurchTopic(churchId: string) {
    if (!churchId) return;
    try {
      if (Platform.OS === 'ios') {
        const authStatus = await messaging().hasPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;
          
        if (!enabled) {
          const granted = await this.requestUserPermission();
          if (!granted) {
            console.log(`⚠️ Cannot subscribe to church_${churchId} yet: Permissions not granted on iOS.`);
            return;
          }
        }
      } else if (Platform.OS === 'android' && Platform.Version >= 33) {
        // On Android 13+, check POST_NOTIFICATIONS and request if needed without blocking topic subscription
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
          .then(granted => {
            if (!granted) {
              this.requestUserPermission().catch(() => {});
            }
          })
          .catch(() => {});
      }

      const topicName = `church_${churchId}`;
      await messaging().subscribeToTopic(topicName);
      console.log(`📡 Subscribed to FCM topic: ${topicName}`);
    } catch (error: any) {
      console.warn(`Failed to subscribe to topic church_${churchId}:`, error?.message || error);
    }
  }

  // Unsubscribe user from a church topic (useful when switching churches or logging out)
  async unsubscribeFromChurchTopic(churchId: string) {
    if (!churchId) return;
    try {
      const topicName = `church_${churchId}`;
      await messaging().unsubscribeFromTopic(topicName);
      console.log(`🔌 Unsubscribed from FCM topic: ${topicName}`);
    } catch (error) {
      console.error(`❌ Failed to unsubscribe from topic church_${churchId}:`, error);
    }
  }

  // Subscribe Admin users to church admin alerts (e.g. Prayer Requests, Mod Alerts)
  async subscribeToChurchAdminTopic(churchId: string) {
    if (!churchId) return;
    try {
      const authStatus = await messaging().hasPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) return;

      const topicName = `church_${churchId}_admin`;
      await messaging().subscribeToTopic(topicName);
      console.log(`📡 Subscribed to FCM admin topic: ${topicName}`);
    } catch (error) {
      console.error(`❌ Failed to subscribe to topic church_${churchId}_admin:`, error);
    }
  }

  // Unsubscribe Admin from church admin alerts (on logout or church switch)
  async unsubscribeFromChurchAdminTopic(churchId: string) {
    if (!churchId) return;
    try {
      const topicName = `church_${churchId}_admin`;
      await messaging().unsubscribeFromTopic(topicName);
      console.log(`🔌 Unsubscribed from FCM admin topic: ${topicName}`);
    } catch (error) {
      console.error(`❌ Failed to unsubscribe from topic church_${churchId}_admin:`, error);
    }
  }

  // Subscribe Super Admin users to platform-wide alerts
  async subscribeToSuperAdminTopic() {
    try {
      const authStatus = await messaging().hasPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) return;
      await messaging().subscribeToTopic('platform_super_admins');
      console.log('📡 Subscribed to FCM topic: platform_super_admins');
    } catch (error) {
      console.error('❌ Failed to subscribe to platform_super_admins topic:', error);
    }
  }

  // Unsubscribe Super Admin from platform-wide alerts (on logout)
  async unsubscribeFromSuperAdminTopic() {
    try {
      await messaging().unsubscribeFromTopic('platform_super_admins');
      console.log('🔌 Unsubscribed from FCM topic: platform_super_admins');
    } catch (error) {
      console.error('❌ Failed to unsubscribe from platform_super_admins topic:', error);
    }
  }

  // Handle notifications when the app is open (foreground)
  setupForegroundListener(navigation?: any) {
    return messaging().onMessage(async remoteMessage => {
      const title = remoteMessage?.notification?.title || remoteMessage?.data?.title || remoteMessage?.data?.type || 'Notification';
      const body = remoteMessage?.notification?.body || remoteMessage?.data?.body || '';
      console.log('⚡ Foreground push received:', title, {
        body,
        data: remoteMessage?.data,
        hasNotification: !!remoteMessage?.notification,
      });
      // Foreground notifications are cleanly displayed via the in-app sliding banner in App.js
      // System modal Alert.alert is suppressed to avoid duplicate intrusive popups
    });
  }
}

export default new NotificationService();
