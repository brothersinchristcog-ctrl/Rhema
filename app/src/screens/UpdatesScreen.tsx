import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator, Modal, PanResponder, Animated, Dimensions, Linking, Alert, Image, BackHandler, Clipboard, ToastAndroid } from 'react-native';
import { ChevronLeft, ArrowLeft, Bell, Calendar, Info, MessageCircle, AlertTriangle, X, Gift, Heart, Sparkles, Droplets, Trash2, Tv, BookOpen, Music, Mic , Video, Layers, UserCheck, Zap, HeartHandshake } from 'lucide-react-native';
import { openZoomMeeting } from '../utils/ZoomLauncher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import firestore, { 
  getFirestore, 
  collection, 
  query, 
  where,
  orderBy, 
  limit, 
  onSnapshot 
} from '@react-native-firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { formatDateDisplay } from '../utils/DateUtils';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
const VOLUNTEER_NOTIFICATION_TYPES = [
  'volunteer_application_admin',
  'volunteer_application_member',
  'volunteer_assignment',
  'volunteer_event_change',
  'volunteer_reminder',
];

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const { t } = useLanguage();
  const translateX = React.useRef(new Animated.Value(0)).current;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Claim the gesture if it's primarily horizontal and moving left-to-right
        const isHorizontal = Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
        return isHorizontal && gestureState.dx > 0;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
        return isHorizontal && gestureState.dx > 0;
      },
      onPanResponderGrant: () => {
        // Swipe starts - lock scroll or capture gesture
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          translateX.setValue(gestureState.dx);
        } else {
          translateX.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            tension: 40,
            friction: 7,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const opacity = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0.3, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.swipeBackdrop, { opacity }]}>
        <View style={styles.swipeBackdropContent}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.swipeBackdropTxt}>{t('updates.deleted')}</Text>
        </View>
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// Strip HTML tags from rich-text fields (e.g., promise content stored as HTML)
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '')        // remove tags
    .replace(/&nbsp;/g, ' ')        // decode &nbsp;
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')     // collapse excessive newlines
    .trim();
}

