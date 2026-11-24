import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';
import { getProfileSubjectFromContext } from '../utils/profileSubject';

const ORANGE = '#EA580C';
const ORANGE_BORDER = '#FDBA74';

const FAMILY_STATUS_OPTIONS = [
  'Middle Class',
  'Upper Middle Class',
  'Rich / Affluent',
];

export default function MatrimonyAdditionalDetailsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;
  const subjectCopy = getProfileSubjectFromContext(route?.params?.draftData, initialData);
  const fam = (initialData?.profile?.familySummary as any) || {};

  const [familyStatus, setFamilyStatus] = useState<string>(fam.familyStatus || '');
  const [aboutMe, setAboutMe] = useState<string>(initialData?.profile?.aboutMe || '');

  const handleNext = () => {
    if (!familyStatus) {
      Alert.alert('Required', subjectCopy.familyStatusRequiredMsg);
      return;
    }

    const existingDraft: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};
    const draftData: MatrimonyPendingRegistrationDraft = {
      ...existingDraft,
      additional: {
        familyStatus,
        aboutMe: aboutMe.trim(),
      },
    };

    navigation.navigate('MatrimonyConsent', {
      draftData,
      initialData: initialData
        ? {
            ...initialData,
            profile: initialData.profile
              ? {
                  ...initialData.profile,
                  aboutMe: aboutMe.trim(),
                }
              : initialData.profile,
          }
        : initialData,
    });
  };

  const borderColor = isDark ? '#475569' : '#94A3B8';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          Additional Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <MatrimonyProgressBar currentStep={5} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Family Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            {subjectCopy.familyStatusQuestion}
          </Text>
          <View style={styles.pillRow}>
            {FAMILY_STATUS_OPTIONS.map((opt) => {
              const isSelected = familyStatus === opt;
              return (
                <TouchableOpacity
                  key={opt}
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
                  onPress={() => setFamilyStatus(opt)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.optionPillText,
                      {
                        color: isSelected ? (isDark ? '#FDBA74' : '#C2410C') : colors.text,
                        fontFamily,
                        fontSize: scaleFont(13),
                      },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* A few words about profile subject */}
        {Boolean(familyStatus) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
              {subjectCopy.aboutTitle}
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: colors.surface,
                  borderColor,
                  color: colors.text,
                  fontFamily,
                  fontSize: scaleFont(14),
                },
              ]}
              multiline
              maxLength={1000}
              placeholder={subjectCopy.aboutPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={aboutMe}
              onChangeText={setAboutMe}
            />
            <Text style={[styles.charCount, { color: colors.textSecondary, fontFamily }]}>
              {aboutMe.length} / 1000
            </Text>
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
          <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
            Next
          </Text>
        </TouchableOpacity>
      </View>
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
  content: { padding: 18, paddingBottom: 28, gap: 22 },
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
  textArea: {
    borderWidth: 1.2,
    borderRadius: 14,
    padding: 14,
    minHeight: 130,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
  },
  bottomFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
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
});
