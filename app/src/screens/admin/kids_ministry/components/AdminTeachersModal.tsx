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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Plus,
  ShieldCheck,
  UserCheck,
  Phone,
  Mail,
  Trash2,
  Users,
  Search,
  Check,
  ChevronDown,
  Info,
  User,
} from 'lucide-react-native';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { KidsTeacherRecord, KidsClassTier, KidsTeacherRole } from '../../../../types/KidsMinistryTypes';

const { width, height } = Dimensions.get('window');

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
  const insets = useSafeAreaInsets();
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'teachers' | 'volunteers'>('all');

  // Form Fields
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<KidsTeacherRole>('lead_teacher');
  const [newTier, setNewTier] = useState<KidsClassTier>('primary');
  const [submitting, setSubmitting] = useState(false);

  // Member search dropdown
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const tierNames: Record<KidsClassTier, string> = {
    nursery: 'Nursery Angels (0-2 yrs)',
    beginners: 'Beginners Kingdom (3-5 yrs)',
    primary: 'Primary Stars (6-8 yrs)',
    junior: 'Junior Champions (9-12 yrs)',
    teens: 'Teens for Christ (13-17 yrs)',
  };

  // Trigger search on typing in Full Name
  const handleSearchMembers = async (text: string) => {
    setNewName(text);
    setMemberSearchQuery(text);
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
    const email = m.email || '';
    setSelectedMemberId(m.id);
    setNewName(displayName);
    setNewPhone(phone);
    setNewEmail(email);
    setShowMemberDropdown(false);
  };

  const handleClearSelection = () => {
    setSelectedMemberId(null);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setShowMemberDropdown(false);
  };

  const handleAddTeacher = async () => {
    if (!newName.trim() || !newPhone.trim()) {
      Alert.alert('Missing Required Fields', 'Please enter or select the faculty member’s name and phone number.');
      return;
    }

    try {
      setSubmitting(true);
      await KidsMinistryService.registerTeacher(churchId, {
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim(),
        memberId: selectedMemberId || undefined,
        role: newRole,
        assignedClassTier: newTier,
        assignedClassName: tierNames[newTier],
        pinCode: '',
        backgroundCheckPassed: false,
        safeguardingStatus: 'verified',
      });

      Alert.alert('Faculty Registered! 🎉', `${newName} has been added to the Sunday School team.`);
      handleClearSelection();
      setShowAddForm(false);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not register faculty member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (t: KidsTeacherRecord) => {
    Alert.alert(
      'Remove Faculty',
      `Are you sure you want to remove ${t.name} from the Sunday School roster?`,
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

  const filteredTeachers = teachers.filter(t => {
    if (activeSubTab === 'teachers') return t.role === 'lead_teacher' || t.role === 'assistant_teacher';
    if (activeSubTab === 'volunteers') return t.role === 'volunteer';
    return true;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { paddingTop: Math.max(insets.top, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>SUNDAY SCHOOL ROSTER</Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{teachers.length} Active</Text>
                </View>
              </View>
              <Text style={styles.headerTitle}>Faculty & Volunteers</Text>
              <Text style={styles.headerSubtitle}>
                Manage approved Sunday School educators, helpers, and active service assignments.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Subtabs & Register Button */}
          <View style={styles.topActionBar}>
            <View style={styles.filterPillsRow}>
              <TouchableOpacity
                style={[styles.filterPill, activeSubTab === 'all' && styles.filterPillActive]}
                onPress={() => setActiveSubTab('all')}
              >
                <Text style={[styles.filterPillText, activeSubTab === 'all' && styles.filterPillTextActive]}>
                  All ({teachers.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, activeSubTab === 'teachers' && styles.filterPillActive]}
                onPress={() => setActiveSubTab('teachers')}
              >
                <Text style={[styles.filterPillText, activeSubTab === 'teachers' && styles.filterPillTextActive]}>
                  Teachers
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, activeSubTab === 'volunteers' && styles.filterPillActive]}
                onPress={() => setActiveSubTab('volunteers')}
              >
                <Text style={[styles.filterPillText, activeSubTab === 'volunteers' && styles.filterPillTextActive]}>
                  Volunteers
                </Text>
              </TouchableOpacity>
            </View>

            {!showAddForm && (
              <TouchableOpacity
                style={styles.addTeacherBtn}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.88}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.8} />
                <Text style={styles.addTeacherBtnText}>Register New</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* ── EXPANDABLE REGISTRATION FORM ── */}
            {showAddForm && (
              <View style={styles.formContainer}>
                <View style={styles.formHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.formIconBox}>
                      <UserCheck size={18} color="#FBBF24" />
                    </View>
                    <View>
                      <Text style={styles.formTitle}>Register Sunday School Faculty</Text>
                      <Text style={styles.formSubtitle}>Link an existing church member or enter new details</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setShowAddForm(false)} style={styles.closeFormBtn}>
                    <X size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                {/* Section 1: Member Identity */}
                <View style={styles.formSection}>
                  <Text style={styles.sectionLabel}>1. CHURCH MEMBER LOOKUP & IDENTITY</Text>

                  {selectedMemberId ? (
                    <View style={styles.selectedMemberCard}>
                      <View style={styles.selectedMemberAvatar}>
                        <Check size={16} color="#10B981" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.selectedMemberName}>{newName}</Text>
                        <Text style={styles.selectedMemberMeta}>Linked Registered Church Member</Text>
                      </View>
                      <TouchableOpacity onPress={handleClearSelection} style={styles.clearSelectionBtn}>
                        <Text style={styles.clearSelectionText}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ position: 'relative', zIndex: 10 }}>
                      <View style={styles.inputSearchBox}>
                        <Search size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                        <TextInput
                          style={styles.inputSearch}
                          value={newName}
                          onChangeText={handleSearchMembers}
                          placeholder="Search registered members or type full name..."
                          placeholderTextColor="#6B7280"
                        />
                        {searchingMembers && <ActivityIndicator size="small" color="#FBBF24" />}
                      </View>

                      {/* Dropdown Suggestions */}
                      {showMemberDropdown && memberResults.length > 0 && (
                        <View style={styles.dropdownList}>
                          <Text style={styles.dropdownHeader}>EXISTING CHURCH MEMBERS (TAP TO SELECT):</Text>
                          {memberResults.map(m => {
                            const displayName = (m.name || `${m.firstName || ''} ${m.lastName || ''}`).trim();
                            const phone = m.phone || m.mobileNumber || m.phoneNumber || 'No phone recorded';
                            return (
                              <TouchableOpacity
                                key={m.id}
                                style={styles.dropdownItem}
                                onPress={() => handleSelectMember(m)}
                              >
                                <View style={styles.dropdownAvatar}>
                                  <Text style={styles.dropdownAvatarText}>{displayName.charAt(0)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.dropdownItemName}>{displayName}</Text>
                                  <Text style={styles.dropdownItemPhone}>{phone}</Text>
                                </View>
                                <View style={styles.selectPill}>
                                  <Text style={styles.selectPillText}>Select</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}

                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.inputLabel}>Mobile / WhatsApp Number *</Text>
                    <TextInput
                      style={styles.inputField}
                      value={newPhone}
                      onChangeText={setNewPhone}
                      keyboardType="phone-pad"
                      placeholder="e.g. +91 98765 43210"
                      placeholderTextColor="#6B7280"
                    />
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.inputLabel}>Email Address (Optional)</Text>
                    <TextInput
                      style={styles.inputField}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      keyboardType="email-address"
                      placeholder="teacher@rhema.church"
                      placeholderTextColor="#6B7280"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Section 2: Role & Class Assignment */}
                <View style={styles.formSection}>
                  <Text style={styles.sectionLabel}>2. MINISTRY ROLE & ASSIGNED CLASSROOM</Text>

                  <Text style={styles.inputLabel}>Faculty Role:</Text>
                  <View style={styles.roleChipsRow}>
                    {[
                      { key: 'lead_teacher', label: 'Lead Teacher' },
                      { key: 'assistant_teacher', label: 'Assistant Teacher' },
                      { key: 'volunteer', label: 'Volunteer / Helper' },
                    ].map(r => (
                      <TouchableOpacity
                        key={r.key}
                        style={[styles.roleChip, newRole === r.key && styles.roleChipActive]}
                        onPress={() => setNewRole(r.key as any)}
                      >
                        <Text style={[styles.roleChipText, newRole === r.key && styles.roleChipTextActive]}>
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Assigned Sunday School Tier:</Text>
                  <View style={styles.tierSelectorGrid}>
                    {(['nursery', 'beginners', 'primary', 'junior', 'teens'] as KidsClassTier[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.tierCard, newTier === t && styles.tierCardActive]}
                        onPress={() => setNewTier(t)}
                      >
                        <Text style={[styles.tierCardTitle, newTier === t && styles.tierCardTitleActive]}>
                          {tierNames[t].split(' ')[0]}
                        </Text>
                        <Text style={[styles.tierCardSub, newTier === t && styles.tierCardSubActive]}>
                          {tierNames[t].split('(')[1]?.replace(')', '') || t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.formActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      handleClearSelection();
                      setShowAddForm(false);
                    }}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                    onPress={handleAddTeacher}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <Text style={styles.submitBtnText}>Save Faculty Member</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── TEACHER ROSTER LIST ── */}
            {filteredTeachers.length === 0 ? (
              <View style={styles.emptyState}>
                <Users size={36} color="#6B7280" />
                <Text style={styles.emptyTitle}>No Faculty Records Found</Text>
                <Text style={styles.emptySub}>
                  Register Sunday School teachers and volunteers to assign them to classrooms.
                </Text>
              </View>
            ) : (
              <View style={styles.teachersGrid}>
                {filteredTeachers.map(teacher => {
                  const isPresent = todayAttendance.some(a => a.teacherDocId === teacher.id);
                  const isLead = teacher.role === 'lead_teacher';
                  const isVolunteer = teacher.role === 'volunteer';

                  return (
                    <View key={teacher.id} style={styles.teacherCard}>
                      <View style={styles.teacherCardTop}>
                        <View style={[styles.avatarBox, isPresent && styles.avatarBoxPresent]}>
                          <Text style={styles.avatarText}>{teacher.name.charAt(0)}</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={styles.nameHeaderRow}>
                            <Text style={styles.teacherName}>{teacher.name}</Text>
                            <View style={[styles.dutyPill, isPresent ? styles.dutyPillPresent : styles.dutyPillScheduled]}>
                              <Text style={[styles.dutyPillText, isPresent ? styles.dutyPillTextPresent : styles.dutyPillTextScheduled]}>
                                {isPresent ? 'On Duty Today ✓' : 'Scheduled'}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.roleTagRow}>
                            <View style={[styles.roleTag, isLead ? styles.roleTagLead : isVolunteer ? styles.roleTagVol : styles.roleTagAsst]}>
                              <Text style={styles.roleTagText}>
                                {isLead ? 'Lead Teacher' : isVolunteer ? 'Volunteer Helper' : 'Assistant Teacher'}
                              </Text>
                            </View>
                            <Text style={styles.classLabel}>{teacher.assignedClassName}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Contact & Status Meta */}
                      <View style={styles.teacherCardBottom}>
                        <View style={styles.contactDetailsCol}>
                          {teacher.phone ? (
                            <TouchableOpacity
                              style={styles.contactItem}
                              onPress={() => Linking.openURL(`tel:${teacher.phone}`)}
                            >
                              <Phone size={13} color="#10B981" />
                              <Text style={styles.contactItemText}>{teacher.phone}</Text>
                            </TouchableOpacity>
                          ) : null}
                          {teacher.email ? (
                            <View style={styles.contactItem}>
                              <Mail size={12} color="#94A3B8" />
                              <Text style={[styles.contactItemText, { color: '#94A3B8' }]}>{teacher.email}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.cardActionsRow}>
                          <TouchableOpacity
                            style={styles.deleteTeacherBtn}
                            onPress={() => handleDelete(teacher)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={15} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A', // Premium Navy Slate
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    borderTopWidth: 1.5,
    borderColor: '#1E293B',
    maxHeight: '94%',
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  primaryBadge: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 1.2,
  },
  countBadge: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#34D399',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
    lineHeight: 18,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterPillText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  addTeacherBtn: {
    backgroundColor: '#1E40AF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  addTeacherBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 14,
  },
  formContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#334155',
    gap: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  formIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  formSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  closeFormBtn: {
    padding: 4,
  },
  formSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#60A5FA',
    letterSpacing: 1,
  },
  inputSearchBox: {
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputSearch: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    padding: 0,
  },
  dropdownList: {
    backgroundColor: '#0B1329',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    marginTop: 6,
    padding: 8,
    maxHeight: 220,
    elevation: 8,
  },
  dropdownHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  dropdownAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  dropdownItemName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownItemPhone: {
    color: '#94A3B8',
    fontSize: 11,
  },
  selectPill: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  selectPillText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
  },
  selectedMemberCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedMemberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedMemberName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedMemberMeta: {
    color: '#34D399',
    fontSize: 11,
  },
  clearSelectionBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearSelectionText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 4,
  },
  inputField: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#FFFFFF',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  roleChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#60A5FA',
  },
  roleChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    textAlign: 'center',
  },
  roleChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tierSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tierCard: {
    width: '31%',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  tierCardActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#60A5FA',
  },
  tierCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  tierCardTitleActive: {
    color: '#93C5FD',
    fontWeight: '800',
  },
  tierCardSub: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  tierCardSubActive: {
    color: '#BFDBFE',
  },
  formActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#334155',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 2,
    height: 44,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 280,
  },
  teachersGrid: {
    gap: 10,
  },
  teacherCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  teacherCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBoxPresent: {
    backgroundColor: '#065F46',
    borderWidth: 1.5,
    borderColor: '#34D399',
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  nameHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teacherName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  dutyPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dutyPillPresent: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  dutyPillScheduled: {
    backgroundColor: '#334155',
  },
  dutyPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dutyPillTextPresent: {
    color: '#34D399',
  },
  dutyPillTextScheduled: {
    color: '#94A3B8',
  },
  roleTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleTagLead: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  roleTagAsst: {
    backgroundColor: 'rgba(251, 191, 36, 0.18)',
  },
  roleTagVol: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  classLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  teacherCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  contactDetailsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contactItemText: {
    fontSize: 11,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pinBadgeText: {
    fontSize: 10,
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteTeacherBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
