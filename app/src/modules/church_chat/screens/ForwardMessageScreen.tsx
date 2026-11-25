import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ArrowLeft, Check, Send } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { useChatTheme } from '../constants/useChatTheme';
import { rhemaChatService } from '../services/rhemaChatService';
import { rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { ChatInboxItem, ChatMessage, ChurchMemberContact } from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';

export default function ForwardMessageScreen({ navigation, route }: any) {
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
  const message: ChatMessage | undefined = route?.params?.message;

  const [inbox, setInbox] = useState<ChatInboxItem[]>([]);
  const [members, setMembers] = useState<ChurchMemberContact[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<Record<string, ChatInboxItem>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = rhemaChatService.subscribeInbox(churchId, myUid, setInbox);
    rhemaDirectoryService.getChurchMembers(churchId, myUid).then(setMembers);
    return () => unsub();
  }, [churchId, myUid]);

  const handleForward = async () => {
    const targets = Object.values(selectedRooms);
    if (!message || targets.length === 0) return;

    setSending(true);
    try {
      await Promise.all(
        targets.map((target) =>
          rhemaChatService.sendMessage({
            churchId,
            roomId: target.roomId,
            roomType: target.roomType,
            roomTitle: target.title,
            roomAvatar: target.avatarUrl,
            category: target.category,
            participantUids: target.peerUid ? [myUid, target.peerUid] : [myUid],
            senderUid: myUid,
            senderName: myName,
            senderAvatar: myPhoto,
            type: message.type === 'system' ? 'text' : message.type,
            text: message.text,
            media: message.media,
            forwarded: true,
          })
        )
      );
      navigation.goBack();
    } catch (err: any) {
      if (err?.message === 'PIN_UNLOCK_REQUIRED') {
        Alert.alert(
          'Encrypted Chats Locked',
          'Please unlock your Chat Backup PIN from the Chats screen before forwarding messages.'
        );
      } else {
        Alert.alert('Forward Failed', err?.message || 'Unable to forward message.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleDirectForwardMember = async (peer: ChurchMemberContact) => {
    if (!message) return;
    setSending(true);
    try {
      const roomId = await rhemaChatService.ensureDirectRoom(
        churchId,
        { uid: myUid, name: myName, photoUrl: myPhoto },
        peer
      );
      await rhemaChatService.sendMessage({
        churchId,
        roomId,
        roomType: 'direct',
        roomTitle: peer.name,
        roomAvatar: peer.photoUrl,
        category: 'direct',
        participantUids: [myUid, peer.uid],
        senderUid: myUid,
        senderName: myName,
        senderAvatar: myPhoto,
        type: message.type === 'system' ? 'text' : message.type,
        text: message.text,
        media: message.media,
        forwarded: true,
      });
      navigation.goBack();
    } catch (err: any) {
      if (err?.message === 'PIN_UNLOCK_REQUIRED') {
        Alert.alert(
          'Encrypted Chats Locked',
          'Please unlock your Chat Backup PIN from the Chats screen before forwarding messages.'
        );
      } else {
        Alert.alert('Forward Failed', err?.message || 'Unable to forward message.');
      }
    } finally {
      setSending(false);
    }
  };

  const selectedCount = Object.keys(selectedRooms).length;
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
          style={[
            styles.title,
            { color: palette.text, fontFamily, fontSize: scaleFont(19) },
          ]}
        >
          Forward To...
        </Text>
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: palette.accent, opacity: selectedCount > 0 ? 1 : 0.45 },
          ]}
          disabled={selectedCount === 0 || sending}
          onPress={handleForward}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Send size={14} color="#FFFFFF" />
              <Text style={styles.sendTxt}>
                {selectedCount > 0 ? `Send (${selectedCount})` : 'Send'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={inbox}
        keyExtractor={(it) => it.roomId}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        ListHeaderComponent={
          <Text style={[styles.section, { color: palette.textSecondary }]}>RECENT CHATS</Text>
        }
        renderItem={({ item }) => {
          const sel = Boolean(selectedRooms[item.roomId]);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                setSelectedRooms((prev) => {
                  const next = { ...prev };
                  if (next[item.roomId]) delete next[item.roomId];
                  else next[item.roomId] = item;
                  return next;
                })
              }
            >
              <AvatarWithStatus
                uri={item.avatarUrl}
                name={item.title}
                size={44}
                isGroup={item.roomType === 'group'}
              />
              <Text style={[styles.rowName, { color: palette.text, fontFamily }]}>
                {item.title}
              </Text>
              <View
                style={[
                  styles.checkCircle,
                  {
                    borderColor: sel ? palette.accent : palette.glassBorder,
                    backgroundColor: sel ? palette.accent : 'transparent',
                  },
                ]}
              >
                {sel ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <>
            <Text style={[styles.section, { color: palette.textSecondary, marginTop: 14 }]}>
              TAP A MEMBER TO FORWARD DIRECTLY
            </Text>
            {members.slice(0, 25).map((m) => (
              <TouchableOpacity
                key={m.uid}
                style={styles.row}
                onPress={() => handleDirectForwardMember(m)}
              >
                <AvatarWithStatus uri={m.photoUrl} name={m.name} size={42} />
                <Text style={[styles.rowName, { color: palette.text, fontFamily }]}>{m.name}</Text>
                <Send size={16} color={palette.accent} />
              </TouchableOpacity>
            ))}
          </>
        }
      />
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
    paddingBottom: 12,
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
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  sendTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  section: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowName: { flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '600' },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
