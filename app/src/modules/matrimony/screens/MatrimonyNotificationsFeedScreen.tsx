import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Crown,
  Heart,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyCachedImage from '../components/MatrimonyCachedImage';
import { matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyNotificationFeedItem } from '../types/matrimony';

const ORANGE = '#EA580C';
const AMBER_OUTLINE = '#D97706';
const MOCKUP_MEN_IMG = require('../../../../assets/matrimony_viewall_men.jpg');
const MOCKUP_WOMEN_IMG = require('../../../../assets/matrimony_viewall_women.jpg');

function isFemaleGender(raw?: string | null): boolean {
  const s = String(raw || '').trim().toLowerCase();
  return s === 'female' || s === 'f' || s === 'woman' || s === 'bride' || s === 'girl';
}

function formatCompactAge(createdAtMs: number): string {
  if (!createdAtMs) return '';
  const diffMs = Math.max(0, Date.now() - createdAtMs);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.max(1, Math.floor(days / 30));
  return `${months}mo`;
}

function getBucketLabel(createdAtMs: number): string {
  if (!createdAtMs) return 'Earlier this week';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (createdAtMs >= startOfToday) return 'Today';
  const diffDays = (Date.now() - createdAtMs) / (24 * 60 * 60 * 1000);
  if (diffDays <= 7) return 'Earlier this week';
  if (diffDays <= 30) return 'Earlier this month';
  return 'Older';
}

function resolveFallbackGenderIsFemale(
  item: MatrimonyNotificationFeedItem,
  viewerGender?: string | null
): boolean {
  const rawSenderGender = item.senderGender || item.candidate?.gender;
  if (rawSenderGender) {
    return isFemaleGender(rawSenderGender);
  }
  if (viewerGender) {
    // Match/person alerts without explicit senderGender represent opposite-gender profiles
    return !isFemaleGender(viewerGender);
  }
  return false;
}

