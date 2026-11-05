import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import {
  Home,
  Plus,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Sparkles,
  Building2,
  Check,
  Trash2,
  Ban,
  Share2,
} from 'lucide-react-native';
import CareCellService from '../../../../services/CareCellService';
import { formatDateDisplay } from '../../../../utils/DateUtils';
import { useAuth } from '../../../../context/AuthContext';
import { CareCell, CareCellVisit, VisitStatus } from '../../../../types/CareCellTypes';
import CareCellVisitModal from '../components/CareCellVisitModal';
import CareCellVisitResponsesModal from '../components/CareCellVisitResponsesModal';

const { width } = Dimensions.get('window');

interface CareCellVisitsTabProps {
  cells: CareCell[];
  selectedCellId?: string;
  onSelectCellId?: (id: string) => void;
  churchId?: string;
}

export default function CareCellVisitsTab({
  cells,
  selectedCellId,
  onSelectCellId,
  churchId,
}: CareCellVisitsTabProps) {
  const { user, member, isPlatformSuperAdmin } = useAuth();
  const [activeCellId, setActiveCellId] = useState<string>(selectedCellId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Scheduled' | 'Completed' | 'Cancelled'>('ALL');
  const [visits, setVisits] = useState<CareCellVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedVisitForResponses, setSelectedVisitForResponses] = useState<CareCellVisit | null>(null);

  const loadVisits = useCallback(async () => {
    try {
      const activeChurchId = churchId || (await CareCellService.getChurchId());
      const list = await CareCellService.getVisits(
        activeChurchId,
        activeCellId === 'ALL' ? undefined : activeCellId,
        statusFilter === 'ALL' ? undefined : statusFilter
      );
      setVisits(list);

      // Refresh selected visit modal if open
      if (selectedVisitForResponses) {
        const fresh = list.find((v) => v.id === selectedVisitForResponses.id);
        if (fresh) setSelectedVisitForResponses(fresh);
      }
    } catch (e) {
      console.error('Error loading Care Cell visits:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [churchId, activeCellId, statusFilter, selectedVisitForResponses?.id]);

  useEffect(() => {
    setLoading(true);
    loadVisits();
  }, [loadVisits]);

  const onRefresh = () => {
    setRefreshing(true);
    loadVisits();
  };

  const handleCellSelect = (id: string) => {
    setActiveCellId(id);
    onSelectCellId?.(id);
  };

  const handleStatusChange = async (visit: CareCellVisit, newStatus: VisitStatus) => {
    Alert.alert(
      `Mark as ${newStatus}`,
      `Are you sure you want to change the status of "${visit.title}" to ${newStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const activeChurchId = churchId || (await CareCellService.getChurchId());
              await CareCellService.updateVisitStatus(activeChurchId, visit.id, newStatus);
              loadVisits();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update visit status.');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (visit: CareCellVisit) => {
    Alert.alert(
      'Delete Visit Notification',
      `Are you sure you want to delete "${visit.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const activeChurchId = churchId || (await CareCellService.getChurchId());
              await CareCellService.deleteVisit(activeChurchId, visit.id);
              loadVisits();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete visit.');
            }
          },
        },
      ]
    );
  };

  // High-level metrics
  const metrics = useMemo(() => {
    const totalVisits = visits.length;
    let totalAccepted = 0;
    let totalPending = 0;
    visits.forEach((v) => {
      totalAccepted += v.acceptedCount || 0;
      totalPending += v.pendingCount || 0;
    });
    return { totalVisits, totalAccepted, totalPending };
  }, [visits]);

  return (
    <View style={styles.container}>
      {/* Top Filter & Actions Row */}
      <View style={styles.topBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cellFilterScroll}>
          <TouchableOpacity
            style={[styles.cellChip, activeCellId === 'ALL' && styles.cellChipActive]}
            onPress={() => handleCellSelect('ALL')}
            activeOpacity={0.8}
          >
            <Text style={[styles.cellChipTxt, activeCellId === 'ALL' && styles.cellChipTxtActive]}>
              All Cells ({cells.length})
            </Text>
          </TouchableOpacity>

          {cells.map((c) => {
            const isSel = c.id === activeCellId;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.cellChip, isSel && styles.cellChipActive]}
                onPress={() => handleCellSelect(c.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cellChipTxt, isSel && styles.cellChipTxtActive]}>
                  {c.cellCode}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* KPI Stats & Schedule Visit Action */}
      <View style={styles.statsActionRow}>
        <View style={styles.kpiPillGroup}>
          <View style={styles.kpiPill}>
            <Text style={styles.kpiPillVal}>{metrics.totalVisits}</Text>
            <Text style={styles.kpiPillLbl}>Visits</Text>
          </View>
          <View style={[styles.kpiPill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
            <CheckCircle2 size={12} color="#059669" style={{ marginRight: 3 }} />
            <Text style={[styles.kpiPillVal, { color: '#059669' }]}>{metrics.totalAccepted}</Text>
            <Text style={[styles.kpiPillLbl, { color: '#065F46' }]}>Accepted</Text>
          </View>
          <View style={[styles.kpiPill, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <Clock size={12} color="#D97706" style={{ marginRight: 3 }} />
            <Text style={[styles.kpiPillVal, { color: '#D97706' }]}>{metrics.totalPending}</Text>
            <Text style={[styles.kpiPillLbl, { color: '#92400E' }]}>Pending</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.scheduleVisitBtn}
          onPress={() => setCreateModalVisible(true)}
          activeOpacity={0.85}
        >
          <Plus size={15} color="#FFFFFF" strokeWidth={2.5} style={{ marginRight: 4 }} />
          <Text style={styles.scheduleVisitBtnTxt}>Schedule Visit</Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter Tabs */}
      <View style={styles.statusTabsRow}>
        {(['ALL', 'Scheduled', 'Completed', 'Cancelled'] as const).map((st) => {
          const isActive = statusFilter === st;
          return (
            <TouchableOpacity
              key={st}
              style={[styles.statusTabBtn, isActive && styles.statusTabBtnActive]}
              onPress={() => setStatusFilter(st)}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusTabBtnTxt, isActive && styles.statusTabBtnTxtActive]}>
                {st}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Visits List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#1A2D5A" />
          <Text style={styles.loadingTxt}>Loading Care Cell visits...</Text>
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1A2D5A']} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Home size={36} color="#1A2D5A" strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>No Visit Notifications Found</Text>
              <Text style={styles.emptySubtitle}>
                Schedule a pastoral or fellowship visit to send instant in-app & push notifications to all assigned members with Accept & Decline confirmation.
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setCreateModalVisible(true)}
                activeOpacity={0.85}
              >
                <Plus size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnTxt}>Schedule First Visit</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const isCompleted = item.status === 'Completed';
            const isCancelled = item.status === 'Cancelled';
            const isScheduled = item.status === 'Scheduled' || !item.status;

            const total = item.totalMembersCount || Object.keys(item.responses || {}).length || 0;
            const accepted = item.acceptedCount || 0;
            const declined = item.declinedCount || 0;
            const pending = item.pendingCount !== undefined ? item.pendingCount : Math.max(0, total - accepted - declined);
            const acceptRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

            return (
              <View style={styles.visitCard}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={styles.cellBadgeRow}>
                      <View style={styles.cellBadge}>
                        <Building2 size={11} color="#1A2D5A" style={{ marginRight: 4 }} />
                        <Text style={styles.cellBadgeTxt}>{item.cellCode || item.cellName}</Text>
                      </View>
                      <Text style={styles.cellSubName} numberOfLines={1}>
                        {item.cellName}
                      </Text>
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                  </View>

                  {/* Status Badge */}
                  <View
                    style={[
                      styles.statusPill,
                      isCompleted && styles.statusPillCompleted,
                      isCancelled && styles.statusPillCancelled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillTxt,
                        isCompleted && styles.statusPillTxtCompleted,
                        isCancelled && styles.statusPillTxtCancelled,
                      ]}
                    >
                      {item.status || 'Scheduled'}
                    </Text>
                  </View>
                </View>

                {/* Date & Time and Visitors */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Calendar size={13} color="#64748B" style={{ marginRight: 5 }} />
                    <Text style={styles.detailTxt}>{formatDateDisplay(item.visitDate)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Clock size={13} color="#64748B" style={{ marginRight: 5 }} />
                    <Text style={styles.detailTxt}>{item.visitTime}</Text>
                  </View>
                </View>

                {item.visitors ? (
                  <View style={styles.visitorsRow}>
                    <Users size={13} color="#1A2D5A" style={{ marginRight: 6 }} />
                    <Text style={styles.visitorsTxt}>Visiting: {item.visitors}</Text>
                  </View>
                ) : null}

                {item.purpose ? (
                  <Text style={styles.purposeTxt} numberOfLines={2}>
                    "{item.purpose}"
                  </Text>
                ) : null}

                {/* Live Member Responses Summary Bar */}
                <View style={styles.responseSummaryBox}>
                  <View style={styles.responseCountsRow}>
                    <View style={styles.responseCountItem}>
                      <Text style={styles.responseValAccepted}>{accepted}</Text>
                      <Text style={styles.responseLbl}>Accepted</Text>
                    </View>
                    <View style={styles.responseCountItem}>
                      <Text style={styles.responseValDeclined}>{declined}</Text>
                      <Text style={styles.responseLbl}>Declined</Text>
                    </View>
                    <View style={styles.responseCountItem}>
                      <Text style={styles.responseValPending}>{pending}</Text>
                      <Text style={styles.responseLbl}>Pending</Text>
                    </View>
                    <View style={styles.responseCountItem}>
                      <Text style={styles.responseValTotal}>{total}</Text>
                      <Text style={styles.responseLbl}>Total</Text>
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarAccepted, { width: `${acceptRate}%` }]} />
                  </View>
                </View>

                {/* Bottom Card Actions */}
                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    style={styles.viewResponsesBtn}
                    onPress={() => setSelectedVisitForResponses(item)}
                    activeOpacity={0.8}
                  >
                    <Users size={14} color="#1A2D5A" style={{ marginRight: 6 }} />
                    <Text style={styles.viewResponsesBtnTxt}>
                      View Member Responses ({total})
                    </Text>
                    <ChevronRight size={14} color="#1A2D5A" />
                  </TouchableOpacity>

                  <View style={styles.quickOpsRow}>
                    {isScheduled && (
                      <TouchableOpacity
                        onPress={() => handleStatusChange(item, 'Completed')}
                        style={styles.quickOpIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Check size={14} color="#059669" />
                      </TouchableOpacity>
                    )}

                    {isScheduled && (
                      <TouchableOpacity
                        onPress={() => handleStatusChange(item, 'Cancelled')}
                        style={styles.quickOpIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ban size={14} color="#E11D48" />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => handleDelete(item)}
                      style={styles.quickOpIconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={14} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Create Visit Modal */}
      <CareCellVisitModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        cells={cells}
        initialCellId={activeCellId}
        createdBy={user?.uid || member?.id || ''}
        createdByName={member?.name || user?.displayName || 'Super Admin'}
        onSuccess={loadVisits}
      />

      {/* Member Responses Breakdown Modal */}
      <CareCellVisitResponsesModal
        visible={!!selectedVisitForResponses}
        onClose={() => setSelectedVisitForResponses(null)}
        visit={selectedVisitForResponses}
        churchId={churchId}
        onResponseUpdated={loadVisits}
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
    paddingTop: 10,
    paddingBottom: 6,
  },
  cellFilterScroll: {
    flexDirection: 'row',
  },
  cellChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  cellChipActive: {
    backgroundColor: '#1A2D5A',
    borderColor: '#1A2D5A',
  },
  cellChipTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  cellChipTxtActive: {
    color: '#FFFFFF',
  },
  statsActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  kpiPillGroup: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  kpiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiPillVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 4,
  },
  kpiPillLbl: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  scheduleVisitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#1A2D5A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  scheduleVisitBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statusTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 6,
  },
  statusTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  statusTabBtnActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  statusTabBtnTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  statusTabBtnTxtActive: {
    color: '#3730A3',
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  visitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cellBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cellBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cellBadgeTxt: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1A2D5A',
  },
  cellSubName: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  statusPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillCompleted: {
    backgroundColor: '#ECFDF5',
  },
  statusPillCancelled: {
    backgroundColor: '#FFF1F2',
  },
  statusPillTxt: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#3730A3',
  },
  statusPillTxtCompleted: {
    color: '#065F46',
  },
  statusPillTxtCancelled: {
    color: '#9F1239',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 6,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  visitorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
  },
  visitorsTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  purposeTxt: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 16,
  },
  responseSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  responseCountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  responseCountItem: {
    alignItems: 'center',
  },
  responseValAccepted: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
  },
  responseValDeclined: {
    fontSize: 14,
    fontWeight: '900',
    color: '#E11D48',
  },
  responseValPending: {
    fontSize: 14,
    fontWeight: '900',
    color: '#D97706',
  },
  responseValTotal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  responseLbl: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  progressBarBg: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarAccepted: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 3,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  viewResponsesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  viewResponsesBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2D5A',
    marginRight: 4,
  },
  quickOpsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickOpIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingTxt: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyActionBtnTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

