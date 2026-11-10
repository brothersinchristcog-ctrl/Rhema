import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Music,
  BookOpen,
  ChevronRight,
  ShieldCheck,
  CalendarX,
  Plus,
  Trash2,
  Radio,
  X,
  Volume2,
  Mic,
  Smile,
  Sparkles,
  Layers,
  Users,
  ListChecks,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useAdminTheme } from '../utils/adminThemeHelper';
import ServiceRosterService from '../services/ServiceRosterService';
import {
  MemberServiceDuty,
  SetlistItem,
  ServiceRehearsal,
  MemberAvailabilityRecord,
  ServicePlan,
  RunSheetItem,
} from '../types/serviceRoster';
import { formatDateMonthYear, formatTimeTo12Hour } from '../utils/DateUtils';

const { width } = Dimensions.get('window');

const DECLINE_REASONS = [
  'Out of town / Traveling',
  'Work / Business commitment',
  'Family engagement / Function',
  'Health / Not feeling well',
  'Academic exams / Studies',
  'Other personal reason',
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  preparation: { bg: '#F3F4F6', text: '#4B5563' },
  starting_prayer: { bg: '#FEF3C7', text: '#92400E' },
  opening_song: { bg: '#EDE9FE', text: '#5B21B6' },
  worship_songs: { bg: '#FDF2F8', text: '#9D174D' },
  music: { bg: '#E0E7FF', text: '#3730A3' },
  bible_reading: { bg: '#E0F2FE', text: '#0369A1' },
  offering: { bg: '#ECFDF5', text: '#065F46' },
  announcements: { bg: '#FFFBEB', text: '#B45309' },
  sermon: { bg: '#FEF3C7', text: '#92400E' },
  communion: { bg: '#FCE7F3', text: '#831843' },
  special_performance: { bg: '#F5F3FF', text: '#6D28D9' },
  closing_prayer: { bg: '#FEF2F2', text: '#991B1B' },
  benediction: { bg: '#F0FDF4', text: '#166534' },
  break: { bg: '#F3F4F6', text: '#6B7280' },
  other: { bg: '#F1F5F9', text: '#334155' }
};

