import React, { useState, useContext, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, 
  Dimensions, ScrollView, Alert, Platform, StatusBar, Image, ToastAndroid 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  Video, PlusCircle, Calendar, ArrowLeft, Users, Clock, Pencil, Trash2,
  Play, Square, ExternalLink, AlertCircle, BookOpen, User, Key, Copy,
  ChevronRight, CheckCircle, Radio,
} from 'lucide-react-native';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import AdminZoomMeetingsCreate from './AdminZoomMeetingsCreate';
import {
  deleteOnlineMeeting,
  endOnlineMeeting,
  isMeetingAdmin,
  launchOnlineMeetingUrl,
  normalizeMeetingChurchId,
  parseMeetingTimestamp,
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
  const { activeChurch } = useChurch();
  const canManageMeetings = isMeetingAdmin(member, isPlatformSuperAdmin);
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<any | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'zoom' | 'google_meet'>('google_meet');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'UPCOMING' | 'LIVE' | 'COMPLETED'>('ALL');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [liveDashboardAttendees, setLiveDashboardAttendees] = useState<any[]>([]);

  const resolvedSelectedMeeting = selectedMeeting
    ? (meetings.find((m) => m.id === selectedMeeting.id) || selectedMeeting)
    : null;
  const activeLiveMeeting = meetings.find((m) => resolveMeetingStatus(m, false) === 'live') || null;

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
    if (!canManageMeetings || !resolvedSelectedMeeting?.id) {
      setAttendees([]);
      setAttendeesLoading(false);
      return;
    }

    const churchId = normalizeMeetingChurchId(
      resolvedSelectedMeeting.churchId || activeChurch?.id || member?.churchId
    );
    setAttendeesLoading(true);

    const unsubscribe = db
      .collection(`Rhema Church/${churchId}/online_meetings/${resolvedSelectedMeeting.id}/attendees`)
      .onSnapshot(
        (snapshot: any) => {
          const list = snapshot
            ? snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
            : [];
          list.sort((a: any, b: any) => {
            const ta = parseMeetingTimestamp(a.joinedAt)?.getTime() || 0;
            const tb = parseMeetingTimestamp(b.joinedAt)?.getTime() || 0;
            return tb - ta;
          });
          setAttendees(list);
          setAttendeesLoading(false);
        },
        (error: any) => {
          console.warn('Error fetching live attendance:', error);
          setAttendees([]);
          setAttendeesLoading(false);
        }
      );

    return () => unsubscribe();
  }, [canManageMeetings, resolvedSelectedMeeting?.id, resolvedSelectedMeeting?.churchId, activeChurch?.id, member?.churchId]);

  useEffect(() => {
    if (!canManageMeetings || !activeLiveMeeting?.id) {
      setLiveDashboardAttendees([]);
      return;
    }

    const churchId = normalizeMeetingChurchId(
      activeLiveMeeting.churchId || activeChurch?.id || member?.churchId
    );
    const unsubscribe = db
      .collection(`Rhema Church/${churchId}/online_meetings/${activeLiveMeeting.id}/attendees`)
      .onSnapshot(
        (snapshot: any) => {
          const list = snapshot
            ? snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
            : [];
          list.sort((a: any, b: any) => {
            const ta = parseMeetingTimestamp(a.joinedAt)?.getTime() || 0;
            const tb = parseMeetingTimestamp(b.joinedAt)?.getTime() || 0;
            return tb - ta;
          });
          setLiveDashboardAttendees(list);
        },
        () => {
          setLiveDashboardAttendees([]);
        }
      );

    return () => unsubscribe();
  }, [canManageMeetings, activeLiveMeeting?.id, activeLiveMeeting?.churchId, activeChurch?.id, member?.churchId]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleStatClick = (filter: 'ALL' | 'UPCOMING' | 'LIVE' | 'COMPLETED') => {
    setSelectedMeeting(null);
    setHistoryFilter(filter);
    setActiveTab('history');
  };

  const handleTabChange = (tabId: string) => {
    setSelectedMeeting(null);
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
              if (selectedMeeting?.id === m.id) {
                setSelectedMeeting(null);
              }
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.message || 'Unable to delete meeting.');
            }
          },
        },
      ]
    );
  };

  const formatMeetingSchedule = (m: any) => {
    const startDt = parseMeetingTimestamp(m.startTime);
    const endDt = parseMeetingTimestamp(m.endTime);
    const fallbackDt = getMeetingDisplayDate(m);
    const dateStr = startDt
      ? startDt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : (m.date || fallbackDt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
    const timeStr = startDt && endDt
      ? `${startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : startDt
      ? startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : (m.startTimeLabel || '');
    return { dateStr, timeStr };
  };

  const copyMeetingPasscode = async (password: string) => {
    await Clipboard.setStringAsync(String(password));
    if (Platform.OS === 'android') {
      ToastAndroid.show(`Passcode ${password} copied!`, ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', `Meeting Passcode ${password} copied to clipboard!`);
    }
  };

  const renderAttendeeRow = (a: any, index: number, total: number) => {
    const joinedDt = parseMeetingTimestamp(a.joinedAt);
    const joinedStr = joinedDt
      ? `Joined ${joinedDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'In Session';
    const initial = String(a.name || 'M').trim().charAt(0).toUpperCase() || 'M';
    const isLast = index === total - 1;

    return (
      <View
        key={a.id || `${initial}-${index}`}
        style={[
          styles.attendeeRow,
          !isLast && {
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
          },
        ]}
      >
        {a.profilePhoto ? (
          <Image source={{ uri: a.profilePhoto }} style={styles.attendeeAvatarImg} />
        ) : (
          <View
            style={[
              styles.attendeeAvatarCircle,
              { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7' },
            ]}
          >
            <Text style={[styles.attendeeAvatarText, { color: '#10B981' }]}>{initial}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={[styles.attendeeName, { color: primaryText }]} numberOfLines={1}>
            {a.name || 'Church Member'}
          </Text>
          <Text style={[styles.attendeeTime, { color: secondaryText }]} numberOfLines={1}>
            {joinedStr}
          </Text>
        </View>

        <View style={styles.attendeeStatusPill}>
          <View style={styles.attendeeLiveDot} />
          <Text style={styles.attendeeStatusText}>Joined</Text>
        </View>
      </View>
    );
  };

  const renderMeetingActions = (m: any, status: 'scheduled' | 'live' | 'completed' | 'cancelled') => {
    const busy = actionBusyId === m.id;
    return (
      <View style={styles.cardActionRow}>
        <View style={styles.cardActionLeftGroup}>
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
          ) : (
            <TouchableOpacity
              style={[
                styles.cardActionBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#CBD5E1',
                },
              ]}
              onPress={() => setSelectedMeeting(m)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Users size={13} color={primaryText} />
              <Text style={[styles.cardActionText, { color: primaryText }]}>Attendance</Text>
            </TouchableOpacity>
          )}
        </View>

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

  const renderMeetingCard = (m: any) => {
    const status = resolveMeetingStatus(m, false);
    const isLive = status === 'live';
    const isScheduled = status === 'scheduled';
    const isZoom = m.provider === 'zoom' || m.meetingType === 'zoom';
    const badgeColor = isLive ? '#10B981' : (isScheduled ? '#F59E0B' : '#64748B');
    const badgeBg = isLive
      ? 'rgba(16, 185, 129, 0.16)'
      : isScheduled
      ? 'rgba(245, 158, 11, 0.16)'
      : isDark
      ? 'rgba(255,255,255,0.08)'
      : '#F1F5F9';
    const statusLabel = isLive ? 'LIVE NOW' : (isScheduled ? 'SCHEDULED' : 'COMPLETED');
    const { dateStr, timeStr } = formatMeetingSchedule(m);
    const hostName = String(m.teacher || m.teacherName || '').trim();
    const showLiveCount = isLive && activeLiveMeeting?.id === m.id;

    return (
      <TouchableOpacity
        key={m.id}
        activeOpacity={0.85}
        onPress={() => setSelectedMeeting(m)}
        style={[
          styles.historyCard,
          {
            backgroundColor: cardSurface,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
            borderLeftColor: badgeColor,
          },
        ]}
      >
        <View style={styles.historyCardHeader}>
          <Text style={[styles.historyTitle, { color: primaryText }]} numberOfLines={2}>
            {String(m.title || 'Online Meeting')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.historyBadge, { backgroundColor: badgeBg }]}>
              <Text style={[styles.historyBadgeText, { color: badgeColor }]}>{statusLabel}</Text>
            </View>
            <ChevronRight size={16} color={secondaryText} />
          </View>
        </View>

        <View style={styles.cardMetaChipsRow}>
          <View
            style={[
              styles.platformMiniChip,
              {
                backgroundColor: isZoom ? 'rgba(45, 140, 255, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                borderColor: isZoom ? 'rgba(45, 140, 255, 0.35)' : 'rgba(16, 185, 129, 0.35)',
              },
            ]}
          >
            <Video size={11} color={isZoom ? '#38BDF8' : '#10B981'} />
            <Text style={[styles.platformMiniChipText, { color: isZoom ? '#38BDF8' : '#10B981' }]}>
              {isZoom ? 'Zoom' : 'Google Meet'}
            </Text>
          </View>

          {showLiveCount ? (
            <View style={styles.attendeeCountChip}>
              <Users size={11} color="#10B981" />
              <Text style={styles.attendeeCountChipText}>
                {liveDashboardAttendees.length} Joined
              </Text>
            </View>
          ) : null}

          {hostName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
              <User size={12} color={secondaryText} />
              <Text style={[styles.cardHostText, { color: secondaryText }]} numberOfLines={1}>
                {hostName}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardScheduleRow}>
          <Clock size={14} color={secondaryText} />
          <Text style={[styles.historySub, { color: secondaryText, flex: 1 }]} numberOfLines={1}>
            {dateStr}{timeStr ? ` • ${timeStr}` : ''}
          </Text>
        </View>

        <View
          style={[
            styles.cardActionsDivider,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
          ]}
        />

        {renderMeetingActions(m, status)}
      </TouchableOpacity>
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
    if (selectedMeeting) {
      setSelectedMeeting(null);
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
            <Radio size={18} color="#10B981" />
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
            <CheckCircle size={18} color="#8B5CF6" />
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
        meetings.slice(0, 3).map((m) => renderMeetingCard(m))
      )}

      {/* ── Live Attendance Section ── */}
      <View style={styles.recentHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Radio size={18} color={activeLiveMeeting ? '#10B981' : secondaryText} />
          <Text style={[styles.sectionTitle, { color: primaryText }]}>Live Attendance</Text>
        </View>
        {activeLiveMeeting ? (
          <View style={styles.attendeeCountChip}>
            <Users size={12} color="#10B981" />
            <Text style={styles.attendeeCountChipText}>
              {liveDashboardAttendees.length} Joined
            </Text>
          </View>
        ) : null}
      </View>

      {activeLiveMeeting ? (
        <View
          style={[
            styles.liveAttendanceCard,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setSelectedMeeting(activeLiveMeeting)}
            style={[
              styles.liveAttendanceBanner,
              {
                borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
              },
            ]}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={styles.attendeeLiveDot} />
                <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 }}>
                  LIVE SESSION IN PROGRESS
                </Text>
              </View>
              <Text style={[styles.historyTitle, { color: primaryText, marginRight: 0 }]} numberOfLines={1}>
                {activeLiveMeeting.title || 'Online Meeting'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.cardGoLiveBtn, { backgroundColor: '#0EA5E9', paddingHorizontal: 12, paddingVertical: 7 }]}
              onPress={() => {
                launchOnlineMeetingUrl(activeLiveMeeting, member?.name || 'Church Admin').catch(() => {});
              }}
              activeOpacity={0.85}
            >
              <ExternalLink size={13} color="#FFFFFF" />
              <Text style={styles.cardGoLiveText}>Join</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {liveDashboardAttendees.length === 0 ? (
            <View style={styles.attendeeEmptyBox}>
              <Users size={24} color={secondaryText} style={{ opacity: 0.6, marginBottom: 6 }} />
              <Text style={[styles.emptyTitle, { color: primaryText, marginTop: 0, fontSize: 14.5 }]}>
                Waiting for members to join
              </Text>
              <Text style={[styles.emptySub, { color: secondaryText }]}>
                Members joining from the app will appear here in real time.
              </Text>
            </View>
          ) : (
            <>
              {liveDashboardAttendees
                .slice(0, 5)
                .map((a, idx, arr) => renderAttendeeRow(a, idx, arr.length))}
              <TouchableOpacity
                onPress={() => setSelectedMeeting(activeLiveMeeting)}
                style={[
                  styles.attendeeFooterLink,
                  { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
                ]}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#0EA5E9', fontSize: 13, fontWeight: '700' }}>
                  {liveDashboardAttendees.length > 5
                    ? `View all ${liveDashboardAttendees.length} attendees & Join Card`
                    : 'Open Join Card & Full Controls'}
                </Text>
                <ChevronRight size={16} color="#0EA5E9" />
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <View
          style={[
            styles.emptyContainer,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
              marginTop: 0,
              paddingVertical: 22,
            },
          ]}
        >
          <Users size={28} color={secondaryText} style={{ opacity: 0.6 }} />
          <Text style={[styles.emptyTitle, { color: primaryText, fontSize: 15 }]}>
            No live session right now
          </Text>
          <Text style={[styles.emptySub, { color: secondaryText }]}>
            Start a scheduled meeting to monitor live attendance, or tap any meeting card above to inspect its attendance list.
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const renderSelectedMeeting = (m: any) => {
    const status = resolveMeetingStatus(m, false);
    const isLive = status === 'live';
    const isCompleted = status === 'completed';
    const isZoom = m.provider === 'zoom' || m.meetingType === 'zoom';
    const busy = actionBusyId === m.id;
    const { dateStr, timeStr } = formatMeetingSchedule(m);
    const subtitleText = String(m.topic || m.subtitle || '').trim();
    const bookText = String(m.bibleBook || '').trim();
    const hostName = String(m.teacher || m.teacherName || '').trim();
    const descText = String(m.description || '').trim();
    const cardBgColor = isLive ? '#991b1b' : isCompleted ? '#374151' : '#1a2d5a';
    const circleBgColor = isLive ? '#7f1d1d' : isCompleted ? '#1f2937' : '#0f1e3d';

    return (
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Restored Meeting Join / Detail Card ── */}
        <View style={[styles.joinDetailCard, { backgroundColor: cardBgColor }]}>
          <View style={[styles.joinDetailCircle, { backgroundColor: circleBgColor }]} />

          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {isLive ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4ADE80', marginRight: 6 }} />
                <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4 }}>LIVE NOW</Text>
              </View>
            ) : isCompleted ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: '#E5E7EB', fontSize: 11.5, fontWeight: '700' }}>COMPLETED</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FBBF24' }}>
                <Text style={{ color: '#FDE68A', fontSize: 11.5, fontWeight: '800' }}>SCHEDULED</Text>
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isZoom ? 'rgba(45, 140, 255, 0.35)' : 'rgba(16, 185, 129, 0.35)',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isZoom ? '#2D8CFF' : '#10B981',
              }}
            >
              <Video size={12} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' }}>
                {isZoom ? 'Zoom Meeting' : 'Google Meet'}
              </Text>
            </View>
          </View>

          <Text style={styles.joinDetailTitle}>{m.title || 'Online Meeting'}</Text>
          {subtitleText ? <Text style={styles.joinDetailSub}>{subtitleText}</Text> : null}

          <View style={styles.joinDetailDivider} />

          <View style={styles.joinDetailRow}>
            <Calendar size={17} color="rgba(255,255,255,0.8)" />
            <Text style={styles.joinDetailRowText}>{dateStr}</Text>
          </View>

          {timeStr ? (
            <View style={styles.joinDetailRow}>
              <Clock size={17} color="rgba(255,255,255,0.8)" />
              <Text style={styles.joinDetailRowText}>{timeStr}</Text>
            </View>
          ) : null}

          {bookText ? (
            <View style={styles.joinDetailRow}>
              <BookOpen size={17} color="rgba(255,255,255,0.8)" />
              <Text style={styles.joinDetailRowText}>{bookText}</Text>
            </View>
          ) : null}

          {hostName ? (
            <View style={styles.joinDetailRow}>
              <User size={17} color="rgba(255,255,255,0.8)" />
              <Text style={styles.joinDetailRowText}>Host: {hostName}</Text>
            </View>
          ) : null}

          {m.password ? (
            <View style={[styles.joinDetailRow, { justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 4 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                <Key size={17} color="#FCD34D" />
                <Text style={[styles.joinDetailRowText, { marginLeft: 8 }]}>
                  Passcode: <Text style={{ fontWeight: '800', color: '#FCD34D' }}>{m.password}</Text>
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => copyMeetingPasscode(m.password)}
                style={{ backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Copy size={12} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Copy</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {descText && descText !== subtitleText ? (
            <View style={[styles.joinDetailRow, { alignItems: 'flex-start', marginTop: 6 }]}>
              <BookOpen size={17} color="rgba(255,255,255,0.75)" style={{ marginTop: 2 }} />
              <Text style={[styles.joinDetailRowText, { opacity: 0.9, lineHeight: 21 }]}>{descText}</Text>
            </View>
          ) : null}

          {/* Primary Action Inside Join Card */}
          <View style={{ marginTop: 14 }}>
            {status === 'scheduled' ? (
              <TouchableOpacity
                style={[styles.detailPrimaryBtn, { backgroundColor: '#10B981' }, busy && { opacity: 0.65 }]}
                onPress={() => handleGoLive(m)}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Play size={17} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={[styles.detailPrimaryBtnText, { color: '#FFFFFF' }]}>
                  Go Live & Notify Members
                </Text>
              </TouchableOpacity>
            ) : isLive ? (
              <TouchableOpacity
                style={[styles.detailPrimaryBtn, { backgroundColor: '#FFFFFF' }]}
                onPress={() => {
                  launchOnlineMeetingUrl(m, member?.name || 'Church Admin').catch(() => {});
                }}
                activeOpacity={0.85}
              >
                <ExternalLink size={17} color={cardBgColor} />
                <Text style={[styles.detailPrimaryBtnText, { color: cardBgColor }]}>
                  {isZoom ? 'Join Live Zoom Meeting' : 'Join Live Google Meet'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.detailPrimaryBtn, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                <CheckCircle size={17} color="#E5E7EB" />
                <Text style={[styles.detailPrimaryBtnText, { color: '#E5E7EB' }]}>
                  Meeting Completed
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Secondary Management Controls */}
        <View style={styles.detailSecondaryRow}>
          {!isCompleted ? (
            <TouchableOpacity
              style={[
                styles.detailSecondaryBtn,
                {
                  backgroundColor: cardSurface,
                  borderColor: isDark ? 'rgba(255,255,255,0.16)' : adminBorderColor,
                },
              ]}
              onPress={() => startEditingMeeting(m)}
              activeOpacity={0.85}
            >
              <Pencil size={15} color={primaryText} />
              <Text
                style={[styles.detailSecondaryBtnText, { color: primaryText }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {isLive ? 'Edit' : 'Edit Meeting'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isLive ? (
            <TouchableOpacity
              style={[
                styles.detailSecondaryBtn,
                {
                  backgroundColor: 'rgba(239, 68, 68, 0.14)',
                  borderColor: 'rgba(239, 68, 68, 0.42)',
                },
                busy && { opacity: 0.6 },
              ]}
              onPress={() => handleEndLive(m)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Square size={14} color="#EF4444" fill="#EF4444" />
              <Text
                style={[styles.detailSecondaryBtnText, { color: '#EF4444' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                End Live
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.detailSecondaryBtn,
              {
                backgroundColor: 'rgba(239, 68, 68, 0.10)',
                borderColor: 'rgba(239, 68, 68, 0.34)',
              },
            ]}
            onPress={() => handleDeleteMeeting(m)}
            activeOpacity={0.85}
          >
            <Trash2 size={15} color="#EF4444" />
            <Text
              style={[styles.detailSecondaryBtnText, { color: '#EF4444' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {isCompleted ? 'Delete Record' : 'Delete'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Live Attendance Roster ── */}
        <View style={styles.recentHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Users size={19} color={primaryText} />
            <Text style={[styles.sectionTitle, { color: primaryText }]}>
              Live Attendance ({attendees.length})
            </Text>
          </View>
          {isLive ? (
            <View style={styles.attendeeCountChip}>
              <View style={styles.attendeeLiveDot} />
              <Text style={styles.attendeeCountChipText}>Real-Time</Text>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.liveAttendanceCard,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : adminBorderColor,
            },
          ]}
        >
          {attendeesLoading ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={primaryText} />
            </View>
          ) : attendees.length === 0 ? (
            <View style={styles.attendeeEmptyBox}>
              <Users size={26} color={secondaryText} style={{ opacity: 0.55, marginBottom: 6 }} />
              <Text style={[styles.emptyTitle, { color: primaryText, marginTop: 0, fontSize: 15 }]}>
                No attendees yet
              </Text>
              <Text style={[styles.emptySub, { color: secondaryText }]}>
                Members who join this meeting will appear here automatically.
              </Text>
            </View>
          ) : (
            attendees.map((a, idx, arr) => renderAttendeeRow(a, idx, arr.length))
          )}
        </View>
      </ScrollView>
    );
  };

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
        getFilteredMeetings().map((m) => renderMeetingCard(m))
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
              : resolvedSelectedMeeting
              ? 'Meeting Details'
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
              onSaved={(updated) => {
                if (selectedMeeting && updated) {
                  setSelectedMeeting((prev: any) => (prev ? { ...prev, ...updated } : prev));
                }
                setEditingMeeting(null);
              }}
              initialProvider={selectedProvider}
              hideHeader={true}
            />
          ) : createMode ? (
            <AdminZoomMeetingsCreate 
              onBack={() => setCreateMode(false)} 
              initialProvider={selectedProvider} 
              hideHeader={true}
            />
          ) : resolvedSelectedMeeting ? (
            renderSelectedMeeting(resolvedSelectedMeeting)
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
      {canManageMeetings && !loading && !createMode && !editingMeeting && !resolvedSelectedMeeting ? (
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
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  historyTitle: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: '700',
    marginRight: 4,
    lineHeight: 22,
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
  cardMetaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  platformMiniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  platformMiniChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  attendeeCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  attendeeCountChipText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
  },
  cardHostText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardActionsDivider: {
    height: 1,
    marginVertical: 12,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardActionLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardActionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  cardActionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGoLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#10B981',
  },
  cardGoLiveText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  cardEndBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  cardEndText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '800',
  },
  liveAttendanceCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  liveAttendanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  attendeeAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  attendeeAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeAvatarText: {
    fontSize: 15,
    fontWeight: '800',
  },
  attendeeName: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  attendeeTime: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  attendeeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  attendeeLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  attendeeStatusText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  attendeeEmptyBox: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeFooterLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  joinDetailCard: {
    borderRadius: 22,
    padding: 20,
    overflow: 'hidden',
    marginBottom: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  joinDetailCircle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -60,
    right: -45,
    opacity: 0.45,
  },
  joinDetailTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
    marginBottom: 4,
  },
  joinDetailSub: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14.5,
    fontWeight: '600',
    marginBottom: 12,
  },
  joinDetailDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 12,
  },
  joinDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  joinDetailRowText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    flex: 1,
  },
  detailPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  detailPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  detailSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailSecondaryBtn: {
    flex: 1,
    minWidth: 0,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.2,
  },
  detailSecondaryBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
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
