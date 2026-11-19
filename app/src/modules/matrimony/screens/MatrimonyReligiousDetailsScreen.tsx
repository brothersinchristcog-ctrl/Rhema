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
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronDown, Check, X, Search } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';

const ORANGE = '#EA580C';

const RELIGION_OPTIONS = [
  'Christian',
  'Christian - Protestant',
  'Christian - Pentecostal',
  'Christian - Evangelical',
  'Christian - Catholic',
  'Christian - Orthodox',
  'Christian - Non-Denominational',
  'Other',
];

const DENOMINATION_OPTIONS = [
  'Rhema Global Ministries',
  'Adventist',
  'Anglican / Episcopal',
  'Apostolic',
  'Assyrian',
  'Assembly of God (AG)',
  'Baptist',
  'Born Again',
  'Brethren',
  'Calvinist',
  'Catholic',
  'Church of God',
  'Church of South India (CSI)',
  'Church of North India (CNI)',
  'Church of Christ',
  'Evangelical',
  'Full Gospel',
  'Jacobite',
  'Knanaya',
  'Knanaya Catholic',
  'Knanaya Jacobite',
  'Latin Catholic',
  'Lutheran',
  'Malankara',
  'Malabar Independent Syrian Church',
  'Marthoma',
  'Melkite',
  'Mennonite',
  'Methodist',
  'Moravian',
  'Non-Denominational',
  'Orthodox',
  'Pentecostal',
  'Presbyterian',
  'Protestant',
  'Reformed Baptist',
  'Reformed Presbyterian',
  'Seventh-day Adventist',
  'St. Thomas Evangelical',
  'Syro Malabar',
  'Syrian Catholic',
  'Syrian Jacobite',
  'Syrian Orthodox',
  'Others',
];

const DIVISION_OPTIONS = [
  'Adi Dravidar',
  'Anglo Indian',
  'Chettiar / Chettiyar',
  'Thevar / Mukkulathor',
  'Paravar / Bharathar / Fernando',
  'Garo',
  'Goan',
  'Gounder',
  'Intercaste',
  'Kamma',
  'Kapu',
  'Khasi',
  'Knanaya',
  'Madiga',
  'Mahar',
  'Mala',
  'Matang',
  'Mangalorean',
  'Mudaliar / Mudaliyar',
  'Mukkuvar',
  'Mizo',
  'Nadar',
  'Naga',
  'Naidu',
  'Oraon / Kurukh',
  'Padmashali / Padmasali',
  'Pallar / Devendrakula Vellalar',
  'Parkavakulam / Udayar',
  'Pillai',
  'Pulayar / Cheramar / Cherumar',
  'Rajaka / Vannar',
  'Reddy',
  'Sambavar',
  'SC',
  'Setti Balija',
  'ST',
  'Vaniya Chettiar',
  'Vanniya Kula Kshatriyar',
  'Vellalar',
  'Vishwakarma',
  'Yadav / Yadavar',
  'Others',
  "Don't wish to specify",
  "Don't know division",
];

type SidebarType = 'religion' | 'denomination' | 'division' | null;

export default function MatrimonyReligiousDetailsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;
  const faith = (initialData?.profile?.faithSummary as any) || {};

  const [religion, setReligion] = useState<string>(faith.religion || '');
  const [denomination, setDenomination] = useState<string>(faith.denomination || '');
  const [division, setDivision] = useState<string>(faith.division || '');
  const [openToAnyDivision, setOpenToAnyDivision] = useState<boolean>(
    Boolean(faith.openToAnyDivision)
  );

  const [activeSidebar, setActiveSidebar] = useState<SidebarType>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const sidebarConfig = (() => {
    if (activeSidebar === 'religion') {
      return {
        title: 'Select religion',
        searchPlaceholder: 'Search religion',
        options: RELIGION_OPTIONS,
        selected: religion,
        onSelect: (val: string) => setReligion(val),
      };
    }
    if (activeSidebar === 'denomination') {
      return {
        title: 'Select denomination',
        searchPlaceholder: 'Search denomination',
        options: DENOMINATION_OPTIONS,
        selected: denomination,
        onSelect: (val: string) => setDenomination(val),
      };
    }
    if (activeSidebar === 'division') {
      return {
        title: 'Select division',
        searchPlaceholder: 'Search division',
        options: DIVISION_OPTIONS,
        selected: division,
        onSelect: (val: string) => setDivision(val),
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
    if (!religion) {
      Alert.alert('Required', 'Please select your religion.');
      return;
    }
    if (!denomination) {
      Alert.alert('Required', 'Please select your denomination.');
      return;
    }

    const existingDraft: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};
    const draftData: MatrimonyPendingRegistrationDraft = {
      ...existingDraft,
      religious: {
        religion,
        denomination,
        division,
        openToAnyDivision,
      },
    };

    navigation.navigate('MatrimonyLocationDetails', { initialData, draftData });
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
          Religious Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <MatrimonyProgressBar currentStep={3} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Religion */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
            Religion
          </Text>
          <TouchableOpacity
            style={[styles.dropdownBtn, { backgroundColor: colors.surface, borderColor }]}
            onPress={() => openSidebar('religion')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.dropdownBtnText,
                {
                  color: religion ? colors.text : colors.textSecondary,
                  fontFamily,
                  fontSize: scaleFont(14),
                },
              ]}
            >
              {religion || 'Select religion'}
            </Text>
            <ChevronDown size={19} color={ORANGE} />
          </TouchableOpacity>
        </View>

        {/* Denomination shown only after Religion is selected */}
        {Boolean(religion) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
              Denomination
            </Text>
            <TouchableOpacity
              style={[styles.dropdownBtn, { backgroundColor: colors.surface, borderColor }]}
              onPress={() => openSidebar('denomination')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.dropdownBtnText,
                  {
                    color: denomination ? colors.text : colors.textSecondary,
                    fontFamily,
                    fontSize: scaleFont(14),
                  },
                ]}
              >
                {denomination || 'Select denomination'}
              </Text>
              <ChevronDown size={19} color={ORANGE} />
            </TouchableOpacity>
          </View>
        )}

        {/* Division shown only after Denomination is selected */}
        {Boolean(religion) && Boolean(denomination) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
              Division
            </Text>
            <TouchableOpacity
              style={[styles.dropdownBtn, { backgroundColor: colors.surface, borderColor }]}
              onPress={() => openSidebar('division')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.dropdownBtnText,
                  {
                    color: division ? colors.text : colors.textSecondary,
                    fontFamily,
                    fontSize: scaleFont(14),
                  },
                ]}
              >
                {division || 'Select division'}
              </Text>
              <ChevronDown size={19} color={ORANGE} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setOpenToAnyDivision((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.checkboxBox,
                  {
                    borderColor: openToAnyDivision ? ORANGE : borderColor,
                    backgroundColor: openToAnyDivision ? ORANGE : 'transparent',
                  },
                ]}
              >
                {openToAnyDivision && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <Text style={[styles.checkboxLabel, { color: colors.text, fontFamily, fontSize: scaleFont(14) }]}>
                Open to marry from any division
              </Text>
            </TouchableOpacity>
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
  content: { padding: 18, paddingBottom: 28, gap: 20 },
  section: { gap: 10 },
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: { fontWeight: '600', flex: 1 },
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
