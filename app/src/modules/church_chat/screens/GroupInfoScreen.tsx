import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  BellOff,
  Camera,
  Check,
  Edit3,
  FileText,
  LogOut,
  Shield,
  UserPlus,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import InAppDocumentViewerModal, {
  InAppDocumentViewerDoc,
} from '../../../components/InAppDocumentViewerModal';
import { useChatTheme } from '../constants/useChatTheme';
import { rhemaChatService } from '../services/rhemaChatService';
import { rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { rhemaGroupService } from '../services/rhemaGroupService';
import { rhemaChatMediaService } from '../services/rhemaChatMediaService';
import { ChatMessage, ChatRoomDetails, ChurchMemberContact } from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';

export default function GroupInfoScreen({ navigation, route }: any) {
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
    'Member';
  const myPhoto = (member as any)?.profilePhoto || (member as any)?.photoUrl || null;
  const roomId: string = route?.params?.roomId || '';

  const [room, setRoom] = useState<ChatRoomDetails | null>(null);
  const [directory, setDirectory] = useState<ChurchMemberContact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSelection, setAddSelection] = useState<Record<string, boolean>>({});
  const [selectedParticipant, setSelectedParticipant] = useState<ChurchMemberContact | null>(null);
  const [mediaTab, setMediaTab] = useState<'media' | 'docs'>('media');
  const [docViewer, setDocViewer] = useState<InAppDocumentViewerDoc | null>(null);

  useEffect(() => {
    const unsubRoom = rhemaChatService.subscribeRoomDetails(churchId, roomId, (details) => {
      setRoom(details);
      if (details) {
        setEditName(details.meta.name);
        setEditDesc(details.meta.description || '');
        setEditAvatarUri(details.meta.avatarUrl || null);
      }
    });
    const unsubInbox = rhemaChatService.subscribeInbox(churchId, myUid, (items) => {
      const found = items.find((i) => i.roomId === roomId);
      setIsMuted(Boolean(found?.isMuted));
    });
    const unsubMsgs = rhemaChatService.subscribeRoomMessages(
      churchId,
      roomId,
      myUid,
      150,
      setMessages
    );
    rhemaDirectoryService.getChurchMembers(churchId).then(setDirectory);

    return () => {
      unsubRoom();
      unsubInbox();
      unsubMsgs();
    };
  }, [churchId, roomId, myUid]);

  const participantUids = useMemo(
    () => Object.keys(room?.participants || {}).filter((u) => room?.participants?.[u]),
    [room?.participants]
  );
  const adminUids = useMemo(
    () => Object.keys(room?.admins || {}).filter((u) => room?.admins?.[u]),
    [room?.admins]
  );

  const amAdmin = Boolean(room?.admins?.[myUid]);
  const canEditInfo = amAdmin || room?.meta?.onlyAdminsCanEditInfo === false;
  const canAddMembers = amAdmin || room?.meta?.onlyAdminsCanAddMembers === false;

  const participantContacts = useMemo(() => {
    const map = new Map(directory.map((m) => [m.uid, m]));
    return participantUids
      .map((uid) => {
        if (uid === myUid) {
          return {
            uid,
            name: `${myName} (You)`,
            photoUrl: myPhoto,
            userType: member?.userType || 'Member',
            isAdmin: Boolean(room?.admins?.[uid]),
          } as ChurchMemberContact;
        }
        return (
          map.get(uid) || {
            uid,
            name: 'Rhema Member',
            photoUrl: null,
            userType: 'Member',
            isAdmin: false,
          }
        );
      })
      .sort((a, b) => {
        const aAdm = room?.admins?.[a.uid] ? 1 : 0;
        const bAdm = room?.admins?.[b.uid] ? 1 : 0;
        if (aAdm !== bAdm) return bAdm - aAdm;
        return a.name.localeCompare(b.name);
      });
  }, [participantUids, directory, myUid, myName, myPhoto, member?.userType, room?.admins]);

  const nonMemberContacts = useMemo(
    () => directory.filter((m) => !room?.participants?.[m.uid]),
    [directory, room?.participants]
  );

  const sharedMedia = useMemo(
    () =>
      messages
        .filter((m) => !m.deletedForEveryone && (m.type === 'image' || m.type === 'image_group'))
        .flatMap((m) => m.media || []),
    [messages]
  );

  const sharedDocs = useMemo(
    () =>
      messages
        .filter((m) => !m.deletedForEveryone && m.type === 'document')
        .flatMap((m) => m.media || []),
    [messages]
  );

  const handleSaveInfo = async () => {
    if (!editName.trim() || !room) return;
    setSavingInfo(true);
    try {
      let avatarUrl = editAvatarUri;
      if (editAvatarUri && !editAvatarUri.startsWith('http')) {
        avatarUrl = await rhemaChatMediaService.uploadGroupAvatar(
          churchId,
          roomId,
          editAvatarUri
        );
      }
      await rhemaGroupService.updateGroupInfo({
        churchId,
        roomId,
        actorUid: myUid,
        actorName: myName,
        name: editName.trim(),
        description: editDesc.trim(),
        avatarUrl,
        category: room.meta.category,
        participantUids,
      });
      setEditModalOpen(false);
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update group details.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleAddSelectedMembers = async () => {
    if (!room) return;
    const toAdd = nonMemberContacts
      .filter((m) => addSelection[m.uid])
      .map((m) => ({ uid: m.uid, name: m.name }));
    if (toAdd.length === 0) return;
    try {
      await rhemaGroupService.addMembers({
        churchId,
        roomId,
        actorUid: myUid,
        actorName: myName,
        roomTitle: room.meta.name,
        roomAvatar: room.meta.avatarUrl,
        category: room.meta.category,
        existingParticipantUids: participantUids,
        newMembers: toAdd,
      });
      setAddSelection({});
      setAddModalOpen(false);
    } catch (err: any) {
      Alert.alert('Add Failed', err?.message || 'Unable to add members.');
    }
  };

  const handleLeaveGroup = () => {
    if (!room) return;
    Alert.alert('Leave Group', `Are you sure you want to leave "${room.meta.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await rhemaGroupService.leaveGroup({
              churchId,
              roomId,
              myUid,
              myName,
              roomTitle: room.meta.name,
              roomAvatar: room.meta.avatarUrl,
              category: room.meta.category,
              existingParticipantUids: participantUids,
              existingAdminUids: adminUids,
            });
            navigation.popToTop();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Could not leave group.');
          }
        },
      },
    ]);
  };

  const topPad = Math.max(insets.top + 6, Platform.OS === 'ios' ? 50 : 32);

  if (!room) {
    return (
      <LinearGradient colors={palette.bgGradient} style={styles.center}>
        <ActivityIndicator size="large" color={palette.accent} />
      </LinearGradient>
    );
  }

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
        <Text style={[styles.headerTitle, { color: palette.text, fontFamily }]}>Group Info</Text>
        {canEditInfo ? (
          <TouchableOpacity
            style={[
              styles.circleBtn,
              { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
            ]}
            onPress={() => setEditModalOpen(true)}
          >
            <Edit3 size={17} color={palette.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      >
        {/* Profile Header Card */}
        <View
          style={[
            styles.card,
            styles.centerCard,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <AvatarWithStatus
            uri={room.meta.avatarUrl}
            name={room.meta.name}
            size={84}
            isGroup
            dotBorderColor={palette.bg}
          />
          <Text
            style={[
              styles.groupName,
              { color: palette.text, fontFamily, fontSize: scaleFont(21) },
            ]}
          >
            {room.meta.name}
          </Text>
          <Text style={[styles.groupMeta, { color: palette.textSecondary }]}>
            {room.meta.category === 'team' ? 'Ministry Team' : 'Group'} · {participantUids.length}{' '}
            participants
          </Text>
          {room.meta.description ? (
            <Text style={[styles.groupDesc, { color: palette.textSecondary, fontFamily }]}>
              {room.meta.description}
            </Text>
          ) : null}
        </View>

        {/* Mute Toggle */}
        <View
          style={[
            styles.card,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <BellOff size={18} color={palette.text} />
              <Text style={[styles.rowTxt, { color: palette.text, fontFamily }]}>
                Mute Notifications
              </Text>
            </View>
            <Switch
              value={isMuted}
              onValueChange={(val) =>
                rhemaChatService.setInboxFlag(churchId, myUid, roomId, { isMuted: val })
              }
              trackColor={{ false: '#3F3F46', true: palette.accent }}
            />
          </View>
        </View>

        {/* Admin Group Permissions */}
        {amAdmin ? (
          <View
            style={[
              styles.card,
              { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>
              GROUP PERMISSIONS (ADMIN)
            </Text>

            <View style={styles.permRow}>
              <Text style={[styles.permTxt, { color: palette.text, fontFamily }]}>
                Only Admins Can Send Messages
              </Text>
              <Switch
                value={room.meta.onlyAdminsCanSend}
                onValueChange={(v) =>
                  rhemaGroupService.updateGroupPermissions({
                    churchId,
                    roomId,
                    actorUid: myUid,
                    actorName: myName,
                    roomTitle: room.meta.name,
                    roomAvatar: room.meta.avatarUrl,
                    category: room.meta.category,
                    participantUids,
                    onlyAdminsCanSend: v,
                    onlyAdminsCanEditInfo: room.meta.onlyAdminsCanEditInfo,
                    onlyAdminsCanAddMembers: room.meta.onlyAdminsCanAddMembers,
                  })
                }
                trackColor={{ false: '#3F3F46', true: palette.accent }}
              />
            </View>

            <View style={styles.permRow}>
              <Text style={[styles.permTxt, { color: palette.text, fontFamily }]}>
                Only Admins Can Edit Group Info
              </Text>
              <Switch
                value={room.meta.onlyAdminsCanEditInfo}
                onValueChange={(v) =>
                  rhemaGroupService.updateGroupPermissions({
                    churchId,
                    roomId,
                    actorUid: myUid,
                    actorName: myName,
                    roomTitle: room.meta.name,
                    roomAvatar: room.meta.avatarUrl,
                    category: room.meta.category,
                    participantUids,
                    onlyAdminsCanSend: room.meta.onlyAdminsCanSend,
                    onlyAdminsCanEditInfo: v,
                    onlyAdminsCanAddMembers: room.meta.onlyAdminsCanAddMembers,
                  })
                }
                trackColor={{ false: '#3F3F46', true: palette.accent }}
              />
            </View>

            <View style={styles.permRow}>
              <Text style={[styles.permTxt, { color: palette.text, fontFamily }]}>
                Only Admins Can Add Members
              </Text>
              <Switch
                value={room.meta.onlyAdminsCanAddMembers}
                onValueChange={(v) =>
                  rhemaGroupService.updateGroupPermissions({
                    churchId,
                    roomId,
                    actorUid: myUid,
                    actorName: myName,
                    roomTitle: room.meta.name,
                    roomAvatar: room.meta.avatarUrl,
                    category: room.meta.category,
                    participantUids,
                    onlyAdminsCanSend: room.meta.onlyAdminsCanSend,
                    onlyAdminsCanEditInfo: room.meta.onlyAdminsCanEditInfo,
                    onlyAdminsCanAddMembers: v,
                  })
                }
                trackColor={{ false: '#3F3F46', true: palette.accent }}
              />
            </View>
          </View>
        ) : null}

        {/* Shared Media & Docs */}
        <View
          style={[
            styles.card,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <View style={styles.mediaTabs}>
            <TouchableOpacity
              style={[
                styles.mediaTab,
                mediaTab === 'media' && { backgroundColor: palette.accent },
              ]}
              onPress={() => setMediaTab('media')}
            >
              <Text
                style={{
                  color: mediaTab === 'media' ? '#FFFFFF' : palette.textSecondary,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                Photos ({sharedMedia.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.mediaTab,
                mediaTab === 'docs' && { backgroundColor: palette.accent },
              ]}
              onPress={() => setMediaTab('docs')}
            >
              <Text
                style={{
                  color: mediaTab === 'docs' ? '#FFFFFF' : palette.textSecondary,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                Documents ({sharedDocs.length})
              </Text>
            </TouchableOpacity>
          </View>

          {mediaTab === 'media' ? (
            sharedMedia.length === 0 ? (
              <Text style={{ color: palette.textMuted, fontSize: 13 }}>No photos shared yet</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {sharedMedia.slice(0, 16).map((m, idx) => (
                  <Image key={idx} source={{ uri: m.url }} style={styles.mediaThumb} />
                ))}
              </ScrollView>
            )
          ) : sharedDocs.length === 0 ? (
            <Text style={{ color: palette.textMuted, fontSize: 13 }}>No documents shared yet</Text>
          ) : (
            sharedDocs.slice(0, 8).map((d, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.docItem}
                onPress={() =>
                  setDocViewer({
                    url: d.url,
                    name: d.fileName || 'Document',
                    mimeType: d.mimeType,
                  })
                }
              >
                <FileText size={16} color={palette.accent} />
                <Text style={{ color: palette.text, flex: 1 }} numberOfLines={1}>
                  {d.fileName || 'Document'}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Participants List */}
        <View
          style={[
            styles.card,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <View style={styles.partHeader}>
            <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>
              PARTICIPANTS ({participantContacts.length})
            </Text>
            {canAddMembers ? (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: `${palette.accent}24` }]}
                onPress={() => setAddModalOpen(true)}
              >
                <UserPlus size={14} color={palette.accent} />
                <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 12 }}>
                  Add
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {participantContacts.map((p) => {
            const isGroupAdmin = Boolean(room.admins?.[p.uid]);
            return (
              <TouchableOpacity
                key={p.uid}
                style={styles.partRow}
                onPress={() => {
                  if (p.uid !== myUid && amAdmin) {
                    setSelectedParticipant(p);
                  }
                }}
                activeOpacity={p.uid !== myUid && amAdmin ? 0.78 : 1}
              >
                <AvatarWithStatus
                  uri={p.photoUrl}
                  name={p.name}
                  size={42}
                  dotBorderColor={palette.bg}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.partName, { color: palette.text, fontFamily }]}>
                    {p.name}
                  </Text>
                  <Text style={[styles.partSub, { color: palette.textSecondary }]}>
                    {p.city || p.userType || 'Rhema Member'}
                  </Text>
                </View>
                {isGroupAdmin ? (
                  <View style={[styles.adminPill, { backgroundColor: `${palette.accent}24` }]}>
                    <Shield size={11} color={palette.accent} />
                    <Text style={[styles.adminPillTxt, { color: palette.accent }]}>
                      Group Admin
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Leave Group */}
        <TouchableOpacity
          style={[
            styles.leaveBtn,
            { backgroundColor: 'rgba(239,68,68,0.14)', borderColor: 'rgba(239,68,68,0.35)' },
          ]}
          onPress={handleLeaveGroup}
          activeOpacity={0.82}
        >
          <LogOut size={18} color={palette.danger} />
          <Text style={[styles.leaveTxt, { color: palette.danger, fontFamily }]}>
            Leave Group
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Group Info Modal */}
      <Modal
        visible={editModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditModalOpen(false)}>
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: palette.surface, borderColor: palette.glassBorder },
            ]}
          >
            <Text style={[styles.modalTitle, { color: palette.text, fontFamily }]}>
              Edit Group Details
            </Text>
            <TouchableOpacity
              style={styles.editAvatarBtn}
              onPress={async () => {
                const picked = await rhemaChatMediaService.pickImages(false);
                if (picked[0]?.uri) setEditAvatarUri(picked[0].uri);
              }}
            >
              <AvatarWithStatus
                uri={editAvatarUri}
                name={editName}
                size={68}
                isGroup
                dotBorderColor={palette.surface}
              />
              <View style={[styles.camBadge, { backgroundColor: palette.accent }]}>
                <Camera size={13} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <TextInput
              style={[
                styles.modalInput,
                { color: palette.text, borderColor: palette.glassBorder, backgroundColor: palette.inputBg },
              ]}
              placeholder="Group name"
              placeholderTextColor={palette.inputPlaceholder}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: palette.text,
                  borderColor: palette.glassBorder,
                  backgroundColor: palette.inputBg,
                  minHeight: 72,
                  textAlignVertical: 'top',
                },
              ]}
              placeholder="Group description"
              placeholderTextColor={palette.inputPlaceholder}
              value={editDesc}
              onChangeText={setEditDesc}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditModalOpen(false)} style={styles.cancelBtn}>
                <Text style={{ color: palette.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: palette.accent }]}
                onPress={handleSaveInfo}
                disabled={savingInfo}
              >
                {savingInfo ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Members Modal */}
      <Modal
        visible={addModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalOpen(false)}
      >
        <View style={styles.addModalRoot}>
          <View
            style={[
              styles.addModalSheet,
              { backgroundColor: palette.surface, borderColor: palette.glassBorder },
            ]}
          >
            <View style={styles.addHeader}>
              <Text style={[styles.modalTitle, { color: palette.text, marginBottom: 0 }]}>
                Add Rhema Members
              </Text>
              <TouchableOpacity onPress={() => setAddModalOpen(false)}>
                <X size={20} color={palette.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {nonMemberContacts.length === 0 ? (
                <Text style={{ color: palette.textMuted, paddingVertical: 20 }}>
                  All active Rhema members are already in this group.
                </Text>
              ) : (
                nonMemberContacts.map((m) => {
                  const sel = Boolean(addSelection[m.uid]);
                  return (
                    <TouchableOpacity
                      key={m.uid}
                      style={styles.partRow}
                      onPress={() =>
                        setAddSelection((prev) => ({ ...prev, [m.uid]: !prev[m.uid] }))
                      }
                    >
                      <AvatarWithStatus uri={m.photoUrl} name={m.name} size={40} />
                      <Text style={{ color: palette.text, flex: 1, marginLeft: 12, fontWeight: '600' }}>
                        {m.name}
                      </Text>
                      <View
                        style={[
                          styles.checkBox,
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
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: palette.accent, marginTop: 12, alignItems: 'center' }]}
              onPress={handleAddSelectedMembers}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Add Selected Members</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Participant Admin Action Modal */}
      <Modal
        visible={Boolean(selectedParticipant)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedParticipant(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedParticipant(null)}>
          {selectedParticipant ? (
            <View
              style={[
                styles.modalCard,
                { backgroundColor: palette.surface, borderColor: palette.glassBorder },
              ]}
            >
              <Text style={[styles.modalTitle, { color: palette.text, fontFamily }]}>
                {selectedParticipant.name}
              </Text>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  const isTargetAdmin = Boolean(room.admins?.[selectedParticipant.uid]);
                  const p = selectedParticipant;
                  setSelectedParticipant(null);
                  rhemaGroupService.setMemberAdminRole({
                    churchId,
                    roomId,
                    actorUid: myUid,
                    actorName: myName,
                    roomTitle: room.meta.name,
                    roomAvatar: room.meta.avatarUrl,
                    category: room.meta.category,
                    participantUids,
                    existingAdminUids: adminUids,
                    targetUid: p.uid,
                    targetName: p.name,
                    makeAdmin: !isTargetAdmin,
                  });
                }}
              >
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
                  {room.admins?.[selectedParticipant.uid]
                    ? 'Dismiss as Group Admin'
                    : 'Make Group Admin'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  const p = selectedParticipant;
                  setSelectedParticipant(null);
                  Alert.alert('Remove Member', `Remove ${p.name} from this group?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () =>
                        rhemaGroupService.removeMember({
                          churchId,
                          roomId,
                          actorUid: myUid,
                          actorName: myName,
                          roomTitle: room.meta.name,
                          roomAvatar: room.meta.avatarUrl,
                          category: room.meta.category,
                          existingParticipantUids: participantUids,
                          existingAdminUids: adminUids,
                          targetUid: p.uid,
                          targetName: p.name,
                        }),
                    },
                  ]);
                }}
              >
                <Text style={{ color: palette.danger, fontSize: 15, fontWeight: '600' }}>
                  Remove from Group
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      <InAppDocumentViewerModal
        visible={Boolean(docViewer)}
        doc={docViewer}
        onClose={() => setDocViewer(null)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  centerCard: { alignItems: 'center' },
  groupName: { fontWeight: '800', marginTop: 12, textAlign: 'center' },
  groupMeta: { fontSize: 13, marginTop: 4 },
  groupDesc: { fontSize: 13.5, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTxt: { fontSize: 15, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  permTxt: { fontSize: 14, fontWeight: '500', flex: 1, marginRight: 10 },
  mediaTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mediaTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },
  mediaThumb: { width: 78, height: 78, borderRadius: 12, backgroundColor: '#1E293B' },
  docItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  partHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  partRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  partName: { fontSize: 14.5, fontWeight: '700' },
  partSub: { fontSize: 12, marginTop: 1 },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  adminPillTxt: { fontSize: 11, fontWeight: '700' },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  leaveTxt: { fontSize: 15, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  editAvatarBtn: { alignSelf: 'center', position: 'relative' },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 },
  addModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  addModalSheet: { borderRadius: 24, borderWidth: 1, padding: 18, marginBottom: 10 },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionItem: { paddingVertical: 12 },
});
