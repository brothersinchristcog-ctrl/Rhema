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
  MapPin,
  Navigation,
} from 'lucide-react-native';
import CareCellService from '../../../../services/CareCellService';
import { formatDateDisplay } from '../../../../utils/DateUtils';
import { useAuth } from '../../../../context/AuthContext';
import { useAdminTheme, createAdminThemedStyles } from '../../../../utils/adminThemeHelper';
import { CareCell, CareCellVisit, CareCellMembership, VisitStatus, formatTime12h } from '../../../../types/CareCellTypes';
import CareCellVisitModal from '../components/CareCellVisitModal';
import CareCellVisitResponsesModal from '../components/CareCellVisitResponsesModal';
import CareCellMapModal from '../components/CareCellMapModal';

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
  const { isDark, primaryText, secondaryText, cardSurface, secondarySurface, borderColor } = useAdminTheme();
  const primaryBtnBg = isDark ? '#FFFFFF' : '#0F172A';
  const primaryBtnText = isDark ? '#000000' : '#FFFFFF';
  const secondaryBtnBg = isDark ? '#27272A' : '#F8FAFC';
  const secondaryBtnBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1';
  const secondaryBtnText = isDark ? '#E4E4E7' : '#334155';
  const dangerBtnBg = isDark ? 'rgba(220, 38, 38, 0.14)' : '#FEF2F2';
  const dangerBtnBorder = isDark ? 'rgba(248, 113, 113, 0.35)' : '#FECACA';
  const dangerBtnText = isDark ? '#F87171' : '#DC2626';

  const { user, member, isPlatformSuperAdmin } = useAuth();
  const [activeCellId, setActiveCellId] = useState<string>(selectedCellId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Scheduled' | 'Completed' | 'Cancelled'>('ALL');
  const [visits, setVisits] = useState<CareCellVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedVisitForResponses, setSelectedVisitForResponses] = useState<CareCellVisit | null>(null);

  // Visiting Route Map state
  const [routeMapState, setRouteMapState] = useState<{
    visible: boolean;
    cell: CareCell | null;
    visit: CareCellVisit | null;
    members: CareCellMembership[];
    initialPlannedRouteIds: string[];
    visitMemberMeta: Record<string, { response?: any; preferredTime?: string }>;
    visitTitle: string;
    autoStartNavigation?: boolean;
  }>({
    visible: false,
    cell: null,
    visit: null,
    members: [],
    initialPlannedRouteIds: [],
    visitMemberMeta: {},
    visitTitle: '',
    autoStartNavigation: false,
  });

  const handleOpenVisitRouteMap = async (visit: CareCellVisit, autoStartNav = false) => {
    const targetCell = cells.find((c) => c.id === (visit.cellId || (visit as any).careCellId)) || cells[0];
    if (!targetCell) {
      Alert.alert('Care Cell Not Found', 'No Care Cell linked to this visit.');
      return;
    }

    try {
      const activeChurchId = churchId || (await CareCellService.getChurchId());
      const cellMembers = await CareCellService.getActiveCellMemberships(activeChurchId, targetCell.id);

      const meta: Record<string, { response?: any; preferredTime?: string }> = {};
      if (visit.responses) {
        Object.entries(visit.responses).forEach(([mId, resp]) => {
          meta[mId] = {
            response: resp.response || (resp as any).status,
            preferredTime: resp.preferredTime,
          };
        });
      }

      let routeIds: string[] = [];
      if (visit.routeStops && visit.routeStops.length > 0) {
        routeIds = visit.routeStops.map((s) => s.memberId);
      } else if (visit.responses) {
        const accepted = Object.entries(visit.responses)
          .filter(([_, r]) => (r.response || (r as any).status) === 'Accepted')
          .map(([id]) => id);
        const others = Object.keys(visit.responses).filter(
          (id) => !accepted.includes(id) && (visit.responses![id]?.response || (visit.responses![id] as any)?.status) !== 'Declined'
        );
        routeIds = [...accepted, ...others];
      }

      setRouteMapState({
        visible: true,
        cell: targetCell,
        visit,
        members: cellMembers,
        initialPlannedRouteIds: routeIds,
        visitMemberMeta: meta,
        visitTitle: `${visit.title} · ${autoStartNav ? 'In-App Navigation' : 'Route Map'}`,
        autoStartNavigation: autoStartNav,
      });
    } catch (e: any) {
      console.error('Error opening visit route map:', e);
      Alert.alert('Map Error', 'Could not prepare visit route map.');
    }
  };

  const handleSaveOptimizedVisitRoute = async (stops: any[]) => {
    if (!routeMapState.visit) return;
    try {
      const activeChurchId = churchId || (await CareCellService.getChurchId());
      await CareCellService.updateVisitRouteStops(activeChurchId, routeMapState.visit.id, stops);
      loadVisits();
    } catch (e: any) {
      console.error('Error saving visit route stops:', e);
      Alert.alert('Save Error', 'Failed to save updated visit route stops.');
    }
  };

  const handleDirectionsForVisit = async (visit: CareCellVisit) => {
    // Always open Google Maps directly inside Rhema (no external browser or app redirect!)
    handleOpenVisitRouteMap(visit, true);
  };

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
        <View style={styles.topActionsHeaderRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cellFilterScroll} contentContainerStyle={{ paddingRight: 8 }}>
            <TouchableOpacity
              style={[
                styles.cellChip,
                activeCellId === 'ALL' && { backgroundColor: primaryBtnBg, borderColor: primaryBtnBg },
              ]}
              onPress={() => handleCellSelect('ALL')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.cellChipTxt,
                  activeCellId === 'ALL' && { color: primaryBtnText, fontWeight: '800' },
                ]}
              >
                All Cells ({cells.length})
              </Text>
            </TouchableOpacity>

            {cells.map((c) => {
              const isSel = c.id === activeCellId;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.cellChip,
                    isSel && { backgroundColor: primaryBtnBg, borderColor: primaryBtnBg },
                  ]}
                  onPress={() => handleCellSelect(c.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.cellChipTxt,
                      isSel && { color: primaryBtnText, fontWeight: '800' },
                    ]}
                  >
                    {c.cellCode}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.scheduleVisitBtn, { backgroundColor: primaryBtnBg }]}
            onPress={() => setCreateModalVisible(true)}
            activeOpacity={0.85}
          >
            <Plus size={15} color={primaryBtnText} strokeWidth={2.5} style={{ marginRight: 5 }} />
            <Text style={[styles.scheduleVisitBtnTxt, { color: primaryBtnText }]}>Schedule</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3 Spacious KPI Metrics Cards */}
      <View style={styles.kpiCardsRow}>
        <View style={styles.kpiCard}>
          <View style={styles.kpiCardTop}>
            <Home size={14} color={primaryText} />
            <Text style={styles.kpiCardVal}>{metrics.totalVisits}</Text>
          </View>
          <Text style={styles.kpiCardLbl}>Total Visits</Text>
        </View>

        <View
          style={[
            styles.kpiCard,
            styles.kpiCardAccepted,
            isDark && { backgroundColor: 'rgba(5, 150, 105, 0.14)', borderColor: 'rgba(16, 185, 129, 0.35)' },
          ]}
        >
          <View style={styles.kpiCardTop}>
            <CheckCircle2 size={14} color={isDark ? '#34D399' : '#059669'} />
            <Text style={[styles.kpiCardVal, { color: isDark ? '#34D399' : '#059669' }]}>{metrics.totalAccepted}</Text>
          </View>
          <Text style={[styles.kpiCardLbl, { color: isDark ? '#34D399' : '#065F46' }]}>Accepted</Text>
        </View>

        <View
          style={[
            styles.kpiCard,
            styles.kpiCardPending,
            isDark && { backgroundColor: 'rgba(217, 119, 6, 0.14)', borderColor: 'rgba(245, 158, 11, 0.35)' },
          ]}
        >
          <View style={styles.kpiCardTop}>
            <Clock size={14} color={isDark ? '#FBBF24' : '#D97706'} />
            <Text style={[styles.kpiCardVal, { color: isDark ? '#FBBF24' : '#D97706' }]}>{metrics.totalPending}</Text>
          </View>
          <Text style={[styles.kpiCardLbl, { color: isDark ? '#FBBF24' : '#92400E' }]}>Pending</Text>
        </View>
      </View>

      {/* Status Filter Tabs */}
      <View style={styles.statusTabsRow}>
        {(['ALL', 'Scheduled', 'Completed', 'Cancelled'] as const).map((st) => {
          const isActive = statusFilter === st;
          return (
            <TouchableOpacity
              key={st}
              style={[
                styles.statusTabBtn,
                isActive && { backgroundColor: primaryBtnBg, borderColor: primaryBtnBg },
              ]}
              onPress={() => setStatusFilter(st)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.statusTabBtnTxt,
                  isActive && { color: primaryBtnText, fontWeight: '800' },
                ]}
              >
                {st}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Visits List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={primaryText} />
          <Text style={styles.loadingTxt}>Loading Care Cell visits...</Text>
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[primaryBtnBg]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrap, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder, borderWidth: 1 }]}>
                <Home size={34} color={primaryText} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>No Visit Notifications Found</Text>
              <Text style={styles.emptySubtitle}>
                Schedule a pastoral or fellowship visit to send instant in-app & push notifications to all assigned members with Accept & Decline confirmation.
              </Text>
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: primaryBtnBg }]}
                onPress={() => setCreateModalVisible(true)}
                activeOpacity={0.85}
              >
                <Plus size={16} color={primaryBtnText} style={{ marginRight: 6 }} />
                <Text style={[styles.emptyActionBtnTxt, { color: primaryBtnText }]}>Schedule First Visit</Text>
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
                      isCompleted
                        ? (isDark ? { backgroundColor: 'rgba(5, 150, 105, 0.2)' } : styles.statusPillCompleted)
                        : isCancelled
                          ? (isDark ? { backgroundColor: 'rgba(220, 38, 38, 0.2)' } : styles.statusPillCancelled)
                          : (isDark ? { backgroundColor: 'rgba(59, 130, 246, 0.2)' } : styles.statusPill),
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillTxt,
                        isCompleted
                          ? { color: '#10B981' }
                          : isCancelled
                            ? { color: '#EF4444' }
                            : { color: isDark ? '#93C5FD' : '#1D4ED8' },
                      ]}
                    >
                      {item.status || 'Scheduled'}
                    </Text>
                  </View>
                </View>

                {/* Date & Time and Visitors */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Calendar size={13} color={isDark ? '#94A3B8' : '#64748B'} style={{ marginRight: 5 }} />
                    <Text style={[styles.detailTxt, isDark && { color: '#CBD5E1' }]}>{formatDateDisplay(item.visitDate)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Clock size={13} color={isDark ? '#94A3B8' : '#64748B'} style={{ marginRight: 5 }} />
                    <Text style={[styles.detailTxt, isDark && { color: '#CBD5E1' }]}>{formatTime12h(item.visitTime)}</Text>
                  </View>
                </View>

                {item.visitors ? (
                  <View style={[styles.visitorsRow, isDark && { backgroundColor: '#27272A' }]}>
                    <Users size={13} color={isDark ? '#E4E4E7' : '#1A2D5A'} style={{ marginRight: 6 }} />
                    <Text style={[styles.visitorsTxt, isDark && { color: '#FFFFFF' }]}>Visiting: {item.visitors}</Text>
                  </View>
                ) : null}

                {item.purpose ? (
                  <Text style={[styles.purposeTxt, isDark && { color: '#94A3B8' }]} numberOfLines={2}>
                    "{item.purpose}"
                  </Text>
                ) : null}

                {/* Live Member Responses Summary Bar */}
                <View style={[styles.responseSummaryBox, isDark && { backgroundColor: '#18181B', borderColor: '#27272A' }]}>
                  <View style={styles.responseCountsRow}>
                    <View style={styles.responseCountItem}>
                      <Text style={styles.responseValAccepted}>{accepted}</Text>
                      <Text style={[styles.responseLbl, isDark && { color: '#A1A1AA' }]}>Accepted</Text>
                    </View>
                    <View style={styles.responseCountItem}>
                      <Text style={styles.responseValDeclined}>{declined}</Text>
                      <Text style={[styles.responseLbl, isDark && { color: '#A1A1AA' }]}>Declined</Text>
                    </View>
                    <View style={styles.responseCountItem}>
                      <Text style={styles.responseValPending}>{pending}</Text>
                      <Text style={[styles.responseLbl, isDark && { color: '#A1A1AA' }]}>Pending</Text>
                    </View>
                    <View style={styles.responseCountItem}>
                      <Text style={[styles.responseValTotal, isDark && { color: '#FFFFFF' }]}>{total}</Text>
                      <Text style={[styles.responseLbl, isDark && { color: '#A1A1AA' }]}>Total</Text>
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View style={[styles.progressBarBg, isDark && { backgroundColor: '#27272A' }]}>
                    <View style={[styles.progressBarAccepted, { width: `${acceptRate}%` }]} />
                  </View>
                </View>

                {/* Bottom Card Actions: 2 Clean Rows to avoid cramming */}
                <View style={[styles.cardActionsContainer, isDark && { borderTopColor: '#27272A' }]}>
                  {/* Row 1: Responses Button + Quick Status Operations */}
                  <View style={styles.cardActionsTopRow}>
                    <TouchableOpacity
                      style={[styles.viewResponsesBtn, { backgroundColor: secondaryBtnBg, borderColor: secondaryBtnBorder }]}
                      onPress={() => setSelectedVisitForResponses(item)}
                      activeOpacity={0.8}
                    >
                      <Users size={14} color={secondaryBtnText} style={{ marginRight: 6 }} />
                      <Text style={[styles.viewResponsesBtnTxt, { color: secondaryBtnText }]}>
                        Responses ({total})
                      </Text>
                      <ChevronRight size={14} color={secondaryBtnText} />
                    </TouchableOpacity>

                    <View style={styles.quickOpsRow}>
                      {isScheduled && (
                        <TouchableOpacity
                          onPress={() => handleStatusChange(item, 'Completed')}
                          style={[styles.quickOpIconBtn, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5', borderColor: isDark ? '#059669' : '#A7F3D0' }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Check size={14} color="#10B981" />
                        </TouchableOpacity>
                      )}

                      {isScheduled && (
                        <TouchableOpacity
                          onPress={() => handleStatusChange(item, 'Cancelled')}
                          style={[styles.quickOpIconBtn, { backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FFFBEB', borderColor: isDark ? '#D97706' : '#FDE68A' }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ban size={13} color="#F59E0B" />
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        onPress={() => handleDelete(item)}
                        style={[styles.quickOpIconBtn, { backgroundColor: dangerBtnBg, borderColor: dangerBtnBorder }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={13} color={dangerBtnText} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Row 2: In-App Route Map & Turn-by-Turn Directions */}
                  <View style={styles.cardActionsBottomRow}>
                    <TouchableOpacity
                      style={[
                        styles.routeMapActionBtn,
                        {
                          backgroundColor: secondaryBtnBg,
                          borderColor: secondaryBtnBorder,
                        },
                      ]}
                      onPress={() => handleOpenVisitRouteMap(item)}
                      activeOpacity={0.8}
                    >
                      <MapPin size={13} color={secondaryBtnText} style={{ marginRight: 5 }} />
                      <Text style={[styles.routeMapActionBtnTxt, { color: secondaryBtnText }]}>
                        Route Map
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.routeMapActionBtn,
                        {
                          backgroundColor: secondaryBtnBg,
                          borderColor: secondaryBtnBorder,
                        },
                      ]}
                      onPress={() => handleDirectionsForVisit(item)}
                      activeOpacity={0.8}
                    >
                      <Navigation size={13} color={secondaryBtnText} style={{ marginRight: 5 }} />
                      <Text style={[styles.routeMapActionBtnTxt, { color: secondaryBtnText }]}>
                        Directions
                      </Text>
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

      {/* Visiting Route Map Modal */}
      {routeMapState.visible && routeMapState.cell && (
        <CareCellMapModal
          visible={routeMapState.visible}
          onClose={() => setRouteMapState((prev) => ({ ...prev, visible: false }))}
          cell={routeMapState.cell}
          members={routeMapState.members}
          initialPlannedRouteIds={routeMapState.initialPlannedRouteIds}
          autoStartNavigation={routeMapState.autoStartNavigation}
          visitMemberMeta={routeMapState.visitMemberMeta}
          visitDefaultTime={routeMapState.visit?.visitTime}
          onSaveVisitRoute={handleSaveOptimizedVisitRoute}
          visitTitle={routeMapState.visitTitle}
        />
      )}
    </View>
  );
}

const styles = createAdminThemedStyles({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  topActionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cellFilterScroll: {
    flex: 1,
  },
  cellChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 8,
  },
  cellChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  cellChipTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  cellChipTxtActive: {
    color: '#FFFFFF',
  },
  scheduleVisitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8.5,
    borderRadius: 10,
  },
  scheduleVisitBtnTxt: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiCardAccepted: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  kpiCardPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kpiCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  kpiCardVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiCardLbl: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  statusTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  statusTabBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  statusTabBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  statusTabBtnTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  statusTabBtnTxtActive: {
    color: '#FFFFFF',
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
  cardActionsContainer: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  cardActionsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardActionsBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewResponsesBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  viewResponsesBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4,
  },
  routeMapActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  routeMapActionBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickOpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickOpIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1.2,
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

