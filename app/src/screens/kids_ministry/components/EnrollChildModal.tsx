import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { X, Camera, AlertTriangle, ShieldCheck, UserCheck, Plus, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';
import {
  calculateChildAge,
  getRecommendedClassTier,
  AuthorizedGuardian,
} from '../../../types/KidsMinistryTypes';
import KidsMinistryService from '../../../services/KidsMinistryService';

interface Props {
  visible: boolean;
  onClose: () => void;
  churchId: string;
  member: any;
  existingFamilyMembers?: any[];
  onChildEnrolled?: () => void;
}

const COMMON_ALLERGIES = ['Peanuts', 'Dust / Asthma', 'Dairy', 'Eggs', 'Gluten', 'Penicillin'];
const EMPTY_FAMILY_ARRAY: any[] = [];

export default function EnrollChildModal({
  visible,
  onClose,
  churchId,
  member,
  existingFamilyMembers = EMPTY_FAMILY_ARRAY,
  onChildEnrolled,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('2018-05-15'); // YYYY-MM-DD
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [allergiesList, setAllergiesList] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');

  // Guardians State
  const [guardians, setGuardians] = useState<AuthorizedGuardian[]>([]);
  const [newGuardianName, setNewGuardianName] = useState('');
  const [newGuardianRelation, setNewGuardianRelation] = useState('Mother');
  const [newGuardianPhone, setNewGuardianPhone] = useState('');
  const [showAddGuardian, setShowAddGuardian] = useState(false);

  // Pre-fill guardians based on current user & existing contacts (runs only once when modal is opened)
  useEffect(() => {
    if (!visible || !member) return;
    if (guardians.length > 0) return; // Prevent overwriting or re-render looping

    const parentName = member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Parent';
    const initialGuardians: AuthorizedGuardian[] = [
      {
        id: member.id || 'p1',
        name: parentName,
        relationship: 'Father',
        phone: member.phone || '',
        isPrimaryContact: true,
        canPickup: true,
      },
    ];

    // If existing family contacts have mother/spouse, add as well
    const familyList = existingFamilyMembers || EMPTY_FAMILY_ARRAY;
    const spouse = familyList.find(
      (c: any) =>
        c.relation === 'Wife' ||
        c.relation === 'Mother' ||
        c.Relation === 'Wife' ||
        c.Relation === 'Mother'
    );
    if (spouse) {
      const spouseName = `${spouse.FirstName || spouse.firstName || ''} ${spouse.LastName || spouse.lastName || ''}`.trim() || spouse.Name;
      initialGuardians.push({
        id: spouse.id || spouse.Id || 'p2',
        name: spouseName || 'Mother',
        relationship: 'Mother',
        phone: spouse.Phone || spouse.phone || '',
        isPrimaryContact: false,
        canPickup: true,
      });
    }

    setGuardians(initialGuardians);
  }, [visible, member?.id]);

  // Derived age & class recommendation
  const calculatedAge = calculateChildAge(dob);
  const recommendedTier = getRecommendedClassTier(calculatedAge);

  // Photo Picker
  const handlePickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedPhotoUri(result.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not select photo');
    }
  };

  const toggleAllergy = (allergy: string) => {
    if (allergiesList.includes(allergy)) {
      setAllergiesList(allergiesList.filter(a => a !== allergy));
    } else {
      setAllergiesList([...allergiesList, allergy]);
    }
  };

  const addCustomAllergy = () => {
    if (customAllergy.trim() && !allergiesList.includes(customAllergy.trim())) {
      setAllergiesList([...allergiesList, customAllergy.trim()]);
      setCustomAllergy('');
    }
  };

  const handleAddGuardian = () => {
    if (!newGuardianName.trim() || !newGuardianPhone.trim()) {
      Alert.alert('Missing Info', 'Please enter guardian name and phone number');
      return;
    }
    const g: AuthorizedGuardian = {
      id: `g_${Date.now()}`,
      name: newGuardianName.trim(),
      relationship: newGuardianRelation as any,
      phone: newGuardianPhone.trim(),
      isPrimaryContact: false,
      canPickup: true,
    };
    setGuardians([...guardians, g]);
    setNewGuardianName('');
    setNewGuardianPhone('');
    setShowAddGuardian(false);
  };

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      Alert.alert('Missing Field', 'Please enter child first name');
      return;
    }
    if (!dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Invalid Date', 'Please enter DOB in YYYY-MM-DD format (e.g. 2018-05-15)');
      return;
    }

    try {
      setSubmitting(true);

      let photoUrl = '';
      if (selectedPhotoUri) {
        const ext = selectedPhotoUri.split('.').pop() || 'jpg';
        const storageRef = storage().ref(
          `churches/${churchId}/children/${Date.now()}_child.${ext}`
        );
        await storageRef.putFile(selectedPhotoUri);
        photoUrl = await storageRef.getDownloadURL();
      }

      const parentName =
        member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Parent';

      await KidsMinistryService.registerChild(churchId, {
        familyId: member.accountId || member.id || 'default_family',
        parentMemberId: member.id || '',
        parentName,
        parentPhone: member.phone || '',
        parentEmail: member.email || '',
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob,
        gender,
        photoUrl,
        allergiesList,
        medicalNotes,
        bloodGroup,
        guardians,
        emergencyContact: {
          name: guardians[0]?.name || parentName,
          phone: guardians[0]?.phone || member.phone || '',
          relationship: guardians[0]?.relationship || 'Father',
        },
      });

      Alert.alert(
        'Child Enrolled! 🎉',
        `${firstName} is registered for ${recommendedTier.displayName}! Sunday School custody pass is now active.`,
        [
          {
            text: 'OK',
            onPress: () => {
              if (onChildEnrolled) onChildEnrolled();
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      console.error('Error registering child:', err);
      Alert.alert('Registration Failed', err.message || 'Could not enroll child');
    } finally {
      setSubmitting(false);
    }
  };

  // Pre-fill from existing family member if tapped
  const handleSelectExistingContact = (contact: any) => {
    const rawName = (`${contact.FirstName || contact.firstName || ''} ${contact.LastName || contact.lastName || ''}`.trim()) || contact.Name || '';
    const parts = rawName.split(' ');
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    if (contact.dob) setDob(contact.dob);
    if (contact.gender) {
      const g = contact.gender.toLowerCase();
      if (g === 'female' || contact.relation === 'Daughter') setGender('female');
      else setGender('male');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.titleSerif}>Enroll in Sunday School</Text>
            <Text style={styles.subtitle}>Child Profile & Safeguarding Setup</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Quick Pre-fill from Existing Household if any exist */}
          {existingFamilyMembers.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>DETECTED IN YOUR HOUSEHOLD</Text>
              <Text style={styles.helpText}>Tap a child to auto-fill details:</Text>
              <View style={styles.pillRow}>
                {existingFamilyMembers
                  .filter((c: any) =>
                    ['Son', 'Daughter', 'Child', 'Grandson', 'Granddaughter'].includes(
                      c.relation || c.Relation || ''
                    )
                  )
                  .map((c: any, idx: number) => {
                    const cName = c.FirstName || c.firstName || c.Name || 'Child';
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={styles.prefillChip}
                        onPress={() => handleSelectExistingContact(c)}
                      >
                        <Text style={styles.prefillChipText}>🧒 {cName} ({c.relation || c.Relation})</Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </View>
          )}

          {/* Photo Capture for Face Scan */}
          <View style={styles.photoContainer}>
            <TouchableOpacity style={styles.avatarCircle} onPress={handlePickPhoto}>
              {selectedPhotoUri ? (
                <Image source={{ uri: selectedPhotoUri }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Camera size={28} color="#FBBF24" />
                  <Text style={styles.avatarText}>Add Photo</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.photoHint}>Required for Entrance Face Recognition Kiosk</Text>
          </View>

          {/* Child Identity Details */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>1. CHILD IDENTITY</Text>

            <View style={styles.rowTwo}>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>First Name *</Text>
                <TextInput
                  style={styles.textInput}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="e.g. Samuel"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="e.g. Raj"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>

            {/* DOB & Gender */}
            <View style={styles.rowTwo}>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Date of Birth (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  value={dob}
                  onChangeText={setDob}
                  placeholder="2018-05-15"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.inputLabel}>Gender</Text>
                <View style={styles.genderRow}>
                  <TouchableOpacity
                    style={[styles.genderBtn, gender === 'male' && styles.genderBtnActive]}
                    onPress={() => setGender('male')}
                  >
                    <Text style={[styles.genderBtnText, gender === 'male' && styles.genderBtnTextActive]}>Boy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.genderBtn, gender === 'female' && styles.genderBtnActive]}
                    onPress={() => setGender('female')}
                  >
                    <Text style={[styles.genderBtnText, gender === 'female' && styles.genderBtnTextActive]}>Girl</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Auto-Assigned Class Card */}
            <View style={styles.tierPreviewCard}>
              <View style={styles.tierInfo}>
                <Text style={styles.tierLabel}>Recommended Sunday School Class:</Text>
                <Text style={styles.tierName}>{recommendedTier.displayName}</Text>
                <Text style={styles.tierAge}>Age: {calculatedAge} years ({recommendedTier.ageRange}) · {recommendedTier.roomDefault}</Text>
              </View>
              <ShieldCheck size={26} color="#10B981" />
            </View>
          </View>

          {/* Medical & Allergies */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>2. MEDICAL & ALLERGY ALERTS</Text>
              <AlertTriangle size={14} color="#EF4444" />
            </View>
            <Text style={styles.helpText}>Restricted to assigned teachers for emergency safety:</Text>

            {/* Allergy Chips */}
            <View style={styles.chipsWrap}>
              {COMMON_ALLERGIES.map(allergy => {
                const isSelected = allergiesList.includes(allergy);
                return (
                  <TouchableOpacity
                    key={allergy}
                    style={[styles.allergyChip, isSelected && styles.allergyChipActive]}
                    onPress={() => toggleAllergy(allergy)}
                  >
                    <Text style={[styles.allergyChipText, isSelected && styles.allergyChipTextActive]}>
                      {isSelected ? '✓ ' : ''}{allergy}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Allergy input */}
            <View style={styles.customAllergyRow}>
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={customAllergy}
                onChangeText={setCustomAllergy}
                placeholder="Other allergy / medication..."
                placeholderTextColor="#64748B"
              />
              <TouchableOpacity style={styles.addChipBtn} onPress={addCustomAllergy}>
                <Plus size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.inputLabel}>Medical Notes / Inhaler Details (Optional)</Text>
              <TextInput
                style={[styles.textInput, { height: 60 }]}
                value={medicalNotes}
                onChangeText={setMedicalNotes}
                placeholder="e.g. Carries inhaler in bag / Asthmatic"
                placeholderTextColor="#64748B"
                multiline
              />
            </View>
          </View>

          {/* Authorized Pickup Persons */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>3. AUTHORIZED PICKUP PERSONS</Text>
            <Text style={styles.helpText}>Child will only be released to these verified individuals:</Text>

            {guardians.map((g, idx) => (
              <View key={idx} style={styles.guardianRow}>
                <View style={styles.guardianAvatar}>
                  <UserCheck size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guardianName}>{g.name} ({g.relationship})</Text>
                  <Text style={styles.guardianPhone}>{g.phone || 'Phone on file'}</Text>
                </View>
                <View style={styles.authorizedBadge}>
                  <Text style={styles.authorizedBadgeText}>Authorized</Text>
                </View>
              </View>
            ))}

            {!showAddGuardian ? (
              <TouchableOpacity style={styles.addGuardianBtn} onPress={() => setShowAddGuardian(true)}>
                <Plus size={16} color="#FBBF24" />
                <Text style={styles.addGuardianBtnText}>Add Another Pickup Relative (Grandparent, Uncle)</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.addGuardianBox}>
                <Text style={styles.inputLabel}>Relative Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={newGuardianName}
                  onChangeText={setNewGuardianName}
                  placeholder="e.g. Grandfather David"
                  placeholderTextColor="#64748B"
                />
                <View style={styles.rowTwo}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Relationship</Text>
                    <TextInput
                      style={styles.textInput}
                      value={newGuardianRelation}
                      onChangeText={setNewGuardianRelation}
                      placeholder="e.g. Grandfather"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Phone Number</Text>
                    <TextInput
                      style={styles.textInput}
                      value={newGuardianPhone}
                      onChangeText={setNewGuardianPhone}
                      placeholder="+91..."
                      placeholderTextColor="#64748B"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={styles.saveGuardianBtn} onPress={handleAddGuardian}>
                    <Text style={styles.saveGuardianBtnText}>Save Relative</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelGuardianBtn} onPress={() => setShowAddGuardian(false)}>
                    <Text style={styles.cancelGuardianBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.88}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <>
                <Text style={styles.submitBtnText}>Complete Registration & Activate Pass</Text>
                <Check size={18} color="#000000" strokeWidth={3} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    alignItems: 'center',
  },
  titleSerif: {
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  scroll: {
    padding: 20,
    paddingBottom: 50,
    gap: 16,
  },
  photoContainer: {
    alignItems: 'center',
    marginVertical: 4,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#18181B',
    borderWidth: 2,
    borderColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    gap: 4,
  },
  avatarText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '700',
  },
  photoHint: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 6,
  },
  sectionCard: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 1.5,
  },
  helpText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  prefillChip: {
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  prefillChipText: {
    color: '#E4E4E7',
    fontSize: 11,
    fontWeight: '600',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 6,
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderBtn: {
    flex: 1,
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderBtnActive: {
    borderColor: '#FBBF24',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  genderBtnText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  genderBtnTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  tierPreviewCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tierInfo: {
    flex: 1,
  },
  tierLabel: {
    fontSize: 10,
    color: '#A7F3D0',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  tierName: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  tierAge: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  allergyChip: {
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  allergyChipActive: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  allergyChipText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  allergyChipTextActive: {
    color: '#FCA5A5',
    fontWeight: '700',
  },
  customAllergyRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addChipBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardianRow: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  guardianAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardianName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  guardianPhone: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  authorizedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  authorizedBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  addGuardianBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addGuardianBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
  },
  addGuardianBox: {
    backgroundColor: '#09090B',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3F3F46',
    gap: 8,
  },
  saveGuardianBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveGuardianBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  cancelGuardianBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelGuardianBtnText: {
    color: '#D4D4D8',
    fontSize: 11,
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  submitBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
