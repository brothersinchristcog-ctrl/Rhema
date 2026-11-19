import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ChevronLeft, Check, Camera } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import { matrimonyApi } from '../services/matrimonyApi';
import { StartRegistrationResponse } from '../types/matrimony';

const ORANGE = '#EA580C';

export default function MatrimonyActivationScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;
  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);

  // Step 1: Consent
  const [profilePublication, setProfilePublication] = useState(false);
  const [matchmaking, setMatchmaking] = useState(false);
  const [communication, setCommunication] = useState(false);

  // Step 2: Matrimony-only details (basic info is auto-hydrated from AppMember)
  const [heightCm, setHeightCm] = useState('');
  const [motherTongue, setMotherTongue] = useState('');
  const [qualification, setQualification] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [occupationCategory, setOccupationCategory] = useState('');
  const [profession, setProfession] = useState('');
  const [familyType, setFamilyType] = useState('Nuclear');
  const [familyValues, setFamilyValues] = useState('Moderate');
  const [aboutMe, setAboutMe] = useState('');

  // Step 3: Preferences & Photos
  const [minAge, setMinAge] = useState('21');
  const [maxAge, setMaxAge] = useState('32');
  const [openToRelocation, setOpenToRelocation] = useState(true);
  const [partnerExpectations, setPartnerExpectations] = useState('');
  const [photoVisibility, setPhotoVisibility] = useState<'approved_members' | 'matches_only'>('approved_members');
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null);
  const [photoStoragePath, setPhotoStoragePath] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const hydrateFromResponse = (res: StartRegistrationResponse) => {
    if (res.consent) {
      setProfilePublication(Boolean(res.consent.profilePublication));
      setMatchmaking(Boolean(res.consent.matchmaking));
      setCommunication(Boolean(res.consent.communication));
    }
    if (res.profile) {
      const p = res.profile;
      if (p.heightCm) setHeightCm(String(p.heightCm));
      if (p.motherTongue) setMotherTongue(p.motherTongue);
      if (p.education?.qualification) setQualification(p.education.qualification);
      if (p.education?.specialization) setSpecialization(p.education.specialization);
      if (p.career?.occupationCategory) setOccupationCategory(p.career.occupationCategory);
      if (p.career?.profession) setProfession(p.career.profession);
      if (p.familySummary?.familyType) setFamilyType(p.familySummary.familyType);
      if (p.familySummary?.familyValues) setFamilyValues(p.familySummary.familyValues);
      if (p.aboutMe) setAboutMe(p.aboutMe);
      if (p.photoVisibility) setPhotoVisibility(p.photoVisibility);
      if (p.signedProfilePhoto) setPhotoPreviewUri(p.signedProfilePhoto);
      if (p.profilePhoto) setPhotoStoragePath(p.profilePhoto);
    }
    if (res.preferences) {
      if (res.preferences.age?.min) setMinAge(String(res.preferences.age.min));
      if (res.preferences.age?.max) setMaxAge(String(res.preferences.age.max));
      setOpenToRelocation(res.preferences.locations?.openToRelocation !== false);
      if (res.preferences.partnerExpectations) setPartnerExpectations(res.preferences.partnerExpectations);
    }
  };

  useEffect(() => {
    if (initialData) {
      hydrateFromResponse(initialData);
      return;
    }
    (async () => {
      try {
        const res = await matrimonyApi.startRegistration();
        hydrateFromResponse(res);
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Unable to load draft.');
      } finally {
        setLoading(false);
      }
    })();
  }, [initialData]);

  const handlePickPhoto = async () => {
    if (!user?.uid) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Needed', 'Please allow photo library access to upload a matrimony photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.72,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;

    setPhotoPreviewUri(asset.uri);
    setUploadingPhoto(true);
    try {
      const { storagePath } = await matrimonyApi.uploadMatrimonyPhoto(
        asset.base64,
        asset.mimeType || 'image/jpeg',
        true
      );
      setPhotoStoragePath(storagePath);
      await matrimonyApi.saveDraft('photos', {
        profilePhoto: storagePath,
        photoVisibility,
      });
    } catch (err: any) {
      setPhotoPreviewUri(null);
      Alert.alert('Photo Not Accepted', err?.message || 'Could not upload photo to Matrimony storage.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      if (step === 1) {
        if (!profilePublication || !matchmaking || !communication) {
          Alert.alert('Consent Required', 'Please accept all three Matrimony consents to continue.');
          setSaving(false);
          return;
        }
        await matrimonyApi.saveDraft('consent', {
          profilePublication,
          matchmaking,
          communication,
          managedBy: 'self',
        });
        setStep(2);
      } else if (step === 2) {
        if (!heightCm.trim() || !motherTongue.trim() || !qualification.trim() || !profession.trim()) {
          Alert.alert('Required Details', 'Please fill in Height, Mother Tongue, Qualification, and Profession.');
          setSaving(false);
          return;
        }
        await matrimonyApi.saveDraft('details', {
          heightCm: Number(heightCm),
          motherTongue,
          qualification,
          specialization,
          occupationCategory,
          profession,
          familyType,
          familyValues,
          aboutMe,
          shareFaithDetails: true,
        });
        setStep(3);
      } else {
        await matrimonyApi.saveDraft('preferences', {
          minAge: Number(minAge) || 20,
          maxAge: Number(maxAge) || 35,
          openToRelocation,
          partnerExpectations,
        });
        await matrimonyApi.saveDraft('photos', {
          profilePhoto: photoStoragePath || undefined,
          photoVisibility,
        });
        await matrimonyApi.submitProfile();
        navigation.replace('MatrimonyStatus');
      }
    } catch (err: any) {
      Alert.alert('Save Error', err?.message || 'Unable to save progress.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      </SafeAreaView>
    );
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderColor: colors.border,
      color: colors.text,
      fontFamily,
    },
  ];
  const cardStyle = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (step > 1 ? setStep((step - 1) as 1 | 2) : navigation.goBack())}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(17) }]}>
          Step {step + 1} of 4
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <MatrimonyProgressBar currentStep={5} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
              Privacy & Consent
            </Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary, fontFamily }]}>
              Your existing Rhema profile (name, age, gender, city, baptism status) is reused automatically. Phone, email, and exact DOB stay private.
            </Text>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>
                Publish my approved Matrimony profile to eligible Rhema members
              </Text>
              <Switch
                value={profilePublication}
                onValueChange={setProfilePublication}
                trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
                thumbColor={profilePublication ? ORANGE : '#F8FAFC'}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>
                Use my preferences for reciprocal compatibility matching
              </Text>
              <Switch
                value={matchmaking}
                onValueChange={setMatchmaking}
                trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
                thumbColor={matchmaking ? ORANGE : '#F8FAFC'}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>
                Allow interest requests and match chat after mutual acceptance
              </Text>
              <Switch
                value={communication}
                onValueChange={setCommunication}
                trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
                thumbColor={communication ? ORANGE : '#F8FAFC'}
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
              Matrimony Details
            </Text>
            <Text style={[styles.label, { color: colors.text, fontFamily }]}>Height (cm) *</Text>
            <TextInput
              style={inputStyle}
              keyboardType="numeric"
              placeholder="e.g. 170"
              placeholderTextColor={colors.textSecondary}
              value={heightCm}
              onChangeText={setHeightCm}
            />

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>Mother Tongue *</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Telugu, Tamil, English"
              placeholderTextColor={colors.textSecondary}
              value={motherTongue}
              onChangeText={setMotherTongue}
            />

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>Highest Qualification *</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. B.Tech, MBA, MBBS"
              placeholderTextColor={colors.textSecondary}
              value={qualification}
              onChangeText={setQualification}
            />

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>Specialization</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Computer Science"
              placeholderTextColor={colors.textSecondary}
              value={specialization}
              onChangeText={setSpecialization}
            />

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>Occupation Category</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. IT / Software, Healthcare, Ministry"
              placeholderTextColor={colors.textSecondary}
              value={occupationCategory}
              onChangeText={setOccupationCategory}
            />

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>Profession / Role *</Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. Software Engineer"
              placeholderTextColor={colors.textSecondary}
              value={profession}
              onChangeText={setProfession}
            />

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>About Me</Text>
            <TextInput
              style={[...inputStyle, { height: 90, textAlignVertical: 'top' }]}
              multiline
              placeholder="Share a brief introduction about your faith, values, and life..."
              placeholderTextColor={colors.textSecondary}
              value={aboutMe}
              onChangeText={setAboutMe}
            />
          </View>
        )}

        {step === 3 && (
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
              Preferences & Photo
            </Text>

            <View style={styles.photoBox}>
              {photoPreviewUri ? (
                <Image source={{ uri: photoPreviewUri }} style={styles.photoPreview} />
              ) : (
                <View style={[styles.photoPreview, styles.photoEmpty]}>
                  <Camera size={28} color={colors.textSecondary} />
                </View>
              )}
              <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto} disabled={uploadingPhoto}>
                <Text style={[styles.photoBtnText, { fontFamily }]}>
                  {uploadingPhoto ? 'Uploading...' : 'Choose / Change Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>
                Show photo only to mutual matches
              </Text>
              <Switch
                value={photoVisibility === 'matches_only'}
                onValueChange={(v) => setPhotoVisibility(v ? 'matches_only' : 'approved_members')}
                trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
                thumbColor={photoVisibility === 'matches_only' ? ORANGE : '#F8FAFC'}
              />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text, fontFamily }]}>Preferred Min Age</Text>
                <TextInput style={inputStyle} keyboardType="numeric" value={minAge} onChangeText={setMinAge} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text, fontFamily }]}>Preferred Max Age</Text>
                <TextInput style={inputStyle} keyboardType="numeric" value={maxAge} onChangeText={setMaxAge} />
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>Open to relocation</Text>
              <Switch
                value={openToRelocation}
                onValueChange={setOpenToRelocation}
                trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
                thumbColor={openToRelocation ? ORANGE : '#F8FAFC'}
              />
            </View>

            <Text style={[styles.label, { color: colors.text, fontFamily }]}>Partner Expectations</Text>
            <TextInput
              style={[...inputStyle, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Optional faith, family, or lifestyle expectations..."
              placeholderTextColor={colors.textSecondary}
              value={partnerExpectations}
              onChangeText={setPartnerExpectations}
            />
          </View>
        )}

        <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} disabled={saving || uploadingPhoto}>
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(16) }]}>
                {step === 3 ? 'Activate Matrimony Profile' : 'Save & Continue'}
              </Text>
              {step === 3 && <Check size={18} color="#FFFFFF" />}
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '800' },
  progressBarBg: { height: 4, marginHorizontal: 16, borderRadius: 2 },
  progressBarFill: { height: 4, backgroundColor: ORANGE, borderRadius: 2 },
  content: { padding: 16, paddingBottom: 36, gap: 16 },
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  cardTitle: { fontWeight: '800' },
  cardSub: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  switchLabel: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  photoBox: { alignItems: 'center', gap: 10, marginVertical: 6 },
  photoPreview: { width: 96, height: 96, borderRadius: 48 },
  photoEmpty: { backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  photoBtn: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  photoBtnText: { color: ORANGE, fontWeight: '700', fontSize: 13 },
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
});
