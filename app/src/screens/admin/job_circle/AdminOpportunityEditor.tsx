import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Briefcase,
  FileText,
  Send,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  DollarSign,
  ChevronDown,
  Check,
  CheckCircle2,
  X,
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { useAdminTheme, createAdminThemedStyles } from '../../../utils/adminThemeHelper';
import JobCircleService from '../../../services/JobCircleService';
import {
  JobOpportunity,
  JobCategory,
  DEFAULT_MINISTRY_CATEGORIES,
} from '../../../types/jobCircle';

interface AdminOpportunityEditorProps {
  navigation: any;
  route: {
    params?: {
      opportunity?: JobOpportunity;
    };
  };
}

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const DEFAULT_ROLE_TYPES = [
  { label: 'Full-Time Paid Ministry', value: 'full_time_paid' },
  { label: 'Part-Time Paid Ministry', value: 'part_time_paid' },
  { label: 'Volunteer Service (Unpaid)', value: 'volunteer' },
  { label: 'Ministry Service', value: 'ministry_service' },
  { label: 'Internship', value: 'internship' },
];

const DEFAULT_COMPENSATION_TYPES = [
  { label: 'Unpaid / Voluntary', value: 'unpaid' },
  { label: 'Monthly Salary', value: 'salary' },
  { label: 'Honorarium / Stipend', value: 'stipend' },
];

const WEEKDAYS = [
  { label: 'Mon', full: 'Monday' },
  { label: 'Tue', full: 'Tuesday' },
  { label: 'Wed', full: 'Wednesday' },
  { label: 'Thu', full: 'Thursday' },
  { label: 'Fri', full: 'Friday' },
  { label: 'Sat', full: 'Saturday' },
  { label: 'Sun', full: 'Sunday' },
];

interface ScheduleSlot {
  days: string[]; // e.g. ["Monday", "Wednesday"]
  startTime: string; // e.g. "6:00 PM"
  endTime: string; // e.g. "8:00 PM"
}

