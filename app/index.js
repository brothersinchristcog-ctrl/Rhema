import './src/utils/FontSizeManager';
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import NotificationService from './src/services/NotificationService';
import App from './App';

// Pre-register category & channel early
NotificationService.setupCategoriesAndChannels().catch(() => {});

// Register background handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
  try {
    const data = remoteMessage?.data || {};
    if (data.type === 'youtube_live') {
      await NotificationService.setupCategoriesAndChannels();
      const title = data.pushTitle || data.title || remoteMessage.notification?.title || '🔴 We Are LIVE Now!';
      const body = data.pushBody || data.body || remoteMessage.notification?.body || "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!";
      await NotificationService.displayLiveNotification(data, title, body);
    }
  } catch (err) {
    console.warn('Background notification error:', err);
  }
});

registerRootComponent(App);
