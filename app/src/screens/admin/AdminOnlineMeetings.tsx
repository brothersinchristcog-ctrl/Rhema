import React, { useState, useContext, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, 
  Dimensions, ScrollView, Alert, Platform, StatusBar 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, PlusCircle, Calendar, ArrowLeft, Users, Clock, Pencil, Trash2, Play, Square, ExternalLink, AlertCircle } from 'lucide-react-native';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import AdminZoomMeetingsCreate from './AdminZoomMeetingsCreate';
import {
  deleteOnlineMeeting,
  endOnlineMeeting,
  isMeetingAdmin,
  launchOnlineMeetingUrl,
  resolveMeetingStatus,
  startOnlineMeetingLive,
} from '../../utils/meetingActions';

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
  const { member, isPlatformSuperAdmin } = useAuth();
  const canManageMeetings = isMeetingAdmin(member, isPlatformSuperAdmin);
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'zoom' | 'google_meet'>('google_meet');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'UPCOMING' | 'LIVE' | 'COMPLETED'>('ALL');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageMeetings) {
      setLoading(false);
      return;
    }

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
  }, [canManageMeetings]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleStatClick = (filter: 'ALL' | 'UPCOMING' | 'LIVE' | 'COMPLETED') => {
    setHistoryFilter(filter);
    setActiveTab('history');
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setEditingMeeting(null);
    if (tabId === 'history') setHistoryFilter('ALL');
    if (tabId === 'create') setCreateMode(false);
  };

  const getFilteredMeetings = () => {
    if (historyFilter === 'UPCOMING') {
      return meetings.filter(m => resolveMeetingStatus(m, false) === 'scheduled');
    }
    if (historyFilter === 'LIVE') {
      return meetings.filter(m => resolveMeetingStatus(m, false) === 'live');
    }
    if (historyFilter === 'COMPLETED') {
      return meetings.filter(m => resolveMeetingStatus(m, false) === 'completed');
    }
    return meetings;
  };

  const getMeetingDisplayDate = (m: any): Date => {
    if (m.startTime?.toDate) return m.startTime.toDate();
    if (typeof m.startTime?.seconds === 'number') return new Date(m.startTime.seconds * 1000);
    if (m.createdAt?.toDate) return m.createdAt.toDate();
    return new Date();
  };

  const startEditingMeeting = (m: any) => {
    const isZoom = m.provider === 'zoom' || m.meetingType === 'zoom';
    setSelectedProvider(isZoom ? 'zoom' : 'google_meet');
    setCreateMode(false);
    setEditingMeeting(m);
  };

  const handleGoLive = (m: any) => {
    Alert.alert(
      'Start Live Meeting?',
      `Start "${m.title || 'Online Meeting'}" live now and notify all church members?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go Live Now',
          onPress: async () => {
            setActionBusyId(m.id);
            try {
              const res = await startOnlineMeetingLive(
                m.churchId || member?.churchId || 'rhema',
                m.id
              );
              const alertTitle = res.pushSent ? 'Meeting is Live!' : 'Status Set to Live';
              const alertMsg = res.pushSent
                ? 'Members have been notified that the meeting has started.'
                : 'Meeting is now marked Live. Deploy startBibleClass in Cloud Shell to enable push notifications.';
              Alert.alert(alertTitle, alertMsg, [
                { text: 'Stay Here', style: 'cancel' },
                ...(m.meetingLink || m.meetingUrl || m.url
                  ? [
                      {
                        text: 'Open Meeting Link',
                        onPress: () => {
                          launchOnlineMeetingUrl(m, member?.name || 'Church Admin').catch(() => {});
                        },
                      },
                    ]
                  : []),
              ]);
            } catch (err: any) {
              Alert.alert('Start Failed', err?.message || 'Unable to start meeting.');
            } finally {
              setActionBusyId(null);
            }
          },
        },
      ]
    );
  };

  const handleEndLive = (m: any) => {
    Alert.alert(
      'End Meeting?',
      `Mark "${m.title || 'Online Meeting'}" as Completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Meeting',
          style: 'destructive',
          onPress: async () => {
            setActionBusyId(m.id);
            try {
              await endOnlineMeeting(m.churchId || member?.churchId || 'rhema', m.id);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Unable to end meeting.');
            } finally {
              setActionBusyId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteMeeting = (m: any) => {
    Alert.alert(
      'Delete Meeting',
      `Remove "${m.title || 'Online Meeting'}" from meetings?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOnlineMeeting(m.churchId || member?.churchId || 'rhema', m.id);
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.message || 'Unable to delete meeting.');
            }
          },
        },
      ]
    );
  };

  const renderMeetingActions = (m: any, status: 'scheduled' | 'live' | 'completed' | 'cancelled') => {
    const busy = actionBusyId === m.id;
    return (
      <View style={styles.cardActionRow}>
        {status === 'scheduled' ? (
          <TouchableOpacity
            style={[styles.cardGoLiveBtn, busy && { opacity: 0.6 }]}
            onPress={() => handleGoLive(m)}
            disabled={busy}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.cardGoLiveText}>Go Live</Text>
          </TouchableOpacity>
        ) : null}

        {status === 'live' ? (
          <>
            <TouchableOpacity
              style={[styles.cardGoLiveBtn, { backgroundColor: '#0EA5E9' }]}
              onPress={() => {
                launchOnlineMeetingUrl(m, member?.name || 'Church Admin').catch(() => {});
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <ExternalLink size={12} color="#FFFFFF" />
              <Text style={styles.cardGoLiveText}>Join</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardEndBtn, busy && { opacity: 0.6 }]}
              onPress={() => handleEndLive(m)}
              disabled={busy}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Square size={11} color="#EF4444" fill="#EF4444" />
              <Text style={styles.cardEndText}>End</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {status !== 'completed' ? (
          <TouchableOpacity
            style={[
              styles.cardActionBtn,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#CBD5E1',
              },
            ]}
            onPress={() => startEditingMeeting(m)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Pencil size={13} color={primaryText} />
            <Text style={[styles.cardActionText, { color: primaryText }]}>Edit</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.cardActionIconBtn,
            {
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              borderColor: 'rgba(239, 68, 68, 0.35)',
            },
          ]}
          onPress={() => handleDeleteMeeting(m)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Trash2 size={14} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  const handleBackNavigation = () => {
    if (editingMeeting) {
      setEditingMeeting(null);
      return;
    }
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
        
        {/* Scheduled */}
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
          onPress={() => handleStatClick('UPCOMING')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FEF3C7' }]}>
            <Calendar size={18} color="#F59E0B" />
          </View>
          <Text style={[styles.statValue, { color: primaryText }]}>
            {meetings.filter(m => resolveMeetingStatus(m, false) === 'scheduled').length}
          </Text>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Scheduled</Text>
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
            {meetings.filter(m => resolveMeetingStatus(m, false) === 'live').length}
          </Text>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Live Now</Text>
        </TouchableOpacity>
        
        {/* Completed */}
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
          onPress={() => handleStatClick('COMPLETED')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.16)' : '#EDE9FE' }]}>
            <Users size={18} color="#8B5CF6" />
          </View>
          <Text style={[styles.statValue, { color: primaryText }]}>
            {meetings.filter(m => resolveMeetingStatus(m, false) === 'completed').length}
          </Text>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Completed</Text>
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
          <Text style={[styles.emptySub, { color: secondaryText }]}>Tap "Create Meeting" below to schedule a new session.</Text>
        </View>
      ) : (
        meetings.slice(0, 3).map(m => {
          const d = getMeetingDisplayDate(m);
          const dateStr = m.date || d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const status = resolveMeetingStatus(m, false);
          const isLive = status === 'live';
          const isScheduled = status === 'scheduled';
          const badgeColor = isLive ? '#10B981' : (isScheduled ? '#F59E0B' : '#64748B');
          const statusLabel = isLive ? 'LIVE' : (isScheduled ? 'SCHEDULED' : 'COMPLETED');

          return (
            <View 
              key={m.id} 
              style={[
                styles.historyCard, 
                { 
                  backgroundColor: cardSurface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
                  borderLeftColor: badgeColor,
                }
              ]}
            >
              <View style={styles.historyCardHeader}>
                <Text style={[styles.historyTitle, { color: primaryText }]} numberOfLines={1}>
                  {String(m.title || 'Church Online Meeting')}
                </Text>
                <View style={[styles.historyBadge, { backgroundColor: `${badgeColor}24` }]}>
                  <Text style={[styles.historyBadgeText, { color: badgeColor }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.historyCardFooterRow}>
                <View style={styles.historyCardFooter}>
                  <Clock size={14} color={secondaryText} />
                  <Text style={[styles.historySub, { color: secondaryText }]} numberOfLines={1}>
                    {dateStr}{m.startTimeLabel ? ` • ${m.startTimeLabel}` : ''}
                  </Text>
                </View>
                {renderMeetingActions(m, status)}
              </View>
            </View>
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
      {/* Status Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsRow}
      >
        {(
          [
            { key: 'ALL', label: 'All' },
            { key: 'UPCOMING', label: 'Scheduled' },
            { key: 'LIVE', label: 'Live' },
            { key: 'COMPLETED', label: 'Completed' },
          ] as const
        ).map((chip) => {
          const active = historyFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[
                styles.filterChipBtn,
                {
                  backgroundColor: active
                    ? isDark
                      ? '#FFFFFF'
                      : '#0F172A'
                    : cardSurface,
                  borderColor: active
                    ? isDark
                      ? '#FFFFFF'
                      : '#0F172A'
                    : isDark
                    ? 'rgba(255, 255, 255, 0.14)'
                    : adminBorderColor,
                },
              ]}
              onPress={() => setHistoryFilter(chip.key)}
              activeOpacity={0.8}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '700',
                  color: active ? (isDark ? '#0F172A' : '#FFFFFF') : primaryText,
                }}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {getFilteredMeetings().length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}>
          <Calendar size={36} color={secondaryText} />
          <Text style={[styles.emptyTitle, { color: primaryText }]}>No meetings found</Text>
          <Text style={[styles.emptySub, { color: secondaryText }]}>There are no meetings matching the current filter.</Text>
        </View>
      ) : (
        getFilteredMeetings().map(m => {
          const d = getMeetingDisplayDate(m);
          const status = resolveMeetingStatus(m, false);
          const isLive = status === 'live';
          const isScheduled = status === 'scheduled';
          const badgeBg = isLive ? 'rgba(16, 185, 129, 0.15)' : (isScheduled ? 'rgba(245, 158, 11, 0.15)' : (isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9'));
          const badgeText = isLive ? '#10B981' : (isScheduled ? '#F59E0B' : secondaryText);
          const borderStripe = isLive ? '#10B981' : (isScheduled ? '#F59E0B' : (isDark ? 'rgba(255,255,255,0.12)' : '#CBD5E1'));
          const statusLabel = isLive ? 'LIVE' : (isScheduled ? 'SCHEDULED' : 'COMPLETED');

          return (
            <View 
              key={m.id} 
              style={[
                styles.historyCard, 
                { 
                  backgroundColor: cardSurface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
                  borderLeftColor: borderStripe,
                }
              ]}
            >
              <View style={styles.historyCardHeader}>
                <Text style={[styles.historyTitle, { color: primaryText }]} numberOfLines={1}>
                  {String(m.title || 'Online Meeting')}
                </Text>
                <View style={[styles.historyBadge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.historyBadgeText, { color: badgeText }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.historyCardFooterRow}>
                <View style={styles.historyCardFooter}>
                  <Clock size={14} color={secondaryText} />
                  <Text style={[styles.historySub, { color: secondaryText }]} numberOfLines={1}>
                    {m.date || d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {m.startTimeLabel || d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
                  </Text>
                </View>

                {renderMeetingActions(m, status)}
              </View>
            </View>
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
            style={styles.circularBackBtn} 
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft color={primaryText} size={22} strokeWidth={2.4} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
            {editingMeeting
              ? (selectedProvider === 'google_meet' ? 'Edit Google Meet' : 'Edit Zoom Meeting')
              : createMode 
              ? (selectedProvider === 'google_meet' ? 'Schedule Google Meet' : 'Schedule Zoom Meeting')
              : (activeTab === 'create' ? 'Schedule' : (activeTab === 'history' ? 'All Meetings' : 'Online Meetings'))}
          </Text>

          {/* Symmetrical Spacer */}
          <View style={{ width: 40 }} />
        </View>
      </View>

      {/* Content Area */}
      {!canManageMeetings ? (
        <View style={styles.loading}>
          <AlertCircle size={40} color="#EF4444" style={{ marginBottom: 12 }} />
          <Text style={[styles.historyTitle, { color: primaryText, textAlign: 'center', marginBottom: 6 }]}>
            Admin Access Required
          </Text>
          <Text style={[styles.historySub, { color: secondaryText, textAlign: 'center', paddingHorizontal: 32 }]}>
            Only church admins and pastors can create, edit, or manage online meetings.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#000000'} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {editingMeeting ? (
            <AdminZoomMeetingsCreate
              editingMeeting={editingMeeting}
              onBack={() => setEditingMeeting(null)}
              onSaved={() => setEditingMeeting(null)}
              initialProvider={selectedProvider}
              hideHeader={true}
            />
          ) : createMode ? (
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
      {canManageMeetings && !loading && !createMode && !editingMeeting ? (
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
    justifyContent: 'center',
    alignItems: 'center',
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
    flex: 1,
    marginRight: 8,
  },
  historyCardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardActionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGoLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#10B981',
  },
  cardGoLiveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardEndBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  cardEndText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
  },
  filterChipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.2,
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
