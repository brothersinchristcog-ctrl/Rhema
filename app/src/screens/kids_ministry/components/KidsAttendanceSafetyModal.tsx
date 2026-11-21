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
  KIDS_PROGRAM_LABELS,
  resolveChildConsentInfo,
  buildChildProgramAttendanceEntries,
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

  // History Filters
  const [historyProgramFilter, setHistoryProgramFilter] = useState<'all' | KidsProgramType>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

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

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.headerTitle, { color: palette.textPrimary }]} numberOfLines={1}>
                {modalMode === 'consent' ? 'Consent & Safety' : 'Attendance'}
              </Text>
              <Text style={[styles.headerSub, { color: palette.textSecondary }]} numberOfLines={1}>
                {modalMode === 'consent'
                  ? 'Release Permissions & Pickup Guardians'
                  : 'Program-Wise Check-In, Out & History'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: palette.innerBg, borderColor: palette.border }]}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={19} color={palette.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Child Switcher Pills if family has >1 child */}
          {childrenList.length > 1 && (
            <View style={[styles.childSwitcherStrip, { borderBottomColor: palette.border }]}>
              <Text style={[styles.eyebrowLabel, { color: palette.textSecondary, marginBottom: 6 }]}>
                SELECT CHILD ({childrenList.length})
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {childrenList.map((child, idx) => {
                  const selected = idx === safeIdx;
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childPill,
                        { backgroundColor: palette.innerBg, borderColor: palette.border },
                        selected && {
                          backgroundColor: isDark ? '#231B3C' : '#EFE9FE',
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
                    >
                      <View
                        style={[
                          styles.childDot,
                          {
                            backgroundColor:
                              child.custodyStatus === 'checked_in' ? '#10B981' : '#94A3B8',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.childPillText,
                          { color: selected ? (isDark ? '#DDD6FE' : '#6D28D9') : palette.textSecondary },
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

          {/* Attendance Mode Navigation Tabs (Overview | History) - hidden in Consent & Safety mode */}
          {modalMode === 'attendance' && (
            <View style={[styles.sectionTabsRow, { borderBottomColor: palette.border }]}>
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'history', label: `History (${programEntries.length})` },
                ] as const
              ).map(tab => {
                const active = section === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.sectionTabBtn,
                      { backgroundColor: palette.innerBg, borderColor: palette.border },
                      active && {
                        backgroundColor: isDark ? '#FFFFFF' : '#111827',
                        borderColor: isDark ? '#FFFFFF' : '#111827',
                      },
                    ]}
                    onPress={() => setSection(tab.id)}
                  >
                    <Text
                      style={[
                        styles.sectionTabText,
                        { color: active ? (isDark ? '#000000' : '#FFFFFF') : palette.textSecondary },
                        active && { fontWeight: '800' },
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!activeChild ? (
            <View style={styles.emptyWrap}>
              <Users size={36} color={palette.textSecondary} />
              <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>No Child Profile Linked</Text>
              <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                Please add your child in Rhema Kids to view attendance and safety details.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
              {/* Always show Selected Child Identity Card so parent unmistakably sees whose data is displayed */}
              <View
                style={[
                  styles.selectedChildBanner,
                  {
                    backgroundColor: isDark ? '#161B2E' : '#F8FAFC',
                    borderColor: isDark ? '#2E3754' : '#E2E8F0',
                  },
                ]}
              >
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
                    <Text style={{ fontSize: 16, fontWeight: '800', color: palette.accentPurple }}>
                      {(activeChild.firstName || activeChild.fullName || 'K').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectedChildEyebrow, { color: palette.accentPurple }]}>
                    {modalMode === 'consent' ? 'CONSENT & SAFETY FOR' : 'VIEWING ATTENDANCE FOR'}
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
                      styles.smallStatusPill,
                      {
                        backgroundColor: consentInfo.isConfirmed
                          ? isDark
                            ? 'rgba(16, 185, 129, 0.16)'
                            : '#DCFCE7'
                          : isDark
                          ? 'rgba(245, 158, 11, 0.16)'
                          : '#FEF3C7',
                        borderColor: consentInfo.isConfirmed ? '#86EFAC' : '#FCD34D',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
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
                        styles.smallStatusText,
                        { color: consentInfo.isConfirmed ? palette.accentEmerald : palette.accentAmber },
                      ]}
                    >
                      {consentInfo.isConfirmed ? 'Approved' : 'Pending'}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.smallStatusPill,
                      {
                        backgroundColor:
                          activeChild.custodyStatus === 'checked_in'
                            ? isDark
                              ? 'rgba(16, 185, 129, 0.16)'
                              : '#DCFCE7'
                            : palette.cardBg,
                        borderColor:
                          activeChild.custodyStatus === 'checked_in' ? '#86EFAC' : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.smallStatusText,
                        {
                          color:
                            activeChild.custodyStatus === 'checked_in'
                              ? palette.accentEmerald
                              : palette.textSecondary,
                        },
                      ]}
                    >
                      {activeChild.custodyStatus === 'checked_in' ? 'Checked In' : 'Enrolled'}
                    </Text>
                  </View>
                )}
              </View>

              {/* ================================================== */}
              {/* ATTENDANCE MODE: OVERVIEW & HISTORY                */}
              {/* ================================================== */}
              {modalMode === 'attendance' && loadingAttendance ? (
                <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                  <View style={styles.emptyInner}>
                    <ActivityIndicator size="small" color={palette.accentPurple} />
                    <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                      Loading attendance records for {activeChild.fullName}...
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* TAB 1: ATTENDANCE OVERVIEW */}
              {modalMode === 'attendance' && !loadingAttendance && section === 'overview' && (
                <>
                  {programEntries.length === 0 ? (
                    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                      <View style={styles.emptyInner}>
                        <Calendar size={32} color={palette.accentAmber} />
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
                      {/* Horizontal Program Picker */}
                      <View>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          SELECT PROGRAM TO VIEW STATUS
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8, paddingTop: 6 }}
                        >
                          {programEntries.map(entry => {
                            const selected = selectedEntry?.programSessionId === entry.programSessionId;
                            const st = getStatusMeta(entry.attendanceStatus, isDark);
                            return (
                              <TouchableOpacity
                                key={entry.programSessionId}
                                style={[
                                  styles.programPickChip,
                                  { backgroundColor: palette.cardBg, borderColor: palette.border },
                                  selected && {
                                    borderColor: palette.accentPurple,
                                    borderWidth: 1.6,
                                    backgroundColor: isDark ? 'rgba(124, 58, 237, 0.14)' : '#F5F3FF',
                                  },
                                ]}
                                onPress={() => setSelectedProgramSessionId(entry.programSessionId)}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                  <View style={[styles.dotSmall, { backgroundColor: st.color }]} />
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
                                </View>
                                <Text style={[styles.programPickDate, { color: palette.textSecondary }]}>
                                  {formatPrettyDate(entry.date)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>

                      {/* Selected Program Attendance Card */}
                      {selectedEntry && (() => {
                        const meta = getStatusMeta(selectedEntry.attendanceStatus, isDark);
                        return (
                          <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                            <View style={styles.overviewTopRow}>
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text style={[styles.programCategoryEyebrow, { color: palette.accentPurple }]}>
                                  {(KIDS_PROGRAM_LABELS[selectedEntry.programType] || 'KIDS PROGRAM').toUpperCase()}
                                </Text>
                                <Text style={[styles.overviewTitle, { color: palette.textPrimary }]}>
                                  {selectedEntry.programTitle}
                                </Text>
                                <Text style={[styles.overviewDateLine, { color: palette.textSecondary }]}>
                                  📅 {formatPrettyDate(selectedEntry.date)} ({formatDateDisplay(selectedEntry.date)})
                                  {selectedEntry.startTime ? ` · ${selectedEntry.startTime}` : ''}
                                </Text>
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

                            <View style={[styles.statusNoteBox, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                              <Text style={[styles.statusNoteText, { color: meta.color }]}>
                                {meta.description}
                              </Text>
                            </View>

                            {/* Active Security Pickup Code Banner (when currently in class) */}
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
                                <KeyRound size={18} color={palette.accentAmber} />
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.pickupCodeEyebrow, { color: palette.accentAmber }]}>
                                    ACTIVE SECURITY PICKUP CODE
                                  </Text>
                                  <Text style={[styles.pickupCodeHint, { color: palette.textSecondary }]}>
                                    Share this code with teacher at dismissal
                                  </Text>
                                </View>
                                <Text style={[styles.pickupCodeValue, { color: palette.textPrimary }]}>
                                  {selectedEntry.pickupCode}
                                </Text>
                              </View>
                            ) : null}

                            {/* 4-Cell Attendance Details Grid */}
                            <View style={styles.detailsGrid}>
                              <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                <View style={styles.detailCellHeader}>
                                  <Clock size={13} color="#10B981" />
                                  <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                    Check-In Time
                                  </Text>
                                </View>
                                <Text style={[styles.detailCellValue, { color: palette.textPrimary }]}>
                                  {formatTimeOnly(selectedEntry.checkInTime)}
                                </Text>
                              </View>

                              <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                <View style={styles.detailCellHeader}>
                                  <Clock size={13} color="#3B82F6" />
                                  <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                    Check-Out Time
                                  </Text>
                                </View>
                                <Text style={[styles.detailCellValue, { color: palette.textPrimary }]}>
                                  {selectedEntry.checkOutTime
                                    ? formatTimeOnly(selectedEntry.checkOutTime)
                                    : selectedEntry.attendanceStatus === 'present'
                                    ? 'Still in class'
                                    : '—'}
                                </Text>
                              </View>

                              <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                <View style={styles.detailCellHeader}>
                                  <MapPin size={13} color="#F59E0B" />
                                  <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                    Classroom
                                  </Text>
                                </View>
                                <Text style={[styles.detailCellValue, { color: palette.textPrimary }]} numberOfLines={2}>
                                  {selectedEntry.classroomName}
                                </Text>
                              </View>

                              <View style={[styles.detailCell, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                <View style={styles.detailCellHeader}>
                                  <UserCheck size={13} color="#8B5CF6" />
                                  <Text style={[styles.detailCellLabel, { color: palette.textSecondary }]}>
                                    Teacher / Faculty
                                  </Text>
                                </View>
                                <Text style={[styles.detailCellValue, { color: palette.textPrimary }]} numberOfLines={2}>
                                  {selectedEntry.teacherName}
                                </Text>
                              </View>
                            </View>

                            {selectedEntry.checkedOutByName ? (
                              <View style={[styles.handoverBar, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                                <ShieldCheck size={15} color="#10B981" />
                                <Text style={[styles.handoverText, { color: palette.textPrimary }]}>
                                  Safely handed over to: <Text style={{ fontWeight: '800' }}>{selectedEntry.checkedOutByName}</Text>
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      })()}
                    </>
                  )}
                </>
              )}

              {/* ================================================== */}
              {/* TAB 2: PROGRAM-WISE ATTENDANCE HISTORY             */}
              {/* ================================================== */}
              {modalMode === 'attendance' && !loadingAttendance && section === 'history' && (
                <>
                  {/* Child-Specific Attendance Statistics */}
                  <View style={{ gap: 6 }}>
                    <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                      {(activeChild.firstName || activeChild.fullName).toUpperCase()}’S ATTENDANCE STATS
                    </Text>
                    <View style={styles.historyStatsRow}>
                      <View style={[styles.historyStatCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <Text style={[styles.historyStatVal, { color: palette.accentEmerald }]}>
                          {historySummary.attended}
                        </Text>
                        <Text style={[styles.historyStatLbl, { color: palette.textSecondary }]}>Present</Text>
                      </View>
                      <View style={[styles.historyStatCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <Text style={[styles.historyStatVal, { color: '#EF4444' }]}>
                          {historySummary.absent}
                        </Text>
                        <Text style={[styles.historyStatLbl, { color: palette.textSecondary }]}>Absent</Text>
                      </View>
                      <View style={[styles.historyStatCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <Text style={[styles.historyStatVal, { color: palette.textPrimary }]}>
                          {historySummary.total}
                        </Text>
                        <Text style={[styles.historyStatLbl, { color: palette.textSecondary }]}>Total Programs</Text>
                      </View>
                    </View>
                  </View>

                  {/* Program & Date Filters */}
                  <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border, gap: 10 }]}>
                    <View style={styles.filterDateHeader}>
                      <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                        FILTER BY PROGRAM OR DATE
                      </Text>
                      <TouchableOpacity
                        style={[styles.dateFilterBtn, { backgroundColor: palette.innerBg, borderColor: palette.border }]}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Calendar size={13} color={palette.accentPurple} />
                        <Text style={[styles.dateFilterText, { color: palette.textPrimary }]}>
                          {historyDateFilter ? formatPrettyDate(historyDateFilter) : 'Pick Date'}
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
                                backgroundColor: palette.accentPurple,
                                borderColor: palette.accentPurple,
                              },
                            ]}
                            onPress={() => setHistoryProgramFilter(chip.id)}
                          >
                            <Text
                              style={[
                                styles.filterChipText,
                                { color: sel ? '#FFFFFF' : palette.textSecondary },
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
                    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                      <View style={styles.emptyInner}>
                        <Calendar size={30} color={palette.textSecondary} />
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
                      const shortStatus =
                        entry.attendanceStatus === 'checked_out'
                          ? 'Present'
                          : st.label;
                      return (
                        <View
                          key={entry.programSessionId}
                          style={[styles.historyRowCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}
                        >
                          <View style={styles.historyRowTop}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={[styles.historyRowTitle, { color: palette.textPrimary }]}>
                                {entry.programTitle} – {shortStatus}
                              </Text>
                              <Text style={[styles.historyRowDate, { color: palette.textSecondary }]}>
                                {formatPrettyDate(entry.date)} · {entry.classroomName}
                              </Text>
                            </View>
                            <View style={[styles.smallStatusPill, { backgroundColor: st.bg, borderColor: st.border }]}>
                              <Text style={[styles.smallStatusText, { color: st.color }]}>{st.label}</Text>
                            </View>
                          </View>

                          <View style={[styles.historyRowFooter, { borderTopColor: palette.border }]}>
                            <Text style={[styles.historyFooterMeta, { color: palette.textSecondary }]}>
                              Faculty: <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>{entry.teacherName}</Text>
                            </Text>
                            {entry.checkInTime ? (
                              <Text style={[styles.historyFooterMeta, { color: palette.textSecondary }]}>
                                In: <Text style={{ color: palette.textPrimary, fontWeight: '700' }}>{formatTimeOnly(entry.checkInTime)}</Text>
                                {entry.checkOutTime
                                  ? `  ·  Out: ${formatTimeOnly(entry.checkOutTime)}`
                                  : ''}
                              </Text>
                            ) : entry.attendanceStatus === 'absent' ? (
                              <Text style={[styles.historyFooterMeta, { color: '#EF4444' }]}>
                                Attendance finalized
                              </Text>
                            ) : (
                              <Text style={[styles.historyFooterMeta, { color: palette.textSecondary }]}>
                                Pending check-in
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              )}

              {/* ================================================== */}
              {/* CONSENT & SAFETY MODE                              */}
              {/* ================================================== */}
              {modalMode === 'consent' && (
                <>
                  {/* Child Safety Rule Banner */}
                  <View
                    style={[
                      styles.safetyPolicyBanner,
                      {
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : '#EFF6FF',
                        borderColor: isDark ? 'rgba(96, 165, 250, 0.35)' : '#BFDBFE',
                      },
                    ]}
                  >
                    <Lock size={18} color={isDark ? '#60A5FA' : '#2563EB'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.safetyPolicyTitle, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
                        Child Safeguarding Rule
                      </Text>
                      <Text style={[styles.safetyPolicyBody, { color: palette.textPrimary }]}>
                        Teachers and admins always follow your latest approved consent details before releasing {activeChild.firstName}. If consent is missing or unclear, your child will never be released independently.
                      </Text>
                    </View>
                  </View>

                  {!isEditingConsent ? (
                    <>
                      {/* Consent Summary Card */}
                      <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <View style={styles.consentHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                              CONSENT STATUS & RELEASE PERMISSIONS
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                              <View
                                style={[
                                  styles.smallStatusPill,
                                  {
                                    backgroundColor: consentInfo.isConfirmed
                                      ? isDark
                                        ? 'rgba(16, 185, 129, 0.16)'
                                        : '#DCFCE7'
                                      : isDark
                                      ? 'rgba(245, 158, 11, 0.16)'
                                      : '#FEF3C7',
                                    borderColor: consentInfo.isConfirmed ? '#86EFAC' : '#FCD34D',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.smallStatusText,
                                    {
                                      color: consentInfo.isConfirmed
                                        ? isDark
                                          ? '#34D399'
                                          : '#047857'
                                        : isDark
                                        ? '#FBBF24'
                                        : '#B45309',
                                    },
                                  ]}
                                >
                                  {consentInfo.status === 'confirmed'
                                    ? 'Consent Submitted & Confirmed ✓'
                                    : consentInfo.status === 'pending_review'
                                    ? 'Pending Parent Review'
                                    : 'Not Submitted Yet'}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.lastUpdatedText, { color: palette.textSecondary }]}>
                              Last Updated: {formatDateTimeDisplay(consentInfo.updatedAt)}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[styles.editConsentBtn, { backgroundColor: isDark ? '#FFFFFF' : '#111827' }]}
                            onPress={openEditConsentForm}
                            activeOpacity={0.85}
                          >
                            <Edit3 size={13} color={isDark ? '#000000' : '#FFFFFF'} />
                            <Text style={[styles.editConsentBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                              Update
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <View style={[styles.divider, { backgroundColor: palette.border }]} />

                        {/* Permission Row 1 */}
                        <View style={styles.permRow}>
                          <Text style={[styles.permLabel, { color: palette.textPrimary }]}>
                            Leave Classroom Independently
                          </Text>
                          <View
                            style={[
                              styles.permBadge,
                              {
                                backgroundColor: consentInfo.canLeaveClassroomIndependently
                                  ? isDark
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : '#DCFCE7'
                                  : palette.innerBg,
                                borderColor: consentInfo.canLeaveClassroomIndependently ? '#86EFAC' : palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.permBadgeText,
                                {
                                  color: consentInfo.canLeaveClassroomIndependently
                                    ? palette.accentEmerald
                                    : palette.textSecondary,
                                },
                              ]}
                            >
                              {consentInfo.canLeaveClassroomIndependently ? 'Allowed' : 'No (Escort Required)'}
                            </Text>
                          </View>
                        </View>

                        {/* Permission Row 2 */}
                        <View style={styles.permRow}>
                          <Text style={[styles.permLabel, { color: palette.textPrimary }]}>
                            Leave Church Premises Independently
                          </Text>
                          <View
                            style={[
                              styles.permBadge,
                              {
                                backgroundColor: consentInfo.canLeavePremisesIndependently
                                  ? isDark
                                    ? 'rgba(245, 158, 11, 0.15)'
                                    : '#FEF3C7'
                                  : palette.innerBg,
                                borderColor: consentInfo.canLeavePremisesIndependently ? '#FCD34D' : palette.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.permBadgeText,
                                {
                                  color: consentInfo.canLeavePremisesIndependently
                                    ? palette.accentAmber
                                    : palette.textSecondary,
                                },
                              ]}
                            >
                              {consentInfo.canLeavePremisesIndependently
                                ? 'Allowed'
                                : 'No (Authorized Pickup Only)'}
                            </Text>
                          </View>
                        </View>

                        {/* Additional Teacher Instructions */}
                        <View style={[styles.instructionsBox, { backgroundColor: palette.innerBg, borderColor: palette.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <FileText size={13} color={palette.accentPurple} />
                            <Text style={[styles.instructionsLabel, { color: palette.textSecondary }]}>
                              ADDITIONAL INSTRUCTIONS FOR TEACHERS
                            </Text>
                          </View>
                          <Text style={[styles.instructionsValue, { color: palette.textPrimary }]}>
                            {consentInfo.teacherInstructions || 'No additional instructions provided.'}
                          </Text>
                        </View>
                      </View>

                      {/* Authorized Pickup Guardians Card */}
                      <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <View style={styles.sectionHeaderSpread}>
                          <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                            AUTHORIZED PICKUP PERSONS ({consentInfo.authorizedPickups.length})
                          </Text>
                          <TouchableOpacity onPress={openEditConsentForm}>
                            <Text style={{ color: palette.accentPurple, fontSize: 12, fontWeight: '800' }}>
                              Edit List ›
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {consentInfo.authorizedPickups.length === 0 ? (
                          <Text style={[styles.emptySub, { color: palette.textSecondary, textAlign: 'left', marginTop: 6 }]}>
                            Primary parent: {activeChild.parentName} ({activeChild.parentPhone || 'No phone'})
                          </Text>
                        ) : (
                          <View style={{ gap: 8, marginTop: 8 }}>
                            {consentInfo.authorizedPickups.map((g, idx) => (
                              <View
                                key={g.id || idx}
                                style={[styles.guardianItemCard, { backgroundColor: palette.innerBg, borderColor: palette.border }]}
                              >
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Text style={[styles.guardianName, { color: palette.textPrimary }]}>{g.name}</Text>
                                    <View style={[styles.relChip, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                                      <Text style={[styles.relChipText, { color: palette.textSecondary }]}>
                                        {g.relationship}
                                      </Text>
                                    </View>
                                  </View>
                                  <Text style={[styles.guardianPhone, { color: palette.textSecondary }]}>
                                    📱 {g.phone || 'Phone not added'}
                                  </Text>
                                </View>
                                <ShieldCheck size={17} color="#10B981" />
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Emergency Contact Card */}
                      <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          EMERGENCY CONTACT DETAILS
                        </Text>
                        <View style={[styles.guardianItemCard, { backgroundColor: palette.innerBg, borderColor: palette.border, marginTop: 8 }]}>
                          <Phone size={16} color="#EF4444" />
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
                    /* EDIT CONSENT & PICKUP SAFETY FORM                  */
                    /* ================================================== */
                    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.border, gap: 14 }]}>
                      <View style={styles.sectionHeaderSpread}>
                        <Text style={[styles.formSectionTitle, { color: palette.textPrimary }]}>
                          Update Consent & Pickup Info
                        </Text>
                        <TouchableOpacity onPress={() => setIsEditingConsent(false)}>
                          <Text style={{ color: palette.textSecondary, fontWeight: '700', fontSize: 13 }}>
                            Cancel
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Release Permission Toggles */}
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

                      {/* Authorized Pickups Editor */}
                      <View style={{ gap: 8 }}>
                        <View style={styles.sectionHeaderSpread}>
                          <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                            AUTHORIZED PICKUP PERSONS ({editGuardians.length})
                          </Text>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            onPress={() => setShowAddGuardianForm(prev => !prev)}
                          >
                            <Plus size={14} color={palette.accentPurple} />
                            <Text style={{ color: palette.accentPurple, fontSize: 12.5, fontWeight: '800' }}>
                              Add Person
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
                            >
                              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>
                                Add Pickup Person
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {editGuardians.map((g, idx) => (
                          <View
                            key={g.id || idx}
                            style={[styles.guardianItemCard, { backgroundColor: palette.innerBg, borderColor: palette.border }]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.guardianName, { color: palette.textPrimary }]}>
                                {g.name} ({g.relationship})
                              </Text>
                              <Text style={[styles.guardianPhone, { color: palette.textSecondary }]}>
                                {g.phone}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleRemoveGuardianFromDraft(idx)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Trash2 size={15} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>

                      {/* Emergency Contact Editor */}
                      <View style={{ gap: 8 }}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          EMERGENCY CONTACT
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

                      {/* Additional Teacher Instructions */}
                      <View style={{ gap: 6 }}>
                        <Text style={[styles.eyebrowLabel, { color: palette.textSecondary }]}>
                          ADDITIONAL INSTRUCTIONS FOR TEACHERS
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: palette.innerBg,
                              color: palette.textPrimary,
                              borderColor: palette.border,
                              minHeight: 80,
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

                      {/* Save Button */}
                      <TouchableOpacity
                        style={[
                          styles.saveConsentBtn,
                          { backgroundColor: '#10B981', opacity: savingConsent ? 0.7 : 1 },
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
                              Save & Confirm Consent Details
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerSub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  childSwitcherStrip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  childPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  childDot: { width: 7, height: 7, borderRadius: 4 },
  childPillText: { fontSize: 12.5, fontWeight: '600', maxWidth: 165 },
  selectedChildBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectedChildAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  selectedChildMeta: {
    fontSize: 11.5,
    marginTop: 1,
  },
  sectionTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  sectionTabBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTabText: { fontSize: 12, fontWeight: '700' },
  scrollBody: { padding: 16, paddingBottom: 36, gap: 14 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyInner: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  eyebrowLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  programPickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 130,
    maxWidth: 190,
    gap: 2,
  },
  dotSmall: { width: 7, height: 7, borderRadius: 4 },
  programPickTitle: { fontSize: 12.5, fontWeight: '700' },
  programPickDate: { fontSize: 11 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  overviewTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  programCategoryEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  overviewDateLine: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600',
  },
  statusPillBig: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillBigText: { fontSize: 11.5, fontWeight: '800' },
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
  pickupCodeEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  pickupCodeHint: { fontSize: 11, marginTop: 1 },
  pickupCodeValue: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailCell: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  detailCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailCellLabel: { fontSize: 11, fontWeight: '600' },
  detailCellValue: { fontSize: 13.5, fontWeight: '800' },
  handoverBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  handoverText: { fontSize: 12, flex: 1 },
  historyStatsRow: { flexDirection: 'row', gap: 8 },
  historyStatCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  historyStatVal: { fontSize: 20, fontWeight: '900' },
  historyStatLbl: { fontSize: 11, fontWeight: '600' },
  filterDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  dateFilterText: { fontSize: 11.5, fontWeight: '700' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 11.5, fontWeight: '600' },
  historyRowCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  historyRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  historyRowTitle: { fontSize: 14.5, fontWeight: '800' },
  historyRowDate: { fontSize: 12, marginTop: 2 },
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  historyFooterMeta: { fontSize: 11.5 },
  safetyPolicyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  safetyPolicyTitle: { fontSize: 12.5, fontWeight: '800' },
  safetyPolicyBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  consentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  lastUpdatedText: { fontSize: 11, marginTop: 6, fontWeight: '600' },
  editConsentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  editConsentBtnText: { fontSize: 12, fontWeight: '800' },
  divider: { height: 1 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  permLabel: { fontSize: 13, fontWeight: '700', flex: 1 },
  permBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  permBadgeText: { fontSize: 11, fontWeight: '800' },
  instructionsBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  instructionsLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  instructionsValue: { fontSize: 12.5, lineHeight: 18 },
  sectionHeaderSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guardianItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  guardianName: { fontSize: 13.5, fontWeight: '800' },
  guardianPhone: { fontSize: 12, marginTop: 2 },
  relChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  relChipText: { fontSize: 10.5, fontWeight: '700' },
  formSectionTitle: { fontSize: 16, fontWeight: '800' },
  switchRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  switchTitle: { fontSize: 13.5, fontWeight: '700' },
  switchDesc: { fontSize: 11.5, marginTop: 2, lineHeight: 16 },
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
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveConsentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 4,
  },
  saveConsentBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
