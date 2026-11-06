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
} from '../types/serviceRoster';

const { width } = Dimensions.get('window');

const DECLINE_REASONS = [
  'Out of town / Traveling',
  'Work / Business commitment',
  'Family engagement / Function',
  'Health / Not feeling well',
  'Academic exams / Studies',
  'Other personal reason',
];

export default function MyServiceScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { activeChurch } = useChurch();
  const { isDark, screenBg, cardSurface, primaryText, secondaryText, borderColor } =
    useAdminTheme();

  const churchId = route?.params?.churchId || activeChurch?.id || 'rhema';
  const memberId = member?.id || '';

  // Tab: 'duties' (Upcoming & Pending) | 'setlist' (Song Practice) | 'availability' (Blockout Dates)
  const [activeTab, setActiveTab] = useState<'duties' | 'setlist' | 'availability'>('duties');

  const [duties, setDuties] = useState<MemberServiceDuty[]>([]);
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
      const list = await ServiceRosterService.getMemberUpcomingDuties(churchId, memberId);
      setDuties(list);

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

  // ── 1-Tap Accept Duty ──
  const handleAcceptDuty = async (duty: MemberServiceDuty) => {
    Alert.alert(
      'Accept Service Duty',
      `Confirm your assignment as "${duty.roleTitle}" for "${duty.serviceTitle}" on ${duty.date}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Accept Duty',
          style: 'default',
          onPress: async () => {
            try {
              setSubmittingResponse(true);
              await ServiceRosterService.respondToAssignment(
                churchId,
                duty.serviceId,
                duty.roleId,
                memberId,
                'accept'
              );
              Alert.alert(
                'Duty Confirmed! 🎉',
                `Thank you for your service! Your role as "${duty.roleTitle}" is confirmed. Reporting call time is ${duty.callTime}.`
              );
              fetchDuties();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to accept duty.');
            } finally {
              setSubmittingResponse(false);
            }
          },
        },
      ]
    );
  };

  // ── Decline Duty with Reason Modal ──
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
        finalReason
      );

      setSelectedDutyForDecline(null);
      Alert.alert(
        'Response Recorded',
        'Thank you for informing us. The ministry coordinator and replacement ladder have been notified.'
      );
      fetchDuties();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record response.');
    } finally {
      setSubmittingResponse(false);
    }
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

  // Aggregate all songs from upcoming confirmed duties for setlist practice
  const practiceSongs: Array<{ song: SetlistItem; serviceTitle: string; serviceDate: string }> = [];
  confirmedDuties.forEach((d) => {
    (d.setlist || []).forEach((s) => {
      practiceSongs.push({
        song: s,
        serviceTitle: d.serviceTitle,
        serviceDate: d.date,
      });
    });
  });

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
            My Service Duties · నా బాధ్యతలు
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

      {/* ── NAVIGATION TABS ── */}
      <View style={[styles.tabBar, { backgroundColor: cardSurface, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'duties' && styles.tabBtnActive]}
          onPress={() => setActiveTab('duties')}
          activeOpacity={0.8}
        >
          <Calendar
            size={14}
            color={activeTab === 'duties' ? '#2563EB' : secondaryText}
            style={{ marginRight: 5 }}
          />
          <Text style={[styles.tabBtnTxt, activeTab === 'duties' && styles.tabBtnTxtActive]}>
            Upcoming Duties ({duties.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'setlist' && styles.tabBtnActive]}
          onPress={() => setActiveTab('setlist')}
          activeOpacity={0.8}
        >
          <Music
            size={14}
            color={activeTab === 'setlist' ? '#2563EB' : secondaryText}
            style={{ marginRight: 5 }}
          />
          <Text style={[styles.tabBtnTxt, activeTab === 'setlist' && styles.tabBtnTxtActive]}>
            Practice Songs ({practiceSongs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'availability' && styles.tabBtnActive]}
          onPress={() => setActiveTab('availability')}
          activeOpacity={0.8}
        >
          <CalendarX
            size={14}
            color={activeTab === 'availability' ? '#2563EB' : secondaryText}
            style={{ marginRight: 5 }}
          />
          <Text style={[styles.tabBtnTxt, activeTab === 'availability' && styles.tabBtnTxtActive]}>
            Blockouts ({blockouts.length})
          </Text>
        </TouchableOpacity>
      </View>

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
              TAB 1: UPCOMING DUTIES & PENDING INVITATIONS
              ========================================================================= */}
          {activeTab === 'duties' && (
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
                    Please accept or decline your assigned duty so coordinators can finalize the roster.
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
                          <Text style={styles.pendingPillTxt}>INVITATION PENDING</Text>
                        </View>
                        <Text style={[styles.dutyDateTxt, { color: secondaryText }]}>
                          {duty.date}
                        </Text>
                      </View>

                      <Text style={[styles.dutyRoleTitle, { color: primaryText }]}>
                        {duty.roleTitle}
                      </Text>
                      <Text style={[styles.dutyServiceTitle, { color: '#2563EB' }]}>
                        {duty.serviceTitle}
                      </Text>

                      {/* Call Time & Location Row */}
                      <View style={styles.dutyMetaBox}>
                        <View style={styles.dutyMetaRow}>
                          <Clock size={14} color="#D97706" style={{ marginRight: 6 }} />
                          <Text style={[styles.dutyMetaLabel, { color: secondaryText }]}>
                            Reporting / Call Time:
                          </Text>
                          <Text style={[styles.dutyMetaVal, { color: '#D97706' }]}>
                            {duty.callTime} (Service starts {duty.startTime})
                          </Text>
                        </View>

                        <View style={[styles.dutyMetaRow, { marginTop: 4 }]}>
                          <MapPin size={14} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={[styles.dutyMetaLabel, { color: secondaryText }]}>
                            Sanctuary:
                          </Text>
                          <Text style={[styles.dutyMetaVal, { color: primaryText }]}>
                            {duty.location}
                          </Text>
                        </View>

                        {duty.instructions ? (
                          <View style={[styles.dutyMetaRow, { marginTop: 4 }]}>
                            <Volume2 size={14} color="#7C3AED" style={{ marginRight: 6 }} />
                            <Text style={[styles.dutyMetaLabel, { color: secondaryText }]}>
                              Notes:
                            </Text>
                            <Text style={[styles.dutyMetaVal, { color: primaryText }]}>
                              {duty.instructions}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Linked Rehearsals */}
                      {duty.rehearsals?.length > 0 && (
                        <View style={styles.rehearsalMiniBox}>
                          <Text style={styles.rehearsalMiniHeading}>
                            MANDATORY REHEARSAL SCHEDULE:
                          </Text>
                          {duty.rehearsals.map((r) => (
                            <Text key={r.id} style={styles.rehearsalMiniTxt}>
                              • {r.rehearsalName}: {r.date} at {r.startTime} ({r.location})
                            </Text>
                          ))}
                        </View>
                      )}

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
                          <Text style={styles.dutyAcceptBtnTxt}>Accept Duty</Text>
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
                      No Upcoming Duties Scheduled
                    </Text>
                    <Text style={[styles.emptySub, { color: secondaryText }]}>
                      You currently have no scheduled service assignments. You will automatically receive a push notification when coordinators assign a service role.
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
                        <Text style={[styles.dutyDateTxt, { color: secondaryText }]}>
                          {duty.date}
                        </Text>
                      </View>

                      <Text style={[styles.dutyRoleTitle, { color: primaryText }]}>
                        {duty.roleTitle}
                      </Text>
                      <Text style={[styles.dutyServiceTitle, { color: '#2563EB' }]}>
                        {duty.serviceTitle}
                      </Text>

                      <View style={styles.dutyMetaBox}>
                        <View style={styles.dutyMetaRow}>
                          <Clock size={14} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={[styles.dutyMetaLabel, { color: secondaryText }]}>
                            Call Time:
                          </Text>
                          <Text style={[styles.dutyMetaVal, { color: '#059669' }]}>
                            {duty.callTime} (Service: {duty.startTime} - {duty.endTime})
                          </Text>
                        </View>

                        <View style={[styles.dutyMetaRow, { marginTop: 4 }]}>
                          <MapPin size={14} color="#64748B" style={{ marginRight: 6 }} />
                          <Text style={[styles.dutyMetaLabel, { color: secondaryText }]}>
                            Location:
                          </Text>
                          <Text style={[styles.dutyMetaVal, { color: primaryText }]}>
                            {duty.location} · Preacher: {duty.preacher}
                          </Text>
                        </View>
                      </View>

                      {/* Rehearsals */}
                      {duty.rehearsals?.length > 0 && (
                        <View style={styles.rehearsalMiniBox}>
                          <Text style={styles.rehearsalMiniHeading}>SCHEDULED REHEARSAL:</Text>
                          {duty.rehearsals.map((r) => (
                            <Text key={r.id} style={styles.rehearsalMiniTxt}>
                              📅 {r.date} at {r.startTime} - {r.endTime} ({r.location})
                            </Text>
                          ))}
                        </View>
                      )}

                      {/* Quick Setlist Button if available */}
                      {duty.setlist?.length > 0 && (
                        <TouchableOpacity
                          style={styles.viewSetlistBtn}
                          onPress={() => setActiveTab('setlist')}
                          activeOpacity={0.8}
                        >
                          <Music size={13} color="#2563EB" style={{ marginRight: 6 }} />
                          <Text style={styles.viewSetlistBtnTxt}>
                            Practice {duty.setlist.length} Setlist Songs
                          </Text>
                          <ChevronRight size={14} color="#2563EB" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* =========================================================================
              TAB 2: WORSHIP PRACTICE & SONG SHEETS
              ========================================================================= */}
          {activeTab === 'setlist' && (
            <View>
              <Text style={[styles.sectionTitle, { color: primaryText }]}>
                SONGS FOR YOUR UPCOMING SERVICES ({practiceSongs.length})
              </Text>
              <Text style={[styles.pendingSectionSub, { color: secondaryText, marginBottom: 12 }]}>
                Tap any song to view keys, BPM, and Telugu & English lyrics for weekly practice.
              </Text>

              {practiceSongs.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Music size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>
                    No Practice Songs Available
                  </Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
                    Songs added by worship leaders to your confirmed services will appear here.
                  </Text>
                </View>
              ) : (
                practiceSongs.map(({ song, serviceTitle, serviceDate }, idx) => (
                  <TouchableOpacity
                    key={`${song.id}_${idx}`}
                    style={[styles.songCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => {
                      setSelectedSongForLyrics(song);
                      setShowLyricsModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.songCardTop}>
                      <View style={styles.songKeyPill}>
                        <Text style={styles.songKeyPillTxt}>Key {song.key || 'G'}</Text>
                      </View>

                      <View style={{ flex: 1, paddingHorizontal: 10 }}>
                        <Text style={[styles.songTitle, { color: primaryText }]}>
                          {song.title}
                        </Text>
                        {song.titleTe ? (
                          <Text style={[styles.songTitleTe, { color: secondaryText }]}>
                            {song.titleTe}
                          </Text>
                        ) : null}
                      </View>

                      <ChevronRight size={18} color="#94A3B8" />
                    </View>

                    <View style={[styles.songCardBottom, { borderTopColor: borderColor }]}>
                      <Text style={[styles.songMetaTxt, { color: secondaryText }]}>
                        Tempo: {song.tempo ? `${song.tempo} BPM` : '120 BPM'} · Time: {song.timeSignature || '4/4'}
                      </Text>
                      <Text style={[styles.songServiceTxt, { color: '#2563EB' }]}>
                        {serviceTitle} ({serviceDate})
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* =========================================================================
              TAB 3: MEMBER AVAILABILITY & BLOCKOUT DATES
              ========================================================================= */}
          {activeTab === 'availability' && (
            <View>
              <View style={styles.availTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: primaryText }]}>
                    MY BLOCKOUT DATES ({blockouts.length})
                  </Text>
                  <Text style={[styles.pendingSectionSub, { color: secondaryText }]}>
                    Mark dates when you are traveling or unavailable so coordinators don't schedule you.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.addBlockoutBtn}
                  onPress={() => setShowAddBlockoutModal(true)}
                  activeOpacity={0.85}
                >
                  <Plus size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.addBlockoutBtnTxt}>Add Date</Text>
                </TouchableOpacity>
              </View>

              {blockouts.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: cardSurface, borderColor }]}>
                  <CalendarX size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>
                    No Blockout Dates Set
                  </Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
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
                      <CalendarX size={18} color="#DC2626" style={{ marginRight: 8 }} />
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
                  Decline Service Duty
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
                <Text style={[styles.modalCancelBtnTxt, { color: primaryText }]}>Keep Duty</Text>
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

  // ── Tabs Bar ──
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#2563EB',
  },
  tabBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTxtActive: {
    color: '#2563EB',
    fontWeight: '800',
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
});

