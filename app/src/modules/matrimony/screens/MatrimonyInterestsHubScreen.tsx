import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Crown,
  Heart,
  Home,
  Mail,
  MessageCircle,
  MoreVertical,
  Phone,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import InterestsEmptyIllustration from '../components/InterestsEmptyIllustration';
import MatrimonyCachedImage from '../components/MatrimonyCachedImage';
import MatrimonyTierToggle from '../components/MatrimonyTierToggle';
import MatrimonyUpgradePromptModal from '../components/MatrimonyUpgradePromptModal';
import ProtectedPhotoPlaceholder from '../components/ProtectedPhotoPlaceholder';
import VerifiedRibbonBadge from '../components/VerifiedRibbonBadge';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { matrimonyChatService } from '../services/matrimonyChatService';
import { matrimonyPerf } from '../services/matrimonyPerf';
import {
  MatrimonyInterestEntry,
  MatrimonyMatchCandidate,
  MemberEntitlements,
} from '../types/matrimony';

const ORANGE_ACTIVE = '#EA580C';
const CORAL_RED = '#E8535F';
const GREEN_ACCEPT = '#16A34A';
const ORANGE_GRADIENT: readonly [string, string] = ['#FB923C', '#EA580C'];
const AMBER_BORDER = '#D97706';
const READ_STORAGE_KEY = '@rhema_matrimony_read_interests';

interface InterestCardItemProps {
  item: MatrimonyInterestEntry;
  index: number;
  direction: DirectionTab;
  isBusy: boolean;
  isDark: boolean;
  cardSurface: string;
  dividerColor: string;
  textColor: string;
  textSecondaryColor: string;
  fontFamily?: string;
  nameFontSize: number;
  onOpenDetail: (index: number) => void;
  onOpenSentMoreMenu: (entry: MatrimonyInterestEntry) => void;
  onCall: (entry: MatrimonyInterestEntry) => void;
  onSendMessage: (entry: MatrimonyInterestEntry) => void;
  onRespond: (
    targetUid: string,
    action: 'accept' | 'decline' | 'withdraw' | 'withdraw_accept',
    interestId?: string
  ) => void;
}

