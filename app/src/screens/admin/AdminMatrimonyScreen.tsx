import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  HeartHandshake,
  PauseCircle,
  RefreshCw,
  Search,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';
import { useIsFocused } from '@react-navigation/native';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import {
  AdminMatrimonyCounts,
  AdminMatrimonyProfileSummary,
  matrimonyApi,
} from '../../modules/matrimony';

const CORAL = '#E05A5A';
const GREEN = '#16A34A';
const AMBER = '#D97706';
const RED = '#DC2626';

type FilterTab = 'pending' | 'approved' | 'reported' | 'inactive' | 'all' | 'rejected';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Verified' },
  { key: 'reported', label: 'Reported' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminMatrimonyScreen({ navigation }: any) {
  const { goBack, setActiveTab } = useContext(AdminTabContext);
  const isFocused = useIsFocused();
  const {
    isDark,
    screenBg,
    cardSurface,
    primaryText,
    secondaryText,
    borderColor,
    barStyle,
    scaleFont,
    appFontFamily,
  } = useAdminTheme();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [counts, setCounts] = useState<AdminMatrimonyCounts>({
    total: 0,
    verified: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    draft: 0,
    correction_requested: 0,
    suspended: 0,
    inactive: 0,
    reported: 0,
    openReports: 0,
  });
  const [profiles, setProfiles] = useState<AdminMatrimonyProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProfiles = useCallback(async (targetFilter: FilterTab, silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const res = await matrimonyApi.getAdminProfiles(targetFilter);
      if (res.counts) {
        setCounts(res.counts);
      }
      setProfiles(res.profiles || []);
    } catch (err: any) {
      console.warn('AdminMatrimony fetch error:', err);
      setErrorMsg(err?.message || 'Unable to load Rhema Matrimony profiles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles(filter);
  }, [filter, fetchProfiles]);

  useEffect(() => {
    if (isFocused) {
      fetchProfiles(filter, true);
    }
  }, [isFocused, filter, fetchProfiles]);

  const handleBackPress = () => {
    if (goBack) {
      goBack();
    } else if (setActiveTab) {
      setActiveTab(0);
    } else if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const haystack = [
        p.displayName,
        p.location?.city,
        p.location?.state,
        p.faithSummary?.denomination,
        p.career?.profession,
        p.motherTongue,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [profiles, searchQuery]);

  const getStatusMeta = (status?: string) => {
    if (status === 'approved') {
      return {
        label: 'Verified',
        color: GREEN,
        bg: isDark ? 'rgba(22, 163, 74, 0.2)' : '#DCFCE7',
      };
    }
    if (status === 'inactive' || status === 'suspended') {
      return {
        label: 'Inactive',
        color: '#B45309',
        bg: isDark ? 'rgba(217, 119, 6, 0.22)' : '#FEF3C7',
      };
    }
    if (status === 'rejected') {
      return {
        label: 'Rejected',
        color: RED,
        bg: isDark ? 'rgba(220, 38, 38, 0.2)' : '#FEE2E2',
      };
    }
    if (status === 'pending') {
      return {
        label: 'Pending',
        color: AMBER,
        bg: isDark ? 'rgba(217, 119, 6, 0.22)' : '#FEF3C7',
      };
    }
    return {
      label: (status || 'draft').toUpperCase(),
      color: secondaryText,
      bg: isDark ? '#27272A' : '#F1F5F9',
    };
  };

  const renderProfileCard = ({ item }: { item: AdminMatrimonyProfileSummary }) => {
    const photoUrl = item.signedProfilePhoto || item.signedPhoto || null;
    const statusMeta = getStatusMeta(item.profileStatus);
    const totalPhotos = (photoUrl ? 1 : 0) + (item.gallery?.length || 0);
    const baptizedLabel =
      item.faithSummary?.baptized === true
        ? 'Baptized: Yes'
        : item.faithSummary?.baptized === false
        ? 'Baptized: No'
        : null;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: cardSurface,
            borderColor,
          },
        ]}
        activeOpacity={0.82}
        onPress={() =>
          navigation.navigate('AdminMatrimonyProfileDetail', {
            targetUid: item.uid,
          })
        }
      >
        <View style={styles.cardTopRow}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
              <User size={26} color={secondaryText} />
            </View>
          )}

          <View style={styles.cardInfoCol}>
            <View style={styles.cardTitleRow}>
              <Text
                style={[
                  styles.cardName,
                  { color: primaryText, fontFamily: appFontFamily, fontSize: scaleFont(15.5) },
                ]}
                numberOfLines={1}
              >
                {item.displayName || 'Rhema Member'}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.cardSub,
                { color: secondaryText, fontFamily: appFontFamily, fontSize: scaleFont(12.5) },
              ]}
              numberOfLines={1}
            >
              {[
                item.age ? `${item.age} yrs` : null,
                item.gender,
                item.motherTongue,
              ]
                .filter(Boolean)
                .join(' • ') || 'Profile details'}
            </Text>

            <Text
              style={[
                styles.cardSub,
                { color: secondaryText, fontFamily: appFontFamily, fontSize: scaleFont(12) },
              ]}
              numberOfLines={1}
            >
              {[
                item.career?.profession,
                item.location?.city || item.location?.state,
              ]
                .filter(Boolean)
                .join(' • ') || 'Location & career'}
            </Text>

            <View style={styles.metaPillsRow}>
              <View style={[styles.metaChip, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', borderColor }]}>
                <Text style={[styles.metaChipText, { color: primaryText }]}>
                  {item.profileCompletion ?? 0}% complete
                </Text>
              </View>
              <View style={[styles.metaChip, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', borderColor }]}>
                <Text style={[styles.metaChipText, { color: primaryText }]}>
                  {totalPhotos} {totalPhotos === 1 ? 'photo' : 'photos'}
                </Text>
              </View>
              {baptizedLabel ? (
                <View style={[styles.metaChip, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', borderColor }]}>
                  <Text style={[styles.metaChipText, { color: primaryText }]}>{baptizedLabel}</Text>
                </View>
              ) : null}
              {(item.totalReportCount ?? 0) > 0 ? (
                <View
                  style={[
                    styles.metaChip,
                    {
                      backgroundColor: isDark ? 'rgba(220,38,38,0.2)' : '#FEF2F2',
                      borderColor: '#FCA5A5',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    },
                  ]}
                >
                  <Flag size={10.5} color={RED} />
                  <Text style={[styles.metaChipText, { color: RED, fontWeight: '800' }]}>
                    {(item.openReportCount ?? 0) > 0
                      ? `${item.openReportCount} Open Report${item.openReportCount === 1 ? '' : 's'}`
                      : `${item.totalReportCount} Report${item.totalReportCount === 1 ? '' : 's'}`}
                  </Text>
                </View>
              ) : null}
            </View>

            {item.latestReport ? (
              <Text
                style={[styles.reportPreviewText, { fontFamily: appFontFamily }]}
                numberOfLines={1}
              >
                Reported: {item.latestReport.category}
              </Text>
            ) : (item.profileStatus === 'inactive' || item.profileStatus === 'suspended') &&
              item.inactiveReason ? (
              <Text
                style={[styles.inactivePreviewText, { fontFamily: appFontFamily }]}
                numberOfLines={1}
              >
                Inactive: {item.inactiveReason}
              </Text>
            ) : null}
          </View>

          <ChevronRight size={20} color={secondaryText} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
      <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: cardSurface, borderColor }]}
          onPress={handleBackPress}
        >
          <ChevronLeft size={22} color={primaryText} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <HeartHandshake size={20} color={CORAL} />
          <Text
            style={[
              styles.headerTitle,
              { color: primaryText, fontFamily: appFontFamily, fontSize: scaleFont(18) },
            ]}
          >
            Rhema Matrimony
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: cardSurface, borderColor }]}
          onPress={() => fetchProfiles(filter)}
        >
          <RefreshCw size={18} color={primaryText} />
        </TouchableOpacity>
      </View>

      {/* Summary Counts Strip */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: cardSurface, borderColor }]}>
          <Users size={18} color="#2563EB" />
          <Text style={[styles.statNum, { color: primaryText, fontFamily: appFontFamily }]}>
            {counts.total}
          </Text>
          <Text style={[styles.statLbl, { color: secondaryText, fontFamily: appFontFamily }]}>
            Total Profiles
          </Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: cardSurface, borderColor }]}>
          <CheckCircle2 size={18} color={GREEN} />
          <Text style={[styles.statNum, { color: GREEN, fontFamily: appFontFamily }]}>
            {counts.verified}
          </Text>
          <Text style={[styles.statLbl, { color: secondaryText, fontFamily: appFontFamily }]}>
            Verified
          </Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: cardSurface, borderColor }]}>
          <Clock size={18} color={AMBER} />
          <Text style={[styles.statNum, { color: AMBER, fontFamily: appFontFamily }]}>
            {counts.pending}
          </Text>
          <Text style={[styles.statLbl, { color: secondaryText, fontFamily: appFontFamily }]}>
            Pending
          </Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: cardSurface, borderColor }]}>
          {(counts.openReports ?? 0) > 0 ? (
            <Flag size={18} color={RED} />
          ) : (
            <PauseCircle size={18} color={AMBER} />
          )}
          <Text
            style={[
              styles.statNum,
              { color: (counts.openReports ?? 0) > 0 ? RED : AMBER, fontFamily: appFontFamily },
            ]}
          >
            {(counts.openReports ?? 0) > 0 ? counts.reported : counts.inactive}
          </Text>
          <Text style={[styles.statLbl, { color: secondaryText, fontFamily: appFontFamily }]}>
            {(counts.openReports ?? 0) > 0 ? 'Reported' : 'Inactive'}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.tabRowWrap, { borderBottomColor: borderColor }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRowScroll}
        >
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            const badgeCount =
              tab.key === 'pending'
                ? counts.pending
                : tab.key === 'approved'
                ? counts.verified
                : tab.key === 'reported'
                ? counts.reported
                : tab.key === 'inactive'
                ? counts.inactive
                : tab.key === 'rejected'
                ? counts.rejected
                : counts.total;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterTab,
                  active && { borderBottomColor: CORAL, borderBottomWidth: 2.5 },
                ]}
                onPress={() => setFilter(tab.key)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    {
                      color: active ? CORAL : secondaryText,
                      fontWeight: active ? '800' : '600',
                      fontFamily: appFontFamily,
                    },
                  ]}
                >
                  {tab.label} ({badgeCount})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchBox, { backgroundColor: cardSurface, borderColor }]}>
        <Search size={17} color={secondaryText} />
        <TextInput
          style={[styles.searchInput, { color: primaryText, fontFamily: appFontFamily }]}
          placeholder="Search by name, city, profession, language..."
          placeholderTextColor={secondaryText}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {Boolean(searchQuery) && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color={secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={CORAL} />
          <Text style={[styles.loadingTxt, { color: secondaryText, fontFamily: appFontFamily }]}>
            Loading Matrimony profiles...
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerBox}>
          <XCircle size={34} color={RED} />
          <Text style={[styles.errorTxt, { color: primaryText, fontFamily: appFontFamily }]}>
            {errorMsg}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchProfiles(filter)}>
            <Text style={styles.retryBtnTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProfiles}
          keyExtractor={(item) => item.uid}
          renderItem={renderProfileCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchProfiles(filter, true);
              }}
              colors={[CORAL]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <HeartHandshake size={38} color={secondaryText} />
              <Text style={[styles.emptyTitle, { color: primaryText, fontFamily: appFontFamily }]}>
                No {filter === 'all' ? '' : filter === 'approved' ? 'verified ' : `${filter} `}profiles
              </Text>
              <Text style={[styles.emptySub, { color: secondaryText, fontFamily: appFontFamily }]}>
                Profiles submitted by Rhema members after photo upload and interests will appear here for review.
              </Text>
            </View>
          }
        />
      )}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 3,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  statLbl: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabRowWrap: {
    marginTop: 12,
    borderBottomWidth: 1,
  },
  tabRowScroll: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 6,
  },
  filterTab: {
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  filterTabText: {
    fontSize: 12.5,
  },
  reportPreviewText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: RED,
    marginTop: 3,
  },
  inactivePreviewText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: AMBER,
    marginTop: 3,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 2,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfoCol: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    flex: 1,
    fontWeight: '800',
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardSub: {
    fontWeight: '500',
  },
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  metaChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingTxt: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorTxt: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: CORAL,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
  },
});
