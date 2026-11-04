import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  Search,
  Plus,
  X,
  Crown,
  Phone,
  ArrowUpRight,
  UserX,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Lock,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';

interface SuperAdminItem {
  id: string;
  name: string;
  phone?: string;
  role: string;
  grantedBy?: string;
  grantedByName?: string;
  updatedAt?: any;
}

interface ChurchAdminItem {
  id: string;
  name: string;
  phone?: string;
  userType: string;
  role?: string;
  email?: string;
}

export default function SuperAdminRoleManager({ searchQuery: externalQuery = '' }: { searchQuery?: string }) {
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const churchId = activeChurch?.id || 'rhema';

  const [loading, setLoading] = useState(true);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminItem[]>([]);
  const [churchAdmins, setChurchAdmins] = useState<ChurchAdminItem[]>([]);
  const [promoteModalVisible, setPromoteModalVisible] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // 1. Real-time listener for platform_admins collection
  useEffect(() => {
    const unsubscribe = firestore()
      .collection('platform_admins')
      .onSnapshot(
        (snapshot) => {
          if (snapshot) {
            const list: SuperAdminItem[] = snapshot.docs.map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                name: data.name || 'Super Admin',
                phone: data.phone || '',
                role: data.role || 'Super Admin',
                grantedBy: data.grantedBy,
                grantedByName: data.grantedByName,
                updatedAt: data.updatedAt,
              };
            });
            setSuperAdmins(list);
          }
          setLoading(false);
        },
        (error) => {
          console.error('Error listening to platform_admins:', error);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  // 2. Fetch all church admins from Rhema Church/{churchId}/members
  const loadChurchAdmins = async () => {
    try {
      const snap = await firestore()
        .collection('Rhema Church')
        .doc(churchId)
        .collection('members')
        .get();

      const admins: ChurchAdminItem[] = [];
      snap.docs.forEach((doc) => {
        const d = doc.data();
        const uType = String(d.userType || d.role || '').toLowerCase();
        // Include any member who is an Admin or Pastor
        if (
          d.isAdmin === true ||
          uType.includes('admin') ||
          uType.includes('pastor')
        ) {
          admins.push({
            id: doc.id,
            name: d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Admin',
            phone: d.phone || '',
            userType: d.userType || 'Admin',
            role: d.role || d.userType || 'Admin',
            email: d.email || '',
          });
        }
      });
      setChurchAdmins(admins);
    } catch (err) {
      console.error('Error fetching church admins:', err);
    }
  };

  useEffect(() => {
    loadChurchAdmins();
  }, [churchId]);

  // List of Super Admin IDs
  const superAdminIds = useMemo(() => new Set(superAdmins.map((sa) => sa.id)), [superAdmins]);

  // Eligible admins to promote (admins who are NOT already Super Admin)
  const eligibleAdmins = useMemo(() => {
    return churchAdmins.filter((a) => !superAdminIds.has(a.id));
  }, [churchAdmins, superAdminIds]);

  // Filtered super admins by external search query
  const filteredSuperAdmins = useMemo(() => {
    const q = externalQuery.trim().toLowerCase();
    if (!q) return superAdmins;
    return superAdmins.filter(
      (sa) =>
        sa.name.toLowerCase().includes(q) ||
        (sa.phone && sa.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    );
  }, [superAdmins, externalQuery]);

  // Filtered eligible admins in promote modal
  const filteredEligibleAdmins = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    if (!q) return eligibleAdmins;
    return eligibleAdmins.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.phone && a.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    );
  }, [eligibleAdmins, modalSearch]);

  // 3. Promote Admin to Super Admin
  const handlePromoteAdmin = (admin: ChurchAdminItem) => {
    Alert.alert(
      '👑 Promote to Super Admin',
      `Are you sure you want to promote ${admin.name} to Super Admin?\n\nThey will receive complete access to all church settings, financial records, and the Super Admin dashboard.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Promote',
          style: 'default',
          onPress: async () => {
            setProcessingId(admin.id);
            try {
              const currentUserName = member?.name || user?.displayName || 'Super Admin';
              const currentUserId = user?.uid || '';

              // 1. Add to root platform_admins collection
              await firestore()
                .collection('platform_admins')
                .doc(admin.id)
                .set(
                  {
                    uid: admin.id,
                    name: admin.name,
                    phone: admin.phone || '',
                    role: 'Super Admin',
                    superadmin: true,
                    grantedBy: currentUserId,
                    grantedByName: currentUserName,
                    grantedAt: firestore.FieldValue.serverTimestamp(),
                    updatedAt: firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );

              // 2. Update member document in Rhema Church/{churchId}/members/{admin.id}
              await firestore()
                .collection('Rhema Church')
                .doc(churchId)
                .collection('members')
                .doc(admin.id)
                .update({
                  userType: 'Super Admin',
                  role: 'Super Admin',
                  isAdmin: true,
                  isSuperAdmin: true,
                  superadmin: true,
                  updatedAt: firestore.FieldValue.serverTimestamp(),
                });

              setPromoteModalVisible(false);
              loadChurchAdmins();
              Alert.alert('✅ Access Granted', `${admin.name} is now a Super Admin with full dashboard permissions.`);
            } catch (err: any) {
              console.error('Error promoting admin:', err);
              Alert.alert('Error', err?.message || 'Failed to grant Super Admin access.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  // 4. Delete Super Admin Access (Only promoter can delete)
  const handleDeleteSuperAdmin = (admin: SuperAdminItem) => {
    if (admin.id === user?.uid) {
      Alert.alert('Notice', 'You cannot delete your own Super Admin access.');
      return;
    }

    const isPromotedByMe = admin.grantedBy === user?.uid;

    if (admin.grantedBy && !isPromotedByMe) {
      Alert.alert(
        'Permission Denied',
        `Only the Super Admin who promoted this user (${admin.grantedByName || 'the promoter'}) has the authority to delete their Super Admin access.`
      );
      return;
    }

    Alert.alert(
      '🗑️ Delete Super Admin Access',
      `Are you sure you want to delete Super Admin access for ${admin.name}?\n\nTheir Super Admin privileges will be completely removed and they will return to standard Church Admin status.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Super Admin',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(admin.id);
            try {
              // 1. Remove from platform_admins
              await firestore().collection('platform_admins').doc(admin.id).delete();

              // 2. Demote to standard Admin in Rhema Church/{churchId}/members
              await firestore()
                .collection('Rhema Church')
                .doc(churchId)
                .collection('members')
                .doc(admin.id)
                .update({
                  userType: 'Admin',
                  role: 'Admin',
                  isAdmin: true,
                  isSuperAdmin: false,
                  superadmin: false,
                  updatedAt: firestore.FieldValue.serverTimestamp(),
                });

              loadChurchAdmins();
              Alert.alert('Deleted', `Super Admin access for ${admin.name} has been deleted.`);
            } catch (err: any) {
              console.error('Error deleting super admin access:', err);
              Alert.alert('Error', err?.message || 'Failed to delete Super Admin access.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f0b429" />
        <Text style={styles.loadingTxt}>Loading Super Admins...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Action Banner */}
      <View style={styles.bannerCard}>
        <View style={styles.bannerLeft}>
          <LinearGradient colors={['#f0b429', '#b8860b']} style={styles.bannerIcon}>
            <Crown size={20} color="#1a1200" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Super Admin Access</Text>
            <Text style={styles.bannerSub}>
              {superAdmins.length} active {superAdmins.length === 1 ? 'Super Admin' : 'Super Admins'} with complete master control
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.promoteBtn}
          onPress={() => {
            setModalSearch('');
            loadChurchAdmins();
            setPromoteModalVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Plus size={16} color="#1a1200" strokeWidth={2.5} style={{ marginRight: 4 }} />
          <Text style={styles.promoteBtnTxt}>Promote Admin</Text>
        </TouchableOpacity>
      </View>

      {/* Super Admins List */}
      <FlatList
        data={filteredSuperAdmins}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Shield size={40} color="#334155" />
            <Text style={styles.emptyTitle}>No Super Admins Found</Text>
            <Text style={styles.emptySub}>No super admin matching your search criteria.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCurrentUser = item.id === user?.uid;
          const isPromotedByMe = item.grantedBy === user?.uid;
          const canDelete = !isCurrentUser && (isPromotedByMe || !item.grantedBy);
          const isProcessing = processingId === item.id;

          let roleSubtitle = 'Full privileges: Church Settings, App Admin, Care Cells';
          if (isPromotedByMe) {
            roleSubtitle = 'Promoted by you • You can delete this Super Admin';
          } else if (item.grantedByName) {
            roleSubtitle = `Promoted by ${item.grantedByName}`;
          }

          return (
            <View style={styles.adminCard}>
              <View style={styles.cardHeader}>
                <View style={styles.avatarCircle}>
                  <Crown size={20} color="#f0b429" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.adminName}>{item.name}</Text>
                    {isCurrentUser && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeTxt}>YOU</Text>
                      </View>
                    )}
                  </View>
                  {item.phone ? (
                    <View style={styles.phoneRow}>
                      <Phone size={12} color="#94a3b8" style={{ marginRight: 4 }} />
                      <Text style={styles.phoneTxt}>{item.phone}</Text>
                    </View>
                  ) : null}
                  {item.grantedByName ? (
                    <Text style={styles.grantedByTxt}>
                      Promoted by {item.grantedByName} {isPromotedByMe ? '(You)' : ''}
                    </Text>
                  ) : null}
                </View>

                {/* Role Badge */}
                <View style={styles.superBadge}>
                  <ShieldCheck size={13} color="#f0b429" style={{ marginRight: 4 }} />
                  <Text style={styles.superBadgeTxt}>Super Admin</Text>
                </View>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.cardFooter}>
                <Text style={styles.privilegeTxt}>
                  {roleSubtitle}
                </Text>
                {canDelete && (
                  <TouchableOpacity
                    style={[styles.revokeBtn, isProcessing && { opacity: 0.5 }]}
                    onPress={() => handleDeleteSuperAdmin(item)}
                    disabled={isProcessing}
                    activeOpacity={0.8}
                  >
                    {isProcessing ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <>
                        <Trash2 size={13} color="#ef4444" style={{ marginRight: 4 }} />
                        <Text style={styles.revokeBtnTxt}>Delete Super Admin</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                {!canDelete && !isCurrentUser && item.grantedByName && (
                  <View style={styles.lockedBadge}>
                    <Lock size={11} color="#64748b" style={{ marginRight: 4 }} />
                    <Text style={styles.lockedBadgeTxt}>
                      Only {item.grantedByName} can delete
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* ── Promote Admin Modal ── */}
      <Modal
        visible={promoteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPromoteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <LinearGradient colors={['#f0b429', '#b8860b']} style={styles.modalHeaderIcon}>
                  <Crown size={18} color="#1a1200" />
                </LinearGradient>
                <View>
                  <Text style={styles.modalTitle}>Promote to Super Admin</Text>
                  <Text style={styles.modalSub}>Select an existing Church Admin to promote</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setPromoteModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Modal Search */}
            <View style={styles.modalSearchBar}>
              <Search size={16} color="#64748b" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search admin name or phone..."
                placeholderTextColor="#64748b"
                value={modalSearch}
                onChangeText={setModalSearch}
              />
              {modalSearch.length > 0 && (
                <TouchableOpacity onPress={() => setModalSearch('')}>
                  <X size={14} color="#64748b" />
                </TouchableOpacity>
              )}
            </View>

            {/* Eligible Admins List */}
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filteredEligibleAdmins.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Users size={36} color="#334155" />
                  <Text style={styles.modalEmptyTitle}>No Admins Available</Text>
                  <Text style={styles.modalEmptySub}>
                    {churchAdmins.length === 0
                      ? 'No other church administrators found in the members directory.'
                      : 'All existing church administrators are already Super Admins.'}
                  </Text>
                </View>
              ) : (
                filteredEligibleAdmins.map((admin) => {
                  const isProcessing = processingId === admin.id;
                  return (
                    <View key={admin.id} style={styles.eligibleRow}>
                      <View style={styles.adminAvatarSmall}>
                        <UserCheck size={18} color="#38bdf8" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eligibleName}>{admin.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={styles.currentAdminBadge}>
                            <Text style={styles.currentAdminBadgeTxt}>{admin.userType}</Text>
                          </View>
                          {admin.phone ? (
                            <Text style={styles.eligiblePhone}>{admin.phone}</Text>
                          ) : null}
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.grantBtn, isProcessing && { opacity: 0.5 }]}
                        onPress={() => handlePromoteAdmin(admin)}
                        disabled={isProcessing}
                        activeOpacity={0.8}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color="#1a1200" />
                        ) : (
                          <>
                            <Crown size={13} color="#1a1200" style={{ marginRight: 4 }} />
                            <Text style={styles.grantBtnTxt}>Make Super Admin</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Note Footer */}
            <View style={styles.modalFooterNote}>
              <AlertTriangle size={14} color="#f59e0b" style={{ marginRight: 6 }} />
              <Text style={styles.modalFooterNoteTxt}>
                Super Admins gain immediate access to App Admin, Financials & Settings.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0f1e', minHeight: 200 },
  loadingTxt: { marginTop: 12, color: '#94a3b8', fontSize: 14 },

  bannerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '800' },
  bannerSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  promoteBtn: {
    backgroundColor: '#f0b429',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  promoteBtnTxt: { color: '#1a1200', fontSize: 13, fontWeight: '800' },

  adminCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  primaryAdminCard: {
    borderColor: '#f59e0b50',
    backgroundColor: '#0f172a',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0b42920',
    borderWidth: 1,
    borderColor: '#f0b42950',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCirclePrimary: {
    backgroundColor: '#f59e0b25',
    borderColor: '#f59e0b80',
  },
  adminName: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  phoneTxt: { color: '#94a3b8', fontSize: 13 },
  grantedByTxt: { color: '#64748b', fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  primaryBadge: {
    backgroundColor: '#f59e0b25',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f59e0b70',
  },
  primaryBadgeTxt: { color: '#fbbf24', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  youBadge: {
    backgroundColor: '#0284c725',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0284c760',
  },
  youBadgeTxt: { color: '#38bdf8', fontSize: 10, fontWeight: '800' },

  superBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0b42915',
    borderWidth: 1,
    borderColor: '#f0b42940',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  superBadgePrimary: {
    backgroundColor: '#f59e0b25',
    borderColor: '#f59e0b60',
  },
  superBadgeTxt: { color: '#f0b429', fontSize: 12, fontWeight: '800' },
  superBadgeTxtPrimary: { color: '#fbbf24', fontSize: 12, fontWeight: '800' },

  cardFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  privilegeTxt: { color: '#64748b', fontSize: 11, flex: 1 },
  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef444415',
    borderWidth: 1,
    borderColor: '#ef444440',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  revokeBtnTxt: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  lockedBadgeTxt: { color: '#94a3b8', fontSize: 11, fontWeight: '500' },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySub: { color: '#64748b', fontSize: 13, marginTop: 4, textAlign: 'center' },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    width: '100%',
    maxWidth: 520,
    padding: 20,
    borderWidth: 1,
    borderColor: '#242e50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '800' },
  modalSub: { color: '#94a3b8', fontSize: 12, marginTop: 1 },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },

  modalSearchBar: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalSearchInput: { flex: 1, color: '#f8fafc', fontSize: 14, paddingVertical: 4 },

  modalEmptyBox: { alignItems: 'center', paddingVertical: 32 },
  modalEmptyTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginTop: 10 },
  modalEmptySub: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },

  eligibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#162032',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 10,
  },
  adminAvatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284c720',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eligibleName: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  currentAdminBadge: {
    backgroundColor: '#38bdf820',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  currentAdminBadgeTxt: { color: '#38bdf8', fontSize: 10, fontWeight: '700' },
  eligiblePhone: { color: '#94a3b8', fontSize: 12 },

  grantBtn: {
    backgroundColor: '#f0b429',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  grantBtnTxt: { color: '#1a1200', fontSize: 12, fontWeight: '800' },

  modalFooterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  modalFooterNoteTxt: { color: '#f59e0b', fontSize: 11, flex: 1 },
});