const InterestCardItem = React.memo(
  ({
    item,
    index,
    direction,
    isBusy,
    isDark,
    cardSurface,
    dividerColor,
    textColor,
    textSecondaryColor,
    fontFamily,
    nameFontSize,
    onOpenDetail,
    onOpenSentMoreMenu,
    onCall,
    onSendMessage,
    onRespond,
  }: InterestCardItemProps) => {
    const c = item.candidate;
    const pronoun = isFemaleGender(c.gender) ? 'her' : 'him';
    const sentDateStr = formatShortDate(item.updatedAtMs || item.createdAtMs);
    const detailsParts = [
      c.age ? `${c.age} Yrs` : null,
      formatCompactHeight(c.heightCm),
      c.education?.qualification,
      c.career?.profession,
      c.location?.village || c.location?.city || c.location?.state,
    ].filter(Boolean);

    if (direction === 'sent') {
      return (
        <View
          style={[
            styles.interestCard,
            { backgroundColor: cardSurface, borderColor: dividerColor },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => onOpenDetail(index)}
            style={{ gap: 12 }}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.sentThumbBox}>
                {c.signedProfilePhoto ? (
                  <MatrimonyCachedImage
                    uri={c.signedProfilePhoto}
                    recyclingKey={c.uid}
                    style={styles.thumbImg}
                    resizeMode="cover"
                  />
                ) : c.isPhotoProtected ? (
                  <ProtectedPhotoPlaceholder
                    gender={c.gender}
                    compact
                    requestStatus={c.photoRequestStatus}
                    fontFamily={fontFamily}
                  />
                ) : (
                  <View
                    style={[
                      styles.thumbPlaceholder,
                      { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' },
                    ]}
                  >
                    <User size={36} color="#94A3B8" />
                  </View>
                )}
              </View>

              <View style={styles.cardInfoCol}>
                <View style={styles.cardTopBadgeRow}>
                  <VerifiedRibbonBadge fontFamily={fontFamily} tier={c.candidateTier} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {c.isShortlisted ? (
                      <View style={styles.sentShortlistTag}>
                        <Bookmark size={11} color={ORANGE_ACTIVE} fill={ORANGE_ACTIVE} />
                        <Text style={styles.sentShortlistTagText}>Shortlisted</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      disabled={isBusy}
                      onPress={() => onOpenSentMoreMenu(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MoreVertical size={18} color={textSecondaryColor} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text
                  style={[styles.cardName, { color: textColor, fontFamily, fontSize: nameFontSize }]}
                  numberOfLines={1}
                >
                  {c.displayName}
                </Text>

                <Text
                  style={[styles.cardDetails, { color: textColor, fontFamily }]}
                  numberOfLines={2}
                >
                  {detailsParts.join('  •  ')}
                </Text>
              </View>
            </View>

            <Text style={[styles.sentStatusLine, { color: textColor, fontFamily }]}>
              <Text style={{ fontWeight: '800' }}>
                {item.status === 'accepted'
                  ? `Interest accepted by ${c.displayName}`
                  : item.status === 'declined'
                  ? `Interest declined by ${c.displayName}`
                  : `You sent ${pronoun} an interest`}
              </Text>
              <Text style={{ color: textSecondaryColor, fontWeight: '500' }}>
                {` - ${sentDateStr}`}
              </Text>
            </Text>
          </TouchableOpacity>

          {item.status !== 'declined' ? (
            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={[styles.callOutlineBtn, { borderColor: CORAL_RED }]}
                activeOpacity={0.82}
                onPress={() => onCall(item)}
              >
                <Phone size={15} color={CORAL_RED} strokeWidth={2} />
                <Text style={[styles.callOutlineText, { fontFamily }]}>Call Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sendMessageSolidBtn}
                activeOpacity={0.85}
                onPress={() => onSendMessage(item)}
              >
                <Mail size={15} color="#FFFFFF" strokeWidth={2} />
                <Text style={[styles.sendMessageSolidText, { fontFamily }]}>Send Message</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }

    const subjectPronoun = isFemaleGender(c.gender) ? 'She' : 'He';
    const possessivePronoun = isFemaleGender(c.gender) ? 'her' : 'his';

    return (
      <View
        style={[
          styles.interestCard,
          { backgroundColor: cardSurface, borderColor: dividerColor },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => onOpenDetail(index)}
          style={{ gap: 10 }}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.sentThumbBox}>
              {c.signedProfilePhoto ? (
                <MatrimonyCachedImage
                  uri={c.signedProfilePhoto}
                  recyclingKey={c.uid}
                  style={styles.thumbImg}
                  resizeMode="cover"
                />
              ) : c.isPhotoProtected ? (
                <ProtectedPhotoPlaceholder
                  gender={c.gender}
                  compact
                  requestStatus={c.photoRequestStatus}
                  fontFamily={fontFamily}
                />
              ) : (
                <View
                  style={[
                    styles.thumbPlaceholder,
                    { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' },
                  ]}
                >
                  <User size={36} color="#94A3B8" />
                </View>
              )}
            </View>

            <View style={styles.cardInfoCol}>
              <View style={styles.cardTopBadgeRow}>
                <VerifiedRibbonBadge fontFamily={fontFamily} tier={c.candidateTier} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {c.isShortlisted ? (
                    <View style={styles.sentShortlistTag}>
                      <Bookmark size={11} color={ORANGE_ACTIVE} fill={ORANGE_ACTIVE} />
                      <Text style={styles.sentShortlistTagText}>Shortlisted</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    disabled={isBusy}
                    onPress={() => onOpenSentMoreMenu(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MoreVertical size={18} color={textSecondaryColor} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text
                style={[styles.cardName, { color: textColor, fontFamily, fontSize: nameFontSize }]}
                numberOfLines={1}
              >
                {c.displayName}
              </Text>

              <Text
                style={[styles.cardDetails, { color: textColor, fontFamily }]}
                numberOfLines={2}
              >
                {detailsParts.join('  •  ')}
              </Text>
            </View>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={[styles.sentStatusLine, { color: textColor, fontFamily }]}>
              <Text style={{ fontWeight: '800' }}>
                {item.status === 'accepted'
                  ? `You accepted ${possessivePronoun} interest`
                  : item.status === 'declined'
                  ? `You declined ${possessivePronoun} interest`
                  : `${subjectPronoun} sent you an interest`}
              </Text>
              <Text style={{ color: textSecondaryColor, fontWeight: '500' }}>
                {` - ${sentDateStr}`}
              </Text>
            </Text>

            {item.status === 'pending' ? (
              <Text style={[styles.receivedHelperText, { color: textColor, fontFamily }]}>
                {`Accept ${possessivePronoun} interest to start a conversation`}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {item.status === 'pending' ? (
          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              style={[
                styles.declineOutlineBtn,
                { borderColor: isDark ? '#475569' : '#94A3B8' },
              ]}
              activeOpacity={0.82}
              disabled={isBusy}
              onPress={() => onRespond(c.uid, 'decline', item.id)}
            >
              <ThumbsDown size={15} color={textSecondaryColor} strokeWidth={1.9} />
              <Text style={[styles.declineOutlineText, { color: textSecondaryColor, fontFamily }]}>
                Decline
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptInterestSolidBtn}
              activeOpacity={0.85}
              disabled={isBusy}
              onPress={() => onRespond(c.uid, 'accept', item.id)}
            >
              <ThumbsUp size={15} color="#FFFFFF" strokeWidth={2} />
              <Text style={[styles.acceptInterestSolidText, { fontFamily }]}>
                Accept Interest
              </Text>
            </TouchableOpacity>
          </View>
        ) : item.status === 'accepted' ? (
          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              style={[styles.callOutlineBtn, { borderColor: CORAL_RED }]}
              activeOpacity={0.82}
              onPress={() => onCall(item)}
            >
              <Phone size={15} color={CORAL_RED} strokeWidth={2} />
              <Text style={[styles.callOutlineText, { fontFamily }]}>Call Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sendMessageSolidBtn}
              activeOpacity={0.85}
              onPress={() => onSendMessage(item)}
            >
              <Mail size={15} color="#FFFFFF" strokeWidth={2} />
              <Text style={[styles.sendMessageSolidText, { fontFamily }]}>Send Message</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.index === next.index &&
    prev.direction === next.direction &&
    prev.isBusy === next.isBusy &&
    prev.isDark === next.isDark &&
    prev.cardSurface === next.cardSurface &&
    prev.dividerColor === next.dividerColor &&
    prev.fontFamily === next.fontFamily &&
    prev.nameFontSize === next.nameFontSize
);

type DirectionTab = 'received' | 'sent';
type StatusSubTab = 'all' | 'pending' | 'accepted' | 'declined';

const SUB_TABS: { key: StatusSubTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted / Replied' },
  { key: 'declined', label: 'Declined' },
];

function formatCompactHeight(cm?: number | null): string | null {
  if (!cm || cm <= 0) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function formatShortDate(ms?: number): string {
  if (!ms) return 'Recently';
  try {
    return new Date(ms).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

function isFemaleGender(raw?: string): boolean {
  const s = String(raw || '').trim().toLowerCase();
  return s === 'female' || s === 'f' || s === 'woman' || s === 'bride' || s === 'girl';
}

function formatTimeAgo(ms: number): string {
  if (!ms) return 'Recently';
  const diffMins = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMins < 60) return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

export default function MatrimonyInterestsHubScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialDirection: DirectionTab =
    route?.params?.initialDirection === 'sent' ? 'sent' : 'received';

  const [matchTier, setMatchTier] = useState<'regular' | 'prime'>('regular');
  const [direction, setDirection] = useState<DirectionTab>(initialDirection);
  const [subTab, setSubTab] = useState<StatusSubTab>('pending');

  const initialHubSnapshot = matrimonyApi.getCachedInterestsHub();
  const [receivedList, setReceivedList] = useState<MatrimonyInterestEntry[]>(
    () => initialHubSnapshot?.received || []
  );
  const [sentList, setSentList] = useState<MatrimonyInterestEntry[]>(
    () => initialHubSnapshot?.sent || []
  );
  const [loading, setLoading] = useState(() => !initialHubSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterRead, setFilterRead] = useState(false);
  const [draftUnread, setDraftUnread] = useState(false);
  const [draftRead, setDraftRead] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [menuTargetUid, setMenuTargetUid] = useState<string | null>(null);
  const [shortlistBusyUid, setShortlistBusyUid] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<MemberEntitlements | null>(
    () => initialHubSnapshot?.viewerEntitlements || matrimonyApi.getCachedEntitlements()
  );
  const [upgradePromptCandidate, setUpgradePromptCandidate] =
    useState<MatrimonyMatchCandidate | null>(null);
  const [recentlyAcceptedUids, setRecentlyAcceptedUids] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBottomToast = useCallback(
    (message: string) => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      setToastMessage(message);
      toastOpacity.stopAnimation();
      toastOpacity.setValue(0);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }).start();
      toastTimerRef.current = setTimeout(() => {
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => {
          setToastMessage(null);
        });
      }, 3400);
    },
    [toastOpacity]
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(READ_STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setReadIds(parsed.map(String));
        }
      })
      .catch(() => {});
  }, []);

  const markInterestAsRead = useCallback((interestId: string) => {
    setReadIds((prev) => {
      if (prev.includes(interestId)) return prev;
      const next = [...prev, interestId];
      AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const peachStripBg = isDark ? '#1E293B' : '#FDF4EE';
  const dividerColor = isDark ? colors.border : '#E5E7EB';

  const hasHubDataRef = useRef(
    Boolean(
      (initialHubSnapshot?.received?.length || 0) > 0 ||
        (initialHubSnapshot?.sent?.length || 0) > 0
    )
  );

  const loadInterests = useCallback(async (silent = false, force = false) => {
    const trace = matrimonyPerf.startTrace('interests_hub_load', { force, silent });
    const cached = matrimonyApi.getCachedInterestsHub();
    if (cached && !force) {
      setReceivedList(cached.received || []);
      setSentList(cached.sent || []);
      if (cached.viewerEntitlements) setEntitlements(cached.viewerEntitlements);
      hasHubDataRef.current = true;
      setLoading(false);
    } else if (!silent && !hasHubDataRef.current) {
      setLoading(true);
    }
    try {
      if (force) {
        setRecentlyAcceptedUids([]);
      }
      const res = await matrimonyApi.getInterestsHub({ force });
      setReceivedList(res.received || []);
      setSentList(res.sent || []);
      if (res.viewerEntitlements) setEntitlements(res.viewerEntitlements);
      hasHubDataRef.current = true;
      trace.stop(true, {
        receivedCount: res.received?.length ?? 0,
        sentCount: res.sent?.length ?? 0,
      });
    } catch (err: any) {
      trace.stop(false);
      if (isMatrimonyInactiveError(err)) {
        navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
        return;
      }
      console.warn('getInterestsHub error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadInterests(false, false);
  }, [loadInterests]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadInterests(true, false));
    return unsub;
  }, [navigation, loadInterests]);

  const activeSourceList = direction === 'received' ? receivedList : sentList;

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeSourceList.filter((entry) => {
      const c = entry.candidate;
      if (matchTier === 'prime') {
        const isPrime =
          Boolean(c.signedProfilePhoto) &&
          (c.matchScore >= 65 || c.faithSummary?.baptized === true);
        if (!isPrime) return false;
      }
      if (
        subTab !== 'all' &&
        entry.status !== subTab &&
        !(
          subTab === 'pending' &&
          direction === 'received' &&
          recentlyAcceptedUids.includes(entry.candidate.uid)
        )
      ) {
        return false;
      }
      if (direction === 'received') {
        const isRead = readIds.includes(entry.id) || entry.status !== 'pending';
        if (filterUnread && !filterRead && isRead) return false;
        if (filterRead && !filterUnread && !isRead) return false;
      }
      if (q) {
        const hay = [
          c.displayName,
          c.profileCode,
          c.location?.city,
          c.location?.village,
          c.location?.state,
          c.education?.qualification,
          c.career?.profession,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },
  [
    activeSourceList,
    matchTier,
    subTab,
    direction,
    filterUnread,
    filterRead,
    readIds,
    searchQuery,
    recentlyAcceptedUids,
  ]
  );

  const contextHeading = useMemo(() => {
    if (direction === 'received') {
      switch (subTab) {
        case 'all':
          return {
            title: 'All interests received',
            subtitle: 'Interests and responses from members',
          };
        case 'pending':
          return {
            title: 'Pending interests',
            subtitle: 'Interests from members awaiting your response',
          };
        case 'accepted':
          return {
            title: 'Interests that were accepted / replied to',
            subtitle: null,
          };
        case 'declined':
          return {
            title: 'Interests that were declined',
            subtitle: null,
          };
      }
    } else {
      switch (subTab) {
        case 'all':
          return {
            title: 'All interests sent',
            subtitle: 'Interests you sent to matching members',
          };
        case 'pending':
          return {
            title: 'Matches yet to respond',
            subtitle: null,
          };
        case 'accepted':
          return {
            title: 'Interests that were accepted / replied to',
            subtitle: null,
          };
        case 'declined':
          return {
            title: 'Interests that were declined',
            subtitle: null,
          };
      }
    }
  }, [direction, subTab]);

  const emptyMessage = useMemo(() => {
    if (direction === 'received') {
      switch (subTab) {
        case 'all':
          return {
            lead: 'No conversation till now',
            main: 'All incoming messages/interests and responses will be shown here',
          };
        case 'pending':
          return {
            lead: null,
            main: 'You have no pending interests/messages.',
          };
        case 'accepted':
          return {
            lead: null,
            main: 'You have no accepted interests or replied messages yet',
          };
        case 'declined':
          return {
            lead: null,
            main: 'You have no declined interests/messages yet',
          };
      }
    } else {
      switch (subTab) {
        case 'all':
          return {
            lead: 'No conversation till now',
            main: 'All interests you send will be shown here',
          };
        case 'pending':
          return {
            lead: null,
            main: 'You have no pending interests/messages yet',
          };
        case 'accepted':
          return {
            lead: null,
            main: 'You have no accepted interests or replied messages yet',
          };
        case 'declined':
          return {
            lead: null,
            main: 'You have no declined interests/messages yet',
          };
      }
    }
  }, [direction, subTab]);

  const busyUidRef = useRef<string | null>(null);
  const shortlistBusyUidRef = useRef<string | null>(null);

  const handleRespond = useCallback(
    async (
      targetUid: string,
      action: 'accept' | 'decline' | 'withdraw' | 'withdraw_accept',
      interestId?: string
    ) => {
      if (busyUidRef.current === targetUid) return;
      busyUidRef.current = targetUid;
      if (interestId) markInterestAsRead(interestId);
      setBusyUid(targetUid);

      const candidateName =
        receivedList.find((r) => r.candidate.uid === targetUid)?.candidate.displayName ||
        sentList.find((s) => s.candidate.uid === targetUid)?.candidate.displayName ||
        'Member';

      if (action === 'withdraw') {
        setSentList((prev) => prev.filter((row) => row.candidate.uid !== targetUid));
        showBottomToast('Your pending interest request has been withdrawn');
      } else if (action === 'withdraw_accept') {
        const nowMs = Date.now();
        setRecentlyAcceptedUids((prev) => prev.filter((id) => id !== targetUid));
        setSentList((prev) =>
          prev.filter((row) => !(row.candidate.uid === targetUid && row.status === 'accepted'))
        );
        setReceivedList((prev) =>
          prev.map((row) =>
            row.candidate.uid === targetUid
              ? {
                  ...row,
                  status: 'pending',
                  updatedAtMs: nowMs,
                  candidate: { ...row.candidate, interestStatus: 'pending' },
                }
              : row
          )
        );
        showBottomToast(`You have withdrawn acceptance for ${candidateName}`);
      } else {
        const optimisticStatus = action === 'accept' ? 'accepted' : 'declined';
        const nowMs = Date.now();
        setReceivedList((prev) =>
          prev.map((row) =>
            row.candidate.uid === targetUid
              ? {
                  ...row,
                  status: optimisticStatus,
                  updatedAtMs: nowMs,
                  candidate: { ...row.candidate, interestStatus: optimisticStatus },
                }
              : row
          )
        );
        if (action === 'accept') {
          setRecentlyAcceptedUids((prev) =>
            prev.includes(targetUid) ? prev : [...prev, targetUid]
          );
          showBottomToast(`You have successfully accepted ${candidateName}'s interest`);
        } else {
          setRecentlyAcceptedUids((prev) => prev.filter((id) => id !== targetUid));
          showBottomToast(`You have declined ${candidateName}'s interest`);
        }
      }

      const trace = matrimonyPerf.startTrace('respond_interest_rpc', { action });
      try {
        await matrimonyApi.respondInterest(targetUid, action);
        trace.stop(true);
      } catch (err: any) {
        trace.stop(false);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToastMessage(null);
        setRecentlyAcceptedUids((prev) => prev.filter((id) => id !== targetUid));
        await loadInterests(true, true);
        Alert.alert('Error', err?.message || 'Unable to update interest.');
      } finally {
        if (busyUidRef.current === targetUid) {
          busyUidRef.current = null;
        }
        setBusyUid(null);
      }
    },
    [loadInterests, markInterestAsRead, receivedList, sentList, showBottomToast]
  );

  const openDetail = useCallback(
    (index: number) => {
      const entry = filteredItems[index];
      if (entry && direction === 'received') {
        markInterestAsRead(entry.id);
      }
      const headerTitle =
        direction === 'received'
          ? 'Interests Received'
          : subTab === 'pending'
          ? 'Sent Waiting'
          : 'Interests Sent';
      navigation.navigate('MatrimonyMatchDetail', {
        matches: filteredItems.map((e) => ({
          ...e.candidate,
          interestSentAtMs: e.candidate.interestSentAtMs || e.updatedAtMs || e.createdAtMs,
        })),
        initialIndex: index,
        tabTitle: headerTitle,
      });
    },
    [direction, filteredItems, markInterestAsRead, navigation, subTab]
  );

  const handleCallCandidate = useCallback(
    (entry: MatrimonyInterestEntry) => {
      const c = entry.candidate;
      if (!entitlements || entitlements.tier === 'free' || !entitlements.callAccess) {
        setUpgradePromptCandidate(c);
        return;
      }
      if (c.mobilePrivacy === 'messages_only') {
        Alert.alert(
          'Messages Only',
          `${c.displayName} has restricted phone calls to Messages only.`
        );
        return;
      }
      if (c.contactPhone) {
        Linking.openURL(`tel:${c.contactPhone}`).catch(() => {
          Alert.alert('Call Failed', 'Could not open phone dialer.');
        });
        return;
      }
      Alert.alert(
        'Contact Protected',
        entry.status === 'accepted'
          ? `Phone number (${c.maskedPhone || 'hidden'}) could not be loaded.`
          : `Direct phone calling unlocks once ${c.displayName} accepts your interest.`
      );
    },
    [entitlements]
  );

  const handleSendMessageCandidate = useCallback(
    (entry: MatrimonyInterestEntry) => {
      const c = entry.candidate;
      if (!entitlements || entitlements.tier === 'free' || !entitlements.messageAccess) {
        setUpgradePromptCandidate(c);
        return;
      }
      if (entry.status === 'accepted') {
        navigation.navigate('MatrimonyChat', {
          targetUid: c.uid,
          peer: {
            uid: c.uid,
            displayName: c.displayName,
            profileCode: c.profileCode,
            signedProfilePhoto: c.signedProfilePhoto || null,
            age: c.age ?? null,
            heightCm: c.heightCm ?? null,
            occupation:
              c.career?.profession ||
              c.career?.occupationCategory ||
              c.career?.employmentType ||
              c.education?.qualification ||
              null,
            gender: c.gender || null,
            isVerified: true,
            city: c.location?.village || c.location?.city || c.location?.state || '',
            contactPhone: c.contactPhone || null,
          },
        });
        return;
      }
      Alert.alert(
        'Send Message',
        `Direct messaging opens once ${c.displayName} accepts your interest.`
      );
    },
    [entitlements, navigation]
  );

  const handleToggleShortlistFromCard = useCallback(async (entry: MatrimonyInterestEntry) => {
    const c = entry.candidate;
    if (shortlistBusyUidRef.current === c.uid) return;
    shortlistBusyUidRef.current = c.uid;
    const prevShortlisted = Boolean(c.isShortlisted);
    const nextShortlisted = !prevShortlisted;

    const applyFlag = (flag: boolean) => {
      const updater = (prev: MatrimonyInterestEntry[]) =>
        prev.map((row) =>
          row.candidate.uid === c.uid
            ? { ...row, candidate: { ...row.candidate, isShortlisted: flag } }
            : row
        );
      setReceivedList(updater);
      setSentList(updater);
    };

    setShortlistBusyUid(c.uid);
    applyFlag(nextShortlisted);
    try {
      const res = await matrimonyApi.toggleShortlist(c.uid, nextShortlisted);
      applyFlag(res.shortlisted);
    } catch (err: any) {
      applyFlag(prevShortlisted);
      Alert.alert('Error', err?.message || 'Could not update shortlist.');
    } finally {
      if (shortlistBusyUidRef.current === c.uid) {
        shortlistBusyUidRef.current = null;
      }
      setShortlistBusyUid(null);
    }
  }, []);

  const openSentMoreMenu = useCallback((entry: MatrimonyInterestEntry) => {
    if (busyUidRef.current === entry.candidate.uid) return;
    setMenuTargetUid(entry.candidate.uid);
  }, []);

  const cardNameFontSize = scaleFont(17);

  const renderInterestCard = useCallback(
    ({ item, index }: { item: MatrimonyInterestEntry; index: number }) => (
      <InterestCardItem
        item={item}
        index={index}
        direction={direction}
        isBusy={busyUid === item.candidate.uid}
        isDark={isDark}
        cardSurface={cardSurface}
        dividerColor={dividerColor}
        textColor={colors.text}
        textSecondaryColor={colors.textSecondary}
        fontFamily={fontFamily}
        nameFontSize={cardNameFontSize}
        onOpenDetail={openDetail}
        onOpenSentMoreMenu={openSentMoreMenu}
        onCall={handleCallCandidate}
        onSendMessage={handleSendMessageCandidate}
        onRespond={handleRespond}
      />
    ),
    [
      direction,
      busyUid,
      isDark,
      cardSurface,
      dividerColor,
      colors.text,
      colors.textSecondary,
      fontFamily,
      cardNameFontSize,
      openDetail,
      openSentMoreMenu,
      handleCallCandidate,
      handleSendMessageCandidate,
      handleRespond,
    ]
  );

  const activeFilterCount = (filterUnread ? 1 : 0) + (filterRead ? 1 : 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: cardSurface }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={cardSurface} />

      {/* Top Regular / PRIME Toggle (Uniform White Header) */}
      <View style={[styles.topHeaderContainer, { backgroundColor: cardSurface, borderBottomColor: dividerColor }]}>
        <View style={styles.tierBarRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.topBackBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={21} color={colors.text} />
          </TouchableOpacity>

          <MatrimonyTierToggle
            value={matchTier}
            onChange={setMatchTier}
            fontFamily={fontFamily}
          />

          <View style={styles.tierRightSpacer} />
        </View>

        {/* Primary Tabs: Interests Received | Interests Sent */}
        <View style={styles.primaryTabsRow}>
          <TouchableOpacity
            style={[
              styles.primaryTabItem,
              direction === 'received' && styles.primaryTabItemActive,
            ]}
            onPress={() => {
              setDirection('received');
              setRecentlyAcceptedUids([]);
            }}
          >
            <Text
              style={[
                styles.primaryTabText,
                {
                  color: direction === 'received' ? ORANGE_ACTIVE : colors.text,
                  fontWeight: direction === 'received' ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              Interests Received
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.primaryTabItem,
              direction === 'sent' && styles.primaryTabItemActive,
            ]}
            onPress={() => {
              setDirection('sent');
              setRecentlyAcceptedUids([]);
            }}
          >
            <Text
              style={[
                styles.primaryTabText,
                {
                  color: direction === 'sent' ? ORANGE_ACTIVE : colors.text,
                  fontWeight: direction === 'sent' ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              Interests Sent
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Light Peach Status Filter Strip */}
      <View style={[styles.subTabsStrip, { backgroundColor: peachStripBg }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabsScroll}
        >
          {SUB_TABS.map((item) => {
            const active = subTab === item.key;
            const tabCount =
              item.key === 'all'
                ? activeSourceList.length
                : activeSourceList.filter((e) => e.status === item.key).length;
            const chipText = tabCount > 0 ? `${item.label} (${tabCount})` : item.label;
            if (active) {
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSubTab(item.key);
                    setRecentlyAcceptedUids([]);
                  }}
                >
                  <LinearGradient
                    colors={ORANGE_GRADIENT}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.subTabChipActive}
                  >
                    <Text style={[styles.subTabChipTextActive, { fontFamily }]}>
                      {chipText}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.8}
                onPress={() => {
                  setSubTab(item.key);
                  setRecentlyAcceptedUids([]);
                }}
                style={[
                  styles.subTabChip,
                  {
                    borderColor: isDark ? '#334155' : '#DED3CA',
                  },
                ]}
              >
                <Text style={[styles.subTabChipText, { color: colors.text, fontFamily }]}>
                  {chipText}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Context Subheader Row + Filter / Search */}
      <View style={[styles.contextHeaderBar, { backgroundColor: cardSurface, borderBottomColor: dividerColor }]}>
        <View style={styles.contextTitleCol}>
          <Text style={[styles.contextTitle, { color: colors.text, fontFamily }]}>
            {contextHeading.title} ({filteredItems.length})
          </Text>
          {contextHeading.subtitle ? (
            <Text style={[styles.contextSubtitle, { color: colors.textSecondary, fontFamily }]}>
              {contextHeading.subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.contextRightRow}>
          {direction === 'received' && (
            <TouchableOpacity
              style={[
                styles.filterChipBtn,
                {
                  backgroundColor: cardSurface,
                  borderColor: activeFilterCount > 0 ? ORANGE_ACTIVE : '#CBD5E1',
                },
              ]}
              onPress={() => {
                setDraftUnread(filterUnread);
                setDraftRead(filterRead);
                setFilterOpen(true);
              }}
            >
              <SlidersHorizontal size={14} color={colors.text} />
              <Text style={[styles.filterChipText, { color: colors.text, fontFamily }]}>
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              setSearchOpen((prev) => !prev);
              if (searchOpen) setSearchQuery('');
            }}
            style={styles.searchIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Search size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {searchOpen && (
        <View style={[styles.searchBarWrap, { backgroundColor: cardSurface, borderBottomColor: dividerColor }]}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, ID, or city..."
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text, fontFamily }]}
            autoFocus
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Main Content Area */}
      <View style={{ flex: 1, backgroundColor: cardSurface }}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={ORANGE_ACTIVE} />
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            renderItem={renderInterestCard}
            contentContainerStyle={
              filteredItems.length === 0 ? styles.emptyContainer : styles.listContent
            }
            showsVerticalScrollIndicator={false}
            initialNumToRender={6}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === 'android'}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  loadInterests(true, true);
                }}
                colors={[ORANGE_ACTIVE]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <InterestsEmptyIllustration />
                {emptyMessage.lead ? (
                  <Text style={[styles.emptyLead, { color: colors.textSecondary, fontFamily }]}>
                    {emptyMessage.lead}
                  </Text>
                ) : null}
                <Text style={[styles.emptyMainText, { color: colors.text, fontFamily }]}>
                  {emptyMessage.main}
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Filter Sheet matching screenshot (Unread / Read + Clear / Apply) */}
      <Modal
        visible={filterOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setFilterOpen(false)}
          />
          <View
            style={[
              styles.sheetCard,
              { backgroundColor: cardSurface, paddingBottom: Math.max(insets.bottom + 18, 26) },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: dividerColor }]}>
              <Text style={[styles.sheetTitle, { color: colors.text, fontFamily, fontSize: 18 }]}>
                Filter
              </Text>
              <TouchableOpacity
                onPress={() => setFilterOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={21} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.checkRow, { borderBottomColor: 'transparent' }]}
              activeOpacity={0.75}
              onPress={() => setDraftUnread((v) => !v)}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.checkRowText, { color: colors.text, fontFamily }]}>
                  Unread
                </Text>
                <Text style={[styles.checkRowSub, { color: colors.textSecondary, fontFamily }]}>
                  Interests / messages you haven&apos;t read yet
                </Text>
              </View>
              <View
                style={[
                  styles.checkBox,
                  {
                    borderColor: draftUnread ? ORANGE_ACTIVE : '#64748B',
                    backgroundColor: draftUnread ? ORANGE_ACTIVE : 'transparent',
                  },
                ]}
              >
                {draftUnread ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkRow, { borderBottomColor: 'transparent' }]}
              activeOpacity={0.75}
              onPress={() => setDraftRead((v) => !v)}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.checkRowText, { color: colors.text, fontFamily }]}>
                  Read
                </Text>
                <Text style={[styles.checkRowSub, { color: colors.textSecondary, fontFamily }]}>
                  Interests / messages you have read
                </Text>
              </View>
              <View
                style={[
                  styles.checkBox,
                  {
                    borderColor: draftRead ? ORANGE_ACTIVE : '#64748B',
                    backgroundColor: draftRead ? ORANGE_ACTIVE : 'transparent',
                  },
                ]}
              >
                {draftRead ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
              </View>
            </TouchableOpacity>

            <View style={styles.sheetFooterRow}>
              <TouchableOpacity
                style={[
                  styles.clearPillBtn,
                  {
                    backgroundColor:
                      draftUnread || draftRead || filterUnread || filterRead
                        ? isDark
                          ? '#334155'
                          : '#F1F5F9'
                        : isDark
                        ? '#1E293B'
                        : '#E5E7EB',
                  },
                ]}
                onPress={() => {
                  setDraftUnread(false);
                  setDraftRead(false);
                  setFilterUnread(false);
                  setFilterRead(false);
                  setFilterOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.clearPillText,
                    {
                      color:
                        draftUnread || draftRead || filterUnread || filterRead
                          ? colors.text
                          : '#64748B',
                      fontFamily,
                    },
                  ]}
                >
                  Clear
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.applyBtn,
                  {
                    backgroundColor:
                      draftUnread || draftRead || draftUnread !== filterUnread || draftRead !== filterRead
                        ? ORANGE_ACTIVE
                        : isDark
                        ? '#1E293B'
                        : '#E5E7EB',
                  },
                ]}
                onPress={() => {
                  setFilterUnread(draftUnread);
                  setFilterRead(draftRead);
                  setFilterOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.applyBtnText,
                    {
                      color:
                        draftUnread || draftRead || draftUnread !== filterUnread || draftRead !== filterRead
                          ? '#FFFFFF'
                          : '#64748B',
                      fontFamily,
                    },
                  ]}
                >
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Designed Three-Dot Action Popup Card for Sent Interests */}
      {(() => {
        const liveIndex = menuTargetUid
          ? filteredItems.findIndex((row) => row.candidate.uid === menuTargetUid)
          : -1;
        const liveEntry = liveIndex >= 0 ? filteredItems[liveIndex] : null;
        return (
          <Modal
            visible={liveEntry !== null}
            transparent
            statusBarTranslucent
            animationType="fade"
            onRequestClose={() => setMenuTargetUid(null)}
          >
            <View style={styles.sheetBackdrop}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={() => setMenuTargetUid(null)}
              />
              {liveEntry ? (() => {
                const c = liveEntry.candidate;
                const sentDateStr = formatShortDate(
                  liveEntry.updatedAtMs || liveEntry.createdAtMs
                );
                const isShortlistBusy = shortlistBusyUid === c.uid;
                const isActionBusy = busyUid === c.uid;
                return (
                  <View
                    style={[
                      styles.menuSheetCard,
                      {
                        backgroundColor: cardSurface,
                        paddingBottom: Math.max(insets.bottom + 16, 24),
                      },
                    ]}
                  >
                    <View style={styles.menuDragHandleWrap}>
                      <View
                        style={[
                          styles.menuDragHandle,
                          { backgroundColor: isDark ? '#334155' : '#CBD5E1' },
                        ]}
                      />
                    </View>

                    {/* Member Preview Header */}
                    <View style={[styles.menuMemberHeader, { borderBottomColor: dividerColor }]}>
                      <View style={styles.menuAvatarBox}>
                        {c.signedProfilePhoto ? (
                          <Image
                            source={{ uri: c.signedProfilePhoto }}
                            style={styles.thumbImg}
                            resizeMode="cover"
                          />
                        ) : c.isPhotoProtected ? (
                          <ProtectedPhotoPlaceholder
                            gender={c.gender}
                            compact
                            requestStatus={c.photoRequestStatus}
                            fontFamily={fontFamily}
                          />
                        ) : (
                          <View
                            style={[
                              styles.thumbPlaceholder,
                              { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' },
                            ]}
                          >
                            <User size={22} color="#94A3B8" />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.menuMemberName, { color: colors.text, fontFamily }]}
                          numberOfLines={1}
                        >
                          {c.displayName}
                        </Text>
                        <Text
                          style={[styles.menuMemberSub, { color: colors.textSecondary, fontFamily }]}
                          numberOfLines={1}
                        >
                          {c.profileCode} • {direction === 'received' ? 'Received' : 'Sent'} {sentDateStr}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setMenuTargetUid(null)}
                        style={[
                          styles.menuCloseCircle,
                          { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Action Options */}
                    <View style={styles.menuOptionsList}>
                      <TouchableOpacity
                        style={[
                          styles.menuActionRow,
                          { borderBottomColor: dividerColor },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          setMenuTargetUid(null);
                          openDetail(liveIndex);
                        }}
                      >
                        <View style={styles.menuIconWrap}>
                          <User size={20} color={colors.text} strokeWidth={1.9} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.menuActionTitle, { color: colors.text, fontFamily }]}>
                            View Profile
                          </Text>
                          <Text
                            style={[styles.menuActionSub, { color: colors.textSecondary, fontFamily }]}
                          >
                            See full details, photos &amp; compatibility
                          </Text>
                        </View>
                        <ChevronRight size={18} color={colors.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        disabled={isShortlistBusy}
                        style={[
                          styles.menuActionRow,
                          {
                            borderBottomColor:
                              (direction === 'sent' && liveEntry.status === 'pending') ||
                              (direction === 'received' && liveEntry.status === 'accepted')
                                ? dividerColor
                                : 'transparent',
                            opacity: isShortlistBusy ? 0.65 : 1,
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          setMenuTargetUid(null);
                          handleToggleShortlistFromCard(liveEntry);
                        }}
                      >
                        <View style={styles.menuIconWrap}>
                          <Bookmark
                            size={20}
                            color={c.isShortlisted ? ORANGE_ACTIVE : colors.text}
                            fill={c.isShortlisted ? ORANGE_ACTIVE : 'transparent'}
                            strokeWidth={1.9}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.menuActionTitle, { color: colors.text, fontFamily }]}>
                            {c.isShortlisted ? 'Remove from Shortlist' : 'Shortlist Profile'}
                          </Text>
                          <Text
                            style={[styles.menuActionSub, { color: colors.textSecondary, fontFamily }]}
                          >
                            {c.isShortlisted
                              ? 'Remove this member from your shortlisted list'
                              : 'Save this profile for quick access later'}
                          </Text>
                        </View>
                        <ChevronRight size={18} color={colors.textSecondary} />
                      </TouchableOpacity>

                      {direction === 'sent' && liveEntry.status === 'pending' && (
                        <TouchableOpacity
                          disabled={isActionBusy}
                          style={[
                            styles.menuActionRow,
                            {
                              borderBottomColor: 'transparent',
                              opacity: isActionBusy ? 0.65 : 1,
                            },
                          ]}
                          activeOpacity={0.7}
                          onPress={() => {
                            setMenuTargetUid(null);
                            handleRespond(c.uid, 'withdraw');
                          }}
                        >
                          <View style={styles.menuIconWrap}>
                            <RotateCcw size={20} color="#DC2626" strokeWidth={2} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.menuActionTitle, { color: '#DC2626', fontFamily }]}>
                              Withdraw Interest
                            </Text>
                            <Text
                              style={[
                                styles.menuActionSub,
                                { color: isDark ? '#FCA5A5' : '#B91C1C', fontFamily },
                              ]}
                            >
                              Cancel your pending interest request
                            </Text>
                          </View>
                          <ChevronRight size={18} color="#DC2626" />
                        </TouchableOpacity>
                      )}

                      {direction === 'received' && liveEntry.status === 'accepted' && (
                        <TouchableOpacity
                          disabled={isActionBusy}
                          style={[
                            styles.menuActionRow,
                            {
                              borderBottomColor: 'transparent',
                              opacity: isActionBusy ? 0.65 : 1,
                            },
                          ]}
                          activeOpacity={0.7}
                          onPress={() => {
                            setMenuTargetUid(null);
                            handleRespond(c.uid, 'withdraw_accept', liveEntry.id);
                          }}
                        >
                          <View style={styles.menuIconWrap}>
                            <RotateCcw size={20} color="#DC2626" strokeWidth={2} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.menuActionTitle, { color: '#DC2626', fontFamily }]}>
                              Withdraw Acceptance
                            </Text>
                            <Text
                              style={[
                                styles.menuActionSub,
                                { color: isDark ? '#FCA5A5' : '#B91C1C', fontFamily },
                              ]}
                            >
                              Cancel your acceptance and move back to pending
                            </Text>
                          </View>
                          <ChevronRight size={18} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.menuCancelBtn,
                        { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => setMenuTargetUid(null)}
                    >
                      <Text style={[styles.menuCancelText, { color: colors.text, fontFamily }]}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })() : null}
            </View>
          </Modal>
        );
      })()}

      {toastMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bottomToastBar,
            {
              opacity: toastOpacity,
              transform: [
                {
                  translateY: toastOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.bottomToastText, { fontFamily }]} numberOfLines={2}>
            {toastMessage}
          </Text>
        </Animated.View>
      ) : null}

      <MatrimonyUpgradePromptModal
        visible={Boolean(upgradePromptCandidate)}
        candidate={upgradePromptCandidate}
        viewerPhoto={
          matrimonyApi.getCachedStatus()?.signedProfilePhoto ||
          matrimonyApi.getCachedRegistration()?.profile?.signedProfilePhoto ||
          (user as any)?.photoURL ||
          null
        }
        fontFamily={fontFamily}
        onClose={() => setUpgradePromptCandidate(null)}
        onContinue={() => {
          setUpgradePromptCandidate(null);
          navigation.navigate('MatrimonyUpgrade');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeaderContainer: {
    paddingTop: 8,
    borderBottomWidth: 1,
  },
  tierBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  topBackBtn: {
    width: 36,
    paddingVertical: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  tierRightSpacer: {
    width: 36,
  },
  tierPillTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    padding: 3,
    borderWidth: 1,
  },
  tierSegmentBtn: {
    paddingHorizontal: 22,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tierSegmentActive: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tierSegmentText: {
    fontSize: 13.5,
  },
  primaryTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryTabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  primaryTabItemActive: {
    borderBottomColor: ORANGE_ACTIVE,
  },
  primaryTabText: {
    fontSize: 14.5,
  },
  subTabsStrip: {
    paddingVertical: 12,
  },
  subTabsScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  subTabChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  subTabChipText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  subTabChipActive: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  subTabChipTextActive: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  contextHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  contextTitleCol: {
    flex: 1,
    gap: 2,
  },
  contextTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  contextSubtitle: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  contextRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  searchIconBtn: {
    padding: 4,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingBottom: 24,
  },
  emptyLead: {
    fontSize: 14.5,
    fontWeight: '500',
    marginTop: 4,
  },
  emptyMainText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 23,
  },
  listContent: {
    padding: 14,
    gap: 12,
    paddingBottom: 24,
  },
  interestCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  thumbBox: {
    width: 106,
    height: 132,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  sentThumbBox: {
    width: 96,
    height: 106,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  sentStatusLine: {
    fontSize: 13.5,
    paddingTop: 2,
  },
  receivedHelperText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  declineOutlineBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  declineOutlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  acceptInterestSolidBtn: {
    flex: 1.45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
  },
  acceptInterestSolidText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  callOutlineBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  callOutlineText: {
    color: CORAL_RED,
    fontSize: 14,
    fontWeight: '700',
  },
  sendMessageSolidBtn: {
    flex: 1.45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
  },
  sendMessageSolidText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountPill: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoCountText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardInfoCol: {
    flex: 1,
    gap: 3,
  },
  cardTopBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardName: {
    fontWeight: '800',
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardDetails: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  outlineActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  outlineActionText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  acceptActionBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: GREEN_ACCEPT,
  },
  acceptActionText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  viewProfileBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  viewProfileText: {
    color: ORANGE_ACTIVE,
    fontSize: 13.5,
    fontWeight: '800',
  },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navChatBadge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3.5,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navChatBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  navLabel: {
    fontSize: 11,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkRowText: {
    fontSize: 16,
    fontWeight: '700',
  },
  checkRowSub: {
    fontSize: 13,
    marginTop: 3,
  },
  checkBox: {
    width: 21,
    height: 21,
    borderRadius: 4,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetFooterRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18,
  },
  clearPillBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearPillText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  menuSheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  menuDragHandleWrap: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  menuDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  menuMemberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuAvatarBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  menuMemberName: {
    fontSize: 16,
    fontWeight: '800',
  },
  menuMemberSub: {
    fontSize: 12.5,
    marginTop: 2,
    fontWeight: '500',
  },
  menuCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOptionsList: {
    marginTop: 4,
  },
  menuActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 2,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIconWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuActionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  menuActionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  menuCancelBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  sentShortlistTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
  },
  sentShortlistTagText: {
    color: ORANGE_ACTIVE,
    fontSize: 11,
    fontWeight: '700',
  },
  bottomToastBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#323437',
    paddingHorizontal: 16,
    paddingVertical: 13,
    zIndex: 50,
    elevation: 8,
  },
  bottomToastText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 19,
  },
});
