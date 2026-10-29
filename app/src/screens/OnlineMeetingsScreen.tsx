import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  Video, 
  ArrowLeft,
  ChevronLeft,
  Calendar,
  Clock,
  User,
  BookOpen,
  Radio,
  CheckCircle,
  ChevronRight,
  Key,
} from 'lucide-react-native';
import firestore from '@react-native-firebase/firestore';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { openZoomMeeting } from '../utils/ZoomLauncher';

const SHOW_YOUTUBE_LIVE = false;

const { width } = Dimensions.get('window');
const BRAND = '#1a2d5a';
const LIVE_COLOR = '#ef4444';

export default function OnlineMeetingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { activeChurch } = useChurch();
  const { user, member } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();
  
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'completed'>('upcoming');

  const fetchMeetings = async () => {
    if (!activeChurch?.id) return;
    try {
      const snapshot = await firestore()
        .collection('Rhema Church')
        .doc(activeChurch.id)
        .collection('online_meetings')
        .orderBy('startTime', 'desc')
        .get();

      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeetings(data);
    } catch (error) {
      console.error('Error fetching meetings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [activeChurch?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMeetings();
  };

  const parseDate = (val: any) => {
    if (!val) return null;
    if (val.seconds) return new Date(val.seconds * 1000);
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    if (val instanceof Date) return val;
    return null;
  };

  const now = new Date();
  
  const liveMeetings: any[] = [];
  const upcomingMeetings: any[] = [];
  const pastMeetings: any[] = [];

  meetings.forEach(m => {
    if (m.status === 'cancelled') return;

    const startDt = parseDate(m.startTime);
    const endDt = parseDate(m.endTime);

    if (startDt && endDt) {
      if (endDt < now) {
        pastMeetings.push(m);
      } else if (startDt <= now && endDt >= now) {
        liveMeetings.push(m);
      } else {
        upcomingMeetings.push(m);
      }
    } else {
      if (m.status === 'live') liveMeetings.push(m);
      else if (m.status === 'past') pastMeetings.push(m);
      else upcomingMeetings.push(m);
    }
  });

  let displayList = upcomingMeetings;
  if (activeTab === 'live') displayList = liveMeetings;
  if (activeTab === 'completed') displayList = pastMeetings;

  const bg = isDark ? '#0f172a' : '#FAF7F2';
  const cardBg = isDark ? '#1e293b' : '#ffffff';
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? '#334155' : '#e2e8f0';
  const pillBg = isDark ? '#0f172a' : '#FAF7F2';

  const formatDate = (dt: Date) =>
    dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const formatTime = (dt: Date) =>
    dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleDirectJoin = async (item: any) => {
    const rawLink = item.meetingLink || item.meetingUrl || item.url || item.link || '';
    if (!rawLink || !rawLink.trim()) {
      navigation.navigate('OnlineMeetingDetail', { meeting: item });
      return;
    }

    let cleanUrl = rawLink.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const churchId = activeChurch?.id || item.churchId || member?.churchId;
    const attendeeId = user?.uid || member?.id;
    if (churchId && item.id && attendeeId) {
      firestore()
        .collection('Rhema Church')
        .doc(churchId)
        .collection('online_meetings')
        .doc(item.id)
        .collection('attendees')
        .doc(attendeeId)
        .set({
          name: member?.name || user?.displayName || 'Church Member',
          profilePhoto: (member as any)?.profilePhoto || (member as any)?.photoURL || user?.photoURL || null,
          joinedAt: firestore.FieldValue.serverTimestamp()
        }, { merge: true })
        .catch(() => {});
    }

    const isZoom = item.provider === 'zoom' || item.meetingType === 'zoom' || cleanUrl.includes('zoom.us');
    try {
      if (isZoom) {
        await openZoomMeeting({
          meetingLink: cleanUrl,
          meetingId: item.meetingId,
          password: item.password,
          userName: member?.name || user?.displayName || 'Church Member'
        });
      } else {
        const canOpen = await Linking.canOpenURL(cleanUrl).catch(() => true);
        if (canOpen) {
          await Linking.openURL(cleanUrl);
        } else {
          navigation.navigate('OnlineMeetingDetail', { meeting: item });
        }
      }
    } catch {
      navigation.navigate('OnlineMeetingDetail', { meeting: item });
    }
  };

  const renderMeeting = ({ item }: { item: any }) => {
    const startDt = parseDate(item.startTime);
    const endDt = parseDate(item.endTime);
    const isLive =
      activeTab === 'live' ||
      item.status === 'live' ||
      (startDt && endDt && startDt <= now && endDt >= now);
    const isCompleted = activeTab === 'completed';

    // App brand colors per status
    const gradStart = isLive ? '#c0392b' : isCompleted ? '#374151' : '#1a2d5a';
    const gradEnd   = isLive ? '#991b1b' : isCompleted ? '#1f2937' : '#0f1e3d';

    const dateStr = startDt ? startDt.toLocaleDateString('en-GB').replace(/\//g, '-') : 'TBA';
    const timeStr = startDt && endDt
      ? `${startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : startDt
      ? startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'TBA';

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => navigation.navigate('OnlineMeetingDetail', { meeting: item })}
      >
        <View style={[styles.gradCard, { backgroundColor: gradStart }]}>
          {/* Decorative circle */}
          <View style={[styles.gradCircle, { backgroundColor: gradEnd }]} />

          {/* Platform Badge & Passcode Badge & YouTube Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
            {item.meetingType === 'zoom' || item.provider === 'zoom' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(45, 140, 255, 0.35)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#2D8CFF' }}>
                <Video size={12} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>Zoom Meeting</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.35)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#10B981' }}>
                <Video size={12} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>Google Meet</Text>
              </View>
            )}
            {item.password ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(252, 211, 77, 0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FCD34D' }}>
                <Key size={11} color="#FCD34D" style={{ marginRight: 4 }} />
                <Text style={{ color: '#FCD34D', fontSize: 11, fontWeight: '700' }}>Passcode: {item.password}</Text>
              </View>
            ) : null}
            {SHOW_YOUTUBE_LIVE && item.youtubeLive?.enabled ? (
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                backgroundColor: item.youtubeLive.status === 'live' ? 'rgba(220, 38, 38, 0.5)' : 'rgba(239, 68, 68, 0.25)', 
                paddingHorizontal: 8, 
                paddingVertical: 3, 
                borderRadius: 6, 
                borderWidth: 1, 
                borderColor: '#EF4444' 
              }}>
                <Radio size={11} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>
                  {item.youtubeLive.status === 'live' ? '🔴 Live on YouTube' : 'YouTube Live'}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Title */}
          <Text style={styles.gradTitle} numberOfLines={2}>
            {item.title || t('meetings.onlineMeeting')}
          </Text>

          {/* Subtitle / Topic */}
          {(item.subtitle || item.topic || item.bibleBook) ? (
            <Text style={styles.gradSubtitle} numberOfLines={1}>
              {item.subtitle || item.topic || item.bibleBook}
            </Text>
          ) : null}

          {/* Divider */}
          <View style={styles.gradDivider} />

          {/* Info rows */}
          <View style={styles.gradInfoRow}>
            <Calendar size={16} color="rgba(255,255,255,0.75)" />
            <Text style={styles.gradInfoText}>{dateStr}</Text>
          </View>

          <View style={styles.gradInfoRow}>
            <Clock size={16} color="rgba(255,255,255,0.75)" />
            <Text style={styles.gradInfoText}>{timeStr}</Text>
          </View>

          {(item.subtitle || item.topic || item.bibleBook) && (
            <View style={styles.gradInfoRow}>
              <BookOpen size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.gradInfoText} numberOfLines={1}>
                {item.subtitle || item.topic || item.bibleBook}
              </Text>
            </View>
          )}

          {item.teacher && (
            <View style={styles.gradInfoRow}>
              <User size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.gradInfoText} numberOfLines={1}>
                {t('meetings.hostPrefix')} {item.teacher}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={[styles.gradActions, { flexWrap: 'wrap', gap: 8 }]}>
            <TouchableOpacity
              style={styles.gradJoinBtn}
              onPress={() => isLive ? handleDirectJoin(item) : navigation.navigate('OnlineMeetingDetail', { meeting: item })}
            >
              <Video size={15} color={gradStart} />
              <Text style={[styles.gradJoinText, { color: gradStart }]}>
                {isLive ? t('meetings.joinLive') : t('meetings.join')}
              </Text>
            </TouchableOpacity>

            {SHOW_YOUTUBE_LIVE && item.youtubeLive?.watchUrl ? (
              <TouchableOpacity
                style={[
                  styles.gradJoinBtn,
                  {
                    backgroundColor: item.youtubeLive.status === 'live' ? '#DC2626' : 'rgba(255, 255, 255, 0.2)',
                    borderColor: '#DC2626',
                  }
                ]}
                onPress={() => Linking.openURL(item.youtubeLive.watchUrl)}
              >
                <Radio size={14} color="#FFFFFF" />
                <Text style={[styles.gradJoinText, { color: '#FFFFFF', marginLeft: 4 }]}>
                  {item.youtubeLive.status === 'live' ? 'Watch on YouTube' : 'YouTube Live'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {isCompleted ? null : (
              <TouchableOpacity
                style={styles.gradLeaveBtn}
                onPress={() => navigation.navigate('OnlineMeetingDetail', { meeting: item })}
              >
                <Text style={styles.gradLeaveText}>{t('meetings.details')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const tabs: { key: 'live' | 'upcoming' | 'completed'; label: string; count: number; color: string }[] = [
    { key: 'live', label: t('meetings.tabs.live'), count: liveMeetings.length, color: LIVE_COLOR },
    { key: 'upcoming', label: t('meetings.tabs.upcoming'), count: upcomingMeetings.length, color: BRAND },
    { key: 'completed', label: t('meetings.tabs.completed'), count: pastMeetings.length, color: '#64748b' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={bg} />

      {/* Header */}
      <View
        style={[
          styles.headerCardWrapper,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 6 }
        ]}
      >
        <LinearGradient 
          colors={['#527C78', '#355B56']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerDecoCircle1} pointerEvents="none" />
          <View style={styles.headerDecoCircle2} pointerEvents="none" />

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#355B56" />
          </TouchableOpacity>
          
          <View style={styles.headerCenterTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {t('meetings.title')}
            </Text>
            <View style={styles.headerTitleAccentBar} />
          </View>

          <View style={styles.headerRightIconBadge}>
            <Video size={18} color="#355B56" />
          </View>
        </LinearGradient>
      </View>

      {/* Tab bar — pill style */}
      <View style={[styles.tabBar, { backgroundColor: cardBg, borderColor: border }]}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && { backgroundColor: tab.color }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, { color: isActive ? '#fff' : textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      ) : displayList.length === 0 ? (
        <View style={styles.center}>
          <Video size={52} color={textMuted} style={{ opacity: 0.35, marginBottom: 16 }} />
          <Text style={[styles.emptyTitle, { color: textPrimary }]}>
            {activeTab === 'live'
              ? t('meetings.empty.noLiveTitle')
              : activeTab === 'upcoming'
              ? t('meetings.empty.noUpcomingTitle')
              : t('meetings.empty.noCompletedTitle')}
          </Text>
          <Text style={[styles.emptySubtitle, { color: textMuted }]}>
            {activeTab === 'live'
              ? t('meetings.empty.noLiveSub')
              : activeTab === 'upcoming'
              ? t('meetings.empty.noUpcomingSub')
              : t('meetings.empty.noCompletedSub')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayList}
          keyExtractor={item => item.id}
          renderItem={renderMeeting}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

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
  headerRightIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  // Tab bar — pill style like screenshot
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
  },

  listContent: { paddingHorizontal: 20, paddingBottom: 100 },

  // Gradient card
  gradCard: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  gradCircle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -50,
    right: -40,
    opacity: 0.4,
  },
  gradTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 30,
    marginBottom: 4,
  },
  gradSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 14,
  },
  gradDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 16,
  },
  gradInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  gradInfoText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  gradActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  gradJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 24,
  },
  gradJoinText: {
    fontSize: 14,
    fontWeight: '800',
  },
  gradLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 24,
  },
  gradLeaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});



