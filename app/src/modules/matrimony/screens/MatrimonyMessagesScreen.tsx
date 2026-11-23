import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
  Lock,
  MessageCircle,
  Search,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { e2eeService, E2EEStateSnapshot } from '../../../services/e2eeService';
import ChatEncryptionModal, { ChatEncryptionModalMode } from '../../../components/ChatEncryptionModal';
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

  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
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
  const [e2eeState, setE2eeState] = useState<E2EEStateSnapshot>(() => e2eeService.getState());
  const [e2eeModalMode, setE2eeModalMode] = useState<ChatEncryptionModalMode | null>(null);
  const autoPromptedE2eeRef = useRef(false);

  useEffect(() => {
    const syncPrompt = (snap: E2EEStateSnapshot) => {
      setE2eeState(snap);
      if (!myUid || autoPromptedE2eeRef.current) return;
      if (snap.status === 'needs_pin_unlock') {
        autoPromptedE2eeRef.current = true;
        setE2eeModalMode('unlock_backup');
      } else if (snap.status === 'ready' && snap.needsBackupPrompt) {
        autoPromptedE2eeRef.current = true;
        setE2eeModalMode('setup_backup');
      }
    };
    syncPrompt(e2eeService.getState());
    const unsub = e2eeService.subscribeState(syncPrompt);
    return () => unsub();
  }, [myUid]);

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
        peerPhoto: c.signedProfilePhoto || ib?.peerPhoto || null,
        peerCode: c.profileCode || ib?.peerCode || '',
        peerAge: c.age ?? ib?.peerAge ?? null,
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
      if (filterMode === 'unread' && r.unreadCount === 0) return false;
      if (q) {
        const hay = [r.peerName, r.peerCity, r.peerCode, r.lastMessageText]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedRows, filterMode, searchQuery]);

  const openChat = (row: ConversationRow) => {
    navigation.navigate('MatrimonyChat', {
      roomId: row.roomId,
      peer: {
        uid: row.peerUid,
        displayName: row.peerName,
        profileCode: row.peerCode,
        signedProfilePhoto: row.peerPhoto,
        age: row.peerAge,
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
        <View
          style={[
            styles.titleRow,
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
          ]}
        >
          <Text style={[styles.screenTitle, { color: colors.text, fontFamily }]}>Messages</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              setE2eeModalMode(
                e2eeState.status === 'needs_pin_unlock' ? 'unlock_backup' : 'manage'
              )
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 12,
              backgroundColor: 'rgba(0,168,132,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(0,168,132,0.35)',
            }}
          >
            <Lock size={13} color={WHATSAPP_GREEN} />
            <Text
              style={{
                fontSize: 11.5,
                fontWeight: '700',
                color: WHATSAPP_GREEN,
                fontFamily,
              }}
            >
              {e2eeState.status === 'needs_pin_unlock' ? 'Unlock PIN' : 'Encrypted'}
            </Text>
          </TouchableOpacity>
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
              styles.chipBtn,
              {
                backgroundColor:
                  filterMode === 'all' ? 'rgba(0,168,132,0.12)' : 'transparent',
                borderColor: filterMode === 'all' ? WHATSAPP_GREEN : colors.border,
              },
            ]}
            onPress={() => setFilterMode('all')}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: filterMode === 'all' ? WHATSAPP_GREEN : colors.textSecondary,
                  fontFamily,
                },
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.chipBtn,
              {
                backgroundColor:
                  filterMode === 'unread' ? 'rgba(0,168,132,0.12)' : 'transparent',
                borderColor: filterMode === 'unread' ? WHATSAPP_GREEN : colors.border,
              },
            ]}
            onPress={() => setFilterMode('unread')}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: filterMode === 'unread' ? WHATSAPP_GREEN : colors.textSecondary,
                  fontFamily,
                },
              ]}
            >
              Unread{totalUnreadCount > 0 ? ` (${totalUnreadCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chats List */}
      <View style={{ flex: 1, backgroundColor: softBg }}>
        {e2eeState.status === 'needs_pin_unlock' ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setE2eeModalMode('unlock_backup')}
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              marginBottom: 4,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: isDark ? '#182229' : '#FFF3CD',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(251,191,36,0.35)' : '#FDE68A',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Lock size={14} color={isDark ? '#FBBF24' : '#856404'} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                fontWeight: '700',
                color: isDark ? '#FDE68A' : '#856404',
                fontFamily,
              }}
            >
              Encrypted messages locked — Tap to enter your Backup PIN
            </Text>
          </TouchableOpacity>
        ) : null}
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
                <View
                  style={[
                    styles.emptyIconCircle,
                    { backgroundColor: isDark ? '#1E293B' : '#E6F7F3' },
                  ]}
                >
                  <MessageCircle size={34} color={WHATSAPP_GREEN} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text, fontFamily }]}>
                  {filterMode === 'unread'
                    ? 'No Unread Messages'
                    : 'No Conversations Unlocked Yet'}
                </Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary, fontFamily }]}>
                  {filterMode === 'unread'
                    ? 'You have read all incoming messages.'
                    : 'Real-time WhatsApp-style chat opens automatically when an interest is accepted (Mutual Match).'}
                </Text>
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

      <ChatEncryptionModal
        visible={Boolean(e2eeModalMode)}
        uid={myUid}
        mode={e2eeModalMode || 'manage'}
        isDark={isDark}
        accentColor={WHATSAPP_GREEN}
        onClose={() => setE2eeModalMode(null)}
      />
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
  chipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
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
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
});
