import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  BackHandler,
  Platform,
  Image,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Briefcase,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  DollarSign,
  ArrowLeft,
  Share2,
  Bookmark,
  Send,
  ThumbsUp,
  ExternalLink,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../theme/Theme';
import JobCircleService from '../../services/JobCircleService';
import { JobOpportunity } from '../../types/jobCircle';

export default function JobCircleScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeChurch } = useChurch();
  const { colors, isDark } = useTheme();

  // Responsive dynamic colors
  const screenBg = isDark ? '#000000' : (colors.background || '#FAF7F2');
  const cardSurface = isDark ? '#18181B' : (colors.surface || '#FFFFFF');
  const cardBorder = isDark ? '#27272A' : (colors.border || '#E2E8F0');
  const primaryText = isDark ? '#FFFFFF' : (colors.text || '#0F172A');
  const secondaryText = isDark ? '#A1A1AA' : (colors.textSecondary || '#64748B');

  const churchId = activeChurch?.id || 'rhema';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [savedOppIds, setSavedOppIds] = useState<string[]>([]);
  const [likedOppIds, setLikedOppIds] = useState<string[]>([]);
  const [expandedDescIds, setExpandedDescIds] = useState<{ [key: string]: boolean }>({});

  // Search & Type Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Android hardware back handler
  useEffect(() => {
    const onBackPress = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => {
    loadAllOpportunities();
    loadSavedState();
  }, [churchId]);

  const loadSavedState = async () => {
    try {
      const [savedJson, likedJson] = await Promise.all([
        AsyncStorage.getItem(`@job_circle_saved_${churchId}`),
        AsyncStorage.getItem(`@job_circle_liked_${churchId}`),
      ]);
      if (savedJson) setSavedOppIds(JSON.parse(savedJson));
      if (likedJson) setLikedOppIds(JSON.parse(likedJson));
    } catch (e) {
      console.warn('Error reading saved job state:', e);
    }
  };

  const toggleSaveOpportunity = async (oppId: string) => {
    try {
      const isSaved = savedOppIds.includes(oppId);
      const updated = isSaved ? savedOppIds.filter(id => id !== oppId) : [...savedOppIds, oppId];
      setSavedOppIds(updated);
      await AsyncStorage.setItem(`@job_circle_saved_${churchId}`, JSON.stringify(updated));
      Alert.alert(isSaved ? 'Removed' : 'Saved', isSaved ? 'Opportunity removed from saved.' : 'Opportunity saved for later!');
    } catch (e) {
      console.error('Error toggling save:', e);
    }
  };

  const toggleLikeOpportunity = async (oppId: string) => {
    try {
      const isLiked = likedOppIds.includes(oppId);
      const updated = isLiked ? likedOppIds.filter(id => id !== oppId) : [...likedOppIds, oppId];
      setLikedOppIds(updated);
      await AsyncStorage.setItem(`@job_circle_liked_${churchId}`, JSON.stringify(updated));
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  };

  const handleShareOpportunity = async (opp: JobOpportunity) => {
    try {
      const shareMsg = `📢 Ministry Calling at ${activeChurch?.name || 'Rhema Church'}:\n\n` +
        `💼 Position: ${opp.title}\n` +
        `📍 Location: ${opp.location}\n` +
        `⏰ Time: ${opp.timeCommitment}\n` +
        (opp.compensationDetails ? `💰 Compensation: ${opp.compensationDetails}\n` : '') +
        `\nDescription: ${opp.description}\n\nJoin hands in God's service through Rhema Church Job Circle!`;

      await Share.share({
        message: shareMsg,
        title: opp.title,
      });
    } catch (e: any) {
      console.warn('Share error:', e);
    }
  };

  const toggleDescExpand = (oppId: string) => {
    setExpandedDescIds(prev => ({ ...prev, [oppId]: !prev[oppId] }));
  };

  const formatPostedDate = (createdAt: any): string => {
    if (!createdAt) return 'Recently posted';
    try {
      const ms = createdAt.toMillis ? createdAt.toMillis() : (createdAt.seconds ? createdAt.seconds * 1000 : new Date(createdAt).getTime());
      if (!ms || isNaN(ms)) return 'Recently posted';
      const diffSecs = Math.floor((Date.now() - ms) / 1000);
      if (diffSecs < 60) return 'Just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return 'Recently posted';
    }
  };

  const loadAllOpportunities = async () => {
    try {
      setLoading(true);
      const opps = await JobCircleService.getOpportunities(churchId, { onlyApproved: true });
      setOpportunities(opps);
    } catch (err) {
      console.error('Error loading Job Circle opportunities:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAllOpportunities();
  };

  // Filtered Opportunities for Feed / Search
  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch =
      opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (opp.categoryName && opp.categoryName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (opp.location && opp.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (opp.description && opp.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType =
      selectedType === 'all' ||
      (selectedType === 'paid' && opp.compensationType !== 'unpaid') ||
      (selectedType === 'volunteer' && opp.compensationType === 'unpaid');

    return matchesSearch && matchesType;
  });

  // ── LINKEDIN STYLE POST CARD RENDERER ──
  const renderPostCard = (opp: JobOpportunity) => {
    const isPaid = opp.compensationType !== 'unpaid';
    const isSaved = savedOppIds.includes(opp.id);
    const isLiked = likedOppIds.includes(opp.id);
    const isExpanded = !!expandedDescIds[opp.id];
    const churchLogo = activeChurch?.theme?.logoUrl || (activeChurch as any)?.logoUrl;
    const churchName = activeChurch?.name || 'Rhema Global Ministries';
    const postedTimeAgo = formatPostedDate(opp.createdAt);
    const hasLongDesc = (opp.description || '').length > 140;

    return (
      <View
        key={opp.id}
        style={[
          styles.postCard,
          {
            backgroundColor: cardSurface,
            borderColor: cardBorder,
          },
        ]}
      >
        {/* Post Header: Church Profile, Name, Posted Time */}
        <View style={styles.postHeaderRow}>
          {churchLogo ? (
            <Image source={{ uri: churchLogo }} style={styles.churchAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.churchAvatarPlaceholder, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' }]}>
              <Briefcase size={18} color={isDark ? '#93C5FD' : '#1E40AF'} />
            </View>
          )}

          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.postAuthorName, { color: primaryText }]} numberOfLines={1}>
                {churchName}
              </Text>
              <View style={styles.officialBadge}>
                <CheckCircle2 size={12} color="#2563EB" />
              </View>
            </View>
            <Text style={[styles.postAuthorSubtitle, { color: secondaryText }]} numberOfLines={1}>
              Church Ministry & Leadership • {postedTimeAgo}
            </Text>
          </View>

          {/* Bookmark / Save Post */}
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => toggleSaveOpportunity(opp.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Bookmark
              size={20}
              color={isSaved ? '#2563EB' : secondaryText}
              fill={isSaved ? '#2563EB' : 'none'}
            />
          </TouchableOpacity>
        </View>

        {/* Post Headline: Position Title (LinkedIn Alert style) */}
        <View style={styles.postHeadlineBox}>
          <Text style={[styles.postHeadlineTitle, { color: primaryText }]}>
            🚨 <Text style={{ color: isDark ? '#60A5FA' : '#1D4ED8', fontWeight: '800' }}>{churchName}</Text> is hiring / recruiting –{' '}
            <Text style={{ fontWeight: '800' }}>{opp.title}</Text>
          </Text>
        </View>

        {/* Structured Job Meta Specs (LinkedIn Reference) */}
        <View style={[styles.postDetailsBox, { backgroundColor: isDark ? '#27272A50' : '#F8FAFC', borderColor: cardBorder }]}>
          <View style={styles.detailRow}>
            <Text style={styles.detailEmoji}>📍</Text>
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Location:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {opp.location || 'Rhema Main Campus'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailEmoji}>💼</Text>
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Role & Category:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {opp.categoryName || opp.title}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailEmoji}>🏷️</Text>
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Opportunity Type:</Text>
            <View style={[styles.typePill, { backgroundColor: isPaid ? (isDark ? '#F59E0B25' : '#FEF3C7') : (isDark ? '#10B98125' : '#ECFDF5') }]}>
              <Text style={[styles.typePillTxt, { color: isPaid ? (isDark ? '#FBBF24' : '#B45309') : (isDark ? '#34D399' : '#047857') }]}>
                {opp.opportunityType.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </View>
          </View>

          {opp.compensationDetails ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailEmoji}>💰</Text>
              <Text style={[styles.detailLabel, { color: secondaryText }]}>Compensation:</Text>
              <Text style={[styles.detailVal, { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '700' }]}>
                {opp.compensationDetails}
              </Text>
            </View>
          ) : null}

          <View style={styles.detailRow}>
            <Text style={styles.detailEmoji}>⏰</Text>
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Schedule:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {opp.timeCommitment}
            </Text>
          </View>
        </View>

        {/* Opportunity Description with "...more" Toggle */}
        <View style={styles.postBodyWrap}>
          <Text
            style={[styles.postDescription, { color: primaryText }]}
            numberOfLines={isExpanded ? undefined : 3}
          >
            {opp.description}
          </Text>
          {hasLongDesc && (
            <TouchableOpacity onPress={() => toggleDescExpand(opp.id)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <Text style={{ color: isDark ? '#60A5FA' : '#1D4ED8', fontWeight: '700', fontSize: 13 }}>
                {isExpanded ? 'Show less' : '...more'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Key Responsibilities or Calling Points (if any) */}
        {opp.responsibilities && opp.responsibilities.length > 0 && isExpanded && (
          <View style={styles.expandedSection}>
            <Text style={[styles.expandedSecTitle, { color: primaryText }]}>Key Responsibilities:</Text>
            {opp.responsibilities.map((resp, i) => (
              <View key={i} style={styles.bulletItem}>
                <Text style={{ color: '#2563EB', marginRight: 6 }}>•</Text>
                <Text style={[styles.bulletTxt, { color: secondaryText }]}>{resp}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Uploaded Opportunity Banner / Thumbnail Image */}
        <TouchableOpacity
          onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
          activeOpacity={0.92}
          style={styles.postBannerWrap}
        >
          {opp.thumbnailUrl ? (
            <Image
              source={{ uri: opp.thumbnailUrl }}
              style={styles.postBannerImg}
              resizeMode="cover"
            />
          ) : (
            // Clean Default Graphic Placeholder
            <View style={[styles.defaultBannerPlaceholder, { backgroundColor: isDark ? '#1E293B' : '#0F172A' }]}>
              <View style={styles.placeholderWatermark}>
                <Briefcase size={80} color="rgba(255,255,255,0.08)" />
              </View>
              <View style={styles.placeholderContent}>
                <View style={styles.placeholderChurchTag}>
                  <Text style={styles.placeholderChurchTagTxt}>{churchName.toUpperCase()}</Text>
                </View>
                <Text style={styles.placeholderTitle} numberOfLines={2}>
                  {opp.title}
                </Text>
                <Text style={styles.placeholderSub}>
                  {opp.categoryName} • {opp.location}
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Apply Now Primary Action Strip */}
        <View style={[styles.postApplyStrip, { borderBottomColor: cardBorder }]}>
          <TouchableOpacity
            style={[styles.applyNowButton, { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }]}
            onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
            activeOpacity={0.85}
          >
            <Send size={15} color={isDark ? '#000000' : '#FFFFFF'} />
            <Text style={[styles.applyNowTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
              Apply Now
            </Text>
          </TouchableOpacity>
        </View>

        {/* Social Actions Row: Like, Share, View Details */}
        <View style={styles.socialActionRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={() => toggleLikeOpportunity(opp.id)}
            activeOpacity={0.7}
          >
            <ThumbsUp
              size={18}
              color={isLiked ? '#2563EB' : secondaryText}
              fill={isLiked ? '#2563EB' : 'none'}
            />
            <Text style={[styles.socialBtnTxt, { color: isLiked ? '#2563EB' : secondaryText }]}>
              {isLiked ? 'Liked' : 'Like'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.socialBtn}
            onPress={() => handleShareOpportunity(opp)}
            activeOpacity={0.7}
          >
            <Share2 size={18} color={secondaryText} />
            <Text style={[styles.socialBtnTxt, { color: secondaryText }]}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.socialBtn}
            onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
            activeOpacity={0.7}
          >
            <ExternalLink size={18} color={secondaryText} />
            <Text style={[styles.socialBtnTxt, { color: secondaryText }]}>Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── Screen Header matching Member Dashboard tabs ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            borderBottomWidth: 1.2,
            borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
            backgroundColor: screenBg,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: cardSurface, borderColor: cardBorder }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: primaryText }]} numberOfLines={1}>
          Job Circle & Calling
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      {/* Main Content Feed */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={isDark ? '#60A5FA' : Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Search Box */}
          <View style={[styles.searchBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
            <Search size={18} color={secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: primaryText }]}
              placeholder="Search ministry role, calling, location..."
              placeholderTextColor={secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Chips: All, Paid, Volunteer */}
          <View style={styles.filterRow}>
            {(['all', 'paid', 'volunteer'] as const).map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  selectedType === type
                    ? { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }
                    : { backgroundColor: cardSurface, borderColor: cardBorder, borderWidth: 1 },
                ]}
                onPress={() => setSelectedType(type)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedType === type
                      ? { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700' }
                      : { color: primaryText },
                  ]}
                >
                  {type === 'all' ? 'All Roles' : type === 'paid' ? 'Paid / Staff' : 'Volunteer'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Count Header */}
          <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
            <Text style={{ fontSize: 13, color: secondaryText, fontWeight: '600' }}>
              {filteredOpportunities.length} {filteredOpportunities.length === 1 ? 'Opportunity' : 'Opportunities'} available
            </Text>
          </View>

          {/* Feed List */}
          {filteredOpportunities.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
              <Briefcase size={40} color={secondaryText} style={{ marginBottom: 12 }} />
              <Text style={{ color: primaryText, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
                No Postings Found
              </Text>
              <Text style={{ color: secondaryText, textAlign: 'center', lineHeight: 20 }}>
                {searchQuery.trim()
                  ? 'No ministry openings match your search keyword. Try clearing filters.'
                  : 'New ministry positions and volunteer opportunities will appear directly in this feed when published.'}
              </Text>
            </View>
          ) : (
            filteredOpportunities.map(opp => renderPostCard(opp))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },

  // Search & Filters
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // ── LINKEDIN STYLE POST CARD STYLES ──
  postCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  postHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  churchAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  churchAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthorName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  officialBadge: {
    marginTop: 1,
  },
  postAuthorSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActionBtn: {
    padding: 6,
    borderRadius: 20,
  },
  postHeadlineBox: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  postHeadlineTitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  postDetailsBox: {
    marginHorizontal: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  detailEmoji: {
    fontSize: 13,
    marginRight: 6,
  },
  detailLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    marginRight: 6,
  },
  detailVal: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typePillTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  postBodyWrap: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  postDescription: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  expandedSection: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  expandedSecTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bulletTxt: {
    fontSize: 12.5,
    lineHeight: 18,
    flex: 1,
  },
  postBannerWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  postBannerImg: {
    width: '100%',
    height: 210,
  },
  defaultBannerPlaceholder: {
    width: '100%',
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    padding: 20,
  },
  placeholderWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -10,
  },
  placeholderContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  placeholderChurchTag: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
  },
  placeholderChurchTagTxt: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  placeholderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  placeholderSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12.5,
    textAlign: 'center',
  },
  postApplyStrip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  applyNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    elevation: 2,
  },
  applyNowTxt: {
    fontSize: 14,
    fontWeight: '700',
  },
  socialActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  socialBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
});
