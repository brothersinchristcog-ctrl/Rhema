import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Plus,
  Calendar,
  Clock,
  Users,
  CheckCircle,
  Trash2,
  Sparkles,
  ChevronRight,
  Layers,
  Edit3,
  Check,
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { formatDateDisplay, toStandardDateString } from '../../../../utils/DateUtils';
import {
  KidsAttendanceSession,
  KidsProgramType,
  KidsTeacherRecord,
} from '../../../../types/KidsMinistryTypes';

interface AdminSessionManagerModalProps {
  visible: boolean;
  churchId: string;
  teachers: KidsTeacherRecord[];
  activeSession: KidsAttendanceSession | null;
  sessionToEdit?: KidsAttendanceSession | null;
  initialTab?: 'create' | 'list';
  onSelectSession: (session: KidsAttendanceSession) => void;
  onClose: () => void;
}

const formatDateMonthYear = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const clean = String(dateStr).trim().split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const y = parts[0];
    const m = parseInt(parts[1], 10) - 1;
    const d = parts[2].padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (m >= 0 && m < 12) {
      return `${d} ${months[m]} ${y}`;
    }
    return `${d}-${parts[1]}-${y}`;
  }
  return clean;
};

const formatTimeToString = (d: Date): string => {
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const strHours = hours < 10 ? `0${hours}` : `${hours}`;
  return `${strHours}:${strMinutes} ${ampm}`;
};

const parseTimeStringToDate = (timeStr: string): Date => {
  const d = new Date();
  if (!timeStr) return d;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    d.setHours(hours, minutes, 0, 0);
  }
  return d;
};

const PROGRAM_TYPES: { type: KidsProgramType; label: string; icon: string }[] = [
  { type: 'sunday_school', label: 'Sunday School', icon: '📖' },
  { type: 'vbs', label: 'VBS (Bible School)', icon: '☀️' },
  { type: 'special_meeting', label: 'Special Meeting', icon: '✨' },
  { type: 'childrens_worship', label: "Children's Worship", icon: '🎵' },
  { type: 'summer_camp', label: 'Summer Camp', icon: '⛺' },
  { type: 'bible_study', label: 'Bible Study', icon: '📜' },
  { type: 'other', label: 'Other Event', icon: '🎯' },
];

