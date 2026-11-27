import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  Archive,
  ArrowLeft,
  BellOff,
  Lock,
  MessageCircle,
  MoreVertical,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { e2eeService, E2EEStateSnapshot } from '../../../services/e2eeService';
import ChatEncryptionModal, { ChatEncryptionModalMode } from '../../../components/ChatEncryptionModal';
import { useChatTheme } from '../constants/useChatTheme';
import { isRhemaAdminRole, rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { rhemaChatService } from '../services/rhemaChatService';
import {
  ChatBlockRecord,
  ChatInboxItem,
  ChatPresenceState,
  ChatTypingUser,
  ChurchMemberContact,
} from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';
import ChatListRow from '../components/ChatListRow';
import FloatingBottomDock from '../components/FloatingBottomDock';
import {
  makeScopedCacheKey,
  getInstantMemory,
  readInstantCache,
  writeInstantCache,
} from '../../../utils/instantCache';

type FilterChip = 'all' | 'favorites' | 'teams' | 'groups';

export default function RhemaChatsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { palette, fontFamily, scaleFont } = useChatTheme();

  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;
  const myUid = user?.uid || '';
  const chatInboxCacheKey = useMemo(
    () => makeScopedCacheKey('church_chat_inbox_v1', churchId, myUid),
    [churchId, myUid]
  );
  const initialInboxCache = useMemo(
    () => getInstantMemory<ChatInboxItem[]>(chatInboxCacheKey),
    [chatInboxCacheKey]
  );
  const myName =
    member?.name ||
    `${member?.firstName || ''} ${member?.lastName || ''}`.trim() ||
    user?.displayName ||
    'Rhema Member';
  const myPhoto = (member as any)?.profilePhoto || (member as any)?.photoUrl || null;
  const isChurchAdmin = isRhemaAdminRole(member);

  const [inbox, setInbox] = useState<ChatInboxItem[]>(initialInboxCache || []);
  const [members, setMembers] = useState<ChurchMemberContact[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, ChatPresenceState>>({});
  const [typingMap, setTypingMap] = useState<Record<string, ChatTypingUser[]>>({});
  const [blockedMap, setBlockedMap] = useState<Record<string, ChatBlockRecord>>({});
  const [loading, setLoading] = useState(!initialInboxCache);

  const [filterChip, setFilterChip] = useState<FilterChip>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusChooserOpen, setPlusChooserOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ChatInboxItem | null>(null);
  const [e2eeState, setE2eeState] = useState<E2EEStateSnapshot>(() => e2eeService.getState());
  const [e2eeModalMode, setE2eeModalMode] = useState<ChatEncryptionModalMode | null>(null);
  const autoPromptedE2eeRef = React.useRef(false);

  useEffect(() => {
    const syncE2eePrompt = (snap: E2EEStateSnapshot) => {
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
    syncE2eePrompt(e2eeService.getState());
    const unsub = e2eeService.subscribeState(syncE2eePrompt);
    return () => unsub();
  }, [myUid]);

  const loadDirectory = useCallback(async () => {
    try {
      const list = await rhemaDirectoryService.getChurchMembers(churchId, myUid);
      setMembers(list);
    } catch {
      // non-fatal
    }
  }, [churchId, myUid]);

  useEffect(() => {
    if (!myUid) return;
    let active = true;
    const mem = getInstantMemory<ChatInboxItem[]>(chatInboxCacheKey);
    if (mem) {
      setInbox(mem);
      setLoading(false);
    } else {
      readInstantCache<ChatInboxItem[]>(chatInboxCacheKey).then((cached) => {
        if (!active || !cached?.data) return;
        setInbox(cached.data);
        setLoading(false);
      });
    }

    loadDirectory();

    const stopPresence = rhemaChatService.startPresenceTracking(churchId, myUid, null);
    const unsubInbox = rhemaChatService.subscribeInbox(churchId, myUid, (items) => {
      if (!active) return;
      setInbox(items);
      setLoading(false);
      writeInstantCache(chatInboxCacheKey, items).catch(() => {});
    });
    const unsubBlocks = rhemaDirectoryService.subscribeBlockedUsers(
      churchId,
      myUid,
      setBlockedMap
    );

    const safety = setTimeout(() => setLoading(false), 1800);

    return () => {
      active = false;
      clearTimeout(safety);
      unsubInbox();
      unsubBlocks();
      stopPresence();
    };
  }, [churchId, myUid, loadDirectory, chatInboxCacheKey]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (myUid) {
        rhemaChatService.setActiveRoom(churchId, myUid, null);
      }
    });
    return unsub;
  }, [navigation, churchId, myUid]);

  // Subscribe online status for direct peers & top active members
  const peerUidsSignature = useMemo(() => {
    const uids = new Set<string>();
    inbox.forEach((it) => {
      if (it.roomType === 'direct' && it.peerUid) uids.add(it.peerUid);
    });
    members.slice(0, 15).forEach((m) => uids.add(m.uid));
    return Array.from(uids).sort().join(',');
  }, [inbox, members]);

  useEffect(() => {
    if (!isFocused || !peerUidsSignature) return;
    const uids = peerUidsSignature.split(',').filter(Boolean);
    const unsubs = uids.map((uid) =>
      rhemaChatService.subscribePresence(churchId, uid, (st) => {
        setPresenceMap((prev) => ({ ...prev, [uid]: st }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [isFocused, churchId, peerUidsSignature]);

  const inboxRoomSignature = useMemo(
    () =>
      inbox
        .filter((i) => !i.isArchived)
        .slice(0, 25)
        .map((i) => i.roomId)
        .sort()
        .join(','),
    [inbox]
  );

  useEffect(() => {
    if (!isFocused || !myUid || !inboxRoomSignature) {
      setTypingMap({});
      return;
    }
    const roomIds = inboxRoomSignature.split(',').filter(Boolean);
    const unsubs = roomIds.map((rid) =>
      rhemaChatService.subscribeTyping(churchId, rid, myUid, (users) => {
        setTypingMap((prev) => {
          const prevList = prev[rid] || [];
          if (prevList.length === 0 && users.length === 0) return prev;
          return { ...prev, [rid]: users };
        });
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [isFocused, churchId, myUid, inboxRoomSignature]);

  const activeRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inbox.filter((item) => {
      if (item.isArchived) return false;
      if (item.roomType === 'direct' && item.peerUid && blockedMap[item.peerUid]) return false;

      if (filterChip === 'favorites' && !item.isFavorite) return false;
      if (filterChip === 'teams' && item.category !== 'team') return false;
      if (filterChip === 'groups' && item.roomType !== 'group') return false;

      if (q) {
        return (
          item.title.toLowerCase().includes(q) ||
          item.lastMessageText.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [inbox, blockedMap, filterChip, searchQuery]);

  const matchingMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => !blockedMap[m.uid])
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.phone || '').toLowerCase().includes(q) ||
          (m.memberCode || '').toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [members, blockedMap, searchQuery]);

  const openDirectChatWithMember = async (peer: ChurchMemberContact) => {
    if (!myUid) return;
    try {
      const roomId = await rhemaChatService.ensureDirectRoom(
        churchId,
        { uid: myUid, name: myName, photoUrl: myPhoto },
        peer
      );
      setSearchQuery('');
      setSearchOpen(false);
      navigation.navigate('RhemaChatRoom', {
        roomId,
        roomType: 'direct',
        title: peer.name,
        avatarUrl: peer.photoUrl,
        peerUid: peer.uid,
        peerPhone: peer.phone || '',
      });
    } catch (err: any) {
      Alert.alert('Chat Error', err?.message || 'Unable to open chat.');
    }
  };

  const openInboxItem = (item: ChatInboxItem) => {
    const peerMember = item.peerUid
      ? members.find((m) => m.uid === item.peerUid)
      : undefined;
    navigation.navigate('RhemaChatRoom', {
      roomId: item.roomId,
      roomType: item.roomType,
      title: item.title,
      avatarUrl: item.avatarUrl || null,
      peerUid: item.peerUid,
      peerPhone: peerMember?.phone || '',
    });
  };

  const handlePressPlus = () => {
    if (isChurchAdmin) {
      setPlusChooserOpen(true);
    } else {
      navigation.navigate('NewChatDirectory');
    }
  };

  const showAlwaysSearch = inbox.filter((i) => !i.isArchived).length === 0 || searchOpen;
  const topPad = Math.max(insets.top + 6, Platform.OS === 'ios' ? 50 : 32);

  const filterChips: { key: FilterChip; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'favorites', label: 'Favorites' },
    { key: 'teams', label: 'Teams' },
    { key: 'groups', label: 'Groups' },
  ];

  const archivedCount = inbox.filter((i) => i.isArchived).length;

  return (
    <LinearGradient colors={palette.bgGradient} style={styles.root}>
      <StatusBar
        barStyle={palette.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Top Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[
              styles.circleIconBtn,
              {
                backgroundColor: palette.glassBg,
                borderColor: palette.glassBorder,
                marginRight: 10,
              },
            ]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={19} color={palette.text} />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              { color: palette.text, fontFamily, fontSize: scaleFont(28) },
            ]}
          >
            Chats
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.circleIconBtn,
              {
                backgroundColor: searchOpen ? palette.accent : palette.glassBg,
                borderColor: palette.glassBorder,
              },
            ]}
            onPress={() => {
              setSearchOpen((prev) => !prev);
              if (searchOpen) setSearchQuery('');
            }}
            activeOpacity={0.8}
          >
            <Search size={18} color={searchOpen ? '#FFFFFF' : palette.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.circleIconBtn,
              { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
            ]}
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.8}
          >
            <MoreVertical size={18} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Top Member Search Bar (Always visible when empty, or toggled via Search button) */}
      {showAlwaysSearch ? (
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchPill,
              {
                backgroundColor: palette.inputBg,
                borderColor: palette.glassBorder,
              },
            ]}
          >
            <Search size={17} color={palette.textSecondary} />
            <TextInput
              style={[
                styles.searchInput,
                { color: palette.text, fontFamily, fontSize: scaleFont(14.5) },
              ]}
              placeholder="Search Rhema members by name..."
              placeholderTextColor={palette.inputPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={palette.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {e2eeState.status === 'needs_pin_unlock' ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setE2eeModalMode('unlock_backup')}
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: `${palette.accent}1E`,
            borderWidth: 1,
            borderColor: `${palette.accent}55`,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Lock size={15} color={palette.accent} />
          <Text
            style={{
              flex: 1,
              color: palette.text,
              fontFamily,
              fontSize: scaleFont(12.5),
              fontWeight: '700',
            }}
          >
            Encrypted chats locked on this device — Tap to enter Backup PIN
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Main Content */}
      <FlatList
        data={activeRows}
        keyExtractor={(item) => item.roomId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 98, 108),
        }}
        ListHeaderComponent={
          <>
            {/* Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {filterChips.map((chip) => {
                const active = filterChip === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active
                          ? palette.filterActiveBg
                          : palette.filterInactiveBg,
                        borderColor: active ? palette.filterActiveBg : palette.glassBorder,
                      },
                    ]}
                    onPress={() => setFilterChip(chip.key)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        {
                          color: active
                            ? palette.filterActiveText
                            : palette.filterInactiveText,
                          fontFamily,
                          fontSize: scaleFont(13.5),
                        },
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Live Directory Search Results */}
            {searchQuery.trim().length > 0 ? (
              <View style={styles.directorySection}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: palette.textSecondary, fontFamily },
                  ]}
                >
                  RHEMA MEMBERS ({matchingMembers.length})
                </Text>
                {matchingMembers.length === 0 ? (
                  <Text
                    style={[
                      styles.noMembersTxt,
                      { color: palette.textMuted, fontFamily },
                    ]}
                  >
                    No Rhema members match "{searchQuery.trim()}"
                  </Text>
                ) : (
                  matchingMembers.map((m) => (
                    <TouchableOpacity
                      key={m.uid}
                      style={styles.memberSearchRow}
                      onPress={() => openDirectChatWithMember(m)}
                      activeOpacity={0.78}
                    >
                      <AvatarWithStatus
                        uri={m.photoUrl}
                        name={m.name}
                        size={44}
                        online={presenceMap[m.uid]?.online}
                        dotColor={palette.onlineDot}
                        dotBorderColor={palette.bg}
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={[
                            styles.memberSearchName,
                            { color: palette.text, fontFamily },
                          ]}
                          numberOfLines={1}
                        >
                          {m.name}
                        </Text>
                        <Text
                          style={[
                            styles.memberSearchSub,
                            { color: palette.textSecondary, fontFamily },
                          ]}
                          numberOfLines={1}
                        >
                          {m.isAdmin ? `${m.userType} · ` : ''}
                          {m.city || m.memberCode || 'Rhema Global Ministries'}
                        </Text>
                      </View>
                      <MessageCircle size={18} color={palette.accent} />
                    </TouchableOpacity>
                  ))
                )}
                {activeRows.length > 0 ? (
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: palette.textSecondary, fontFamily, marginTop: 12 },
                    ]}
                  >
                    CONVERSATIONS ({activeRows.length})
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => {
          const roomTyping = typingMap[item.roomId] || [];
          const isRoomTyping = roomTyping.length > 0;
          const roomTypingLabel =
            isRoomTyping && item.roomType === 'group'
              ? `${roomTyping[0].name.split(/\s+/)[0]} is typing...`
              : 'typing...';

          return (
            <ChatListRow
              item={item}
              myUid={myUid}
              isOnline={
                item.roomType === 'direct' && item.peerUid
                  ? presenceMap[item.peerUid]?.online === true
                  : false
              }
              isTyping={isRoomTyping}
              typingLabel={roomTypingLabel}
              palette={palette}
              fontFamily={fontFamily}
              scaleFont={scaleFont}
              onPress={() => openInboxItem(item)}
              onLongPress={() => setSelectedRow(item)}
            />
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={palette.accent} />
            </View>
          ) : searchQuery.trim() ? null : (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: palette.glassBg,
                  borderColor: palette.glassBorder,
                },
              ]}
            >
              <View style={[styles.emptyIcon, { backgroundColor: `${palette.accent}22` }]}>
                <MessageCircle size={32} color={palette.accent} />
              </View>
              <Text
                style={[
                  styles.emptyTitle,
                  { color: palette.text, fontFamily, fontSize: scaleFont(18) },
                ]}
              >
                Start a Conversation
              </Text>
              <Text
                style={[
                  styles.emptySub,
                  { color: palette.textSecondary, fontFamily, fontSize: scaleFont(13.5) },
                ]}
              >
                Search for any Rhema Church member above to start a private chat
                {isChurchAdmin ? ', or create a ministry team group.' : '.'}
              </Text>

              <View style={styles.emptyBtns}>
                <TouchableOpacity
                  style={[styles.emptyPrimaryBtn, { backgroundColor: palette.accent }]}
                  onPress={() => navigation.navigate('NewChatDirectory')}
                  activeOpacity={0.85}
                >
                  <UserPlus size={16} color="#FFFFFF" />
                  <Text style={styles.emptyPrimaryTxt}>Find Member</Text>
                </TouchableOpacity>

                {isChurchAdmin ? (
                  <TouchableOpacity
                    style={[
                      styles.emptySecondaryBtn,
                      {
                        backgroundColor: palette.filterInactiveBg,
                        borderColor: palette.glassBorder,
                      },
                    ]}
                    onPress={() => navigation.navigate('CreateGroup')}
                    activeOpacity={0.85}
                  >
                    <UsersRound size={16} color={palette.text} />
                    <Text style={[styles.emptySecondaryTxt, { color: palette.text }]}>
                      Create Group
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )
        }
      />

      {/* Floating Bottom '+' Action Button */}
      <FloatingBottomDock
        onPressPlus={handlePressPlus}
        bottomInset={insets.bottom}
        palette={palette}
      />

      {/* Top Overflow Menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
          <View
            style={[
              styles.menuBox,
              {
                backgroundColor: palette.surface,
                borderColor: palette.glassBorder,
                marginTop: topPad + 46,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('NewChatDirectory');
              }}
            >
              <UserPlus size={18} color={palette.text} />
              <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                New 1-to-1 Chat
              </Text>
            </TouchableOpacity>

            {isChurchAdmin ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate('CreateGroup');
                }}
              >
                <UsersRound size={18} color={palette.text} />
                <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                  Create Church Group
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('ArchivedChats');
              }}
            >
              <Archive size={18} color={palette.text} />
              <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                Archived Chats {archivedCount > 0 ? `(${archivedCount})` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('ArchivedChats', { initialTab: 'blocked' });
              }}
            >
              <ShieldAlert size={18} color={palette.text} />
              <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                Blocked Members
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                setE2eeModalMode(
                  e2eeState.status === 'needs_pin_unlock' ? 'unlock_backup' : 'manage'
                );
              }}
            >
              <Lock size={18} color={palette.accent} />
              <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                Chat Encryption & PIN
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Admin '+' Chooser Modal */}
      <Modal
        visible={plusChooserOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPlusChooserOpen(false)}
      >
        <Pressable style={styles.bottomSheetBackdrop} onPress={() => setPlusChooserOpen(false)}>
          <View
            style={[
              styles.bottomSheet,
              { backgroundColor: palette.surface, borderColor: palette.glassBorder },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: palette.text, fontFamily }]}>
              Start New Conversation
            </Text>
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                setPlusChooserOpen(false);
                navigation.navigate('NewChatDirectory');
              }}
            >
              <View style={[styles.sheetIcon, { backgroundColor: `${palette.accent}22` }]}>
                <UserPlus size={20} color={palette.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetActionTitle, { color: palette.text, fontFamily }]}>
                  New 1-to-1 Chat
                </Text>
                <Text style={[styles.sheetActionSub, { color: palette.textSecondary }]}>
                  Search any Rhema Church member
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                setPlusChooserOpen(false);
                navigation.navigate('CreateGroup');
              }}
            >
              <View style={[styles.sheetIcon, { backgroundColor: 'rgba(34,197,94,0.18)' }]}>
                <UsersRound size={20} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetActionTitle, { color: palette.text, fontFamily }]}>
                  Create Church Group
                </Text>
                <Text style={[styles.sheetActionSub, { color: palette.textSecondary }]}>
                  Worship, Songs, Prayer, Media, Youth & Teams
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Conversation Row Long-Press Options */}
      <Modal
        visible={Boolean(selectedRow)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRow(null)}
      >
        <Pressable style={styles.bottomSheetBackdrop} onPress={() => setSelectedRow(null)}>
          {selectedRow ? (
            <View
              style={[
                styles.bottomSheet,
                { backgroundColor: palette.surface, borderColor: palette.glassBorder },
              ]}
            >
              <Text style={[styles.sheetTitle, { color: palette.text, fontFamily }]}>
                {selectedRow.title}
              </Text>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  const next = !selectedRow.isFavorite;
                  setSelectedRow(null);
                  rhemaChatService.setInboxFlag(churchId, myUid, selectedRow.roomId, {
                    isFavorite: next,
                  });
                }}
              >
                <Star size={18} color="#FBBF24" />
                <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                  {selectedRow.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  const next = !selectedRow.isMuted;
                  setSelectedRow(null);
                  rhemaChatService.setInboxFlag(churchId, myUid, selectedRow.roomId, {
                    isMuted: next,
                    mutedUntil: null,
                  });
                }}
              >
                <BellOff size={18} color={palette.text} />
                <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                  {selectedRow.isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setSelectedRow(null);
                  rhemaChatService.setInboxFlag(churchId, myUid, selectedRow.roomId, {
                    isArchived: true,
                  });
                }}
              >
                <Archive size={18} color={palette.text} />
                <Text style={[styles.menuItemText, { color: palette.text, fontFamily }]}>
                  Archive Chat
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  const target = selectedRow;
                  setSelectedRow(null);
                  Alert.alert(
                    'Delete Chat',
                    `Delete conversation with ${target.title} from your Chats list?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete Chat',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await rhemaChatService.deleteChatForMe(
                              churchId,
                              target.roomId,
                              myUid
                            );
                          } catch (err: any) {
                            Alert.alert(
                              'Delete Failed',
                              err?.message || 'Could not delete chat.'
                            );
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Trash2 size={18} color={palette.danger} />
                <Text style={[styles.menuItemText, { color: palette.danger, fontFamily }]}>
                  Delete Chat
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

        </Pressable>
      </Modal>

      <ChatEncryptionModal
        visible={Boolean(e2eeModalMode)}
        uid={myUid}
        mode={e2eeModalMode || 'manage'}
        isDark={palette.isDark}
        accentColor={palette.accent}
        onClose={() => setE2eeModalMode(null)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
  },
  chipsRow: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 12,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipLabel: {
    fontWeight: '600',
  },
  directorySection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  noMembersTxt: {
    fontSize: 13.5,
    paddingVertical: 10,
  },
  memberSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  memberSearchName: {
    fontSize: 15,
    fontWeight: '700',
  },
  memberSearchSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
  centerBox: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyCard: {
    marginHorizontal: 20,
    marginTop: 28,
    borderRadius: 26,
    borderWidth: 1,
    padding: 26,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySub: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
  },
  emptyPrimaryTxt: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
  },
  emptySecondaryTxt: {
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  menuBox: {
    width: 230,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuItemText: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  bottomSheet: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  sheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sheetActionSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
});