export default function MyServiceScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { activeChurch } = useChurch();
  const { isDark, screenBg, cardSurface, primaryText, secondaryText, borderColor } =
    useAdminTheme();

  const publishBtnBg = isDark ? '#10B981' : '#2E6B4F';
  const primaryBtnBg = isDark ? '#FFFFFF' : '#000000';
  const primaryBtnText = isDark ? '#000000' : '#FFFFFF';

  const churchId = route?.params?.churchId || activeChurch?.id || 'rhema';
  const memberId = member?.id || '';

  // Tab: 'roster' (Full Service Roster) | 'responsibilities' (Upcoming & Pending Personal Responsibilities)
  const [activeTab, setActiveTab] = useState<'roster' | 'responsibilities'>('roster');

  const [duties, setDuties] = useState<MemberServiceDuty[]>([]);
  const [publishedPlans, setPublishedPlans] = useState<ServicePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(route?.params?.serviceId || '');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Decline Modal state
  const [selectedDutyForDecline, setSelectedDutyForDecline] = useState<MemberServiceDuty | null>(
    null
  );
  const [declineReason, setDeclineReason] = useState<string>(DECLINE_REASONS[0]);
  const [customDeclineReason, setCustomDeclineReason] = useState<string>('');
  const [submittingResponse, setSubmittingResponse] = useState<boolean>(false);

  // Lyrics Sheet Modal state
  const [showLyricsModal, setShowLyricsModal] = useState<boolean>(false);
  const [selectedSongForLyrics, setSelectedSongForLyrics] = useState<SetlistItem | null>(null);

  // Availability state
  const [blockouts, setBlockouts] = useState<Array<{ date: string; reason?: string }>>([]);
  const [showAddBlockoutModal, setShowAddBlockoutModal] = useState<boolean>(false);
  const [newBlockoutDate, setNewBlockoutDate] = useState<string>('');
  const [newBlockoutReason, setNewBlockoutReason] = useState<string>('Traveling / Family commitment');
  const [savingBlockout, setSavingBlockout] = useState<boolean>(false);

  const fetchDuties = useCallback(async () => {
    if (!churchId || !memberId) {
      setLoading(false);
      return;
    }
    try {
      const list = await ServiceRosterService.getMemberUpcomingDuties(churchId, memberId, member?.name);
      setDuties(list);
      if (list.length === 0) {
        setActiveTab('roster');
      }

      // Fetch published church service plans for full service roster view
      const allPlans = await ServiceRosterService.getServicePlans(churchId);
      const today = new Date().toISOString().split('T')[0];
      const allPublished = (allPlans || []).filter(p => p.status === 'published' || p.status === 'live');
      const upcoming = allPublished.filter(p => p.date >= today).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const published = upcoming.length > 0 ? upcoming : allPublished.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setPublishedPlans(published);
      if (published.length > 0) {
        setSelectedPlanId(prev => prev && published.some(p => p.id === prev) ? prev : (route?.params?.serviceId || published[0].id));
      }

      // Also fetch blockout dates
      const avail = await ServiceRosterService.getMemberAvailability(churchId, memberId);
      setBlockouts(
        avail?.blockouts ||
          (avail?.unavailableDates || []).map((d: string) => ({ date: d, reason: 'Unavailable' }))
      );
    } catch (err) {
      console.error('[MyServiceScreen] fetchDuties error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [churchId, memberId]);

  useEffect(() => {
    fetchDuties();

    // Listen to real-time updates
    const unsubscribe = ServiceRosterService.listenMemberUpcomingDuties(
      churchId,
      memberId,
      (updatedList) => {
        setDuties(updatedList);
      }
    );

    return () => unsubscribe();
  }, [churchId, memberId, fetchDuties]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDuties();
  };

  // ── 1-Tap Accept Responsibility ──
  const handleAcceptDuty = async (duty: MemberServiceDuty) => {
    Alert.alert(
      'Accept Responsibility',
      `Confirm your responsibility as "${duty.roleTitle}" for "${duty.serviceTitle}" on ${formatDateMonthYear(duty.date)}? First to accept gets booked.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Accept Responsibility',
          style: 'default',
          onPress: async () => {
            try {
              setSubmittingResponse(true);
              await ServiceRosterService.respondToAssignment(
                churchId,
                duty.serviceId,
                duty.roleId,
                memberId,
                'accept',
                undefined,
                member?.name
              );
              Alert.alert(
                'Responsibility Booked! 🎉',
                `Thank you for your service! Your role as "${duty.roleTitle}" is confirmed and booked. Reporting call time is ${duty.callTime}.`
              );
              fetchDuties();
            } catch (err: any) {
              const msg = err.message || 'Failed to accept responsibility.';
              if (msg.includes('already been booked')) {
                Alert.alert('Slot Already Booked', msg);
              } else {
                Alert.alert('Error', msg);
              }
            } finally {
              setSubmittingResponse(false);
            }
          },
        },
      ]
    );
  };

  // ── Decline Responsibility with Reason Modal ──
  const handleConfirmDecline = async () => {
    if (!selectedDutyForDecline) return;
    const finalReason =
      declineReason === 'Other personal reason' && customDeclineReason.trim()
        ? customDeclineReason.trim()
        : declineReason;

    try {
      setSubmittingResponse(true);
      await ServiceRosterService.respondToAssignment(
        churchId,
        selectedDutyForDecline.serviceId,
        selectedDutyForDecline.roleId,
        memberId,
        'decline',
        finalReason,
        member?.name
      );

      setSelectedDutyForDecline(null);
      Alert.alert(
        'Response Recorded',
        'Thank you for informing us. The slot is available for other eligible volunteers.'
      );
      fetchDuties();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record response.');
    } finally {
      setSubmittingResponse(false);
    }
  };

  // ── Delete / Cancel Responsibility Assignment ──
  const handleDeleteOrCancelDuty = (duty: MemberServiceDuty) => {
    Alert.alert(
      'Cancel Responsibility',
      `Are you sure you want to cancel your responsibility for "${duty.roleTitle}" on ${formatDateMonthYear(duty.date)}? This will make the slot available for other eligible members.`,
      [
        { text: 'Keep Responsibility', style: 'cancel' },
        {
          text: 'Cancel Responsibility',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmittingResponse(true);
              await ServiceRosterService.cancelOrDeleteDutyAssignment(
                churchId,
                duty.serviceId,
                duty.roleId,
                memberId,
                member?.name,
                'Canceled by member'
              );
              // Optimistically remove from local state
              setDuties(prev => prev.filter(d => d.id !== duty.id && !(d.serviceId === duty.serviceId && d.roleId === duty.roleId)));
              Alert.alert('Responsibility Cancelled', 'Your responsibility has been removed and reopened for other members.');
              fetchDuties();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel responsibility.');
            } finally {
              setSubmittingResponse(false);
            }
          }
        }
      ]
    );
  };

  // ── Blockout Dates Handlers ──
  const handleSaveBlockout = async () => {
    if (!newBlockoutDate.trim()) {
      Alert.alert('Required', 'Please enter unavailable date (YYYY-MM-DD).');
      return;
    }
    try {
      setSavingBlockout(true);
      const memberName = member?.name || 'Church Volunteer';
      await ServiceRosterService.addMemberBlockoutDate(
        churchId,
        memberId,
        memberName,
        newBlockoutDate.trim(),
        newBlockoutReason.trim()
      );
      setShowAddBlockoutModal(false);
      setNewBlockoutDate('');
      fetchDuties();
      Alert.alert('Blockout Added', 'Admins will see that you are unavailable on this date.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add blockout date.');
    } finally {
      setSavingBlockout(false);
    }
  };

  const handleRemoveBlockout = async (date: string) => {
    Alert.alert('Remove Blockout', `Mark yourself as available again on ${date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await ServiceRosterService.removeMemberBlockoutDate(churchId, memberId, date);
            fetchDuties();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to remove blockout.');
          }
        },
      },
    ]);
  };

  // Group duties
  const pendingInvitations = duties.filter((d) => d.status === 'pending');
  const confirmedDuties = duties.filter(
    (d) => d.status === 'confirmed' || d.status === 'accepted'
  );

  const selectedPlan = publishedPlans.find(p => p.id === selectedPlanId) || publishedPlans[0] || null;

  // Aggregate all songs from upcoming confirmed duties or selected plan for setlist practice
  const practiceSongs: Array<{ song: SetlistItem; serviceTitle: string; serviceDate: string }> = [];
  if (confirmedDuties.length > 0) {
    confirmedDuties.forEach((d) => {
      (d.setlist || []).forEach((s) => {
        practiceSongs.push({
          song: s,
          serviceTitle: d.serviceTitle,
          serviceDate: d.date,
        });
      });
    });
  } else if (selectedPlan?.setlist) {
    (selectedPlan.setlist || []).forEach((s) => {
      practiceSongs.push({
        song: s,
        serviceTitle: selectedPlan.serviceTitle,
        serviceDate: selectedPlan.date,
      });
    });
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBg, paddingTop: insets.top }]}>
      {/* ── HEADER BAR ── */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: cardSurface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={primaryText} />
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 10 }}>
          <Text style={[styles.headerSub, { color: secondaryText }]}>
            {activeChurch?.name || 'Rhema Global Ministries'}
          </Text>
          <Text style={[styles.headerTitle, { color: primaryText }]}>
            Service Roster · సేవా బాధ్యతలు
          </Text>
        </View>

        {pendingInvitations.length > 0 && (
          <View style={styles.pendingBadgeHeader}>
            <Text style={styles.pendingBadgeHeaderTxt}>
              {pendingInvitations.length} Pending
            </Text>
          </View>
        )}
      </View>

      {/* ── NAVIGATION TABS (Only visible to members assigned to duties like keyboard, band, or order of service) ── */}
      {duties.length > 0 && (
        <View style={[styles.tabsBarWrapper, { backgroundColor: cardSurface, borderBottomColor: borderColor }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'roster' ? {
                  backgroundColor: primaryBtnBg,
                  borderColor: primaryBtnBg,
                } : {
                  backgroundColor: isDark ? '#18181B' : '#F8FAFC',
                  borderColor,
                }
              ]}
              onPress={() => setActiveTab('roster')}
              activeOpacity={0.8}
            >
              <Layers
                size={14}
                color={activeTab === 'roster' ? primaryBtnText : secondaryText}
              />
              <Text
                style={[
                  styles.tabBtnTxt,
                  activeTab === 'roster' ? { color: primaryBtnText, fontWeight: '800' } : { color: secondaryText }
                ]}
              >
                Service Roster
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'responsibilities' ? {
                  backgroundColor: primaryBtnBg,
                  borderColor: primaryBtnBg,
                } : {
                  backgroundColor: isDark ? '#18181B' : '#F8FAFC',
                  borderColor,
                }
              ]}
              onPress={() => setActiveTab('responsibilities')}
              activeOpacity={0.8}
            >
              <Calendar
                size={14}
                color={activeTab === 'responsibilities' ? primaryBtnText : secondaryText}
              />
              <Text
                style={[
                  styles.tabBtnTxt,
                  activeTab === 'responsibilities' ? { color: primaryBtnText, fontWeight: '800' } : { color: secondaryText }
                ]}
              >
                My Responsibilities ({duties.length})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={[styles.loadingTxt, { color: secondaryText }]}>
            Loading your ministry duties...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
          showsVerticalScrollIndicator={false}
        >
          {/* =========================================================================
              TAB 0: FULL CHURCH SERVICE ROSTER (ACCESSIBLE TO ALL MEMBERS)
              ========================================================================= */}
          {activeTab === 'roster' && (
            <View>
              {publishedPlans.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Smile size={38} color="#94A3B8" style={{ marginBottom: 10 }} />
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>
                    No Published Service Roster Yet
                  </Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
                    The church worship team and coordinators have not published the upcoming service roster yet. Check back soon!
                  </Text>
                </View>
              ) : (
                <View>
                  {/* Multiple Service Horizontal Picker */}
                  {publishedPlans.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.sectionTitle, { color: secondaryText, fontSize: 11, marginBottom: 6 }]}>
                        UPCOMING SERVICES ({publishedPlans.length})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {publishedPlans.map((p) => {
                          const isSel = selectedPlan?.id === p.id;
                          return (
                            <TouchableOpacity
                              key={p.id}
                              style={[
                                styles.servicePickerChip,
                                { backgroundColor: isSel ? publishBtnBg : cardSurface, borderColor: isSel ? publishBtnBg : borderColor }
                              ]}
                              onPress={() => setSelectedPlanId(p.id)}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.servicePickerChipTitle, { color: isSel ? '#FFFFFF' : primaryText }]}>
                                {p.serviceTitle}
                              </Text>
                              <Text style={[styles.servicePickerChipDate, { color: isSel ? 'rgba(255,255,255,0.85)' : secondaryText }]}>
                                {formatDateMonthYear(p.date)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {selectedPlan && (
                    <View>
                      {/* SERVICE OVERVIEW BANNER */}
                      <View style={[styles.rosterServiceBanner, { backgroundColor: cardSurface, borderColor }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                            <Text style={styles.rosterBannerTag}>PUBLISHED CHURCH SERVICE</Text>
                          </View>
                          <Text style={[styles.rosterBannerDate, { color: isDark ? '#34D399' : '#059669' }]}>
                            {formatDateMonthYear(selectedPlan.date)}
                          </Text>
                        </View>

                        <Text style={[styles.rosterBannerTitle, { color: primaryText }]}>
                          {selectedPlan.serviceTitle}
                        </Text>

                        {/* Timing, Location, Preacher */}
                        <View style={{ marginTop: 8, gap: 5 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Clock size={13} color={secondaryText} />
                            <Text style={{ fontSize: 12, color: primaryText, fontWeight: '600' }}>
                              {formatTimeTo12Hour(selectedPlan.startTime)} - {formatTimeTo12Hour(selectedPlan.endTime)}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MapPin size={13} color={secondaryText} />
                            <Text style={{ fontSize: 12, color: secondaryText }}>
                              {selectedPlan.location || 'Church Sanctuary'}
                            </Text>
                          </View>
                          {selectedPlan.preacher ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <BookOpen size={13} color={secondaryText} />
                              <Text style={{ fontSize: 12, color: secondaryText }}>
                                Preacher / Speaker: <Text style={{ fontWeight: '700', color: primaryText }}>{selectedPlan.preacher}</Text>
                              </Text>
                            </View>
                          ) : null}
                          {selectedPlan.theme ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Sparkles size={13} color="#D97706" />
                              <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '600' }}>
                                Theme: {selectedPlan.theme}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Personal Duty Callout inside this service */}
                        {(() => {
                          const myDutyInThisService = duties.find(d => d.serviceId === selectedPlan.id);
                          if (!myDutyInThisService) return null;
                          const isPending = myDutyInThisService.status === 'pending';
                          return (
                            <View style={[
                              styles.personalCalloutBox,
                              {
                                backgroundColor: isPending ? (isDark ? 'rgba(217, 119, 6, 0.15)' : '#FEF3C7') : (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5'),
                                borderColor: isPending ? '#D97706' : '#10B981'
                              }
                            ]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <AlertCircle size={15} color={isPending ? '#D97706' : '#10B981'} />
                                <Text style={{ fontSize: 11.5, fontWeight: '800', color: isPending ? '#D97706' : '#059669' }}>
                                  {isPending ? 'YOU ARE REQUESTED TO SERVE · ACTION REQUIRED' : 'CONFIRMED SERVICE RESPONSIBILITY'}
                                </Text>
                              </View>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: primaryText }}>
                                Role: {myDutyInThisService.roleTitle}
                              </Text>
                              <Text style={{ fontSize: 11.5, color: secondaryText, marginTop: 2 }}>
                                Reporting Call Time: <Text style={{ fontWeight: '700', color: primaryText }}>{myDutyInThisService.callTime}</Text>
                              </Text>

                              {isPending && (
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                                  <TouchableOpacity
                                    style={[styles.dutyAcceptBtn, { flex: 1, paddingVertical: 8, backgroundColor: publishBtnBg }]}
                                    onPress={() => handleAcceptDuty(myDutyInThisService)}
                                  >
                                    <CheckCircle2 size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                                    <Text style={[styles.dutyAcceptBtnTxt, { fontSize: 12 }]}>Accept Duty</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.dutyDeclineBtn, { flex: 1, paddingVertical: 8 }]}
                                    onPress={() => setSelectedDutyForDecline(myDutyInThisService)}
                                  >
                                    <XCircle size={14} color="#EF4444" style={{ marginRight: 4 }} />
                                    <Text style={[styles.dutyDeclineBtnTxt, { fontSize: 12 }]}>Decline</Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          );
                        })()}
                      </View>

                      {/* 1. SERVICE WORSHIP BAND & MUSICIANS ROSTER */}
                      <View style={[styles.rosterSectionCard, { backgroundColor: cardSurface, borderColor }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                          <Music size={16} color={isDark ? '#34D399' : '#2E6B4F'} />
                          <View>
                            <Text style={[styles.sectionTitle, { color: primaryText, marginBottom: 0 }]}>
                              SERVICE WORSHIP BAND & MUSICIANS
                            </Text>
                            <Text style={{ fontSize: 10.5, color: secondaryText }}>
                              Assigned for the entire service and all setlist songs
                            </Text>
                          </View>
                        </View>

                        {/* 2-Column Symmetric Responsive Grid */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
                          {[
                            { emoji: '🎹', role: 'KEYBOARD', name: selectedPlan.assignments?.['role_keyboard'], key: 'role_keyboard' },
                            { emoji: '🥁', role: 'DRUMS', name: selectedPlan.assignments?.['role_drums'], key: 'role_drums' },
                            { emoji: '🎸', role: 'BASS GUITAR', name: selectedPlan.assignments?.['role_bass'], key: 'role_bass' },
                            { emoji: '🎸', role: 'ACOUSTIC GUITAR', name: selectedPlan.assignments?.['role_acoustic'], key: 'role_acoustic' },
                            { emoji: '⚡', role: 'ELECTRIC GUITAR', name: selectedPlan.assignments?.['role_electric'], key: 'role_electric' },
                            { emoji: '🎧', role: 'SOUND / AUDIO', name: selectedPlan.assignments?.['role_sound'], key: 'role_sound' },
                          ].map((inst) => {
                            const isMyRole = (selectedPlan.assignmentMemberIds?.[inst.key] === memberId) ||
                              (member?.name && inst.name && member.name.toLowerCase().trim() === inst.name.toLowerCase().trim());
                            return (
                              <View
                                key={inst.role}
                                style={[
                                  styles.bandMemberPill,
                                  {
                                    backgroundColor: isMyRole ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : (isDark ? '#27272A' : '#F8FAFC'),
                                    borderColor: isMyRole ? '#10B981' : borderColor,
                                    borderWidth: isMyRole ? 1.5 : 1
                                  }
                                ]}
                              >
                                <Text style={{ fontSize: 14 }}>{inst.emoji}</Text>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{ fontSize: 9.5, color: secondaryText, fontWeight: '700' }} numberOfLines={1}>
                                      {inst.role}
                                    </Text>
                                    {isMyRole && (
                                      <Text style={{ fontSize: 8.5, color: '#10B981', fontWeight: '800' }}>YOU</Text>
                                    )}
                                  </View>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: inst.name ? primaryText : '#94A3B8' }} numberOfLines={1}>
                                    {inst.name || 'Not Assigned'}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}

                          {/* Worship Leader */}
                          {selectedPlan.assignments?.['role_worship_leader'] ? (
                            <View style={[
                              styles.bandMemberPill,
                              {
                                width: '100%',
                                backgroundColor: ((selectedPlan.assignmentMemberIds?.['role_worship_leader'] === memberId) ||
                                  (member?.name && selectedPlan.assignments['role_worship_leader'] && member.name.toLowerCase().trim() === selectedPlan.assignments['role_worship_leader'].toLowerCase().trim()))
                                  ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                                  : (isDark ? '#27272A' : '#F8FAFC'),
                                borderColor: ((selectedPlan.assignmentMemberIds?.['role_worship_leader'] === memberId) ||
                                  (member?.name && selectedPlan.assignments['role_worship_leader'] && member.name.toLowerCase().trim() === selectedPlan.assignments['role_worship_leader'].toLowerCase().trim()))
                                  ? '#10B981' : borderColor,
                                borderWidth: 1
                              }
                            ]}>
                              <Text style={{ fontSize: 14 }}>🎤</Text>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={{ fontSize: 9.5, color: secondaryText, fontWeight: '700' }} numberOfLines={1}>WORSHIP LEADER</Text>
                                  {((selectedPlan.assignmentMemberIds?.['role_worship_leader'] === memberId) ||
                                    (member?.name && selectedPlan.assignments['role_worship_leader'] && member.name.toLowerCase().trim() === selectedPlan.assignments['role_worship_leader'].toLowerCase().trim())) && (
                                    <Text style={{ fontSize: 8.5, color: '#10B981', fontWeight: '800' }}>YOU</Text>
                                  )}
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: primaryText }} numberOfLines={1}>
                                  {selectedPlan.assignments['role_worship_leader']}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      {/* 2. ORDER OF SERVICE TIMELINE & ROSTER */}
                      <View style={[styles.rosterSectionCard, { backgroundColor: cardSurface, borderColor }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                          <ListChecks size={16} color={isDark ? '#34D399' : '#2E6B4F'} />
                          <View>
                            <Text style={[styles.sectionTitle, { color: primaryText, marginBottom: 0 }]}>
                              ORDER OF SERVICE & RESPONSIBILITIES
                            </Text>
                            <Text style={{ fontSize: 10.5, color: secondaryText }}>
                              {selectedPlan.runSheet?.length || 0} Scheduled program items
                            </Text>
                          </View>
                        </View>

                        {(!selectedPlan.runSheet || selectedPlan.runSheet.length === 0) ? (
                          <Text style={{ fontSize: 12, color: secondaryText, fontStyle: 'italic', paddingVertical: 8 }}>
                            Order of service details will appear here once finalized by coordinators.
                          </Text>
                        ) : (
                          selectedPlan.runSheet.map((item, idx) => {
                            const catColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS['other'];
                            const isMyItem = item.responsibleMemberId === memberId ||
                              (member?.name && item.responsiblePerson && member.name.toLowerCase().trim() === item.responsiblePerson.toLowerCase().trim());

                            return (
                              <View
                                key={item.id || `run_${idx}`}
                                style={[
                                  styles.runSheetItemRow,
                                  {
                                    backgroundColor: isMyItem ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4') : (isDark ? '#27272A' : '#FAFAF9'),
                                    borderColor: isMyItem ? '#10B981' : borderColor,
                                    borderWidth: isMyItem ? 1.5 : 1
                                  }
                                ]}
                              >
                                <View style={{ width: 22, alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: secondaryText }}>
                                    {idx + 1}
                                  </Text>
                                </View>

                                <View style={{ flex: 1, paddingHorizontal: 6 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                                    <View style={[styles.categoryBadge, { backgroundColor: catColor.bg }]}>
                                      <Text style={[styles.categoryBadgeTxt, { color: catColor.text }]}>
                                        {item.category.replace('_', ' ').toUpperCase()}
                                      </Text>
                                    </View>
                                    <Text style={{ fontSize: 10.5, color: secondaryText, fontWeight: '600' }}>
                                      {formatTimeTo12Hour(item.startTime)} - {formatTimeTo12Hour(item.endTime)} ({item.durationMinutes}m)
                                    </Text>
                                  </View>

                                  <Text style={[styles.runSheetProgramTitle, { color: primaryText }]}>
                                    {item.program}
                                  </Text>

                                  {item.responsiblePerson ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                      <Text style={{ fontSize: 11.5, color: secondaryText }}>
                                        👤 Assigned: <Text style={{ fontWeight: '700', color: isMyItem ? (isDark ? '#34D399' : '#059669') : primaryText }}>
                                          {item.responsiblePerson}
                                        </Text>
                                      </Text>
                                      {isMyItem && (
                                        <View style={{ backgroundColor: '#10B981', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                          <Text style={{ fontSize: 8.5, color: '#FFFFFF', fontWeight: '800' }}>YOUR DUTY</Text>
                                        </View>
                                      )}
                                    </View>
                                  ) : (
                                    <Text style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginTop: 2 }}>
                                      Unassigned
                                    </Text>
                                  )}
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>

                      {/* 3. WORSHIP SETLIST SONGS */}
                      {selectedPlan.setlist && selectedPlan.setlist.length > 0 && (
                        <View style={[styles.rosterSectionCard, { backgroundColor: cardSurface, borderColor }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                            <Music size={16} color={isDark ? '#34D399' : '#2E6B4F'} />
                            <View>
                              <Text style={[styles.sectionTitle, { color: primaryText, marginBottom: 0 }]}>
                                WORSHIP SETLIST ({selectedPlan.setlist.length} Songs)
                              </Text>
                              <Text style={{ fontSize: 10.5, color: secondaryText }}>
                                Praise & worship songs selected for this service
                              </Text>
                            </View>
                          </View>

                          {selectedPlan.setlist.map((song, sIdx) => (
                            <View
                              key={song.id || `set_${sIdx}`}
                              style={[styles.setlistSongCard, { backgroundColor: isDark ? '#27272A' : '#FAFAF9', borderColor }]}
                            >
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                  <View style={styles.songKeyPill}>
                                    <Text style={styles.songKeyPillTxt}>Key {song.key || 'G'}</Text>
                                  </View>
                                  {song.tempo ? (
                                    <View style={styles.songBpmPill}>
                                      <Text style={styles.songBpmPillTxt}>{song.tempo} BPM</Text>
                                    </View>
                                  ) : null}
                                  {song.timeSignature ? (
                                    <View style={styles.songBpmPill}>
                                      <Text style={styles.songBpmPillTxt}>{song.timeSignature}</Text>
                                    </View>
                                  ) : null}
                                </View>

                                <Text style={[styles.songTitleTxt, { color: primaryText }]}>
                                  {sIdx + 1}. {song.title}
                                </Text>
                                {song.titleTe ? (
                                  <Text style={[styles.songSubTxt, { color: '#D97706' }]}>
                                    {song.titleTe}
                                  </Text>
                                ) : null}
                                <Text style={{ fontSize: 11, color: secondaryText, marginTop: 2 }}>
                                  Lead: <Text style={{ fontWeight: '700', color: primaryText }}>{song.ledBy || selectedPlan.assignments?.['role_worship_leader'] || 'Worship Team'}</Text>
                                </Text>
                              </View>

                              {(song.lyricsTe || song.lyricsEn) && (
                                <TouchableOpacity
                                  style={[styles.viewLyricsBtn, { backgroundColor: publishBtnBg }]}
                                  onPress={() => {
                                    setSelectedSongForLyrics(song);
                                    setShowLyricsModal(true);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <BookOpen size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                                  <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '700' }}>Lyrics</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* =========================================================================
              TAB 1: UPCOMING RESPONSIBILITIES & PENDING INVITATIONS
              ========================================================================= */}
          {activeTab === 'responsibilities' && (
            <View>
              {/* SECTION: PENDING ACTIONABLE INVITATIONS */}
              {pendingInvitations.length > 0 && (
                <View style={styles.sectionWrap}>
                  <View style={styles.sectionHeadingRow}>
                    <AlertCircle size={16} color="#D97706" style={{ marginRight: 6 }} />
                    <Text style={styles.pendingSectionTitle}>
                      ACTION REQUIRED · స్పందించండి ({pendingInvitations.length})
                    </Text>
                  </View>
                  <Text style={[styles.pendingSectionSub, { color: secondaryText }]}>
                    Please accept or decline your assigned responsibility so coordinators can finalize the roster.
                  </Text>

                  {pendingInvitations.map((duty) => (
                    <View
                      key={duty.id}
                      style={[styles.pendingDutyCard, { backgroundColor: cardSurface, borderColor: '#F59E0B' }]}
                    >
                      {/* Top Tag & Service Title */}
                      <View style={styles.pendingDutyHeader}>
                        <View style={styles.pendingPill}>
                          <Clock size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.pendingPillTxt}>
                            {duty.instructions?.includes('First-come') ? 'OPEN RESPONSIBILITY · FIRST-COME' : 'INVITATION PENDING'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.dutyDateTxt, { color: secondaryText }]}>
                            {formatDateMonthYear(duty.date)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleDeleteOrCancelDuty(duty)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                            style={{ padding: 2 }}
                          >
                            <Trash2 size={15} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={[styles.dutyRoleTitle, { color: primaryText }]}>
                        {duty.roleTitle}
                      </Text>
                      <Text style={[styles.dutyServiceTitle, { color: '#2563EB' }]}>
                        {duty.serviceTitle}
                      </Text>

                      {/* Call Time & Location Box (Properly aligned with single text flow) */}
                      <View style={styles.dutyMetaBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
                          <Clock size={13} color="#D97706" style={{ marginTop: 2 }} />
                          <Text style={{ fontSize: 12, color: secondaryText, flex: 1, lineHeight: 18 }}>
                            Reporting / Call Time: <Text style={{ fontWeight: '700', color: isDark ? '#FBBF24' : '#D97706' }}>{formatTimeTo12Hour(duty.callTime)}</Text>
                            {duty.startTime ? ` (Service starts ${formatTimeTo12Hour(duty.startTime)})` : ''}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 4 }}>
                          <MapPin size={13} color="#059669" style={{ marginTop: 2 }} />
                          <Text style={{ fontSize: 12, color: secondaryText, flex: 1, lineHeight: 18 }}>
                            Sanctuary: <Text style={{ fontWeight: '700', color: primaryText }}>{duty.location || 'Church Sanctuary'}</Text>
                            {duty.preacher ? ` · Preacher: ${duty.preacher}` : ''}
                          </Text>
                        </View>

                        {duty.instructions ? (
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 4 }}>
                            <Volume2 size={13} color="#7C3AED" style={{ marginTop: 2 }} />
                            <Text style={{ fontSize: 12, color: secondaryText, flex: 1, lineHeight: 18 }}>
                              Notes: <Text style={{ fontWeight: '600', color: primaryText }}>{duty.instructions}</Text>
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* 1-Tap Action Row */}
                      <View style={styles.dutyActionRow}>
                        <TouchableOpacity
                          style={[styles.dutyDeclineBtn, { borderColor }]}
                          onPress={() => setSelectedDutyForDecline(duty)}
                          activeOpacity={0.8}
                          disabled={submittingResponse}
                        >
                          <XCircle size={15} color="#DC2626" style={{ marginRight: 6 }} />
                          <Text style={styles.dutyDeclineBtnTxt}>Decline</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.dutyAcceptBtn}
                          onPress={() => handleAcceptDuty(duty)}
                          activeOpacity={0.85}
                          disabled={submittingResponse}
                        >
                          <CheckCircle2 size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.dutyAcceptBtnTxt}>Accept Responsibility</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* SECTION: CONFIRMED UPCOMING DUTIES */}
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>
                  CONFIRMED UPCOMING SERVICES ({confirmedDuties.length})
                </Text>

                {confirmedDuties.length === 0 && pendingInvitations.length === 0 ? (
                  <View style={[styles.emptyCard, { backgroundColor: cardSurface, borderColor }]}>
                    <Smile size={38} color="#94A3B8" style={{ marginBottom: 10 }} />
                    <Text style={[styles.emptyTitle, { color: primaryText }]}>
                      No Upcoming Responsibilities Scheduled
                    </Text>
                    <Text style={[styles.emptySub, { color: secondaryText }]}>
                      You currently have no scheduled service responsibilities. You will automatically receive a push notification when coordinators publish a service with matching skills.
                    </Text>
                  </View>
                ) : (
                  confirmedDuties.map((duty) => (
                    <View
                      key={duty.id}
                      style={[styles.confirmedDutyCard, { backgroundColor: cardSurface, borderColor }]}
                    >
                      <View style={styles.confirmedTopRow}>
                        <View style={styles.confirmedTag}>
                          <CheckCircle2 size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.confirmedTagTxt}>CONFIRMED</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.dutyDateTxt, { color: secondaryText }]}>
                            {formatDateMonthYear(duty.date)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleDeleteOrCancelDuty(duty)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                            style={{ padding: 2 }}
                          >
                            <Trash2 size={15} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={[styles.dutyRoleTitle, { color: primaryText }]}>
                        {duty.roleTitle}
                      </Text>
                      <Text style={[styles.dutyServiceTitle, { color: '#2563EB' }]}>
                        {duty.serviceTitle}
                      </Text>

                      <View style={styles.dutyMetaBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
                          <Clock size={13} color="#059669" style={{ marginTop: 2 }} />
                          <Text style={{ fontSize: 12, color: secondaryText, flex: 1, lineHeight: 18 }}>
                            Reporting Call Time: <Text style={{ fontWeight: '700', color: isDark ? '#34D399' : '#059669' }}>{formatTimeTo12Hour(duty.callTime)}</Text>
                            {duty.startTime ? ` (Service: ${formatTimeTo12Hour(duty.startTime)}${duty.endTime ? ` - ${formatTimeTo12Hour(duty.endTime)}` : ''})` : ''}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 4 }}>
                          <MapPin size={13} color="#64748B" style={{ marginTop: 2 }} />
                          <Text style={{ fontSize: 12, color: secondaryText, flex: 1, lineHeight: 18 }}>
                            Location: <Text style={{ fontWeight: '700', color: primaryText }}>{duty.location || 'Church Sanctuary'}</Text>
                            {duty.preacher ? ` · Preacher: ${duty.preacher}` : ''}
                          </Text>
                        </View>
                      </View>

                      {/* Actions Row: Setlist & Cancel/Delete Duty */}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        {duty.setlist?.length > 0 && (
                          <TouchableOpacity
                            style={[styles.viewSetlistBtn, { flex: 1, marginTop: 0 }]}
                            onPress={() => {
                              setSelectedPlanId(duty.serviceId);
                              setActiveTab('roster');
                            }}
                            activeOpacity={0.8}
                          >
                            <Music size={13} color="#2563EB" style={{ marginRight: 6 }} />
                            <Text style={styles.viewSetlistBtnTxt}>
                              {duty.setlist.length} Songs in Roster
                            </Text>
                            <ChevronRight size={14} color="#2563EB" />
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.cancelDutyBtn,
                            {
                              borderColor: isDark ? 'rgba(220, 38, 38, 0.4)' : '#FCA5A5',
                              backgroundColor: isDark ? 'rgba(220, 38, 38, 0.12)' : '#FEF2F2',
                              flex: duty.setlist?.length > 0 ? 0.9 : 1
                            }
                          ]}
                          onPress={() => handleDeleteOrCancelDuty(duty)}
                          activeOpacity={0.8}
                        >
                          <Trash2 size={13} color="#DC2626" style={{ marginRight: 5 }} />
                          <Text style={styles.cancelDutyBtnTxt}>Cancel Responsibility</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* SECTION: BLOCKOUT / UNAVAILABILITY DATES */}
              <View style={[styles.sectionWrap, { marginTop: 24 }]}>
                <View style={styles.availTopRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.sectionTitle, { color: primaryText }]}>
                      MY BLOCKOUT DATES ({blockouts.length})
                    </Text>
                    <Text style={[styles.pendingSectionSub, { color: secondaryText }]}>
                      Mark dates when you are traveling or unavailable so coordinators don't schedule you.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.addBlockoutBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                    onPress={() => setShowAddBlockoutModal(true)}
                    activeOpacity={0.85}
                  >
                    <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 4 }} />
                    <Text style={[styles.addBlockoutBtnTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>Add Date</Text>
                  </TouchableOpacity>
                </View>

                {blockouts.length === 0 ? (
                  <View style={[styles.emptyCard, { backgroundColor: cardSurface, borderColor, paddingVertical: 18 }]}>
                    <CalendarX size={28} color="#94A3B8" style={{ marginBottom: 8 }} />
                    <Text style={[styles.emptyTitle, { color: primaryText, fontSize: 14 }]}>
                      No Blockout Dates Set
                    </Text>
                    <Text style={[styles.emptySub, { color: secondaryText, fontSize: 11 }]}>
                      You are currently marked as available for upcoming services.
                    </Text>
                  </View>
                ) : (
                  blockouts.map((b, idx) => (
                    <View
                      key={`${b.date}_${idx}`}
                      style={[styles.blockoutCard, { backgroundColor: cardSurface, borderColor }]}
                    >
                      <View style={styles.blockoutDateBox}>
                        <CalendarX size={16} color="#DC2626" style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.blockoutDateTxt, { color: primaryText }]}>
                            {b.date}
                          </Text>
                          <Text style={[styles.blockoutReasonTxt, { color: secondaryText }]}>
                            {b.reason || 'Personal blockout'}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.deleteBlockoutBtn}
                        onPress={() => handleRemoveBlockout(b.date)}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── MODAL: DECLINE REASON SELECTOR ── */}
      <Modal visible={!!selectedDutyForDecline} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: cardSurface }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: primaryText }]}>
                  Decline Service Responsibility
                </Text>
                <Text style={[styles.modalSub, { color: secondaryText }]}>
                  {selectedDutyForDecline?.roleTitle} · {selectedDutyForDecline?.date}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDutyForDecline(null)}>
                <X size={20} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 12 }]}>
              Please select a reason:
            </Text>

            {DECLINE_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[
                  styles.reasonOption,
                  declineReason === reason && styles.reasonOptionSelected,
                ]}
                onPress={() => setDeclineReason(reason)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.radioCircle,
                    declineReason === reason && styles.radioCircleActive,
                  ]}
                />
                <Text
                  style={[
                    styles.reasonTxt,
                    { color: primaryText },
                    declineReason === reason && { fontWeight: '700' },
                  ]}
                >
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}

            {declineReason === 'Other personal reason' && (
              <TextInput
                style={[styles.customReasonInput, { borderColor, color: primaryText }]}
                placeholder="Explain reason briefly..."
                placeholderTextColor={secondaryText}
                value={customDeclineReason}
                onChangeText={setCustomDeclineReason}
              />
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor }]}
                onPress={() => setSelectedDutyForDecline(null)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalCancelBtnTxt, { color: primaryText }]}>Keep Responsibility</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmDeclineBtn}
                onPress={handleConfirmDecline}
                activeOpacity={0.85}
                disabled={submittingResponse}
              >
                {submittingResponse ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmDeclineBtnTxt}>Confirm Decline</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: LYRICS & PRACTICE SHEET ── */}
      <Modal visible={showLyricsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.lyricsSheet, { backgroundColor: cardSurface }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                  <View style={styles.songKeyPill}>
                    <Text style={styles.songKeyPillTxt}>Key {selectedSongForLyrics?.key || 'G'}</Text>
                  </View>
                  <View style={styles.songBpmPill}>
                    <Text style={styles.songBpmPillTxt}>
                      {selectedSongForLyrics?.tempo ? `${selectedSongForLyrics.tempo} BPM` : '120 BPM'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.lyricsModalTitle, { color: primaryText }]}>
                  {selectedSongForLyrics?.title}
                </Text>
                {selectedSongForLyrics?.titleTe ? (
                  <Text style={[styles.lyricsModalSub, { color: secondaryText }]}>
                    {selectedSongForLyrics.titleTe}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity onPress={() => setShowLyricsModal(false)}>
                <X size={22} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {selectedSongForLyrics?.lyricsTe ? (
                <View style={styles.lyricsBlock}>
                  <Text style={styles.lyricsBlockHeading}>TELUGU LYRICS · సాహిత్యం</Text>
                  <Text style={[styles.lyricsTeTxt, { color: primaryText }]}>
                    {selectedSongForLyrics.lyricsTe}
                  </Text>
                </View>
              ) : null}

              {selectedSongForLyrics?.lyricsEn ? (
                <View style={styles.lyricsBlock}>
                  <Text style={styles.lyricsBlockHeading}>ENGLISH / TRANSLITERATION</Text>
                  <Text style={[styles.lyricsEnTxt, { color: primaryText }]}>
                    {selectedSongForLyrics.lyricsEn}
                  </Text>
                </View>
              ) : null}

              {!selectedSongForLyrics?.lyricsTe && !selectedSongForLyrics?.lyricsEn && (
                <View style={styles.noLyricsWrap}>
                  <BookOpen size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>
                    No Lyrics Uploaded
                  </Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
                    Lyrics have not been uploaded for this song yet.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: ADD BLOCKOUT DATE ── */}
      <Modal visible={showAddBlockoutModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: cardSurface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: primaryText }]}>Add Blockout Date</Text>
              <TouchableOpacity onPress={() => setShowAddBlockoutModal(false)}>
                <X size={20} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 12 }]}>
              Unavailable Date (YYYY-MM-DD)
            </Text>
            <TextInput
              style={[styles.inputBox, { borderColor, color: primaryText }]}
              placeholder="e.g. 2026-11-15"
              placeholderTextColor={secondaryText}
              value={newBlockoutDate}
              onChangeText={setNewBlockoutDate}
            />

            <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 10 }]}>
              Reason (Optional)
            </Text>
            <TextInput
              style={[styles.inputBox, { borderColor, color: primaryText }]}
              placeholder="e.g. Family wedding / Traveling"
              placeholderTextColor={secondaryText}
              value={newBlockoutReason}
              onChangeText={setNewBlockoutReason}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor }]}
                onPress={() => setShowAddBlockoutModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalCancelBtnTxt, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveBlockout}
                activeOpacity={0.85}
                disabled={savingBlockout}
              >
                {savingBlockout ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveBtnTxt}>Save Blockout</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  pendingBadgeHeader: {
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingBadgeHeaderTxt: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  // ── Tabs Bar (Pill style matching AdminServicePlanner) ──
  tabsBarWrapper: {
    borderBottomWidth: 1,
  },
  tabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
  },
  tabBtnTxt: {
    fontSize: 12.5,
    fontWeight: '700',
  },

  // ── Content ──
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  scrollContent: {
    padding: 16,
  },
  sectionWrap: {
    marginBottom: 20,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pendingSectionTitle: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pendingSectionSub: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // ── Pending Duty Card ──
  pendingDutyCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  pendingDutyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingPillTxt: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dutyDateTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  dutyRoleTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  dutyServiceTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 10,
  },
  dutyMetaBox: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  dutyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dutyMetaLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  dutyMetaVal: {
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
  },
  rehearsalMiniBox: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  rehearsalMiniHeading: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  rehearsalMiniTxt: {
    color: '#1E40AF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  dutyActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dutyDeclineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  dutyDeclineBtnTxt: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '800',
  },
  dutyAcceptBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 11,
    borderRadius: 10,
  },
  dutyAcceptBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Confirmed Duty Card ──
  confirmedDutyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  confirmedTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  confirmedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  confirmedTagTxt: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  viewSetlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  viewSetlistBtnTxt: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  cancelDutyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelDutyBtnTxt: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Practice Songs ──
  songCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  songCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  songKeyPill: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  songKeyPillTxt: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  songBpmPill: {
    backgroundColor: '#475569',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  songBpmPillTxt: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  songTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  songTitleTe: {
    fontSize: 12,
    marginTop: 1,
  },
  songCardBottom: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  songMetaTxt: {
    fontSize: 11,
  },
  songServiceTxt: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Availability ──
  availTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addBlockoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBlockoutBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  blockoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  blockoutDateBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  blockoutDateTxt: {
    fontSize: 14,
    fontWeight: '800',
  },
  blockoutReasonTxt: {
    fontSize: 11.5,
    marginTop: 1,
  },
  deleteBlockoutBtn: {
    padding: 8,
  },

  // ── Empty Card ──
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  lyricsSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 12,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  reasonOptionSelected: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    marginRight: 10,
  },
  radioCircleActive: {
    borderColor: '#DC2626',
    backgroundColor: '#DC2626',
  },
  reasonTxt: {
    fontSize: 13,
  },
  customReasonInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 10,
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalCancelBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalConfirmDeclineBtn: {
    flex: 1.2,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalConfirmDeclineBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalSaveBtn: {
    flex: 1.2,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalSaveBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Lyrics Sheet Modal Content ──
  lyricsModalTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  lyricsModalSub: {
    fontSize: 13,
    marginTop: 2,
  },
  lyricsBlock: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CBD5E1',
  },
  lyricsBlockHeading: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  lyricsTeTxt: {
    fontSize: 15,
    lineHeight: 26,
    fontWeight: '600',
  },
  lyricsEnTxt: {
    fontSize: 14.5,
    lineHeight: 24,
    fontWeight: '500',
  },
  noLyricsWrap: {
    padding: 30,
    alignItems: 'center',
  },

  // ── Full Service Roster View ──
  servicePickerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 6,
  },
  servicePickerChipTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  servicePickerChipDate: {
    fontSize: 10.5,
    marginTop: 2,
  },
  rosterServiceBanner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  rosterBannerTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#10B981',
  },
  rosterBannerDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  rosterBannerTitle: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  personalCalloutBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  rosterSectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  bandMemberPill: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  runSheetItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeTxt: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  runSheetProgramTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  setlistSongCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  songTitleTxt: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  songSubTxt: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  viewLyricsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
});

