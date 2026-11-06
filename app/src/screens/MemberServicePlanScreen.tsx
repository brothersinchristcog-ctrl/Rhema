import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Share,
  Dimensions,
  Platform,
  StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Music,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Share2,
  BookOpen,
  Mic2,
  ChevronRight,
  Sparkles,
  FileText,
  User,
  Heart,
  Info,
  X,
  Check
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import firestore from '@react-native-firebase/firestore';

import { useChurch } from '../context/ChurchContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ServiceRosterService, {
  ServicePlan,
  SetlistItem,
  RunSheetItem,
  DEFAULT_DEPARTMENTS
} from '../services/ServiceRosterService';

const { width } = Dimensions.get('window');

interface MemberServicePlanScreenProps {
  navigation: any;
  route: {
    params?: {
      planId?: string;
    };
  };
}

export default function MemberServicePlanScreen({ navigation, route }: MemberServicePlanScreenProps) {
  const insets = useSafeAreaInsets();
  const { activeChurch } = useChurch();
  const { user, member } = useAuth();
  const { isDark, appearance } = useTheme();

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ServicePlan | null>(null);
  const [activeTab, setActiveTab] = useState<'runSheet' | 'setlist' | 'sermon'>('runSheet');

  // RSVP response state
  const [responding, setResponding] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('Out of station / Travelling');
  const [declineCustomNote, setDeclineCustomNote] = useState('');

  // Lyrics modal
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SetlistItem | null>(null);
  const [songLyricsData, setSongLyricsData] = useState<{ te?: string; en?: string } | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);

  const churchId = activeChurch?.id || 'rhema';
  const currentMemberId = member?.id || user?.uid || '';
  const currentMemberName = member?.name || member?.firstName || '';

  // ── Load Plans ──────────────────────────────────────────
  useEffect(() => {
    fetchPlans();
  }, [churchId, route.params?.planId]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const fetched = await ServiceRosterService.getUpcomingPublishedPlans(churchId, 10);
      setPlans(fetched);

      if (route.params?.planId) {
        const found = fetched.find(p => p.id === route.params?.planId);
        if (found) {
          setSelectedPlan(found);
        } else {
          const direct = await ServiceRosterService.getServicePlanById(churchId, route.params.planId);
          if (direct) setSelectedPlan(direct);
          else if (fetched.length > 0) setSelectedPlan(fetched[0]);
        }
      } else if (fetched.length > 0) {
        setSelectedPlan(fetched[0]);
      }
    } catch (e) {
      console.error('[MemberServicePlanScreen] Error fetching plans:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Identify Current Member Assignment ───────────────────
  const myAssignment = useMemo(() => {
    if (!selectedPlan) return null;

    const assignments = selectedPlan.assignments || {};
    const memberIds = selectedPlan.assignmentMemberIds || {};
    const statuses = selectedPlan.assignmentStatus || {};
    const declineReasons = selectedPlan.assignmentDeclineReasons || {};

    const allDepts = selectedPlan.departments || DEFAULT_DEPARTMENTS;
    const allRoles = allDepts.flatMap(d => d.roles.map(r => ({ ...r, deptName: d.name, deptColor: d.color })));

    for (const role of allRoles) {
      const assignedId = memberIds[role.id];
      const assignedName = assignments[role.id];

      const isMatchById = Boolean(assignedId && currentMemberId && assignedId === currentMemberId);
      const isMatchByName = Boolean(
        !isMatchById &&
        assignedName &&
        currentMemberName &&
        assignedName.trim().toLowerCase() === currentMemberName.trim().toLowerCase()
      );

      if (isMatchById || isMatchByName) {
        return {
          roleId: role.id,
          roleName: role.name,
          departmentName: role.deptName,
          departmentColor: role.deptColor,
          status: (statuses[role.id] || 'pending') as 'pending' | 'confirmed' | 'declined',
          declineReason: declineReasons[role.id] || '',
          callTime: selectedPlan.assignmentCallTimes?.[role.id] || `${selectedPlan.startTime || '09:30'} (30m prior)`,
          notes: selectedPlan.assignmentNotes?.[role.id] || ''
        };
      }
    }

    return null;
  }, [selectedPlan, currentMemberId, currentMemberName]);

  // ── Handle RSVP ──────────────────────────────────────────
  const handleRSVP = async (status: 'confirmed' | 'declined') => {
    if (!selectedPlan || !myAssignment) return;
    setResponding(true);
    try {
      const fullReason = status === 'declined' 
        ? `${declineReason}${declineCustomNote.trim() ? ` - ${declineCustomNote.trim()}` : ''}`
        : undefined;

      const success = await ServiceRosterService.respondToAssignment(
        churchId,
        selectedPlan.id,
        myAssignment.roleId,
        status,
        fullReason
      );

      if (success) {
        setSelectedPlan(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            assignmentStatus: {
              ...(prev.assignmentStatus || {}),
              [myAssignment.roleId]: status
            },
            assignmentDeclineReasons: {
              ...(prev.assignmentDeclineReasons || {}),
              ...(fullReason ? { [myAssignment.roleId]: fullReason } : {})
            }
          };
        });
      }
      setShowDeclineModal(false);
    } catch (e) {
      console.error('[MemberServicePlanScreen] handleRSVP error:', e);
    } finally {
      setResponding(false);
    }
  };

  // ── Open Lyrics Modal ────────────────────────────────────
  const handleOpenLyrics = async (song: SetlistItem) => {
    setSelectedSong(song);
    setLyricsModalVisible(true);
    setLoadingLyrics(true);
    setSongLyricsData(null);

    try {
      // Query church worshipSongs collection for exact match
      const songSnap = await firestore()
        .collection('Rhema Church')
        .doc(churchId)
        .collection('worshipSongs')
        .where('title', '==', song.title)
        .limit(1)
        .get();

      if (!songSnap.empty) {
        const data = songSnap.docs[0].data();
        setSongLyricsData({
          te: data.lyricsTe || data.lyrics || '',
          en: data.lyricsEn || data.lyrics || ''
        });
      } else {
        // Fallback: check notes
        setSongLyricsData({
          en: song.notes || 'Lyrics available during service.'
        });
      }
    } catch (e) {
      console.warn('Error fetching song lyrics:', e);
      setSongLyricsData({ en: song.notes || '' });
    } finally {
      setLoadingLyrics(false);
    }
  };

  // ── Share WhatsApp Summary ──────────────────────────────
  const handleShare = async () => {
    if (!selectedPlan) return;
    const text = ServiceRosterService.generateWhatsAppShareText(selectedPlan);
    try {
      await Share.share({ message: text });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  // ── Dynamic Theme Colors ────────────────────────────────
  const theme = useMemo(() => {
    const dark = isDark || appearance === 'pure_dark';
    return {
      dark,
      bg: dark ? '#0F172A' : '#F8FAFC',
      cardBg: dark ? '#1E293B' : '#FFFFFF',
      headerBg: dark ? '#0B1120' : '#1A2D5A',
      text: dark ? '#F1F5F9' : '#0F172A',
      subText: dark ? '#94A3B8' : '#64748B',
      border: dark ? '#334155' : '#E2E8F0',
      gold: '#D4AF37',
      primaryBlue: '#1A2D5A',
      accentGreen: '#059669',
      accentRed: '#DC2626'
    };
  }, [isDark, appearance]);

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color="#1A2D5A" />
        <Text style={[styles.loadingTxt, { color: theme.subText }]}>Loading service schedule...</Text>
      </View>
    );
  }

  if (!selectedPlan) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.bg }]}>
        <Calendar size={48} color="#94A3B8" />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Upcoming Services Published</Text>
        <Text style={[styles.emptySub, { color: theme.subText }]}>
          The church administration has not published an active service roster yet. Please check back later.
        </Text>
        <TouchableOpacity style={styles.backBtnPill} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnPillTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1A2D5A" />

      {/* ── HEADER ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14), backgroundColor: theme.headerBg }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {selectedPlan.churchName || activeChurch?.name || 'Rhema Church'}
            </Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {selectedPlan.serviceTitle || 'Service Plan'}
            </Text>
          </View>
          <TouchableOpacity style={styles.headerShareBtn} onPress={handleShare}>
            <Share2 size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Date & Location Pill Strip */}
        <View style={styles.headerBadgeRow}>
          <View style={styles.headerBadge}>
            <Calendar size={13} color="#D4AF37" />
            <Text style={styles.headerBadgeTxt}>{selectedPlan.date}</Text>
          </View>
          <View style={styles.headerBadge}>
            <Clock size={13} color="#D4AF37" />
            <Text style={styles.headerBadgeTxt}>
              {selectedPlan.startTime || '09:30'} – {selectedPlan.endTime || '12:00'}
            </Text>
          </View>
          {selectedPlan.location ? (
            <View style={styles.headerBadge}>
              <MapPin size={13} color="#D4AF37" />
              <Text style={styles.headerBadgeTxt} numberOfLines={1}>
                {selectedPlan.location}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Service Switcher if multiple published */}
        {plans.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planSelectorRow}>
            {plans.map(p => {
              const isSelected = p.id === selectedPlan.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedPlan(p)}
                  style={[
                    styles.planSelectorPill,
                    isSelected && styles.planSelectorPillActive
                  ]}
                >
                  <Text style={[styles.planSelectorPillTxt, isSelected && styles.planSelectorPillTxtActive]}>
                    {p.date} · {p.serviceTitle}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* ── 1. MY MINISTRY ASSIGNMENT CARD (IF ASSIGNED) ───── */}
        {myAssignment ? (
          <View
            style={[
              styles.dutyCard,
              myAssignment.status === 'confirmed'
                ? styles.dutyCardConfirmed
                : myAssignment.status === 'declined'
                ? styles.dutyCardDeclined
                : styles.dutyCardPending
            ]}
          >
            <View style={styles.dutyCardHeader}>
              <View style={styles.dutyTag}>
                <Sparkles size={13} color="#D4AF37" />
                <Text style={styles.dutyTagTxt}>YOUR MINISTRY DUTY</Text>
              </View>
              {myAssignment.status === 'confirmed' ? (
                <View style={styles.statusBadgeConfirmed}>
                  <CheckCircle2 size={13} color="#059669" />
                  <Text style={styles.statusBadgeConfirmedTxt}>Confirmed</Text>
                </View>
              ) : myAssignment.status === 'declined' ? (
                <View style={styles.statusBadgeDeclined}>
                  <XCircle size={13} color="#DC2626" />
                  <Text style={styles.statusBadgeDeclinedTxt}>Declined</Text>
                </View>
              ) : (
                <View style={styles.statusBadgePending}>
                  <AlertCircle size={13} color="#B45309" />
                  <Text style={styles.statusBadgePendingTxt}>Action Required</Text>
                </View>
              )}
            </View>

            <Text style={styles.dutyRoleName}>{myAssignment.roleName}</Text>
            <Text style={styles.dutyDeptName}>{myAssignment.departmentName}</Text>

            <View style={styles.dutyInfoGrid}>
              <View style={styles.dutyInfoItem}>
                <Clock size={13} color="#1A2D5A" />
                <Text style={styles.dutyInfoLabel}>Call Time:</Text>
                <Text style={styles.dutyInfoVal}>{myAssignment.callTime}</Text>
              </View>
              {selectedPlan.rehearsalTime ? (
                <View style={styles.dutyInfoItem}>
                  <Music size={13} color="#1A2D5A" />
                  <Text style={styles.dutyInfoLabel}>Rehearsal:</Text>
                  <Text style={styles.dutyInfoVal}>{selectedPlan.rehearsalTime}</Text>
                </View>
              ) : null}
            </View>

            {/* RSVP Buttons */}
            {myAssignment.status === 'pending' ? (
              <View style={styles.rsvpRow}>
                <TouchableOpacity
                  style={styles.rsvpAcceptBtn}
                  disabled={responding}
                  onPress={() => handleRSVP('confirmed')}
                >
                  {responding ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check size={16} color="#FFFFFF" />
                      <Text style={styles.rsvpAcceptBtnTxt}>Accept Responsibility</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rsvpDeclineBtn}
                  disabled={responding}
                  onPress={() => setShowDeclineModal(true)}
                >
                  <Text style={styles.rsvpDeclineBtnTxt}>Decline</Text>
                </TouchableOpacity>
              </View>
            ) : myAssignment.status === 'confirmed' ? (
              <View style={styles.confirmedNoticeRow}>
                <Text style={styles.confirmedNoticeTxt}>
                  ✓ You are confirmed for this service. God bless your ministry!
                </Text>
                <TouchableOpacity onPress={() => setShowDeclineModal(true)}>
                  <Text style={styles.changeResponseTxt}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.declinedNoticeRow}>
                <Text style={styles.declinedNoticeTxt}>
                  Declined: {myAssignment.declineReason || 'Not available'}
                </Text>
                <TouchableOpacity onPress={() => handleRSVP('confirmed')}>
                  <Text style={styles.reAcceptTxt}>I can serve now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null}

        {/* ── 2. SERMON BANNER (IF CONFIGURED) ──────────────── */}
        {selectedPlan.sermon?.title ? (
          <View style={[styles.sermonCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
            <View style={styles.sermonIconBox}>
              <BookOpen size={20} color="#D4AF37" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sermonTag}>TODAY'S MESSAGE</Text>
              <Text style={[styles.sermonTitle, { color: theme.text }]}>
                {selectedPlan.sermon.title}
              </Text>
              <View style={styles.sermonMetaRow}>
                {selectedPlan.sermon.speaker ? (
                  <Text style={[styles.sermonSpeaker, { color: theme.subText }]}>
                    Speaker: <Text style={{ fontWeight: '700', color: theme.text }}>{selectedPlan.sermon.speaker}</Text>
                  </Text>
                ) : null}
                {selectedPlan.sermon.keyVerses ? (
                  <Text style={[styles.sermonVerses, { color: '#2563EB' }]}>
                    📖 {selectedPlan.sermon.keyVerses}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* ── 3. TABS: RUN-SHEET vs SETLIST vs SERMON ───────── */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'runSheet' && styles.tabBtnActive]}
            onPress={() => setActiveTab('runSheet')}
          >
            <Clock size={15} color={activeTab === 'runSheet' ? '#1A2D5A' : '#94A3B8'} />
            <Text style={[styles.tabBtnTxt, activeTab === 'runSheet' && styles.tabBtnTxtActive]}>
              Order of Service ({selectedPlan.runSheet?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'setlist' && styles.tabBtnActive]}
            onPress={() => setActiveTab('setlist')}
          >
            <Music size={15} color={activeTab === 'setlist' ? '#1A2D5A' : '#94A3B8'} />
            <Text style={[styles.tabBtnTxt, activeTab === 'setlist' && styles.tabBtnTxtActive]}>
              Worship Setlist ({selectedPlan.setlist?.length || 0})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── TAB 1: RUN SHEET TIMELINE ─────────────────────── */}
        {activeTab === 'runSheet' ? (
          <View style={styles.tabContent}>
            {(!selectedPlan.runSheet || selectedPlan.runSheet.length === 0) ? (
              <View style={[styles.emptyTabBox, { backgroundColor: theme.cardBg }]}>
                <Clock size={32} color="#94A3B8" />
                <Text style={[styles.emptyTabTxt, { color: theme.subText }]}>No timetable items scheduled yet.</Text>
              </View>
            ) : (
              selectedPlan.runSheet.map((item, idx) => {
                const isMyItem = myAssignment && item.assignedTo && (
                  item.assignedTo.toLowerCase().includes(currentMemberName.toLowerCase()) ||
                  item.assignedTo.toLowerCase().includes(myAssignment.roleName.toLowerCase())
                );

                return (
                  <View
                    key={item.id || idx}
                    style={[
                      styles.runSheetItemRow,
                      { backgroundColor: theme.cardBg, borderColor: theme.border },
                      isMyItem && styles.runSheetItemRowHighlighted
                    ]}
                  >
                    {/* Time Pillar */}
                    <View style={styles.runSheetTimeCol}>
                      <Text style={styles.runSheetStartTime}>
                        {item.startTime || (item.time ? item.time.split('to')[0].trim() : '09:00')}
                      </Text>
                      <View style={styles.runSheetDurationBadge}>
                        <Text style={styles.runSheetDurationTxt}>{item.durationMinutes || 10}m</Text>
                      </View>
                    </View>

                    {/* Timeline Line */}
                    <View style={styles.timelineDividerCol}>
                      <View style={[styles.timelineDot, isMyItem && styles.timelineDotActive]} />
                      {idx < selectedPlan.runSheet.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>

                    {/* Program Content */}
                    <View style={{ flex: 1, paddingVertical: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.runSheetProgramTitle, { color: theme.text }]}>
                          {item.program}
                        </Text>
                        {isMyItem ? (
                          <View style={styles.myRoleIndicator}>
                            <Text style={styles.myRoleIndicatorTxt}>YOUR PART</Text>
                          </View>
                        ) : null}
                      </View>

                      {item.assignedTo ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <User size={12} color="#64748B" />
                          <Text style={[styles.runSheetAssigned, { color: theme.subText }]}>
                            {item.assignedTo}
                          </Text>
                        </View>
                      ) : null}

                      {item.passage ? (
                        <Text style={styles.runSheetPassage}>📖 Scripture: {item.passage}</Text>
                      ) : null}

                      {item.songTitle ? (
                        <Text style={styles.runSheetSong}>🎵 Song: {item.songTitle}</Text>
                      ) : null}

                      {item.notes ? (
                        <Text style={[styles.runSheetNotes, { color: theme.subText }]}>{item.notes}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {/* ── TAB 2: WORSHIP SETLIST ────────────────────────── */}
        {activeTab === 'setlist' ? (
          <View style={styles.tabContent}>
            {(!selectedPlan.setlist || selectedPlan.setlist.length === 0) ? (
              <View style={[styles.emptyTabBox, { backgroundColor: theme.cardBg }]}>
                <Music size={32} color="#94A3B8" />
                <Text style={[styles.emptyTabTxt, { color: theme.subText }]}>No songs in this setlist yet.</Text>
              </View>
            ) : (
              selectedPlan.setlist.map((song, idx) => (
                <View
                  key={song.id || idx}
                  style={[styles.songCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                >
                  <View style={styles.songCardTop}>
                    <View style={styles.songNumberBadge}>
                      <Text style={styles.songNumberTxt}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 10 }}>
                      <Text style={[styles.songTitle, { color: theme.text }]}>{song.title}</Text>
                      {song.ledBy ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Mic2 size={12} color="#64748B" />
                          <Text style={[styles.songLeader, { color: theme.subText }]}>Led by {song.ledBy}</Text>
                        </View>
                      ) : null}
                    </View>

                    <TouchableOpacity style={styles.viewLyricsBtn} onPress={() => handleOpenLyrics(song)}>
                      <FileText size={14} color="#1A2D5A" />
                      <Text style={styles.viewLyricsBtnTxt}>Lyrics</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Badges: Key, Tempo, Time Signature */}
                  <View style={styles.songBadgesRow}>
                    <View style={styles.keyBadge}>
                      <Text style={styles.keyBadgeTxt}>Key: {song.key || 'C'}</Text>
                    </View>
                    {song.tempo ? (
                      <View style={styles.tempoBadge}>
                        <Text style={styles.tempoBadgeTxt}>BPM: {song.tempo}</Text>
                      </View>
                    ) : null}
                    {song.timeSignature ? (
                      <View style={styles.meterBadge}>
                        <Text style={styles.meterBadgeTxt}>{song.timeSignature}</Text>
                      </View>
                    ) : null}
                    {song.isOffertory ? (
                      <View style={styles.offertoryBadge}>
                        <Text style={styles.offertoryBadgeTxt}>Offertory</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Notes & Arrangements */}
                  {song.prelude || song.interlude || song.notes ? (
                    <View style={styles.songNotesBox}>
                      {song.prelude ? (
                        <Text style={styles.songArrangementTxt}>
                          <Text style={{ fontWeight: '700' }}>Prelude:</Text> {song.prelude}
                        </Text>
                      ) : null}
                      {song.interlude ? (
                        <Text style={styles.songArrangementTxt}>
                          <Text style={{ fontWeight: '700' }}>Interlude:</Text> {song.interlude}
                        </Text>
                      ) : null}
                      {song.notes ? (
                        <Text style={styles.songArrangementTxt}>
                          <Text style={{ fontWeight: '700' }}>Notes:</Text> {song.notes}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── MODAL 1: DECLINE REASON MODAL ──────────────────── */}
      <Modal visible={showDeclineModal} transparent animationType="slide" onRequestClose={() => setShowDeclineModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Decline Assignment</Text>
              <TouchableOpacity onPress={() => setShowDeclineModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalPrompt, { color: theme.subText }]}>
              Please let church coordinators know why you cannot serve this week so a backup member can be assigned:
            </Text>

            {['Out of station / Travelling', 'Work / Emergency', 'Health / Personal reason', 'Family Commitment', 'Other'].map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonOption, declineReason === r && styles.reasonOptionActive]}
                onPress={() => setDeclineReason(r)}
              >
                <View style={[styles.radioCircle, declineReason === r && styles.radioCircleActive]}>
                  {declineReason === r ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={[styles.reasonTxt, { color: theme.text }]}>{r}</Text>
              </TouchableOpacity>
            ))}

            <TextInput
              style={[styles.declineInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="Additional notes for Pastor/Coordinator (optional)..."
              placeholderTextColor="#94A3B8"
              value={declineCustomNote}
              onChangeText={setDeclineCustomNote}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowDeclineModal(false)}>
                <Text style={styles.modalCancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitDeclineBtn}
                disabled={responding}
                onPress={() => handleRSVP('declined')}
              >
                {responding ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitDeclineBtnTxt}>Confirm Decline</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 2: SONG LYRICS VIEWER ─────────────────────── */}
      <Modal visible={lyricsModalVisible} transparent animationType="slide" onRequestClose={() => setLyricsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.lyricsModalBox, { backgroundColor: theme.cardBg }]}>
            <View style={styles.lyricsModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lyricsModalTitle, { color: theme.text }]} numberOfLines={1}>
                  {selectedSong?.title}
                </Text>
                <Text style={styles.lyricsModalSub}>
                  Key: {selectedSong?.key || 'C'} · Led by {selectedSong?.ledBy || 'Worship Leader'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setLyricsModalVisible(false)}>
                <X size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {loadingLyrics ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#1A2D5A" />
                <Text style={{ marginTop: 8, color: '#64748B', fontSize: 13 }}>Loading lyrics...</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {songLyricsData?.te ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.lyricsSectionHeading}>తెలుగు సాహిత్యం (Telugu Lyrics):</Text>
                    <Text style={[styles.lyricsText, { color: theme.text }]}>{songLyricsData.te}</Text>
                  </View>
                ) : null}

                {songLyricsData?.en && songLyricsData.en !== songLyricsData?.te ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.lyricsSectionHeading}>English Lyrics / Transliteration:</Text>
                    <Text style={[styles.lyricsText, { color: theme.text }]}>{songLyricsData.en}</Text>
                  </View>
                ) : null}

                {!songLyricsData?.te && !songLyricsData?.en ? (
                  <Text style={{ color: '#94A3B8', textAlign: 'center', marginVertical: 20 }}>
                    No lyrics attached to this song yet.
                  </Text>
                ) : null}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.lyricsCloseBtn} onPress={() => setLyricsModalVisible(false)}>
              <Text style={styles.lyricsCloseBtnTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  loadingTxt: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600'
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center'
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20
  },
  backBtnPill: {
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20
  },
  backBtnPillTxt: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14
  },

  // ── Header
  header: {
    paddingBottom: 12,
    paddingHorizontal: 16
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  headerIconBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF'
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D4AF37',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  headerShareBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  headerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12
  },
  headerBadgeTxt: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600'
  },
  planSelectorRow: {
    gap: 8,
    paddingTop: 10
  },
  planSelectorPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'transparent'
  },
  planSelectorPillActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#F59E0B'
  },
  planSelectorPillTxt: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '700'
  },
  planSelectorPillTxtActive: {
    color: '#1A2D5A'
  },

  scrollContent: {
    padding: 16
  },

  // ── Duty Card
  dutyCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }
  },
  dutyCardPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D'
  },
  dutyCardConfirmed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7'
  },
  dutyCardDeclined: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5'
  },
  dutyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  dutyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  dutyTagTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.8
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  statusBadgePendingTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309'
  },
  statusBadgeConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  statusBadgeConfirmedTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669'
  },
  statusBadgeDeclined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  statusBadgeDeclinedTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626'
  },
  dutyRoleName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A2D5A',
    marginTop: 2
  },
  dutyDeptName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2
  },
  dutyInfoGrid: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 6
  },
  dutyInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  dutyInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B'
  },
  dutyInfoVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2D5A'
  },

  // RSVP actions
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14
  },
  rsvpAcceptBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1A2D5A',
    paddingVertical: 12,
    borderRadius: 12
  },
  rsvpAcceptBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  rsvpDeclineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DC2626'
  },
  rsvpDeclineBtnTxt: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 13
  },
  confirmedNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    backgroundColor: '#D1FAE5',
    padding: 10,
    borderRadius: 10
  },
  confirmedNoticeTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    flex: 1
  },
  changeResponseTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    marginLeft: 8,
    textDecorationLine: 'underline'
  },
  declinedNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 10
  },
  declinedNoticeTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    flex: 1
  },
  reAcceptTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    marginLeft: 8,
    textDecorationLine: 'underline'
  },

  // ── Sermon Card
  sermonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1
  },
  sermonIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sermonTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D4AF37',
    letterSpacing: 0.6
  },
  sermonTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1
  },
  sermonMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 3
  },
  sermonSpeaker: {
    fontSize: 12
  },
  sermonVerses: {
    fontSize: 12,
    fontWeight: '700'
  },

  // ── Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 4,
    borderRadius: 14,
    marginBottom: 16
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4
  },
  tabBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B'
  },
  tabBtnTxtActive: {
    color: '#1A2D5A'
  },
  tabContent: {
    gap: 10
  },
  emptyTabBox: {
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTabTxt: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8
  },

  // ── Run Sheet
  runSheetItemRow: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1
  },
  runSheetItemRowHighlighted: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFDF5',
    borderWidth: 2
  },
  runSheetTimeCol: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  runSheetStartTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  runSheetDurationBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4
  },
  runSheetDurationTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB'
  },
  timelineDividerCol: {
    width: 24,
    alignItems: 'center'
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
    marginTop: 3
  },
  timelineDotActive: {
    backgroundColor: '#D4AF37',
    transform: [{ scale: 1.2 }]
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4
  },
  runSheetProgramTitle: {
    fontSize: 14,
    fontWeight: '800'
  },
  myRoleIndicator: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  myRoleIndicatorTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#1A2D5A'
  },
  runSheetAssigned: {
    fontSize: 12,
    fontWeight: '600'
  },
  runSheetPassage: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 2
  },
  runSheetSong: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2
  },
  runSheetNotes: {
    fontSize: 11,
    marginTop: 2
  },

  // ── Setlist
  songCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1
  },
  songCardTop: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  songNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  songNumberTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  songTitle: {
    fontSize: 14,
    fontWeight: '800'
  },
  songLeader: {
    fontSize: 11,
    fontWeight: '600'
  },
  viewLyricsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10
  },
  viewLyricsBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1A2D5A'
  },
  songBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10
  },
  keyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  keyBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E'
  },
  tempoBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  tempoBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46'
  },
  meterBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  meterBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B21A8'
  },
  offertoryBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  offertoryBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569'
  },
  songNotesBox: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    gap: 2
  },
  songArrangementTxt: {
    fontSize: 11,
    color: '#475569'
  },

  // ── Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },
  modalBox: {
    width: '100%',
    borderRadius: 20,
    padding: 20
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  modalPrompt: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  reasonOptionActive: {
    backgroundColor: '#FFFBEB'
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  radioCircleActive: {
    borderColor: '#D4AF37'
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#D4AF37'
  },
  reasonTxt: {
    fontSize: 13,
    fontWeight: '600'
  },
  declineInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: 12
  },
  modalBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center'
  },
  modalCancelBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B'
  },
  modalSubmitDeclineBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center'
  },
  modalSubmitDeclineBtnTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF'
  },

  // Lyrics Modal
  lyricsModalBox: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%'
  },
  lyricsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  lyricsModalTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  lyricsModalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  lyricsSectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D4AF37',
    marginBottom: 6,
    marginTop: 10
  },
  lyricsText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500'
  },
  lyricsCloseBtn: {
    backgroundColor: '#1A2D5A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12
  },
  lyricsCloseBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  }
});

