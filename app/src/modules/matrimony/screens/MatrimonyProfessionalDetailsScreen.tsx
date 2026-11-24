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
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronDown, Check, X, Search } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import {
  EDUCATION_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  OCCUPATION_OPTIONS,
  CURRENCY_OPTIONS,
  INCOME_OPTIONS_INR,
  INCOME_OPTIONS_GLOBAL,
  SidebarOptionItem,
} from '../constants/professionalOptions';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';
import { getProfileSubjectFromContext } from '../utils/profileSubject';

const ORANGE = '#EA580C';

type SidebarType = 'education' | 'employment' | 'occupation' | 'currency' | 'income' | null;

export default function MatrimonyProfessionalDetailsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;
  const subjectCopy = getProfileSubjectFromContext(route?.params?.draftData, initialData);
  const edu = initialData?.profile?.education;
  const career = initialData?.profile?.career as any;

  const [education, setEducation] = useState<string>(edu?.qualification || '');
  const [employmentType, setEmploymentType] = useState<string>(career?.employmentType || '');
  const [occupation, setOccupation] = useState<string>(career?.profession || '');
  const [organization, setOrganization] = useState<string>(career?.organization || '');
  const [currency, setCurrency] = useState<string>('');
  const [annualIncome, setAnnualIncome] = useState<string>('');

  const [activeSidebar, setActiveSidebar] = useState<SidebarType>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const sidebarConfig = (() => {
    if (activeSidebar === 'education') {
      return {
        title: subjectCopy.educationPlaceholder,
        searchPlaceholder: 'Search education details',
        searchable: true,
        options: EDUCATION_OPTIONS,
        selected: education,
        onSelect: (val: string) => setEducation(val),
      };
    }
    if (activeSidebar === 'employment') {
      return {
        title: subjectCopy.employmentPlaceholder,
        searchPlaceholder: '',
        searchable: false,
        options: EMPLOYMENT_TYPE_OPTIONS,
        selected: employmentType,
        onSelect: (val: string) => setEmploymentType(val),
      };
    }
    if (activeSidebar === 'occupation') {
      return {
        title: subjectCopy.occupationPlaceholder,
        searchPlaceholder: 'Search occupation',
        searchable: true,
        options: OCCUPATION_OPTIONS,
        selected: occupation,
        onSelect: (val: string) => setOccupation(val),
      };
    }
    if (activeSidebar === 'currency') {
      return {
        title: 'Select annual income currency',
        searchPlaceholder: 'Search currency',
        searchable: true,
        options: CURRENCY_OPTIONS,
        selected: currency,
        onSelect: (val: string) => {
          if (val !== currency) setAnnualIncome('');
          setCurrency(val);
        },
      };
    }
    if (activeSidebar === 'income') {
      return {
        title: subjectCopy.incomePlaceholder,
        searchPlaceholder: '',
        searchable: false,
        options: currency.startsWith('INR') ? INCOME_OPTIONS_INR : INCOME_OPTIONS_GLOBAL,
        selected: annualIncome,
        onSelect: (val: string) => setAnnualIncome(val),
      };
    }
    return null;
  })();

  const filteredOptions: SidebarOptionItem[] = useMemo(() => {
    const list = sidebarConfig?.options || [];
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => !item.isHeader && item.label.toLowerCase().includes(q));
  }, [sidebarConfig, sidebarSearch]);

  const openSidebar = (type: SidebarType) => {
    setSidebarSearch('');
    setActiveSidebar(type);
  };

  const handleNext = () => {
    if (!education) {
      Alert.alert('Required', subjectCopy.educationRequiredMsg);
      return;
    }
    if (!employmentType) {
      Alert.alert('Required', subjectCopy.employmentRequiredMsg);
      return;
    }
    if (!occupation) {
      Alert.alert('Required', subjectCopy.occupationRequiredMsg);
      return;
    }

    const existingDraft: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};
    const draftData: MatrimonyPendingRegistrationDraft = {
      ...existingDraft,
      professional: {
        qualification: education,
        employmentType,
        profession: occupation,
        organization: organization.trim(),
        incomeCurrency: currency,
        incomeRange: annualIncome,
      },
    };

    navigation.navigate('MatrimonyAdditionalDetails', {
      draftData,
      initialData: initialData
        ? {
            ...initialData,
            profile: initialData.profile
              ? {
                  ...initialData.profile,
                  education: { ...(initialData.profile.education || {}), qualification: education },
                  career: { ...(initialData.profile.career || {}), profession: occupation },
                }
              : initialData.profile,
          }
        : initialData,
    });
  };

  const borderColor = isDark ? '#475569' : '#94A3B8';

  const renderFloatingField = (
    floatingLabel: string,
    value: string,
    placeholder: string,
    onPress: () => void
  ) => (
    <View style={styles.floatingBoxWrap}>
      <Text
        style={[
          styles.floatingLabel,
          { backgroundColor: colors.bg, color: colors.textSecondary, fontFamily },
        ]}
      >
        {floatingLabel}
      </Text>
      <TouchableOpacity
        style={[styles.dropdownBtn, { backgroundColor: colors.surface, borderColor }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.dropdownBtnText,
            {
              color: value ? colors.text : colors.textSecondary,
              fontFamily,
              fontSize: scaleFont(14),
            },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <ChevronDown size={19} color={ORANGE} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          Professional Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <MatrimonyProgressBar currentStep={5} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {renderFloatingField(
          subjectCopy.educationLabel,
          education,
          subjectCopy.educationPlaceholder,
          () => openSidebar('education')
        )}

        {Boolean(education) &&
          renderFloatingField(
            subjectCopy.employmentLabel,
            employmentType,
            subjectCopy.employmentPlaceholder,
            () => openSidebar('employment')
          )}

        {Boolean(education) &&
          Boolean(employmentType) &&
          renderFloatingField(
            subjectCopy.occupationLabel,
            occupation,
            subjectCopy.occupationPlaceholder,
            () => openSidebar('occupation')
          )}

        {Boolean(education) && Boolean(employmentType) && Boolean(occupation) && (
          <>
            <View style={styles.orgSection}>
              <Text style={[styles.orgLabel, { color: colors.text, fontFamily, fontSize: scaleFont(14) }]}>
                {subjectCopy.orgWorkPhrase}{' '}
                <Text style={{ color: '#0D9488', fontWeight: '700' }}>{occupation}</Text>{' '}
                <Text style={{ color: colors.textSecondary, fontWeight: '500', fontSize: scaleFont(12) }}>
                  (Optional)
                </Text>
              </Text>
              <TextInput
                style={[
                  styles.orgInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor,
                    color: colors.text,
                    fontFamily,
                    fontSize: scaleFont(14),
                  },
                ]}
                placeholder="Enter organization name"
                placeholderTextColor={colors.textSecondary}
                value={organization}
                onChangeText={setOrganization}
              />
            </View>

            <Text style={[styles.sectionHeading, { color: colors.text, fontFamily, fontSize: scaleFont(16) }]}>
              Annual Income
            </Text>

            {renderFloatingField(
              subjectCopy.currencyLabel,
              currency,
              'Select currency',
              () => openSidebar('currency')
            )}

            {Boolean(currency) &&
              renderFloatingField(
                subjectCopy.incomeLabel,
                annualIncome,
                subjectCopy.incomePlaceholder,
                () => openSidebar('income')
              )}
          </>
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

      {/* Right Sidebar Card Modal */}
      <Modal
        visible={Boolean(sidebarConfig)}
        animationType="fade"
        transparent
        onRequestClose={() => setActiveSidebar(null)}
      >
        <View style={styles.sidebarBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setActiveSidebar(null)}
          />
          <SafeAreaView
            style={[styles.sidebarCard, { backgroundColor: colors.surface }]}
            edges={['top', 'bottom']}
          >
            <View style={[styles.sidebarTop, { borderBottomColor: colors.border }]}>
              {sidebarConfig?.searchable && (
                <View
                  style={[
                    styles.searchBox,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Search size={17} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text, fontFamily, fontSize: scaleFont(14) }]}
                    placeholder={sidebarConfig.searchPlaceholder || 'Search...'}
                    placeholderTextColor={colors.textSecondary}
                    value={sidebarSearch}
                    onChangeText={setSidebarSearch}
                  />
                  <TouchableOpacity onPress={() => setActiveSidebar(null)}>
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.sidebarTitleRow}>
                <Text style={[styles.sidebarTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                  {sidebarConfig?.title}
                </Text>
                {!sidebarConfig?.searchable && (
                  <TouchableOpacity onPress={() => setActiveSidebar(null)}>
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <FlatList
              style={{ flex: 1 }}
              data={filteredOptions}
              keyExtractor={(item, idx) => `${item.label}_${idx}`}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              renderItem={({ item }) => {
                if (item.isHeader) {
                  return (
                    <View
                      style={[
                        styles.groupHeaderRow,
                        { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.groupHeaderText,
                          { color: colors.textSecondary, fontFamily, fontSize: scaleFont(12) },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  );
                }

                const isSelected = sidebarConfig?.selected === item.label;
                return (
                  <TouchableOpacity
                    style={[
                      styles.sidebarRow,
                      { borderBottomColor: colors.border },
                      isSelected && {
                        backgroundColor: isDark ? 'rgba(234, 88, 12, 0.16)' : '#FFF7ED',
                      },
                    ]}
                    onPress={() => {
                      sidebarConfig?.onSelect(item.label);
                      setActiveSidebar(null);
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? ORANGE : colors.text,
                        fontWeight: isSelected ? '700' : '500',
                        fontFamily,
                        fontSize: scaleFont(14),
                        flex: 1,
                      }}
                    >
                      {item.label}
                    </Text>
                    {isSelected && <Check size={17} color={ORANGE} />}
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
  content: { padding: 18, paddingBottom: 28, gap: 16 },
  orgSection: { gap: 8, marginTop: 2 },
  orgLabel: { fontWeight: '700' },
  orgInput: {
    borderWidth: 1.2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontWeight: '600',
  },
  sectionHeading: { fontWeight: '800', marginTop: 6 },
  floatingBoxWrap: {
    position: 'relative',
    paddingTop: 8,
  },
  floatingLabel: {
    position: 'absolute',
    top: 0,
    left: 14,
    zIndex: 2,
    paddingHorizontal: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dropdownBtnText: { fontWeight: '700', flex: 1, marginRight: 8 },
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
  sidebarBackdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sidebarCard: {
    width: '82%',
    height: '100%',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: 'hidden',
    elevation: 12,
  },
  sidebarTop: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
  },
  sidebarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sidebarTitle: { fontWeight: '800' },
  groupHeaderRow: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  groupHeaderText: {
    fontWeight: '700',
  },
  sidebarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
