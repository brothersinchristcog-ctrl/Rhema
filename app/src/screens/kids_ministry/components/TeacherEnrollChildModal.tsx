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
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Search,
  User,
  Phone,
  Camera,
  Calendar,
  ShieldCheck,
  Check,
  AlertTriangle,
  Users,
  Image as ImageIcon,
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';
import KidsMinistryService from '../../../services/KidsMinistryService';
import {
  ChildRecord,
  KidsClassRecord,
  KidsTeacherRecord,
  calculateChildAge,
  getRecommendedClassTier,
  toIsoDateString,
} from '../../../types/KidsMinistryTypes';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

interface Props {
  visible: boolean;
  onClose: () => void;
  churchId: string;
  actingMember: any;
  defaultClass?: KidsClassRecord | null;
  allClasses?: KidsClassRecord[];
  onChildEnrolled?: (child: ChildRecord) => void;
}

function formatDisplayDob(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Select Date of Birth';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d}-${m}-${y} (${d} ${months[parseInt(m, 10) - 1] || m} ${y})`;
}

export default function TeacherEnrollChildModal({
  visible,
  onClose,
  churchId,
  actingMember,
  defaultClass = null,
  allClasses: propClasses,
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

  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44) + 6;

  // Authorization check state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authStatus, setAuthStatus] = useState<{
    authorized: boolean;
    role: 'admin' | 'teacher' | 'unauthorized';
    actorName: string;
    teacherRecord?: KidsTeacherRecord;
  }>({ authorized: false, role: 'unauthorized', actorName: '' });

  // Classes list
  const [classes, setClasses] = useState<KidsClassRecord[]>(propClasses || []);
  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClass?.id || '');

  // Parent / Father Search State
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [showResultsDropdown, setShowResultsDropdown] = useState(false);
  const [selectedParent, setSelectedParent] = useState<any | null>(null);
  const [parentPhoneDisplay, setParentPhoneDisplay] = useState('');
  const [existingFamilyKids, setExistingFamilyKids] = useState<ChildRecord[]>([]);

  // Child Details State
  const [childFullName, setChildFullName] = useState('');
  const [dob, setDob] = useState('2018-05-15');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);

  // Emergency Contact & Medical
  const [useAlternateEmergency, setUseAlternateEmergency] = useState(false);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('Mother');
  const [medicalNotes, setMedicalNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const calculatedAge = calculateChildAge(dob);
  const recommendedTier = getRecommendedClassTier(calculatedAge);

  // Verify permission & load classes when opened
  useEffect(() => {
    if (!visible) return;
    let mounted = true;

    const init = async () => {
      setCheckingAuth(true);
      try {
        const [access, classList] = await Promise.all([
          KidsMinistryService.verifyTeacherOrAdminAccess(churchId, actingMember),
          propClasses && propClasses.length > 0
            ? Promise.resolve(propClasses)
            : KidsMinistryService.getOrInitKidsClasses(churchId),
        ]);
        if (!mounted) return;
        setAuthStatus(access);
        setClasses(classList);
        if (defaultClass?.id) {
          setSelectedClassId(defaultClass.id);
        } else if (classList.length > 0) {
          const rec = getRecommendedClassTier(calculateChildAge(dob));
          const matchedClass = classList.find(c => c.tier === rec.tier) || classList[0];
          setSelectedClassId(matchedClass.id);
        }
      } catch {
        if (mounted) {
          setAuthStatus({ authorized: false, role: 'unauthorized', actorName: '' });
        }
      } finally {
        if (mounted) setCheckingAuth(false);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, [visible, churchId, actingMember]);

  // Auto-update recommended class when DOB changes (unless teacher explicitly locked a defaultClass)
  useEffect(() => {
    if (defaultClass?.id || classes.length === 0) return;
    const match = classes.find(c => c.tier === recommendedTier.tier);
    if (match) {
      setSelectedClassId(match.id);
    }
  }, [recommendedTier.tier, classes, defaultClass?.id]);

  // Search church members (Father / Parent)
  const handleSearchMembers = async (text: string) => {
    setMemberSearchQuery(text);
    if (!text.trim()) {
      setMemberResults([]);
      setShowResultsDropdown(false);
      return;
    }

    setSearchingMembers(true);
    setShowResultsDropdown(true);
    try {
      const results = await KidsMinistryService.searchChurchMembers(churchId, text, {
        adultsOnly: true,
        limitCount: 500,
      });
      setMemberResults(results.slice(0, 12));
    } catch {
      setMemberResults([]);
    } finally {
      setSearchingMembers(false);
    }
  };

  const handleSelectParent = async (m: any) => {
    const pName = (m.name || `${m.firstName || ''} ${m.lastName || ''}`).trim() || 'Church Member';
    const pPhone = m.phone || m.mobileNumber || m.phoneNumber || '';
    setSelectedParent(m);
    setMemberSearchQuery(pName);
    setParentPhoneDisplay(pPhone || 'No mobile registered');
    setShowResultsDropdown(false);

    // Load existing children in that parent's household to warn/prevent duplicates
    const familyId = m.accountId || m.id;
    try {
      const existingKids = await KidsMinistryService.getChildrenByFamily(churchId, familyId);
      setExistingFamilyKids(existingKids);
    } catch {
      setExistingFamilyKids([]);
    }
  };

  const handleClearParent = () => {
    setSelectedParent(null);
    setMemberSearchQuery('');
    setParentPhoneDisplay('');
    setExistingFamilyKids([]);
    setShowResultsDropdown(false);
  };

  const handlePickFromGallery = async () => {
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
      Alert.alert('Photo Error', e.message || 'Could not select image.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Please allow camera access to take the child’s photo.');
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
      Alert.alert('Camera Error', e.message || 'Could not capture photo.');
    }
  };

  const handleSubmit = async () => {
    if (!authStatus.authorized) {
      Alert.alert(
        'Not Authorized',
        'Only authorized Sunday School teachers and church administrators can enroll children directly.'
      );
      return;
    }
    if (!selectedParent) {
      Alert.alert('Select Father / Parent', 'Please search and select the child’s father or parent from Church Members.');
      return;
    }
    if (!childFullName.trim()) {
      Alert.alert('Missing Child Name', 'Please enter the child’s full name.');
      return;
    }
    if (useAlternateEmergency && (!emergencyName.trim() || !emergencyPhone.trim())) {
      Alert.alert('Emergency Contact', 'Please enter alternate emergency contact name and mobile number.');
      return;
    }

    try {
      setSubmitting(true);

      let photoUrl = '';
      if (selectedPhotoUri) {
        const ext = selectedPhotoUri.split('.').pop() || 'jpg';
        const storageRef = storage().ref(
          `churches/${churchId}/children/${Date.now()}_teacher_enroll.${ext}`
        );
        await storageRef.putFile(selectedPhotoUri);
        photoUrl = await storageRef.getDownloadURL();
      }

      const assignedClassObj = classes.find(c => c.id === selectedClassId) || null;
      const parentName = (
        selectedParent.name ||
        `${selectedParent.firstName || ''} ${selectedParent.lastName || ''}`
      ).trim();
      const parentPhone =
        selectedParent.phone || selectedParent.mobileNumber || selectedParent.phoneNumber || '';

      const res = await KidsMinistryService.enrollChildByTeacher(churchId, {
        actingMember,
        selectedParent,
        childFullName: childFullName.trim(),
        dob,
        gender,
        photoUrl,
        assignedClass: assignedClassObj,
        emergencyContact: useAlternateEmergency
          ? {
              name: emergencyName.trim(),
              phone: emergencyPhone.trim(),
              relationship: emergencyRelation.trim() || 'Guardian',
            }
          : {
              name: parentName,
              phone: parentPhone,
              relationship: 'Parent',
            },
        medicalNotes: medicalNotes.trim(),
        enrollingTeacherOverride: authStatus.teacherRecord || null,
      });

      if (res.status === 'ownership_conflict') {
        Alert.alert('Parent Ownership Protected', res.message);
        return;
      }

      Alert.alert(
        res.status === 'linked_existing' ? 'Existing Child Linked!' : 'Child Enrolled Successfully!',
        res.message,
        [
          {
            text: 'Done',
            onPress: () => {
              onChildEnrolled?.(res.child);
              handleResetAndClose();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Enrollment Failed', err.message || 'Could not complete child enrollment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    handleClearParent();
    setChildFullName('');
    setDob('2018-05-15');
    setGender('male');
    setSelectedPhotoUri(null);
    setUseAlternateEmergency(false);
    setEmergencyName('');
    setEmergencyPhone('');
    setMedicalNotes('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleResetAndClose}>
      <View style={[styles.container, { backgroundColor: screenBg, paddingTop: safeTop }]}>
        <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

        {/* Header */}
        <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={handleResetAndClose}
            style={[styles.closeBtn, { backgroundColor: secondarySurface }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color={primaryText} />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={[styles.titleSerif, { color: primaryText }]} numberOfLines={1} adjustsFontSizeToFit>
              Teacher Child Enrollment
            </Text>
            <Text style={[styles.subtitle, { color: secondaryText }]} numberOfLines={1}>
              Syncs Automatically to Household Directory & Rhema Kids
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {checkingAuth ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#FBBF24" />
            <Text style={[styles.stateText, { color: secondaryText }]}>
              Verifying Sunday School teacher authorization...
            </Text>
          </View>
        ) : !authStatus.authorized ? (
          <View style={styles.centerState}>
            <View style={styles.unauthIcon}>
              <AlertTriangle size={34} color="#EF4444" />
            </View>
            <Text style={[styles.unauthTitle, { color: primaryText }]}>
              Teacher / Admin Authorization Required
            </Text>
            <Text style={[styles.unauthSub, { color: secondaryText }]}>
              Only verified Sunday School teachers and church administrators are permitted to directly enroll children on behalf of parents.
            </Text>
            <TouchableOpacity style={styles.unauthCloseBtn} onPress={handleResetAndClose}>
              <Text style={styles.unauthCloseText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Authorized Enroller Pill */}
            <View style={[styles.authBanner, { backgroundColor: cardSurface, borderColor: '#10B981' }]}>
              <ShieldCheck size={18} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.authBannerTitle, { color: primaryText }]}>
                  Enrolling as {authStatus.role === 'admin' ? 'Administrator' : 'Sunday School Teacher'}: {authStatus.actorName}
                </Text>
                <Text style={[styles.authBannerSub, { color: secondaryText }]}>
                  Recorded in audit history · Parent will receive consent confirmation notice
                </Text>
              </View>
            </View>

            {/* STEP 1: SEARCH & SELECT FATHER / PARENT */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
              <Text style={styles.sectionHeading}>1. SELECT FATHER / PARENT FROM CHURCH MEMBERS *</Text>

              {selectedParent ? (
                <View style={[styles.selectedParentBox, { backgroundColor: secondarySurface, borderColor: '#10B981' }]}>
                  <View style={styles.parentAvatar}>
                    <Text style={styles.parentAvatarText}>
                      {(selectedParent.name || selectedParent.firstName || 'P').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.selectedParentName, { color: primaryText }]}>
                      {selectedParent.name || `${selectedParent.firstName || ''} ${selectedParent.lastName || ''}`.trim()}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <Phone size={12} color="#10B981" />
                      <Text style={styles.selectedParentPhone}>{parentPhoneDisplay}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.changeParentBtn, { backgroundColor: cardSurface, borderColor }]}
                    onPress={handleClearParent}
                  >
                    <Text style={[styles.changeParentText, { color: primaryText }]}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={[styles.searchBox, { backgroundColor: secondarySurface, borderColor: '#3B82F6' }]}>
                    <Search size={16} color="#3B82F6" />
                    <TextInput
                      style={[styles.searchInput, { color: primaryText }]}
                      value={memberSearchQuery}
                      onChangeText={handleSearchMembers}
                      placeholder="Search Father / Parent name or mobile number..."
                      placeholderTextColor={secondaryText}
                    />
                    {searchingMembers && <ActivityIndicator size="small" color="#3B82F6" />}
                  </View>

                  {showResultsDropdown && (
                    <View style={[styles.dropdownBox, { backgroundColor: secondarySurface, borderColor }]}>
                      {memberResults.length === 0 && !searchingMembers ? (
                        <Text style={[styles.emptySearchText, { color: secondaryText }]}>
                          No church member found matching "{memberSearchQuery}"
                        </Text>
                      ) : (
                        memberResults.map(m => {
                          const displayName = (m.name || `${m.firstName || ''} ${m.lastName || ''}`).trim();
                          const phone = m.phone || m.mobileNumber || m.phoneNumber || 'No phone';
                          return (
                            <TouchableOpacity
                              key={m.id}
                              style={[styles.dropdownRow, { borderBottomColor: borderColor }]}
                              onPress={() => handleSelectParent(m)}
                              activeOpacity={0.75}
                            >
                              <View style={styles.dropdownAvatar}>
                                <Text style={styles.dropdownAvatarText}>
                                  {(displayName || 'M').charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.dropdownName, { color: primaryText }]}>{displayName}</Text>
                                <Text style={[styles.dropdownMeta, { color: secondaryText }]}>
                                  {phone} {(m.city || m.village) ? `· ${m.city || m.village}` : ''}
                                </Text>
                              </View>
                              <View style={styles.selectChip}>
                                <Text style={styles.selectChipText}>Select</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}
                </>
              )}

              {/* Auto-filled Registered Mobile Number Readout */}
              {selectedParent && (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: secondaryText }]}>
                    Registered Parent Mobile Number (Auto-Filled)
                  </Text>
                  <View style={[styles.readonlyField, { backgroundColor: secondarySurface, borderColor }]}>
                    <Phone size={14} color="#10B981" />
                    <Text style={[styles.readonlyFieldText, { color: primaryText }]}>
                      {parentPhoneDisplay}
                    </Text>
                  </View>
                </View>
              )}

              {/* Show existing children in this household so duplicates are visible immediately */}
              {selectedParent && existingFamilyKids.length > 0 && (
                <View style={[styles.existingKidsNotice, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)' }]}>
                  <Users size={14} color="#3B82F6" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#3B82F6' }}>
                      Already in {selectedParent.name || 'Parent'}'s Household ({existingFamilyKids.length}):
                    </Text>
                    <Text style={{ fontSize: 11, color: secondaryText, marginTop: 2 }}>
                      {existingFamilyKids.map(k => `${k.fullName} (Age ${k.age})`).join(', ')}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* STEP 2: CHILD DETAILS */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
              <Text style={styles.sectionHeading}>2. CHILD PROFILE & PHOTO</Text>

              {/* Profile Picture (Camera or Gallery) */}
              <View style={styles.photoRow}>
                <View style={[styles.avatarPreview, { backgroundColor: secondarySurface, borderColor }]}>
                  {selectedPhotoUri ? (
                    <Image source={{ uri: selectedPhotoUri }} style={styles.avatarImg} />
                  ) : (
                    <User size={30} color={secondaryText} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={[styles.fieldLabel, { color: primaryText, marginBottom: 0 }]}>
                    Profile Picture (Optional for Face Scan)
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.photoActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                      onPress={handleTakePhoto}
                    >
                      <Camera size={14} color="#F59E0B" />
                      <Text style={[styles.photoActionText, { color: primaryText }]}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.photoActionBtn, { backgroundColor: secondarySurface, borderColor }]}
                      onPress={handlePickFromGallery}
                    >
                      <ImageIcon size={14} color="#3B82F6" />
                      <Text style={[styles.photoActionText, { color: primaryText }]}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Child Full Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: primaryText }]}>Child Full Name *</Text>
                <TextInput
                  style={[styles.inputField, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                  value={childFullName}
                  onChangeText={setChildFullName}
                  placeholder="e.g. Samuel Raj"
                  placeholderTextColor={secondaryText}
                />
              </View>

              {/* Date of Birth & Gender */}
              <View style={styles.rowTwo}>
                <View style={[styles.fieldGroup, { flex: 1.3 }]}>
                  <Text style={[styles.fieldLabel, { color: primaryText }]}>Date of Birth *</Text>
                  <TouchableOpacity
                    style={[styles.dateBtn, { backgroundColor: secondarySurface, borderColor }]}
                    onPress={() => setShowDobPicker(true)}
                  >
                    <Calendar size={14} color="#F59E0B" />
                    <Text style={[styles.dateBtnText, { color: primaryText }]} numberOfLines={1}>
                      {formatDisplayDob(dob)}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.fieldLabel, { color: primaryText }]}>Gender</Text>
                  <View style={styles.genderRow}>
                    <TouchableOpacity
                      style={[
                        styles.genderChip,
                        { backgroundColor: secondarySurface, borderColor },
                        gender === 'male' && styles.genderChipActive,
                      ]}
                      onPress={() => setGender('male')}
                    >
                      <Text style={[styles.genderChipText, { color: gender === 'male' ? '#000000' : secondaryText }]}>
                        Boy
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderChip,
                        { backgroundColor: secondarySurface, borderColor },
                        gender === 'female' && styles.genderChipActive,
                      ]}
                      onPress={() => setGender('female')}
                    >
                      <Text style={[styles.genderChipText, { color: gender === 'female' ? '#000000' : secondaryText }]}>
                        Girl
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Assigned Sunday School Class */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: primaryText }]}>
                  Assigned Sunday School Class (Age {calculatedAge} yrs)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classesScroll}>
                  {classes.map(cls => {
                    const selected = selectedClassId === cls.id;
                    return (
                      <TouchableOpacity
                        key={cls.id}
                        style={[
                          styles.classChip,
                          { backgroundColor: secondarySurface, borderColor },
                          selected && styles.classChipActive,
                        ]}
                        onPress={() => setSelectedClassId(cls.id)}
                      >
                        {selected && <Check size={12} color="#000000" />}
                        <View>
                          <Text style={[styles.classChipTitle, { color: selected ? '#000000' : primaryText }]}>
                            {cls.name}
                          </Text>
                          <Text style={[styles.classChipSub, { color: selected ? '#1E293B' : secondaryText }]}>
                            {cls.tier === 'mixed'
                              ? 'Mixed Age (All Ages)'
                              : `Ages ${cls.ageRange?.min ?? 0}–${cls.ageRange?.max ?? 14}`}{' '}
                            · {cls.roomNumber}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* STEP 3: EMERGENCY CONTACT & NOTES */}
            <View style={[styles.sectionCard, { backgroundColor: cardSurface, borderColor }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.sectionHeading}>3. EMERGENCY CONTACT & NOTES</Text>
                <TouchableOpacity onPress={() => setUseAlternateEmergency(!useAlternateEmergency)}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#3B82F6' }}>
                    {useAlternateEmergency ? 'Use Selected Parent' : '+ Alternate Contact'}
                  </Text>
                </TouchableOpacity>
              </View>

              {useAlternateEmergency ? (
                <View style={{ gap: 10 }}>
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: primaryText }]}>Emergency Contact Name *</Text>
                    <TextInput
                      style={[styles.inputField, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                      value={emergencyName}
                      onChangeText={setEmergencyName}
                      placeholder="e.g. Mother / Guardian Name"
                      placeholderTextColor={secondaryText}
                    />
                  </View>
                  <View style={styles.rowTwo}>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={[styles.fieldLabel, { color: primaryText }]}>Phone Number *</Text>
                      <TextInput
                        style={[styles.inputField, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                        value={emergencyPhone}
                        onChangeText={setEmergencyPhone}
                        keyboardType="phone-pad"
                        placeholder="+91..."
                        placeholderTextColor={secondaryText}
                      />
                    </View>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={[styles.fieldLabel, { color: primaryText }]}>Relationship</Text>
                      <TextInput
                        style={[styles.inputField, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                        value={emergencyRelation}
                        onChangeText={setEmergencyRelation}
                        placeholder="Mother / Aunt"
                        placeholderTextColor={secondaryText}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={[styles.helpNote, { color: secondaryText }]}>
                  Default Emergency Contact: Selected Parent ({selectedParent ? `${selectedParent.name || selectedParent.firstName} · ${parentPhoneDisplay}` : 'Select parent above'})
                </Text>
              )}

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: primaryText }]}>Allergy / Medical Notes (Optional)</Text>
                <TextInput
                  style={[styles.inputField, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                  value={medicalNotes}
                  onChangeText={setMedicalNotes}
                  placeholder="e.g. Peanut allergy, asthma inhaler, or leave blank"
                  placeholderTextColor={secondaryText}
                />
              </View>
            </View>

            {/* Submit Button */}
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
                  <ShieldCheck size={18} color="#000000" />
                  <Text style={styles.submitBtnText}>Complete Enrollment & Link Household</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}

        <DateTimePickerModal
          isVisible={showDobPicker}
          mode="date"
          maximumDate={new Date()}
          date={dob ? new Date(`${dob}T12:00:00`) : new Date(2018, 4, 15)}
          onConfirm={date => {
            setShowDobPicker(false);
            setDob(toIsoDateString(date));
          }}
          onCancel={() => setShowDobPicker(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  titleSerif: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 10.5,
    marginTop: 2,
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  stateText: {
    fontSize: 13,
    textAlign: 'center',
  },
  unauthIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unauthTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  unauthSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  unauthCloseBtn: {
    backgroundColor: '#FBBF24',
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 6,
  },
  unauthCloseText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 13,
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 44,
  },
  authBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  authBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  authBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.7,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  dropdownBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 6,
    maxHeight: 240,
  },
  emptySearchText: {
    padding: 12,
    fontSize: 12,
    textAlign: 'center',
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
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
    fontWeight: '800',
    fontSize: 13,
  },
  dropdownName: {
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  selectChip: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  selectChipText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '800',
  },
  selectedParentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  parentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentAvatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  selectedParentName: {
    fontSize: 14,
    fontWeight: '800',
  },
  selectedParentPhone: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  changeParentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  changeParentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  existingKidsNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  readonlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  readonlyFieldText: {
    fontSize: 13,
    fontWeight: '700',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarPreview: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
  },
  photoActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 10,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  dateBtnText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 6,
  },
  genderChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderChipActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  genderChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  classesScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  classChipActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  classChipTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  classChipSub: {
    fontSize: 10,
    marginTop: 1,
  },
  helpNote: {
    fontSize: 12,
    lineHeight: 17,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  submitBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