export default function AdminOpportunityEditor({ navigation, route }: AdminOpportunityEditorProps) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();

  const {
    isDark,
    screenBg,
    cardSurface,
    primaryText,
    secondaryText,
    borderColor: adminBorderColor,
  } = useAdminTheme();

  const churchId = activeChurch?.id || 'rhema';
  const editingOpp = route.params?.opportunity;

  // Basic Info
  const [title, setTitle] = useState(editingOpp?.title || '');
  const [categories, setCategories] = useState<JobCategory[]>(DEFAULT_MINISTRY_CATEGORIES);
  const [categoryId, setCategoryId] = useState(editingOpp?.categoryId || DEFAULT_MINISTRY_CATEGORIES[0].id);
  const [description, setDescription] = useState(editingOpp?.description || '');
  const [location, setLocation] = useState(editingOpp?.location || '');

  // Opportunity Types & Compensation Types with Custom Support
  const [roleTypes, setRoleTypes] = useState(DEFAULT_ROLE_TYPES);
  const [opportunityType, setOpportunityType] = useState<string>(editingOpp?.opportunityType || 'volunteer');
  const [compensationTypes, setCompensationTypes] = useState(DEFAULT_COMPENSATION_TYPES);
  const [compensationType, setCompensationType] = useState<string>(editingOpp?.compensationType || 'unpaid');
  const [compensationDetails, setCompensationDetails] = useState(editingOpp?.compensationDetails || '');

  // Time Commitment Schedule Slots
  const [schedules, setSchedules] = useState<ScheduleSlot[]>(() => {
    if (editingOpp?.timeCommitment) {
      // Keep legacy string representation accessible
      return [{ days: ['Sunday'], startTime: '9:00 AM', endTime: '12:00 PM' }];
    }
    return [{ days: ['Sunday'], startTime: '9:00 AM', endTime: '12:00 PM' }];
  });

  // Time Picker State for Schedule Slot
  const [timePickerTarget, setTimePickerTarget] = useState<{ slotIdx: number; field: 'start' | 'end' } | null>(null);

  // Dynamic Lists for Responsibilities & Skills
  const [responsibilities, setResponsibilities] = useState<string[]>(
    editingOpp?.responsibilities && editingOpp.responsibilities.length > 0
      ? editingOpp.responsibilities
      : ['']
  );
  const [requiredSkills, setRequiredSkills] = useState<string[]>(
    editingOpp?.requiredSkills && editingOpp.requiredSkills.length > 0
      ? editingOpp.requiredSkills
      : ['']
  );

  // Modals for Selection
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [roleTypeModalVisible, setRoleTypeModalVisible] = useState(false);
  const [compTypeModalVisible, setCompTypeModalVisible] = useState(false);

  // Modals for "+ New" Custom Entries
  const [newCategoryModalVisible, setNewCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [newRoleTypeModalVisible, setNewRoleTypeModalVisible] = useState(false);
  const [newRoleTypeName, setNewRoleTypeName] = useState('');
  const [addingRoleType, setAddingRoleType] = useState(false);

  const [newCompTypeModalVisible, setNewCompTypeModalVisible] = useState(false);
  const [newCompTypeName, setNewCompTypeName] = useState('');
  const [addingCompType, setAddingCompType] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategoriesAndConfigs();
  }, [churchId]);

  const loadCategoriesAndConfigs = async () => {
    try {
      const [cats, configs] = await Promise.all([
        JobCircleService.getCategories(churchId),
        JobCircleService.getCustomConfigs(churchId),
      ]);
      setCategories(cats);

      if (configs.opportunityTypes && configs.opportunityTypes.length > 0) {
        setRoleTypes([...DEFAULT_ROLE_TYPES, ...configs.opportunityTypes]);
      }
      if (configs.compensationTypes && configs.compensationTypes.length > 0) {
        setCompensationTypes([...DEFAULT_COMPENSATION_TYPES, ...configs.compensationTypes]);
      }
    } catch (err) {
      console.warn('Error loading custom categories/configs:', err);
    }
  };

  const selectedCategoryObj = categories.find(c => c.id === categoryId) || categories[0] || DEFAULT_MINISTRY_CATEGORIES[0];

  // ── CUSTOM CATEGORY HANDLER ──
  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Required', 'Please enter a category name.');
      return;
    }
    try {
      setAddingCategory(true);
      const created = await JobCircleService.addCategory(churchId, newCategoryName.trim());
      setCategories(prev => [...prev, created]);
      setCategoryId(created.id);
      setNewCategoryName('');
      setNewCategoryModalVisible(false);
      setCategoryModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not add category.');
    } finally {
      setAddingCategory(false);
    }
  };

  // ── CUSTOM ROLE TYPE HANDLER ──
  const handleAddNewRoleType = async () => {
    if (!newRoleTypeName.trim()) {
      Alert.alert('Required', 'Please enter an opportunity type name.');
      return;
    }
    try {
      setAddingRoleType(true);
      const val = await JobCircleService.addCustomOpportunityType(churchId, newRoleTypeName.trim());
      const newEntry = { label: newRoleTypeName.trim(), value: val };
      setRoleTypes(prev => [...prev, newEntry]);
      setOpportunityType(val);
      setNewRoleTypeName('');
      setNewRoleTypeModalVisible(false);
      setRoleTypeModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not add opportunity type.');
    } finally {
      setAddingRoleType(false);
    }
  };

  // ── CUSTOM COMPENSATION TYPE HANDLER ──
  const handleAddNewCompType = async () => {
    if (!newCompTypeName.trim()) {
      Alert.alert('Required', 'Please enter a compensation type name.');
      return;
    }
    try {
      setAddingCompType(true);
      const val = await JobCircleService.addCustomCompensationType(churchId, newCompTypeName.trim());
      const newEntry = { label: newCompTypeName.trim(), value: val };
      setCompensationTypes(prev => [...prev, newEntry]);
      setCompensationType(val);
      setNewCompTypeName('');
      setNewCompTypeModalVisible(false);
      setCompTypeModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not add compensation type.');
    } finally {
      setAddingCompType(false);
    }
  };

  // ── SCHEDULE SLOTS HELPERS ──
  const handleAddScheduleSlot = () => {
    setSchedules([...schedules, { days: ['Sunday'], startTime: '9:00 AM', endTime: '12:00 PM' }]);
  };

  const handleRemoveScheduleSlot = (idx: number) => {
    setSchedules(schedules.filter((_, i) => i !== idx));
  };

  const handleToggleDay = (slotIdx: number, dayFull: string) => {
    const updated = [...schedules];
    const slot = updated[slotIdx];
    if (slot.days.includes(dayFull)) {
      if (slot.days.length > 1) {
        slot.days = slot.days.filter(d => d !== dayFull);
      }
    } else {
      slot.days = [...slot.days, dayFull];
    }
    setSchedules(updated);
  };

  const formatScheduleCommitmentSummary = (): string => {
    if (schedules.length === 0) return 'Flexible schedule';
    return schedules
      .map(s => `${s.days.join(', ')}: ${s.startTime} – ${s.endTime}`)
      .join(' | ');
  };

  // ── TIME PICKER HANDLER ──
  const handleTimeConfirm = (date: Date) => {
    if (!timePickerTarget) return;
    const { slotIdx, field } = timePickerTarget;
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minStr = minutes < 10 ? `0${minutes}` : minutes;
    const formatted = `${hours}:${minStr} ${ampm}`;

    const updated = [...schedules];
    if (field === 'start') {
      updated[slotIdx].startTime = formatted;
    } else {
      updated[slotIdx].endTime = formatted;
    }
    setSchedules(updated);
    setTimePickerTarget(null);
  };

  // ── RESPONSIBILITIES LIST ──
  const handleAddResponsibility = () => {
    setResponsibilities([...responsibilities, '']);
  };

  const handleUpdateResponsibility = (text: string, index: number) => {
    const updated = [...responsibilities];
    updated[index] = text;
    setResponsibilities(updated);
  };

  const handleRemoveResponsibility = (index: number) => {
    setResponsibilities(responsibilities.filter((_, idx) => idx !== index));
  };

  // ── SKILLS LIST ──
  const handleAddSkill = () => {
    setRequiredSkills([...requiredSkills, '']);
  };

  const handleUpdateSkill = (text: string, index: number) => {
    const updated = [...requiredSkills];
    updated[index] = text;
    setRequiredSkills(updated);
  };

  const handleRemoveSkill = (index: number) => {
    setRequiredSkills(requiredSkills.filter((_, idx) => idx !== index));
  };

  // ── SAVE & PUBLISH ──
  const handleSave = async (isPublish: boolean) => {
    if (!title.trim()) {
      Alert.alert('Required Field', 'Please enter a ministry position title.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Required Field', 'Please enter a job description.');
      return;
    }

    try {
      setSaving(true);
      const cleanResponsibilities = responsibilities.map(r => r.trim()).filter(Boolean);
      const cleanSkills = requiredSkills.map(s => s.trim()).filter(Boolean);
      const timeCommitmentSummary = formatScheduleCommitmentSummary();

      if (editingOpp) {
        await JobCircleService.updateOpportunity(churchId, editingOpp.id, {
          title: title.trim(),
          categoryId: selectedCategoryObj.id,
          categoryName: selectedCategoryObj.name,
          description: description.trim(),
          location: location.trim() || 'Rhema Main Campus',
          timeCommitment: timeCommitmentSummary,
          opportunityType: opportunityType as any,
          compensationType: compensationType as any,
          compensationDetails: compensationDetails.trim(),
          responsibilities: cleanResponsibilities,
          requiredSkills: cleanSkills,
          status: isPublish ? 'approved' : 'draft',
        });
      } else {
        await JobCircleService.createOpportunity(churchId, {
          churchId,
          title: title.trim(),
          categoryId: selectedCategoryObj.id,
          categoryName: selectedCategoryObj.name,
          description: description.trim(),
          responsibilities: cleanResponsibilities,
          requiredSkills: cleanSkills,
          location: location.trim() || 'Rhema Main Campus',
          timeCommitment: timeCommitmentSummary,
          opportunityType: opportunityType as any,
          compensationType: compensationType as any,
          compensationDetails: compensationDetails.trim(),
          status: isPublish ? 'approved' : 'draft',
          createdById: user?.uid || 'admin',
          createdByName: member?.name || user?.displayName || 'Admin',
        });
      }

      Alert.alert('Success', `Opportunity ${isPublish ? 'published live' : 'saved as draft'}!`);
      navigation.goBack();
    } catch (err: any) {
      console.error('Error saving opportunity:', err);
      Alert.alert('Error', err.message || 'Could not save opportunity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── HERO HEADER ── */}
      <View
        style={[
          styles.hero,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: 14,
          },
        ]}
      >
        <View style={styles.heroRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.circularBackBtn, { borderColor: isDark ? '#3F3F46' : '#E2E8F0', backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  fontFamily: SERIF,
                },
              ]}
              numberOfLines={1}
            >
              {editingOpp ? 'Edit Opportunity' : 'New Opportunity'}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}>
        {/* ── CARD 1: POSITION DETAILS ── */}
        <View style={[styles.sectionCard, isDark ? styles.sectionDark : styles.sectionLight]}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']
                : ['#FFFFFF', '#FAF9F6']
            }
            style={styles.sectionInner}
          >
            <View style={styles.secHd}>
              <View style={[styles.secHdPill, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                <Briefcase size={14} color={isDark ? '#94A3B8' : '#1E293B'} />
              </View>
              <Text style={[styles.secHdTXT, { color: primaryText }]}>Position Details</Text>
            </View>

            {/* 1. Position Title with Clear Placeholder */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Position Title *</Text>
              <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight]}>
                <TextInput
                  style={[styles.inputText, { color: primaryText }]}
                  placeholder="Enter ministry position title"
                  placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
            </View>

            {/* 2. Ministry Category with "+ New Category" button & English-Only */}
            <View style={styles.fGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={[styles.fLabel, { color: primaryText, marginBottom: 0 }]}>Ministry Category *</Text>
                <TouchableOpacity
                  onPress={() => setNewCategoryModalVisible(true)}
                  style={[styles.smallAddPill, { borderColor: isDark ? '#3F3F46' : '#CBD5E1' }]}
                >
                  <Plus size={11} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
                  <Text style={[styles.smallAddPillTxt, { color: isDark ? '#FFFFFF' : '#1a2d5a' }]}>
                    + New Category
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { justifyContent: 'space-between' }]}
                onPress={() => setCategoryModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.inputText, { color: primaryText }]}>
                  {selectedCategoryObj.name}
                </Text>
                <ChevronDown size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {/* 3. Description */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Calling & Job Description *</Text>
              <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { minHeight: 96, alignItems: 'flex-start' }]}>
                <TextInput
                  style={[styles.inputText, { color: primaryText, minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder="Describe the church calling, primary duties, team atmosphere..."
                  placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                  multiline
                  numberOfLines={4}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── CARD 2: TERMS, COMPENSATION & TIME COMMITMENT ── */}
        <View style={[styles.sectionCard, isDark ? styles.sectionDark : styles.sectionLight, { marginTop: 14 }]}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']
                : ['#FFFFFF', '#FAF9F6']
            }
            style={styles.sectionInner}
          >
            <View style={styles.secHd}>
              <View style={[styles.secHdPill, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                <Clock size={14} color={isDark ? '#94A3B8' : '#1E293B'} />
              </View>
              <Text style={[styles.secHdTXT, { color: primaryText }]}>Terms & Compensation</Text>
            </View>

            {/* Opportunity Type with "+ New" */}
            <View style={styles.fGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={[styles.fLabel, { color: primaryText, marginBottom: 0 }]}>Opportunity Type</Text>
                <TouchableOpacity
                  onPress={() => setNewRoleTypeModalVisible(true)}
                  style={[styles.smallAddPill, { borderColor: isDark ? '#3F3F46' : '#CBD5E1' }]}
                >
                  <Plus size={11} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
                  <Text style={[styles.smallAddPillTxt, { color: isDark ? '#FFFFFF' : '#1a2d5a' }]}>+ New</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { justifyContent: 'space-between' }]}
                onPress={() => setRoleTypeModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.inputText, { color: primaryText }]}>
                  {roleTypes.find(r => r.value === opportunityType)?.label || opportunityType}
                </Text>
                <ChevronDown size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Compensation Type with "+ New" */}
            <View style={styles.fGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={[styles.fLabel, { color: primaryText, marginBottom: 0 }]}>Compensation Type</Text>
                <TouchableOpacity
                  onPress={() => setNewCompTypeModalVisible(true)}
                  style={[styles.smallAddPill, { borderColor: isDark ? '#3F3F46' : '#CBD5E1' }]}
                >
                  <Plus size={11} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
                  <Text style={[styles.smallAddPillTxt, { color: isDark ? '#FFFFFF' : '#1a2d5a' }]}>+ New</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { justifyContent: 'space-between' }]}
                onPress={() => setCompTypeModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.inputText, { color: primaryText }]}>
                  {compensationTypes.find(c => c.value === compensationType)?.label || compensationType}
                </Text>
                <ChevronDown size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Salary Details */}
            {compensationType !== 'unpaid' && (
              <View style={styles.fGroup}>
                <Text style={[styles.fLabel, { color: primaryText }]}>Salary / Honorarium Details</Text>
                <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight]}>
                  <TextInput
                    style={[styles.inputText, { color: primaryText }]}
                    placeholder="e.g. ₹25,000 - ₹35,000 / month, or Ministry Stipend"
                    placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                    value={compensationDetails}
                    onChangeText={setCompensationDetails}
                  />
                </View>
              </View>
            )}

            {/* Location with Clear Placeholder */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Location</Text>
              <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight]}>
                <TextInput
                  style={[styles.inputText, { color: primaryText }]}
                  placeholder="Enter church or ministry location"
                  placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
            </View>

            {/* ── TIME COMMITMENT (Day Selector + Start/End Time Pickers) ── */}
            <View style={[styles.fGroup, { marginTop: 4 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.fLabel, { color: primaryText, marginBottom: 0 }]}>
                  Time Commitment & Schedule
                </Text>
                <TouchableOpacity
                  onPress={handleAddScheduleSlot}
                  style={[styles.smallAddPill, { borderColor: isDark ? '#3F3F46' : '#CBD5E1' }]}
                >
                  <Plus size={11} color={isDark ? '#FFFFFF' : '#1a2d5a'} />
                  <Text style={[styles.smallAddPillTxt, { color: isDark ? '#FFFFFF' : '#1a2d5a' }]}>
                    + Add Schedule
                  </Text>
                </TouchableOpacity>
              </View>

              {schedules.map((slot, sIdx) => (
                <View
                  key={sIdx}
                  style={[
                    styles.scheduleBox,
                    {
                      backgroundColor: isDark ? '#1F1F23' : '#F8FAFC',
                      borderColor: isDark ? '#3F3F46' : '#E2E8F0',
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: primaryText }}>
                      Schedule #{sIdx + 1}
                    </Text>
                    {schedules.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveScheduleSlot(sIdx)} style={{ padding: 4 }}>
                        <Trash2 size={16} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Day Selection Chips (Mon to Sun) */}
                  <Text style={{ fontSize: 11, fontWeight: '600', color: secondaryText, marginBottom: 6 }}>
                    Select Day(s):
                  </Text>
                  <View style={styles.daysRow}>
                    {WEEKDAYS.map(day => {
                      const isSelected = slot.days.includes(day.full);
                      return (
                        <TouchableOpacity
                          key={day.full}
                          style={[
                            styles.dayChip,
                            isSelected
                              ? { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }
                              : { backgroundColor: isDark ? '#27272A' : '#FFFFFF', borderColor: isDark ? '#3F3F46' : '#CBD5E1', borderWidth: 1 },
                          ]}
                          onPress={() => handleToggleDay(sIdx, day.full)}
                        >
                          <Text
                            style={[
                              styles.dayChipTxt,
                              { color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : primaryText },
                              isSelected && { fontWeight: '700' },
                            ]}
                          >
                            {day.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Time Range Pickers */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    {/* Start Time */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: secondaryText, marginBottom: 4 }}>Start Time</Text>
                      <TouchableOpacity
                        style={[styles.timeBtn, { backgroundColor: isDark ? '#27272A' : '#FFFFFF', borderColor: isDark ? '#3F3F46' : '#CBD5E1' }]}
                        onPress={() => setTimePickerTarget({ slotIdx: sIdx, field: 'start' })}
                      >
                        <Clock size={13} color={secondaryText} />
                        <Text style={[styles.timeBtnTxt, { color: primaryText }]}>{slot.startTime}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* End Time */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: secondaryText, marginBottom: 4 }}>End Time</Text>
                      <TouchableOpacity
                        style={[styles.timeBtn, { backgroundColor: isDark ? '#27272A' : '#FFFFFF', borderColor: isDark ? '#3F3F46' : '#CBD5E1' }]}
                        onPress={() => setTimePickerTarget({ slotIdx: sIdx, field: 'end' })}
                      >
                        <Clock size={13} color={secondaryText} />
                        <Text style={[styles.timeBtnTxt, { color: primaryText }]}>{slot.endTime}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Schedule Summary Preview */}
                  <Text style={[styles.scheduleSummary, { color: isDark ? '#34D399' : '#15803d' }]}>
                    ✓ {slot.days.join(', ')} – {slot.startTime} to {slot.endTime}
                  </Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── CARD 3: KEY RESPONSIBILITIES (Fixed Visibility of "+" Button) ── */}
        <View style={[styles.sectionCard, isDark ? styles.sectionDark : styles.sectionLight, { marginTop: 14 }]}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']
                : ['#FFFFFF', '#FAF9F6']
            }
            style={styles.sectionInner}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.secHdPill, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <FileText size={14} color={isDark ? '#94A3B8' : '#1E293B'} />
                </View>
                <Text style={[styles.secHdTXT, { color: primaryText }]}>Key Responsibilities</Text>
              </View>

              {/* Properly Styled & Visible "+" Button */}
              <TouchableOpacity
                onPress={handleAddResponsibility}
                style={[
                  styles.addActionButton,
                  {
                    backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a',
                  },
                ]}
                activeOpacity={0.8}
              >
                <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} />
                <Text style={[styles.addActionButtonTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  Add Responsibility
                </Text>
              </TouchableOpacity>
            </View>

            {responsibilities.map((resp, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { flex: 1 }]}>
                  <TextInput
                    style={[styles.inputText, { color: primaryText }]}
                    placeholder={`e.g. Lead Sunday morning worship team`}
                    placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                    value={resp}
                    onChangeText={t => handleUpdateResponsibility(t, idx)}
                  />
                </View>
                {responsibilities.length > 1 && (
                  <TouchableOpacity onPress={() => handleRemoveResponsibility(idx)} style={styles.deleteBtn}>
                    <Trash2 size={18} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </LinearGradient>
        </View>

        {/* ── CARD 4: REQUIRED SKILLS & CALLING (Fixed Visibility of "+" Button) ── */}
        <View style={[styles.sectionCard, isDark ? styles.sectionDark : styles.sectionLight, { marginTop: 14 }]}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']
                : ['#FFFFFF', '#FAF9F6']
            }
            style={styles.sectionInner}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.secHdPill, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <CheckCircle2 size={14} color={isDark ? '#94A3B8' : '#1E293B'} />
                </View>
                <Text style={[styles.secHdTXT, { color: primaryText }]}>Required Skills & Calling</Text>
              </View>

              {/* Properly Styled & Visible "+" Button */}
              <TouchableOpacity
                onPress={handleAddSkill}
                style={[
                  styles.addActionButton,
                  {
                    backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a',
                  },
                ]}
                activeOpacity={0.8}
              >
                <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} />
                <Text style={[styles.addActionButtonTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  Add Skill
                </Text>
              </TouchableOpacity>
            </View>

            {requiredSkills.map((sk, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { flex: 1 }]}>
                  <TextInput
                    style={[styles.inputText, { color: primaryText }]}
                    placeholder={`e.g. Keyboard / Piano, Sound Mixing, Preaching`}
                    placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                    value={sk}
                    onChangeText={t => handleUpdateSkill(t, idx)}
                  />
                </View>
                {requiredSkills.length > 1 && (
                  <TouchableOpacity onPress={() => handleRemoveSkill(idx)} style={styles.deleteBtn}>
                    <Trash2 size={18} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </LinearGradient>
        </View>

        {/* ── 5. BOTTOM ACTION BUTTONS ── */}
        <View style={styles.footerBtnRow}>
          {/* Primary: Publish Opportunity */}
          <TouchableOpacity
            style={[
              styles.btnSave,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
              },
              saving && { opacity: 0.85 },
            ]}
            onPress={() => handleSave(true)}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
            ) : (
              <Send size={15} color={isDark ? '#000000' : '#FFFFFF'} />
            )}
            <Text style={[styles.btnSaveTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
              {saving ? 'Publishing…' : 'Publish Opportunity'}
            </Text>
          </TouchableOpacity>

          {/* Secondary: Save as Draft */}
          <TouchableOpacity
            style={[
              styles.btnDraft,
              {
                backgroundColor: isDark ? '#27272A' : '#475569',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#334155',
              },
            ]}
            onPress={() => handleSave(false)}
            disabled={saving}
            activeOpacity={0.8}
          >
            <FileText size={15} color="#FFFFFF" />
            <Text style={[styles.btnDraftTxt, { color: '#FFFFFF' }]}>Save as Draft</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── MODAL: Category Selector (English Only) ── */}
      <Modal visible={categoryModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCategoryModalVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, { color: primaryText, marginBottom: 0 }]}>Select Ministry Category</Text>
              <TouchableOpacity onPress={() => setNewCategoryModalVisible(true)}>
                <Text style={{ color: '#1a2d5a', fontSize: 13, fontWeight: '700' }}>+ Add New</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.modalOption, categoryId === cat.id && { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
                  onPress={() => {
                    setCategoryId(cat.id);
                    setCategoryModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionTxt, { color: primaryText }, categoryId === cat.id && { fontWeight: '700' }]}>
                    {cat.name}
                  </Text>
                  {categoryId === cat.id && <Check size={18} color="#1a2d5a" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── MODAL: Create New Category ── */}
      <Modal visible={newCategoryModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <Text style={[styles.modalTitle, { color: primaryText }]}>Add New Ministry Category</Text>
            <TextInput
              style={[styles.inputSingle, { backgroundColor: screenBg, borderColor: adminBorderColor, color: primaryText }]}
              placeholder="e.g. Outreach & Evangelism"
              placeholderTextColor={secondaryText}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.modalSmallBtn, { borderColor: adminBorderColor, borderWidth: 1 }]}
                onPress={() => setNewCategoryModalVisible(false)}
                disabled={addingCategory}
              >
                <Text style={{ color: primaryText, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSmallBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                onPress={handleAddNewCategory}
                disabled={addingCategory}
              >
                {addingCategory ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700' }}>Save Category</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Role Type Selector ── */}
      <Modal visible={roleTypeModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRoleTypeModalVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, { color: primaryText, marginBottom: 0 }]}>Select Opportunity Type</Text>
              <TouchableOpacity onPress={() => setNewRoleTypeModalVisible(true)}>
                <Text style={{ color: '#1a2d5a', fontSize: 13, fontWeight: '700' }}>+ Add New</Text>
              </TouchableOpacity>
            </View>
            {roleTypes.map(rt => (
              <TouchableOpacity
                key={rt.value}
                style={[styles.modalOption, opportunityType === rt.value && { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
                onPress={() => {
                  setOpportunityType(rt.value);
                  if (rt.value === 'volunteer') setCompensationType('unpaid');
                  setRoleTypeModalVisible(false);
                }}
              >
                <Text style={[styles.modalOptionTxt, { color: primaryText }, opportunityType === rt.value && { fontWeight: '700' }]}>
                  {rt.label}
                </Text>
                {opportunityType === rt.value && <Check size={18} color="#1a2d5a" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── MODAL: Create New Role Type ── */}
      <Modal visible={newRoleTypeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <Text style={[styles.modalTitle, { color: primaryText }]}>Add Opportunity Type</Text>
            <TextInput
              style={[styles.inputSingle, { backgroundColor: screenBg, borderColor: adminBorderColor, color: primaryText }]}
              placeholder="e.g. Contract / Consultant"
              placeholderTextColor={secondaryText}
              value={newRoleTypeName}
              onChangeText={setNewRoleTypeName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.modalSmallBtn, { borderColor: adminBorderColor, borderWidth: 1 }]}
                onPress={() => setNewRoleTypeModalVisible(false)}
                disabled={addingRoleType}
              >
                <Text style={{ color: primaryText, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSmallBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                onPress={handleAddNewRoleType}
                disabled={addingRoleType}
              >
                {addingRoleType ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700' }}>Save Type</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Compensation Type Selector ── */}
      <Modal visible={compTypeModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCompTypeModalVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, { color: primaryText, marginBottom: 0 }]}>Select Compensation</Text>
              <TouchableOpacity onPress={() => setNewCompTypeModalVisible(true)}>
                <Text style={{ color: '#1a2d5a', fontSize: 13, fontWeight: '700' }}>+ Add New</Text>
              </TouchableOpacity>
            </View>
            {compensationTypes.map(ct => (
              <TouchableOpacity
                key={ct.value}
                style={[styles.modalOption, compensationType === ct.value && { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
                onPress={() => {
                  setCompensationType(ct.value);
                  setCompTypeModalVisible(false);
                }}
              >
                <Text style={[styles.modalOptionTxt, { color: primaryText }, compensationType === ct.value && { fontWeight: '700' }]}>
                  {ct.label}
                </Text>
                {compensationType === ct.value && <Check size={18} color="#1a2d5a" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── MODAL: Create New Compensation Type ── */}
      <Modal visible={newCompTypeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <Text style={[styles.modalTitle, { color: primaryText }]}>Add Compensation Option</Text>
            <TextInput
              style={[styles.inputSingle, { backgroundColor: screenBg, borderColor: adminBorderColor, color: primaryText }]}
              placeholder="e.g. Travel Allowance Only"
              placeholderTextColor={secondaryText}
              value={newCompTypeName}
              onChangeText={setNewCompTypeName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.modalSmallBtn, { borderColor: adminBorderColor, borderWidth: 1 }]}
                onPress={() => setNewCompTypeModalVisible(false)}
                disabled={addingCompType}
              >
                <Text style={{ color: primaryText, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSmallBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                onPress={handleAddNewCompType}
                disabled={addingCompType}
              >
                {addingCompType ? (
                  <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                  <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700' }}>Save Option</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Native DateTimePickerModal for Time Slots ── */}
      <DateTimePickerModal
        isVisible={timePickerTarget !== null}
        mode="time"
        onConfirm={handleTimeConfirm}
        onCancel={() => setTimePickerTarget(null)}
      />
    </View>
  );
}

const styles = createAdminThemedStyles(
  StyleSheet.create({
    container: { flex: 1 },
    hero: { paddingBottom: 6 },
    heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
    circularBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    heroTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
    scrollContent: { padding: 16 },

    // Section Cards
    sectionCard: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    sectionLight: {
      backgroundColor: '#FFFFFF',
      borderColor: '#94A3B8',
      borderWidth: 1.5,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 14,
      elevation: 4,
    },
    sectionDark: {
      backgroundColor: '#161619',
      borderColor: 'rgba(255, 255, 255, 0.18)',
      borderWidth: 1.5,
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 4,
    },
    sectionInner: {
      padding: 16,
      width: '100%',
    },
    secHd: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#F1F5F9',
      paddingBottom: 10,
    },
    secHdPill: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: '#F1F5F9',
      justifyContent: 'center',
      alignItems: 'center',
    },
    secHdTXT: {
      fontSize: 12.5,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
      flex: 1,
    },
    fGroup: { marginBottom: 14 },
    fLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    inputWrapLight: {
      backgroundColor: '#F1F5F9',
      borderColor: '#94A3B8',
    },
    inputWrapDark: {
      backgroundColor: '#18181B',
      borderColor: '#3F3F46',
    },
    inputText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '500',
    },
    smallAddPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      borderWidth: 1,
      gap: 3,
    },
    smallAddPillTxt: {
      fontSize: 11,
      fontWeight: '700',
    },

    // Schedule Styling
    scheduleBox: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 10,
    },
    daysRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    dayChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    dayChipTxt: {
      fontSize: 11,
    },
    timeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
    },
    timeBtnTxt: {
      fontSize: 12,
      fontWeight: '600',
    },
    scheduleSummary: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 8,
    },

    // Action Buttons in Cards (Fixed + Visibility)
    addActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      gap: 4,
    },
    addActionButtonTxt: {
      fontSize: 11,
      fontWeight: '700',
    },
    deleteBtn: {
      padding: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Footer Buttons
    footerBtnRow: {
      flexDirection: 'column',
      gap: 12,
      marginTop: 20,
      marginBottom: 20,
      width: '100%',
    },
    btnSave: {
      width: '100%',
      borderRadius: 999,
      paddingVertical: 15,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      borderWidth: 1.5,
    },
    btnSaveTxt: {
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    btnDraft: {
      width: '100%',
      borderRadius: 999,
      paddingVertical: 15,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    btnDraftTxt: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.2,
    },

    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      width: '85%',
      borderRadius: 16,
      padding: 18,
      elevation: 8,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 12,
    },
    modalOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    modalOptionTxt: {
      fontSize: 14,
    },
    inputSingle: {
      borderWidth: 1.5,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      marginTop: 4,
    },
    modalSmallBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
);
