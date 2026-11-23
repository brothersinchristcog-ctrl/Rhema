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
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  X,
  Plus,
  UserCheck,
  Phone,
  Mail,
  Trash2,
  Users,
  Search,
  Check,
  ShieldCheck,
  BookOpen,
} from 'lucide-react-native';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import {
  KidsTeacherRecord,
  KidsClassTier,
  KidsTeacherRole,
} from '../../../../types/KidsMinistryTypes';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';

interface AdminTeachersModalProps {
  visible: boolean;
  teachers: KidsTeacherRecord[];
  todayAttendance: any[];
  churchId: string;
  onClose: () => void;
}

const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DB2777', '#0891B2'];

export default function AdminTeachersModal({
  visible,
  teachers,
  todayAttendance,
  churchId,
  onClose,
}: AdminTeachersModalProps) {
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
    barStyle,
  } = useAdminTheme();

  const placeholderColor = isDark ? '#64748B' : '#94A3B8';
  const blueAccent = isDark ? '#60A5FA' : '#2563EB';
  const emeraldAccent = isDark ? '#34D399' : '#059669';
  const violetAccent = isDark ? '#A78BFA' : '#7C3AED';

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
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const tierNames: Record<KidsClassTier, string> = {
    nursery: 'Nursery Angels (0-2 yrs)',
    beginners: 'Beginners Kingdom (3-5 yrs)',
    primary: 'Primary Stars (6-8 yrs)',
    junior: 'Junior Champions (9-12 yrs)',
    teens: 'Teens for Christ (13-17 yrs)',
    mixed: 'Mixed Age Group (All Ages)',
  };

  const handleSearchMembers = async (text: string) => {
    setNewName(text);
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
      Alert.alert(
        'Missing Required Fields',
        'Please enter or select the faculty member’s name and phone number.'
      );
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

      Alert.alert(
        'Faculty Registered',
        `${newName.trim()} has been added to the Sunday School roster.`
      );
      handleClearSelection();
      setShowAddForm(false);
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not register faculty member.');
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
              Alert.alert('Error', e?.message || 'Could not delete teacher.');
            }
          },
        },
      ]
    );
  };

  const teacherCount = teachers.filter(
    t => t.role === 'lead_teacher' || t.role === 'assistant_teacher'
  ).length;
  const volunteerCount = teachers.filter(t => t.role === 'volunteer').length;

  const filteredTeachers = teachers.filter(t => {
    if (activeSubTab === 'teachers') {
      return t.role === 'lead_teacher' || t.role === 'assistant_teacher';
    }
    if (activeSubTab === 'volunteers') return t.role === 'volunteer';
    return true;
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.safeRoot, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* Clean Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={styles.badgeRow}>
                <View style={[styles.primaryBadge, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' }]}>
                  <Text style={[styles.primaryBadgeText, { color: blueAccent }]}>
                    SUNDAY SCHOOL ROSTER
                  </Text>
                </View>
                <View
                  style={[
                    styles.countBadge,
                    {
                      backgroundColor: isDark ? 'rgba(52, 211, 153, 0.14)' : '#DCFCE7',
                      borderColor: isDark ? 'rgba(52, 211, 153, 0.3)' : '#BBF7D0',
                    },
                  ]}
                >
                  <Text style={[styles.countBadgeText, { color: emeraldAccent }]}>
                    {teachers.length} Active
                  </Text>
                </View>
              </View>
              <Text style={[styles.headerTitle, { color: primaryText }]}>Faculty & Helpers</Text>
              <Text style={[styles.headerSubtitle, { color: secondaryText }]}>
                Manage Sunday School teachers, volunteers, and classroom assignments.
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: secondarySurface, borderColor }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={19} color={primaryText} />
            </TouchableOpacity>
          </View>

          {/* Segmented Filter Tabs + Clean Action Button Bar */}
          <View style={[styles.controlsBar, { borderBottomColor: borderColor }]}>
            <View style={[styles.segmentedRow, { backgroundColor: secondarySurface, borderColor }]}>
              {(
                [
                  { id: 'all', label: `All (${teachers.length})` },
                  { id: 'teachers', label: `Teachers (${teacherCount})` },
                  { id: 'volunteers', label: `Helpers (${volunteerCount})` },
                ] as const
              ).map(tab => {
                const active = activeSubTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.segmentTab,
                      active && { backgroundColor: blueAccent },
                    ]}
                    onPress={() => setActiveSubTab(tab.id)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.segmentTabText,
                        { color: active ? '#FFFFFF' : secondaryText },
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

            {!showAddForm && (
              <TouchableOpacity
                style={[styles.addFacultyBannerBtn, { backgroundColor: violetAccent }]}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.88}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.8} />
                <Text style={styles.addFacultyBannerText}>Register New Teacher / Helper</Text>
              </TouchableOpacity>
            )}
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.scrollContent}
            >
              {/* ── EXPANDABLE REGISTRATION FORM ── */}
              {showAddForm && (
                <View style={[styles.formContainer, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={[styles.formHeader, { borderBottomColor: borderColor }]}>
                    <View style={styles.formIconBox}>
                      <UserCheck size={18} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.formTitle, { color: primaryText }]}>
                        Register Faculty / Helper
                      </Text>
                      <Text style={[styles.formSubtitle, { color: secondaryText }]}>
                        Search church members or enter details manually
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowAddForm(false)}
                      style={[styles.closeFormBtn, { backgroundColor: secondarySurface }]}
                    >
                      <X size={17} color={secondaryText} />
                    </TouchableOpacity>
                  </View>

                  {/* Section 1: Member Identity */}
                  <View style={styles.formSection}>
                    <Text style={[styles.sectionLabel, { color: blueAccent }]}>
                      1. MEMBER LOOKUP & CONTACT
                    </Text>

                    {selectedMemberId ? (
                      <View
                        style={[
                          styles.selectedMemberCard,
                          { backgroundColor: secondarySurface, borderColor },
                        ]}
                      >
                        <View style={styles.selectedMemberAvatar}>
                          <Check size={16} color="#10B981" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.selectedMemberName, { color: primaryText }]}>
                            {newName}
                          </Text>
                          <Text style={[styles.selectedMemberMeta, { color: emeraldAccent }]}>
                            Linked Registered Church Member
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleClearSelection}
                          style={[
                            styles.clearSelectionBtn,
                            { backgroundColor: cardSurface, borderColor },
                          ]}
                        >
                          <Text style={[styles.clearSelectionText, { color: secondaryText }]}>
                            Change
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ position: 'relative', zIndex: 10 }}>
                        <View
                          style={[
                            styles.inputSearchBox,
                            { backgroundColor: secondarySurface, borderColor },
                          ]}
                        >
                          <Search size={16} color={secondaryText} style={{ marginRight: 8 }} />
                          <TextInput
                            style={[styles.inputSearch, { color: primaryText }]}
                            value={newName}
                            onChangeText={handleSearchMembers}
                            placeholder="Search member or type full name *"
                            placeholderTextColor={placeholderColor}
                          />
                          {searchingMembers && <ActivityIndicator size="small" color="#F59E0B" />}
                        </View>

                        {showMemberDropdown && memberResults.length > 0 && (
                          <View
                            style={[
                              styles.dropdownList,
                              { backgroundColor: cardSurface, borderColor },
                            ]}
                          >
                            <Text style={[styles.dropdownHeader, { color: secondaryText }]}>
                              TAP A MEMBER TO AUTO-FILL
                            </Text>
                            {memberResults.map(m => {
                              const displayName = (
                                m.name || `${m.firstName || ''} ${m.lastName || ''}`
                              ).trim();
                              const phone =
                                m.phone || m.mobileNumber || m.phoneNumber || 'No phone recorded';
                              return (
                                <TouchableOpacity
                                  key={m.id}
                                  style={[styles.dropdownItem, { borderBottomColor: borderColor }]}
                                  onPress={() => handleSelectMember(m)}
                                >
                                  <View style={styles.dropdownAvatar}>
                                    <Text style={styles.dropdownAvatarText}>
                                      {displayName.charAt(0)}
                                    </Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.dropdownItemName, { color: primaryText }]}>
                                      {displayName}
                                    </Text>
                                    <Text style={[styles.dropdownItemPhone, { color: secondaryText }]}>
                                      {phone}
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.selectPill,
                                      { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' },
                                    ]}
                                  >
                                    <Text style={[styles.selectPillText, { color: blueAccent }]}>
                                      Select
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    )}

                    <View>
                      <Text style={[styles.inputLabel, { color: primaryText }]}>
                        Mobile / WhatsApp Number *
                      </Text>
                      <TextInput
                        style={[
                          styles.inputField,
                          { backgroundColor: secondarySurface, borderColor, color: primaryText },
                        ]}
                        value={newPhone}
                        onChangeText={setNewPhone}
                        keyboardType="phone-pad"
                        placeholder="e.g. +91 98765 43210"
                        placeholderTextColor={placeholderColor}
                      />
                    </View>

                    <View>
                      <Text style={[styles.inputLabel, { color: primaryText }]}>
                        Email Address (Optional)
                      </Text>
                      <TextInput
                        style={[
                          styles.inputField,
                          { backgroundColor: secondarySurface, borderColor, color: primaryText },
                        ]}
                        value={newEmail}
                        onChangeText={setNewEmail}
                        keyboardType="email-address"
                        placeholder="teacher@church.org"
                        placeholderTextColor={placeholderColor}
                        autoCapitalize="none"
                      />
                    </View>
                  </View>

                  {/* Section 2: Role & Class Assignment */}
                  <View style={styles.formSection}>
                    <Text style={[styles.sectionLabel, { color: blueAccent }]}>
                      2. MINISTRY ROLE & CLASSROOM
                    </Text>

                    <View style={styles.roleChipsRow}>
                      {[
                        { key: 'lead_teacher', label: 'Lead Teacher' },
                        { key: 'assistant_teacher', label: 'Assistant' },
                        { key: 'volunteer', label: 'Helper' },
                      ].map(r => {
                        const active = newRole === r.key;
                        return (
                          <TouchableOpacity
                            key={r.key}
                            style={[
                              styles.roleChip,
                              { backgroundColor: secondarySurface, borderColor },
                              active && { backgroundColor: blueAccent, borderColor: blueAccent },
                            ]}
                            onPress={() => setNewRole(r.key as KidsTeacherRole)}
                          >
                            <Text
                              style={[
                                styles.roleChipText,
                                { color: active ? '#FFFFFF' : secondaryText },
                                active && { fontWeight: '800' },
                              ]}
                            >
                              {r.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={styles.tierSelectorGrid}>
                      {(
                        [
                          'nursery',
                          'beginners',
                          'primary',
                          'junior',
                          'teens',
                          'mixed',
                        ] as KidsClassTier[]
                      ).map(t => {
                        const active = newTier === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            style={[
                              styles.tierCard,
                              { backgroundColor: secondarySurface, borderColor },
                              active && {
                                backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE',
                                borderColor: blueAccent,
                              },
                            ]}
                            onPress={() => setNewTier(t)}
                          >
                            <Text
                              style={[
                                styles.tierCardTitle,
                                { color: active ? blueAccent : primaryText },
                              ]}
                            >
                              {tierNames[t].split(' ')[0]}
                            </Text>
                            <Text
                              style={[
                                styles.tierCardSub,
                                { color: active ? blueAccent : secondaryText },
                              ]}
                            >
                              {tierNames[t].split('(')[1]?.replace(')', '') || t}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.formActionsRow}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { backgroundColor: secondarySurface, borderColor }]}
                      onPress={() => {
                        handleClearSelection();
                        setShowAddForm(false);
                      }}
                    >
                      <Text style={[styles.cancelBtnText, { color: primaryText }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.submitBtn, { backgroundColor: violetAccent }, submitting && { opacity: 0.7 }]}
                      onPress={handleAddTeacher}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.submitBtnText}>Save Member</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── FACULTY ROSTER LIST ── */}
              {filteredTeachers.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={[styles.emptyIconCircle, { backgroundColor: secondarySurface }]}>
                    <Users size={28} color={secondaryText} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>
                    No Faculty Records Yet
                  </Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
                    Register Sunday School teachers and volunteers to assign them to classrooms.
                  </Text>
                </View>
              ) : (
                <View style={styles.teachersList}>
                  {filteredTeachers.map((teacher, idx) => {
                    const isPresent = todayAttendance.some(a => a.teacherDocId === teacher.id);
                    const isLead = teacher.role === 'lead_teacher';
                    const isVolunteer = teacher.role === 'volunteer';
                    const avatarColor = isPresent
                      ? '#10B981'
                      : AVATAR_COLORS[idx % AVATAR_COLORS.length];

                    const rolePillBg = isLead
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.18)'
                        : '#DBEAFE'
                      : isVolunteer
                      ? isDark
                        ? 'rgba(168, 85, 247, 0.18)'
                        : '#F3E8FF'
                      : isDark
                      ? 'rgba(245, 158, 11, 0.18)'
                      : '#FEF3C7';

                    const rolePillText = isLead
                      ? isDark
                        ? '#93C5FD'
                        : '#1D4ED8'
                      : isVolunteer
                      ? isDark
                        ? '#D8B4FE'
                        : '#7E22CE'
                      : isDark
                      ? '#FDE68A'
                      : '#B45309';

                    return (
                      <View
                        key={teacher.id}
                        style={[
                          styles.teacherCard,
                          { backgroundColor: cardSurface, borderColor },
                          !isDark && styles.cardShadowLight,
                        ]}
                      >
                        <View style={styles.teacherCardTop}>
                          <View style={[styles.avatarBox, { backgroundColor: avatarColor }]}>
                            <Text style={styles.avatarText}>
                              {(teacher.name || 'T').charAt(0).toUpperCase()}
                            </Text>
                          </View>

                          <View style={{ flex: 1, gap: 5 }}>
                            <View style={styles.nameHeaderRow}>
                              <Text style={[styles.teacherName, { color: primaryText }]} numberOfLines={1}>
                                {teacher.name}
                              </Text>
                              <View
                                style={[
                                  styles.statusPill,
                                  {
                                    backgroundColor: isPresent
                                      ? isDark
                                        ? 'rgba(16, 185, 129, 0.16)'
                                        : '#DCFCE7'
                                      : secondarySurface,
                                  },
                                ]}
                              >
                                <ShieldCheck
                                  size={11}
                                  color={isPresent ? emeraldAccent : secondaryText}
                                />
                                <Text
                                  style={[
                                    styles.statusPillText,
                                    { color: isPresent ? emeraldAccent : secondaryText },
                                  ]}
                                >
                                  {isPresent ? 'On Duty' : 'Approved'}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.roleTagsWrap}>
                              <View style={[styles.roleTag, { backgroundColor: rolePillBg }]}>
                                <Text style={[styles.roleTagText, { color: rolePillText }]}>
                                  {isLead
                                    ? 'Lead Teacher'
                                    : isVolunteer
                                    ? 'Helper / Volunteer'
                                    : 'Assistant Teacher'}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.classChip,
                                  { backgroundColor: secondarySurface, borderColor },
                                ]}
                              >
                                <BookOpen size={11} color={secondaryText} />
                                <Text style={[styles.classLabel, { color: secondaryText }]} numberOfLines={1}>
                                  {teacher.assignedClassName || 'Sunday School'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>

                        <View style={[styles.teacherCardBottom, { borderTopColor: borderColor }]}>
                          <View style={styles.contactDetailsCol}>
                            {teacher.phone ? (
                              <TouchableOpacity
                                style={[
                                  styles.callActionPill,
                                  {
                                    backgroundColor: isDark
                                      ? 'rgba(16, 185, 129, 0.14)'
                                      : '#ECFDF5',
                                    borderColor: isDark ? '#065F46' : '#A7F3D0',
                                  },
                                ]}
                                onPress={() => Linking.openURL(`tel:${teacher.phone}`)}
                              >
                                <Phone size={12.5} color={emeraldAccent} />
                                <Text style={[styles.callActionText, { color: emeraldAccent }]}>
                                  {teacher.phone}
                                </Text>
                              </TouchableOpacity>
                            ) : null}

                            {teacher.email ? (
                              <View style={styles.emailRow}>
                                <Mail size={12} color={secondaryText} />
                                <Text
                                  style={[styles.emailText, { color: secondaryText }]}
                                  numberOfLines={1}
                                >
                                  {teacher.email}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.deleteTeacherBtn,
                              {
                                backgroundColor: isDark
                                  ? 'rgba(239, 68, 68, 0.14)'
                                  : '#FEF2F2',
                              },
                            ]}
                            onPress={() => handleDelete(teacher)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={15} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  primaryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  countBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  addFacultyBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
  },
  addFacultyBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 42,
    gap: 14,
  },
  formContainer: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    gap: 14,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  formIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  formSubtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  closeFormBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSection: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  selectedMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedMemberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedMemberName: {
    fontSize: 14,
    fontWeight: '800',
  },
  selectedMemberMeta: {
    fontSize: 11,
    fontWeight: '700',
  },
  clearSelectionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearSelectionText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  inputSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  inputSearch: {
    flex: 1,
    fontSize: 13.5,
  },
  dropdownList: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownHeader: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  dropdownAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  dropdownItemName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  dropdownItemPhone: {
    fontSize: 11,
  },
  selectPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  selectPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  inputField: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13.5,
  },
  roleChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tierSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  tierCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  tierCardSub: {
    fontSize: 10.5,
    marginTop: 2,
  },
  formActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 1.6,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15.5,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  teachersList: {
    gap: 12,
  },
  teacherCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardShadowLight: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  teacherCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  nameHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teacherName: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '800',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  roleTagsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  roleTagText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  classLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  teacherCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  contactDetailsCol: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  callActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  callActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  emailText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  deleteTeacherBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
