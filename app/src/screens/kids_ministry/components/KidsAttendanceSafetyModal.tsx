import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Users,
  MapPin,
  Edit3,
  Plus,
  Trash2,
  Phone,
  UserCheck,
  KeyRound,
  FileText,
  Lock,
  Check,
  LogOut,
  DoorOpen,
  History,
  LayoutGrid,
} from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import KidsMinistryService from '../../../services/KidsMinistryService';
import { formatDateDisplay, toStandardDateString } from '../../../utils/DateUtils';
import {
  ChildRecord,
  AuthorizedGuardian,
  KidsAttendanceSession,
  KidsSessionRecord,
  KidsAttendanceLogRecord,
  KidsClassRecord,
  KidsTeacherRecord,
  KidsProgramType,
  KidsProgramAttendanceEntry,
  KidsAttendanceDisplayStatus,
  resolveChildConsentInfo,
  buildChildProgramAttendanceEntries,
  getKidsProgramVisual,
} from '../../../types/KidsMinistryTypes';

export type KidsSafetyModalSection = 'overview' | 'history' | 'consent';

interface Props {
  visible: boolean;
  initialSection?: KidsSafetyModalSection;
  initialProgramSessionId?: string | null;
  childrenList: ChildRecord[];
  selectedChildIndex: number;
  onSelectChild: (index: number) => void;
  churchId: string;
  member: any;
  programSessions: KidsAttendanceSession[];
  custodyRecords: KidsSessionRecord[];
  attendanceLogs: KidsAttendanceLogRecord[];
  loadingAttendance?: boolean;
  classes: KidsClassRecord[];
  teachers: KidsTeacherRecord[];
  onClose: () => void;
}

const GUARDIAN_RELATIONS: AuthorizedGuardian['relationship'][] = [
  'Father',
  'Mother',
  'Grandfather',
  'Grandmother',
  'Uncle',
  'Aunt',
  'Guardian',
  'Other',
];

const PROGRAM_FILTER_CHIPS: Array<{ id: 'all' | KidsProgramType; label: string }> = [
  { id: 'all', label: 'All Programs' },
  { id: 'sunday_school', label: 'Sunday School' },
  { id: 'vbs', label: 'VBS' },
  { id: 'special_meeting', label: 'Special Meetings' },
  { id: 'bible_study', label: 'Bible Study' },
  { id: 'childrens_worship', label: 'Worship' },
  { id: 'summer_camp', label: 'Summer Camp' },
];

function formatPrettyDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const clean = String(dateStr).trim().split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(parts[1], 10) - 1;
    const monthLabel = months[mIdx] || parts[1];
    return `${parts[2]} ${monthLabel} ${parts[0]}`;
  }
  return formatDateDisplay(clean) || clean;
}

