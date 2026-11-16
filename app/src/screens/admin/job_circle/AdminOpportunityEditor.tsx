import React, { useState } from 'react';
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
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { useAdminTheme, createAdminThemedStyles } from '../../../utils/adminThemeHelper';
import JobCircleService from '../../../services/JobCircleService';
import {
  JobOpportunity,
  JobOpportunityType,
  JobCompensationType,
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

const ROLE_TYPES: { label: string; value: JobOpportunityType }[] = [
  { label: 'Full-Time Paid Ministry', value: 'full_time_paid' },
  { label: 'Part-Time Paid Ministry', value: 'part_time_paid' },
  { label: 'Volunteer Service (Unpaid)', value: 'volunteer' },
  { label: 'Ministry Service', value: 'ministry_service' },
  { label: 'Internship', value: 'internship' },
];

const COMPENSATION_TYPES: { label: string; value: JobCompensationType }[] = [
  { label: 'Unpaid / Voluntary', value: 'unpaid' },
  { label: 'Monthly Salary', value: 'salary' },
  { label: 'Honorarium / Stipend', value: 'stipend' },
];

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

  const [title, setTitle] = useState(editingOpp?.title || '');
  const [categoryId, setCategoryId] = useState(editingOpp?.categoryId || DEFAULT_MINISTRY_CATEGORIES[0].id);
  const [description, setDescription] = useState(editingOpp?.description || '');
  const [location, setLocation] = useState(editingOpp?.location || 'Rhema Main Sanctuary');
  const [timeCommitment, setTimeCommitment] = useState(editingOpp?.timeCommitment || 'Sundays (8:00 AM - 1:00 PM)');
  const [opportunityType, setOpportunityType] = useState<JobOpportunityType>(editingOpp?.opportunityType || 'volunteer');
  const [compensationType, setCompensationType] = useState<JobCompensationType>(editingOpp?.compensationType || 'unpaid');
  const [compensationDetails, setCompensationDetails] = useState(editingOpp?.compensationDetails || '');

  // Modals for selection
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [roleTypeModalVisible, setRoleTypeModalVisible] = useState(false);
  const [compTypeModalVisible, setCompTypeModalVisible] = useState(false);

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

  const [saving, setSaving] = useState(false);
  const selectedCategoryObj = DEFAULT_MINISTRY_CATEGORIES.find(c => c.id === categoryId) || DEFAULT_MINISTRY_CATEGORIES[0];

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

  const handleSave = async (isPublish: boolean) => {
    if (!title.trim()) {
      Alert.alert('Required Field', 'Please enter a Position Title.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Required Field', 'Please enter a Job Description.');
      return;
    }

    try {
      setSaving(true);
      const cleanResponsibilities = responsibilities.map(r => r.trim()).filter(Boolean);
      const cleanSkills = requiredSkills.map(s => s.trim()).filter(Boolean);

      if (editingOpp) {
        await JobCircleService.updateOpportunity(churchId, editingOpp.id, {
          title: title.trim(),
          categoryId: selectedCategoryObj.id,
          categoryName: selectedCategoryObj.name,
          description: description.trim(),
          location: location.trim(),
          timeCommitment: timeCommitment.trim(),
          opportunityType,
          compensationType,
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
          location: location.trim(),
          timeCommitment: timeCommitment.trim(),
          opportunityType,
          compensationType,
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
      {/* ── HERO HEADER (Exact Same Design As Daily Promise Editor) ── */}
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
        {/* ── CARD 1: BASIC INFORMATION ── */}
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

            {/* Position Title */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Position Title *</Text>
              <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight]}>
                <TextInput
                  style={[styles.inputText, { color: primaryText }]}
                  placeholder="e.g. Associate Pastor, Worship Director, Media Lead"
                  placeholderTextColor={secondaryText}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
            </View>

            {/* Ministry Category Dropdown */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Ministry Category *</Text>
              <TouchableOpacity
                style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { justifyContent: 'space-between' }]}
                onPress={() => setCategoryModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.inputText, { color: primaryText }]}>
                  {selectedCategoryObj.name} ({selectedCategoryObj.nameTelugu})
                </Text>
                <ChevronDown size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Description */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Calling & Job Description *</Text>
              <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { minHeight: 96, alignItems: 'flex-start' }]}>
                <TextInput
                  style={[styles.inputText, { color: primaryText, minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder="Describe the church calling, primary duties, team atmosphere..."
                  placeholderTextColor={secondaryText}
                  multiline
                  numberOfLines={4}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── CARD 2: CLASSIFICATION & COMPENSATION ── */}
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

            {/* Role Type */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Opportunity Type</Text>
              <TouchableOpacity
                style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { justifyContent: 'space-between' }]}
                onPress={() => setRoleTypeModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.inputText, { color: primaryText }]}>
                  {ROLE_TYPES.find(r => r.value === opportunityType)?.label || opportunityType}
                </Text>
                <ChevronDown size={16} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Compensation Type */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Compensation Type</Text>
              <TouchableOpacity
                style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { justifyContent: 'space-between' }]}
                onPress={() => setCompTypeModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.inputText, { color: primaryText }]}>
                  {COMPENSATION_TYPES.find(c => c.value === compensationType)?.label || compensationType}
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
                    placeholderTextColor={secondaryText}
                    value={compensationDetails}
                    onChangeText={setCompensationDetails}
                  />
                </View>
              </View>
            )}

            {/* Location */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Location</Text>
              <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight]}>
                <TextInput
                  style={[styles.inputText, { color: primaryText }]}
                  placeholder="e.g. Rhema Main Sanctuary, Youth Center, Online"
                  placeholderTextColor={secondaryText}
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
            </View>

            {/* Time Commitment */}
            <View style={styles.fGroup}>
              <Text style={[styles.fLabel, { color: primaryText }]}>Time Commitment</Text>
              <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight]}>
                <TextInput
                  style={[styles.inputText, { color: primaryText }]}
                  placeholder="e.g. Sundays 8:00 AM - 1:00 PM, 15 hours/week"
                  placeholderTextColor={secondaryText}
                  value={timeCommitment}
                  onChangeText={setTimeCommitment}
                />
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── CARD 3: RESPONSIBILITIES LIST ── */}
        <View style={[styles.sectionCard, isDark ? styles.sectionDark : styles.sectionLight, { marginTop: 14 }]}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']
                : ['#FFFFFF', '#FAF9F6']
            }
            style={styles.sectionInner}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.secHdPill, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <FileText size={14} color={isDark ? '#94A3B8' : '#1E293B'} />
                </View>
                <Text style={[styles.secHdTXT, { color: primaryText }]}>Key Responsibilities</Text>
              </View>
              <TouchableOpacity
                onPress={handleAddResponsibility}
                style={[styles.smallAddBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
              >
                <Plus size={13} color={isDark ? '#000000' : '#FFFFFF'} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#000000' : '#FFFFFF', marginLeft: 4 }}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>

            {responsibilities.map((resp, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { flex: 1 }]}>
                  <TextInput
                    style={[styles.inputText, { color: primaryText }]}
                    placeholder={`Responsibility #${idx + 1}`}
                    placeholderTextColor={secondaryText}
                    value={resp}
                    onChangeText={t => handleUpdateResponsibility(t, idx)}
                  />
                </View>
                {responsibilities.length > 1 && (
                  <TouchableOpacity onPress={() => handleRemoveResponsibility(idx)} style={{ padding: 6 }}>
                    <Trash2 size={18} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </LinearGradient>
        </View>

        {/* ── CARD 4: REQUIRED SKILLS ── */}
        <View style={[styles.sectionCard, isDark ? styles.sectionDark : styles.sectionLight, { marginTop: 14 }]}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']
                : ['#FFFFFF', '#FAF9F6']
            }
            style={styles.sectionInner}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.secHdPill, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <CheckCircle2 size={14} color={isDark ? '#94A3B8' : '#1E293B'} />
                </View>
                <Text style={[styles.secHdTXT, { color: primaryText }]}>Required Skills & Calling</Text>
              </View>
              <TouchableOpacity
                onPress={handleAddSkill}
                style={[styles.smallAddBtn, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
              >
                <Plus size={13} color={isDark ? '#000000' : '#FFFFFF'} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#000000' : '#FFFFFF', marginLeft: 4 }}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>

            {requiredSkills.map((sk, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <View style={[styles.inputWrap, isDark ? styles.inputWrapDark : styles.inputWrapLight, { flex: 1 }]}>
                  <TextInput
                    style={[styles.inputText, { color: primaryText }]}
                    placeholder={`Skill #${idx + 1} (e.g. Sound Engineering, Keyboard)`}
                    placeholderTextColor={secondaryText}
                    value={sk}
                    onChangeText={t => handleUpdateSkill(t, idx)}
                  />
                </View>
                {requiredSkills.length > 1 && (
                  <TouchableOpacity onPress={() => handleRemoveSkill(idx)} style={{ padding: 6 }}>
                    <Trash2 size={18} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </LinearGradient>
        </View>

        {/* ── 5. BOTTOM ACTION BUTTONS (Exact Match to Daily Promise Editor) ── */}
        <View style={styles.footerBtnRow}>
          {/* Primary: Save & Publish Now */}
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

      {/* Category Selection Modal */}
      <Modal visible={categoryModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCategoryModalVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <Text style={[styles.modalTitle, { color: primaryText }]}>Select Ministry Category</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {DEFAULT_MINISTRY_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.modalOption, categoryId === cat.id && { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
                  onPress={() => {
                    setCategoryId(cat.id);
                    setCategoryModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionTxt, { color: primaryText }, categoryId === cat.id && { fontWeight: '700' }]}>
                    {cat.name} ({cat.nameTelugu})
                  </Text>
                  {categoryId === cat.id && <Check size={18} color="#1a2d5a" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Role Type Modal */}
      <Modal visible={roleTypeModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRoleTypeModalVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <Text style={[styles.modalTitle, { color: primaryText }]}>Select Opportunity Type</Text>
            {ROLE_TYPES.map(rt => (
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

      {/* Compensation Type Modal */}
      <Modal visible={compTypeModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCompTypeModalVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface }]}>
            <Text style={[styles.modalTitle, { color: primaryText }]}>Select Compensation</Text>
            {COMPENSATION_TYPES.map(ct => (
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

    // ── SECTION CARDS (Exact match to AdminPromiseEditor) ──
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
    smallAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
    },

    // ── FOOTER BUTTONS (Exact match to AdminPromiseEditor) ──
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
  })
);
