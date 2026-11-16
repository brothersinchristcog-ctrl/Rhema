import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Users, Plus, Trash2, UserPlus, Phone, Shield } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { useTheme } from '../../../context/ThemeContext';
import { Colors } from '../../../theme/Theme';
import JobCircleService from '../../../services/JobCircleService';
import { MinistryTeam, DEFAULT_MINISTRY_CATEGORIES } from '../../../types/jobCircle';

interface AdminMinistryTeamsScreenProps {
  navigation: any;
}

export default function AdminMinistryTeamsScreen({ navigation }: AdminMinistryTeamsScreenProps) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { colors, currentThemeOption } = useTheme();
  const churchId = activeChurch?.id || 'rhema';

  const theme = {
    bg: colors.bgSecondary,
    surface: colors.bgPrimary,
    text: colors.textPrimary,
    textSecondary: colors.textSecondary,
    border: colors.border,
    accent: colors.accent,
    headerGradient: currentThemeOption?.headerGradient || ['#1a2d5a', '#2c3e6b'],
  };

  const [teams, setTeams] = useState<MinistryTeam[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Team Modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCategory, setNewTeamCategory] = useState(DEFAULT_MINISTRY_CATEGORIES[0].id);
  const [newTeamLeader, setNewTeamLeader] = useState('');
  const [creating, setCreating] = useState(false);

  // Add Member to Team Modal
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<MinistryTeam | null>(null);
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    loadTeams();
  }, [churchId]);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const data = await JobCircleService.getMinistryTeams(churchId);
      setTeams(data);
    } catch (err) {
      console.error('Error loading ministry teams:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      Alert.alert('Required', 'Please enter a ministry team name.');
      return;
    }

    try {
      setCreating(true);
      const newId = await JobCircleService.createMinistryTeam(churchId, {
        churchId,
        name: newTeamName.trim(),
        categoryId: newTeamCategory,
        leaderId: user?.uid || 'admin',
        leaderName: newTeamLeader.trim() || member?.name || user?.displayName || 'Ministry Leader',
        memberIds: [],
        members: [],
      });

      setTeams(prev => [
        ...prev,
        {
          id: newId,
          churchId,
          name: newTeamName.trim(),
          categoryId: newTeamCategory,
          leaderId: user?.uid || 'admin',
          leaderName: newTeamLeader.trim() || member?.name || user?.displayName || 'Ministry Leader',
          memberIds: [],
          members: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      setCreateModalVisible(false);
      setNewTeamName('');
      setNewTeamLeader('');
      Alert.alert('Created', 'Ministry team created successfully.');
    } catch (err: any) {
      console.error('Create team error:', err);
      Alert.alert('Error', err.message || 'Could not create team.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenAddMember = (team: MinistryTeam) => {
    setSelectedTeam(team);
    setMemberName('');
    setMemberRole('');
    setMemberPhone('');
    setAddMemberModalVisible(true);
  };

  const handleAddMemberToTeam = async () => {
    if (!selectedTeam || !memberName.trim() || !memberRole.trim()) {
      Alert.alert('Required', 'Please enter candidate name and role in team.');
      return;
    }

    try {
      setAddingMember(true);
      const generatedMemberId = `m_${Date.now()}`;
      await JobCircleService.addMemberToTeam(churchId, selectedTeam.id, {
        memberId: generatedMemberId,
        memberName: memberName.trim(),
        roleInTeam: memberRole.trim(),
        phone: memberPhone.trim(),
      });

      setTeams(prev =>
        prev.map(t =>
          t.id === selectedTeam.id
            ? {
                ...t,
                memberIds: [...t.memberIds, generatedMemberId],
                members: [
                  ...t.members,
                  {
                    memberId: generatedMemberId,
                    memberName: memberName.trim(),
                    roleInTeam: memberRole.trim(),
                    phone: memberPhone.trim(),
                    joinedAt: new Date().toISOString(),
                  },
                ],
              }
            : t
        )
      );

      setAddMemberModalVisible(false);
      Alert.alert('Added', `${memberName} added to ${selectedTeam.name}.`);
    } catch (err: any) {
      console.error('Add member error:', err);
      Alert.alert('Error', err.message || 'Could not add member.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (teamId: string, memberId: string, name: string) => {
    Alert.alert('Remove Member', `Remove ${name} from this ministry team?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await JobCircleService.removeMemberFromTeam(churchId, teamId, memberId);
            setTeams(prev =>
              prev.map(t =>
                t.id === teamId
                  ? {
                      ...t,
                      memberIds: t.memberIds.filter(id => id !== memberId),
                      members: t.members.filter(m => m.memberId !== memberId),
                    }
                  : t
              )
            );
          } catch (err) {
            console.error('Remove member error:', err);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <LinearGradient
        colors={theme.headerGradient || ['#1a2d5a', '#2c3e6b']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <ArrowLeft size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ministry Teams & Rosters</Text>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setCreateModalVisible(true)}>
            <Plus size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={theme.accent || Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>Active Church Ministry Teams</Text>
            <TouchableOpacity
              style={[styles.addTeamBtn, { backgroundColor: theme.accent || Colors.primary }]}
              onPress={() => setCreateModalVisible(true)}
            >
              <Plus size={15} color="#fff" style={{ marginRight: 4 }} />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New Team</Text>
            </TouchableOpacity>
          </View>

          {teams.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Users size={32} color={theme.textSecondary} style={{ marginBottom: 8 }} />
              <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
                No ministry teams created yet. Tap "New Team" to organize worship bands, media crew, or Sunday school teachers.
              </Text>
            </View>
          ) : (
            teams.map(team => (
              <View key={team.id} style={[styles.teamCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.teamHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.teamTitle, { color: theme.text }]}>{team.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
                      <Shield size={13} color={Colors.warning} />
                      <Text style={[styles.leaderName, { color: theme.textSecondary }]}>
                        Leader: {team.leaderName}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.addMemberBtn, { borderColor: theme.border }]}
                    onPress={() => handleOpenAddMember(team)}
                  >
                    <UserPlus size={14} color={theme.accent || Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={{ color: theme.accent || Colors.primary, fontSize: 12, fontWeight: '600' }}>
                      Assign
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Team Roster Members */}
                <View style={styles.rosterSection}>
                  <Text style={[styles.rosterLabel, { color: theme.textSecondary }]}>
                    Team Members ({team.members?.length || 0})
                  </Text>
                  {(!team.members || team.members.length === 0) ? (
                    <Text style={{ fontSize: 12, color: theme.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
                      No members assigned yet.
                    </Text>
                  ) : (
                    team.members.map((m, idx) => (
                      <View key={m.memberId || idx} style={[styles.memberRow, { borderColor: theme.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.memberName, { color: theme.text }]}>{m.memberName}</Text>
                          <Text style={[styles.memberRole, { color: theme.accent || Colors.primary }]}>
                            {m.roleInTeam}
                          </Text>
                        </View>
                        {m.phone ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, gap: 4 }}>
                            <Phone size={12} color={theme.textSecondary} />
                            <Text style={{ fontSize: 11, color: theme.textSecondary }}>{m.phone}</Text>
                          </View>
                        ) : null}
                        <TouchableOpacity onPress={() => handleRemoveMember(team.id, m.memberId, m.memberName)}>
                          <Trash2 size={16} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Create Team Modal */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Create Ministry Team</Text>
            <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 12 }]}>Team Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Sunday Worship Band, Tech & Streaming Crew"
              placeholderTextColor={theme.textSecondary}
              value={newTeamName}
              onChangeText={setNewTeamName}
            />

            <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 12 }]}>Assigned Team Leader</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              placeholder="Leader Name (e.g. Pastor David, Bro. Paul)"
              placeholderTextColor={theme.textSecondary}
              value={newTeamLeader}
              onChangeText={setNewTeamLeader}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setCreateModalVisible(false)}
                disabled={creating}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent || Colors.primary }]}
                onPress={handleCreateTeam}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Create Team</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal visible={addMemberModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Assign to {selectedTeam?.name}</Text>
            
            <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 12 }]}>Member Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. John Wesley"
              placeholderTextColor={theme.textSecondary}
              value={memberName}
              onChangeText={setMemberName}
            />

            <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 12 }]}>Role in Team *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Keyboardist, Sound Mixer, Teacher"
              placeholderTextColor={theme.textSecondary}
              value={memberRole}
              onChangeText={setMemberRole}
            />

            <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 12 }]}>Phone Number (Optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. 9876543210"
              placeholderTextColor={theme.textSecondary}
              value={memberPhone}
              onChangeText={setMemberPhone}
              keyboardType="phone-pad"
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setAddMemberModalVisible(false)}
                disabled={addingMember}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent || Colors.primary }]}
                onPress={handleAddMemberToTeam}
                disabled={addingMember}
              >
                {addingMember ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Assign Member</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  iconBtn: { padding: 8 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },
  sectionHeading: { fontSize: 17, fontWeight: '700' },
  addTeamBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  emptyBox: { padding: 30, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  teamCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  teamTitle: { fontSize: 17, fontWeight: '700' },
  leaderName: { fontSize: 12, fontWeight: '500' },
  addMemberBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  rosterSection: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  rosterLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  memberName: { fontSize: 14, fontWeight: '600' },
  memberRole: { fontSize: 12, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