export default function UpdatesScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { highlightId, highlightType } = route?.params || {};
  const { t } = useLanguage();

  const getTypeName = (type: string) => {
    if (type === 'testimony_admin') return 'TESTIMONY REVIEW';
    if (type === 'testimony_published') return 'NEW TESTIMONY';
    if (type === 'testimony_member_status') return 'TESTIMONY UPDATE';
    if (type === 'baptism_request_admin' || type === 'baptism_request') return 'BAPTISM REQUEST';
    if (type === 'prayer_request_admin' || type === 'prayer_request' || type === 'prayer') return 'PRAYER REQUEST';
    if (type === 'baptism' || type === 'baptism_request_member') return 'BAPTISM';
    if (type === 'service_roster') return 'SERVICE ROSTER';
    if (type === 'service_assignment') return 'SERVICE ASSIGNMENT';
    if (type === 'service_responsibility_broadcast') return 'OPEN DUTY AVAILABLE';
    if (type === 'volunteer_application_admin') return 'VOLUNTEER APPLICATION';
    if (type === 'volunteer_application_member') return 'VOLUNTEER UPDATE';
    if (type === 'volunteer_assignment') return 'VOLUNTEER ASSIGNMENT';
    if (type === 'volunteer_event_change') return 'EVENT VOLUNTEER UPDATE';
    if (type === 'volunteer_reminder') return 'VOLUNTEER REMINDER';
    if (!type) return (t('updates.types.announcement') || 'ANNOUNCEMENT').toUpperCase();
    const trans = t(`updates.types.${type}`);
    return trans && trans !== `updates.types.${type}` ? trans.toUpperCase() : type.toUpperCase();
  };

  const [dynamicUpdates, setDynamicUpdates] = useState<any[]>([]);
  const [broadcastsList, setBroadcastsList] = useState<any[]>([]);
  const [churchNotifsList, setChurchNotifsList] = useState<any[]>([]);
  const [meetingsList, setMeetingsList] = useState<any[]>([]);
  const [memberNotifsList, setMemberNotifsList] = useState<any[]>([]);

  useEffect(() => {
    const combined = [...broadcastsList, ...churchNotifsList, ...meetingsList, ...memberNotifsList].sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
    const seenIds = new Set<string>();
    const seenVolunteerKeys = new Set<string>();
    const seenLiveStreams = new Set<string>();
    const deduplicated = combined.filter(item => {
      if (!item || !item.id) return false;
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);

      // Deduplicate identical volunteer alerts across notifications/broadcasts/member subcollection
      if (String(item.type || '').startsWith('volunteer_')) {
        const volKey = `${item.type}|${item.applicationId || item.eventId || ''}|${item.volunteerStatus || ''}|${item.title || ''}|${item.content || ''}`;
        if (seenVolunteerKeys.has(volKey)) {
          return false;
        }
        seenVolunteerKeys.add(volKey);
      }

      // Deduplicate live stream broadcasts so members only see the single latest active live alert
      if (item.type === 'youtube_live') {
        const streamKey = item.videoId || 'active_stream';
        if (seenLiveStreams.has(streamKey)) {
          return false;
        }
        seenLiveStreams.add(streamKey);
      }
      return true;
    });
    setDynamicUpdates(deduplicated);
  }, [broadcastsList, churchNotifsList, meetingsList, memberNotifsList]);
  const [selectedUpdate, setSelectedUpdate] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const adminRoleStr = `${member?.userType || ''} ${(member as any)?.role || ''}`.toUpperCase();
  const isAdmin = adminRoleStr.includes('ADMIN') || adminRoleStr.includes('SUPER') || adminRoleStr.includes('PASTOR');

  const handleBack = () => {
    if (selectedUpdate) {
      setSelectedUpdate(null);
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Tabs', { screen: 'Home' });
    }
  };

  useEffect(() => {
    const backAction = () => {
      if (selectedUpdate) {
        setSelectedUpdate(null);
        return true;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      } else {
        navigation.navigate('Tabs', { screen: 'Home' });
        return true;
      }
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [selectedUpdate, navigation]);

  useEffect(() => {
    const loadDeletedIds = async () => {
      try {
        const stored = await AsyncStorage.getItem('@deleted_notification_ids');
        if (stored) {
          setDeletedIds(JSON.parse(stored));
        }
      } catch (e) {
        console.warn('Error loading deleted notification IDs:', e);
      }
    };
    loadDeletedIds();
  }, []);

  const handleDeleteUpdate = async (id: string) => {
    try {
      const updated = [...deletedIds, id];
      setDeletedIds(updated);
      await AsyncStorage.setItem('@deleted_notification_ids', JSON.stringify(updated));
    } catch (e) {
      console.error('Error persisting deleted notification ID:', e);
    }
  };

  const parseUpdateDoc = (docId: string, data: any, churchToQuery: string, hasPendingWrite: boolean = false) => {
    if (!data) return null;

    // SECURITY: If broadcast is targeted to a specific church, skip it if not for this user's church
    if (data.targetChurchId && churchToQuery && data.targetChurchId !== churchToQuery) {
      return null;
    }

    // SECURITY: If broadcast is targeted to admin role, skip if current user is not admin
    if ((data.targetRole === 'admin' || data.type === 'baptism_request_admin' || data.type === 'prayer_request_admin' || data.type === 'testimony_admin' || data.type === 'volunteer_application_admin') && !isAdmin) {
      return null;
    }

    // SECURITY: If broadcast/notification is targeted to a specific user, skip it if not for this user
    const targetIdVal = data.targetMemberId || data.targetUid || data.recipientId;
    const isPhoneTargeted = data.targetPhone && typeof data.targetPhone === 'string' && data.targetPhone.trim().length > 0;
    const isIdTargeted = targetIdVal && typeof targetIdVal === 'string' && targetIdVal.trim().length > 0;

    if (isPhoneTargeted || isIdTargeted) {
      const uPhone = user?.phoneNumber || '';
      const mPhone = member?.phone || '';
      const uId = user?.uid || '';
      const mId = member?.id || '';

      const idMatch = isIdTargeted && (
        (uId && (data.targetMemberId === uId || data.targetUid === uId || data.recipientId === uId)) ||
        (mId && (data.targetMemberId === mId || data.targetUid === mId || data.recipientId === mId))
      );

      let phoneMatch = false;
      if (isPhoneTargeted) {
        const target = data.targetPhone.replace(/\D/g, '');
        phoneMatch = Boolean(
          (uPhone && uPhone.replace(/\D/g, '').endsWith(target)) ||
          (mPhone && mPhone.replace(/\D/g, '').endsWith(target)) ||
          (target.endsWith(uPhone.replace(/\D/g, '')) && uPhone.length > 5) ||
          (target.endsWith(mPhone.replace(/\D/g, '')) && mPhone.length > 5)
        );
      }

      if (!idMatch && !phoneMatch) {
        return null; // Skip if not targeted to current user
      }
    }

    // Determine icon, color and type classification
    let icon = Bell;
    let color = '#3b82f6';
    let resolvedType = data.type || 'announcement';

    if (data.type === 'online_meeting') {
      icon = Video;
      color = '#3b82f6';
      resolvedType = 'online_meeting';
    } else if (data.type === 'youtube_live' || data.type === 'live' || (data.title?.includes('🎥') && !data.title?.toLowerCase().includes('online meeting') && !data.title?.toLowerCase().includes('google meet') && !data.title?.toLowerCase().includes('zoom'))) {
      icon = Tv;
      color = '#ef4444';
      resolvedType = 'youtube_live';
    } else if (data.type === 'emergency' || data.title?.includes('🚨')) {
      icon = AlertTriangle;
      color = '#ef4444';
      resolvedType = 'emergency';
    } else if (
      data.type === 'quiz' ||
      data.type === 'quiz_scheduled' ||
      data.type === 'bible_quiz' ||
      data.screen === 'BibleQuizDetail' ||
      data.quizId ||
      data.title?.toLowerCase().includes('quiz') ||
      data.title?.includes('క్విజ్')
    ) {
      icon = BookOpen;
      color = '#1a2d5a';
      resolvedType = 'quiz';
    } else if (data.type === 'volunteer_application_admin') {
      icon = HeartHandshake;
      color = '#D97706';
      resolvedType = 'volunteer_application_admin';
    } else if (data.type === 'volunteer_application_member') {
      const volStatus = String(data.status || '').toLowerCase();
      const isDeclined = volStatus === 'rejected' || volStatus === 'declined';
      icon = isDeclined ? Bell : HeartHandshake;
      color = isDeclined ? '#DC2626' : '#059669';
      resolvedType = 'volunteer_application_member';
    } else if (data.type === 'volunteer_assignment') {
      icon = UserCheck;
      color = '#2563EB';
      resolvedType = 'volunteer_assignment';
    } else if (data.type === 'volunteer_event_change') {
      icon = Calendar;
      color = '#D97706';
      resolvedType = 'volunteer_event_change';
    } else if (data.type === 'volunteer_reminder') {
      icon = Bell;
      color = '#7C3AED';
      resolvedType = 'volunteer_reminder';
    } else if (data.type === 'event' || data.title?.includes('📅')) {
      icon = Calendar;
      color = '#10b981';
      resolvedType = 'event';
    } else if (data.type === 'service_roster' || data.title?.includes('Service Roster') || data.title?.includes('Roster Published')) {
      icon = Layers;
      color = '#059669';
      resolvedType = 'service_roster';
    } else if (data.type === 'service_assignment' || data.title?.includes('Service Assignment') || data.title?.includes('Ministry Responsibility')) {
      icon = UserCheck;
      color = '#2563EB';
      resolvedType = 'service_assignment';
    } else if (data.type === 'service_responsibility_broadcast' || data.title?.includes('Responsibility Available')) {
      icon = Zap;
      color = '#D97706';
      resolvedType = 'service_responsibility_broadcast';
    } else if (data.type === 'baptism_request_admin' || data.title?.includes('New Baptism Request')) {
      icon = Droplets;
      color = '#0284c7';
      resolvedType = 'baptism_request_admin';
    } else if (data.type === 'prayer_request_admin' || data.title?.includes('New Prayer Request')) {
      icon = Heart;
      color = '#7C3AED';
      resolvedType = 'prayer_request_admin';
    } else if (
      data.type === 'prayer_request_member' || 
      data.title?.includes('Prayer Request Approved') || 
      data.title?.includes('Pastoral Prayer Response')
    ) {
      icon = Heart;
      color = '#7C3AED';
      resolvedType = 'prayer_request_member';
    } else if (
      data.type === 'baptism_request_member' || 
      data.type === 'baptism_request' || 
      data.title?.includes('Baptism Request Update') || 
      data.title?.includes('Baptism Request Approved')
    ) {
      icon = Droplets;
      color = '#0284c7';
      resolvedType = 'baptism';
    } else if (data.title?.includes('🎂') || data.content?.includes('Birthday') || data.type === 'birthday') {
      icon = Gift;
      color = '#d97706';
      resolvedType = 'birthday';
    } else if (data.title?.includes('🎉') || data.title?.includes('🕊️') || data.content?.includes('Baptism') || data.title?.includes('Baptism') || data.type === 'baptism' || data.type === 'celebration') {
      icon = Sparkles;
      color = '#3b82f6';
      resolvedType = 'celebration';
    } else if (data.type === 'testimony_admin' || data.title?.includes('New Testimony Submitted')) {
      icon = Sparkles;
      color = '#8B5CF6';
      resolvedType = 'testimony_admin';
    } else if (data.type === 'testimony_published' || data.title?.includes('New Testimony Shared')) {
      icon = Sparkles;
      color = '#10B981';
      resolvedType = 'testimony_published';
    } else if (data.type === 'testimony_member_status' || data.title?.includes('Testimony Approved') || data.title?.includes('Testimony Review')) {
      icon = Sparkles;
      color = '#3B82F6';
      resolvedType = 'testimony_member_status';
    } else if (data.title?.includes('💐') || data.content?.includes('Anniversary') || data.title?.includes('Anniversary') || data.type === 'anniversary') {
      icon = Heart;
      color = '#be185d';
      resolvedType = 'anniversary';
    } else if (data.type === 'promise' || data.title?.includes('Promise') || data.title?.includes('వాగ్దానం')) {
      icon = BookOpen;
      color = '#8b5cf6';
      resolvedType = 'promise';
    } else if (data.type === 'song' || data.title?.includes('Song') || data.title?.includes('🎵')) {
      icon = Music;
      color = '#ec4899';
      resolvedType = 'song';
    } else if (data.type === 'sermon' || data.title?.includes('Sermon') || data.title?.includes('Message')) {
      icon = Mic;
      color = '#6366f1';
      resolvedType = 'sermon';
    }

    let dateStr = '';
    
    // Extract and format exact publication date & time from createdAt
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      const dt = data.createdAt.toDate();
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const dFormatted = `${d}-${m}-${y}`;
      const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      dateStr = `${dFormatted} • ${timeStr}`;
    } else if (typeof data.createdAt === 'number' || typeof data.createdAt === 'string') {
      const dt = new Date(data.createdAt);
      if (!isNaN(dt.getTime())) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const dFormatted = `${d}-${m}-${y}`;
        const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        dateStr = `${dFormatted} • ${timeStr}`;
      }
    }

    // Fallback if createdAt timestamp is not present: format raw date
    if (!dateStr) {
      const rawDate = data.date || data.serviceDate || new Date().toISOString().split('T')[0];
      dateStr = formatDateDisplay(rawDate);
    }

    let itemTitle = data.title || t('updates.announcement');
    let itemContent = stripHtml(data.content || data.body || '');

    if (resolvedType === 'youtube_live') {
      if (
        !itemTitle ||
        itemTitle.includes('LIVE on YouTube') ||
        itemTitle.includes('Rhema Global Ministries is LIVE') ||
        itemTitle.includes('🔴 Rhema')
      ) {
        itemTitle = '🔴 We Are LIVE Now!';
      }
      if (
        !itemContent ||
        itemContent.includes('Want to watch this again later') ||
        itemContent.includes('Sign in to add this') ||
        itemContent.includes('Tap to watch inside the app') ||
        itemContent.trim().toLowerCase() === 'youtube'
      ) {
        itemContent = "Join us for a time of worship, prayer and God's Word. Our live service is now streaming on YouTube. Be blessed!";
      }
    }

    return {
      id: docId,
      title: itemTitle,
      content: itemContent,
      date: dateStr,
      type: resolvedType,
      icon: icon,
      color: color,
      url: data.url || '',
      videoId: data.videoId || null,
      imageUrl: data.imageUrl || null,
      sermonId: data.sermonId || (resolvedType === 'sermon' && data.id && !String(data.id).startsWith('sermon_') ? data.id : null) || data.relatedId || (resolvedType === 'sermon' ? docId.replace(/^sermon_/, '') : null),
      relatedId: data.quizId || data.relatedId || null,
      testimonyId: data.testimonyId || data.relatedId || null,
      serviceId: data.serviceId || null,
      roleId: data.roleId || null,
      roleTitle: data.roleTitle || null,
      applicationId: data.applicationId || data.referenceId || null,
      eventId: data.eventId || null,
      volunteerType: data.volunteerType || null,
      volunteerStatus: data.status || null,
      churchId: data.churchId || null,
      rawDate: data.createdAt?.toMillis?.() || (typeof data.createdAt === 'number' ? data.createdAt : (hasPendingWrite ? Date.now() : 0))
    };
  };

  useEffect(() => {
    const churchToQuery = activeChurch?.id || member?.churchId;
    if (!churchToQuery) {
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const q = query(
      collection(db, 'Rhema Church', churchToQuery, 'broadcasts'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot) {
          const list = snapshot.docs
            .map(doc => parseUpdateDoc(doc.id, doc.data(), churchToQuery, Boolean((doc as any).metadata?.hasPendingWrites)))
            .filter(item => item !== null);
          setBroadcastsList(list);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching broadcasts:', error);
        setLoading(false);
      }
    );

    const qVolunteerNotifs = query(
      collection(db, 'Rhema Church', churchToQuery, 'notifications'),
      where('type', 'in', VOLUNTEER_NOTIFICATION_TYPES)
    );

    const unsubscribeChurchNotifs = onSnapshot(
      qVolunteerNotifs,
      (snapshot) => {
        if (snapshot) {
          const list = snapshot.docs
            .map(doc => parseUpdateDoc(doc.id, doc.data(), churchToQuery, Boolean((doc as any).metadata?.hasPendingWrites)))
            .filter(item => item !== null);
          setChurchNotifsList(list);
        }
      },
      (error) => {
        console.warn('Note: Volunteer notifications listener:', error);
      }
    );

    const currentMemberId = member?.id || user?.uid;
    let unsubscribeMemberNotifs = () => {};
    if (currentMemberId) {
      const qMemberNotifs = query(
        collection(db, 'Rhema Church', churchToQuery, 'members', currentMemberId, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      unsubscribeMemberNotifs = onSnapshot(
        qMemberNotifs,
        (snapshot) => {
          if (snapshot) {
            const list = snapshot.docs
              .map(doc => parseUpdateDoc(doc.id, doc.data(), churchToQuery, Boolean((doc as any).metadata?.hasPendingWrites)))
              .filter(item => item !== null);
            setMemberNotifsList(list);
          }
        },
        (error) => {
          console.warn('Note: Member notifications listener:', error);
        }
      );
    }

    const qMeetings = query(
      collection(db, 'Rhema Church', churchToQuery, 'online_meetings'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribeMeetings = onSnapshot(
      qMeetings,
      (snapshot) => {
        if (snapshot) {
          const list = snapshot.docs.map(doc => {
            const data = doc.data();
            let dateStr = new Date().toISOString().split('T')[0];
            if (data.startTime && typeof data.startTime.toDate === 'function') {
              const dt = data.startTime.toDate();
              dateStr = dt.toLocaleDateString() + ' • ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            }
            
            return {
              id: doc.id,
              title: t('updates.newOnlineMeeting'),
              content: `${data.title || ''} ${t('updates.meetingScheduled')}`.trim(),
              date: dateStr,
              type: 'online_meeting',
              icon: Video,
              color: '#3B82F6',
              url: data.meetingLink || '',
              rawDate: data.createdAt?.toMillis?.() || 0
            };
          });
          setMeetingsList(list);
        }
      },
      (error) => {
        console.error('Error fetching meetings:', error);
      }
    );

    return () => { unsubscribe(); unsubscribeChurchNotifs(); unsubscribeMeetings(); unsubscribeMemberNotifs(); };
  }, [activeChurch?.id, member?.churchId, user?.phoneNumber, member?.phone, member?.id, user?.uid, isAdmin]);
  const allUpdates = dynamicUpdates;
  const visibleUpdates = allUpdates.filter(update => !deletedIds.includes(update.id));

  // Reset hasAutoOpened whenever route params change to allow new notification clicks to pop up
  useEffect(() => {
    setHasAutoOpened(false);
  }, [highlightId, highlightType]);

  // Route-triggered Auto Popup Highlights
  useEffect(() => {
    if (hasAutoOpened) return;
    if (!highlightType) return; // nothing to do

    // If we have a specific broadcast ID, try to find it in the loaded updates
    if (highlightId && allUpdates.length > 0) {
      const match = allUpdates.find(u => u.id === highlightId);
      if (match) {
        setSelectedUpdate(match);
        setHasAutoOpened(true);
        return;
      }
    }

    // Fallback: show a temp card based on type (handles the case where allUpdates not loaded yet,
    // or the broadcast was targeted to another user so it won't appear in list)
    if (!loading) {
      if (highlightType === 'birthday') {
        setSelectedUpdate({
          id: 'temp-bd',
          title: t('updates.birthdayTitle'),
          content: t('updates.birthdayMessage'),
          date: t('updates.today'),
          type: 'birthday',
          color: '#d97706'
        });
        setHasAutoOpened(true);
      } else if (highlightType === 'anniversary') {
        setSelectedUpdate({
          id: 'temp-ann',
          title: t('updates.anniversaryTitle'),
          content: t('updates.anniversaryMessage'),
          date: t('updates.today'),
          type: 'anniversary',
          color: '#be185d'
        });
        setHasAutoOpened(true);
      } else if (highlightType === 'baptism' || highlightType === 'celebration') {
        setSelectedUpdate({
          id: 'temp-cel',
          title: t('updates.baptismTitle'),
          content: t('updates.baptismMessage'),
          date: t('updates.today'),
          type: 'celebration',
          color: '#3b82f6'
        });
        setHasAutoOpened(true);
      }
    }
  }, [highlightId, highlightType, allUpdates, hasAutoOpened, loading]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF7F2" />
      
      {/* ── Page Header Hero Card ── */}
            {/* ── Screen Header (Clean circular back button & title) ── */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8 }
        ]}
      >
        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => handleBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          {t('updates.title')}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {loading && visibleUpdates.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100 }}>
              <ActivityIndicator size="large" color="#f0b429" />
              <Text style={{ marginTop: 16, fontSize: 14, color: '#94a3b8' }}>{t('updates.loadingUpdates')}</Text>
            </View>
          ) : loading && visibleUpdates.length > 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#1a2d5a" />
              <Text style={styles.loadingTxt}>{t('updates.syncingAlerts')}</Text>
            </View>
          ) : null}

          {visibleUpdates.map((update) => (
            <SwipeableRow key={update.id} onDelete={() => handleDeleteUpdate(update.id)}>
              <TouchableOpacity 
                style={styles.updateCard}
                activeOpacity={0.7}
                onPress={() => {
                  if (update.type === 'song') {
                    navigation.navigate('Songs', { songId: update.relatedId });
                  } else if (update.type === 'promise') {
                    navigation.navigate('Tabs', { screen: 'Promise' });
                  } else if (update.type === 'sermon') {
                    const sId = update.sermonId || update.relatedId || (update.id && !update.id.startsWith('sermon_') ? update.id : null);
                    navigation.navigate('SermonVideo', { 
                      sermonId: sId,
                      sermonTitle: update.title,
                      title: update.title
                    });
                  } else if (
                    update.type === 'quiz' ||
                    update.type === 'quiz_scheduled' ||
                    update.type === 'bible_quiz' ||
                    update.screen === 'BibleQuizDetail' ||
                    update.quizId
                  ) {
                    const qId = update.quizId || update.relatedId || update.id;
                    navigation.navigate('BibleQuizDetail', { quizId: qId, churchId: update.churchId });
                  } else if (update.type === 'event') {
                    navigation.navigate('Events');
                  } else if (update.type === 'prayer_request_admin' || update.type === 'prayer_request' || update.type === 'prayer' || update.type === 'prayer_request_member') {
                    const pId = update.prayerId || update.requestId || update.id;
                    if (isAdmin && update.type !== 'prayer_request_member') {
                      navigation.navigate('AdminRoot', { targetTab: 'Prayers', prayerId: pId, requestId: pId, timestamp: Date.now() });
                    } else {
                      navigation.navigate('PrayerWall', { prayerId: pId });
                    }
                  } else if (update.type === 'attendance') {
                    navigation.navigate('AttendanceScreen');
                  } else if (update.type === 'testimony_admin') {
                    const tId = update.testimonyId || update.relatedId || update.id;
                    navigation.navigate('AdminRoot', {
                      targetTab: 'Testimonies',
                      testimonyId: tId,
                      timestamp: Date.now(),
                    });
                  } else if (update.type === 'testimony_published' || update.type === 'testimony_member_status' || update.type === 'testimony') {
                    const tId = update.testimonyId || update.relatedId || update.id;
                    if (tId) {
                      navigation.navigate('TestimonyDetail', {
                        testimonyId: tId,
                        churchId: update.churchId || activeChurch?.id || member?.churchId || 'rhema',
                      });
                    } else {
                      navigation.navigate('Testimonies', { initialTab: 'mine' });
                    }
                  } else {
                    setSelectedUpdate(update);
                  }
                }}
              >
                <View style={[styles.iconBox, { backgroundColor: update.color + '15' }]}>
                  <update.icon size={22} color={update.color} />
                </View>
                <View style={styles.updateInfo}>
                  <View style={styles.metaRow}>
                    <Text style={[styles.typeTag, { color: update.color }]}>{getTypeName(update.type)}</Text>
                    <Text style={styles.dateTxt}>{formatDateDisplay(update.date)}</Text>
                  </View>
                  <Text style={styles.updateTitle}>{update.title}</Text>
                  <Text style={styles.updateContent} numberOfLines={2}>{update.content}</Text>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          ))}

          {visibleUpdates.length === 0 && !loading && (
            <View style={styles.emptyContainer}>
              <Bell size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>{t('updates.allCaughtUp')}</Text>
              <Text style={styles.emptySubText}>{t('updates.emptySub')}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Visual Celebration & Details Modal ── */}
      <Modal
        visible={selectedUpdate !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedUpdate(null)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setSelectedUpdate(null)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[
              styles.modalCard,
              selectedUpdate?.type === 'birthday' && styles.modalCardBirthday,
              selectedUpdate?.type === 'anniversary' && styles.modalCardAnniversary,
              selectedUpdate?.type === 'celebration' && styles.modalCardCelebration,
              (selectedUpdate?.type === 'emergency' || selectedUpdate?.title?.includes('🚨')) && styles.modalCardEmergency
            ]}
          >
            {/* Modal Close Button */}
            <TouchableOpacity 
              style={[
                styles.modalCloseBtn,
                (selectedUpdate?.type === 'birthday' || selectedUpdate?.type === 'anniversary') && styles.modalCloseBtnGold
              ]} 
              onPress={() => setSelectedUpdate(null)}
            >
              <X size={20} color={
                selectedUpdate?.type === 'birthday' ? '#b45309' :
                selectedUpdate?.type === 'anniversary' ? '#be185d' : '#475569'
              } />
            </TouchableOpacity>

            {/* Modal Content */}
            {selectedUpdate?.type === 'birthday' ? (
              // --- 🎂 PREMIUM BIRTHDAY UI ---
              <View style={styles.celebrationContainer}>
                <View style={styles.balloonRow}>
                  <Text style={styles.emojiDecor}>🎈</Text>
                  <Text style={[styles.emojiDecor, { fontSize: 44, marginTop: -15 }]}>🎂</Text>
                  <Text style={styles.emojiDecor}>🎈</Text>
                </View>
                <Sparkles size={32} color="#f59e0b" style={styles.sparkleIcon} />
                <Text style={styles.celebrationTitleEn}>{t('updates.birthdayGreeting')}</Text>
                <Text style={styles.celebrationTitleTe}>{t('updates.birthdaySubGreeting')}</Text>
                <View style={styles.dividerGold} />
                
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.celebrationGreeting}>
                    {selectedUpdate?.content}
                  </Text>
                </ScrollView>

                <View style={styles.celebrationFooter}>
                  <Gift size={24} color="#b45309" />
                  <Text style={styles.footerBlessing}>{t('updates.birthdayBlessing')}</Text>
                </View>
              </View>
            ) : selectedUpdate?.type === 'anniversary' ? (
              // --- 💐 PREMIUM ANNIVERSARY UI ---
              <View style={styles.celebrationContainer}>
                <View style={styles.balloonRow}>
                  <Text style={styles.emojiDecor}>💖</Text>
                  <Text style={[styles.emojiDecor, { fontSize: 44, marginTop: -15 }]}>💐</Text>
                  <Text style={styles.emojiDecor}>💖</Text>
                </View>
                <Sparkles size={32} color="#be185d" style={styles.sparkleIcon} />
                <Text style={[styles.celebrationTitleEn, { color: '#be185d' }]}>{t('updates.anniversaryGreeting')}</Text>
                <Text style={[styles.celebrationTitleTe, { color: '#be185d' }]}>{t('updates.anniversarySubGreeting')}</Text>
                <View style={styles.dividerPink} />

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <Text style={[styles.celebrationGreeting, { color: '#85144b' }]}>
                    {selectedUpdate?.content}
                  </Text>
                </ScrollView>

                <View style={styles.celebrationFooter}>
                  <Heart size={24} color="#be185d" strokeWidth={2} />
                  <Text style={[styles.footerBlessing, { color: '#be185d' }]}>{t('updates.anniversaryBlessing')}</Text>
                </View>
              </View>
            ) : selectedUpdate?.type === 'celebration' ? (
              // --- 🎉 BAPTISM / CELEBRATION UI ---
              <View style={styles.celebrationContainer}>
                <View style={styles.balloonRow}>
                  <Text style={styles.emojiDecor}>🕊️</Text>
                  <Text style={[styles.emojiDecor, { fontSize: 44, marginTop: -15 }]}>🎉</Text>
                  <Text style={styles.emojiDecor}>🕊️</Text>
                </View>
                <Sparkles size={32} color="#3b82f6" style={styles.sparkleIcon} />
                <Text style={[styles.celebrationTitleEn, { color: '#3b82f6' }]}>{selectedUpdate?.title || t('updates.celebrationDefault')}</Text>
                <View style={styles.dividerBlue} />

                <ScrollView style={[styles.modalScroll, { maxHeight: 400 }]} showsVerticalScrollIndicator={false}>
                  {selectedUpdate?.imageUrl && (
                    <Image source={{ uri: selectedUpdate.imageUrl }} style={styles.modalImage} resizeMode="cover" />
                  )}
                  <Text style={[styles.celebrationGreeting, { color: '#1e3a8a' }]}>
                    {selectedUpdate?.content}
                  </Text>
                </ScrollView>

                <View style={[styles.celebrationFooter, { borderTopColor: '#3b82f6' }]}>
                  <Text style={[styles.footerBlessing, { color: '#1e3a8a' }]}>{t('updates.baptismBlessing')}</Text>
                </View>
              </View>
            ) : (
              // --- 🚨 STANDARD / EMERGENCY BROADCAST UI ---
              <View style={styles.standardModalContainer}>
                <View style={styles.standardModalHeader}>
                  <View style={[
                    styles.stdIconBox, 
                    (selectedUpdate?.type === 'emergency' || selectedUpdate?.title?.includes('🚨') || selectedUpdate?.type === 'youtube_live') && styles.stdIconBoxEmergency,
                    (selectedUpdate?.type === 'service_roster' || selectedUpdate?.type === 'volunteer_application_member') && { backgroundColor: '#ECFDF5' },
                    (selectedUpdate?.type === 'service_assignment' || selectedUpdate?.type === 'service_responsibility_broadcast' || selectedUpdate?.type === 'volunteer_assignment') && { backgroundColor: '#EFF6FF' },
                    (selectedUpdate?.type === 'volunteer_application_admin' || selectedUpdate?.type === 'volunteer_event_change') && { backgroundColor: '#FEF3C7' },
                    selectedUpdate?.type === 'volunteer_reminder' && { backgroundColor: '#F3E8FF' }
                  ]}>
                    {selectedUpdate?.type === 'emergency' || selectedUpdate?.title?.includes('🚨') ? (
                      <AlertTriangle size={24} color="#ef4444" />
                    ) : selectedUpdate?.type === 'youtube_live' ? (
                      <Tv size={24} color="#ef4444" />
                    ) : selectedUpdate?.type === 'service_roster' ? (
                      <Layers size={24} color="#059669" />
                    ) : selectedUpdate?.type === 'service_assignment' || selectedUpdate?.type === 'volunteer_assignment' ? (
                      <UserCheck size={24} color="#2563EB" />
                    ) : selectedUpdate?.type === 'service_responsibility_broadcast' ? (
                      <Zap size={24} color="#D97706" />
                    ) : selectedUpdate?.type === 'volunteer_application_admin' || selectedUpdate?.type === 'volunteer_application_member' ? (
                      <HeartHandshake size={24} color={selectedUpdate?.color || '#059669'} />
                    ) : selectedUpdate?.type === 'volunteer_event_change' ? (
                      <Calendar size={24} color="#D97706" />
                    ) : (
                      <Bell size={24} color={selectedUpdate?.color || '#1a2d5a'} />
                    )}
                  </View>
                  <View style={styles.stdHeaderMeta}>
                    <Text style={[
                      styles.stdTypeTag,
                      (selectedUpdate?.type === 'emergency' || selectedUpdate?.title?.includes('🚨') || selectedUpdate?.type === 'youtube_live') && { color: '#ef4444' },
                      selectedUpdate?.type === 'service_roster' && { color: '#059669' },
                      (selectedUpdate?.type === 'service_assignment' || selectedUpdate?.type === 'service_responsibility_broadcast') && { color: '#2563EB' },
                      selectedUpdate?.type?.startsWith('volunteer_') && { color: selectedUpdate?.color || '#059669' }
                    ]}>
                      {getTypeName(selectedUpdate?.type || 'announcement')}
                    </Text>
                    <Text style={styles.stdDateTxt}>{selectedUpdate?.date}</Text>
                  </View>
                </View>

                <Text style={[
                  styles.stdModalTitle,
                  (selectedUpdate?.type === 'emergency' || selectedUpdate?.title?.includes('🚨') || selectedUpdate?.type === 'youtube_live') && { color: '#b91c1c' }
                ]}>
                  {selectedUpdate?.title}
                </Text>

                <View style={styles.dividerStd} />

                <ScrollView style={[styles.modalScroll, { maxHeight: 400 }]} showsVerticalScrollIndicator={false}>
                  {selectedUpdate?.imageUrl && (
                    <Image source={{ uri: selectedUpdate.imageUrl }} style={styles.modalImage} resizeMode="cover" />
                  )}
                  <Text style={styles.stdModalContent}>
                    {selectedUpdate?.content}
                  </Text>
                </ScrollView>

                {selectedUpdate?.type === 'youtube_live' && (
                  <TouchableOpacity
                    style={styles.joinLiveBtn}
                    onPress={() => {
                    let liveUrl = selectedUpdate?.url || activeChurch?.socialLinks?.youtube;
                    if (liveUrl) {
                      let base = liveUrl.split('?')[0];
                      if (base.includes('@') && !base.includes('/live') && !base.includes('/streams')) {
                        base = base.endsWith('/') ? `${base}live` : `${base}/live`;
                      }
                      setSelectedUpdate(null);
                      navigation.navigate('YouTubeLive', {
                        url: base,
                        videoId: selectedUpdate?.videoId,
                        title: selectedUpdate?.title,
                      });
                    } else {
                      Alert.alert(t('updates.alerts.notConfiguredTitle'), t('updates.alerts.notConfiguredMsg'));
                    }
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>📺 {t('updates.joinLiveStream')}</Text>
                  </TouchableOpacity>
                )}

                {selectedUpdate?.type === 'sermon' && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#6366f1' }]}
                    onPress={() => {
                      const sId = selectedUpdate?.sermonId || selectedUpdate?.relatedId || (selectedUpdate?.id && !selectedUpdate?.id.startsWith('sermon_') ? selectedUpdate?.id : null);
                      setSelectedUpdate(null);
                      navigation.navigate('SermonVideo', { 
                        sermonId: sId,
                        sermonTitle: selectedUpdate?.title,
                        title: selectedUpdate?.title
                      });
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>🎧 Watch Sermon Video</Text>
                  </TouchableOpacity>
                )}

                {(selectedUpdate?.type === 'quiz' || selectedUpdate?.type === 'bible_quiz') && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#1a2d5a' }]}
                    onPress={() => {
                      const qId = selectedUpdate?.relatedId || selectedUpdate?.id;
                      const cId = selectedUpdate?.churchId;
                      setSelectedUpdate(null);
                      navigation.navigate('BibleQuizDetail', { quizId: qId, churchId: cId });
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>📖 Play Bible Quiz Now</Text>
                  </TouchableOpacity>
                )}

                {(selectedUpdate?.type === 'baptism_request_admin' || selectedUpdate?.type === 'baptism_request' || selectedUpdate?.type === 'baptism_request_member') && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#0284c7' }]}
                    onPress={() => {
                      const reqId = selectedUpdate?.requestId || selectedUpdate?.id;
                      setSelectedUpdate(null);
                      if (isAdmin) {
                        navigation.navigate('AdminRoot', { targetTab: 'Baptism', requestId: reqId });
                      } else {
                        navigation.navigate('BaptismRequest', { requestId: reqId });
                      }
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>💧 {isAdmin ? 'Review Baptism Request' : 'View My Baptism Request'}</Text>
                  </TouchableOpacity>
                )}

                {(selectedUpdate?.type === 'prayer_request_admin' || selectedUpdate?.type === 'prayer_request' || selectedUpdate?.type === 'prayer') && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#7C3AED' }]}
                    onPress={() => {
                      const pId = selectedUpdate?.prayerId || selectedUpdate?.requestId || selectedUpdate?.id;
                      setSelectedUpdate(null);
                      if (isAdmin) {
                        navigation.navigate('AdminRoot', { targetTab: 'Prayers', prayerId: pId, requestId: pId, timestamp: Date.now() });
                      } else {
                        navigation.navigate('PrayerWall');
                      }
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>🙏 {isAdmin ? 'Open & Review Prayer Request' : 'View Prayer Wall'}</Text>
                  </TouchableOpacity>
                )}

                {selectedUpdate?.type === 'testimony_admin' && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#8B5CF6' }]}
                    onPress={() => {
                      const tId = selectedUpdate?.testimonyId || selectedUpdate?.relatedId || selectedUpdate?.id;
                      setSelectedUpdate(null);
                      navigation.navigate('AdminRoot', {
                        targetTab: 'Testimonies',
                        testimonyId: tId,
                        timestamp: Date.now(),
                      });
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>✨ Review Testimony</Text>
                  </TouchableOpacity>
                )}

                {(selectedUpdate?.type === 'testimony_published' || selectedUpdate?.type === 'testimony_member_status') && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => {
                      const tId = selectedUpdate?.testimonyId || selectedUpdate?.relatedId || selectedUpdate?.id;
                      setSelectedUpdate(null);
                      if (tId) {
                        navigation.navigate('TestimonyDetail', {
                          testimonyId: tId,
                          churchId: selectedUpdate?.churchId || activeChurch?.id || member?.churchId || 'rhema',
                        });
                      } else {
                        navigation.navigate('Testimonies', { initialTab: 'mine' });
                      }
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>✨ View Testimony</Text>
                  </TouchableOpacity>
                )}

                {selectedUpdate?.type === 'service_roster' && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#059669', marginTop: 16 }]}
                    onPress={() => {
                      const sId = selectedUpdate?.serviceId;
                      setSelectedUpdate(null);
                      navigation.navigate('MyService', {
                        serviceId: sId,
                        initialTab: 'roster'
                      });
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>📋 View Service Roster & Order</Text>
                  </TouchableOpacity>
                )}

                {(selectedUpdate?.type === 'service_assignment' || selectedUpdate?.type === 'service_responsibility_broadcast') && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#2563EB', marginTop: 16 }]}
                    onPress={() => {
                      const sId = selectedUpdate?.serviceId;
                      setSelectedUpdate(null);
                      navigation.navigate('MyService', {
                        serviceId: sId,
                        initialTab: 'responsibilities'
                      });
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>⚡ View Duties & Respond</Text>
                  </TouchableOpacity>
                )}

                {selectedUpdate?.type === 'volunteer_application_admin' && (
                  <TouchableOpacity
                    style={[styles.joinLiveBtn, { backgroundColor: '#D97706', marginTop: 16 }]}
                    onPress={() => {
                      const appId = selectedUpdate?.applicationId || selectedUpdate?.relatedId || selectedUpdate?.id;
                      const subType = selectedUpdate?.volunteerType || 'general';
                      setSelectedUpdate(null);
                      navigation.navigate('AdminRoot', {
                        targetTab: 'Volunteer Management',
                        applicationId: appId,
                        subType,
                        timestamp: Date.now(),
                      });
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>🤝 Review Volunteer Application</Text>
                  </TouchableOpacity>
                )}

                {(selectedUpdate?.type === 'volunteer_application_member' ||
                  selectedUpdate?.type === 'volunteer_assignment' ||
                  selectedUpdate?.type === 'volunteer_event_change' ||
                  selectedUpdate?.type === 'volunteer_reminder') && (
                  <TouchableOpacity
                    style={[
                      styles.joinLiveBtn,
                      {
                        backgroundColor:
                          selectedUpdate?.volunteerStatus === 'rejected' || selectedUpdate?.volunteerStatus === 'declined'
                            ? '#475569'
                            : selectedUpdate?.type === 'volunteer_assignment'
                            ? '#2563EB'
                            : '#059669',
                        marginTop: 16,
                      },
                    ]}
                    onPress={() => {
                      const evId = selectedUpdate?.eventId;
                      setSelectedUpdate(null);
                      if (evId) {
                        navigation.navigate('EventDetails', { eventId: evId, id: evId });
                      } else {
                        navigation.navigate('Volunteer');
                      }
                    }}
                  >
                    <Text style={styles.joinLiveBtnTxt}>
                      {selectedUpdate?.eventId ? '📅 View Event Volunteer Details' : '🤝 Open Volunteer Portal'}
                    </Text>
                  </TouchableOpacity>
                )}

                {selectedUpdate?.type === 'online_meeting' && (
                  <View style={{ marginTop: 14 }}>
                    {selectedUpdate?.password ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F1F5F9', padding: 10, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#CBD5E1' }}>
                        <Text style={{ fontSize: 13, color: '#1E293B', fontWeight: '600' }}>
                          🔑 Passcode: <Text style={{ color: '#2563EB', fontWeight: '800' }}>{selectedUpdate.password}</Text>
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            Clipboard.setString(selectedUpdate.password);
                            if (Platform.OS === 'android') {
                              ToastAndroid.show(`Passcode copied: ${selectedUpdate.password}`, ToastAndroid.SHORT);
                            }
                          }}
                          style={{ backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}
                        >
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Copy</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.joinLiveBtn, { backgroundColor: '#10B981' }]}
                      onPress={async () => {
                        const rawLink = selectedUpdate.url || selectedUpdate.meetingLink || selectedUpdate.link || '';
                        const pwd = selectedUpdate.password || '';
                        setSelectedUpdate(null);

                        if (!rawLink || !rawLink.trim()) {
                          Alert.alert('No Meeting Link', 'Meeting link is not available.');
                          return;
                        }

                        let cleanUrl = rawLink.trim();
                        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
                          cleanUrl = `https://${cleanUrl}`;
                        }

                        const churchId = activeChurch?.id || selectedUpdate.churchId || member?.churchId;
                        const attendeeId = user?.uid || member?.id;
                        if (churchId && selectedUpdate.meetingId && attendeeId) {
                          firestore()
                            .collection('Rhema Church')
                            .doc(churchId)
                            .collection('online_meetings')
                            .doc(selectedUpdate.meetingId)
                            .collection('attendees')
                            .doc(attendeeId)
                            .set({
                              name: member?.name || user?.displayName || 'Church Member',
                              profilePhoto: (member as any)?.profilePhoto || (member as any)?.photoURL || user?.photoURL || null,
                              joinedAt: firestore.FieldValue.serverTimestamp()
                            }, { merge: true })
                            .catch(() => {});
                        }

                        const isZoom = cleanUrl.includes('zoom.us') || selectedUpdate.provider === 'zoom' || selectedUpdate.meetingType === 'zoom';
                        try {
                          if (isZoom) {
                            await openZoomMeeting({
                              meetingLink: cleanUrl,
                              meetingId: selectedUpdate.meetingId,
                              password: pwd,
                              userName: (member?.name || user?.displayName) || undefined
                            });
                          } else {
                            const canOpen = await Linking.canOpenURL(cleanUrl).catch(() => true);
                            if (canOpen) {
                              await Linking.openURL(cleanUrl);
                            } else {
                              Alert.alert('Error', `Cannot open meeting link: ${cleanUrl}`);
                            }
                          }
                        } catch (err) {
                          console.error('Could not open meeting link', err);
                          Alert.alert('Error', 'Could not open meeting link. Please make sure Google Meet or a browser is installed.');
                        }
                      }}
                    >
                      <Text style={styles.joinLiveBtnTxt}>🎥 ● Join Live Stream</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F2' },
    headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  circularBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 44,
    height: 44,
  },
  headerCardWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(228, 238, 234, 0.25)',
  },
  headerDecoCircle1: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(228, 238, 234, 0.10)',
    top: -50,
    right: -25,
  },
  headerDecoCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(228, 238, 234, 0.08)',
    bottom: -40,
    left: 35,
  },
  headerCenterTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  badgeCircle: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#355B56',
  },
  headerBadgeTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  headerTitleAccentBar: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E4EEEA',
    marginTop: 5,
    opacity: 0.85,
  },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500' },
  
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },
  
  loadingBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  loadingTxt: { fontSize: 12, color: '#475569', fontWeight: '500' },

  updateCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  updateInfo: { flex: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typeTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  dateTxt: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  updateTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  updateContent: { fontSize: 13, color: '#475569', lineHeight: 20 },

  // Interactive Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    maxHeight: '80%',
    padding: 24,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    position: 'relative'
  },
  modalCardBirthday: {
    backgroundColor: '#fffdf5',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
  },
  modalCardAnniversary: {
    backgroundColor: '#fffbfd',
    borderWidth: 1.5,
    borderColor: '#fda4af',
  },
  modalCardCelebration: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1.5,
    borderColor: '#3b82f6',
  },
  modalCardEmergency: {
    borderLeftWidth: 6,
    borderLeftColor: '#ef4444',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  modalCloseBtnGold: {
    backgroundColor: '#fef3c7',
  },
  // Birthday & Anniversary Styles
  celebrationContainer: {
    alignItems: 'center',
    paddingTop: 10
  },
  balloonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 10
  },
  emojiDecor: {
    fontSize: 32,
  },
  sparkleIcon: {
    marginBottom: 8
  },
  celebrationTitleEn: {
    fontSize: 20,
    fontWeight: '800',
    color: '#b45309',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif'
  },
  celebrationTitleTe: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b45309',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic'
  },
  dividerGold: {
    height: 2,
    backgroundColor: '#f59e0b',
    width: 80,
    marginVertical: 16,
    borderRadius: 1
  },
  dividerPink: {
    height: 2,
    backgroundColor: '#fda4af',
    width: 80,
    marginVertical: 16,
    borderRadius: 1
  },
  dividerBlue: {
    height: 2,
    backgroundColor: '#3b82f6',
    width: 80,
    marginVertical: 16,
    borderRadius: 1
  },
  modalScroll: {
    width: '100%',
    maxHeight: 400,
    marginVertical: 10
  },
  modalImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  celebrationGreeting: {
    fontSize: 14,
    color: '#78350f',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '600',
    paddingHorizontal: 8
  },
  celebrationFooter: {
    marginTop: 20,
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#f59e0b',
    paddingTop: 16,
    width: '100%'
  },
  footerBlessing: {
    fontSize: 11,
    color: '#78350f',
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center'
  },
  // Standard Modal Styles
  standardModalContainer: {
    paddingTop: 8
  },
  standardModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16
  },
  stdIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  stdIconBoxEmergency: {
    backgroundColor: '#fee2e2',
  },
  stdHeaderMeta: {
    flex: 1
  },
  stdTypeTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1a2d5a',
    letterSpacing: 0.5
  },
  stdDateTxt: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  stdModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    lineHeight: 24,
    marginBottom: 12
  },
  dividerStd: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 12
  },
  stdModalContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22
  },
  // Swipe to Delete Styles
  swipeContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#ef4444'
  },
  swipeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    paddingLeft: 24,
    borderRadius: 16
  },
  swipeBackdropContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  swipeBackdropTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5
  },
  // Empty State Styles
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#334155',
    marginTop: 12,
    marginBottom: 6
  },
  emptySubText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18
  },
  // YouTube Live Join Button
  joinLiveBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16
  },
  joinLiveBtnTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5
  }
});