function NotificationAvatar({
  item,
  viewerGender,
}: {
  item: MatrimonyNotificationFeedItem;
  viewerGender?: string | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUri = !imgFailed
    ? item.senderPhoto || item.candidate?.signedProfilePhoto || null
    : null;

  if (photoUri) {
    return (
      <MatrimonyCachedImage
        uri={photoUri}
        recyclingKey={item.senderUid || item.id}
        style={styles.avatarImg}
        resizeMode="cover"
        onError={() => setImgFailed(true)}
      />
    );
  }

  const isPersonOrMatchAlert =
    Boolean(item.senderUid || item.senderGender || item.candidate) ||
    item.category === 'interactions' ||
    item.type === 'DAILY_MATCHES' ||
    item.type === 'RECENTLY_JOINED' ||
    item.type === 'NEW_MATCHES' ||
    item.type === 'DAILY_RECOMMENDATION' ||
    item.type === 'SIMILAR_MATCHES' ||
    item.type === 'BASED_ON_ACTIVITY' ||
    item.type === 'CITY_MATCHES' ||
    item.type === 'PHOTO_MATCHES';

  if (isPersonOrMatchAlert) {
    const female = resolveFallbackGenderIsFemale(item, viewerGender);
    return (
      <Image
        source={female ? MOCKUP_WOMEN_IMG : MOCKUP_MEN_IMG}
        style={styles.avatarImg}
        resizeMode="cover"
      />
    );
  }

  let IconComp: any = Sparkles;
  let bg = '#FFF7ED';
  let fg = ORANGE;
  if (item.type === 'MEMBERSHIP_OFFERS') {
    IconComp = Crown;
    bg = '#FEF3C7';
    fg = '#B45309';
  } else if (item.type === 'PROFILE_APPROVED' || item.type === 'PROFILE_REJECTED' || item.type === 'CORRECTION_REQUESTED') {
    IconComp = ShieldCheck;
    bg = '#ECFDF5';
    fg = '#059669';
  } else if (item.type === 'MUTUAL_MATCH' || item.type === 'INTEREST_RECEIVED') {
    IconComp = Heart;
    bg = '#FFF1F2';
    fg = '#E11D48';
  }

  return (
    <View style={[styles.avatarIconBadge, { backgroundColor: bg }]}>
      <IconComp size={24} color={fg} />
    </View>
  );
}

function renderMessageCopy(
  item: MatrimonyNotificationFeedItem,
  textColor: string,
  mutedColor: string,
  fontFamily?: string
) {
  const name = item.senderName;
  if (name) {
    let verb = '';
    if (item.type === 'PROFILE_VIEW') verb = 'has viewed your profile';
    else if (item.type === 'PROFILE_SHORTLISTED') verb = 'shortlisted your profile';
    else if (item.type === 'INTEREST_RECEIVED') verb = 'sent you an interest';
    else if (item.type === 'MUTUAL_MATCH') verb = 'accepted your interest';
    else if (item.type === 'PHOTO_REQUEST_RECEIVED') verb = 'requested to view your photo';
    else if (item.type === 'PHOTO_REQUEST_APPROVED') verb = 'allowed you to view their photo';

    if (verb) {
      return (
        <Text style={[styles.msgText, { color: textColor, fontFamily }]}>
          <Text style={styles.msgSenderBold}>{name}</Text> {verb}
        </Text>
      );
    }
  }

  return (
    <View>
      <Text style={[styles.msgText, { color: textColor, fontFamily }]} numberOfLines={2}>
        <Text style={styles.msgSenderBold}>{item.title}</Text>
      </Text>
      {Boolean(item.body) && (
        <Text style={[styles.msgSubtext, { color: mutedColor, fontFamily }]} numberOfLines={3}>
          {item.body}
        </Text>
      )}
    </View>
  );
}

export default function MatrimonyNotificationsFeedScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [items, setItems] = useState<MatrimonyNotificationFeedItem[]>(() => {
    return matrimonyApi.getCachedNotificationsFeed()?.notifications || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return !matrimonyApi.getCachedNotificationsFeed();
  });
  const [refreshing, setRefreshing] = useState(false);
  const [menuItem, setMenuItem] = useState<MatrimonyNotificationFeedItem | null>(null);
  const respondSeqMapRef = useRef<Map<string, number>>(new Map());
  const lastFeedLoadAtRef = useRef<number>(0);

  const loadFeed = useCallback(async (force = false) => {
    lastFeedLoadAtRef.current = Date.now();
    try {
      const res = await matrimonyApi.getNotificationsFeed({ force });
      if (Array.isArray(res?.notifications)) {
        setItems(res.notifications);
      }
    } catch (err) {
      console.warn('loadFeed error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFeed(false);
    const unsub = navigation.addListener('focus', () => {
      const cached = matrimonyApi.getCachedNotificationsFeed();
      if (cached?.notifications) {
        setItems(cached.notifications);
        setLoading(false);
      }
      if (Date.now() - lastFeedLoadAtRef.current < 1500) return;
      loadFeed(false);
    });
    return unsub;
  }, [navigation, loadFeed]);

  const unreadCount = useMemo(
    () => items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
    [items]
  );

  const sections = useMemo(() => {
    const order = ['Today', 'Earlier this week', 'Earlier this month', 'Older'];
    const map = new Map<string, MatrimonyNotificationFeedItem[]>();
    items.forEach((item) => {
      const bucket = getBucketLabel(item.createdAtMs);
      const list = map.get(bucket) || [];
      list.push(item);
      map.set(bucket, list);
    });
    return order
      .filter((label) => (map.get(label)?.length || 0) > 0)
      .map((label) => ({ label, data: map.get(label)! }));
  }, [items]);

  const handleMarkRead = (item: MatrimonyNotificationFeedItem) => {
    if (!item.read) {
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, read: true } : x)));
      matrimonyApi.manageNotification('mark_read', item.id).catch(() => undefined);
    }
  };

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    matrimonyApi.manageNotification('mark_all_read').catch(() => undefined);
  };

  const handleDelete = (item: MatrimonyNotificationFeedItem) => {
    setMenuItem(null);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    matrimonyApi.manageNotification('delete', item.id).catch(() => undefined);
  };

  const handleRespondPhotoRequest = (
    item: MatrimonyNotificationFeedItem,
    action: 'approve' | 'decline'
  ) => {
    const requesterUid = item.senderUid;
    if (!requesterUid) return;
    const seq = (respondSeqMapRef.current.get(requesterUid) || 0) + 1;
    respondSeqMapRef.current.set(requesterUid, seq);

    const prevStatus = item.incomingPhotoRequestStatus || 'pending';
    const nextStatus = action === 'approve' ? 'approved' : 'declined';

    setItems((prev) =>
      prev.map((x) =>
        x.type === 'PHOTO_REQUEST_RECEIVED' && x.senderUid === requesterUid
          ? { ...x, incomingPhotoRequestStatus: nextStatus, read: true }
          : x.id === item.id
            ? { ...x, read: true }
            : x
      )
    );

    if (!item.read) {
      matrimonyApi.manageNotification('mark_read', item.id).catch(() => undefined);
    }

    matrimonyApi.respondToPhotoRequest(requesterUid, action).catch((err: any) => {
      if (respondSeqMapRef.current.get(requesterUid) !== seq) return;
      setItems((prev) =>
        prev.map((x) =>
          x.type === 'PHOTO_REQUEST_RECEIVED' && x.senderUid === requesterUid
            ? { ...x, incomingPhotoRequestStatus: prevStatus }
            : x
        )
      );
      Alert.alert('Action Failed', err?.message || 'Unable to update photo request.');
    });
  };

  const handleAction = (item: MatrimonyNotificationFeedItem) => {
    handleMarkRead(item);
    if (item.actionType === 'view_profile' && item.candidate) {
      const viewerPhoto =
        matrimonyApi.getCachedRegistration()?.profile?.signedProfilePhoto || null;
      navigation.navigate('MatrimonyMatchDetail', {
        matches: [item.candidate],
        initialIndex: 0,
        viewerPhoto,
        tabTitle: 'Notifications',
      });
      return;
    }
    if (item.actionType === 'view_photo_requests') {
      navigation.navigate('MatrimonyPrivacySettings');
      return;
    }
    if (item.actionType === 'view_interests') {
      navigation.navigate('MatrimonyMainTabs', { screen: 'MatrimonyInterestsHub' });
      return;
    }
    if (item.actionType === 'view_offers') {
      navigation.navigate('MatrimonyUpgrade');
      return;
    }
    if (item.actionType === 'view_status') {
      navigation.navigate('MatrimonyStatus');
      return;
    }
    navigation.navigate('MatrimonyMainTabs', { screen: 'MatrimonyMatches' });
  };

  const headerTextColor = isDark ? '#FFFFFF' : '#1E293B';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Warm Gradient Header */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(251, 146, 60, 0.34)', 'rgba(234, 88, 12, 0.18)', '#1E293B']
            : ['#FFD4B3', '#FFE8D6', '#FFF5ED']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.headerWrap,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: isDark ? 'rgba(251, 146, 60, 0.35)' : '#FED7AA',
          },
        ]}
      >
        <View style={styles.headerSideLeft}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerIconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={22} color={headerTextColor} />
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.headerTitle, { color: headerTextColor, fontFamily, fontSize: scaleFont(18) }]}
          numberOfLines={1}
        >
          Notifications
        </Text>

        <View style={styles.headerRightRow}>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              style={styles.headerIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <CheckCheck size={20} color={ORANGE} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => navigation.navigate('MatrimonyNotifications')}
            style={styles.headerIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Settings size={20} color={headerTextColor} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading && items.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : sections.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadFeed(true);
              }}
              colors={[ORANGE]}
              tintColor={ORANGE}
            />
          }
        >
          <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#1E293B' : '#FFF7ED' }]}>
            <Bell size={34} color={ORANGE} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text, fontFamily }]}>
            No notifications yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary, fontFamily }]}>
            When members view your profile, shortlist you, send interests, or new matches arrive, they’ll appear here.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadFeed(true);
              }}
              colors={[ORANGE]}
              tintColor={ORANGE}
            />
          }
        >
          {sections.map((section) => (
            <View key={section.label} style={styles.sectionBlock}>
              <Text
                style={[
                  styles.sectionHeader,
                  { color: colors.text, fontFamily, fontSize: scaleFont(16) },
                ]}
              >
                {section.label}
              </Text>

              {section.data.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => handleAction(item)}
                  style={[
                    styles.rowCard,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: !item.read
                        ? isDark
                          ? 'rgba(234, 88, 12, 0.12)'
                          : '#FFF8F3'
                        : colors.background,
                    },
                  ]}
                >
                  <View style={styles.avatarCol}>
                    <NotificationAvatar
                      item={item}
                      viewerGender={matrimonyApi.getCachedRegistration()?.profile?.gender || null}
                    />
                    {!item.read && <View style={styles.unreadDot} />}
                  </View>

                  <View style={styles.bodyCol}>
                    {renderMessageCopy(item, colors.text, colors.textSecondary, fontFamily)}

                    {item.type === 'PHOTO_REQUEST_RECEIVED' && item.senderUid ? (
                      <View style={styles.ctaRowWrap}>
                        {(item.incomingPhotoRequestStatus || 'pending') === 'pending' ? (
                          <>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => handleRespondPhotoRequest(item, 'approve')}
                              style={styles.allowBtn}
                            >
                              <Text style={[styles.allowBtnText, { fontFamily }]}>Allow</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => handleRespondPhotoRequest(item, 'decline')}
                              style={[styles.denyBtn, { borderColor: colors.border }]}
                            >
                              <Text
                                style={[
                                  styles.denyBtnText,
                                  { color: colors.textSecondary, fontFamily },
                                ]}
                              >
                                Deny
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : item.incomingPhotoRequestStatus === 'approved' ? (
                          <>
                            <View
                              style={[
                                styles.statusTagPill,
                                {
                                  backgroundColor: isDark
                                    ? 'rgba(22,163,74,0.2)'
                                    : '#DCFCE7',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusTagText,
                                  { color: '#16A34A', fontFamily },
                                ]}
                              >
                                Allowed
                              </Text>
                            </View>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => handleRespondPhotoRequest(item, 'decline')}
                              style={[
                                styles.protectBtn,
                                {
                                  backgroundColor: isDark
                                    ? 'rgba(224,75,90,0.12)'
                                    : '#FFF1F2',
                                },
                              ]}
                            >
                              <Text style={[styles.protectBtnText, { fontFamily }]}>
                                Protect
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <View
                              style={[
                                styles.statusTagPill,
                                {
                                  backgroundColor: isDark
                                    ? 'rgba(148,163,184,0.16)'
                                    : '#F1F5F9',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusTagText,
                                  { color: colors.textSecondary, fontFamily },
                                ]}
                              >
                                Protected
                              </Text>
                            </View>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => handleRespondPhotoRequest(item, 'approve')}
                              style={styles.allowBtn}
                            >
                              <Text style={[styles.allowBtnText, { fontFamily }]}>Allow</Text>
                            </TouchableOpacity>
                          </>
                        )}

                        {item.candidate ? (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => handleAction(item)}
                            style={[
                              styles.ctaOutlineBtn,
                              {
                                borderColor: isDark ? '#FB923C' : AMBER_OUTLINE,
                                backgroundColor: colors.surface,
                                marginTop: 0,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.ctaOutlineText,
                                { color: isDark ? '#FB923C' : ORANGE, fontFamily },
                              ]}
                            >
                              View profile
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => handleAction(item)}
                        style={[
                          styles.ctaOutlineBtn,
                          {
                            borderColor: isDark ? '#FB923C' : AMBER_OUTLINE,
                            backgroundColor: colors.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.ctaOutlineText,
                            { color: isDark ? '#FB923C' : ORANGE, fontFamily },
                          ]}
                        >
                          {item.actionLabel}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.rightCol}>
                    <Text style={[styles.timeText, { color: colors.textSecondary, fontFamily }]}>
                      {formatCompactAge(item.createdAtMs)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setMenuItem(item)}
                      style={styles.dotsBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MoreHorizontal size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Quick Action Modal on '...' tap */}
      <Modal
        visible={Boolean(menuItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuItem(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMenuItem(null)}
        >
          <View
            style={[
              styles.menuSheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(18, insets.bottom + 8),
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            {menuItem && !menuItem.read && (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  const target = menuItem;
                  setMenuItem(null);
                  handleMarkRead(target);
                }}
              >
                <Check size={20} color="#059669" />
                <Text style={[styles.sheetRowText, { color: colors.text, fontFamily }]}>
                  Mark as read
                </Text>
              </TouchableOpacity>
            )}
            {menuItem && (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => handleDelete(menuItem)}
              >
                <Trash2 size={20} color="#DC2626" />
                <Text style={[styles.sheetRowText, { color: '#DC2626', fontFamily }]}>
                  Remove notification
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerSideLeft: {
    width: 74,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '800',
  },
  headerRightRow: {
    width: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionBlock: {
    paddingTop: 14,
  },
  sectionHeader: {
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  avatarCol: {
    position: 'relative',
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E2E8F0',
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: ORANGE,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  bodyCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  msgText: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  msgSenderBold: {
    fontWeight: '800',
  },
  msgSubtext: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  ctaOutlineBtn: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  ctaOutlineText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ctaRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  allowBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  allowBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  denyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  denyBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  protectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6.5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E04B5A',
  },
  protectBtnText: {
    color: '#E04B5A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  statusTagPill: {
    paddingHorizontal: 11,
    paddingVertical: 6.5,
    borderRadius: 20,
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 2,
  },
  timeText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  dotsBtn: {
    padding: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 18,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  sheetRowText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
