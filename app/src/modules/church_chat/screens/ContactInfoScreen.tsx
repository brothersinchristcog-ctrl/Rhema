import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Archive, ArrowLeft, BellOff, Flag, Phone, ShieldBan } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { useChatTheme } from '../constants/useChatTheme';
import { rhemaChatService } from '../services/rhemaChatService';
import { rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { ChatBlockRecord, ChatPresenceState, ChurchMemberContact } from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';

export default function ContactInfoScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { palette, fontFamily, scaleFont } = useChatTheme();

  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;
  const myUid = user?.uid || '';
  const myName = member?.name || 'Rhema Member';

  const roomId: string = route?.params?.roomId || '';
  const peerUid: string = route?.params?.peerUid || '';
  const initialName: string = route?.params?.peerName || 'Rhema Member';
  const initialAvatar: string | null = route?.params?.peerAvatar || null;
  const initialPhone: string = route?.params?.peerPhone || '';

  const [peer, setPeer] = useState<ChurchMemberContact | null>(null);
  const [presence, setPresence] = useState<ChatPresenceState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [blockedMap, setBlockedMap] = useState<Record<string, ChatBlockRecord>>({});

  useEffect(() => {
    rhemaDirectoryService.getMemberByUid(churchId, peerUid).then(setPeer);
    const unsubPresence = rhemaChatService.subscribePresence(churchId, peerUid, setPresence);
    const unsubInbox = rhemaChatService.subscribeInbox(churchId, myUid, (items) => {
      const found = items.find((i) => i.roomId === roomId);
      setIsMuted(Boolean(found?.isMuted));
      setIsArchived(Boolean(found?.isArchived));
    });
    const unsubBlocks = rhemaDirectoryService.subscribeBlockedUsers(
      churchId,
      myUid,
      setBlockedMap
    );

    return () => {
      unsubPresence();
      unsubInbox();
      unsubBlocks();
    };
  }, [churchId, myUid, peerUid, roomId]);

  const displayName = peer?.name || initialName;
  const displayAvatar = peer?.photoUrl || initialAvatar;
  const displayPhone = peer?.phone || initialPhone;
  const isBlocked = Boolean(blockedMap[peerUid]);
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
        <Text style={[styles.headerTitle, { color: palette.text, fontFamily }]}>Member Info</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 36 }}>
        <View
          style={[
            styles.card,
            styles.centerCard,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <AvatarWithStatus
            uri={displayAvatar}
            name={displayName}
            size={84}
            online={presence?.online === true}
            dotColor={palette.onlineDot}
            dotBorderColor={palette.bg}
          />
          <Text
            style={[styles.name, { color: palette.text, fontFamily, fontSize: scaleFont(21) }]}
          >
            {displayName}
          </Text>
          <Text style={[styles.sub, { color: palette.textSecondary }]}>
            {peer?.userType || 'Rhema Member'}
            {peer?.city ? ` · ${peer.city}` : ''}
          </Text>

          {displayPhone ? (
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: palette.accent }]}
              onPress={() => Linking.openURL(`tel:${displayPhone}`)}
            >
              <Phone size={15} color="#FFFFFF" />
              <Text style={styles.callTxt}>Call {displayPhone}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <BellOff size={18} color={palette.text} />
              <Text style={[styles.rowTxt, { color: palette.text, fontFamily }]}>
                Mute Notifications
              </Text>
            </View>
            <Switch
              value={isMuted}
              onValueChange={(v) =>
                rhemaChatService.setInboxFlag(churchId, myUid, roomId, { isMuted: v })
              }
              trackColor={{ false: '#3F3F46', true: palette.accent }}
            />
          </View>

          <View style={[styles.row, { marginTop: 12 }]}>
            <View style={styles.rowLeft}>
              <Archive size={18} color={palette.text} />
              <Text style={[styles.rowTxt, { color: palette.text, fontFamily }]}>
                Archive Conversation
              </Text>
            </View>
            <Switch
              value={isArchived}
              onValueChange={(v) =>
                rhemaChatService.setInboxFlag(churchId, myUid, roomId, { isArchived: v })
              }
              trackColor={{ false: '#3F3F46', true: palette.accent }}
            />
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              if (isBlocked) {
                rhemaDirectoryService.unblockMember(churchId, myUid, peerUid);
              } else {
                Alert.alert('Block Member', `Block ${displayName}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: () =>
                      rhemaDirectoryService.blockMember(churchId, myUid, {
                        uid: peerUid,
                        name: displayName,
                        photoUrl: displayAvatar,
                      }),
                  },
                ]);
              }
            }}
          >
            <ShieldBan size={18} color={palette.danger} />
            <Text style={[styles.actionTxt, { color: palette.danger, fontFamily }]}>
              {isBlocked ? `Unblock ${displayName}` : `Block ${displayName}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { marginTop: 6 }]}
            onPress={async () => {
              await rhemaDirectoryService.submitReport(churchId, myUid, myName, {
                reportedUid: peerUid,
                reportedName: displayName,
                roomId,
                reason: 'Reported from Contact Info',
              });
              Alert.alert('Reported', 'This report has been sent to Rhema Church Administrators.');
            }}
          >
            <Flag size={18} color={palette.danger} />
            <Text style={[styles.actionTxt, { color: palette.danger, fontFamily }]}>
              Report Member to Church Admin
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  headerTitle: { fontSize: 18, fontWeight: '800' },
  card: { borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 14 },
  centerCard: { alignItems: 'center' },
  name: { fontWeight: '800', marginTop: 12 },
  sub: { fontSize: 13, marginTop: 4 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    marginTop: 14,
  },
  callTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 13.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTxt: { fontSize: 15, fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  actionTxt: { fontSize: 15, fontWeight: '600' },
});
