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
import { useAdminTheme, createAdminThemedStyles } from '../utils/adminThemeHelper';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import {
  launchOnlineMeetingUrl,
  parseMeetingTimestamp,
  resolveMeetingStatus,
} from '../utils/meetingActions';
import { getInstantMemory, readInstantCache, writeInstantCache, makeScopedCacheKey } from '../utils/instantCache';

const SHOW_YOUTUBE_LIVE = false;

const { width } = Dimensions.get('window');
const BRAND = '#1a2d5a';
const LIVE_COLOR = '#ef4444';

export default function OnlineMeetingsScreen({ navigation }: any) {
  const { isDark: _adminIsDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const { activeChurch } = useChurch();
  const { user, member } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const { t } = useLanguage();
  const meetingsCacheKey = makeScopedCacheKey('online_meetings_v1', activeChurch?.id);
  const initialMeetingsCache = getInstantMemory<any[]>(meetingsCacheKey);

  const [meetings, setMeetings] = useState<any[]>(() => initialMeetingsCache || []);
  const [loading, setLoading] = useState(() => !initialMeetingsCache);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'completed'>('upcoming');
  const hasAutoSelectedTabRef = React.useRef(false);

  const fetchMeetings = async () => {
    if (!activeChurch?.id) return;
    try {
      const snapshot = await firestore()
        .collection('Rhema Church')
        .doc(activeChurch.id)
        .collection('online_meetings')
        .orderBy('startTime', 'desc')
        .limit(40)
        .get();

      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeetings(data);
      writeInstantCache(meetingsCacheKey, data).catch(() => { });
    } catch (error) {
      console.error('Error fetching meetings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!activeChurch?.id) {
      setLoading(false);
      return;
    }

    let isActive = true;
    const memHit = getInstantMemory<any[]>(meetingsCacheKey);
    if (memHit?.length) {
      setMeetings(memHit);
      setLoading(false);
    } else {
      readInstantCache<any[]>(meetingsCacheKey).then((disk) => {
        if (isActive && disk?.data?.length) {
          setMeetings(disk.data);
          setLoading(false);
        }
      }).catch(() => { });
    }

    const unsubscribe = firestore()
      .collection('Rhema Church')
      .doc(activeChurch.id)
      .collection('online_meetings')
      .orderBy('startTime', 'desc')
      .limit(40)
      .onSnapshot(
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setMeetings(data);
          writeInstantCache(meetingsCacheKey, data).catch(() => { });
          if (!hasAutoSelectedTabRef.current) {
            hasAutoSelectedTabRef.current = true;
            const hasLive = data.some(m => resolveMeetingStatus(m, true) === 'live');
            if (hasLive) setActiveTab('live');
          }
          setLoading(false);
          setRefreshing(false);
        },
        (error) => {
          console.error('Error listening meetings:', error);
          fetchMeetings();
        }
      );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [activeChurch?.id, meetingsCacheKey]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMeetings();
  };

  const liveMeetings: any[] = [];
  const upcomingMeetings: any[] = [];
  const pastMeetings: any[] = [];

  meetings.forEach(m => {
    const status = resolveMeetingStatus(m, true);
    if (status === 'cancelled') return;
    if (status === 'live') liveMeetings.push(m);
    else if (status === 'completed') pastMeetings.push(m);
    else upcomingMeetings.push(m);
  });

  let displayList = upcomingMeetings;
  if (activeTab === 'live') displayList = liveMeetings;
  if (activeTab === 'completed') displayList = pastMeetings;

  const bg = screenBg;
  const cardBg = cardSurface;
  const textPrimary = primaryText;
  const textMuted = secondaryText;
  const border = adminBorderColor;

  const handleDirectJoin = async (item: any) => {
    const rawLink = item.meetingLink || item.meetingUrl || item.url || item.link || '';
    if (!rawLink || !String(rawLink).trim()) {
      navigation.navigate('OnlineMeetingDetail', { meeting: item });
      return;
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
        .catch(() => { });
    }

    try {
      const opened = await launchOnlineMeetingUrl(
        item,
        member?.name || user?.displayName || 'Church Member'
      );
      if (!opened) {
        navigation.navigate('OnlineMeetingDetail', { meeting: item });
      }
    } catch {
      navigation.navigate('OnlineMeetingDetail', { meeting: item });
    }
  };

  const renderMeeting = ({ item }: { item: any }) => {
    const startDt = parseMeetingTimestamp(item.startTime);
    const endDt = parseMeetingTimestamp(item.endTime);
    const status = resolveMeetingStatus(item, true);
    const isLive = status === 'live';
    const isCompleted = status === 'completed';

    // App brand colors per status
    const gradStart = isLive ? '#b91c1c' : isCompleted ? '#374151' : '#1a2d5a';
    const gradEnd = isLive ? '#7f1d1d' : isCompleted ? '#1f2937' : '#0f1e3d';

    const dateStr = startDt
      ? startDt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : item.date || 'TBA';
    const timeStr = startDt && endDt
      ? `${startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : startDt
        ? startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : item.startTimeLabel || 'TBA';

    const subtitleText = String(item.topic || item.subtitle || '').trim();
    const bookText = String(item.bibleBook || '').trim();
    const showBookRow = Boolean(bookText && bookText !== subtitleText);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => navigation.navigate('OnlineMeetingDetail', { meeting: item })}
      >
        <View style={[styles.gradCard, { backgroundColor: gradStart }]}>
          {/* Decorative circle */}
          <View style={[styles.gradCircle, { backgroundColor: gradEnd }]} />

          {/* Platform Badge + Status Pill + Passcode */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6, flexWrap: 'wrap' }}>
            {isLive ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80', marginRight: 5 }} />
                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>LIVE NOW</Text>
              </View>
            ) : isCompleted ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: '#E5E7EB', fontSize: 11, fontWeight: '700' }}>COMPLETED</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FBBF24' }}>
                <Text style={{ color: '#FDE68A', fontSize: 11, fontWeight: '800' }}>SCHEDULED</Text>
              </View>
            )}

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
          {subtitleText ? (
            <Text style={styles.gradSubtitle} numberOfLines={2}>
              {subtitleText}
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

          {showBookRow ? (
            <View style={styles.gradInfoRow}>
              <BookOpen size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.gradInfoText} numberOfLines={1}>
                {bookText}
              </Text>
            </View>
          ) : null}

          {(item.teacher || item.teacherName) ? (
            <View style={styles.gradInfoRow}>
              <User size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.gradInfoText} numberOfLines={1}>
                {t('meetings.hostPrefix')} {item.teacher || item.teacherName}
              </Text>
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={[styles.gradActions, { flexWrap: 'wrap', gap: 8, alignItems: 'center' }]}>
            {isLive ? (
              <>
                <TouchableOpacity
                  style={styles.gradJoinBtn}
                  onPress={() => handleDirectJoin(item)}
                  activeOpacity={0.85}
                >
                  <Video size={15} color={gradStart} />
                  <Text style={[styles.gradJoinText, { color: gradStart }]}>
                    {t('meetings.joinLive')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.gradLeaveBtn}
                  onPress={() => navigation.navigate('OnlineMeetingDetail', { meeting: item })}
                >
                  <Text style={styles.gradLeaveText}>{t('meetings.details')}</Text>
                </TouchableOpacity>
              </>
            ) : !isCompleted ? (
              <>
                <TouchableOpacity
                  style={styles.gradLeaveBtn}
                  onPress={() => navigation.navigate('OnlineMeetingDetail', { meeting: item })}
                >
                  <Text style={styles.gradLeaveText}>View Details</Text>
                </TouchableOpacity>

                <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '600', marginLeft: 2 }}>
                  Starts when host goes live
                </Text>
              </>
            ) : null}
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

      {/* ── Screen Header ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
          }
        ]}
      >
        <TouchableOpacity
          style={styles.circularBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          {t('meetings.title')}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      {/* Tab bar — pill style */}
      <View style={[styles.tabBar, { backgroundColor: cardBg, borderColor: isDark ? border : '#000000', borderWidth: 1 }]}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && { backgroundColor: primaryText }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[styles.tabLabel, { color: isActive ? (isDark ? '#000000' : '#FFFFFF') : textMuted }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}
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
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: { flex: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1.2,
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
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

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 150 },
  emptyTitle: { width: '100%', fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center', alignSelf: 'center' },
  emptySubtitle: { width: '100%', fontSize: 14, textAlign: 'center', lineHeight: 20, alignSelf: 'center' },
}));



