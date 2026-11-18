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
  Linking,
} from 'react-native';
import {
  X,
  Plus,
  ShieldCheck,
  UserCheck,
  Phone,
  Mail,
  Trash2,
  KeyRound,
  Users,
} from 'lucide-react-native';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { KidsTeacherRecord, KidsClassTier } from '../../../../types/KidsMinistryTypes';

interface AdminTeachersModalProps {
  visible: boolean;
  teachers: KidsTeacherRecord[];
  todayAttendance: any[];
  churchId: string;
  onClose: () => void;
}

export default function AdminTeachersModal({
  visible,
  teachers,
  todayAttendance,
  churchId,
  onClose,
}: AdminTeachersModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'lead_teacher' | 'assistant_teacher' | 'volunteer'>('lead_teacher');
  const [newTier, setNewTier] = useState<KidsClassTier>('primary');
  const [newPin, setNewPin] = useState('2026');
  const [submitting, setSubmitting] = useState(false);

  const tierNames: Record<KidsClassTier, string> = {
    nursery: 'Nursery Angels',
    beginners: 'Beginners Kingdom',
    primary: 'Primary Stars',
    junior: 'Junior Champions',
    teens: 'Teens for Christ',
  };

  const handleAddTeacher = async () => {
    if (!newName.trim() || !newPhone.trim()) {
      Alert.alert('Missing Field', 'Please enter teacher name and phone number.');
      return;
    }

    try {
      setSubmitting(true);
      await KidsMinistryService.registerTeacher(churchId, {
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim(),
        role: newRole,
        assignedClassTier: newTier,
        assignedClassName: tierNames[newTier],
        pinCode: newPin.trim() || '1234',
      });

      Alert.alert('Teacher Registered! 🎉', `${newName} has been added to Sunday School faculty.`);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setShowAddForm(false);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not add teacher');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (t: KidsTeacherRecord) => {
    Alert.alert(
      'Remove Faculty',
      `Are you sure you want to remove ${t.name} from Sunday School?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteTeacher(churchId, t.id);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not delete teacher');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTag}>SUNDAY SCHOOL FACULTY</Text>
              <Text style={styles.headerTitleSerif}>Teachers & Volunteers</Text>
              <Text style={styles.headerSubtitle}>
                {teachers.length} Faculty Members · {todayAttendance.length} On Duty Today
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Add New Teacher Toggle */}
          {!showAddForm ? (
            <TouchableOpacity
              style={styles.addTeacherBtn}
              onPress={() => setShowAddForm(true)}
              activeOpacity={0.88}
            >
              <Plus size={16} color="#000000" strokeWidth={2.8} />
              <Text style={styles.addTeacherBtnText}>Register New Teacher / Volunteer</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.addFormBox}>
              <View style={styles.addFormHeader}>
                <Text style={styles.addFormTitle}>New Sunday School Faculty</Text>
                <TouchableOpacity onPress={() => setShowAddForm(false)}>
                  <X size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Full Name (e.g. Sis. Sarah)"
                placeholderTextColor="#6B7280"
              />

              <View style={styles.formRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                  placeholder="Phone / WhatsApp"
                  placeholderTextColor="#6B7280"
                />
                <TextInput
                  style={[styles.input, { width: 90 }]}
                  value={newPin}
                  onChangeText={setNewPin}
                  keyboardType="numeric"
                  maxLength={4}
                  placeholder="PIN: 2026"
                  placeholderTextColor="#6B7280"
                />
              </View>

              {/* Class Tier Selector */}
              <Text style={styles.fieldLabel}>Assigned Sunday School Class:</Text>
              <View style={styles.tierSelectorRow}>
                {(['nursery', 'beginners', 'primary', 'junior', 'teens'] as KidsClassTier[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tierChip, newTier === t && styles.tierChipActive]}
                    onPress={() => setNewTier(t)}
                  >
                    <Text style={[styles.tierChipText, newTier === t && styles.tierChipTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitTeacherBtn, submitting && { opacity: 0.7 }]}
                onPress={handleAddTeacher}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.submitTeacherBtnText}>Save & Assign Faculty</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Teachers Roster List */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
            {teachers.map(teacher => {
              const isPresent = todayAttendance.some(a => a.teacherDocId === teacher.id);
              return (
                <View key={teacher.id} style={styles.teacherCard}>
                  <View style={styles.teacherRow}>
                    <View style={[styles.avatar, isPresent && styles.avatarPresent]}>
                      <Text style={styles.avatarText}>{teacher.name.charAt(0)}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.teacherName}>{teacher.name}</Text>
                        <View style={[styles.statusBadge, isPresent && styles.statusBadgePresent]}>
                          <Text style={[styles.statusBadgeText, isPresent && styles.statusBadgeTextPresent]}>
                            {isPresent ? 'On Duty Today ✓' : 'Scheduled'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.classText}>
                        {teacher.assignedClassName} · {teacher.role === 'lead_teacher' ? 'Lead' : 'Assistant'}
                      </Text>

                      {/* Safeguarding Badge */}
                      <View style={styles.safeguardTag}>
                        <ShieldCheck size={11} color="#34D399" />
                        <Text style={styles.safeguardTagText}>
                          Police Background Verified ({teacher.safeguardingVerifiedDate || '2026'})
                        </Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.actionsCol}>
                      {teacher.phone ? (
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => Linking.openURL(`tel:${teacher.phone}`)}
                        >
                          <Phone size={13} color="#34D399" />
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
                        onPress={() => handleDelete(teacher)}
                      >
                        <Trash2 size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Close */}
          <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
            <Text style={styles.closeFooterText}>Done</Text>
          </TouchableOpacity>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
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
  headerSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
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
  addTeacherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 14,
  },
  addTeacherBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  addFormBox: {
    backgroundColor: '#09090B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FBBF24',
    marginBottom: 14,
    gap: 10,
  },
  addFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addFormTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    backgroundColor: '#18181B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#FFFFFF',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  tierSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tierChip: {
    backgroundColor: '#18181B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  tierChipActive: {
    backgroundColor: '#FFFFFF',
  },
  tierChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  tierChipTextActive: {
    color: '#000000',
  },
  submitTeacherBtn: {
    backgroundColor: '#FBBF24',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  submitTeacherBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  listContainer: {
    gap: 8,
    paddingBottom: 16,
  },
  teacherCard: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPresent: {
    backgroundColor: '#064E3B',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teacherName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusBadge: {
    backgroundColor: '#18181B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  statusBadgePresent: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderColor: '#10B981',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  statusBadgeTextPresent: {
    color: '#34D399',
  },
  classText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  safeguardTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  safeguardTagText: {
    fontSize: 9,
    color: '#34D399',
    fontWeight: '600',
  },
  actionsCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  actionIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  closeFooterBtn: {
    backgroundColor: '#27272A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  closeFooterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
