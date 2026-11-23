import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronDown, Check, X, Search } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';
import { getProfileSubjectFromContext } from '../utils/profileSubject';

const ORANGE = '#EA580C';

const COUNTRY_OPTIONS = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'United Arab Emirates',
  'Singapore',
  'Malaysia',
  'Germany',
  'New Zealand',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Oman',
  'Ireland',
  'France',
  'Netherlands',
  'South Africa',
  'Philippines',
  'Other',
];

const INDIA_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Chandigarh',
  'Andaman and Nicobar Islands',
  'Other',
];

const GLOBAL_STATES = [
  'California',
  'Texas',
  'New York',
  'New Jersey',
  'Illinois',
  'Washington',
  'Ontario',
  'British Columbia',
  'Alberta',
  'London / Greater London',
  'New South Wales',
  'Victoria',
  'Queensland',
  'Dubai',
  'Abu Dhabi',
  'Central Region',
  'Other',
];

type SidebarType = 'country' | 'state' | null;

export default function MatrimonyLocationDetailsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;
  const subjectCopy = getProfileSubjectFromContext(route?.params?.draftData, initialData);
  const loc = (initialData?.profile?.location as any) || {};

  const hasSavedLocation = Boolean(loc.pincode || loc.village);
  const [country, setCountry] = useState<string>(hasSavedLocation ? loc.country || '' : '');
  const [residentState, setResidentState] = useState<string>(hasSavedLocation ? loc.state || '' : '');
  const [village, setVillage] = useState<string>(hasSavedLocation ? loc.village || '' : '');
  const [pincode, setPincode] = useState<string>(hasSavedLocation ? loc.pincode || '' : '');

  const [activeSidebar, setActiveSidebar] = useState<SidebarType>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const sidebarConfig = (() => {
    if (activeSidebar === 'country') {
      return {
        title: subjectCopy.isFamily ? `Select ${subjectCopy.possessive} country` : 'Select country',
        searchPlaceholder: 'Search country',
        options: COUNTRY_OPTIONS,
        selected: country,
        onSelect: (val: string) => {
          if (val !== country) setResidentState('');
          setCountry(val);
        },
      };
    }
    if (activeSidebar === 'state') {
      return {
        title: subjectCopy.stateQuestion,
        searchPlaceholder: 'Search state',
        options: country === 'India' ? INDIA_STATES : GLOBAL_STATES,
        selected: residentState,
        onSelect: (val: string) => setResidentState(val),
      };
    }
    return null;
  })();

  const filteredOptions = useMemo(() => {
    const list = sidebarConfig?.options || [];
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => item.toLowerCase().includes(q));
  }, [sidebarConfig, sidebarSearch]);

  const openSidebar = (type: SidebarType) => {
    setSidebarSearch('');
    setActiveSidebar(type);
  };

  const handleNext = () => {
    if (!country) {
      Alert.alert('Required', subjectCopy.countryRequiredMsg);
      return;
    }
    if (!residentState) {
      Alert.alert('Required', subjectCopy.stateRequiredMsg);
      return;
    }

    const existingDraft: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};
    const draftData: MatrimonyPendingRegistrationDraft = {
      ...existingDraft,
      location: {
        country,
        state: residentState,
        village: village.trim(),
        pincode: pincode.trim(),
      },
    };

    navigation.navigate('MatrimonyProfessionalDetails', { initialData, draftData });
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
          Location Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <MatrimonyProgressBar currentStep={4} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Country */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            {subjectCopy.countryQuestion}
          </Text>
          <TouchableOpacity
            style={[styles.dropdownBtn, { backgroundColor: colors.surface, borderColor }]}
            onPress={() => openSidebar('country')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.dropdownBtnText,
                {
                  color: country ? colors.text : colors.textSecondary,
                  fontFamily,
                  fontSize: scaleFont(14),
                },
              ]}
            >
              {country || 'Select country'}
            </Text>
            <ChevronDown size={19} color={ORANGE} />
          </TouchableOpacity>
        </View>

        {/* Resident State (shown after Country is selected) */}
        {Boolean(country) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
              {subjectCopy.stateQuestion}
            </Text>
            <TouchableOpacity
              style={[styles.dropdownBtn, { backgroundColor: colors.surface, borderColor }]}
              onPress={() => openSidebar('state')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.dropdownBtnText,
                  {
                    color: residentState ? colors.text : colors.textSecondary,
                    fontFamily,
                    fontSize: scaleFont(14),
                  },
                ]}
              >
                {residentState || subjectCopy.statePlaceholder}
              </Text>
              <ChevronDown size={19} color={ORANGE} />
            </TouchableOpacity>
          </View>
        )}

        {/* Village / City (shown right below Resident State once selected) */}
        {Boolean(country) && Boolean(residentState) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
              {subjectCopy.villageQuestion}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor,
                  color: colors.text,
                  fontFamily,
                  fontSize: scaleFont(14),
                },
              ]}
              placeholder={subjectCopy.villagePlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={village}
              onChangeText={setVillage}
            />
          </View>
        )}

        {/* Pin Code (shown after Village / City has value) */}
        {Boolean(country) && Boolean(residentState) && Boolean(village.trim()) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
              {subjectCopy.pincodeQuestion}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor,
                  color: colors.text,
                  fontFamily,
                  fontSize: scaleFont(14),
                },
              ]}
              placeholder="Enter pin code"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              value={pincode}
              onChangeText={setPincode}
            />
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

      {/* Searchable Right Sidebar Card Modal */}
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
                  placeholder={sidebarConfig?.searchPlaceholder || 'Search...'}
                  placeholderTextColor={colors.textSecondary}
                  value={sidebarSearch}
                  onChangeText={setSidebarSearch}
                />
                <TouchableOpacity onPress={() => setActiveSidebar(null)}>
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.sidebarTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                {sidebarConfig?.title}
              </Text>
            </View>

            <FlatList
              style={{ flex: 1 }}
              data={filteredOptions}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              renderItem={({ item }) => {
                const isSelected = sidebarConfig?.selected === item;
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
                      sidebarConfig?.onSelect(item);
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
                      {item}
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
  content: { padding: 18, paddingBottom: 28, gap: 18 },
  section: { gap: 8 },
  sectionTitle: { fontWeight: '800' },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dropdownBtnText: { fontWeight: '600', flex: 1 },
  input: {
    borderWidth: 1.2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontWeight: '600',
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
  sidebarBackdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sidebarCard: {
    width: '80%',
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
  sidebarTitle: { fontWeight: '800' },
  sidebarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
