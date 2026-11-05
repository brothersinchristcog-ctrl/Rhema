import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import {
  Search,
  Plus,
  MapPin,
  Calendar,
  Clock,
  Users,
  Edit2,
  Archive,
  CheckCircle,
  XCircle,
  MoreVertical,
  User,
  Shield,
  ArrowRight,
} from 'lucide-react-native';
import CareCellService from '../../../../services/CareCellService';
import { useAuth } from '../../../../context/AuthContext';
import GrantAdminAccessModal from '../components/GrantAdminAccessModal';
import { CareCell, CareCellStatus } from '../../../../types/CareCellTypes';

const { width } = Dimensions.get('window');

interface CareCellsManageTabProps {
  cells: CareCell[];
  onRefreshCells: () => void;
  onOpenCreateCell: () => void;
  onEditCell: (cell: CareCell) => void;
  onManageMembers: (cell: CareCell) => void;
  onViewMeetings: (cell: CareCell) => void;
}

export default function CareCellsManageTab({
  cells,
  onRefreshCells,
  onOpenCreateCell,
  onEditCell,
  onManageMembers,
  onViewMeetings,
}: CareCellsManageTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive' | 'Archived'>('All');

  const { isPlatformSuperAdmin } = useAuth();
  const [grantAccessCell, setGrantAccessCell] = useState<CareCell | null>(null);
  const [grantAccessModalVisible, setGrantAccessModalVisible] = useState(false);


  // Status counts
  const statusCounts = useMemo(() => {
    return {
      All: cells.length,
      Active: cells.filter(c => c.status === 'Active').length,
      Inactive: cells.filter(c => c.status === 'Inactive').length,
      Archived: cells.filter(c => c.status === 'Archived').length,
    };
  }, [cells]);

  // Filtered cells list
  const filteredCells = useMemo(() => {
    return cells.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = (c.cellCode || '').toLowerCase().includes(q);
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchLeader = (c.leaderName || '').toLowerCase().includes(q);
        const matchLoc = (c.location || '').toLowerCase().includes(q);
        return matchCode || matchName || matchLeader || matchLoc;
      }
      return true;
    });
  }, [cells, searchQuery, statusFilter]);

  const handleToggleStatus = (cell: CareCell) => {
    const nextStatus: CareCellStatus = cell.status === 'Active' ? 'Inactive' : 'Active';
    Alert.alert(
      `${nextStatus === 'Active' ? 'Activate' : 'Deactivate'} Care Cell`,
      `Are you sure you want to mark ${cell.cellCode} (${cell.name}) as ${nextStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Mark ${nextStatus}`,
          onPress: async () => {
            try {
              const churchId = await CareCellService.getChurchId();
              await CareCellService.updateCareCell(churchId, cell.id, { status: nextStatus });
              onRefreshCells();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update status.');
            }
          },
        },
      ]
    );
  };

  const handleArchiveCell = (cell: CareCell) => {
    Alert.alert(
      'Archive Care Cell',
      `Archiving ${cell.cellCode} will hide it from the active roster. Historical attendance and meeting records will be safely preserved.\n\nDo you want to archive this cell?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive Cell',
          style: 'destructive',
          onPress: async () => {
            try {
              const churchId = await CareCellService.getChurchId();
              await CareCellService.archiveCareCell(churchId, cell.id);
              onRefreshCells();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to archive cell.');
            }
          },
        },
      ]
    );
  };

  const renderCellCard = ({ item }: { item: CareCell }) => {
    const isActive = item.status === 'Active';
    const isArchived = item.status === 'Archived';

    return (
      <View style={[styles.cellCard, !isActive && styles.cellCardInactive]}>
        {/* Top Header Row */}
        <View style={styles.cardHeader}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeTxt}>{item.cellCode || 'Rhema_CareCell'}</Text>
          </View>
          <View
            style={[
              styles.statusChip,
              isActive && styles.statusActive,
              !isActive && !isArchived && styles.statusInactive,
              isArchived && styles.statusArchived,
            ]}
          >
            <Text
              style={[
                styles.statusChipTxt,
                isActive && styles.statusActiveTxt,
                !isActive && !isArchived && styles.statusInactiveTxt,
                isArchived && styles.statusArchivedTxt,
              ]}
            >
              {item.status}
            </Text>
          </View>
        </View>

        {/* Name & Description */}
        <Text style={styles.cellName}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.cellDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        {/* Leader Info Row */}
        <View style={styles.leaderRow}>
          {item.leaderPhoto ? (
            <Image source={{ uri: item.leaderPhoto }} style={styles.leaderAvatar} />
          ) : (
            <View style={styles.leaderAvatarFallback}>
              <User size={16} color="#1A2D5A" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.leaderName}>{item.leaderName || 'Unassigned Leader'}</Text>
              <View style={styles.leaderRoleBadge}>
                <Text style={styles.leaderRoleBadgeTxt}>Leader</Text>
              </View>
            </View>
            {item.leaderPhone ? <Text style={styles.leaderPhone}>{item.leaderPhone}</Text> : null}
          </View>
        </View>

        {/* Assistant Leader Row (if present) */}
        {item.assistantLeaderName ? (
          <View style={styles.asstLeaderRow}>
            <Text style={styles.asstLeaderTxt}>
              Assistant: <Text style={{ fontWeight: '700', color: '#1A2D5A' }}>{item.assistantLeaderName}</Text>
            </Text>
          </View>
        ) : null}

        {/* Schedule & Venue Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={13} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={styles.metaTxt}>{item.meetingDay || 'Friday'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Clock size={13} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={styles.metaTxt}>{item.meetingTime || '19:00'}</Text>
          </View>
          {item.location ? (
            <View style={[styles.metaItem, { flex: 1 }]}>
              <MapPin size={13} color="#64748B" style={{ marginRight: 4 }} />
              <Text style={styles.metaTxt} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
        </View>

        {isPlatformSuperAdmin && item.assignedAdminIds && item.assignedAdminIds.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 }}>
            <Shield size={12} color="#4338CA" style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 11.5, color: '#4338CA', fontWeight: '600' }}>
              Assigned to {item.assignedAdminIds.length} Admin(s)
            </Text>
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Action Buttons Row */}
        <View style={styles.cardActionsRow}>
          {/* Manage Members */}
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => onManageMembers(item)}
            activeOpacity={0.8}
          >
            <Users size={14} color="#1A2D5A" style={{ marginRight: 5 }} />
            <Text style={styles.cardActionBtnTxt}>Members</Text>
          </TouchableOpacity>

          {/* View Meetings */}
          <TouchableOpacity
            style={styles.cardActionBtn}
            onPress={() => onViewMeetings(item)}
            activeOpacity={0.8}
          >
            <Calendar size={14} color="#1A2D5A" style={{ marginRight: 5 }} />
            <Text style={styles.cardActionBtnTxt}>Meetings</Text>
          </TouchableOpacity>

          {/* Grant Admin Access (Super Admin Only) */}
          {isPlatformSuperAdmin && (
            <TouchableOpacity
              style={[styles.cardActionBtn, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
              onPress={() => {
                setGrantAccessCell(item);
                setGrantAccessModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Shield size={14} color="#1E3A8A" style={{ marginRight: 4 }} />
              <Text style={[styles.cardActionBtnTxt, { color: '#1E3A8A', fontWeight: '700' }]}>
                Access
              </Text>
            </TouchableOpacity>
          )}

          {/* Edit (Super Admin or Assigned Admin) */}
          <TouchableOpacity
            style={styles.cardIconBtn}
            onPress={() => onEditCell(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Edit2 size={16} color="#64748B" />
          </TouchableOpacity>

          {/* Toggle Active / Inactive (Super Admin Only) */}
          {isPlatformSuperAdmin && (
            <TouchableOpacity
              style={styles.cardIconBtn}
              onPress={() => handleToggleStatus(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isActive ? <XCircle size={16} color="#D97706" /> : <CheckCircle size={16} color="#059669" />}
            </TouchableOpacity>
          )}

          {/* Archive (Super Admin Only) */}
          {isPlatformSuperAdmin && !isArchived && (
            <TouchableOpacity
              style={styles.cardIconBtn}
              onPress={() => handleArchiveCell(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Archive size={16} color="#DC2626" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Clean Full-Width Search Bar */}
      <View style={styles.topBar}>
        <View style={styles.searchWrap}>
          <Search size={16} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search care cells by code, name, leader, location..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchTxt}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Clean Status Filter Chips */}
      <View style={styles.statusFilterRow}>
        {(['All', 'Active', 'Inactive', 'Archived'] as const).map((st) => (
          <TouchableOpacity
            key={st}
            style={[styles.statusFilterChip, statusFilter === st && styles.statusFilterChipActive]}
            onPress={() => setStatusFilter(st)}
            activeOpacity={0.75}
          >
            <Text style={[styles.statusFilterChipTxt, statusFilter === st && styles.statusFilterChipTxtActive]}>
              {st} ({statusCounts[st]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filteredCells}
        keyExtractor={(item) => item.id}
        renderItem={renderCellCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Users size={44} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No Care Cells Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No cells match "${searchQuery}".`
                : 'No care cells found in this category.'}
            </Text>
          </View>
        }
      />
      <GrantAdminAccessModal
        visible={grantAccessModalVisible}
        cell={grantAccessCell}
        onClose={() => {
          setGrantAccessModalVisible(false);
          setGrantAccessCell(null);
        }}
        onSaved={onRefreshCells}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  clearSearchBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchTxt: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
    marginTop: -2,
  },
  statusFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  statusFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusFilterChipActive: {
    backgroundColor: '#1A2D5A',
    borderColor: '#1A2D5A',
  },
  statusFilterChipTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  statusFilterChipTxtActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  cellCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cellCardInactive: {
    opacity: 0.85,
    backgroundColor: '#FAF9F6',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  codeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  codeBadgeTxt: {
    fontFamily: 'monospace',
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1A2D5A',
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusChipTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusActive: {
    backgroundColor: '#ECFDF5',
  },
  statusActiveTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  statusInactive: {
    backgroundColor: '#FFFBEB',
  },
  statusInactiveTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  statusArchived: {
    backgroundColor: '#FEE2E2',
  },
  statusArchivedTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  cellName: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cellDesc: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  leaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  leaderAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  leaderName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  leaderRoleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  leaderRoleBadgeTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  leaderPhone: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  asstLeaderRow: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
  asstLeaderTxt: {
    fontSize: 12,
    color: '#64748B',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaTxt: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    borderRadius: 10,
  },
  cardActionBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  cardIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
});
