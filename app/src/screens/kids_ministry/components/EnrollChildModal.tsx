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
  Switch,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { X, Camera, Image as ImageIcon, AlertTriangle, ShieldCheck, UserCheck, Plus, Check, Calendar } from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';
import {
  calculateChildAge,
  getRecommendedClassTier,
  isChildEligibleForClass,
  AuthorizedGuardian,
  KidsClassRecord,
} from '../../../types/KidsMinistryTypes';
import { useAdminTheme } from '../../../utils/adminThemeHelper';
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

function buildDefaultGuardians(member: any, existingFamilyMembers: any[] = []): AuthorizedGuardian[] {
  if (!member) return [];
  const parentName = member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Parent';
  const list: AuthorizedGuardian[] = [
    {
      id: member.id || 'p1',
      name: parentName,
      relationship: 'Father',
      phone: member.phone || '',
      isPrimaryContact: true,
      canPickup: true,
    },
  ];
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
    list.push({
      id: spouse.id || spouse.Id || 'p2',
      name: spouseName || 'Mother',
      relationship: 'Mother',
      phone: spouse.Phone || spouse.phone || '',
      isPrimaryContact: false,
      canPickup: true,
    });
  }
  return list;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return 'Select Date of Birth (DD-MM-YYYY)';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(month, 10) - 1] || month;
    return `${day}-${month}-${year}  (${day} ${monthName} ${year})`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(month, 10) - 1] || month;
    return `${day}-${month}-${year}  (${day} ${monthName} ${year})`;
  }
  return dateStr;
}

