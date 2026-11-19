import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  Save,
  Clock,
  DoorOpen,
  Users,
  User,
  Phone,
  Trash2,
  Plus,
  Calendar,
  Search,
  CheckCircle,
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { KidsClassRecord, KidsClassTier } from '../../../../types/KidsMinistryTypes';

interface EditClassModalProps {
  visible: boolean;
  classData: KidsClassRecord | null; // null = Create Mode, non-null = Edit Mode
  churchId: string;
  enrolledCount?: number;
  onClose: () => void;
  onSaved?: () => void;
}

const TIER_OPTIONS: Array<{ id: KidsClassTier; label: string; min: number; max: number }> = [
  { id: 'nursery', label: 'Nursery (0–3)', min: 0, max: 3 },
  { id: 'beginners', label: 'Beginners (4–5)', min: 4, max: 5 },
  { id: 'primary', label: 'Primary (6–8)', min: 6, max: 8 },
  { id: 'junior', label: 'Junior (9–11)', min: 9, max: 11 },
  { id: 'teens', label: 'Teens (12–14)', min: 12, max: 14 },
];

const DAY_OPTIONS = ['Sunday', 'Saturday', 'Wednesday', 'Friday'];

export default function EditClassModal({
  visible,
  classData,
  churchId,
  enrolledCount = 0,
  onClose,
  onSaved,
}: EditClassModalProps) {
  const isEditing = Boolean(classData);

  const [name, setName] = useState('');
  const [tier, setTier] = useState<KidsClassTier>('primary');
  const [minAge, setMinAge] = useState('6');
  const [maxAge, setMaxAge] = useState('8');
  const [roomNumber, setRoomNumber] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('25');
  const [leadTeacherName, setLeadTeacherName] = useState('');
  const [leadTeacherPhone, setLeadTeacherPhone] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('Sunday');
  const [startTime, setStartTime] = useState('09:30 AM');
  const [endTime, setEndTime] = useState('11:30 AM');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Search Members for Lead Teacher
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // DateTimePicker State
  const [timePickerTarget, setTimePickerTarget] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (classData) {
      setName(classData.name || '');
      setTier(classData.tier || 'primary');
      setMinAge(String(classData.ageRange?.min ?? 6));
      setMaxAge(String(classData.ageRange?.max ?? 8));
      setRoomNumber(classData.roomNumber || '');
      setMaxCapacity(String(classData.maxCapacity || 25));
      setLeadTeacherName(classData.leadTeacherName || '');
      setLeadTeacherPhone(classData.leadTeacherPhone || '');
      setDayOfWeek(classData.schedule?.dayOfWeek || 'Sunday');
      setStartTime(classData.schedule?.startTime || '09:30 AM');
      setEndTime(classData.schedule?.endTime || '11:30 AM');
      setSelectedMemberId(classData.leadTeacherId || null);
    } else {
      setName('');
      setTier('primary');
      setMinAge('6');
      setMaxAge('8');
      setRoomNumber('');
      setMaxCapacity('25');
      setLeadTeacherName('');
      setLeadTeacherPhone('');
      setDayOfWeek('Sunday');
      setStartTime('09:30 AM');
      setEndTime('11:30 AM');
      setSelectedMemberId(null);
    }
    setMemberResults([]);
    setShowMemberDropdown(false);
  }, [visible, classData]);

  // Lead Teacher Member Search
  const handleSearchTeacher = async (text: string) => {
    setLeadTeacherName(text);
    if (!text.trim()) {
      setMemberResults([]);
      setShowMemberDropdown(false);
      return;
    }
    setSearchingMembers(true);
    setShowMemberDropdown(true);
    try {
      const results = await KidsMinistryService.searchChurchMembers(churchId, text);
      setMemberResults(results.slice(0, 8));
    } catch {
      setMemberResults([]);
    } finally {
      setSearchingMembers(false);
    }
  };

  const handleSelectMember = (m: any) => {
    const displayName = (m.name || `${m.firstName || ''} ${m.lastName || ''}`).trim();
    const phone = m.phone || m.mobileNumber || m.phoneNumber || '';
    setSelectedMemberId(m.id);
    setLeadTeacherName(displayName);
    setLeadTeacherPhone(phone);
    setShowMemberDropdown(false);
  };

  const formatTimeToString = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const strHours = hours < 10 ? `0${hours}` : `${hours}`;
    return `${strHours}:${strMinutes} ${ampm}`;
  };

  const handleConfirmTime = (date: Date) => {
    const formatted = formatTimeToString(date);
    if (timePickerTarget === 'start') {
      setStartTime(formatted);
    } else if (timePickerTarget === 'end') {
      setEndTime(formatted);
    }
    setTimePickerTarget(null);
  };

  const handleSelectTier = (selectedTier: KidsClassTier) => {
    setTier(selectedTier);
    const preset = TIER_OPTIONS.find(t => t.id === selectedTier);
    if (preset && !isEditing) {
      setMinAge(String(preset.min));
      setMaxAge(String(preset.max));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a classroom name.');
      return;
    }
    const cap = parseInt(maxCapacity, 10);
    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Invalid Capacity', 'Please enter a valid positive number for max capacity.');
      return;
    }
    const parsedMin = parseInt(minAge, 10);
    const parsedMax = parseInt(maxAge, 10);
    if (isNaN(parsedMin) || isNaN(parsedMax) || parsedMin < 0 || parsedMax < parsedMin) {
      Alert.alert('Invalid Age Range', 'Please enter a valid minimum and maximum age.');
      return;
    }

    try {
      setSaving(true);
      if (isEditing && classData) {
        await KidsMinistryService.updateClass(churchId, classData.id, {
          name: name.trim(),
          tier,
          ageRange: { min: parsedMin, max: parsedMax },
          roomNumber: roomNumber.trim() || 'Room TBD',
          maxCapacity: cap,
          leadTeacherId: selectedMemberId || undefined,
          leadTeacherName: leadTeacherName.trim(),
          leadTeacherPhone: leadTeacherPhone.trim(),
          schedule: {
            dayOfWeek: dayOfWeek.trim() || 'Sunday',
            startTime: startTime.trim() || '09:30 AM',
            endTime: endTime.trim() || '11:30 AM',
          },
        });
        Alert.alert('Classroom Updated! 🎉', `${name.trim()} settings saved successfully.`);
      } else {
        await KidsMinistryService.createClass(churchId, {
          name: name.trim(),
          tier,
          ageRange: { min: parsedMin, max: parsedMax },
          roomNumber: roomNumber.trim() || 'Room TBD',
          maxCapacity: cap,
          leadTeacherId: selectedMemberId || undefined,
          leadTeacherName: leadTeacherName.trim() || 'TBD',
          leadTeacherPhone: leadTeacherPhone.trim(),
          schedule: {
            dayOfWeek: dayOfWeek.trim() || 'Sunday',
            startTime: startTime.trim() || '09:30 AM',
            endTime: endTime.trim() || '11:30 AM',
          },
        });
        Alert.alert('Classroom Created! 🎉', `${name.trim()} has been added to Sunday School classes.`);
      }

      if (onSaved) onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not save classroom');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!classData) return;
    const childWarning =
      enrolledCount > 0
        ? `\n\nNote: ${enrolledCount} enrolled ${enrolledCount === 1 ? 'child is' : 'children are'} currently linked to this class tier. Their profiles will NOT be deleted, and you can reassign them anytime.`
        : '';

    Alert.alert(
      'Delete Classroom?',
      `Are you sure you want to permanently delete "${classData.name}"?${childWarning}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await KidsMinistryService.deleteClass(churchId, classData.id);
              Alert.alert('Deleted', `"${classData.name}" has been removed.`);
              if (onSaved) onSaved();
              onClose();
            } catch (e: any) {
              Alert.alert('Delete Failed', e.message || 'Could not delete classroom');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTag}>SUNDAY SCHOOL SETTINGS</Text>
              <Text style={styles.headerTitleSerif}>
                {isEditing ? 'Edit Classroom' : 'Create New Classroom'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              {isEditing && (
                <TouchableOpacity
                  onPress={handleDelete}
                  style={styles.deleteHeaderBtn}
                  disabled={saving || deleting}
                  activeOpacity={0.8}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Trash2 size={16} color="#EF4444" />
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={saving || deleting}>
                <X size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Class Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Classroom Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Primary Stars / Junior Warriors"
                placeholderTextColor="#6B7280"
              />
            </View>

            {/* Age Group Tier Selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Age Group Tier</Text>
              <View style={styles.chipRow}>
                {TIER_OPTIONS.map(t => {
                  const active = tier === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.tierChip, active && styles.tierChipActive]}
                      onPress={() => handleSelectTier(t.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.tierChipText, active && styles.tierChipTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Min Age & Max Age Row */}
            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Min Age (Years)</Text>
                <TextInput
                  style={styles.input}
                  value={minAge}
                  onChangeText={setMinAge}
                  keyboardType="numeric"
                  placeholder="6"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Max Age (Years)</Text>
                <TextInput
                  style={styles.input}
                  value={maxAge}
                  onChangeText={setMaxAge}
                  keyboardType="numeric"
                  placeholder="8"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>

            {/* Room Location & Max Capacity Row */}
            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1.4 }]}>
                <View style={styles.labelRow}>
                  <DoorOpen size={12} color="#FBBF24" />
                  <Text style={styles.label}>Room Location</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={roomNumber}
                  onChangeText={setRoomNumber}
                  placeholder="e.g. Room 201 · 2nd Floor"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <Users size={12} color="#FBBF24" />
                  <Text style={styles.label}>Max Capacity</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={maxCapacity}
                  onChangeText={setMaxCapacity}
                  keyboardType="numeric"
                  placeholder="25"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>

            {/* Lead Teacher Name & Phone with Church Member Lookup */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <User size={12} color="#34D399" />
                <Text style={styles.label}>Lead Teacher (Search Church Members)</Text>
                {selectedMemberId && (
                  <View style={styles.linkedMemberBadge}>
                    <CheckCircle size={10} color="#34D399" />
                    <Text style={styles.linkedMemberBadgeText}>Linked</Text>
                  </View>
                )}
              </View>

              <View style={styles.teacherSearchInputWrap}>
                <TextInput
                  style={[styles.input, { paddingRight: 36 }]}
                  value={leadTeacherName}
                  onChangeText={handleSearchTeacher}
                  placeholder="Type name to search existing church members..."
                  placeholderTextColor="#6B7280"
                />
                <View style={styles.searchIconSlot}>
                  {searchingMembers ? (
                    <ActivityIndicator size="small" color="#FBBF24" />
                  ) : (
                    <Search size={14} color="#6B7280" />
                  )}
                </View>
              </View>

              {/* Autocomplete Member Results Dropdown */}
              {showMemberDropdown && (
                <View style={styles.memberDropdown}>
                  {memberResults.length === 0 ? (
                    <View style={styles.memberEmptyItem}>
                      <Text style={styles.memberEmptyText}>
                        {searchingMembers ? 'Searching members...' : 'No matching church members found'}
                      </Text>
                    </View>
                  ) : (
                    memberResults.map(m => {
                      const mName = (m.name || `${m.firstName || ''} ${m.lastName || ''}`).trim();
                      const mPhone = m.phone || m.mobileNumber || m.phoneNumber || 'No phone';
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={styles.memberResultRow}
                          onPress={() => handleSelectMember(m)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.memberAvatarMini}>
                            <Text style={styles.memberAvatarMiniText}>
                              {mName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberNameText} numberOfLines={1}>{mName}</Text>
                            <Text style={styles.memberPhoneText}>{mPhone}</Text>
                          </View>
                          <View style={styles.selectMemberPill}>
                            <Text style={styles.selectMemberPillText}>Select</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Phone size={12} color="#34D399" />
                <Text style={styles.label}>Teacher Phone / WhatsApp (Auto-filled)</Text>
              </View>
              <TextInput
                style={styles.input}
                value={leadTeacherPhone}
                onChangeText={setLeadTeacherPhone}
                keyboardType="phone-pad"
                placeholder="e.g. +91 98765 43210"
                placeholderTextColor="#6B7280"
              />
            </View>

            {/* Schedule Day Selector */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Calendar size={12} color="#60A5FA" />
                <Text style={styles.label}>Class Day</Text>
              </View>
              <View style={styles.chipRow}>
                {DAY_OPTIONS.map(d => {
                  const active = dayOfWeek === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dayChip, active && styles.dayChipActive]}
                      onPress={() => setDayOfWeek(d)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Schedule Times with Interactive Clock Pickers */}
            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <Clock size={12} color="#60A5FA" />
                  <Text style={styles.label}>Start Time</Text>
                </View>
                <TouchableOpacity
                  style={styles.timePickerButton}
                  onPress={() => setTimePickerTarget('start')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.timePickerButtonText}>{startTime}</Text>
                  <Clock size={14} color="#FBBF24" />
                </TouchableOpacity>
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <Clock size={12} color="#60A5FA" />
                  <Text style={styles.label}>End Time</Text>
                </View>
                <TouchableOpacity
                  style={styles.timePickerButton}
                  onPress={() => setTimePickerTarget('end')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.timePickerButtonText}>{endTime}</Text>
                  <Clock size={14} color="#FBBF24" />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Time Picker Modal */}
          <DateTimePickerModal
            isVisible={!!timePickerTarget}
            mode="time"
            onConfirm={handleConfirmTime}
            onCancel={() => setTimePickerTarget(null)}
          />

          {/* Action Row */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving || deleting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, (saving || deleting) && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving || deleting}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  {isEditing ? <Save size={16} color="#000000" /> : <Plus size={16} color="#000000" strokeWidth={2.8} />}
                  <Text style={styles.saveBtnText}>
                    {isEditing ? 'Save Classroom' : 'Create Classroom'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#27272A',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1.5,
  },
  headerTitleSerif: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  deleteHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    gap: 14,
    paddingBottom: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  input: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#FFFFFF',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tierChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  tierChipActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    borderColor: '#FBBF24',
  },
  tierChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  tierChipTextActive: {
    color: '#FBBF24',
  },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  dayChipActive: {
    backgroundColor: 'rgba(96, 165, 250, 0.16)',
    borderColor: '#60A5FA',
  },
  dayChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  dayChipTextActive: {
    color: '#60A5FA',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FBBF24',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  // Teacher Search & Dropdown Styles
  linkedMemberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  linkedMemberBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#34D399',
  },
  teacherSearchInputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIconSlot: {
    position: 'absolute',
    right: 12,
  },
  memberDropdown: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 4,
    maxHeight: 180,
    overflow: 'hidden',
  },
  memberEmptyItem: {
    padding: 12,
    alignItems: 'center',
  },
  memberEmptyText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  memberResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#27354A',
    gap: 10,
  },
  memberAvatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarMiniText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  memberNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  memberPhoneText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  selectMemberPill: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  selectMemberPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  // Time Picker Button Styles
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#09090B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  timePickerButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
