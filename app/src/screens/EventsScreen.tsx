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
  StatusBar,
  Platform,
  Alert,
  Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  ArrowLeft, 
  MapPin, 
  CalendarCheck,
  Calendar,
  Clock,
  Play,
  ChevronRight
} from 'lucide-react-native';
import FirestoreService, { ScheduleEvent } from '../services/FirestoreService';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

const { width } = Dimensions.get('window');

export default function EventsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useTheme();
  const { t } = useLanguage();
  const [upcomingEvents, setUpcomingEvents] = useState<ScheduleEvent[]>([]);
  const [pastEvents, setPastEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'thisWeek' | 'upcoming' | 'past'>('upcoming');

  const parseEventDateObj = (dateStr?: string | any): Date | null => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
    if (dateStr?.toDate && typeof dateStr.toDate === 'function') {
      try {
        const d = dateStr.toDate();
        if (!isNaN(d.getTime())) return d;
      } catch {}
    }
    if (typeof dateStr === 'number') {
      const d = new Date(dateStr > 1e11 ? dateStr : dateStr * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof dateStr === 'string') {
      const clean = dateStr.trim();
      if (clean.includes('-')) {
        const parts = clean.split('-');
        if (parts[0].length === 4) {
          const y = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const d = Number(parts[2].split('T')[0]);
          const dateObj = new Date(y, m, d);
          if (!isNaN(dateObj.getTime())) return dateObj;
        } else if (parts[0].length <= 2 && parts[2] && parts[2].length >= 4) {
          const d = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const y = Number(parts[2].slice(0, 4));
          const dateObj = new Date(y, m, d);
          if (!isNaN(dateObj.getTime())) return dateObj;
        }
      }
      if (clean.includes('/')) {
        const parts = clean.split('/');
        if (parts[0].length === 4) {
          const y = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const d = Number(parts[2].split('T')[0]);
          const dateObj = new Date(y, m, d);
          if (!isNaN(dateObj.getTime())) return dateObj;
        } else if (parts[0].length <= 2 && parts[2] && parts[2].length >= 4) {
          const d = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const y = Number(parts[2].slice(0, 4));
          const dateObj = new Date(y, m, d);
          if (!isNaN(dateObj.getTime())) return dateObj;
        }
      }
      const parsed = new Date(clean);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  const isEventPast = (ev: ScheduleEvent): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawEndDate = ev.endDate || ev.date || (ev as any).startDate || (ev as any).eventDate;
    const parsedEndDate = parseEventDateObj(rawEndDate);
    if (!parsedEndDate) return true; // Undated events are not considered upcoming

    const eventDayMidnight = new Date(parsedEndDate);
    eventDayMidnight.setHours(0, 0, 0, 0);

    // If event end date is earlier than today, it has strictly ended
    if (eventDayMidnight.getTime() < today.getTime()) {
      return true;
    }

    // If event end date is in future days, it is upcoming
    if (eventDayMidnight.getTime() > today.getTime()) {
      return false;
    }

    // Event is TODAY: check time
    const timeToCompare = ev.endTime || ev.time || ev.startTime;
    if (!timeToCompare) {
      return false; // Still active/upcoming today
    }

    try {
      let hour = 0;
      let min = 0;
      if (timeToCompare.includes('T')) {
        const t = new Date(timeToCompare);
        hour = t.getHours();
        min = t.getMinutes();
      } else if (timeToCompare.includes(':')) {
        const cleanTime = timeToCompare.toUpperCase().replace(/\s+/g, '');
        const isPM = cleanTime.includes('PM');
        const isAM = cleanTime.includes('AM');
        const timePart = cleanTime.replace('AM', '').replace('PM', '');
        const parts = timePart.split(':');
        hour = parseInt(parts[0], 10) || 0;
        min = parseInt(parts[1], 10) || 0;
        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
      }
      const now = new Date();
      if (hour < now.getHours() || (hour === now.getHours() && min < now.getMinutes())) {
        return true; // Already ended earlier today
      }
      return false;
    } catch {
      return false;
    }
  };

  const processAndSetEvents = (allEvents: ScheduleEvent[]) => {
    const upcoming: ScheduleEvent[] = [];
    const past: ScheduleEvent[] = [];

    const seenIds = new Set<string>();
    (allEvents || []).forEach(ev => {
      const id = ev.id || (ev as any).eventId || Math.random().toString();
      if (seenIds.has(id)) return;
      seenIds.add(id);

      if (isEventPast(ev)) {
        past.push(ev);
      } else {
        upcoming.push(ev);
      }
    });

    // Upcoming: soonest first
    upcoming.sort((a, b) => {
      const da = parseEventDateObj(a.date || (a as any).startDate)?.getTime() || 0;
      const db = parseEventDateObj(b.date || (b as any).startDate)?.getTime() || 0;
      return da - db;
    });

    // Past: most recent first
    past.sort((a, b) => {
      const da = parseEventDateObj(a.endDate || a.date || (a as any).startDate)?.getTime() || 0;
      const db = parseEventDateObj(b.endDate || b.date || (b as any).startDate)?.getTime() || 0;
      return db - da;
    });

    setUpcomingEvents(upcoming);
    setPastEvents(past);
  };

  const fetchEvents = async () => {
    try {
      const [upcomingRes, pastRes, allRes] = await Promise.all([
        FirestoreService.getUpcomingEvents(30).catch(() => []),
        FirestoreService.getPastEvents(30).catch(() => []),
        FirestoreService.getEvents().catch(() => [])
      ]);

      const allMerged = [...(allRes || []), ...(upcomingRes || []), ...(pastRes || [])];
      processAndSetEvents(allMerged);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents().finally(() => {
      setRefreshing(false);
    });
    // Hard failsafe so spinner never hangs indefinitely
    setTimeout(() => {
      setRefreshing(false);
    }, 3500);
  };

  useEffect(() => {
    fetchEvents();
  }, []);



  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    try {
      if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
      const timePart = timeStr.includes('T') ? timeStr.split('T')[1].split('.')[0] : timeStr;
      const [hours, minutes] = timePart.split(':');
      const h = parseInt(hours, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formattedHours = h % 12 || 12;
      return `${formattedHours}:${minutes} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '--';
    try {
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts[0].length === 4) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
        } else if (parts[0].length === 2) {
          const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
        }
      }
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatTeluguDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const monthsTe = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
      return `${monthsTe[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    } catch (e) {
      return dateStr;
    }
  };

  const getRelativeDayLabel = (dateStr: string) => {
    if (!dateStr) return null;
    const eventDate = parseEventDateObj(dateStr);
    if (!eventDate) return null;
    eventDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    return null;
  };

  const getRelativeDayColor = (label: string | null) => {
    if (label === 'Today') return '#e11d48'; // Red
    if (label === 'Tomorrow') return '#B49A70';
    if (label === 'Yesterday') return '#94a3b8'; // Slate
    return '#64748b';
  };

  const getRelativeDayBg = (label: string | null) => {
    if (label === 'Today') return '#ffe4e6';
    if (label === 'Tomorrow') return '#e0f2fe';
    if (label === 'Yesterday') return '#f1f5f9';
    return '#f1f5f9';
  };

  const formatEventDateRange = (startDateStr?: string, endDateStr?: string) => {
    const startFormatted = formatDate(startDateStr);
    if (!endDateStr || startDateStr === endDateStr) {
      return { isMultiDay: false, text: startFormatted };
    }
    const endFormatted = formatDate(endDateStr);
    if (startFormatted === endFormatted) {
      return { isMultiDay: false, text: startFormatted };
    }
    return { isMultiDay: true, text: `${startFormatted} – ${endFormatted}` };
  };

  const formatEventTimeRange = (startTimeStr?: string, endTimeStr?: string) => {
    const start = formatTime(startTimeStr);
    const end = formatTime(endTimeStr);
    if (!startTimeStr && !endTimeStr) return '--';
    if (startTimeStr && !endTimeStr) return start;
    if (!startTimeStr && endTimeStr) return end;
    return `${start} – ${end}`;
  };

  const handleNavigateToDetails = (item: ScheduleEvent) => {
    const eventId = item.id || (item as any).eventId || (item as any)._id || 'sample-event-1';
    const cleanItem = {
      ...item,
      id: eventId,
      eventId: eventId,
      title: item.title || item.name || 'Event',
    };
    navigation.navigate('EventDetails', {
      event: cleanItem,
      eventId: eventId,
      id: eventId,
    });
  };

  const renderEvent = (item: ScheduleEvent, isPast: boolean = false) => {
    const dateInfo = formatEventDateRange(item.date, item.endDate);
    const timeText = formatEventTimeRange(item.startTime, item.endTime);

    const anyItem = item as any;
    const eventImageUri = 
      item.bannerUrl || 
      item.image || 
      anyItem.imageUrl || 
      anyItem.bannerImage || 
      anyItem.posterUrl || 
      anyItem.photoUrl ||
      'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=800';

    return (
      <TouchableOpacity 
        key={item.id}
        activeOpacity={0.88}
        style={[
          styles.eventCard, 
          isPast && { opacity: 0.82 },
          isDark ? styles.eventCardDark : styles.eventCardLight
        ]} 
        onPress={() => handleNavigateToDetails(item)}
      >
        {/* Left: Clean image only */}
        <Image 
          source={{ uri: eventImageUri }}
          style={styles.cardThumbImage}
          resizeMode="cover"
        />

        {/* Right Details Column */}
        <View style={styles.cardDetailsCol}>
          {/* Event Title */}
          <Text 
            style={[styles.eventTitle, isDark && styles.eventTitleDark]} 
            numberOfLines={2}
          >
            {item.title || item.name || 'Event'}{item.titleTelugu ? ` · ${item.titleTelugu}` : ''}
          </Text>

          {/* Date & Time below Date */}
          <View style={styles.dateTimeContainer}>
            <View style={styles.metaItem}>
              <Calendar size={12} color={isDark ? '#FBBF24' : '#D97706'} strokeWidth={2.4} />
              <Text style={[styles.metaDateText, isDark && styles.metaDateTextDark]} numberOfLines={1}>
                {dateInfo.text}
              </Text>
            </View>

            <View style={[styles.metaItem, { marginTop: 3.5 }]}>
              <Clock size={12} color={isDark ? '#38BDF8' : '#0284C7'} strokeWidth={2.3} />
              <Text style={[styles.metaTimeText, isDark && styles.metaTimeTextDark]} numberOfLines={1}>
                {timeText}
              </Text>
            </View>
          </View>

          {/* Location row */}
          <View style={styles.locationContainer}>
            <MapPin size={12} color={isDark ? '#FB7185' : '#E11D48'} strokeWidth={2.3} />
            <Text style={[styles.locationText, isDark && styles.locationTextDark]} numberOfLines={2}>
              {item.location || item.address || 'Church Main Hall'}
            </Text>
          </View>
        </View>

        {/* Bottom-right Cutout with visible dotted line */}
        <View style={styles.badgeCutoutContainer} pointerEvents="none">
          <Svg width={106} height={32} viewBox="0 0 106 32" style={StyleSheet.absoluteFillObject}>
            {/* Cut out card corner: horizontal above details, smooth curve on the left */}
            <Path 
              d="M 106 0 L 38 0 C 15 0, 0 14, 0 32 L 106 32 Z" 
              fill={colors.background} 
            />
            {/* Strongly visible dotted cut line */}
            <Path 
              d="M 106 0 L 38 0 C 15 0, 0 14, 0 32" 
              fill="none" 
              stroke={isDark ? '#E2E8F0' : '#334155'} 
              strokeWidth="2" 
              strokeDasharray="5, 3" 
              strokeLinecap="round"
            />
          </Svg>
        </View>

        {/* View Details link (no badge background) */}
        <View style={styles.badgeButtonWrapper} pointerEvents="box-none">
          <TouchableOpacity 
            style={styles.viewDetailsBtn}
            onPress={() => handleNavigateToDetails(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.forestGreenTxt}>View Details</Text>
            <ChevronRight size={11} color="#228B22" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

    if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#FCD34D" />
        <Text style={styles.loadingText}>{t('events.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle || (isDark ? 'light-content' : 'dark-content')} backgroundColor={colors.background} />
      
      {/* ── Page Header ── */}
            {/* ── Screen Header ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            borderBottomWidth: 1.2,
            borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
          }
        ]}
      >
        <TouchableOpacity
          style={styles.circularBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          {t('events.title')}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      {/* Tabs - Long badge (Ivory White in light theme, Dark #18181B in dark theme) */}
      <View style={[
        styles.tabContainer,
        isDark ? styles.tabContainerDark : styles.tabContainerLight
      ]}>
        {(['thisWeek', 'upcoming', 'past'] as const).map(tab => {
          const isActive = activeTab === tab;
          let label = tab === 'thisWeek' ? t('events.thisWeek') : tab === 'upcoming' ? t('events.upcoming') : t('events.past');
          return (
            <TouchableOpacity 
              key={tab} 
              style={[
                styles.tabBtn, 
                isActive && styles.tabBtnActive
              ]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              {isActive && (
                <View style={styles.activeTabGradientWrap} pointerEvents="none">
                  <LinearGradient
                    colors={['#227FFF', '#62B2FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                </View>
              )}
              <Text style={[
                styles.tabTxt,
                isActive 
                  ? (isDark ? styles.tabTxtActiveDark : styles.tabTxtActiveLight)
                  : (isDark ? styles.tabTxtInactiveDark : styles.tabTxtInactiveLight)
              ]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={
          activeTab === 'thisWeek' 
            ? upcomingEvents.filter(e => {
                const today = new Date();
                today.setHours(0,0,0,0);
                const endOfWeek = new Date(today);
                endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
                endOfWeek.setHours(23,59,59,999);
                const d = parseEventDateObj(e.date || (e as any).startDate);
                if (!d) return false;
                return d >= today && d <= endOfWeek;
              })
            : activeTab === 'upcoming' 
              ? upcomingEvents 
              : pastEvents
        }
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderEvent(item, activeTab === 'past')}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#227FFF"
            colors={['#227FFF', '#62B2FF']}
            progressBackgroundColor={isDark ? '#18181B' : '#FFFFFF'}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <CalendarCheck size={56} color={isDark ? '#475569' : '#CBD5E1'} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                {activeTab === 'past' ? t('events.noPastEvents') : t('events.noUpcomingEvents')}
              </Text>
              <Text style={[styles.emptySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {activeTab === 'thisWeek' 
                  ? (t('events.noThisWeek') || 'No events scheduled for this week.')
                  : (t('events.noUpcomingSub') || 'Check back later for newly scheduled church services and events.')}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fbbf24', marginTop: 15, fontWeight: '600' },

  // Header
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
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerCenterTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
  headerSub: { color: '#aac4e8', fontSize: 11, marginTop: 2 },

  tabContainer: {
    flexDirection: 'row',
    marginTop: 15,
    marginHorizontal: 16,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 28,
    borderWidth: 1,
    gap: 4,
    marginBottom: 6,
  },
  tabContainerDark: {
    backgroundColor: '#18181B',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tabContainerLight: {
    backgroundColor: '#E9E9E9',
    borderColor: '#374151',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  tabBtnActive: {
    shadowColor: '#227FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
  activeTabGradientWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    overflow: 'hidden',
  },
  tabTxt: {
    fontSize: 12.5,
    zIndex: 2,
  },
  tabTxtActiveDark: {
    color: '#000000',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tabTxtActiveLight: {
    color: '#000000',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tabTxtInactiveDark: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  tabTxtInactiveLight: {
    color: '#374151',
    fontWeight: '700',
  },

  listContainer: { paddingBottom: 40, paddingTop: 10, flexGrow: 1 },

  // Event Card (Compact Horizontal: Left Small Image, Right Details)
  eventCard: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    padding: 12,
    paddingBottom: 36, // Extended card height so location has full space above badge
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  eventCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  eventCardDark: {
    backgroundColor: '#18181B',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  cardThumbImage: {
    width: 88,
    height: 68,
    borderRadius: 10,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  cardDetailsCol: {
    flex: 1,
    minHeight: 74,
    paddingRight: 4,
  },
  dateTimeContainer: {
    marginVertical: 3,
  },
  eventTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 3,
  },
  eventTitleDark: {
    color: '#F8FAFC',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
  },
  metaDateText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  metaDateTextDark: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  metaTimeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  metaTimeTextDark: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    maxWidth: '100%',
  },
  locationText: {
    fontSize: 10.5,
    color: '#0F172A',
    fontWeight: '700',
    flexShrink: 1,
  },
  locationTextDark: {
    color: '#F1F5F9',
    fontWeight: '700',
  },
  badgeCutoutContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 106,
    height: 32,
    zIndex: 1,
  },
  badgeButtonWrapper: {
    position: 'absolute',
    bottom: 5,
    right: 8,
    zIndex: 2,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    paddingVertical: 2,
    paddingHorizontal: 3,
    backgroundColor: 'transparent',
  },
  forestGreenTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#228B22', // Forest Green (canonical CSS forestgreen)
    letterSpacing: 0.25,
  },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 14 },
  emptySub: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
});
