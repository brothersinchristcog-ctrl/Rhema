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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { useTheme } from '../../../context/ThemeContext';
import { Colors } from '../../../theme/Theme';
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

export default function AdminOpportunityEditor({ navigation, route }: AdminOpportunityEditorProps) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { colors, currentThemeOption } = useTheme();
  const theme = {
    bg: colors.bgSecondary,
    surface: colors.bgPrimary,
    text: colors.textPrimary,
    textSecondary: colors.textSecondary,
    border: colors.border,
    accent: colors.accent,
    headerGradient: currentThemeOption?.headerGradient || ['#1a2d5a', '#2c3e6b'],
  };
  const churchId = activeChurch?.id || 'rhema';

  const editingOpp = route.params?.opportunity;

  const [title, setTitle] = useState(editingOpp?.title || '');
  const [categoryId, setCategoryId] = useState(editingOpp?.categoryId || DEFAULT_MINISTRY_CATEGORIES[0].id);
  const [description, setDescription] = useState(editingOpp?.description || '');
  const [location, setLocation] = useState(editingOpp?.location || 'Rhema Main Sanctuary');
  const [timeCommitment, setTimeCommitment] = useState(editingOpp?.timeCommitment || 'Sundays (8am - 1pm)');
  const [opportunityType, setOpportunityType] = useState<JobOpportunityType>(editingOpp?.opportunityType || 'volunteer');
  const [compensationType, setCompensationType] = useState<JobCompensationType>(editingOpp?.compensationType || 'unpaid');
  const [compensationDetails, setCompensationDetails] = useState(editingOpp?.compensationDetails || '');

  // Responsibilities & Skills dynamic lists
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

  const handleSave = async (autoApprove: boolean) => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Required Fields', 'Please provide a title and description.');
      return;
    }

    try {
      setSaving(true);
      const cat = DEFAULT_MINISTRY_CATEGORIES.find(c => c.id === categoryId) || DEFAULT_MINISTRY_CATEGORIES[0];
      const cleanResponsibilities = responsibilities.map(r => r.trim()).filter(Boolean);
      const cleanSkills = requiredSkills.map(s => s.trim()).filter(Boolean);

      if (editingOpp) {
        await JobCircleService.updateOpportunity(churchId, editingOpp.id, {
          title: title.trim(),
          categoryId: cat.id,
          categoryName: cat.name,
          description: description.trim(),
          location: location.trim(),
          timeCommitment: timeCommitment.trim(),
          opportunityType,
          compensationType,
          compensationDetails: compensationDetails.trim(),
          responsibilities: cleanResponsibilities,
          requiredSkills: cleanSkills,
          status: autoApprove ? 'approved' : editingOpp.status,
        });
      } else {
        await JobCircleService.createOpportunity(churchId, {
          churchId,
          title: title.trim(),
          categoryId: cat.id,
          categoryName: cat.name,
          description: description.trim(),
          responsibilities: cleanResponsibilities,
          requiredSkills: cleanSkills,
          location: location.trim(),
          timeCommitment: timeCommitment.trim(),
          opportunityType,
          compensationType,
          compensationDetails: compensationDetails.trim(),
          status: autoApprove ? 'approved' : 'pending',
          createdById: user?.uid || 'admin',
          createdByName: member?.name || user?.displayName || 'Admin',
        });
      }

      Alert.alert('Success', `Opportunity ${editingOpp ? 'updated' : 'created'} successfully!`);
      navigation.goBack();
    } catch (err: any) {
      console.error('Error saving opportunity:', err);
      Alert.alert('Error', err.message || 'Could not save opportunity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <LinearGradient
        colors={theme.headerGradient || ['#1a2d5a', '#2c3e6b']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <ArrowLeft size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {editingOpp ? 'Edit Opportunity' : 'Post Ministry Opportunity'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}>
        {/* Basic Info */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>Position Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. Associate Pastor, Lead Keyboardist, Sound Engineer"
            placeholderTextColor={theme.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 14 }]}>Ministry Category *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
            {DEFAULT_MINISTRY_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.catChip,
                  categoryId === cat.id
                    ? { backgroundColor: theme.accent || Colors.primary }
                    : { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1 },
                ]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text style={{ color: categoryId === cat.id ? '#fff' : theme.text, fontSize: 12, fontWeight: '600' }}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 14 }]}>Description *</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            placeholder="Detailed description of the calling and responsibilities..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Opportunity Type & Compensation */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 16 }]}>
          <Text style={[styles.sectionHeading, { color: theme.text }]}>Classification & Commitment</Text>

          <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 10 }]}>Role Type</Text>
          <View style={styles.chipsRow}>
            {(
              [
                { id: 'full_time_paid', label: 'Full-Time Paid' },
                { id: 'part_time_paid', label: 'Part-Time Paid' },
                { id: 'volunteer', label: 'Volunteer' },
                { id: 'ministry_service', label: 'Ministry Service' },
                { id: 'internship', label: 'Internship' },
              ] as const
            ).map(t => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.typeChip,
                  opportunityType === t.id
                    ? { backgroundColor: theme.accent || Colors.primary }
                    : { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1 },
                ]}
                onPress={() => {
                  setOpportunityType(t.id);
                  if (t.id === 'volunteer') setCompensationType('unpaid');
                  else if (compensationType === 'unpaid') setCompensationType('salary');
                }}
              >
                <Text style={{ color: opportunityType === t.id ? '#fff' : theme.text, fontSize: 12 }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 14 }]}>Compensation</Text>
          <View style={styles.chipsRow}>
            {(['unpaid', 'stipend', 'salary'] as const).map(c => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.typeChip,
                  compensationType === c
                    ? { backgroundColor: Colors.warning }
                    : { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1 },
                ]}
                onPress={() => setCompensationType(c)}
              >
                <Text style={{ color: compensationType === c ? '#fff' : theme.text, fontSize: 12, fontWeight: '600' }}>
                  {c.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {compensationType !== 'unpaid' && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Salary / Stipend Details</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. ₹25,000 / month or Honorarium provided"
                placeholderTextColor={theme.textSecondary}
                value={compensationDetails}
                onChangeText={setCompensationDetails}
              />
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 14 }]}>Location</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. Main Church Campus, Youth Center, Online"
            placeholderTextColor={theme.textSecondary}
            value={location}
            onChangeText={setLocation}
          />

          <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 14 }]}>Time Commitment</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            placeholder="e.g. 10 hours/week, Sundays 8am - 1pm"
            placeholderTextColor={theme.textSecondary}
            value={timeCommitment}
            onChangeText={setTimeCommitment}
          />
        </View>

        {/* Responsibilities */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>Key Responsibilities</Text>
            <TouchableOpacity onPress={handleAddResponsibility} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Plus size={16} color={theme.accent || Colors.primary} />
              <Text style={{ color: theme.accent || Colors.primary, fontWeight: '600', marginLeft: 4 }}>Add</Text>
            </TouchableOpacity>
          </View>
          {responsibilities.map((resp, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder={`Responsibility #${idx + 1}`}
                placeholderTextColor={theme.textSecondary}
                value={resp}
                onChangeText={t => handleUpdateResponsibility(t, idx)}
              />
              {responsibilities.length > 1 && (
                <TouchableOpacity onPress={() => handleRemoveResponsibility(idx)}>
                  <Trash2 size={18} color={Colors.error} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Required Skills */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>Required Skills & Calling</Text>
            <TouchableOpacity onPress={handleAddSkill} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Plus size={16} color={theme.accent || Colors.primary} />
              <Text style={{ color: theme.accent || Colors.primary, fontWeight: '600', marginLeft: 4 }}>Add</Text>
            </TouchableOpacity>
          </View>
          {requiredSkills.map((sk, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder={`Skill #${idx + 1} (e.g. Keyboard, Live Sound, Preaching)`}
                placeholderTextColor={theme.textSecondary}
                value={sk}
                onChangeText={t => handleUpdateSkill(t, idx)}
              />
              {requiredSkills.length > 1 && (
                <TouchableOpacity onPress={() => handleRemoveSkill(idx)}>
                  <Trash2 size={18} color={Colors.error} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            style={[styles.publishBtn, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
            onPress={() => handleSave(false)}
            disabled={saving}
          >
            <Text style={{ color: theme.text, fontWeight: '600' }}>Save Draft / Pending</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.publishBtn, { backgroundColor: theme.accent || Colors.primary, flex: 2 }]}
            onPress={() => handleSave(true)}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>Publish Immediately</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  iconBtn: { padding: 8 },
  scrollContent: { padding: 16 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1 },
  sectionHeading: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textArea: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, textAlignVertical: 'top' },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  publishBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
