import React, { useState, useContext, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, 
  Dimensions, ScrollView, Alert, Platform, StatusBar 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, PlusCircle, Calendar, ArrowLeft, Users, Clock } from 'lucide-react-native';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import AdminZoomMeetingsCreate from './AdminZoomMeetingsCreate';

const { width } = Dimensions.get('window');

const BASE_TABS = [
  { id: "dashboard", label: "Dashboard", icon: Video },
  { id: "create",    label: "Create Meeting", icon: PlusCircle },
  { id: "history",   label: "All Meetings", icon: Calendar },
];

export default function AdminOnlineMeetings() {
  const { isDark, screenBg, cardSurface, primaryText, secondaryText, borderColor: adminBorderColor, barStyle } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const adminContext = useContext(AdminTabContext) as any;
  const { member } = useAuth();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'zoom' | 'google_meet'>('google_meet');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'UPCOMING' | 'LIVE'>('ALL');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const unsubscribe = db.collection(`churches/default/online_meetings`)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        (snapshot: any) => {
          const fetched = snapshot ? snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
          })) : [];
          setMeetings(fetched);
          setLoading(false);
        },
        (error: any) => {
          console.error("Error fetching zoom meetings:", error);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleStatClick = (filter: 'ALL' | 'UPCOMING' | 'LIVE') => {
    setHistoryFilter(filter);
    setActiveTab('history');
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === 'history') setHistoryFilter('ALL');
    if (tabId === 'create') setCreateMode(false);
  };

  const getFilteredMeetings = () => {
    if (historyFilter === 'UPCOMING') return meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'upcoming');
    if (historyFilter === 'LIVE') return meetings.filter(m => m.status === 'LIVE');
    return meetings;
  };

  const handleBackNavigation = () => {
    if (createMode) {
      setCreateMode(false);
      return;
    }
    if (activeTab !== 'dashboard') {
      setActiveTab('dashboard');
      return;
    }
    if (adminContext?.goBack) {
      adminContext.goBack();
    } else if (adminContext?.setTabByName) {
      adminContext.setTabByName('Dashboard');
    }
  };

  const renderDashboard = () => (
    <ScrollView 
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, 24) + 90 }
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Symmetrical 4 Stats Grid (No Jarring Blue, Theme-Aligned) ── */}
      <View style={styles.statsGrid}>
        {/* Total Meetings */}
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
          onPress={() => handleStatClick('ALL')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.16)' : '#E0F2FE' }]}>
            <Video size={18} color="#0EA5E9" />
          </View>
          <Text style={[styles.statValue, { color: primaryText }]}>{meetings.length}</Text>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Total Meetings</Text>
        </TouchableOpacity>
        
        {/* Upcoming */}
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
          onPress={() => handleStatClick('UPCOMING')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FEF3C7' }]}>
            <Calendar size={18} color="#F59E0B" />
          </View>
          <Text style={[styles.statValue, { color: primaryText }]}>
            {meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'upcoming').length}
          </Text>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Upcoming</Text>
        </TouchableOpacity>
        
        {/* Live Now */}
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
          onPress={() => handleStatClick('LIVE')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#D1FAE5' }]}>
            <Video size={18} color="#10B981" />
          </View>
          <Text style={[styles.statValue, { color: primaryText }]}>
            {meetings.filter(m => m.status === 'LIVE').length}
          </Text>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Live Now</Text>
        </TouchableOpacity>
        
        {/* Total Attendees */}
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
          onPress={() => Alert.alert('Attendees', 'This feature will show total attendees soon.')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.16)' : '#EDE9FE' }]}>
            <Users size={18} color="#8B5CF6" />
          </View>
          <Text style={[styles.statValue, { color: primaryText }]}>0</Text>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Total Attendees</Text>
        </TouchableOpacity>
      </View>

      {/* ── Recent Meetings Section ── */}
      <View style={styles.recentHeader}>
        <Text style={[styles.sectionTitle, { color: primaryText }]}>Recent Meetings</Text>
        {meetings.length > 2 ? (
          <TouchableOpacity onPress={() => handleTabChange('history')} activeOpacity={0.7} style={{ padding: 4 }}>
            <Text style={{ color: isDark ? '#FCD34D' : '#0F172A', fontWeight: '700', fontSize: 13 }}>Show More</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {meetings.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}>
          <Video size={36} color={secondaryText} />
          <Text style={[styles.emptyTitle, { color: primaryText }]}>No meetings scheduled yet</Text>
          <Text style={[styles.emptySub, { color: secondaryText }]}>Tap "Create Meeting" below to schedule a new Zoom session.</Text>
        </View>
      ) : (
        meetings.slice(0, 3).map(m => {
          const d = m.scheduledDate ? new Date(m.scheduledDate) : (m.createdAt?.toDate ? m.createdAt.toDate() : new Date());
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const isLive = m.status === 'LIVE';
          const isUpcoming = m.status === 'SCHEDULED' || m.status === 'upcoming';
          const badgeColor = isLive ? '#10B981' : (isUpcoming ? '#F59E0B' : '#64748B');

          return (
            <TouchableOpacity 
              key={m.id} 
              style={[
                styles.classRow, 
                { 
                  backgroundColor: cardSurface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
                }
              ]}
              onPress={() => {
                Alert.alert(m.title || 'Meeting Details', `Status: ${m.status || 'Active'}\nLink: ${m.meetingLink || 'None'}`);
              }}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.classRowTitle, { color: primaryText }]} numberOfLines={1}>
                  {String(m.title || 'Church Online Meeting')}
                </Text>
                <Text style={[styles.classRowSub, { color: secondaryText }]}>
                  {dateStr} • {String(m.status || 'Scheduled')}
                </Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: badgeColor }]} />
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );

  const renderCreateLanding = () => {
    const timeString = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const dateString = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
      <ScrollView 
        contentContainerStyle={[styles.landingScroll, { paddingBottom: Math.max(insets.bottom, 24) + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Clock Badge */}
        <View style={[
          styles.timeBadge, 
          { 
            backgroundColor: cardSurface, 
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : adminBorderColor,
          }
        ]}>
          <Text style={[styles.clockTime, { color: primaryText }]}>{timeString}</Text>
          <Text style={[styles.clockDate, { color: secondaryText }]}>{dateString}</Text>
        </View>
        
        {/* Card 1: Google Meet */}
        <View style={[
          styles.bigActionCard, 
          { 
            backgroundColor: cardSurface,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : adminBorderColor,
            marginBottom: 16,
          }
        ]}>
          <View style={styles.bigActionCardHeader}>
            <View style={[styles.bigActionCardIconWrapper, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#DCFCE7' }]}>
              <Video size={26} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bigActionCardTitle, { color: primaryText }]}>Google Meet</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#10B981', marginTop: 2 }}>
                Direct Google Meet Link
              </Text>
            </View>
          </View>
          <Text style={[styles.bigActionCardDesc, { color: secondaryText }]}>
            Schedule a new Bible class, automatically generate a Google Meet link, and invite members to join in fellowship and study.
          </Text>

          <TouchableOpacity 
            style={[styles.bigActionBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
            onPress={() => {
              setSelectedProvider('google_meet');
              setCreateMode(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.bigActionBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
              + Schedule Google Meet
            </Text>
          </TouchableOpacity>
        </View>

        {/* Card 2: Zoom Meeting */}
        <View style={[
          styles.bigActionCard, 
          { 
            backgroundColor: cardSurface,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : adminBorderColor,
          }
        ]}>
          <View style={styles.bigActionCardHeader}>
            <View style={[styles.bigActionCardIconWrapper, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.16)' : '#E0F2FE' }]}>
              <Video size={26} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bigActionCardTitle, { color: primaryText }]}>Zoom Meeting</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#0EA5E9', marginTop: 2 }}>
                Cloud Function API Link
              </Text>
            </View>
          </View>
          <Text style={[styles.bigActionCardDesc, { color: secondaryText }]}>
            Schedule a new Bible class, automatically generate a Zoom meeting link via Zoom API, and invite members to join in fellowship and study.
          </Text>

          <TouchableOpacity 
            style={[styles.bigActionBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
            onPress={() => {
              setSelectedProvider('zoom');
              setCreateMode(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.bigActionBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
              + Schedule Zoom Meeting
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderHistory = () => (
    <ScrollView 
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, 24) + 90 }
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Filter Pill */}
      {historyFilter !== 'ALL' ? (
        <View style={[styles.filterPill, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : adminBorderColor }]}>
          <Text style={[styles.filterPillText, { color: primaryText }]}>Showing: {historyFilter}</Text>
          <TouchableOpacity onPress={() => setHistoryFilter('ALL')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.filterPillClear}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {getFilteredMeetings().length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}>
          <Calendar size={36} color={secondaryText} />
          <Text style={[styles.emptyTitle, { color: primaryText }]}>No meetings found</Text>
          <Text style={[styles.emptySub, { color: secondaryText }]}>There are no meetings matching the current filter.</Text>
        </View>
      ) : (
        getFilteredMeetings().map(m => {
          const d = m.scheduledDate ? new Date(m.scheduledDate) : (m.createdAt?.toDate ? m.createdAt.toDate() : new Date());
          const isLive = m.status === 'LIVE';
          const isUpcoming = m.status === 'SCHEDULED' || m.status === 'upcoming';
          const badgeBg = isLive ? 'rgba(16, 185, 129, 0.15)' : (isUpcoming ? 'rgba(245, 158, 11, 0.15)' : (isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9'));
          const badgeText = isLive ? '#10B981' : (isUpcoming ? '#F59E0B' : secondaryText);
          const borderStripe = isLive ? '#10B981' : (isUpcoming ? '#F59E0B' : (isDark ? 'rgba(255,255,255,0.12)' : '#CBD5E1'));

          return (
            <TouchableOpacity 
              key={m.id} 
              style={[
                styles.historyCard, 
                { 
                  backgroundColor: cardSurface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
                  borderLeftColor: borderStripe,
                }
              ]}
              onPress={() => {
                Alert.alert(m.title || 'Meeting Details', `Topic: ${m.topic || 'N/A'}\nStatus: ${m.status || 'Active'}\nLink: ${m.meetingLink || 'None'}`);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.historyCardHeader}>
                <Text style={[styles.historyTitle, { color: primaryText }]} numberOfLines={1}>
                  {String(m.title || 'Online Meeting')}
                </Text>
                <View style={[styles.historyBadge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.historyBadgeText, { color: badgeText }]}>
                    {String(m.status || 'SCHEDULED')}
                  </Text>
                </View>
              </View>

              <View style={styles.historyCardFooter}>
                <Clock size={14} color={secondaryText} />
                <Text style={[styles.historySub, { color: secondaryText }]}>
                  {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />
      
      {/* ── Pinned Top Header Bar (No Blue, Theme Colors) ── */}
      <View
        style={[
          styles.topbar,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1.5,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
            paddingTop: Platform.OS === 'ios' ? Math.max(insets.top, 20) : 10,
            paddingBottom: 10,
            paddingHorizontal: 16,
          }
        ]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity 
            onPress={handleBackNavigation}
            style={[
              styles.circularBackBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : '#F1F5F9',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.20)' : '#CBD5E1',
              }
            ]} 
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft color={primaryText} size={20} strokeWidth={2.4} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
            {createMode 
              ? (selectedProvider === 'google_meet' ? 'Schedule Google Meet' : 'Schedule Zoom Meeting')
              : (activeTab === 'create' ? 'Schedule' : (activeTab === 'history' ? 'All Meetings' : 'Online Meetings'))}
          </Text>

          {/* Symmetrical Spacer */}
          <View style={{ width: 40 }} />
        </View>
      </View>

      {/* Content Area */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#000000'} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {createMode ? (
            <AdminZoomMeetingsCreate 
              onBack={() => setCreateMode(false)} 
              initialProvider={selectedProvider} 
              hideHeader={true}
            />
          ) : (
            <>
              {activeTab === 'dashboard' ? renderDashboard() : null}
              {activeTab === 'create' ? renderCreateLanding() : null}
              {activeTab === 'history' ? renderHistory() : null}
            </>
          )}
        </View>
      )}

      {/* ── Themed Floating Bottom Navigation Tabs ── */}
      {!loading && !createMode ? (
        <View 
          style={[
            styles.floatingTabsContainer, 
            { 
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : adminBorderColor,
              bottom: Math.max(insets.bottom, 16) + 12,
            }
          ]}
        >
          {BASE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.floatingTab, 
                  isActive ? { backgroundColor: isDark ? '#FFFFFF' : '#000000' } : null
                ]}
                onPress={() => handleTabChange(tab.id)}
                activeOpacity={0.8}
              >
                <Icon 
                  size={18} 
                  color={isActive ? (isDark ? '#000000' : '#FFFFFF') : secondaryText} 
                  strokeWidth={2.2}
                />
                {isActive ? (
                  <Text style={[styles.floatingTabText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                    {tab.label}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: { 
    flex: 1 
  },
  topbar: {
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  loading: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  content: { 
    padding: 16 
  },
  sectionTitle: { 
    fontSize: 20, 
    fontWeight: '800', 
    letterSpacing: -0.3 
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: (width - 32 - 10) / 2,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  classRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  classRowTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    marginBottom: 3 
  },
  classRowSub: { 
    fontSize: 13, 
    fontWeight: '500' 
  },
  statusDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5 
  },
  
  historyCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderLeftWidth: 4,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 10,
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  historyCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historySub: {
    fontSize: 13,
    fontWeight: '500',
  },
  
  landingContainer: {
    flex: 1,
    paddingTop: 16,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  landingScroll: {
    padding: 16,
    alignItems: 'center',
  },
  timeBadge: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  clockTime: {
    fontSize: 40,
    fontWeight: '300',
    marginBottom: 2,
  },
  clockDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  bigActionCard: {
    width: '100%',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  bigActionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bigActionCardIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  bigActionCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    flex: 1,
  },
  bigActionCardDesc: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  bigActionBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigActionBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  filterPillClear: {
    color: '#EF4444',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyContainer: {
    padding: 30,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  
  floatingTabsContainer: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 5,
    borderRadius: 30,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    gap: 4
  },
  floatingTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    gap: 6,
  },
  floatingTabText: {
    fontSize: 13,
    fontWeight: '800',
  }
}));
