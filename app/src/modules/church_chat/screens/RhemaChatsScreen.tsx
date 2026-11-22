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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  Archive,
  ArrowLeft,
  BellOff,
  Camera,
  MessageCircle,
  MoreVertical,
  Search,
  ShieldAlert,
  Star,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { useChatTheme } from '../constants/useChatTheme';
import { isRhemaAdminRole, rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { rhemaChatService } from '../services/rhemaChatService';
import {
  ChatBlockRecord,
  ChatInboxItem,
  ChatPresenceState,
  ChurchMemberContact,
} from '../types/chat';
import ActiveMembersStrip from '../components/ActiveMembersStrip';
import AvatarWithStatus from '../components/AvatarWithStatus';
import ChatListRow from '../components/ChatListRow';
import FloatingBottomDock, { DockSection } from '../components/FloatingBottomDock';

type FilterChip = 'all' | 'favorites' | 'teams' | 'groups';

export default function RhemaChatsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { palette, fontFamily, scaleFont } = useChatTheme();

  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;
  const myUid = user?.uid || '';
  const myName =
    member?.name ||
    `${member?.firstName || ''} ${member?.lastName || ''}`.trim() ||
    user?.displayName ||
    'Rhema Member';
  const myPhoto = (member as any)?.profilePhoto || (member as any)?.photoUrl || null;
  const isChurchAdmin = isRhemaAdminRole(member);

  const [inbox, setInbox] = useState<ChatInboxItem[]>([]);
  const [members, setMembers] = useState<ChurchMemberContact[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, ChatPresenceState>>({});
  const [blockedMap, setBlockedMap] = useState<Record<string, ChatBlockRecord>>({});
  const [loading, setLoading] = useState(true);

  const [filterChip, setFilterChip] = useState<FilterChip>('all');
  const [dockSection, setDockSection] = useState<DockSection>('chats');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusChooserOpen, setPlusChooserOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ChatInboxItem | null>(null);

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
    loadDirectory();

    const stopPresence = rhemaChatService.startPresenceTracking(churchId, myUid, null);
    const unsubInbox = rhemaChatService.subscribeInbox(churchId, myUid, (items) => {
      setInbox(items);
      setLoading(false);
    });
    const unsubBlocks = rhemaDirectoryService.subscribeBlockedUsers(
      churchId,
      myUid,
      setBlockedMap
    );

    const safety = setTimeout(() => setLoading(false), 1800);

    return () => {
      clearTimeout(safety);
      unsubInbox();
      unsubBlocks();
      stopPresence();
    };
  }, [churchId, myUid, loadDirectory]);

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
    if (!peerUidsSignature) return;
    const uids = peerUidsSignature.split(',').filter(Boolean);
    const unsubs = uids.map((uid) =>
      rhemaChatService.subscribePresence(churchId, uid, (st) => {
        setPresenceMap((prev) => ({ ...prev, [uid]: st }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [churchId, peerUidsSignature]);

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

  const handleDockSelect = (section: DockSection) => {
    setDockSection(section);
    if (section === 'chats') {
      setFilterChip('all');
    } else if (section === 'groups') {
      setFilterChip('groups');
    } else if (section === 'directory') {
      navigation.navigate('NewChatDirectory');
      setDockSection('chats');
    } else if (section === 'archived') {
      navigation.navigate('ArchivedChats');
      setDockSection('chats');
    }
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
            onPress={() => navigation.navigate('NewChatDirectory')}
            activeOpacity={0.8}
          >
            <Camera size={18} color={palette.text} />
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
            {/* Active Members Horizontal Strip */}
            {!searchQuery.trim() ? (
              <ActiveMembersStrip
                me={{ uid: myUid, name: myName, photoUrl: myPhoto }}
                members={members.filter((m) => !blockedMap[m.uid])}
                presenceMap={presenceMap}
                palette={palette}
                fontFamily={fontFamily}
                scaleFont={scaleFont}
                onPressMe={() => navigation.navigate('NewChatDirectory')}
                onPressMember={openDirectChatWithMember}
              />
            ) : null}

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
        renderItem={({ item }) => (
          <ChatListRow
            item={item}
            myUid={myUid}
            isOnline={
              item.roomType === 'direct' && item.peerUid
                ? presenceMap[item.peerUid]?.online === true
                : false
            }
            palette={palette}
            fontFamily={fontFamily}
            scaleFont={scaleFont}
            onPress={() => openInboxItem(item)}
            onLongPress={() => setSelectedRow(item)}
          />
        )}
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

      {/* Floating Bottom Glass Dock + Detached '+' FAB */}
      <FloatingBottomDock
        activeSection={dockSection}
        onSelectSection={handleDockSelect}
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
            </View>
          ) : null}
        </Pressable>
      </Modal>
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