export default function AdminSessionManagerModal({
  visible,
  churchId,
  teachers,
  activeSession,
  sessionToEdit,
  initialTab = 'create',
  onSelectSession,
  onClose,
}: AdminSessionManagerModalProps) {
  const insets = useSafeAreaInsets();
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
  } = useAdminTheme();

  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [sessions, setSessions] = useState<KidsAttendanceSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [editingSession, setEditingSession] = useState<KidsAttendanceSession | null>(null);

  // Form State
  const todayStr = new Date().toISOString().split('T')[0];
  const [programTitle, setProgramTitle] = useState('Sunday School');
  const [programType, setProgramType] = useState<KidsProgramType>('sunday_school');
  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('09:30 AM');
  const [endTime, setEndTime] = useState('11:30 AM');
  const [description, setDescription] = useState('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);

  // Synchronize with sessionToEdit / initialTab whenever modal opens
  useEffect(() => {
    if (!visible) return;
    if (sessionToEdit) {
      setEditingSession(sessionToEdit);
      setProgramTitle(sessionToEdit.programTitle || '');
      setProgramType(sessionToEdit.programType || 'sunday_school');
      setDate(sessionToEdit.date || todayStr);
      setStartTime(sessionToEdit.startTime || '09:30 AM');
      setEndTime(sessionToEdit.endTime || '11:30 AM');
      setDescription(sessionToEdit.description || '');
      setSelectedTeacherIds(sessionToEdit.assignedTeacherIds || []);
      setActiveTab('create');
    } else {
      setEditingSession(null);
      setProgramTitle('Sunday School');
      setProgramType('sunday_school');
      setDate(todayStr);
      setStartTime('09:30 AM');
      setEndTime('11:30 AM');
      setDescription('');
      setSelectedTeacherIds([]);
      setActiveTab(initialTab || 'create');
    }
  }, [visible, sessionToEdit, initialTab]);

  // Realtime subscription to program sessions
  useEffect(() => {
    if (!visible) return;
    const unsub = KidsMinistryService.subscribeToProgramSessions(churchId, list => {
      setSessions(list);
      setLoadingSessions(false);
    });
    return () => unsub();
  }, [visible, churchId]);

  const handleSelectProgramType = (type: KidsProgramType, defaultLabel: string) => {
    setProgramType(type);
    if (!programTitle || PROGRAM_TYPES.some(p => p.label === programTitle)) {
      setProgramTitle(defaultLabel);
    }
  };

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeacherIds(prev =>
      prev.includes(teacherId) ? prev.filter(id => id !== teacherId) : [...prev, teacherId]
    );
  };

  const handleStartEdit = (sess: KidsAttendanceSession) => {
    setEditingSession(sess);
    setProgramTitle(sess.programTitle || '');
    setProgramType(sess.programType || 'sunday_school');
    setDate(sess.date || todayStr);
    setStartTime(sess.startTime || '09:30 AM');
    setEndTime(sess.endTime || '11:30 AM');
    setDescription(sess.description || '');
    setSelectedTeacherIds(sess.assignedTeacherIds || []);
    setActiveTab('create');
  };

  const handleResetToCreate = () => {
    setEditingSession(null);
    setProgramTitle('Sunday School');
    setProgramType('sunday_school');
    setDate(todayStr);
    setStartTime('09:30 AM');
    setEndTime('11:30 AM');
    setDescription('');
    setSelectedTeacherIds([]);
  };

  const handleSaveSession = async () => {
    if (!programTitle.trim()) {
      Alert.alert('Required', 'Please enter a program title.');
      return;
    }
    if (!date.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert('Invalid Date', 'Please select a valid event date.');
      return;
    }

    setSaving(true);
    try {
      if (editingSession) {
        // UPDATE EXISTING SESSION
        await KidsMinistryService.updateProgramSession(churchId, editingSession.id, {
          programTitle: programTitle.trim(),
          programType,
          date: date.trim(),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          description: description.trim(),
          assignedTeacherIds: selectedTeacherIds,
        });

        const updated: KidsAttendanceSession = {
          ...editingSession,
          programTitle: programTitle.trim(),
          programType,
          date: date.trim(),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          description: description.trim(),
          assignedTeacherIds: selectedTeacherIds,
        };

        if (activeSession?.id === editingSession.id) {
          onSelectSession(updated);
        }

        Alert.alert(
          'Session Updated! 🎉',
          `"${updated.programTitle}" (${formatDateDisplay(updated.date)}) has been updated.`,
          [{ text: 'OK', onPress: onClose }]
        );
      } else {
        // CREATE NEW SESSION
        const newSession = await KidsMinistryService.createProgramSession(churchId, {
          programTitle: programTitle.trim(),
          programType,
          date: date.trim(),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          description: description.trim(),
          assignedTeacherIds: selectedTeacherIds,
          status: 'active',
        });

        onSelectSession(newSession);
        Alert.alert(
          'Session Created! 🎉',
          `"${newSession.programTitle}" (${formatDateDisplay(newSession.date)}) is now active on your dashboard.`,
          [{ text: 'OK', onPress: onClose }]
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save program session.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = (session: KidsAttendanceSession) => {
    Alert.alert(
      'Delete Program Session',
      `Are you sure you want to delete "${session.programTitle}" (${formatDateDisplay(session.date)})?\n\nHistorical child attendance and custody logs remain preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteProgramSession(churchId, session.id);
              if (editingSession?.id === session.id) {
                handleResetToCreate();
              }
              if (activeSession?.id === session.id) {
                const remaining = sessions.filter(s => s.id !== session.id);
                if (remaining.length > 0) {
                  onSelectSession(remaining[0]);
                }
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not delete session.');
            }
          },
        },
      ]
    );
  };

  const activePillBg = isDark ? '#FFFFFF' : '#0F172A';
  const activePillText = isDark ? '#000000' : '#FFFFFF';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: screenBg, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
          <View>
            <Text style={[styles.headerTitle, { color: primaryText }]}>
              Program Attendance Sessions
            </Text>
            <Text style={[styles.headerSub, { color: secondaryText }]}>
              Create & manage independent attendance for any event
            </Text>
          </View>
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: secondarySurface, borderColor }]} onPress={onClose}>
            <X size={18} color={primaryText} />
          </TouchableOpacity>
        </View>

        {/* Segmented Mode Tabs */}
        <View style={[styles.tabsRow, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: secondarySurface, borderColor },
              activeTab === 'create' && { backgroundColor: activePillBg, borderColor: activePillBg },
            ]}
            onPress={() => setActiveTab('create')}
          >
            <Text style={[styles.tabPillText, { color: activeTab === 'create' ? activePillText : secondaryText }]}>
              {editingSession ? 'Edit Program Session' : 'Create Program Session'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: secondarySurface, borderColor },
              activeTab === 'list' && { backgroundColor: activePillBg, borderColor: activePillBg },
            ]}
            onPress={() => setActiveTab('list')}
          >
            <Layers size={14} color={activeTab === 'list' ? activePillText : secondaryText} />
            <Text style={[styles.tabPillText, { color: activeTab === 'list' ? activePillText : secondaryText }]}>
              All Sessions ({sessions.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'create' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.formScroll, { paddingBottom: Math.max(30, insets.bottom + 20) }]}
          >
            {/* Editing Session Banner */}
            {editingSession && (
              <View
                style={[
                  styles.editingBanner,
                  {
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
                    borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.editingBannerTitle, { color: primaryText }]} numberOfLines={1}>
                    ✏️ Editing: {editingSession.programTitle}
                  </Text>
                  <Text style={[styles.editingBannerSub, { color: secondaryText }]}>
                    {formatDateMonthYear(editingSession.date)} ({formatDateDisplay(editingSession.date)})
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.cancelEditBtn, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={handleResetToCreate}
                >
                  <Text style={[styles.cancelEditBtnText, { color: primaryText }]}>+ Create New</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 1: Select Program Category */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.fieldLabel, { color: primaryText }]}>
                1. SELECT PROGRAM CATEGORY
              </Text>
              <View style={styles.programGrid}>
                {PROGRAM_TYPES.map(p => {
                  const isSelected = programType === p.type;
                  return (
                    <TouchableOpacity
                      key={p.type}
                      style={[
                        styles.programTypeCard,
                        { backgroundColor: cardSurface, borderColor },
                        isSelected && { borderColor: '#F59E0B', borderWidth: 2, backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB' },
                      ]}
                      onPress={() => handleSelectProgramType(p.type, p.label)}
                    >
                      <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                      <Text
                        style={[
                          styles.programTypeLabel,
                          { color: primaryText },
                          isSelected && { fontWeight: '800', color: '#D97706' },
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Step 2: Session Name & Date */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.fieldLabel, { color: primaryText }]}>
                2. SESSION TITLE & SCHEDULE
              </Text>

              <Text style={[styles.inputSubLabel, { color: secondaryText }]}>Program / Session Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: cardSurface, color: primaryText, borderColor }]}
                value={programTitle}
                onChangeText={setProgramTitle}
                placeholder="e.g. Kingdom Champions VBS – Day 1"
                placeholderTextColor={secondaryText}
              />

              <View style={styles.twoCol}>
                {/* Event Date Picker Button */}
                <View style={{ flex: 1.15 }}>
                  <Text style={[styles.inputSubLabel, { color: secondaryText }]}>
                    Event Date (DD-MM-YYYY)
                  </Text>
                  <TouchableOpacity
                    style={[styles.pickerTriggerBtn, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.pickerIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                      <Calendar size={15} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerTriggerValue, { color: primaryText }]} numberOfLines={1}>
                        {formatDateMonthYear(date)}
                      </Text>
                      <Text style={[styles.pickerTriggerSub, { color: secondaryText }]}>
                        {formatDateDisplay(date)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Start Time Picker Button */}
                <View style={{ flex: 0.85 }}>
                  <Text style={[styles.inputSubLabel, { color: secondaryText }]}>
                    Start Time
                  </Text>
                  <TouchableOpacity
                    style={[styles.pickerTriggerBtn, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowStartTimePicker(true)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.pickerIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                      <Clock size={15} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerTriggerValue, { color: primaryText }]} numberOfLines={1}>
                        {startTime || '09:30 AM'}
                      </Text>
                      <Text style={[styles.pickerTriggerSub, { color: secondaryText }]}>
                        Tap to set
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.inputSubLabel, { color: secondaryText }]}>Description / Notes (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: cardSurface, color: primaryText, borderColor, height: 70 }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Special instructions, theme verse, or focus for this session..."
                placeholderTextColor={secondaryText}
                multiline
              />
            </View>

            {/* Step 3: Assign Faculty / Teachers */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.fieldLabel, { color: primaryText }]}>
                3. ASSIGN FACULTY ON DUTY ({selectedTeacherIds.length} selected)
              </Text>
              <Text style={[styles.inputSubLabel, { color: secondaryText, marginTop: 0 }]}>
                Only assigned teachers will count toward the "Faculty On Duty" metric for this session.
              </Text>

              <View style={styles.teachersGrid}>
                {teachers.map(t => {
                  const isAssigned = selectedTeacherIds.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.teacherChip,
                        { backgroundColor: cardSurface, borderColor },
                        isAssigned && { borderColor: '#10B981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5' },
                      ]}
                      onPress={() => toggleTeacher(t.id)}
                    >
                      <View style={[styles.checkCircle, isAssigned && { backgroundColor: '#10B981', borderColor: '#10B981' }]}>
                        {isAssigned && <CheckCircle size={12} color="#FFFFFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.teacherChipName, { color: primaryText }]} numberOfLines={1}>
                          {t.name}
                        </Text>
                        <Text style={[styles.teacherChipRole, { color: secondaryText }]} numberOfLines={1}>
                          {t.assignedClassName || t.role}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Form Action Buttons: Save & Delete */}
            <View style={styles.formActionButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  { backgroundColor: activePillBg, flex: editingSession ? 1 : undefined },
                ]}
                onPress={handleSaveSession}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={activePillText} />
                ) : (
                  <>
                    {editingSession ? (
                      <Check size={17} color={activePillText} strokeWidth={2.4} />
                    ) : (
                      <Sparkles size={17} color={activePillText} />
                    )}
                    <Text style={[styles.createBtnText, { color: activePillText }]}>
                      {editingSession ? 'Save Changes' : 'Create & Activate Program Session'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {editingSession && (
                <TouchableOpacity
                  style={[
                    styles.deleteSessionFormBtn,
                    {
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                      borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FCA5A5',
                    },
                  ]}
                  onPress={() => handleDeleteSession(editingSession)}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Trash2 size={16} color="#EF4444" />
                  <Text style={styles.deleteSessionFormBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listScroll, { paddingBottom: Math.max(30, insets.bottom + 20) }]}
          >
            {loadingSessions ? (
              <ActivityIndicator size="large" color="#FBBF24" style={{ marginTop: 40 }} />
            ) : sessions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Calendar size={32} color={secondaryText} />
                <Text style={[styles.emptyTitle, { color: primaryText }]}>No Sessions Created Yet</Text>
                <Text style={[styles.emptySub, { color: secondaryText }]}>
                  Tap "Create Program Session" above to launch a Sunday School, VBS, or special event session.
                </Text>
              </View>
            ) : (
              sessions.map(sess => {
                const isSelected = activeSession?.id === sess.id;
                return (
                  <View
                    key={sess.id}
                    style={[
                      styles.sessionRowCard,
                      { backgroundColor: cardSurface, borderColor },
                      isSelected && { borderColor: '#F59E0B', borderWidth: 2 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={[styles.statusDot, { backgroundColor: sess.status === 'active' ? '#10B981' : '#F59E0B' }]} />
                        <Text style={[styles.sessionBadge, { color: sess.attendanceFinalized ? '#10B981' : sess.status === 'active' ? '#10B981' : '#F59E0B' }]}>
                          {sess.programType.replace('_', ' ').toUpperCase()} · {sess.attendanceFinalized ? 'FINALIZED ✓' : sess.status.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.sessionRowTitle, { color: primaryText }]}>
                        {sess.programTitle}
                      </Text>
                      <Text style={[styles.sessionRowMeta, { color: secondaryText }]}>
                        📅 {formatDateMonthYear(sess.date)} ({formatDateDisplay(sess.date)}){sess.startTime ? ` · ${sess.startTime}` : ''} · {sess.assignedTeacherIds?.length || 0} {sess.assignedTeacherIds?.length === 1 ? 'teacher' : 'teachers'} assigned
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {/* Select / Active */}
                      <TouchableOpacity
                        style={[
                          styles.selectBtn,
                          { backgroundColor: isSelected ? '#10B981' : secondarySurface, borderColor },
                        ]}
                        onPress={() => {
                          onSelectSession(sess);
                          onClose();
                        }}
                      >
                        <Text style={[styles.selectBtnText, { color: isSelected ? '#FFFFFF' : primaryText }]}>
                          {isSelected ? 'Active' : 'Select'}
                        </Text>
                      </TouchableOpacity>

                      {/* Edit Button */}
                      <TouchableOpacity
                        style={[styles.editRowBtn, { backgroundColor: secondarySurface, borderColor }]}
                        onPress={() => handleStartEdit(sess)}
                        activeOpacity={0.8}
                      >
                        <Edit3 size={13} color={primaryText} />
                        <Text style={[styles.editRowBtnText, { color: primaryText }]}>Edit</Text>
                      </TouchableOpacity>

                      {/* Delete Button */}
                      <TouchableOpacity
                        style={[styles.deleteBtn, { backgroundColor: secondarySurface, borderColor }]}
                        onPress={() => handleDeleteSession(sess)}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* ── NATIVE DATE PICKER MODAL (DATE MONTH YEAR) ── */}
        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          date={date ? new Date(`${date}T12:00:00`) : new Date()}
          onConfirm={(selectedDate: Date) => {
            setShowDatePicker(false);
            setDate(toStandardDateString(selectedDate));
          }}
          onCancel={() => setShowDatePicker(false)}
        />

        {/* ── NATIVE TIME PICKER MODAL ── */}
        <DateTimePickerModal
          isVisible={showStartTimePicker}
          mode="time"
          date={parseTimeStringToDate(startTime)}
          onConfirm={(selectedDate: Date) => {
            setShowStartTimePicker(false);
            setStartTime(formatTimeToString(selectedDate));
          }}
          onCancel={() => setShowStartTimePicker(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabPillText: { fontSize: 12.5, fontWeight: '700' },
  formScroll: { padding: 18, gap: 18 },
  sectionBlock: { gap: 8 },
  fieldLabel: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.5 },
  inputSubLabel: { fontSize: 11.5, fontWeight: '600', marginTop: 4 },
  programGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  programTypeCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  programTypeLabel: { fontSize: 12.5, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13.5,
  },
  twoCol: { flexDirection: 'row', gap: 10 },
  pickerTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
  },
  pickerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTriggerValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  pickerTriggerSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  teachersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  teacherChip: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherChipName: { fontSize: 12.5, fontWeight: '700' },
  teacherChipRole: { fontSize: 11 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 8,
  },
  createBtnText: { fontSize: 14, fontWeight: '800' },
  listScroll: { padding: 18, gap: 10 },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptySub: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  sessionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  sessionBadge: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  sessionRowTitle: { fontSize: 14.5, fontWeight: '800' },
  sessionRowMeta: { fontSize: 11.5, marginTop: 2 },
  selectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  selectBtnText: { fontSize: 12, fontWeight: '800' },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  editingBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  editingBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  cancelEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  cancelEditBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  formActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  deleteSessionFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  deleteSessionFormBtnText: {
    color: '#EF4444',
    fontSize: 13.5,
    fontWeight: '800',
  },
  editRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  editRowBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
