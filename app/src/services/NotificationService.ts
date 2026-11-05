import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { messaging, firestore, auth } from './firebaseConfig';

class NotificationService {
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

      if (globalUser?.primaryChurchId) {
        // Save to church members subcollection
        await firestore().collection('Rhema Church').doc(globalUser.primaryChurchId).collection('members').doc(user.uid).set({
          fcmToken: token,
          lastTokenUpdate: firestore.FieldValue.serverTimestamp(),
          platform: Platform.OS,
        }, { merge: true });

        console.log('✨ Token saved successfully to member profile!');
      } else {
        console.log('⚠️ Token not saved: User does not belong to a church yet.');
      }
    } catch (err) {
      console.error('❌ Firestore Token Save Error:', err);
    }
  }

  async setupCategoriesAndChannels() {
    try {
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

  async displayLiveNotification(data: any, title?: string, body?: string) {
    try {
      await this.setupCategoriesAndChannels();
      const pushTitle = title || data?.pushTitle || data?.title || '🔴 We Are LIVE Now!';
      const pushBody = body || data?.pushBody || data?.body || "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!";

      const liveUrl = (data && data.url) || 'https://www.youtube.com/@Brothersinchristfellowship/live';
      const videoId = (data && data.videoId) || '';
      const churchId = (data && data.churchId) || 'rhema';

      await Notifications.scheduleNotificationAsync({
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
        },
        trigger: Platform.OS === 'android' ? { channelId: 'church_alerts' } : null,
      });
      console.log('✅ [NotificationService] Posted YouTube Live notification with "Join Live Now" button to device notification panel');
    } catch (err) {
      console.error('❌ [NotificationService] Failed to post live notification to panel:', err);
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
          nav.navigate('Events');
          break;
        case 'online_meeting':
          try {
            nav.navigate('OnlineMeetings');
          } catch (_) {
            try {
              nav.navigate('AdminRoot', { targetTab: 'Online Meetings' });
            } catch (e) {
              console.warn('Navigation to online meetings failed:', e);
            }
          }
          break;
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
          const liveUrl = (remoteMessage?.data && remoteMessage.data.url) || rawData?.url || 'https://www.youtube.com/@Brothersinchristfellowship/live';
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
      // Check permission first to prevent silent failures on fresh installs (especially iOS APNS)
      const authStatus = await messaging().hasPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
        
      if (!enabled) {
        console.log(`⚠️ Cannot subscribe to church_${churchId} yet: Permissions not granted.`);
        return;
      }

      const topicName = `church_${churchId}`;
      await messaging().subscribeToTopic(topicName);
      console.log(`📡 Subscribed to FCM topic: ${topicName}`);
    } catch (error) {
      console.error(`❌ Failed to subscribe to topic church_${churchId}:`, error);
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
      console.log('⚡ Foreground push received:', remoteMessage?.notification?.title);
      // Foreground notifications are cleanly displayed via the in-app sliding banner in App.js
      // System modal Alert.alert is suppressed to avoid duplicate intrusive popups
    });
  }
}

export default new NotificationService();
