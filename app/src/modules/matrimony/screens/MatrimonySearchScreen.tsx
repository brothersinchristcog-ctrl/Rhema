import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Hash,
  Search,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { MatrimonyCachedImage } from '../components/MatrimonyCachedImage';
import { MatrimonyFilterCriteriaContent } from '../components/MatrimonyMatchesFilterModal';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyMatchesFilter, MemberEntitlements } from '../types/matrimony';

const CORAL_RED = '#E04B5A';
const MAX_RECENT_IDS = 8;

type SearchTabKey = 'criteria' | 'profile_id';

interface RecentIdSearchItem {
  uid: string;
  profileCode: string;
  displayName: string;
  age: number | null;
  city: string;
  signedProfilePhoto: string | null;
  searchedAtMs: number;
}

export default function MatrimonySearchScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialTab: SearchTabKey =
    route?.params?.initialTab === 'profile_id' ? 'profile_id' : 'criteria';
  const [activeTab, setActiveTab] = useState<SearchTabKey>(initialTab);

  const initialCachedMatches = matrimonyApi.getCachedMatches();
  const [partnerPrefsFilter, setPartnerPrefsFilter] = useState<MatrimonyMatchesFilter>(
    () => initialCachedMatches?.viewerPreferencesFilter || {}
  );
  const [initialMatchCount, setInitialMatchCount] = useState<number>(
    () => initialCachedMatches?.totalAvailableCount ?? initialCachedMatches?.totalCount ?? 0
  );
  const [entitlements, setEntitlements] = useState<MemberEntitlements | null>(() =>
    matrimonyApi.getCachedEntitlements()
  );

  // By Profile ID state
  const [profileIdInput, setProfileIdInput] = useState('');
  const [idSearching, setIdSearching] = useState(false);
  const [idStatus, setIdStatus] = useState<{
    message: string;
    reason?: 'not_found' | 'self' | 'not_eligible' | 'hidden_by_you' | 'error';
  } | null>(null);
  const [recentIds, setRecentIds] = useState<RecentIdSearchItem[]>([]);

  const recentStorageKey = `@rhema_matrimony_recent_ids_v1_${user?.uid || 'anon'}`;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(recentStorageKey)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentIds(parsed);
        }
      })
      .catch(() => {});

    matrimonyApi.getMemberEntitlements().then((res) => {
      if (active && res?.entitlements) setEntitlements(res.entitlements);
    }).catch(() => {});

    if (!initialCachedMatches) {
      matrimonyApi
        .getMatches({ tab: 'all', matchBasis: 'partner_preferences', sortBy: 'best_match', filters: {}, limit: 1 })
        .then((res) => {
          if (!active || !res) return;
          if (res.viewerPreferencesFilter) setPartnerPrefsFilter(res.viewerPreferencesFilter);
          setInitialMatchCount(res.totalAvailableCount ?? res.totalCount ?? 0);
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [recentStorageKey]);

  const handleApplyCriteriaSearch = useCallback(
    (nextFilters: MatrimonyMatchesFilter) => {
      const hasAny = Object.keys(nextFilters || {}).length > 0;
      navigation.navigate('MatrimonyMainTabs', {
        screen: 'MatrimonyMatches',
        params: {
          initialTab: 'all',
          applySearchFilters: nextFilters,
          applySearchMode: hasAny ? 'custom' : 'cleared',
          filterNonce: Date.now(),
        },
      });
    },
    [navigation]
  );

  const persistRecentId = useCallback(
    (entry: RecentIdSearchItem) => {
      setRecentIds((prev) => {
        const next = [entry, ...prev.filter((r) => r.uid !== entry.uid)].slice(0, MAX_RECENT_IDS);
        AsyncStorage.setItem(recentStorageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [recentStorageKey]
  );

  const handleClearRecentIds = useCallback(() => {
    setRecentIds([]);
    AsyncStorage.removeItem(recentStorageKey).catch(() => {});
  }, [recentStorageKey]);

  const handleSearchById = useCallback(
    async (rawInput?: string) => {
      const code = (rawInput ?? profileIdInput).replace(/\s+/g, '').toUpperCase();
      if (!code) {
        setIdStatus({
          message: 'Please enter a valid Matrimony ID (e.g. RMT820).',
          reason: 'not_found',
        });
        return;
      }
      if (rawInput !== undefined) {
        setProfileIdInput(code);
      }
      Keyboard.dismiss();
      setIdStatus(null);
      setIdSearching(true);

      try {
        const res = await matrimonyApi.searchByProfileId(code);
        if (!res.found || !res.profile) {
          setIdStatus({
            message: res.message || `No approved profile found matching "${code}".`,
            reason: res.reason || 'not_found',
          });
          return;
        }

        const cand = res.profile;
        persistRecentId({
          uid: cand.uid,
          profileCode: cand.profileCode || code,
          displayName: cand.displayName || 'Rhema Member',
          age: cand.age ?? null,
          city: cand.location?.village || cand.location?.city || cand.location?.state || '',
          signedProfilePhoto: cand.signedProfilePhoto || null,
          searchedAtMs: Date.now(),
        });

        navigation.navigate('MatrimonyMatchDetail', {
          matches: [cand],
          initialIndex: 0,
          tabTitle: 'Profile ID Search',
          viewerPhoto: res.viewerPhoto ?? null,
        });
      } catch (err: any) {
        if (isMatrimonyInactiveError(err)) {
          navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
          return;
        }
        setIdStatus({
          message: err?.message || 'Unable to look up that Profile ID right now.',
          reason: 'error',
        });
      } finally {
        setIdSearching(false);
      }
    },
    [navigation, persistRecentId, profileIdInput]
  );

  const surfaceBg = isDark ? colors.surface : '#FFFFFF';
  const pageBg = isDark ? colors.bg : '#F8FAFC';
  const dividerColor = isDark ? colors.border : '#E5E7EB';
  const inputBg = isDark ? '#1E293B' : '#F1F5F9';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: surfaceBg }]} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={surfaceBg}
      />

      {/* Top Header */}
      <View style={[styles.topBar, { backgroundColor: surfaceBg, borderBottomColor: dividerColor }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text, fontFamily, fontSize: scaleFont(19) }]}>
          Search
        </Text>
      </View>

      {/* Telugu Matrimony Style 2-Tab Bar: By Criteria | By Profile ID */}
      <View style={[styles.tabRow, { backgroundColor: surfaceBg, borderBottomColor: dividerColor }]}>
        <TouchableOpacity
          style={styles.tabBtn}
          activeOpacity={0.8}
          onPress={() => setActiveTab('criteria')}
        >
          <View style={styles.tabInner}>
            <SlidersHorizontal
              size={15}
              color={activeTab === 'criteria' ? CORAL_RED : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === 'criteria' ? CORAL_RED : colors.textSecondary,
                  fontWeight: activeTab === 'criteria' ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              By Criteria
            </Text>
          </View>
          {activeTab === 'criteria' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBtn}
          activeOpacity={0.8}
          onPress={() => setActiveTab('profile_id')}
        >
          <View style={styles.tabInner}>
            <Hash
              size={15}
              color={activeTab === 'profile_id' ? CORAL_RED : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === 'profile_id' ? CORAL_RED : colors.textSecondary,
                  fontWeight: activeTab === 'profile_id' ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              By Profile ID
            </Text>
          </View>
          {activeTab === 'profile_id' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Tab 1: Structured Criteria Search */}
      <View style={[styles.tabPane, { display: activeTab === 'criteria' ? 'flex' : 'none' }]}>
        <MatrimonyFilterCriteriaContent
          active={activeTab === 'criteria'}
          mode="search"
          initialFilters={{}}
          partnerPreferencesFilter={partnerPrefsFilter}
          initialMatchCount={initialMatchCount}
          tab="all"
          sortBy="best_match"
          primaryButtonLabel="Search Profiles"
          canUseAdvancedFilters={Boolean(entitlements?.advancedFilters)}
          onPressUpgrade={() => navigation.navigate('MatrimonyUpgrade')}
          onApply={handleApplyCriteriaSearch}
        />
      </View>

      {/* Tab 2: Direct Matrimony ID Lookup */}
      <KeyboardAvoidingView
        style={[
          styles.tabPane,
          { backgroundColor: pageBg, display: activeTab === 'profile_id' ? 'flex' : 'none' },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(insets.bottom + 24, 32),
            gap: 16,
          }}
        >
          <View
            style={[
              styles.idCard,
              { backgroundColor: surfaceBg, borderColor: dividerColor },
            ]}
          >
            <Text
              style={[
                styles.idHeading,
                { color: colors.text, fontFamily, fontSize: scaleFont(16.5) },
              ]}
            >
              Search by Matrimony ID
            </Text>
            <Text style={[styles.idSubtitle, { color: colors.textSecondary, fontFamily }]}>
              Enter the exact Profile ID of the member you want to view (for example, RMT820).
            </Text>

            <View
              style={[
                styles.idInputWrap,
                { backgroundColor: inputBg, borderColor: dividerColor },
              ]}
            >
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                value={profileIdInput}
                onChangeText={(txt) => {
                  setProfileIdInput(txt.toUpperCase());
                  if (idStatus) setIdStatus(null);
                }}
                placeholder="Enter Matrimony ID (e.g. RMT820)"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => handleSearchById()}
                style={[styles.idInput, { color: colors.text, fontFamily }]}
              />
              {profileIdInput.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setProfileIdInput('');
                    setIdStatus(null);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {idStatus && (
              <View
                style={[
                  styles.statusBanner,
                  {
                    backgroundColor: isDark
                      ? 'rgba(224,75,90,0.14)'
                      : '#FEF2F2',
                    borderColor: isDark ? 'rgba(224,75,90,0.35)' : '#FECACA',
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: isDark ? '#FCA5A5' : '#B91C1C', fontFamily }]}>
                  {idStatus.message}
                </Text>
                {idStatus.reason === 'hidden_by_you' && (
                  <TouchableOpacity
                    style={{ marginTop: 8 }}
                    onPress={() => navigation.navigate('MatrimonyAccountSettings')}
                  >
                    <Text style={[styles.statusActionLink, { fontFamily }]}>
                      Go to Account Settings →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.searchIdBtn,
                idSearching && { opacity: 0.78 },
              ]}
              activeOpacity={0.85}
              disabled={idSearching}
              onPress={() => handleSearchById()}
            >
              {idSearching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[styles.searchIdBtnText, { fontFamily }]}>View Profile</Text>
              )}
            </TouchableOpacity>
          </View>

          {recentIds.length > 0 && (
            <View
              style={[
                styles.idCard,
                { backgroundColor: surfaceBg, borderColor: dividerColor },
              ]}
            >
              <View style={styles.recentHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={15} color={colors.textSecondary} />
                  <Text style={[styles.recentHeading, { color: colors.text, fontFamily }]}>
                    Recent ID Searches
                  </Text>
                </View>
                <TouchableOpacity onPress={handleClearRecentIds}>
                  <Text style={[styles.clearRecentText, { fontFamily }]}>Clear</Text>
                </TouchableOpacity>
              </View>

              {recentIds.map((item, idx) => {
                const isLast = idx === recentIds.length - 1;
                const meta = [item.age ? `${item.age} Yrs` : null, item.city || null]
                  .filter(Boolean)
                  .join(' • ');
                return (
                  <TouchableOpacity
                    key={item.uid}
                    style={[
                      styles.recentRow,
                      { borderBottomColor: isLast ? 'transparent' : dividerColor },
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSearchById(item.profileCode)}
                  >
                    {item.signedProfilePhoto ? (
                      <MatrimonyCachedImage
                        uri={item.signedProfilePhoto}
                        recyclingKey={item.uid}
                        style={styles.recentAvatar}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.recentAvatarPlaceholder,
                          { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                        ]}
                      >
                        <User size={18} color="#94A3B8" />
                      </View>
                    )}

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.recentName, { color: colors.text, fontFamily }]} numberOfLines={1}>
                        {item.displayName}
                      </Text>
                      <Text style={[styles.recentMeta, { color: colors.textSecondary, fontFamily }]} numberOfLines={1}>
                        {item.profileCode}
                        {meta ? ` • ${meta}` : ''}
                      </Text>
                    </View>

                    <ChevronRight size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  topTitle: {
    flex: 1,
    fontWeight: '800',
    marginLeft: 10,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    position: 'relative',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 14.5,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 22,
    right: 22,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: CORAL_RED,
  },
  tabPane: {
    flex: 1,
  },
  idCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  idHeading: {
    fontWeight: '800',
  },
  idSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    marginBottom: 14,
  },
  idInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    height: 48,
    gap: 9,
  },
  idInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingVertical: 0,
  },
  statusBanner: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  statusActionLink: {
    fontSize: 13,
    fontWeight: '700',
    color: CORAL_RED,
  },
  searchIdBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: CORAL_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIdBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recentHeading: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  clearRecentText: {
    color: CORAL_RED,
    fontSize: 13,
    fontWeight: '700',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 11,
  },
  recentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  recentAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentName: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  recentMeta: {
    fontSize: 12.5,
  },
});
