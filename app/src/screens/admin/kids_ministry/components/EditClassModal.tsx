import React, { useState } from 'react';
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
import { X, Save, Clock, DoorOpen, Users, User, Phone } from 'lucide-react-native';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { KidsClassRecord } from '../../../../types/KidsMinistryTypes';

interface EditClassModalProps {
  visible: boolean;
  classData: KidsClassRecord | null;
  churchId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function EditClassModal({
  visible,
  classData,
  churchId,
  onClose,
  onSaved,
}: EditClassModalProps) {
  if (!classData) return null;

  const [name, setName] = useState(classData.name);
  const [roomNumber, setRoomNumber] = useState(classData.roomNumber);
  const [maxCapacity, setMaxCapacity] = useState(String(classData.maxCapacity));
  const [leadTeacherName, setLeadTeacherName] = useState(classData.leadTeacherName || '');
  const [leadTeacherPhone, setLeadTeacherPhone] = useState(classData.leadTeacherPhone || '');
  const [startTime, setStartTime] = useState(classData.schedule?.startTime || '09:30');
  const [endTime, setEndTime] = useState(classData.schedule?.endTime || '11:30');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a class name.');
      return;
    }
    const cap = parseInt(maxCapacity, 10);
    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Invalid Capacity', 'Please enter a valid positive number for max capacity.');
      return;
    }

    try {
      setSaving(true);
      await KidsMinistryService.updateClass(churchId, classData.id, {
        name: name.trim(),
        roomNumber: roomNumber.trim(),
        maxCapacity: cap,
        leadTeacherName: leadTeacherName.trim(),
        leadTeacherPhone: leadTeacherPhone.trim(),
        schedule: {
          dayOfWeek: classData.schedule?.dayOfWeek || 'Sunday',
          startTime: startTime.trim(),
          endTime: endTime.trim(),
        },
      });

      Alert.alert('Classroom Updated! 🎉', `${name} settings saved successfully.`);
      if (onSaved) onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not update classroom');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTag}>SUNDAY SCHOOL SETTINGS</Text>
              <Text style={styles.headerTitleSerif}>Edit Classroom</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Class Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Classroom Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Primary Stars"
                placeholderTextColor="#6B7280"
              />
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
                  placeholder="e.g. Room 201"
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

            {/* Age Bracket Info (Read Only) */}
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxTitle}>AGE BRACKET:</Text>
              <Text style={styles.infoBoxText}>
                Ages {classData.ageRange.min} to {classData.ageRange.max} years old ({classData.tier.toUpperCase()})
              </Text>
            </View>
          </ScrollView>

          {/* Action Row */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  <Save size={16} color="#000000" />
                  <Text style={styles.saveBtnText}>Save Classroom</Text>
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  infoBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  infoBoxTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoBoxText: {
    fontSize: 12,
    color: '#E4E4E7',
    fontWeight: '600',
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
    backgroundColor: '#FFFFFF',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
});