export default function EnrollChildModal({
  visible,
  onClose,
  churchId,
  member,
  existingFamilyMembers = EMPTY_FAMILY_ARRAY,
  onChildEnrolled,
}: Props) {
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
  const amberAccent = isDark ? '#FBBF24' : '#D97706';
  const primaryActionBg = isDark ? '#FFFFFF' : '#0F172A';
  const primaryActionText = isDark ? '#000000' : '#FFFFFF';
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('2018-05-15'); // YYYY-MM-DD
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [allergiesList, setAllergiesList] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');

  // Guardians State - pure state initialization, ZERO useEffect calls
  const [guardians, setGuardians] = useState<AuthorizedGuardian[]>(() =>
    buildDefaultGuardians(member, existingFamilyMembers)
  );

  const [newGuardianName, setNewGuardianName] = useState('');
  const [newGuardianRelation, setNewGuardianRelation] = useState('Mother');
  const [newGuardianPhone, setNewGuardianPhone] = useState('');
  const [showAddGuardian, setShowAddGuardian] = useState(false);

  // Step 4: Release Consent State (default safe: false)
  const [canLeaveClassIndependently, setCanLeaveClassIndependently] = useState(false);
  const [canLeavePremisesIndependently, setCanLeavePremisesIndependently] = useState(false);
  const [teacherInstructions, setTeacherInstructions] = useState('');

  // Derived age & class recommendation + eligible classrooms (including Mixed Age Group)
  const [availableClasses, setAvailableClasses] = useState<KidsClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !churchId) return;
    const unsub = KidsMinistryService.subscribeToClasses(churchId, list => {
      setAvailableClasses(list);
    });
    return () => unsub();
  }, [visible, churchId]);

  const calculatedAge = calculateChildAge(dob);
  const recommendedTier = getRecommendedClassTier(calculatedAge);
  const eligibleClasses = availableClasses.filter(cls => isChildEligibleForClass(calculatedAge, cls));
  const selectedClassObj =
    eligibleClasses.find(c => c.id === selectedClassId) ||
    eligibleClasses.find(c => c.tier === recommendedTier.tier) ||
    eligibleClasses[0] ||
    null;

  // Photo Picker (Gallery & Camera)
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

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Please allow camera access to take a child photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedPhotoUri(result.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert('Camera Error', e.message || 'Could not capture photo');
    }
  };

  const promptPhotoSource = () => {
    Alert.alert('Child Profile Picture', 'Choose a photo source:', [
      { text: 'Upload from Gallery', onPress: handlePickPhoto },
      { text: 'Take Photo using Camera', onPress: handleTakePhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
    setGuardians(prev => [...prev, g]);
    setNewGuardianName('');
    setNewGuardianPhone('');
    setShowAddGuardian(false);
  };

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      Alert.alert('Missing Field', 'Please enter child first name');
      return;
    }
    if (!dob || (!dob.match(/^\d{4}-\d{2}-\d{2}$/) && !dob.match(/^\d{2}-\d{2}-\d{4}$/))) {
      Alert.alert('Invalid Date', 'Please select child date of birth');
      return;
    }

    try {
      setSubmitting(true);

      let photoUrl = '';
      if (selectedPhotoUri) {
        if (selectedPhotoUri.startsWith('http://') || selectedPhotoUri.startsWith('https://')) {
          photoUrl = selectedPhotoUri;
        } else {
          const ext = selectedPhotoUri.split('.').pop() || 'jpg';
          const storageRef = storage().ref(
            `churches/${churchId}/children/${Date.now()}_child.${ext}`
          );
          await storageRef.putFile(selectedPhotoUri);
          photoUrl = await storageRef.getDownloadURL();
        }
      }

      const parentName =
        member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Parent';

      const targetClassName = selectedClassObj?.name || recommendedTier.displayName;
      const targetTier = selectedClassObj?.tier || recommendedTier.tier;

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
        assignedClassId: selectedClassObj?.id,
        assignedClassName: targetClassName,
        assignedTier: targetTier,
        allergiesList,
        medicalNotes,
        bloodGroup,
        guardians,
        notes: teacherInstructions.trim(),
        consentPermissions: {
          canLeaveClassroomIndependently: canLeaveClassIndependently,
          canLeavePremisesIndependently: canLeavePremisesIndependently,
          teacherInstructions: teacherInstructions.trim(),
          status: 'confirmed',
          updatedAt: new Date().toISOString(),
          updatedByMemberId: member.id || '',
          updatedByName: parentName,
        },
        parentConsentStatus: 'confirmed',
        parentConsentConfirmed: true,
        emergencyContact: {
          name: guardians[0]?.name || parentName,
          phone: guardians[0]?.phone || member.phone || '',
          relationship: guardians[0]?.relationship || 'Father',
        },
      });

      Alert.alert(
        'Child Enrolled! 🎉',
        `${firstName} is registered for ${targetClassName}! Sunday School custody pass is now active.`,
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
    const existingPhoto = contact.profilePhoto || contact.photoUrl;
    if (existingPhoto) setSelectedPhotoUri(existingPhoto);
    if (contact.gender) {
      const g = contact.gender.toLowerCase();
      if (g === 'female' || contact.relation === 'Daughter' || contact.Relation === 'Daughter') setGender('female');
      else setGender('male');
    } else if (contact.relation === 'Daughter' || contact.Relation === 'Daughter') {
      setGender('female');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" transparent={false} onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg, paddingTop: 0 }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />
          {/* Header */}
          <View style={[styles.headerRow, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: secondarySurface, borderColor, borderWidth: isDark ? 0 : 1 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={primaryText} />
            </TouchableOpacity>
            <View style={styles.headerTitles}>
              <Text style={[styles.titleSerif, { color: primaryText }]}>Enroll in Sunday School</Text>
              <Text style={[styles.subtitle, { color: secondaryText }]}>Child Profile & Safeguarding Setup</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Quick Pre-fill from Existing Household if any exist */}
            {existingFamilyMembers.length > 0 && (
              <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
                <Text style={[styles.sectionLabel, { color: amberAccent }]}>DETECTED IN YOUR HOUSEHOLD</Text>
                <Text style={[styles.helpText, { color: secondaryText }]}>Tap a child to auto-fill details:</Text>
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
                          style={[styles.prefillChip, { backgroundColor: secondarySurface, borderColor }]}
                          onPress={() => handleSelectExistingContact(c)}
                        >
                          <Text style={[styles.prefillChipText, { color: primaryText }]}>
                            🧒 {cName} ({c.relation || c.Relation})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            )}

            {/* Photo Capture for Face Scan */}
            <View style={styles.photoContainer}>
              <TouchableOpacity
                style={[styles.avatarCircle, { backgroundColor: cardSurface, borderColor: amberAccent }]}
                onPress={promptPhotoSource}
              >
                {selectedPhotoUri ? (
                  <Image source={{ uri: selectedPhotoUri }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Camera size={28} color={amberAccent} />
                    <Text style={[styles.avatarText, { color: amberAccent }]}>Add Photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.prefillChip, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={handlePickPhoto}
                >
                  <ImageIcon size={13} color="#2563EB" />
                  <Text style={[styles.prefillChipText, { marginLeft: 5, color: primaryText }]}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.prefillChip, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={handleTakePhoto}
                >
                  <Camera size={13} color={amberAccent} />
                  <Text style={[styles.prefillChipText, { marginLeft: 5, color: primaryText }]}>Camera</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.photoHint, { color: secondaryText }]}>
                Synced with Household Card & Face Check-In
              </Text>
            </View>

            {/* Child Identity Details */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
              <Text style={[styles.sectionLabel, { color: amberAccent }]}>1. CHILD IDENTITY</Text>

              <View style={styles.rowTwo}>
                <View style={styles.halfInput}>
                  <Text style={[styles.inputLabel, { color: secondaryText }]}>First Name *</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="e.g. Samuel"
                    placeholderTextColor={secondaryText}
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={[styles.inputLabel, { color: secondaryText }]}>Last Name</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="e.g. Raj"
                    placeholderTextColor={secondaryText}
                  />
                </View>
              </View>

              {/* DOB & Gender */}
              <View style={styles.rowTwo}>
                <View style={styles.halfInput}>
                  <Text style={[styles.inputLabel, { color: secondaryText }]}>Date of Birth (DD-MM-YYYY)</Text>
                  <TouchableOpacity
                    style={[styles.datePickerBtn, { backgroundColor: secondarySurface, borderColor }]}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Calendar size={16} color={amberAccent} style={{ marginRight: 8 }} />
                    <Text style={[styles.datePickerText, { color: primaryText }]}>{formatDisplayDate(dob)}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.halfInput}>
                  <Text style={[styles.inputLabel, { color: secondaryText }]}>Gender</Text>
                  <View style={styles.genderRow}>
                    <TouchableOpacity
                      style={[
                        styles.genderBtn,
                        { backgroundColor: secondarySurface, borderColor },
                        gender === 'male' && styles.genderBtnActive,
                      ]}
                      onPress={() => setGender('male')}
                    >
                      <Text
                        style={[
                          styles.genderBtnText,
                          { color: secondaryText },
                          gender === 'male' && { color: amberAccent, fontWeight: '700' },
                        ]}
                      >
                        Boy
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderBtn,
                        { backgroundColor: secondarySurface, borderColor },
                        gender === 'female' && styles.genderBtnActive,
                      ]}
                      onPress={() => setGender('female')}
                    >
                      <Text
                        style={[
                          styles.genderBtnText,
                          { color: secondaryText },
                          gender === 'female' && { color: amberAccent, fontWeight: '700' },
                        ]}
                      >
                        Girl
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Auto-Assigned Class Card + Eligible Classroom Selector (including Mixed Age Group) */}
              <View style={styles.tierPreviewCard}>
                <View style={styles.tierInfo}>
                  <Text style={[styles.tierLabel, { color: isDark ? '#A7F3D0' : '#059669' }]}>
                    {selectedClassObj ? 'Selected Sunday School Class:' : 'Recommended Sunday School Class:'}
                  </Text>
                  <Text style={[styles.tierName, { color: primaryText }]}>
                    {selectedClassObj?.name || recommendedTier.displayName}
                  </Text>
                  <Text style={[styles.tierAge, { color: secondaryText }]}>
                    Age: {calculatedAge} years ·{' '}
                    {selectedClassObj
                      ? selectedClassObj.tier === 'mixed'
                        ? `Mixed Age Group (All Ages) · ${selectedClassObj.roomNumber}`
                        : `Ages ${selectedClassObj.ageRange.min}–${selectedClassObj.ageRange.max} · ${selectedClassObj.roomNumber}`
                      : `${recommendedTier.ageRange} · ${recommendedTier.roomDefault}`}
                  </Text>
                  <Text style={[styles.tierExplainer, { color: isDark ? '#6EE7B7' : '#047857' }]}>
                    {eligibleClasses.length > 1
                      ? 'Tap a classroom below to choose (Mixed Age Group accepts all ages).'
                      : `Auto-grouped by age (${calculatedAge} yrs) so your child is in the right class & curriculum.`}
                  </Text>
                </View>
                <ShieldCheck size={26} color="#10B981" />
              </View>

              {eligibleClasses.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingTop: 4 }}
                >
                  {eligibleClasses.map(cls => {
                    const isSel = selectedClassObj?.id === cls.id;
                    return (
                      <TouchableOpacity
                        key={cls.id}
                        style={[
                          styles.prefillChip,
                          { backgroundColor: secondarySurface, borderColor },
                          isSel && { backgroundColor: '#FBBF24', borderColor: '#FBBF24' },
                        ]}
                        onPress={() => setSelectedClassId(cls.id)}
                      >
                        <Text
                          style={[
                            styles.prefillChipText,
                            { color: primaryText },
                            isSel && { color: '#000000', fontWeight: '800' },
                          ]}
                        >
                          {cls.name} {cls.tier === 'mixed' ? '· Mixed (All Ages)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Medical & Allergies */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
              <View style={styles.sectionLabelRow}>
                <Text style={[styles.sectionLabel, { color: amberAccent }]}>2. MEDICAL & ALLERGY ALERTS (OPTIONAL)</Text>
                <AlertTriangle size={14} color="#EF4444" />
              </View>
              <Text style={[styles.helpText, { color: secondaryText }]}>
                Informs teachers to safeguard your child during snacks & playtime (e.g. food allergies, asthma inhaler). Leave blank if none.
              </Text>

              {/* Allergy Chips */}
              <View style={styles.chipsWrap}>
                {COMMON_ALLERGIES.map(allergy => {
                  const isSelected = allergiesList.includes(allergy);
                  return (
                    <TouchableOpacity
                      key={allergy}
                      style={[
                        styles.allergyChip,
                        { backgroundColor: secondarySurface, borderColor },
                        isSelected && styles.allergyChipActive,
                      ]}
                      onPress={() => toggleAllergy(allergy)}
                    >
                      <Text
                        style={[
                          styles.allergyChipText,
                          { color: secondaryText },
                          isSelected && { color: isDark ? '#FCA5A5' : '#DC2626', fontWeight: '700' },
                        ]}
                      >
                        {isSelected ? '✓ ' : ''}{allergy}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom Allergy input */}
              <View style={styles.customAllergyRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                  value={customAllergy}
                  onChangeText={setCustomAllergy}
                  placeholder="Other allergy / medication..."
                  placeholderTextColor={secondaryText}
                />
                <TouchableOpacity
                  style={[styles.addChipBtn, { backgroundColor: primaryActionBg }]}
                  onPress={addCustomAllergy}
                >
                  <Plus size={16} color={primaryActionText} />
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={[styles.inputLabel, { color: secondaryText }]}>Medical Notes / Inhaler Details (Optional)</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                  value={medicalNotes}
                  onChangeText={setMedicalNotes}
                  placeholder="e.g. Carries inhaler in bag / Asthmatic"
                  placeholderTextColor={secondaryText}
                  multiline
                />
              </View>
            </View>

            {/* Authorized Pickup Persons */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
              <Text style={[styles.sectionLabel, { color: amberAccent }]}>3. AUTHORIZED PICKUP PERSONS</Text>
              <Text style={[styles.helpText, { color: secondaryText }]}>
                Child will only be released to these verified individuals:
              </Text>

              {guardians.map((g, idx) => (
                <View key={idx} style={[styles.guardianRow, { backgroundColor: secondarySurface, borderColor }]}>
                  <View style={styles.guardianAvatar}>
                    <UserCheck size={18} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.guardianName, { color: primaryText }]}>{g.name} ({g.relationship})</Text>
                    <Text style={[styles.guardianPhone, { color: secondaryText }]}>{g.phone || 'Phone on file'}</Text>
                  </View>
                  <View style={styles.authorizedBadge}>
                    <Text style={styles.authorizedBadgeText}>Authorized</Text>
                  </View>
                </View>
              ))}

              {!showAddGuardian ? (
                <TouchableOpacity style={styles.addGuardianBtn} onPress={() => setShowAddGuardian(true)}>
                  <Plus size={16} color={amberAccent} />
                  <Text style={[styles.addGuardianBtnText, { color: amberAccent }]}>
                    Add Another Pickup Relative (Grandparent, Uncle)
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.addGuardianBox, { backgroundColor: secondarySurface, borderColor }]}>
                  <Text style={[styles.inputLabel, { color: secondaryText }]}>Relative Name</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                    value={newGuardianName}
                    onChangeText={setNewGuardianName}
                    placeholder="e.g. Grandfather David"
                    placeholderTextColor={secondaryText}
                  />
                  <View style={styles.rowTwo}>
                    <View style={styles.halfInput}>
                      <Text style={[styles.inputLabel, { color: secondaryText }]}>Relationship</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                        value={newGuardianRelation}
                        onChangeText={setNewGuardianRelation}
                        placeholder="e.g. Grandfather"
                        placeholderTextColor={secondaryText}
                      />
                    </View>
                    <View style={styles.halfInput}>
                      <Text style={[styles.inputLabel, { color: secondaryText }]}>Phone Number</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                        value={newGuardianPhone}
                        onChangeText={setNewGuardianPhone}
                        placeholder="+91..."
                        placeholderTextColor={secondaryText}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.saveGuardianBtn, { backgroundColor: primaryActionBg }]}
                      onPress={handleAddGuardian}
                    >
                      <Text style={[styles.saveGuardianBtnText, { color: primaryActionText }]}>Save Relative</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cancelGuardianBtn, { backgroundColor: cardSurface, borderWidth: 1, borderColor }]}
                      onPress={() => setShowAddGuardian(false)}
                    >
                      <Text style={[styles.cancelGuardianBtnText, { color: primaryText }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Step 4: Parent Consent & Release Permissions */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
              <Text style={[styles.sectionLabel, { color: amberAccent }]}>4. RELEASE CONSENT & TEACHER INSTRUCTIONS</Text>
              <Text style={[styles.helpText, { color: secondaryText }]}>
                Teachers follow these permissions before releasing your child:
              </Text>

              <View style={[styles.guardianRow, { backgroundColor: secondarySurface, borderColor }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.guardianName, { color: primaryText }]}>
                    Leave classroom independently
                  </Text>
                  <Text style={[styles.guardianPhone, { color: secondaryText }]}>
                    Keep OFF if pickup person must meet teacher
                  </Text>
                </View>
                <Switch
                  value={canLeaveClassIndependently}
                  onValueChange={setCanLeaveClassIndependently}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={[styles.guardianRow, { backgroundColor: secondarySurface, borderColor }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.guardianName, { color: primaryText }]}>
                    Leave church premises independently
                  </Text>
                  <Text style={[styles.guardianPhone, { color: secondaryText }]}>
                    Keep OFF so only approved guardians can pick up
                  </Text>
                </View>
                <Switch
                  value={canLeavePremisesIndependently}
                  onValueChange={setCanLeavePremisesIndependently}
                  trackColor={{ false: '#CBD5E1', true: '#F59E0B' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={{ marginTop: 4 }}>
                <Text style={[styles.inputLabel, { color: secondaryText }]}>
                  Instructions for Teachers (Optional)
                </Text>
                <TextInput
                  style={[styles.textInput, { height: 62, backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                  value={teacherInstructions}
                  onChangeText={setTeacherInstructions}
                  placeholder="e.g. Please hand over only to Father or Grandmother"
                  placeholderTextColor={secondaryText}
                  multiline
                />
              </View>
            </View>

            {/* Submit Action */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: primaryActionBg, shadowColor: '#000000' },
                submitting && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.88}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={primaryActionText} />
              ) : (
                <>
                  <Text style={[styles.submitBtnText, { color: primaryActionText }]}>
                    Complete Registration & Activate Pass
                  </Text>
                  <Check size={18} color={primaryActionText} strokeWidth={3} />
                </>
              )}
            </TouchableOpacity>
          </ScrollView>

          <DateTimePickerModal
            isVisible={showDatePicker}
            mode="date"
            maximumDate={new Date()}
            date={dob && !isNaN(Date.parse(dob)) ? new Date(dob) : new Date(2018, 4, 15)}
            onConfirm={(selectedDate) => {
              setShowDatePicker(false);
              const year = selectedDate.getFullYear();
              const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
              const day = String(selectedDate.getDate()).padStart(2, '0');
              setDob(`${year}-${month}-${day}`);
            }}
            onCancel={() => setShowDatePicker(false)}
          />
        </SafeAreaView>
      </SafeAreaProvider>
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
    flexDirection: 'row',
    alignItems: 'center',
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
  datePickerBtn: {
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  datePickerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
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
  tierExplainer: {
    fontSize: 10,
    color: '#6EE7B7',
    marginTop: 4,
    fontStyle: 'italic',
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
