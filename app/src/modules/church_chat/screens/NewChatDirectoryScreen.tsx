import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MessageCircle, Search, UsersRound, X } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { useChatTheme } from '../constants/useChatTheme';
import { isRhemaAdminRole, rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { rhemaChatService } from '../services/rhemaChatService';
import { ChatBlockRecord, ChatPresenceState, ChurchMemberContact } from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';

export default function NewChatDirectoryScreen({ navigation }: any) {
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

  const [members, setMembers] = useState<ChurchMemberContact[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, ChatPresenceState>>({});
  const [blockedMap, setBlockedMap] = useState<Record<string, ChatBlockRecord>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    rhemaDirectoryService
      .getChurchMembers(churchId, myUid)
      .then((list) => {
        if (mounted) setMembers(list);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubBlocks = rhemaDirectoryService.subscribeBlockedUsers(
      churchId,
      myUid,
      setBlockedMap
    );
    return () => {
      mounted = false;
      unsubBlocks();
    };
  }, [churchId, myUid]);

  useEffect(() => {
    if (members.length === 0) return;
    const unsubs = members.slice(0, 30).map((m) =>
      rhemaChatService.subscribePresence(churchId, m.uid, (st) => {
        setPresenceMap((prev) => ({ ...prev, [m.uid]: st }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [churchId, members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => !blockedMap[m.uid])
      .filter((m) => {
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          (m.phone || '').toLowerCase().includes(q) ||
          (m.city || '').toLowerCase().includes(q) ||
          (m.memberCode || '').toLowerCase().includes(q)
        );
      });
  }, [members, blockedMap, query]);

  const handleSelectMember = async (peer: ChurchMemberContact) => {
    try {
      const roomId = await rhemaChatService.ensureDirectRoom(
        churchId,
        { uid: myUid, name: myName, photoUrl: myPhoto },
        peer
      );
      navigation.replace('RhemaChatRoom', {
        roomId,
        roomType: 'direct',
        title: peer.name,
        avatarUrl: peer.photoUrl,
        peerUid: peer.uid,
        peerPhone: peer.phone || '',
      });
    } catch (err: any) {
      Alert.alert('Chat Error', err?.message || 'Unable to start chat.');
    }
  };

  const topPad = Math.max(insets.top + 6, Platform.OS === 'ios' ? 50 : 32);

  return (
    <LinearGradient colors={palette.bgGradient} style={styles.root}>
      <StatusBar
        barStyle={palette.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity
          style={[
            styles.backBtn,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={19} color={palette.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={[
              styles.title,
              { color: palette.text, fontFamily, fontSize: scaleFont(20) },
            ]}
          >
            Rhema Members
          </Text>
          <Text style={[styles.sub, { color: palette.textSecondary, fontFamily }]}>
            {filtered.length} member{filtered.length === 1 ? '' : 's'} available
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchPill,
            { backgroundColor: palette.inputBg, borderColor: palette.glassBorder },
          ]}
        >
          <Search size={17} color={palette.textSecondary} />
          <TextInput
            style={[
              styles.searchInput,
              { color: palette.text, fontFamily, fontSize: scaleFont(14.5) },
            ]}
            placeholder="Search member by name, phone, or city..."
            placeholderTextColor={palette.inputPlaceholder}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={16} color={palette.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isChurchAdmin ? (
        <TouchableOpacity
          style={[
            styles.createGroupBanner,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
          onPress={() => navigation.replace('CreateGroup')}
          activeOpacity={0.85}
        >
          <View style={[styles.groupIconWrap, { backgroundColor: `${palette.accent}24` }]}>
            <UsersRound size={20} color={palette.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupTitle, { color: palette.text, fontFamily }]}>
              Create Church Group
            </Text>
            <Text style={[styles.groupSub, { color: palette.textSecondary }]}>
              Admin-only · Start a team or ministry group
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleSelectMember(item)}
              activeOpacity={0.78}
            >
              <AvatarWithStatus
                uri={item.photoUrl}
                name={item.name}
                size={48}
                online={presenceMap[item.uid]?.online}
                dotColor={palette.onlineDot}
                dotBorderColor={palette.bg}
              />
              <View style={styles.rowCenter}>
                <View style={styles.nameRow}>
                  <Text
                    style={[
                      styles.name,
                      { color: palette.text, fontFamily, fontSize: scaleFont(15) },
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.isAdmin ? (
                    <View style={[styles.roleBadge, { backgroundColor: `${palette.accent}24` }]}>
                      <Text style={[styles.roleText, { color: palette.accent }]}>
                        {item.userType}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.meta, { color: palette.textSecondary, fontFamily }]}
                  numberOfLines={1}
                >
                  {item.city || item.memberCode || 'Rhema Global Ministries'}
                </Text>
              </View>
              <MessageCircle size={19} color={palette.accent} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: palette.textSecondary, fontSize: 14 }}>
                No matching Rhema members found.
              </Text>
            </View>
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 1 },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  searchInput: { flex: 1, paddingVertical: 0 },
  createGroupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 13,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  groupIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { fontSize: 15, fontWeight: '700' },
  groupSub: { fontSize: 12, marginTop: 1 },
  center: { paddingTop: 60, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowCenter: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: { fontWeight: '700', flexShrink: 1 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleText: { fontSize: 10.5, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 2 },
});