function toJsDate(val: any): Date | null {
  if (!val) return null;
  try {
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val?.toDate === 'function') {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000);
    if (typeof val?._seconds === 'number') return new Date(val._seconds * 1000);
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function formatTimeOnly(val: any, fallback = '—'): string {
  const d = toJsDate(val);
  if (!d) return fallback;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateTimeDisplay(val: any): string {
  const d = toJsDate(val);
  if (!d) return 'Not updated yet';
  const datePart = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}

function getStatusMeta(status: KidsAttendanceDisplayStatus, isDark: boolean) {
  switch (status) {
    case 'present':
      return {
        label: 'Present',
        description: 'Checked in safely and currently in the classroom.',
        color: isDark ? '#34D399' : '#047857',
        bg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#DCFCE7',
        border: isDark ? 'rgba(52, 211, 153, 0.35)' : '#86EFAC',
      };
    case 'checked_out':
      return {
        label: 'Present · Checked Out',
        description: 'Attended this program and safely handed over to pickup guardian.',
        color: isDark ? '#60A5FA' : '#1D4ED8',
        bg: isDark ? 'rgba(59, 130, 246, 0.16)' : '#DBEAFE',
        border: isDark ? 'rgba(96, 165, 250, 0.35)' : '#93C5FD',
      };
    case 'absent':
      return {
        label: 'Absent',
        description: 'Attendance for this program has been finalized; child was not checked in.',
        color: isDark ? '#F87171' : '#DC2626',
        bg: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
        border: isDark ? 'rgba(248, 113, 113, 0.35)' : '#FCA5A5',
      };
    case 'not_checked_in':
    default:
      return {
        label: 'Not Yet Checked In',
        description: 'This program has not been checked into yet and attendance is not finalized.',
        color: isDark ? '#FBBF24' : '#B45309',
        bg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FEF3C7',
        border: isDark ? 'rgba(251, 191, 36, 0.35)' : '#FCD34D',
      };
  }
}

export default function KidsAttendanceSafetyModal({
  visible,
  initialSection = 'overview',
  initialProgramSessionId,
  childrenList,
  selectedChildIndex,
  onSelectChild,
  churchId,
  member,
  programSessions,
  custodyRecords,
  attendanceLogs,
  loadingAttendance = false,
  classes,
  teachers,
  onClose,
}: Props) {
  const { isDark } = useTheme();
  const palette = useMemo(
    () => ({
      screenBg: isDark ? '#0B0F19' : '#FFFDF9',
      cardBg: isDark ? '#161C2E' : '#FFFFFF',
      innerBg: isDark ? '#1E2538' : '#F8FAFC',
      border: isDark ? '#283149' : '#E2E8F0',
      textPrimary: isDark ? '#F8FAFC' : '#111827',
      textSecondary: isDark ? '#94A3B8' : '#64748B',
      accentPurple: '#7C3AED',
      accentCoral: '#FF6B4A',
      accentEmerald: isDark ? '#34D399' : '#059669',
      accentAmber: isDark ? '#FBBF24' : '#D97706',
    }),
    [isDark]
  );

  const safeIdx = childrenList.length > 0 ? Math.min(selectedChildIndex, childrenList.length - 1) : 0;
  const activeChild = childrenList[safeIdx] || null;
  const activeChildId = activeChild?.id || null;

  // Separate "Attendance" vs "Consent & Safety" into distinct views with zero duplicate UI.
  const modalMode: 'attendance' | 'consent' = initialSection === 'consent' ? 'consent' : 'attendance';

  const [section, setSection] = useState<'overview' | 'history'>(
    initialSection === 'history' ? 'history' : 'overview'
  );
  const [selectedProgramSessionId, setSelectedProgramSessionId] = useState<string | null>(
    initialProgramSessionId || null
  );

  // History Filters & Delete State
  const [historyProgramFilter, setHistoryProgramFilter] = useState<'all' | KidsProgramType>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // Parent Consent Edit Form State
  const [isEditingConsent, setIsEditingConsent] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [canLeaveClass, setCanLeaveClass] = useState(false);
  const [canLeavePremises, setCanLeavePremises] = useState(false);
  const [teacherInstructions, setTeacherInstructions] = useState('');
  const [editGuardians, setEditGuardians] = useState<AuthorizedGuardian[]>([]);
  const [emergName, setEmergName] = useState('');
  const [emergRelation, setEmergRelation] = useState('Parent');
  const [emergPhone, setEmergPhone] = useState('');

  // Inline Add Guardian Mini-Form inside Edit Consent
  const [showAddGuardianForm, setShowAddGuardianForm] = useState(false);
  const [newGName, setNewGName] = useState('');
  const [newGRelation, setNewGRelation] = useState<AuthorizedGuardian['relationship']>('Mother');
  const [newGPhone, setNewGPhone] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSection(initialSection === 'history' ? 'history' : 'overview');
    setSelectedProgramSessionId(initialProgramSessionId || null);
    setHistoryProgramFilter('all');
    setHistoryDateFilter(null);
    setIsEditingConsent(false);
    setShowAddGuardianForm(false);
  }, [visible, initialSection, initialProgramSessionId]);

  // Reset selected program & edit states whenever parent switches to another child
  useEffect(() => {
    setSelectedProgramSessionId(null);
    setIsEditingConsent(false);
    setShowAddGuardianForm(false);
  }, [activeChildId]);

  // Filter custody & attendance records strictly by the currently selected child's unique ID
  const childScopedCustodyRecords = useMemo(() => {
    if (!activeChild) return [];
    return custodyRecords.filter(r => {
      if (r.childDocId) return r.childDocId === activeChild.id;
      if (r.childId && activeChild.childId) return r.childId === activeChild.childId;
      return false;
    });
  }, [activeChild, custodyRecords]);

  const childScopedAttendanceLogs = useMemo(() => {
    if (!activeChild) return [];
    return attendanceLogs.filter(l => {
      if (l.childDocId) return l.childDocId === activeChild.id;
      if (l.childId && activeChild.childId) return l.childId === activeChild.childId;
      return false;
    });
  }, [activeChild, attendanceLogs]);

  // Build program-wise entries strictly for the active child
  const programEntries: KidsProgramAttendanceEntry[] = useMemo(
    () =>
      loadingAttendance
        ? []
        : buildChildProgramAttendanceEntries({
            child: activeChild,
            programSessions,
            custodyRecords: childScopedCustodyRecords,
            attendanceLogs: childScopedAttendanceLogs,
            classes,
            teachers,
          }),
    [
      loadingAttendance,
      activeChild,
      programSessions,
      childScopedCustodyRecords,
      childScopedAttendanceLogs,
      classes,
      teachers,
    ]
  );

  // Auto-select most relevant program entry for Overview
  useEffect(() => {
    if (!visible || programEntries.length === 0) return;
    if (
      selectedProgramSessionId &&
      programEntries.some(e => e.programSessionId === selectedProgramSessionId)
    ) {
      return;
    }
    const todayStr = toStandardDateString(new Date());
    const liveCheckedIn = programEntries.find(e => e.attendanceStatus === 'present');
    const todayEntry = programEntries.find(e => e.date === todayStr);
    const activeEntry = programEntries.find(e => e.sessionStatus === 'active');
    const chosen = liveCheckedIn || todayEntry || activeEntry || programEntries[0];
    setSelectedProgramSessionId(chosen?.programSessionId || null);
  }, [visible, programEntries, selectedProgramSessionId]);

  const selectedEntry =
    programEntries.find(e => e.programSessionId === selectedProgramSessionId) ||
    programEntries[0] ||
    null;

  // Filtered history
  const filteredHistory = useMemo(() => {
    return programEntries.filter(entry => {
      if (historyProgramFilter !== 'all' && entry.programType !== historyProgramFilter) {
        return false;
      }
      if (historyDateFilter && entry.date !== historyDateFilter) {
        return false;
      }
      return true;
    });
  }, [programEntries, historyProgramFilter, historyDateFilter]);

  const historySummary = useMemo(() => {
    const attended = programEntries.filter(
      e => e.attendanceStatus === 'present' || e.attendanceStatus === 'checked_out'
    ).length;
    const absent = programEntries.filter(e => e.attendanceStatus === 'absent').length;
    return { total: programEntries.length, attended, absent };
  }, [programEntries]);

  const consentInfo = useMemo(() => resolveChildConsentInfo(activeChild), [activeChild]);

  // Initialize edit form from activeChild whenever opening Edit Mode
  const openEditConsentForm = () => {
    if (!activeChild) return;
    setCanLeaveClass(consentInfo.canLeaveClassroomIndependently);
    setCanLeavePremises(consentInfo.canLeavePremisesIndependently);
    setTeacherInstructions(consentInfo.teacherInstructions);
    setEditGuardians(
      activeChild.guardians && activeChild.guardians.length > 0
        ? activeChild.guardians.map(g => ({ ...g }))
        : [
            {
              id: activeChild.parentMemberId || 'primary_parent',
              name: activeChild.parentName || 'Parent',
              relationship: 'Father',
              phone: activeChild.parentPhone || '',
              isPrimaryContact: true,
              canPickup: true,
            },
          ]
    );
    setEmergName(activeChild.medical?.emergencyContact?.name || activeChild.parentName || '');
    setEmergRelation(activeChild.medical?.emergencyContact?.relationship || 'Parent');
    setEmergPhone(activeChild.medical?.emergencyContact?.phone || activeChild.parentPhone || '');
    setShowAddGuardianForm(false);
    setIsEditingConsent(true);
  };

  const handleDeleteHistoryEntry = (entry: KidsProgramAttendanceEntry) => {
    if (!activeChild || deletingSessionId) return;
    const activeWarning =
      entry.attendanceStatus === 'present'
        ? '\n\nNote: This child is currently checked in for this session. Deleting will also clear their active check-in status for this program.'
        : '';

    Alert.alert(
      'Delete Attendance Record',
      `Remove "${entry.programTitle}" (${formatPrettyDate(entry.date)}) from ${activeChild.firstName || activeChild.fullName}’s attendance history?${activeWarning}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingSessionId(entry.programSessionId);
              await KidsMinistryService.deleteChildAttendanceHistoryRecord({
                churchId,
                childDocId: activeChild.id,
                programSessionId: entry.programSessionId,
                date: entry.date,
                custodyRecordId: entry.custodyRecordId,
                deletedByMemberId: member?.id,
              });
              if (selectedProgramSessionId === entry.programSessionId) {
                setSelectedProgramSessionId(null);
              }
            } catch (e: any) {
              Alert.alert('Delete Failed', e?.message || 'Could not remove attendance record.');
            } finally {
              setDeletingSessionId(null);
            }
          },
        },
      ]
    );
  };

  const handleAddGuardianToDraft = () => {
    if (!newGName.trim() || !newGPhone.trim()) {
      Alert.alert('Missing Details', 'Please enter the pickup guardian’s name and mobile number.');
      return;
    }
    setEditGuardians(prev => [
      ...prev,
      {
        id: `g_${Date.now()}`,
        name: newGName.trim(),
        relationship: newGRelation,
        phone: newGPhone.trim(),
        isPrimaryContact: prev.length === 0,
        canPickup: true,
      },
    ]);
    setNewGName('');
    setNewGPhone('');
    setShowAddGuardianForm(false);
  };

  const handleRemoveGuardianFromDraft = (idx: number) => {
    if (editGuardians.length <= 1) {
      Alert.alert(
        'Primary Contact Required',
        'At least one authorized parent/guardian must remain listed for child safety.'
      );
      return;
    }
    setEditGuardians(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveConsentAndSafety = async () => {
    if (!activeChild || !member) return;
    if (editGuardians.length === 0 || !editGuardians[0]?.name?.trim()) {
      Alert.alert('Pickup Guardian Required', 'Please keep at least one authorized pickup person.');
      return;
    }
    if (!emergName.trim() || !emergPhone.trim()) {
      Alert.alert('Emergency Contact Required', 'Please provide emergency contact name and mobile number.');
      return;
    }

    try {
      setSavingConsent(true);
      const parentName =
        member?.name || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || activeChild.parentName || 'Parent';

      await KidsMinistryService.updateParentConsentAndSafety(churchId, activeChild.id, {
        parentMemberId: member?.id || activeChild.parentMemberId || '',
        parentName,
        canLeaveClassroomIndependently: canLeaveClass,
        canLeavePremisesIndependently: canLeavePremises,
        teacherInstructions: teacherInstructions.trim(),
        guardians: editGuardians,
        emergencyContact: {
          name: emergName.trim(),
          relationship: emergRelation.trim() || 'Parent',
          phone: emergPhone.trim(),
        },
      });

      setIsEditingConsent(false);
      Alert.alert(
        'Consent & Safety Updated ✓',
        `Latest release permissions and pickup details for ${activeChild.fullName} are now saved and visible to teachers & admins.`
      );
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update consent details.');
    } finally {
      setSavingConsent(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top', 'bottom']}>
          <StatusBar
            barStyle={isDark ? 'light-content' : 'dark-content'}
            backgroundColor={palette.screenBg}
          />

          {/* ── TOP HEADER ── */}
          <View style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.screenBg }]}>
            <View
              style={[
                styles.headerIconBadge,
                {
                  backgroundColor:
                    modalMode === 'consent'
                      ? isDark
                        ? 'rgba(16, 185, 129, 0.16)'
                        : '#ECFDF5'
                      : isDark
                      ? 'rgba(124, 58, 237, 0.16)'
                      : '#F5F3FF',
                  borderColor:
                    modalMode === 'consent'
                      ? isDark
                        ? 'rgba(52, 211, 153, 0.35)'
                        : '#A7F3D0'
                      : isDark
                      ? 'rgba(139, 92, 246, 0.35)'
                      : '#DDD6FE',
                },
              ]}
            >
              {modalMode === 'consent' ? (
                <ShieldCheck size={18} color={palette.accentEmerald} />
              ) : (
                <Calendar size={18} color={palette.accentPurple} />
              )}
            </View>

            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.headerTitle, { color: palette.textPrimary }]} numberOfLines={1}>
                {modalMode === 'consent' ? 'Parent Consent & Safety' : 'Child Attendance'}
              </Text>
              <Text style={[styles.headerSub, { color: palette.textSecondary }]}>
                {modalMode === 'consent'
                  ? 'Release permissions, approved pickups & emergency info'
                  : 'Check-in times, pickup security & program history'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: palette.cardBg, borderColor: palette.border }]}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.8}
            >
              <X size={18} color={palette.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* ── REDESIGNED ATTENDANCE MODE SWITCHER (PROGRAM OVERVIEW vs HISTORY) ── */}
          {modalMode === 'attendance' && (
            <View style={[styles.segmentedOuter, { borderBottomColor: palette.border, backgroundColor: palette.screenBg }]}>
              <View style={[styles.segmentedTrack, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                <TouchableOpacity
                  style={[
                    styles.segmentedBtn,
                    section === 'overview' && {
                      backgroundColor: isDark ? '#7C3AED' : '#0F172A',
                      borderColor: isDark ? '#8B5CF6' : '#0F172A',
                      shadowColor: '#0F172A',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.14,
                      shadowRadius: 6,
                      elevation: 3,
                    },
                  ]}
                  onPress={() => setSection('overview')}
                  activeOpacity={0.86}
                >
                  <LayoutGrid
                    size={14}
                    color={section === 'overview' ? '#FFFFFF' : palette.textSecondary}
                    strokeWidth={2.2}
                  />
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      { color: section === 'overview' ? '#FFFFFF' : palette.textSecondary },
                      section === 'overview' && { fontWeight: '800' },
                    ]}
                    numberOfLines={1}
                  >
                    Program Overview
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.segmentedBtn,
                    section === 'history' && {
                      backgroundColor: isDark ? '#7C3AED' : '#0F172A',
                      borderColor: isDark ? '#8B5CF6' : '#0F172A',
                      shadowColor: '#0F172A',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.14,
                      shadowRadius: 6,
                      elevation: 3,
                    },
                  ]}
                  onPress={() => setSection('history')}
                  activeOpacity={0.86}
                >
                  <History
                    size={14}
                    color={section === 'history' ? '#FFFFFF' : palette.textSecondary}
                    strokeWidth={2.2}
                  />
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      { color: section === 'history' ? '#FFFFFF' : palette.textSecondary },
                      section === 'history' && { fontWeight: '800' },
                    ]}
                    numberOfLines={1}
                  >
                    History
                  </Text>
                  <View
                    style={[
                      styles.tabCountBadge,
                      {
                        backgroundColor:
                          section === 'history'
                            ? 'rgba(255,255,255,0.2)'
                            : isDark
                            ? 'rgba(148, 163, 184, 0.18)'
                            : '#E2E8F0',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabCountBadgeText,
                        { color: section === 'history' ? '#FFFFFF' : palette.textPrimary },
                      ]}
                    >
                      {programEntries.length}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!activeChild ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconCircle, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                <Users size={30} color={palette.textSecondary} />
              </View>
              <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>No Child Profile Linked</Text>
              <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                Please add your child in Rhema Kids to view attendance and safety details.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
              {/* ── SELECTED CHILD IDENTITY & SWITCHER CARD ── */}
              <View style={[styles.childProfileCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                <View style={styles.childProfileTopRow}>
                  <View
                    style={[
                      styles.selectedChildAvatar,
                      {
                        backgroundColor: isDark ? '#231B3C' : '#EDE9FE',
                        borderColor: palette.accentPurple,
                      },
                    ]}
                  >
                    {activeChild.photoUrl ? (
                      <Image
                        source={{ uri: activeChild.photoUrl }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={{ fontSize: 17, fontWeight: '800', color: palette.accentPurple }}>
                        {(activeChild.firstName || activeChild.fullName || 'K').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>

                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.selectedChildEyebrow, { color: palette.accentPurple }]}>
                      {modalMode === 'consent' ? 'SAFETY PROFILE' : 'ATTENDANCE PROFILE'}
                    </Text>
                    <Text style={[styles.selectedChildName, { color: palette.textPrimary }]} numberOfLines={1}>
                      {activeChild.fullName}
                    </Text>
                    <Text style={[styles.selectedChildMeta, { color: palette.textSecondary }]} numberOfLines={1}>
                      {activeChild.childId ? `${activeChild.childId} · ` : ''}Age {activeChild.age} ·{' '}
                      {activeChild.assignedClassName || 'Sunday School'}
                    </Text>
                  </View>

                  {modalMode === 'consent' ? (
                    <View
                      style={[
                        styles.statusChipCompact,
                        {
                          backgroundColor: consentInfo.isConfirmed
                            ? isDark
                              ? 'rgba(16, 185, 129, 0.16)'
                              : '#ECFDF5'
                            : isDark
                            ? 'rgba(245, 158, 11, 0.16)'
                            : '#FFFBEB',
                          borderColor: consentInfo.isConfirmed
                            ? isDark
                              ? 'rgba(52, 211, 153, 0.35)'
                              : '#A7F3D0'
                            : isDark
                            ? 'rgba(251, 191, 36, 0.35)'
                            : '#FDE68A',
                        },
                      ]}
                    >
                      {consentInfo.isConfirmed ? (
                        <ShieldCheck size={12} color={palette.accentEmerald} />
                      ) : (
                        <ShieldAlert size={12} color={palette.accentAmber} />
                      )}
                      <Text
                        style={[
                          styles.statusChipCompactText,
                          { color: consentInfo.isConfirmed ? palette.accentEmerald : palette.accentAmber },
                        ]}
                      >
                        {consentInfo.isConfirmed ? 'Approved' : 'Pending'}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.statusChipCompact,
                        {
                          backgroundColor:
                            activeChild.custodyStatus === 'checked_in'
                              ? isDark
                                ? 'rgba(16, 185, 129, 0.16)'
                                : '#ECFDF5'
                              : palette.innerBg,
                          borderColor:
                            activeChild.custodyStatus === 'checked_in'
                              ? isDark
                                ? 'rgba(52, 211, 153, 0.35)'
                                : '#A7F3D0'
                              : palette.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.dotMini,
                          {
                            backgroundColor:
                              activeChild.custodyStatus === 'checked_in' ? '#10B981' : '#94A3B8',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusChipCompactText,
                          {
                            color:
                              activeChild.custodyStatus === 'checked_in'
                                ? palette.accentEmerald
                                : palette.textSecondary,
                          },
                        ]}
                      >
                        {activeChild.custodyStatus === 'checked_in' ? 'In Class' : 'Enrolled'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Integrated Child Switcher Strip if > 1 child in family */}
                {childrenList.length > 1 && (
                  <View style={[styles.childSwitcherEmbedded, { borderTopColor: palette.border }]}>
                    <Text style={[styles.switchChildLabel, { color: palette.textSecondary }]}>
                      SWITCH CHILD
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                      {childrenList.map((child, idx) => {
                        const selected = idx === safeIdx;
                        return (
                          <TouchableOpacity
                            key={child.id}
                            style={[
                              styles.childPill,
                              { backgroundColor: palette.innerBg, borderColor: palette.border },
                              selected && {
                                backgroundColor: palette.accentPurple,
                                borderColor: palette.accentPurple,
                              },
                            ]}
                            onPress={() => {
                              if (idx !== safeIdx) {
                                setSelectedProgramSessionId(null);
                                onSelectChild(idx);
                                setIsEditingConsent(false);
                              }
                            }}
                            activeOpacity={0.82}
                          >
                            <View
                              style={[
                                styles.childDot,
                                {
                                  backgroundColor:
                                    child.custodyStatus === 'checked_in'
                                      ? selected
                                        ? '#A7F3D0'
                                        : '#10B981'
                                      : selected
                                      ? '#DDD6FE'
                                      : '#94A3B8',
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.childPillText,
                                { color: selected ? '#FFFFFF' : palette.textPrimary },
                                selected && { fontWeight: '800' },
                              ]}
                              numberOfLines={1}
                            >
                              {child.fullName || child.firstName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* ================================================== */}
              {/* ATTENDANCE MODE: LOADING TRANSITION                */}
              {/* ================================================== */}
              {modalMode === 'attendance' && loadingAttendance ? (
                <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                  <View style={styles.emptyInner}>
                    <ActivityIndicator size="small" color={palette.accentPurple} />
                    <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                      Loading attendance records for {activeChild.fullName}...
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* ================================================== */}
              {/* ATTENDANCE TAB 1: PROGRAM OVERVIEW                 */}
              {/* ================================================== */}
              {modalMode === 'attendance' && !loadingAttendance && section === 'overview' && (
                <>
                  {programEntries.length === 0 ? (
                    <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                      <View style={styles.emptyInner}>
                        <View
                          style={[
                            styles.emptyIconCircle,
                            {
                              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
                              borderColor: isDark ? 'rgba(251, 191, 36, 0.3)' : '#FDE68A',
                            },
                          ]}
                        >
                          <Calendar size={26} color={palette.accentAmber} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
                          No Program Sessions Scheduled Yet
                        </Text>
                        <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                          When Sunday School, VBS, or a Special Kids program session begins, {activeChild.firstName}’s check-in and check-out details will appear here automatically.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      {/* Horizontal Program Selector Pills */}
                      <View style={{ gap: 8 }}>
                        <View style={styles.sectionLabelRow}>
                          <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                            SELECT PROGRAM SESSION
                          </Text>
                          <Text style={[styles.sectionCountHint, { color: palette.textSecondary }]}>
                            {programEntries.length} {programEntries.length === 1 ? 'program' : 'programs'}
                          </Text>
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8 }}
                        >
                          {programEntries.map(entry => {
                            const selected = selectedEntry?.programSessionId === entry.programSessionId;
                            const st = getStatusMeta(entry.attendanceStatus, isDark);
                            const pVisual = getKidsProgramVisual(entry.programType, isDark);
                            return (
                              <TouchableOpacity
                                key={entry.programSessionId}
                                style={[
                                  styles.programPickChip,
                                  { backgroundColor: palette.cardBg, borderColor: palette.border },
                                  selected && {
                                    borderColor: pVisual.accentColor,
                                    borderWidth: 1.6,
                                    backgroundColor: pVisual.softBg,
                                  },
                                ]}
                                onPress={() => setSelectedProgramSessionId(entry.programSessionId)}
                                activeOpacity={0.82}
                              >
                                <View style={styles.programPickTopRow}>
                                  <Text style={{ fontSize: 14 }}>{pVisual.emoji}</Text>
                                  <View style={[styles.dotSmall, { backgroundColor: st.color }]} />
                                </View>
                                <Text
                                  style={[
                                    styles.programPickTitle,
                                    { color: palette.textPrimary },
                                    selected && { fontWeight: '800' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {entry.programTitle}
                                </Text>
                                <Text style={[styles.programPickDate, { color: palette.textSecondary }]}>
                                  {formatPrettyDate(entry.date)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>

                      {/* Selected Program Attendance Hero Card */}
                      {selectedEntry && (() => {
                        const meta = getStatusMeta(selectedEntry.attendanceStatus, isDark);
                        const progVisual = getKidsProgramVisual(selectedEntry.programType, isDark);
                        const normTitle = (selectedEntry.programTitle || '').trim().toLowerCase();
                        const showCategoryBadge =
                          normTitle !== progVisual.label.trim().toLowerCase() &&
                          normTitle !== progVisual.shortLabel.trim().toLowerCase();

                        return (
                          <View
                            style={[
                              styles.accentCard,
                              { backgroundColor: palette.cardBg, borderColor: palette.border },
                            ]}
                          >
                            <View style={[styles.cardTopAccent, { backgroundColor: progVisual.accentColor }]} />

                            <View style={styles.accentCardBody}>
                              {/* Program Title & Attendance Status Row */}
                              <View style={styles.overviewTopRow}>
                                <View
                                  style={[
                                    styles.programEmojiSquare,
                                    { backgroundColor: progVisual.softBg, borderColor: progVisual.softBorder },
                                  ]}
                                >
                                  <Text style={{ fontSize: 22 }}>{progVisual.emoji}</Text>
                                </View>

                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  {showCategoryBadge && (
                                    <Text style={[styles.programCategoryEyebrow, { color: progVisual.accentColor }]}>
                                      {progVisual.shortLabel.toUpperCase()}
                                    </Text>
                                  )}
                                  <Text style={[styles.overviewTitle, { color: palette.textPrimary }]}>
                                    {selectedEntry.programTitle}
                                  </Text>
                                  <View style={styles.dateRowInline}>
                                    <Calendar size={12} color={palette.textSecondary} />
                                    <Text style={[styles.overviewDateLine, { color: palette.textSecondary }]}>
                                      {formatPrettyDate(selectedEntry.date)}
                                      {selectedEntry.startTime ? ` · ${selectedEntry.startTime}` : ''}
                                    </Text>
                                  </View>
                                </View>

                                <View
                                  style={[
                                    styles.statusPillBig,
                                    { backgroundColor: meta.bg, borderColor: meta.border },
                                  ]}
                                >
                                  <Text style={[styles.statusPillBigText, { color: meta.color }]}>
                                    {meta.label}
                                  </Text>
                                </View>
                              </View>

                              {/* Status Explanation Strip */}
                              <View style={[styles.statusNoteBox, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                                <Text style={[styles.statusNoteText, { color: meta.color }]}>
                                  {meta.description}
                                </Text>
                              </View>

                              {/* Active Security Pickup Code Ticket (when checked in) */}
                              {selectedEntry.attendanceStatus === 'present' && selectedEntry.pickupCode ? (
                                <View
                                  style={[
                                    styles.pickupCodeBox,
                                    {
                                      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
                                      borderColor: isDark ? 'rgba(251, 191, 36, 0.4)' : '#FCD34D',
                                    },
                                  ]}
                                >
                                  <View
                                    style={[
                                      styles.pickupKeyIconBox,
                                      { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7' },
                                    ]}
                                  >
                                    <KeyRound size={18} color={palette.accentAmber} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.pickupCodeEyebrow, { color: palette.accentAmber }]}>
                                      SECURITY PICKUP CODE
                                    </Text>
                                    <Text style={[styles.pickupCodeHint, { color: palette.textSecondary }]}>
                                      Show this code to the teacher at pickup
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.pickupCodeBadgeBox,
                                      { backgroundColor: isDark ? '#111827' : '#FFFFFF', borderColor: palette.accentAmber },
                                    ]}
                                  >
                                    <Text style={[styles.pickupCodeValue, { color: palette.textPrimary }]}>
                                      {selectedEntry.pickupCode}
                                    </Text>
                                  </View>
                                </View>
                              ) : null}

                              {/* 2 × 2 Check-In / Out / Classroom / Teacher Details Grid */}
                              <View style={styles.detailsGrid}>
                                <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                  <View style={styles.detailCellTop}>
                                    <View style={[styles.detailIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.14)' }]}>
                                      <Clock size={13} color="#10B981" />
                                    </View>
                                    <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                      Check-In
                                    </Text>
                                  </View>
                                  <Text style={[styles.detailCellValue, { color: palette.textPrimary }]}>
                                    {formatTimeOnly(selectedEntry.checkInTime)}
                                  </Text>
                                </View>

                                <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                  <View style={styles.detailCellTop}>
                                    <View style={[styles.detailIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.14)' }]}>
                                      <Clock size={13} color="#3B82F6" />
                                    </View>
                                    <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                      Check-Out
                                    </Text>
                                  </View>
                                  <Text style={[styles.detailCellValue, { color: palette.textPrimary }]}>
                                    {selectedEntry.checkOutTime
                                      ? formatTimeOnly(selectedEntry.checkOutTime)
                                      : selectedEntry.attendanceStatus === 'present'
                                      ? 'In class'
                                      : '—'}
                                  </Text>
                                </View>

                                <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                  <View style={styles.detailCellTop}>
                                    <View style={[styles.detailIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.14)' }]}>
                                      <MapPin size={13} color="#F59E0B" />
                                    </View>
                                    <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                      Classroom
                                    </Text>
                                  </View>
                                  <Text style={[styles.detailCellValue, { color: palette.textPrimary }]} numberOfLines={2}>
                                    {selectedEntry.classroomName}
                                  </Text>
                                </View>

                                <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                  <View style={styles.detailCellTop}>
                                    <View style={[styles.detailIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.14)' }]}>
                                      <UserCheck size={13} color="#8B5CF6" />
                                    </View>
                                    <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                      Teacher
                                    </Text>
                                  </View>
                                  <Text style={[styles.detailCellValue, { color: palette.textPrimary }]} numberOfLines={2}>
                                    {selectedEntry.teacherName}
                                  </Text>
                                </View>
                              </View>

                              {/* Guardian Handover Confirmation */}
                              {selectedEntry.checkedOutByName ? (
                                <View
                                  style={[
                                    styles.handoverBar,
                                    {
                                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                                      borderColor: isDark ? 'rgba(52, 211, 153, 0.3)' : '#BBF7D0',
                                    },
                                  ]}
                                >
                                  <ShieldCheck size={16} color="#10B981" />
                                  <Text style={[styles.handoverText, { color: palette.textPrimary }]}>
                                    Handed over to <Text style={{ fontWeight: '800' }}>{selectedEntry.checkedOutByName}</Text>
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })()}
                    </>
                  )}
                </>
              )}

              {/* ================================================== */}
              {/* ATTENDANCE TAB 2: PROGRAM-WISE ATTENDANCE HISTORY  */}
              {/* ================================================== */}
              {modalMode === 'attendance' && !loadingAttendance && section === 'history' && (() => {
                const decidedTotal = historySummary.attended + historySummary.absent;
                const attendancePct =
                  decidedTotal > 0 ? Math.round((historySummary.attended / decidedTotal) * 100) : 0;

                return (
                  <>
                    {/* Child-Specific Attendance Summary Card */}
                    <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                      <View style={styles.sectionHeaderSpread}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          {(activeChild.firstName || activeChild.fullName).toUpperCase()}’S SUMMARY
                        </Text>
                        {decidedTotal > 0 && (
                          <View
                            style={[
                              styles.rateBadge,
                              { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5' },
                            ]}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '800', color: palette.accentEmerald }}>
                              {attendancePct}% Attended
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={[styles.summaryStatsStrip, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                        <View style={styles.summaryStatCol}>
                          <Text style={[styles.historyStatVal, { color: palette.accentEmerald }]}>
                            {historySummary.attended}
                          </Text>
                          <Text style={[styles.historyStatLbl, { color: palette.textSecondary }]}>Present</Text>
                        </View>

                        <View style={[styles.statColDivider, { backgroundColor: palette.border }]} />

                        <View style={styles.summaryStatCol}>
                          <Text style={[styles.historyStatVal, { color: '#EF4444' }]}>
                            {historySummary.absent}
                          </Text>
                          <Text style={[styles.historyStatLbl, { color: palette.textSecondary }]}>Absent</Text>
                        </View>

                        <View style={[styles.statColDivider, { backgroundColor: palette.border }]} />

                        <View style={styles.summaryStatCol}>
                          <Text style={[styles.historyStatVal, { color: palette.textPrimary }]}>
                            {historySummary.total}
                          </Text>
                          <Text style={[styles.historyStatLbl, { color: palette.textSecondary }]}>Programs</Text>
                        </View>
                      </View>

                      {decidedTotal > 0 && (
                        <View style={[styles.rateTrack, { backgroundColor: palette.innerBg }]}>
                          <View
                            style={[
                              styles.rateFill,
                              { width: `${attendancePct}%`, backgroundColor: '#10B981' },
                            ]}
                          />
                        </View>
                      )}
                    </View>

                    {/* Program & Date Filters Card */}
                    <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border, gap: 10 }]}>
                      <View style={styles.filterDateHeader}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          FILTER HISTORY
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.dateFilterBtn,
                            {
                              backgroundColor: historyDateFilter
                                ? isDark
                                  ? 'rgba(124, 58, 237, 0.18)'
                                  : '#F5F3FF'
                                : palette.innerBg,
                              borderColor: historyDateFilter ? palette.accentPurple : palette.border,
                            },
                          ]}
                          onPress={() => setShowDatePicker(true)}
                          activeOpacity={0.82}
                        >
                          <Calendar size={13} color={palette.accentPurple} />
                          <Text style={[styles.dateFilterText, { color: palette.textPrimary }]}>
                            {historyDateFilter ? formatPrettyDate(historyDateFilter) : 'By Date'}
                          </Text>
                          {historyDateFilter ? (
                            <TouchableOpacity
                              onPress={() => setHistoryDateFilter(null)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <X size={13} color="#EF4444" />
                            </TouchableOpacity>
                          ) : null}
                        </TouchableOpacity>
                      </View>

                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {PROGRAM_FILTER_CHIPS.map(chip => {
                          const sel = historyProgramFilter === chip.id;
                          return (
                            <TouchableOpacity
                              key={chip.id}
                              style={[
                                styles.filterChip,
                                { backgroundColor: palette.innerBg, borderColor: palette.border },
                                sel && {
                                  backgroundColor: isDark ? '#FFFFFF' : '#111827',
                                  borderColor: isDark ? '#FFFFFF' : '#111827',
                                },
                              ]}
                              onPress={() => setHistoryProgramFilter(chip.id)}
                              activeOpacity={0.82}
                            >
                              <Text
                                style={[
                                  styles.filterChipText,
                                  { color: sel ? (isDark ? '#000000' : '#FFFFFF') : palette.textSecondary },
                                  sel && { fontWeight: '800' },
                                ]}
                              >
                                {chip.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>

                    {/* Program-Wise History List */}
                    {filteredHistory.length === 0 ? (
                      <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <View style={styles.emptyInner}>
                          <Calendar size={28} color={palette.textSecondary} />
                          <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
                            No Matching Records
                          </Text>
                          <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                            Try selecting "All Programs" or clearing the date filter.
                          </Text>
                        </View>
                      </View>
                    ) : (
                      filteredHistory.map(entry => {
                        const st = getStatusMeta(entry.attendanceStatus, isDark);
                        const pVisual = getKidsProgramVisual(entry.programType, isDark);
                        const isDeleting = deletingSessionId === entry.programSessionId;
                        return (
                          <View
                            key={entry.programSessionId}
                            style={[styles.historyRowCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}
                          >
                            <View style={[styles.historyStatusStripe, { backgroundColor: st.color }]} />

                            <View style={styles.historyRowContent}>
                              <View style={styles.historyRowTop}>
                                <View style={[styles.historyEmojiMini, { backgroundColor: pVisual.softBg }]}>
                                  <Text style={{ fontSize: 15 }}>{pVisual.emoji}</Text>
                                </View>

                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <Text style={[styles.historyRowTitle, { color: palette.textPrimary }]} numberOfLines={1}>
                                    {entry.programTitle}
                                  </Text>
                                  <Text style={[styles.historyRowDate, { color: palette.textSecondary }]} numberOfLines={1}>
                                    {formatPrettyDate(entry.date)} · {entry.classroomName}
                                  </Text>
                                </View>

                                <View style={[styles.smallStatusPill, { backgroundColor: st.bg, borderColor: st.border }]}>
                                  <Text style={[styles.smallStatusText, { color: st.color }]}>{st.label}</Text>
                                </View>
                              </View>

                              <View style={[styles.historyRowFooter, { borderTopColor: palette.border }]}>
                                <View style={{ flex: 1, gap: 4 }}>
                                  <View style={styles.historyFooterItem}>
                                    <UserCheck size={12} color={palette.textSecondary} />
                                    <Text style={[styles.historyFooterMeta, { color: palette.textSecondary }]} numberOfLines={1}>
                                      {entry.teacherName}
                                    </Text>
                                  </View>

                                  {entry.checkInTime ? (
                                    <View style={styles.historyFooterItem}>
                                      <Clock size={12} color={palette.accentEmerald} />
                                      <Text style={[styles.historyFooterMeta, { color: palette.textPrimary, fontWeight: '700' }]}>
                                        {formatTimeOnly(entry.checkInTime)}
                                        {entry.checkOutTime ? ` – ${formatTimeOnly(entry.checkOutTime)}` : ''}
                                      </Text>
                                    </View>
                                  ) : entry.attendanceStatus === 'absent' ? (
                                    <Text style={[styles.historyFooterMeta, { color: '#EF4444', fontWeight: '700' }]}>
                                      Finalized Absent
                                    </Text>
                                  ) : (
                                    <Text style={[styles.historyFooterMeta, { color: palette.accentAmber, fontWeight: '700' }]}>
                                      Pending Check-In
                                    </Text>
                                  )}
                                </View>

                                <TouchableOpacity
                                  style={[
                                    styles.historyDeletePill,
                                    {
                                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
                                      borderColor: isDark ? 'rgba(248, 113, 113, 0.35)' : '#FECACA',
                                    },
                                  ]}
                                  onPress={() => handleDeleteHistoryEntry(entry)}
                                  disabled={Boolean(deletingSessionId)}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  activeOpacity={0.8}
                                >
                                  {isDeleting ? (
                                    <ActivityIndicator size="small" color="#EF4444" />
                                  ) : (
                                    <>
                                      <Trash2 size={12} color="#EF4444" />
                                      <Text style={styles.historyDeletePillText}>Delete</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </>
                );
              })()}

              {/* ================================================== */}
              {/* CONSENT & SAFETY MODE                              */}
              {/* ================================================== */}
              {modalMode === 'consent' && (
                <>
                  {!isEditingConsent ? (
                    <>
                      {/* Hero Card: Consent Status & Release Permissions */}
                      <View
                        style={[
                          styles.accentCard,
                          { backgroundColor: palette.cardBg, borderColor: palette.border },
                        ]}
                      >
                        <View
                          style={[
                            styles.cardTopAccent,
                            { backgroundColor: consentInfo.isConfirmed ? '#10B981' : '#F59E0B' },
                          ]}
                        />

                        <View style={styles.accentCardBody}>
                          {/* Header Row */}
                          <View style={styles.consentHeaderRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                                RELEASE CONSENT STATUS
                              </Text>
                              <View style={styles.consentStatusTitleRow}>
                                {consentInfo.isConfirmed ? (
                                  <CheckCircle2 size={18} color={palette.accentEmerald} />
                                ) : (
                                  <ShieldAlert size={18} color={palette.accentAmber} />
                                )}
                                <Text style={[styles.consentStatusBigTitle, { color: palette.textPrimary }]}>
                                  {consentInfo.status === 'confirmed'
                                    ? 'Consent Approved'
                                    : consentInfo.status === 'pending_review'
                                    ? 'Pending Parent Review'
                                    : 'Consent Not Submitted'}
                                </Text>
                              </View>
                              <Text style={[styles.lastUpdatedText, { color: palette.textSecondary }]}>
                                Last updated {formatDateTimeDisplay(consentInfo.updatedAt)}
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={[styles.editConsentBtn, { backgroundColor: isDark ? '#FFFFFF' : '#111827' }]}
                              onPress={openEditConsentForm}
                              activeOpacity={0.85}
                            >
                              <Edit3 size={13} color={isDark ? '#000000' : '#FFFFFF'} />
                              <Text style={[styles.editConsentBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                                Edit
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* Release Permission Rows */}
                          <View style={{ gap: 10 }}>
                            {/* Permission 1: Leave Classroom Independently */}
                            <View
                              style={[
                                styles.permCardRow,
                                { backgroundColor: palette.innerBg, borderColor: palette.border },
                              ]}
                            >
                              <View
                                style={[
                                  styles.permIconCircle,
                                  {
                                    backgroundColor: consentInfo.canLeaveClassroomIndependently
                                      ? isDark
                                        ? 'rgba(16, 185, 129, 0.16)'
                                        : '#DCFCE7'
                                      : isDark
                                      ? 'rgba(59, 130, 246, 0.16)'
                                      : '#DBEAFE',
                                  },
                                ]}
                              >
                                <DoorOpen
                                  size={16}
                                  color={
                                    consentInfo.canLeaveClassroomIndependently ? palette.accentEmerald : '#3B82F6'
                                  }
                                />
                              </View>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <Text style={[styles.permLabel, { color: palette.textPrimary }]}>
                                  Leave Classroom Alone
                                </Text>
                                <Text style={[styles.permSubHint, { color: palette.textSecondary }]}>
                                  {consentInfo.canLeaveClassroomIndependently
                                    ? 'Allowed to exit room at dismissal'
                                    : 'Teacher waits for guardian at door'}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.permBadge,
                                  {
                                    backgroundColor: consentInfo.canLeaveClassroomIndependently
                                      ? isDark
                                        ? 'rgba(16, 185, 129, 0.16)'
                                        : '#DCFCE7'
                                      : isDark
                                      ? 'rgba(59, 130, 246, 0.14)'
                                      : '#EFF6FF',
                                    borderColor: consentInfo.canLeaveClassroomIndependently
                                      ? '#86EFAC'
                                      : '#BFDBFE',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.permBadgeText,
                                    {
                                      color: consentInfo.canLeaveClassroomIndependently
                                        ? palette.accentEmerald
                                        : isDark
                                        ? '#60A5FA'
                                        : '#1D4ED8',
                                    },
                                  ]}
                                >
                                  {consentInfo.canLeaveClassroomIndependently ? 'Allowed' : 'Escort'}
                                </Text>
                              </View>
                            </View>

                            {/* Permission 2: Leave Church Premises Independently */}
                            <View
                              style={[
                                styles.permCardRow,
                                { backgroundColor: palette.innerBg, borderColor: palette.border },
                              ]}
                            >
                              <View
                                style={[
                                  styles.permIconCircle,
                                  {
                                    backgroundColor: consentInfo.canLeavePremisesIndependently
                                      ? isDark
                                        ? 'rgba(245, 158, 11, 0.16)'
                                        : '#FEF3C7'
                                      : isDark
                                      ? 'rgba(16, 185, 129, 0.16)'
                                      : '#DCFCE7',
                                  },
                                ]}
                              >
                                <LogOut
                                  size={16}
                                  color={
                                    consentInfo.canLeavePremisesIndependently
                                      ? palette.accentAmber
                                      : palette.accentEmerald
                                  }
                                />
                              </View>
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <Text style={[styles.permLabel, { color: palette.textPrimary }]}>
                                  Leave Church Premises Alone
                                </Text>
                                <Text style={[styles.permSubHint, { color: palette.textSecondary }]}>
                                  {consentInfo.canLeavePremisesIndependently
                                    ? 'Allowed to exit premises alone'
                                    : 'Released only to authorized pickups'}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.permBadge,
                                  {
                                    backgroundColor: consentInfo.canLeavePremisesIndependently
                                      ? isDark
                                        ? 'rgba(245, 158, 11, 0.16)'
                                        : '#FEF3C7'
                                      : isDark
                                      ? 'rgba(16, 185, 129, 0.16)'
                                      : '#DCFCE7',
                                    borderColor: consentInfo.canLeavePremisesIndependently
                                      ? '#FCD34D'
                                      : '#86EFAC',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.permBadgeText,
                                    {
                                      color: consentInfo.canLeavePremisesIndependently
                                        ? palette.accentAmber
                                        : palette.accentEmerald,
                                    },
                                  ]}
                                >
                                  {consentInfo.canLeavePremisesIndependently ? 'Allowed' : 'Protected'}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Integrated Safeguarding Assurance */}
                          <View
                            style={[
                              styles.safeguardFooter,
                              {
                                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#F8FAFC',
                                borderColor: isDark ? 'rgba(96, 165, 250, 0.25)' : '#E2E8F0',
                              },
                            ]}
                          >
                            <Lock size={14} color={isDark ? '#60A5FA' : '#2563EB'} />
                            <Text style={[styles.safeguardFooterText, { color: palette.textSecondary }]}>
                              Faculty strictly enforce these rules for {activeChild.firstName}. Missing or unclear consent defaults to guarded pickup only.
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Additional Teacher Instructions Card */}
                      <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <View style={styles.sectionHeaderSpread}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                            <FileText size={14} color={palette.accentPurple} />
                            <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                              INSTRUCTIONS FOR TEACHERS
                            </Text>
                          </View>
                          <TouchableOpacity onPress={openEditConsentForm} activeOpacity={0.8}>
                            <Text style={{ color: palette.accentPurple, fontSize: 12, fontWeight: '800' }}>
                              Edit ›
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View style={[styles.instructionsBox, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                          <Text style={[styles.instructionsValue, { color: palette.textPrimary }]}>
                            {consentInfo.teacherInstructions || 'No special dismissal instructions added yet.'}
                          </Text>
                        </View>
                      </View>

                      {/* Authorized Pickup Guardians Card */}
                      <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <View style={styles.sectionHeaderSpread}>
                          <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                            AUTHORIZED PICKUP GUARDIANS ({consentInfo.authorizedPickups.length})
                          </Text>
                          <TouchableOpacity onPress={openEditConsentForm} activeOpacity={0.8}>
                            <Text style={{ color: palette.accentPurple, fontSize: 12, fontWeight: '800' }}>
                              Manage ›
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {consentInfo.authorizedPickups.length === 0 ? (
                          <View style={[styles.guardianItemCard, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                            <View style={[styles.guardianAvatarCircle, { backgroundColor: isDark ? '#231B3C' : '#EDE9FE' }]}>
                              <Text style={[styles.guardianAvatarText, { color: palette.accentPurple }]}>
                                {(activeChild.parentName || 'P').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.guardianName, { color: palette.textPrimary }]}>
                                {activeChild.parentName || 'Primary Parent'}
                              </Text>
                              <View style={styles.guardianPhoneRow}>
                                <Phone size={12} color={palette.textSecondary} />
                                <Text style={[styles.guardianPhone, { color: palette.textSecondary }]}>
                                  {activeChild.parentPhone || 'Phone not added'}
                                </Text>
                              </View>
                            </View>
                            <ShieldCheck size={17} color="#10B981" />
                          </View>
                        ) : (
                          <View style={{ gap: 8 }}>
                            {consentInfo.authorizedPickups.map((g, idx) => (
                              <View
                                key={g.id || idx}
                                style={[styles.guardianItemCard, { backgroundColor: palette.innerBg, borderColor: palette.border }]}
                              >
                                <View style={[styles.guardianAvatarCircle, { backgroundColor: isDark ? '#231B3C' : '#EDE9FE' }]}>
                                  <Text style={[styles.guardianAvatarText, { color: palette.accentPurple }]}>
                                    {(g.name || 'G').charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Text style={[styles.guardianName, { color: palette.textPrimary }]}>{g.name}</Text>
                                    <View style={[styles.relChip, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                                      <Text style={[styles.relChipText, { color: palette.textSecondary }]}>
                                        {g.relationship}
                                      </Text>
                                    </View>
                                  </View>
                                  <View style={styles.guardianPhoneRow}>
                                    <Phone size={12} color={palette.textSecondary} />
                                    <Text style={[styles.guardianPhone, { color: palette.textSecondary }]}>
                                      {g.phone || 'Phone not added'}
                                    </Text>
                                  </View>
                                </View>
                                <View
                                  style={[
                                    styles.verifiedTickCircle,
                                    { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#DCFCE7' },
                                  ]}
                                >
                                  <Check size={13} color="#10B981" strokeWidth={3} />
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Emergency Contact Card */}
                      <View
                        style={[
                          styles.surfaceCard,
                          {
                            backgroundColor: palette.cardBg,
                            borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
                          },
                        ]}
                      >
                        <View style={styles.sectionHeaderSpread}>
                          <Text style={[styles.eyebrowLabel, { color: '#EF4444' }]}>
                            EMERGENCY CONTACT
                          </Text>
                          <TouchableOpacity onPress={openEditConsentForm} activeOpacity={0.8}>
                            <Text style={{ color: palette.accentPurple, fontSize: 12, fontWeight: '800' }}>
                              Update ›
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View
                          style={[
                            styles.guardianItemCard,
                            {
                              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.09)' : '#FEF2F2',
                              borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FEE2E2',
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.guardianAvatarCircle,
                              { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' },
                            ]}
                          >
                            <Phone size={15} color="#EF4444" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.guardianName, { color: palette.textPrimary }]}>
                              {activeChild.medical?.emergencyContact?.name || activeChild.parentName || 'Parent'}
                            </Text>
                            <Text style={[styles.guardianPhone, { color: palette.textSecondary }]}>
                              {activeChild.medical?.emergencyContact?.relationship || 'Parent'} ·{' '}
                              {activeChild.medical?.emergencyContact?.phone || activeChild.parentPhone || 'Not added'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </>
                  ) : (
                    /* ================================================== */
                    /* STRUCTURED MULTI-CARD CONSENT EDITOR               */
                    /* ================================================== */
                    <>
                      {/* Editor Header Card */}
                      <View style={[styles.editorBannerCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.formSectionTitle, { color: palette.textPrimary }]}>
                            Update Consent & Safety
                          </Text>
                          <Text style={[styles.editorSubHint, { color: palette.textSecondary }]}>
                            Editing permissions & pickup list for {activeChild.firstName}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.cancelPillBtn, { backgroundColor: palette.innerBg, borderColor: palette.border }]}
                          onPress={() => setIsEditingConsent(false)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: palette.textSecondary, fontWeight: '700', fontSize: 12 }}>
                            Cancel
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Card 1: Release Permission Switches */}
                      <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          1. RELEASE PERMISSIONS
                        </Text>

                        <View style={[styles.switchRowCard, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={[styles.switchTitle, { color: palette.textPrimary }]}>
                              Allow leaving classroom independently
                            </Text>
                            <Text style={[styles.switchDesc, { color: palette.textSecondary }]}>
                              Keep OFF if a teacher must wait for an authorized pickup person inside the room.
                            </Text>
                          </View>
                          <Switch
                            value={canLeaveClass}
                            onValueChange={setCanLeaveClass}
                            trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                            thumbColor="#FFFFFF"
                          />
                        </View>

                        <View style={[styles.switchRowCard, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={[styles.switchTitle, { color: palette.textPrimary }]}>
                              Allow leaving church premises independently
                            </Text>
                            <Text style={[styles.switchDesc, { color: palette.textSecondary }]}>
                              Recommended OFF for child safety. Child will only be handed over to approved guardians.
                            </Text>
                          </View>
                          <Switch
                            value={canLeavePremises}
                            onValueChange={setCanLeavePremises}
                            trackColor={{ false: '#CBD5E1', true: '#F59E0B' }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                      </View>

                      {/* Card 2: Authorized Pickup Guardians Editor */}
                      <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <View style={styles.sectionHeaderSpread}>
                          <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                            2. AUTHORIZED PICKUP PERSONS ({editGuardians.length})
                          </Text>
                          <TouchableOpacity
                            style={[styles.inlineAddChipBtn, { backgroundColor: isDark ? '#231B3C' : '#F5F3FF' }]}
                            onPress={() => setShowAddGuardianForm(prev => !prev)}
                            activeOpacity={0.8}
                          >
                            <Plus size={13} color={palette.accentPurple} strokeWidth={2.5} />
                            <Text style={{ color: palette.accentPurple, fontSize: 12, fontWeight: '800' }}>
                              {showAddGuardianForm ? 'Close' : 'Add Person'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {showAddGuardianForm && (
                          <View style={[styles.addGuardianBox, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                            <TextInput
                              style={[styles.input, { backgroundColor: palette.cardBg, color: palette.textPrimary, borderColor: palette.border }]}
                              placeholder="Authorized Person Full Name"
                              placeholderTextColor={palette.textSecondary}
                              value={newGName}
                              onChangeText={setNewGName}
                            />
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                              {GUARDIAN_RELATIONS.map(rel => {
                                const act = newGRelation === rel;
                                return (
                                  <TouchableOpacity
                                    key={rel}
                                    style={[
                                      styles.filterChip,
                                      { backgroundColor: palette.cardBg, borderColor: palette.border },
                                      act && { backgroundColor: palette.accentPurple, borderColor: palette.accentPurple },
                                    ]}
                                    onPress={() => setNewGRelation(rel)}
                                  >
                                    <Text style={{ fontSize: 11.5, color: act ? '#FFFFFF' : palette.textSecondary, fontWeight: '700' }}>
                                      {rel}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                            <TextInput
                              style={[styles.input, { backgroundColor: palette.cardBg, color: palette.textPrimary, borderColor: palette.border }]}
                              placeholder="Mobile Number (e.g. +91 98765 43210)"
                              placeholderTextColor={palette.textSecondary}
                              keyboardType="phone-pad"
                              value={newGPhone}
                              onChangeText={setNewGPhone}
                            />
                            <TouchableOpacity
                              style={[styles.miniAddBtn, { backgroundColor: palette.accentPurple }]}
                              onPress={handleAddGuardianToDraft}
                              activeOpacity={0.85}
                            >
                              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>
                                Add Pickup Person
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <View style={{ gap: 8 }}>
                          {editGuardians.map((g, idx) => (
                            <View
                              key={g.id || idx}
                              style={[styles.guardianItemCard, { backgroundColor: palette.innerBg, borderColor: palette.border }]}
                            >
                              <View style={[styles.guardianAvatarCircle, { backgroundColor: isDark ? '#231B3C' : '#EDE9FE' }]}>
                                <Text style={[styles.guardianAvatarText, { color: palette.accentPurple }]}>
                                  {(g.name || 'G').charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.guardianName, { color: palette.textPrimary }]}>
                                  {g.name} ({g.relationship})
                                </Text>
                                <Text style={[styles.guardianPhone, { color: palette.textSecondary }]}>
                                  {g.phone || 'No mobile number'}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={[
                                  styles.trashIconBtn,
                                  { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2' },
                                ]}
                                onPress={() => handleRemoveGuardianFromDraft(idx)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Trash2 size={14} color="#EF4444" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      </View>

                      {/* Card 3: Emergency Contact Editor */}
                      <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          3. EMERGENCY CONTACT
                        </Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: palette.innerBg, color: palette.textPrimary, borderColor: palette.border }]}
                          placeholder="Emergency Contact Name"
                          placeholderTextColor={palette.textSecondary}
                          value={emergName}
                          onChangeText={setEmergName}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            style={[styles.input, { flex: 0.9, backgroundColor: palette.innerBg, color: palette.textPrimary, borderColor: palette.border }]}
                            placeholder="Relationship"
                            placeholderTextColor={palette.textSecondary}
                            value={emergRelation}
                            onChangeText={setEmergRelation}
                          />
                          <TextInput
                            style={[styles.input, { flex: 1.1, backgroundColor: palette.innerBg, color: palette.textPrimary, borderColor: palette.border }]}
                            placeholder="Mobile Number"
                            placeholderTextColor={palette.textSecondary}
                            keyboardType="phone-pad"
                            value={emergPhone}
                            onChangeText={setEmergPhone}
                          />
                        </View>
                      </View>

                      {/* Card 4: Additional Teacher Instructions */}
                      <View style={[styles.surfaceCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          4. ADDITIONAL INSTRUCTIONS FOR TEACHERS
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: palette.innerBg,
                              color: palette.textPrimary,
                              borderColor: palette.border,
                              minHeight: 84,
                              textAlignVertical: 'top',
                            },
                          ]}
                          placeholder="e.g. Only Grandmother (Mary) will pick up after VBS today..."
                          placeholderTextColor={palette.textSecondary}
                          multiline
                          value={teacherInstructions}
                          onChangeText={setTeacherInstructions}
                        />
                      </View>

                      {/* Save Action Bar */}
                      <View style={styles.editorBottomActions}>
                        <TouchableOpacity
                          style={[
                            styles.cancelBottomBtn,
                            { backgroundColor: palette.cardBg, borderColor: palette.border },
                          ]}
                          onPress={() => setIsEditingConsent(false)}
                          disabled={savingConsent}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: palette.textPrimary, fontSize: 13.5, fontWeight: '700' }}>
                            Cancel
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.saveConsentBtn,
                            { backgroundColor: '#10B981', opacity: savingConsent ? 0.7 : 1, flex: 1.8 },
                          ]}
                          onPress={handleSaveConsentAndSafety}
                          disabled={savingConsent}
                          activeOpacity={0.85}
                        >
                          {savingConsent ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <CheckCircle2 size={17} color="#FFFFFF" />
                              <Text style={styles.saveConsentBtnText}>
                                Save & Confirm
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {/* Native Date Picker for History Filter */}
          <DateTimePickerModal
            isVisible={showDatePicker}
            mode="date"
            date={historyDateFilter ? new Date(`${historyDateFilter}T12:00:00`) : new Date()}
            onConfirm={(selectedDate: Date) => {
              setShowDatePicker(false);
              setHistoryDateFilter(toStandardDateString(selectedDate));
            }}
            onCancel={() => setShowDatePicker(false)}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerSub: { fontSize: 12, marginTop: 2, fontWeight: '500', lineHeight: 16 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  segmentedOuter: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  segmentedTrack: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    gap: 6,
  },
  segmentedBtn: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedBtnText: { fontSize: 12.5, fontWeight: '700' },
  tabCountBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  scrollBody: { padding: 16, paddingBottom: 38, gap: 14 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyInner: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  childProfileCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  childProfileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedChildAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedChildEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  selectedChildName: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
  },
  selectedChildMeta: {
    fontSize: 11.5,
    marginTop: 1.5,
    fontWeight: '500',
  },
  statusChipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  dotMini: { width: 6, height: 6, borderRadius: 3 },
  statusChipCompactText: { fontSize: 11, fontWeight: '800' },
  childSwitcherEmbedded: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 7,
  },
  switchChildLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  childPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  childDot: { width: 7, height: 7, borderRadius: 4 },
  childPillText: { fontSize: 12, fontWeight: '600', maxWidth: 170 },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionCountHint: { fontSize: 11, fontWeight: '600' },
  eyebrowLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  programPickChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    width: 150,
    gap: 4,
  },
  programPickTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotSmall: { width: 7, height: 7, borderRadius: 4 },
  programPickTitle: { fontSize: 12.5, fontWeight: '700' },
  programPickDate: { fontSize: 10.5, fontWeight: '600' },
  surfaceCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  accentCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTopAccent: { height: 4, width: '100%' },
  accentCardBody: { padding: 16, gap: 13 },
  overviewTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  programEmojiSquare: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programCategoryEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dateRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  overviewDateLine: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusPillBig: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusPillBigText: { fontSize: 11, fontWeight: '800' },
  statusNoteBox: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusNoteText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  pickupCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  pickupKeyIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupCodeEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  pickupCodeHint: { fontSize: 11, marginTop: 1 },
  pickupCodeBadgeBox: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  pickupCodeValue: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  detailCell: {
    width: '48.4%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 11,
    gap: 6,
  },
  detailCellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  detailIconBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCellLabel: { fontSize: 11, fontWeight: '600' },
  detailCellValue: { fontSize: 13.5, fontWeight: '800' },
  handoverBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  handoverText: { fontSize: 12.5, flex: 1 },
  rateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  summaryStatsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
  },
  summaryStatCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statColDivider: { width: 1, height: 28 },
  historyStatVal: { fontSize: 20, fontWeight: '900' },
  historyStatLbl: { fontSize: 11, fontWeight: '600' },
  rateTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  rateFill: {
    height: '100%',
    borderRadius: 999,
  },
  filterDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  dateFilterText: { fontSize: 11.5, fontWeight: '700' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 11.5, fontWeight: '600' },
  historyRowCard: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  historyStatusStripe: { width: 4 },
  historyRowContent: { flex: 1, padding: 13, gap: 10 },
  historyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyEmojiMini: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyRowTitle: { fontSize: 14.5, fontWeight: '800' },
  historyRowDate: { fontSize: 11.5, marginTop: 1.5, fontWeight: '500' },
  smallStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  smallStatusText: { fontSize: 10.5, fontWeight: '800' },
  historyRowFooter: {
    borderTopWidth: 1,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  historyFooterMeta: { fontSize: 11.5 },
  historyDeletePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  historyDeletePillText: {
    color: '#EF4444',
    fontSize: 11.5,
    fontWeight: '700',
  },
  consentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  consentStatusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  consentStatusBigTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  lastUpdatedText: { fontSize: 11.5, marginTop: 3, fontWeight: '500' },
  editConsentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 999,
  },
  editConsentBtnText: { fontSize: 12, fontWeight: '800' },
  permCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  permIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permLabel: { fontSize: 13.5, fontWeight: '800' },
  permSubHint: { fontSize: 11.5, marginTop: 1.5 },
  permBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  permBadgeText: { fontSize: 11, fontWeight: '800' },
  safeguardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  safeguardFooterText: { fontSize: 11.5, lineHeight: 16, flex: 1 },
  instructionsBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  instructionsValue: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  sectionHeaderSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guardianItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  guardianAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardianAvatarText: { fontSize: 14, fontWeight: '800' },
  guardianName: { fontSize: 13.5, fontWeight: '800' },
  guardianPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2.5,
  },
  guardianPhone: { fontSize: 12, fontWeight: '500' },
  verifiedTickCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  relChipText: { fontSize: 10, fontWeight: '700' },
  editorBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
  },
  formSectionTitle: { fontSize: 16.5, fontWeight: '800' },
  editorSubHint: { fontSize: 12, marginTop: 2 },
  cancelPillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  switchRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  switchTitle: { fontSize: 13.5, fontWeight: '700' },
  switchDesc: { fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  inlineAddChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  trashIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGuardianBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
  },
  miniAddBtn: {
    paddingVertical: 10.5,
    borderRadius: 10,
    alignItems: 'center',
  },
  editorBottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancelBottomBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveConsentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
  },
  saveConsentBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
