import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import { INTEREST_CATEGORIES, InterestCategoryConfig } from '../constants/interestsOptions';
import { matrimonyApi } from '../services/matrimonyApi';

const ORANGE = '#EA580C';
const INITIAL_VISIBLE_COUNT = 14;

export default function MatrimonyInterestsScreen({ navigation, route }: any) {
  const fromEditProfile = Boolean(route?.params?.fromEditProfile);
  const initialInterests: Record<string, string[]> = route?.params?.initialInterests || {};
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  // activeIndex controls which tab is underlined at the top
  const [activeIndex, setActiveIndex] = useState(0);
  // filterIndex === null means "show all categories vertically (with scroll-spy)";
  // filterIndex === N means "user tapped tab N -> show only that category".
  const [filterIndex, setFilterIndex] = useState<number | null>(null);

  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>(initialInterests);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const tabScrollRef = useRef<ScrollView>(null);
  const verticalScrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const sectionYs = useRef<Record<number, number>>({});

  const scrollTabIntoView = (idx: number) => {
    const layout = tabLayouts.current[idx];
    if (layout && tabScrollRef.current) {
      const targetX = Math.max(0, layout.x - screenWidth / 2 + layout.width / 2);
      tabScrollRef.current.scrollTo({ x: targetX, animated: true });
    }
  };

  const handleTabPress = (idx: number) => {
    setActiveIndex(idx);
    scrollTabIntoView(idx);
    if (idx === 0) {
      // Hobbies & Interests shows the full stacked list from the top
      setFilterIndex(null);
      verticalScrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      // Tapping Music, Reading, etc. displays ONLY that category
      setFilterIndex(idx);
      verticalScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  const handleVerticalScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (filterIndex !== null) return; // Only scroll-spy when viewing all sections
    const scrollY = e.nativeEvent.contentOffset.y;
    let currentIdx = 0;
    for (let i = 0; i < INTEREST_CATEGORIES.length; i++) {
      const y = sectionYs.current[i];
      if (y !== undefined && scrollY + 60 >= y) {
        currentIdx = i;
      }
    }
    if (currentIdx !== activeIndex) {
      setActiveIndex(currentIdx);
      scrollTabIntoView(currentIdx);
    }
  };

  const toggleItem = (catKey: string, item: string) => {
    setSelectedMap((prev) => {
      const current = prev[catKey] || [];
      const next = current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item];
      return { ...prev, [catKey]: next };
    });
  };

  const toggleExpanded = (catKey: string) => {
    setExpandedMap((prev) => ({ ...prev, [catKey]: !prev[catKey] }));
  };

  const totalSelected = Object.values(selectedMap).reduce((sum, arr) => sum + arr.length, 0);

  const handleFinish = async (skipInterests: boolean) => {
    if (!fromEditProfile && !skipInterests && totalSelected === 0) {
      Alert.alert(
        'Select Interests',
        'Please select at least one hobby or interest before submitting your profile for verification.'
      );
      return;
    }

    setSubmitting(true);
    try {
      if (!skipInterests && (totalSelected > 0 || fromEditProfile)) {
        const nextInterests = {
          hobbies: selectedMap.hobbies || [],
          music: selectedMap.music || [],
          reading: selectedMap.reading || [],
          movies: selectedMap.movies || [],
          sports: selectedMap.sports || [],
          food: selectedMap.food || [],
          languages: selectedMap.languages || [],
        };
        await matrimonyApi.saveDraft('interests', nextInterests);
        matrimonyApi.patchCachedRegistration((prev) => ({
          ...prev,
          profile: prev.profile
            ? {
                ...prev.profile,
                interests: nextInterests,
              }
            : prev.profile,
        }));
      }
      if (fromEditProfile) {
        navigation.goBack();
      } else {
        navigation.navigate('MatrimonySubmitApproval', {
          initialData: route?.params?.initialData,
          interestsCount: skipInterests ? 0 : totalSelected,
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unable to complete registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const categoriesToRender: { cat: InterestCategoryConfig; originalIndex: number }[] =
    filterIndex !== null
      ? [{ cat: INTEREST_CATEGORIES[filterIndex], originalIndex: filterIndex }]
      : INTEREST_CATEGORIES.map((cat, idx) => ({ cat, originalIndex: idx }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(20) }]}>
          Select your interests
        </Text>
      </View>

      {/* Scrollable Top Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {INTEREST_CATEGORIES.map((cat, idx) => {
            const isActive = activeIndex === idx;
            return (
              <TouchableOpacity
                key={cat.key}
                onLayout={(e) => {
                  tabLayouts.current[idx] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => handleTabPress(idx)}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: isActive ? ORANGE : colors.textSecondary,
                      fontFamily,
                      fontSize: scaleFont(14),
                    },
                  ]}
                >
                  {cat.tabLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Vertical Scrollable Categories */}
      <ScrollView
        ref={verticalScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={handleVerticalScroll}
        scrollEventThrottle={16}
      >
        {categoriesToRender.map(({ cat, originalIndex }) => {
          const selected = selectedMap[cat.key] || [];
          const isExpanded = filterIndex !== null || Boolean(expandedMap[cat.key]);
          const hasMore = filterIndex === null && cat.options.length > INITIAL_VISIBLE_COUNT;
          const visibleOptions =
            isExpanded || !hasMore ? cat.options : cat.options.slice(0, INITIAL_VISIBLE_COUNT);

          return (
            <View
              key={cat.key}
              style={styles.categoryBlock}
              onLayout={(e) => {
                if (filterIndex === null) {
                  sectionYs.current[originalIndex] = e.nativeEvent.layout.y;
                }
              }}
            >
              <Text style={[styles.subHeading, { color: colors.text, fontFamily, fontSize: scaleFont(16) }]}>
                {cat.heading}
              </Text>

              <View style={styles.pillWrap}>
                {visibleOptions.map((item) => {
                  const isSelected = selected.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(234, 88, 12, 0.22)'
                              : 'rgba(234, 88, 12, 0.12)'
                            : colors.surface,
                          borderColor: isSelected ? ORANGE : isDark ? '#475569' : '#CBD5E1',
                        },
                      ]}
                      onPress={() => toggleItem(cat.key, item)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          {
                            color: isSelected ? (isDark ? '#FDBA74' : '#C2410C') : colors.text,
                            fontFamily,
                            fontSize: scaleFont(13),
                          },
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {hasMore && (
                <TouchableOpacity
                  style={styles.showToggleBtn}
                  onPress={() => toggleExpanded(cat.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.showToggleText, { fontFamily, fontSize: scaleFont(14) }]}>
                    {isExpanded ? 'Show less' : 'Show more'}
                  </Text>
                  {isExpanded ? (
                    <ChevronUp size={16} color={ORANGE} />
                  ) : (
                    <ChevronDown size={16} color={ORANGE} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
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
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            !fromEditProfile && totalSelected === 0 && {
              backgroundColor: isDark ? '#334155' : '#CBD5E1',
              elevation: 0,
              shadowOpacity: 0,
            },
          ]}
          disabled={(!fromEditProfile && totalSelected === 0) || submitting}
          onPress={() => handleFinish(false)}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
              Submit
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.laterBtn}
          disabled={submitting}
          onPress={() => handleFinish(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.laterText, { color: colors.text, fontFamily, fontSize: scaleFont(14) }]}>
            {fromEditProfile ? 'Cancel' : 'I will do this later'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: { fontWeight: '800' },
  tabBar: {
    borderBottomWidth: 1,
  },
  tabScroll: {
    paddingHorizontal: 16,
    gap: 22,
  },
  tabItem: {
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: ORANGE,
  },
  tabText: {
    fontWeight: '700',
  },
  content: { padding: 18, paddingBottom: 28, gap: 24 },
  categoryBlock: { gap: 12 },
  subHeading: { fontWeight: '800' },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  pillText: { fontWeight: '600' },
  showToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  showToggleText: {
    color: ORANGE,
    fontWeight: '700',
  },
  bottomFooter: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
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
  laterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  laterText: { fontWeight: '600' },
});
