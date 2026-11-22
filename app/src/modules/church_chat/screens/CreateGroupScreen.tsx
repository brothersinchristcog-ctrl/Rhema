import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
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
import { ArrowLeft, Camera, Check, Lock, Search } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { RHEMA_GROUP_PRESETS } from '../constants/chatTheme';
import { useChatTheme } from '../constants/useChatTheme';
import { isRhemaAdminRole, rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { rhemaGroupService } from '../services/rhemaGroupService';
import { rhemaChatMediaService } from '../services/rhemaChatMediaService';
import { ChurchMemberContact } from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';

export default function CreateGroupScreen({ navigation }: any) {
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
    'Admin';
  const isChurchAdmin = isRhemaAdminRole(member);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'team' | 'group'>('team');
  const [onlyAdminsCanSend, setOnlyAdminsCanSend] = useState(false);
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);

  const [members, setMembers] = useState<ChurchMemberContact[]>([]);
  const [selectedUids, setSelectedUids] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    rhemaDirectoryService
      .getChurchMembers(churchId, myUid)
      .then(setMembers)
      .finally(() => setLoadingMembers(false));
  }, [churchId, myUid]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.city || '').toLowerCase().includes(q) ||
        (m.memberCode || '').toLowerCase().includes(q)
    );
  }, [members, search]);

  const selectedCount = Object.values(selectedUids).filter(Boolean).length;
  const topPad = Math.max(insets.top + 6, Platform.OS === 'ios' ? 50 : 32);

  if (!isChurchAdmin) {
    return (
      <LinearGradient colors={palette.bgGradient} style={styles.lockedRoot}>
        <Lock size={40} color={palette.danger} />
        <Text style={[styles.lockedTitle, { color: palette.text, fontFamily }]}>
          Admin Access Only
        </Text>
        <Text style={[styles.lockedSub, { color: palette.textSecondary, fontFamily }]}>
          Only Rhema Church Administrators can create new church groups.
        </Text>
        <TouchableOpacity
          style={[styles.backPill, { backgroundColor: palette.accent }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Go Back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const handlePickAvatar = async () => {
    const picked = await rhemaChatMediaService.pickImages(false);
    if (picked[0]?.uri) {
      setAvatarLocalUri(picked[0].uri);
    }
  };

  const handleCreate = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      Alert.alert('Group Name Required', 'Please enter a name for this church group.');
      return;
    }
    const pickedMemberUids = Object.keys(selectedUids).filter((u) => selectedUids[u]);

    setCreating(true);
    try {
      const { roomId } = await rhemaGroupService.createGroup({
        churchId,
        name: cleanName,
        description,
        category,
        memberUids: pickedMemberUids,
        onlyAdminsCanSend,
      });

      let uploadedAvatar: string | null = null;
      if (avatarLocalUri) {
        uploadedAvatar = await rhemaChatMediaService
          .uploadGroupAvatar(churchId, roomId, avatarLocalUri)
          .catch(() => null);
        if (uploadedAvatar) {
          await rhemaGroupService
            .updateGroupInfo({
              churchId,
              roomId,
              actorUid: myUid,
              actorName: myName,
              name: cleanName,
              description,
              avatarUrl: uploadedAvatar,
              category,
              participantUids: Array.from(new Set([myUid, ...pickedMemberUids])),
            })
            .catch(() => {});
        }
      }

      navigation.replace('RhemaChatRoom', {
        roomId,
        roomType: 'group',
        title: cleanName,
        avatarUrl: uploadedAvatar,
      });
    } catch (err: any) {
      Alert.alert('Group Creation Failed', err?.message || 'Unable to create group right now.');
    } finally {
      setCreating(false);
    }
  };

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
            styles.headerTitle,
            { color: palette.text, fontFamily, fontSize: scaleFont(19) },
          ]}
        >
          New Church Group
        </Text>
        <TouchableOpacity
          style={[
            styles.createBtn,
            { backgroundColor: palette.accent, opacity: creating ? 0.65 : 1 },
          ]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.createBtnTxt}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      >
        {/* Group Avatar & Name */}
        <View
          style={[
            styles.card,
            { backgroundColor: palette.glassBg, borderColor: palette.glassBorder },
          ]}
        >
          <View style={styles.identityRow}>
            <TouchableOpacity
              style={[
                styles.avatarPicker,
                { backgroundColor: palette.inputBg, borderColor: palette.glassBorder },
              ]}
              onPress={handlePickAvatar}
            >
              {avatarLocalUri ? (
                <Image source={{ uri: avatarLocalUri }} style={styles.avatarImg} />
              ) : (
                <Camera size={22} color={palette.textSecondary} />
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <TextInput
                style={[
                  styles.nameInput,
                  { color: palette.text, borderBottomColor: palette.glassBorder, fontFamily },
                ]}
                placeholder="Group Name (e.g., Worship Team)"
                placeholderTextColor={palette.inputPlaceholder}
                value={name}
                onChangeText={setName}
                maxLength={60}
              />
              <TextInput
                style={[styles.descInput, { color: palette.textSecondary, fontFamily }]}
                placeholder="Group description or purpose..."
                placeholderTextColor={palette.inputPlaceholder}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={250}
              />
            </View>
          </View>

          {/* Category Toggle */}
          <View style={styles.catRow}>
            {(['team', 'group'] as const).map((cat) => {
              const active = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: active ? palette.accent : palette.filterInactiveBg,
                      borderColor: active ? palette.accent : palette.glassBorder,
                    },
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={{
                      color: active ? '#FFFFFF' : palette.text,
                      fontWeight: '700',
                      fontSize: 13,
                    }}
                  >
                    {cat === 'team' ? 'Church Team' : 'Fellowship Group'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.switchTitle, { color: palette.text, fontFamily }]}>
                Only Admins Can Send Messages
              </Text>
              <Text style={[styles.switchSub, { color: palette.textSecondary }]}>
                Great for announcement-only ministry channels
              </Text>
            </View>
            <Switch
              value={onlyAdminsCanSend}
              onValueChange={setOnlyAdminsCanSend}
              trackColor={{ false: '#3F3F46', true: palette.accent }}
            />
          </View>
        </View>

        {/* Quick Team Presets */}
        <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>
          QUICK CHURCH TEAM TEMPLATES
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetsRow}
        >
          {RHEMA_GROUP_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.name}
              style={[
                styles.presetChip,
                {
                  backgroundColor:
                    name === preset.name ? `${palette.accent}26` : palette.filterInactiveBg,
                  borderColor: name === preset.name ? palette.accent : palette.glassBorder,
                },
              ]}
              onPress={() => {
                setName(preset.name);
                setDescription(preset.description);
                setCategory('team');
              }}
            >
              <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13 }}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Add Participants */}
        <Text style={[styles.sectionLabel, { color: palette.textSecondary, marginTop: 14 }]}>
          ADD MEMBERS ({selectedCount} SELECTED)
        </Text>

        <View
          style={[
            styles.searchPill,
            { backgroundColor: palette.inputBg, borderColor: palette.glassBorder },
          ]}
        >
          <Search size={16} color={palette.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: palette.text, fontFamily }]}
            placeholder="Search Rhema members..."
            placeholderTextColor={palette.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loadingMembers ? (
          <ActivityIndicator size="small" color={palette.accent} style={{ marginTop: 20 }} />
        ) : (
          filteredMembers.map((m) => {
            const selected = Boolean(selectedUids[m.uid]);
            return (
              <TouchableOpacity
                key={m.uid}
                style={styles.memberRow}
                onPress={() =>
                  setSelectedUids((prev) => ({ ...prev, [m.uid]: !prev[m.uid] }))
                }
                activeOpacity={0.78}
              >
                <AvatarWithStatus
                  uri={m.photoUrl}
                  name={m.name}
                  size={44}
                  dotBorderColor={palette.bg}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.memberName, { color: palette.text, fontFamily }]}>
                    {m.name}
                  </Text>
                  <Text style={[styles.memberSub, { color: palette.textSecondary }]}>
                    {m.city || m.memberCode || 'Rhema Member'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.checkBox,
                    {
                      borderColor: selected ? palette.accent : palette.glassBorder,
                      backgroundColor: selected ? palette.accent : 'transparent',
                    },
                  ]}
                >
                  {selected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  lockedRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  lockedTitle: { fontSize: 20, fontWeight: '800' },
  lockedSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  backPill: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 20, marginTop: 8 },
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
  headerTitle: { fontWeight: '800' },
  createBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    minWidth: 74,
    alignItems: 'center',
  },
  createBtnTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarPicker: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 62, height: 62 },
  nameInput: {
    fontSize: 16,
    fontWeight: '700',
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  descInput: {
    fontSize: 13.5,
    paddingTop: 8,
    minHeight: 40,
  },
  catRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  catChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  switchTitle: { fontSize: 14, fontWeight: '600' },
  switchSub: { fontSize: 12, marginTop: 2 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  presetsRow: { gap: 8, paddingBottom: 6 },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 42,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },
  memberName: { fontSize: 14.5, fontWeight: '700' },
  memberSub: { fontSize: 12, marginTop: 2 },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
