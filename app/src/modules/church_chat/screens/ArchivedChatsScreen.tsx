import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArchiveRestore, ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { useChatTheme } from '../constants/useChatTheme';
import { rhemaChatService } from '../services/rhemaChatService';
import { rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { ChatBlockRecord, ChatInboxItem } from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';

export default function ArchivedChatsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeChurch } = useChurch();
  const { palette, fontFamily, scaleFont } = useChatTheme();

  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;
  const myUid = user?.uid || '';

  const [tab, setTab] = useState<'archived' | 'blocked'>(
    route?.params?.initialTab === 'blocked' ? 'blocked' : 'archived'
  );
  const [archived, setArchived] = useState<ChatInboxItem[]>([]);
  const [blocked, setBlocked] = useState<ChatBlockRecord[]>([]);

  useEffect(() => {
    const unsubInbox = rhemaChatService.subscribeInbox(churchId, myUid, (items) => {
      setArchived(items.filter((i) => i.isArchived));
    });
    const unsubBlocks = rhemaDirectoryService.subscribeBlockedUsers(
      churchId,
      myUid,
      (map) => setBlocked(Object.values(map))
    );
    return () => {
      unsubInbox();
      unsubBlocks();
    };
  }, [churchId, myUid]);

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
            styles.circleBtn,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={19} color={palette.text} />
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: palette.text, fontFamily, fontSize: scaleFont(19) }]}
        >
          {tab === 'archived' ? 'Archived Chats' : 'Blocked Members'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.tabRow}>
        {(['archived', 'blocked'] as const).map((t) => {
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              style={[
                styles.tabChip,
                {
                  backgroundColor: active ? palette.filterActiveBg : palette.filterInactiveBg,
                  borderColor: active ? palette.filterActiveBg : palette.glassBorder,
                },
              ]}
              onPress={() => setTab(t)}
            >
              <Text
                style={{
                  color: active ? palette.filterActiveText : palette.filterInactiveText,
                  fontWeight: '700',
                  fontSize: 13.5,
                }}
              >
                {t === 'archived'
                  ? `Archived (${archived.length})`
                  : `Blocked (${blocked.length})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'archived' ? (
        <FlatList
          data={archived}
          keyExtractor={(i) => i.roomId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate('RhemaChatRoom', {
                  roomId: item.roomId,
                  roomType: item.roomType,
                  title: item.title,
                  avatarUrl: item.avatarUrl,
                  peerUid: item.peerUid,
                })
              }
            >
              <AvatarWithStatus
                uri={item.avatarUrl}
                name={item.title}
                size={46}
                isGroup={item.roomType === 'group'}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.rowName, { color: palette.text, fontFamily }]}>
                  {item.title}
                </Text>
                <Text style={{ color: palette.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
                  {item.lastMessageText || 'Archived conversation'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.pillBtn, { borderColor: palette.glassBorder }]}
                onPress={() =>
                  rhemaChatService.setInboxFlag(churchId, myUid, item.roomId, {
                    isArchived: false,
                  })
                }
              >
                <ArchiveRestore size={15} color={palette.accent} />
                <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 12 }}>
                  Unarchive
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: palette.textMuted }]}>
              No archived conversations
            </Text>
          }
        />
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(b) => b.blockedUid}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <AvatarWithStatus uri={item.blockedPhoto} name={item.blockedName} size={46} />
              <Text style={[styles.rowName, { color: palette.text, flex: 1, marginLeft: 12 }]}>
                {item.blockedName}
              </Text>
              <TouchableOpacity
                style={[styles.pillBtn, { borderColor: palette.glassBorder }]}
                onPress={() =>
                  rhemaDirectoryService.unblockMember(churchId, myUid, item.blockedUid)
                }
              >
                <ShieldCheck size={15} color={palette.accent} />
                <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 12 }}>
                  Unblock
                </Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: palette.textMuted }]}>No blocked members</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '800' },
  tabRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  tabChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowName: { fontSize: 15, fontWeight: '700' },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  empty: { textAlign: 'center', paddingTop: 60, fontSize: 14 },
});
