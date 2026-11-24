import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  CheckCheck,
  Crown,
  Heart,
  Home,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { matrimonyChatService } from '../services/matrimonyChatService';
import {
  MatrimonyChatContact,
  MatrimonyInboxItem,
  MatrimonyPresenceState,
} from '../types/matrimony';

const ORANGE = '#EA580C';
const WHATSAPP_GREEN = '#00A884';
const CORAL_RED = '#E04B5A';
const TICK_BLUE = '#38BDF8';
const MESSAGES_EMPTY_IMG = require('../../../../assets/matrimony_messages_empty.png');

type MessageFilterKey = 'unread' | 'pending' | 'replied';

const MESSAGE_FILTER_OPTIONS: { key: MessageFilterKey; title: string; subtitle: string }[] = [
  {
    key: 'unread',
    title: 'Unread',
    subtitle: "Messages you haven't read yet",
  },
  {
    key: 'pending',
    title: 'Pending',
    subtitle: "Matches whose messages you haven't responded to",
  },
  {
    key: 'replied',
    title: 'Replied',
    subtitle: 'Matches whose messages you replied to / who replied to your message',
  },
];

function formatInboxTimestamp(ms: number): string {
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    const hours24 = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${minutes} ${period}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

interface ConversationRow {
  roomId: string;
  peerUid: string;
  peerName: string;
  peerPhoto: string | null;
  peerCode: string;
  peerAge: number | null;
  peerHeightCm?: number | null;
  peerOccupation?: string | null;
  peerGender?: string | null;
  peerCity: string | null;
  contactPhone: string | null;
  lastMessageText: string;
  lastMessageSenderUid?: string;
  lastMessageDeliveredToPeer?: boolean;
  lastMessageReadByPeer?: boolean;
  lastMessageAt: number;
  unreadCount: number;
}

export default function MatrimonyMessagesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const myUid = user?.uid || '';

  const [activeFilters, setActiveFilters] = useState<MessageFilterKey[]>([]);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<MessageFilterKey[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const initialChatContacts = matrimonyApi.getCachedChatContacts();
  const [contacts, setContacts] = useState<MatrimonyChatContact[]>(
    () => initialChatContacts?.contacts || []
  );
  const [selfInfo, setSelfInfo] = useState<{
    uid: string;
    displayName: string;
    signedProfilePhoto: string | null;
  }>(
    () =>
      initialChatContacts?.self || {
        uid: myUid,
        displayName: 'Me',
        signedProfilePhoto: null,
      }
  );
  const [inboxItems, setInboxItems] = useState<MatrimonyInboxItem[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, MatrimonyPresenceState>>({});
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(() => !initialChatContacts);
  const [refreshing, setRefreshing] = useState(false);

  const hasContactsRef = useRef((initialChatContacts?.contacts?.length || 0) > 0);

  const loadContacts = useCallback(async (silent = false, force = false) => {
    const cached = matrimonyApi.getCachedChatContacts();
    if (cached && !force) {
      setContacts(cached.contacts || []);
      if (cached.self) setSelfInfo(cached.self);
      hasContactsRef.current = (cached.contacts?.length || 0) > 0;
      setLoading(false);
    } else if (!silent && !hasContactsRef.current) {
      setLoading(true);
    }
    try {
      const res = await matrimonyApi.getChatContacts({ force });
      setContacts(res.contacts || []);
      hasContactsRef.current = (res.contacts?.length || 0) > 0;
      if (res.self) {
        setSelfInfo(res.self);
      }
    } catch (err: any) {
      if (isMatrimonyInactiveError(err)) {
        navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
        return;
      }
      console.warn('getChatContacts warning:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!myUid) return;
    loadContacts(false, false);
    const stopPresence = matrimonyChatService.startPresenceTracking(myUid, null);
    const unsubInbox = matrimonyChatService.subscribeInbox(myUid, (items) => {
      setInboxItems(items);
      if (items.length > 0) setLoading(false);
    });
    return () => {
      unsubInbox();
      stopPresence();
    };
  }, [myUid, loadContacts]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (myUid) {
        matrimonyChatService.setActiveChatRoom(myUid, null);
        loadContacts(true, false);
      }
    });
    return unsub;
  }, [navigation, myUid, loadContacts]);

  const mergedRows = useMemo<ConversationRow[]>(() => {
    const inboxByPeer = new Map<string, MatrimonyInboxItem>();
    inboxItems.forEach((it) => {
      if (it.peerUid) inboxByPeer.set(it.peerUid, it);
    });

    const seenPeers = new Set<string>();
    const rows: ConversationRow[] = [];

    // Prefer fresh signed photo & phone from contacts, combined with live RTDB inbox counts/messages
    contacts.forEach((c) => {
      seenPeers.add(c.uid);
      const ib = inboxByPeer.get(c.uid);
      rows.push({
        roomId: c.roomId,
        peerUid: c.uid,
        peerName: c.displayName,
        peerPhoto: c.signedProfilePhoto ?? null,
        peerCode: c.profileCode || ib?.peerCode || '',
        peerAge: c.age ?? ib?.peerAge ?? null,
        peerHeightCm: c.heightCm ?? ib?.peerHeightCm ?? null,
        peerOccupation: c.occupation || ib?.peerOccupation || null,
        peerGender: c.gender || ib?.peerGender || null,
        peerCity: c.city || ib?.peerCity || null,
        contactPhone: c.contactPhone || ib?.contactPhone || null,
        lastMessageText: ib?.lastMessageText || '',
        lastMessageSenderUid: ib?.lastMessageSenderUid,
        lastMessageDeliveredToPeer: ib?.lastMessageDeliveredToPeer,
        lastMessageReadByPeer: ib?.lastMessageReadByPeer,
        lastMessageAt: ib?.lastMessageAt || 0,
        unreadCount: ib?.unreadCount || 0,
      });
    });

    inboxItems.forEach((ib) => {
      if (!seenPeers.has(ib.peerUid)) {
        rows.push({
          roomId: ib.roomId,
          peerUid: ib.peerUid,
          peerName: ib.peerName,
          peerPhoto: ib.peerPhoto,
          peerCode: ib.peerCode,
          peerAge: ib.peerAge,
          peerHeightCm: ib.peerHeightCm ?? null,
          peerOccupation: ib.peerOccupation || null,
          peerGender: ib.peerGender || null,
          peerCity: ib.peerCity,
          contactPhone: ib.contactPhone,
          lastMessageText: ib.lastMessageText,
          lastMessageSenderUid: ib.lastMessageSenderUid,
          lastMessageDeliveredToPeer: ib.lastMessageDeliveredToPeer,
          lastMessageReadByPeer: ib.lastMessageReadByPeer,
          lastMessageAt: ib.lastMessageAt,
          unreadCount: ib.unreadCount,
        });
      }
    });

    rows.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    return rows;
  }, [contacts, inboxItems]);

  // Subscribe live presence & typing for visible conversations
  const rowKeysSignature = useMemo(
    () => mergedRows.map((r) => `${r.roomId}:${r.peerUid}`).join(','),
    [mergedRows]
  );

  useEffect(() => {
    if (!rowKeysSignature) return;
    const unsubs: (() => void)[] = [];
    mergedRows.forEach((r) => {
      unsubs.push(
        matrimonyChatService.subscribePresence(r.peerUid, (p) => {
          setPresenceMap((prev) => ({ ...prev, [r.peerUid]: p }));
        })
      );
      unsubs.push(
        matrimonyChatService.subscribeTyping(r.roomId, r.peerUid, (isTyping) => {
          setTypingMap((prev) => ({ ...prev, [r.roomId]: isTyping }));
        })
      );
    });
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [rowKeysSignature]);

  const totalUnreadCount = useMemo(
    () => mergedRows.reduce((acc, r) => acc + (r.unreadCount || 0), 0),
    [mergedRows]
  );

  const displayedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedRows.filter((r) => {
      if (activeFilters.length > 0) {
        const hasActivity = Boolean(r.lastMessageAt || r.lastMessageText);
        const matchesAny = activeFilters.some((key) => {
          if (key === 'unread') return r.unreadCount > 0;
          if (key === 'pending') {
            return hasActivity && Boolean(r.lastMessageSenderUid) && r.lastMessageSenderUid !== myUid;
          }
          if (key === 'replied') {
            return hasActivity && r.lastMessageSenderUid === myUid;
          }
          return false;
        });
        if (!matchesAny) return false;
      }
      if (q) {
        const hay = [r.peerName, r.peerCity, r.peerCode, r.lastMessageText]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedRows, activeFilters, myUid, searchQuery]);

  const toggleDraftFilter = (key: MessageFilterKey) => {
    setDraftFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const hasFilterChanges = useMemo(() => {
    if (draftFilters.length !== activeFilters.length) return true;
    return draftFilters.some((k) => !activeFilters.includes(k));
  }, [draftFilters, activeFilters]);

  const openChat = (row: ConversationRow) => {
    navigation.navigate('MatrimonyChat', {
      roomId: row.roomId,
      peer: {
        uid: row.peerUid,
        displayName: row.peerName,
        profileCode: row.peerCode,
        signedProfilePhoto: row.peerPhoto,
        age: row.peerAge,
        heightCm: row.peerHeightCm ?? null,
        occupation: row.peerOccupation || null,
        gender: row.peerGender || null,
        isVerified: true,
        city: row.peerCity || '',
        contactPhone: row.contactPhone,
      },
      self: selfInfo,
    });
  };

  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const softBg = isDark ? colors.bg : '#F6F7F9';
  const dividerColor = isDark ? colors.border : '#F1F5F9';

  const renderConversationRow = ({ item }: { item: ConversationRow }) => {
    const isOnline = presenceMap[item.peerUid]?.online === true;
    const isPeerTyping = typingMap[item.roomId] === true;
    const isMyLastMessage = item.lastMessageSenderUid === myUid;
    const hasUnread = item.unreadCount > 0;

    return (
      <TouchableOpacity
        style={[
          styles.chatRow,
          {
            backgroundColor: cardSurface,
            borderBottomColor: dividerColor,
          },
        ]}
        activeOpacity={0.78}
        onPress={() => openChat(item)}
      >
        <View style={styles.avatarWrap}>
          {item.peerPhoto ? (
            <Image source={{ uri: item.peerPhoto }} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
              ]}
            >
              <User size={24} color="#94A3B8" />
            </View>
          )}
          {isOnline && (
            <View
              style={[
                styles.onlineDot,
                { borderColor: cardSurface },
              ]}
            />
          )}
        </View>

        <View style={styles.chatContentCol}>
          <View style={styles.chatTopLine}>
            <Text
              style={[
                styles.peerName,
                { color: colors.text, fontFamily, fontSize: scaleFont(16) },
              ]}
              numberOfLines={1}
            >
              {item.peerName}
            </Text>
            <Text
              style={[
                styles.timeLabel,
                {
                  color: hasUnread ? WHATSAPP_GREEN : colors.textSecondary,
                  fontWeight: hasUnread ? '700' : '500',
                  fontFamily,
                },
              ]}
            >
              {formatInboxTimestamp(item.lastMessageAt)}
            </Text>
          </View>

          <View style={styles.chatBottomLine}>
            {isPeerTyping ? (
              <Text style={[styles.typingText, { fontFamily }]} numberOfLines={1}>
                typing...
              </Text>
            ) : item.lastMessageText ? (
              <View style={styles.previewRow}>
                {isMyLastMessage && (
                  item.lastMessageReadByPeer ? (
                    <CheckCheck size={15} color={TICK_BLUE} strokeWidth={2.2} />
                  ) : item.lastMessageDeliveredToPeer ? (
                    <CheckCheck size={15} color={colors.textSecondary} strokeWidth={2} />
                  ) : (
                    <Check size={15} color={colors.textSecondary} strokeWidth={2} />
                  )
                )}
                <Text
                  style={[
                    styles.previewText,
                    {
                      color: hasUnread ? colors.text : colors.textSecondary,
                      fontWeight: hasUnread ? '700' : '500',
                      fontFamily,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {item.lastMessageText}
                </Text>
              </View>
            ) : (
              <View style={styles.previewRow}>
                <Sparkles size={13} color={WHATSAPP_GREEN} />
                <Text style={[styles.starterHint, { color: WHATSAPP_GREEN, fontFamily }]} numberOfLines={1}>
                  Mutual Match • Tap to say hello
                </Text>
              </View>
            )}

            {hasUnread && (
              <View style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: cardSurface }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={cardSurface} />

      {/* Top Header */}
      <View
        style={[
          styles.topHeader,
          { backgroundColor: cardSurface, borderBottomColor: dividerColor },
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.screenTitle, { color: colors.text, fontFamily }]}>Messages</Text>
        </View>

        <View style={[styles.searchBox, { backgroundColor: softBg }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search matches or messages..."
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text, fontFamily }]}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={17} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filterPills}>
          <TouchableOpacity
            style={[
              styles.filterTriggerBtn,
              {
                backgroundColor:
                  activeFilters.length > 0
                    ? isDark
                      ? 'rgba(224,75,90,0.16)'
                      : '#FFF1F2'
                    : isDark
                    ? colors.surface
                    : '#FFFFFF',
                borderColor: activeFilters.length > 0 ? CORAL_RED : colors.border,
              },
            ]}
            activeOpacity={0.8}
            onPress={() => {
              setDraftFilters(activeFilters);
              setFilterModalOpen(true);
            }}
          >
            <SlidersHorizontal
              size={15}
              color={activeFilters.length > 0 ? CORAL_RED : colors.text}
            />
            <Text
              style={[
                styles.chipText,
                {
                  color: activeFilters.length > 0 ? CORAL_RED : colors.text,
                  fontFamily,
                },
              ]}
            >
              {activeFilters.length > 0 ? `Filters (${activeFilters.length})` : 'Filters'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chats List */}
      <View style={{ flex: 1, backgroundColor: softBg }}>
        {loading && displayedRows.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={WHATSAPP_GREEN} />
            <Text style={[styles.loadingText, { color: colors.textSecondary, fontFamily }]}>
              Loading conversations...
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayedRows}
            keyExtractor={(item) => item.roomId}
            renderItem={renderConversationRow}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={
              displayedRows.length === 0 ? styles.emptyContainer : { paddingBottom: 24 }
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  loadContacts(true, true);
                }}
                colors={[WHATSAPP_GREEN]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Image
                  source={MESSAGES_EMPTY_IMG}
                  style={styles.emptyIllustrationImg}
                  resizeMode="contain"
                />
                <Text style={[styles.emptyTitle, { color: colors.text, fontFamily }]}>
                  {activeFilters.length > 0
                    ? 'No Matching Conversations'
                    : 'No Conversations Unlocked Yet'}
                </Text>
                {activeFilters.length > 0 ? (
                  <View style={styles.emptyActionsRow}>
                    <TouchableOpacity
                      style={styles.primaryCtaBtn}
                      onPress={() => setActiveFilters([])}
                    >
                      <Text style={[styles.primaryCtaText, { fontFamily }]}>Clear Filters</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.emptyActionsRow}>
                    <TouchableOpacity
                      style={styles.primaryCtaBtn}
                      onPress={() => navigation.navigate('MatrimonyMatches')}
                    >
                      <Text style={[styles.primaryCtaText, { fontFamily }]}>Explore Matches</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.secondaryCtaBtn, { borderColor: colors.border }]}
                      onPress={() => navigation.navigate('MatrimonyInterestsHub')}
                    >
                      <Text style={[styles.secondaryCtaText, { color: colors.text, fontFamily }]}>
                        View Interests
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Bottom Tab Bar */}
      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: cardSurface,
            borderTopColor: dividerColor,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        {[
          {
            key: 'Home',
            label: 'Home',
            Icon: Home,
            active: false,
            badge: 0,
            onPress: () => navigation.navigate('MatrimonyHome'),
          },
          {
            key: 'Matches',
            label: 'Matches',
            Icon: Users,
            active: false,
            badge: 0,
            onPress: () => navigation.navigate('MatrimonyMatches'),
          },
          {
            key: 'Interests',
            label: 'Interests',
            Icon: Heart,
            active: false,
            badge: 0,
            onPress: () => navigation.navigate('MatrimonyInterestsHub'),
          },
          {
            key: 'Messages',
            label: 'Messages',
            Icon: MessageCircle,
            active: true,
            badge: totalUnreadCount,
            onPress: () => {},
          },
          {
            key: 'Upgrade',
            label: 'Upgrade',
            Icon: Crown,
            active: false,
            badge: 0,
            onPress: () => navigation.navigate('MatrimonyUpgrade'),
          },
        ].map(({ key, label, Icon, active, badge, onPress }) => (
          <TouchableOpacity key={key} style={styles.navItem} onPress={onPress} activeOpacity={0.8}>
            <View style={{ position: 'relative' }}>
              <Icon size={20} color={active ? ORANGE : colors.textSecondary} />
              {badge > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.navLabel,
                {
                  color: active ? ORANGE : colors.textSecondary,
                  fontWeight: active ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter Bottom Sheet Modal */}
      <Modal
        visible={filterModalOpen}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={styles.filterModalBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setFilterModalOpen(false)}
          />
          <View
            style={[
              styles.filterSheet,
              {
                backgroundColor: cardSurface,
                borderTopColor: dividerColor,
                paddingBottom: Math.max(insets.bottom + 18, 28),
              },
            ]}
          >
            <View style={styles.filterSheetHeader}>
              <Text
                style={[
                  styles.filterSheetTitle,
                  { color: colors.text, fontFamily, fontSize: scaleFont(19) },
                ]}
              >
                Filter
              </Text>
              <TouchableOpacity
                onPress={() => setFilterModalOpen(false)}
                style={styles.filterCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.filterSheetDivider, { backgroundColor: dividerColor }]} />

            <View style={styles.filterOptionsList}>
              {MESSAGE_FILTER_OPTIONS.map((opt) => {
                const checked = draftFilters.includes(opt.key);
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.filterOptionRow}
                    activeOpacity={0.75}
                    onPress={() => toggleDraftFilter(opt.key)}
                  >
                    <View style={styles.filterOptionTextCol}>
                      <Text
                        style={[
                          styles.filterOptionTitle,
                          { color: colors.text, fontFamily, fontSize: scaleFont(16) },
                        ]}
                      >
                        {opt.title}
                      </Text>
                      <Text
                        style={[
                          styles.filterOptionSub,
                          { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13) },
                        ]}
                      >
                        {opt.subtitle}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.filterCheckbox,
                        {
                          borderColor: checked
                            ? CORAL_RED
                            : isDark
                            ? '#64748B'
                            : '#9CA3AF',
                          backgroundColor: checked ? CORAL_RED : 'transparent',
                        },
                      ]}
                    >
                      {checked ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.filterSheetDivider, { backgroundColor: dividerColor }]} />

            <View style={styles.filterActionsRow}>
              <TouchableOpacity
                style={[
                  styles.filterActionBtn,
                  draftFilters.length > 0 || activeFilters.length > 0
                    ? {
                        backgroundColor: 'transparent',
                        borderWidth: 1.2,
                        borderColor: colors.border,
                      }
                    : {
                        backgroundColor: isDark ? '#334155' : '#E5E7EB',
                      },
                ]}
                activeOpacity={0.8}
                disabled={draftFilters.length === 0 && activeFilters.length === 0}
                onPress={() => {
                  setDraftFilters([]);
                  setActiveFilters([]);
                  setFilterModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.filterActionBtnText,
                    {
                      color:
                        draftFilters.length > 0 || activeFilters.length > 0
                          ? colors.text
                          : isDark
                          ? '#64748B'
                          : '#9CA3AF',
                      fontFamily,
                    },
                  ]}
                >
                  Clear
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterActionBtn,
                  {
                    backgroundColor:
                      draftFilters.length > 0 || hasFilterChanges
                        ? CORAL_RED
                        : isDark
                        ? '#334155'
                        : '#E5E7EB',
                  },
                ]}
                activeOpacity={0.85}
                disabled={draftFilters.length === 0 && !hasFilterChanges}
                onPress={() => {
                  setActiveFilters(draftFilters);
                  setFilterModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.filterActionBtnText,
                    {
                      color:
                        draftFilters.length > 0 || hasFilterChanges
                          ? '#FFFFFF'
                          : isDark
                          ? '#64748B'
                          : '#9CA3AF',
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeader: {
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  titleRow: {
    paddingHorizontal: 16,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  filterPills: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 13,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    position: 'relative',
  },
  avatarImg: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2,
  },
  chatContentCol: {
    flex: 1,
    gap: 4,
  },
  chatTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  peerName: {
    flex: 1,
    fontWeight: '800',
  },
  timeLabel: {
    fontSize: 12,
  },
  chatBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  previewText: {
    flex: 1,
    fontSize: 13.5,
  },
  typingText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: WHATSAPP_GREEN,
  },
  starterHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  unreadPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: WHATSAPP_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadPillText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  emptyIllustrationImg: {
    width: 140,
    height: 170,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  primaryCtaBtn: {
    backgroundColor: CORAL_RED,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  secondaryCtaBtn: {
    borderWidth: 1.2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
  },
  secondaryCtaText: {
    fontSize: 13.5,
    fontWeight: '700',
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
  navLabel: {
    fontSize: 11,
  },
  navBadge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: WHATSAPP_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  filterModalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 14,
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  filterSheetTitle: {
    fontWeight: '800',
  },
  filterCloseBtn: {
    padding: 4,
  },
  filterSheetDivider: {
    height: StyleSheet.hairlineWidth,
  },
  filterOptionsList: {
    paddingVertical: 10,
    gap: 18,
    marginVertical: 8,
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  filterOptionTextCol: {
    flex: 1,
    gap: 3,
  },
  filterOptionTitle: {
    fontWeight: '800',
  },
  filterOptionSub: {
    fontWeight: '400',
    lineHeight: 18,
  },
  filterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActionsRow: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 18,
  },
  filterActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
