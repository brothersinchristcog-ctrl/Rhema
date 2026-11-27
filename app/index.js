import './src/utils/FontSizeManager';
import { InteractionManager } from 'react-native';
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import NotificationService from './src/services/NotificationService';
import App from './App';

// Register notification channels/categories after initial UI frame renders
InteractionManager.runAfterInteractions(() => {
  NotificationService.setupCategoriesAndChannels().catch(() => {});
});

// Register background handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
  try {
    const data = remoteMessage?.data || {};
    // Only render via expo-notifications for data-only pushes; payloads that already carry
    // `remoteMessage.notification` are displayed natively by the OS to avoid duplicates.
    if (data.type === 'youtube_live' && !remoteMessage?.notification) {
      await NotificationService.setupCategoriesAndChannels();
      const title = data.pushTitle || data.title || '🔴 We Are LIVE Now!';
      const body = data.pushBody || data.body || "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!";
      await NotificationService.displayLiveNotification(data, title, body);
    } else if (data.type === 'CHURCH_CHAT' && !remoteMessage?.notification) {
      const { roomKeyManager } = require('./src/services/roomKeyManager');
      const title = data.notifTitle || data.roomTitle || data.senderName || 'Rhema Chat';
      const body = await roomKeyManager.decryptChatNotificationPreview(data);
      await NotificationService.displayChatNotification(title, body, data);
    }
  } catch (err) {
    console.warn('Background notification error:', err);
  }
});

registerRootComponent(App);
