import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronDown, Calendar, Check, X } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';
import { getProfileSubjectFromContext } from '../utils/profileSubject';

const ORANGE = '#EA580C';
const ORANGE_BORDER = '#FDBA74';

const HEIGHT_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalInches = 52 + i; // 4ft 4in (132cm) to 7ft 0in (213cm)
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const cm = Math.round(totalInches * 2.54);
  return {
    cm,
    label: `${feet} ft ${inches} in (${cm} cm)`,
  };
});

const GENDER_OPTIONS = ['Male', 'Female'];
const PHYSICAL_STATUS_OPTIONS = ['Normal', 'Physically challenged'];
const MARITAL_STATUS_OPTIONS = ['Never Married', 'Widowed', 'Divorced', 'Awaiting Divorce'];
const CHILDREN_OPTIONS = ['None', '1', '2', '3', '4', '5+'];

function computeAge(dobStr: string): number | null {
  if (!dobStr) return null;
  const d = new Date(dobStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

export default function MatrimonyPersonalDetailsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;
  const isFamilyProfile = route?.params?.draftData?.welcome?.managedBy === 'guardian';
  const subjectCopy = getProfileSubjectFromContext(route?.params?.draftData, initialData);

  const initialMaritalRaw = isFamilyProfile
    ? initialData?.profile?.maritalStatus || 'Never Married'
    : initialData?.profile?.maritalStatus || (member as any)?.maritalStatus || 'Never Married';
  const normalizedMarital =
    initialMaritalRaw.toLowerCase() === 'single' ? 'Never Married' : initialMaritalRaw;

  const [gender, setGender] = useState<string>(
    isFamilyProfile
      ? initialData?.profile?.gender || ''
      : initialData?.profile?.gender || (member as any)?.gender || ''
  );
  const [dob, setDob] = useState<string>(
    isFamilyProfile
      ? initialData?.contactInfo?.dob || ''
      : initialData?.contactInfo?.dob || member?.dob || ''
  );
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);

  const [heightCm, setHeightCm] = useState<number | null>(
    initialData?.profile?.heightCm || null
  );
  const [heightDrawerVisible, setHeightDrawerVisible] = useState(false);

  const [physicalStatus, setPhysicalStatus] = useState<string>(
    (initialData?.profile as any)?.physicalStatus || 'Normal'
  );
  const [maritalStatus, setMaritalStatus] = useState<string>(normalizedMarital);
  const [numberOfChildren, setNumberOfChildren] = useState<string>(
    (initialData?.profile as any)?.numberOfChildren || 'None'
  );

  const age = useMemo(() => computeAge(dob), [dob]);

  const selectedHeightLabel = useMemo(() => {
    if (!heightCm) return '';
    const match = HEIGHT_OPTIONS.find((h) => h.cm === heightCm);
    return match ? match.label : `${heightCm} cm`;
  }, [heightCm]);

  const handleConfirmDate = (date: Date) => {
    const formatted = date.toISOString().split('T')[0];
    setDob(formatted);
    setDatePickerVisible(false);
  };

  const handleNext = () => {
    if (!gender) {
      Alert.alert('Required', subjectCopy.genderRequiredMsg);
      return;
    }
    if (!dob || age === null || age < 18) {
      Alert.alert('Age Requirement', subjectCopy.dobAgeRequiredMsg);
      return;
    }
    if (!heightCm) {
      Alert.alert('Required', subjectCopy.heightRequiredMsg);
      return;
    }

    const existingDraft: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};
    const draftData: MatrimonyPendingRegistrationDraft = {
      ...existingDraft,
      personal: {
        gender,
        dob,
        heightCm,
        physicalStatus,
        maritalStatus,
        numberOfChildren,
      },
    };

    navigation.navigate('MatrimonyReligiousDetails', {
      draftData,
      initialData: initialData
        ? {
            ...initialData,
            profile: initialData.profile
              ? {
                  ...initialData.profile,
                  gender,
                  age,
                  heightCm,
                  maritalStatus,
                }
              : initialData.profile,
          }
        : initialData,
    });
  };

  const renderGlassPill = (
    label: string,
    isSelected: boolean,
    onPress: () => void
  ) => (
    <TouchableOpacity
      key={label}
      style={[
        styles.optionPill,
        {
          backgroundColor: isSelected
            ? isDark
              ? 'rgba(234, 88, 12, 0.22)'
              : 'rgba(234, 88, 12, 0.12)'
            : colors.surface,
          borderColor: isSelected ? ORANGE : ORANGE_BORDER,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text
        style={[
          styles.optionPillText,
          {
            color: isSelected ? (isDark ? '#FDBA74' : '#C2410C') : colors.text,
            fontFamily,
            fontSize: scaleFont(14),
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          Personal Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <MatrimonyProgressBar currentStep={2} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Gender */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            {subjectCopy.genderQuestion}
          </Text>
          <View style={styles.pillRow}>
            {GENDER_OPTIONS.map((g) => renderGlassPill(g, gender === g, () => setGender(g)))}
          </View>
        </View>

        {/* Date of Birth & Age Banner */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            {subjectCopy.dobQuestion}
          </Text>
          <TouchableOpacity
            style={[
              styles.dropdownBtn,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? '#475569' : '#94A3B8',
              },
            ]}
            onPress={() => setDatePickerVisible(true)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.dropdownBtnText,
                {
                  color: dob ? colors.text : colors.textSecondary,
                  fontFamily,
                  fontSize: scaleFont(15),
                },
              ]}
            >
              {dob || 'Select date of birth'}
            </Text>
            <Calendar size={19} color={ORANGE} />
          </TouchableOpacity>

          {age !== null && (
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(234, 88, 12, 0.24)', 'rgba(234, 88, 12, 0.02)']
                  : ['rgba(234, 88, 12, 0.14)', 'rgba(255, 255, 255, 0.0)']
              }
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.ageBanner, { borderColor: isDark ? 'rgba(234,88,12,0.35)' : '#FED7AA' }]}
            >
              <Text style={[styles.ageText, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                {subjectCopy.agePrefix} <Text style={{ fontWeight: '800' }}>{age} years</Text> old
              </Text>
            </LinearGradient>
          )}
        </View>

        {/* Height */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            {subjectCopy.heightQuestion}
          </Text>
          <TouchableOpacity
            style={[
              styles.dropdownBtn,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? '#475569' : '#94A3B8',
              },
            ]}
            onPress={() => setHeightDrawerVisible(true)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.dropdownBtnText,
                {
                  color: selectedHeightLabel ? colors.text : colors.textSecondary,
                  fontFamily,
                  fontSize: scaleFont(15),
                },
              ]}
            >
              {selectedHeightLabel || subjectCopy.heightPlaceholder}
            </Text>
            <ChevronDown size={20} color={ORANGE} />
          </TouchableOpacity>
        </View>

        {/* Physical Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            {subjectCopy.physicalStatusQuestion}
          </Text>
          <View style={styles.pillRow}>
            {PHYSICAL_STATUS_OPTIONS.map((opt) =>
              renderGlassPill(opt, physicalStatus === opt, () => setPhysicalStatus(opt))
            )}
          </View>
        </View>

        {/* Marital Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            {subjectCopy.maritalStatusQuestion}
          </Text>
          <View style={styles.pillRow}>
            {MARITAL_STATUS_OPTIONS.map((opt) =>
              renderGlassPill(opt, maritalStatus === opt, () => {
                setMaritalStatus(opt);
                if (opt === 'Never Married') {
                  setNumberOfChildren('None');
                }
              })
            )}
          </View>
        </View>

        {/* Number of Children (shown only for Widowed, Divorced, or Awaiting Divorce) */}
        {['Widowed', 'Divorced', 'Awaiting Divorce'].includes(maritalStatus) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
              Number of children
            </Text>
            <View style={styles.pillRow}>
              {CHILDREN_OPTIONS.map((opt) =>
                renderGlassPill(opt, numberOfChildren === opt, () => setNumberOfChildren(opt))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.bottomFooter,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
      >
        <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.9}>
          <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(16) }]}>
            Next
          </Text>
        </TouchableOpacity>
      </View>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        maximumDate={new Date(new Date().setFullYear(new Date().getFullYear() - 18))}
        date={dob && !Number.isNaN(new Date(dob).getTime()) ? new Date(dob) : new Date(1998, 0, 1)}
        onConfirm={handleConfirmDate}
        onCancel={() => setDatePickerVisible(false)}
      />

      {/* Right Sidebar Card Modal for Heights */}
      <Modal
        visible={heightDrawerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setHeightDrawerVisible(false)}
      >
        <View style={styles.sidebarBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setHeightDrawerVisible(false)}
          />
          <SafeAreaView
            style={[styles.sidebarCard, { backgroundColor: colors.surface }]}
            edges={['top', 'bottom']}
          >
            <View style={[styles.sidebarHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sidebarTitle, { color: colors.text, fontFamily, fontSize: scaleFont(17) }]}>
                Select Height
              </Text>
              <TouchableOpacity onPress={() => setHeightDrawerVisible(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              style={{ flex: 1 }}
              data={HEIGHT_OPTIONS}
              keyExtractor={(item) => String(item.cm)}
              showsVerticalScrollIndicator={true}
              renderItem={({ item }) => {
                const isSelected = heightCm === item.cm;
                return (
                  <TouchableOpacity
                    style={[
                      styles.heightRow,
                      { borderBottomColor: colors.border },
                      isSelected && {
                        backgroundColor: isDark ? 'rgba(234, 88, 12, 0.16)' : '#FFF7ED',
                      },
                    ]}
                    onPress={() => {
                      setHeightCm(item.cm);
                      setHeightDrawerVisible(false);
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? ORANGE : colors.text,
                        fontWeight: isSelected ? '700' : '500',
                        fontFamily,
                        fontSize: scaleFont(15),
                      }}
                    >
                      {item.label}
                    </Text>
                    {isSelected && <Check size={18} color={ORANGE} />}
                  </TouchableOpacity>
                );
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '800' },
  content: { padding: 18, paddingBottom: 28, gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontWeight: '800' },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.4,
  },
  optionPillText: { fontWeight: '700' },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownBtnText: { fontWeight: '600', flex: 1 },
  ageBanner: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderRightWidth: 0,
    minWidth: '65%',
  },
  ageText: { fontWeight: '500' },
  bottomFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
  sidebarBackdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sidebarCard: {
    width: '74%',
    height: '100%',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: 'hidden',
    elevation: 12,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sidebarTitle: { fontWeight: '800' },
  heightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
