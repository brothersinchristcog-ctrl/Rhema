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
import { X, Save, Clock, DoorOpen, Users, User, Phone, Trash2, Plus, Calendar } from 'lucide-react-native';
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
  const [startTime, setStartTime] = useState('09:30');
  const [endTime, setEndTime] = useState('11:30');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      setStartTime(classData.schedule?.startTime || '09:30');
      setEndTime(classData.schedule?.endTime || '11:30');
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
      setStartTime('09:30');
      setEndTime('11:30');
    }
  }, [visible, classData]);

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
          leadTeacherName: leadTeacherName.trim(),
          leadTeacherPhone: leadTeacherPhone.trim(),
          schedule: {
            dayOfWeek: dayOfWeek.trim() || 'Sunday',
            startTime: startTime.trim() || '09:30',
            endTime: endTime.trim() || '11:30',
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
          leadTeacherName: leadTeacherName.trim() || 'TBD',
          leadTeacherPhone: leadTeacherPhone.trim(),
          schedule: {
            dayOfWeek: dayOfWeek.trim() || 'Sunday',
            startTime: startTime.trim() || '09:30',
            endTime: endTime.trim() || '11:30',
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

            {/* Lead Teacher Name & Phone */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <User size={12} color="#34D399" />
                <Text style={styles.label}>Lead Teacher Name</Text>
              </View>
              <TextInput
                style={styles.input}
                value={leadTeacherName}
                onChangeText={setLeadTeacherName}
                placeholder="e.g. Bro. Sunil Babu"
                placeholderTextColor="#6B7280"
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Phone size={12} color="#34D399" />
                <Text style={styles.label}>Teacher Phone / WhatsApp</Text>
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

            {/* Schedule Times */}
            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <Clock size={12} color="#60A5FA" />
                  <Text style={styles.label}>Start Time</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:30"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <Clock size={12} color="#60A5FA" />
                  <Text style={styles.label}>End Time</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="11:30"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>
          </ScrollView>

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
});
