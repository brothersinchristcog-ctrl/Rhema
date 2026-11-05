import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {
  Users,
  Building2,
  Calendar,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Sparkles,
  ChevronDown,
  UserCheck,
  PlusCircle,
  CalendarPlus,
  ClipboardCheck,
} from 'lucide-react-native';
import CareCellService from '../../../../services/CareCellService';
import { useAuth } from '../../../../context/AuthContext';
import { CareCell, CareCellOverviewStats } from '../../../../types/CareCellTypes';

const { width } = Dimensions.get('window');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CareCellsOverviewTabProps {
  cells: CareCell[];
  onNavigateTab: (tabIndex: number) => void;
  onOpenCreateCell: () => void;
  onOpenCreateMeeting: () => void;
}

export default function CareCellsOverviewTab({
  cells,
  onNavigateTab,
  onOpenCreateCell,
  onOpenCreateMeeting,
}: CareCellsOverviewTabProps) {
  const { isPlatformSuperAdmin } = useAuth();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedCellId, setSelectedCellId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<CareCellOverviewStats>({
    totalCareCells: 0,
    activeCareCells: 0,
    inactiveCareCells: 0,
    totalCellLeaders: 0,
    totalAssignedMembers: 0,
    totalMeetingsThisMonth: 0,
    averageAttendanceRate: 0,
    membersRequiringFollowup: 0,
  });

  const loadStats = useCallback(async () => {
    try {
      const churchId = await CareCellService.getChurchId();
      const res = await CareCellService.getOverviewStats(churchId, {
        month: selectedMonth,
        year: selectedYear,
        cellId: selectedCellId,
        status: selectedStatus,
      });
      setStats(res);
    } catch (e) {
      console.error('Error loading Care Cell stats:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, selectedYear, selectedCellId, selectedStatus]);

  useEffect(() => {
    setLoading(true);
    loadStats();
  }, [loadStats]);

  const onRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1A2D5A']} />}
    >
      {/* Month & Year Filter Bar */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {/* Cell Filter */}
          <TouchableOpacity
            style={[styles.filterChip, selectedCellId === 'ALL' && styles.filterChipActive]}
            onPress={() => setSelectedCellId('ALL')}
          >
            <Text style={[styles.filterChipTxt, selectedCellId === 'ALL' && styles.filterChipTxtActive]}>
              All Cells ({cells.length})
            </Text>
          </TouchableOpacity>

          {cells.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.filterChip, selectedCellId === c.id && styles.filterChipActive]}
              onPress={() => setSelectedCellId(c.id)}
            >
              <Text style={[styles.filterChipTxt, selectedCellId === c.id && styles.filterChipTxtActive]}>
                {c.cellCode}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Quick Period Selector */}
      <View style={styles.periodBar}>
        <Text style={styles.periodLabel}>
          PERIOD: {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </Text>
        <View style={styles.periodNav}>
          <TouchableOpacity
            style={styles.periodArrow}
            onPress={() => {
              if (selectedMonth === 1) {
                setSelectedMonth(12);
                setSelectedYear((y) => y - 1);
              } else {
                setSelectedMonth((m) => m - 1);
              }
            }}
          >
            <Text style={styles.periodArrowTxt}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.periodArrow}
            onPress={() => {
              if (selectedMonth === 12) {
                setSelectedMonth(1);
                setSelectedYear((y) => y + 1);
              } else {
                setSelectedMonth((m) => m + 1);
              }
            }}
          >
            <Text style={styles.periodArrowTxt}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1A2D5A" />
          <Text style={styles.loadingTxt}>Calculating Care Cell analytics...</Text>
        </View>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <View style={styles.kpiGrid}>
            {/* Card 1: Total Care Cells */}
            <TouchableOpacity
              style={styles.kpiCard}
              activeOpacity={0.8}
              onPress={() => onNavigateTab(1)} // Manage Cells
            >
              <View style={[styles.kpiIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Building2 size={20} color="#1D4ED8" />
              </View>
              <Text style={styles.kpiValue}>{stats.totalCareCells}</Text>
              <Text style={styles.kpiTitle}>Total Care Cells</Text>
              <Text style={styles.kpiSub}>
                {stats.activeCareCells} active · {stats.inactiveCareCells} inactive
              </Text>
            </TouchableOpacity>

            {/* Card 2: Assigned Members */}
            <TouchableOpacity
              style={styles.kpiCard}
              activeOpacity={0.8}
              onPress={() => onNavigateTab(2)} // Cell Members
            >
              <View style={[styles.kpiIconWrap, { backgroundColor: '#FAF5FF' }]}>
                <Users size={20} color="#7E22CE" />
              </View>
              <Text style={styles.kpiValue}>{stats.totalAssignedMembers}</Text>
              <Text style={styles.kpiTitle}>Assigned Members</Text>
              <Text style={styles.kpiSub}>1 active cell / member</Text>
            </TouchableOpacity>

            {/* Card 3: Total Leaders */}
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrap, { backgroundColor: '#ECFDF5' }]}>
                <UserCheck size={20} color="#059669" />
              </View>
              <Text style={styles.kpiValue}>{stats.totalCellLeaders}</Text>
              <Text style={styles.kpiTitle}>Cell Leaders</Text>
              <Text style={styles.kpiSub}>Leaders & Assistants</Text>
            </View>

            {/* Card 4: Average Attendance % */}
            <TouchableOpacity
              style={styles.kpiCard}
              activeOpacity={0.8}
              onPress={() => onNavigateTab(4)} // Attendance Tab
            >
              <View style={[styles.kpiIconWrap, { backgroundColor: '#FFFBEB' }]}>
                <TrendingUp size={20} color="#D97706" />
              </View>
              <Text style={styles.kpiValue}>{stats.averageAttendanceRate}%</Text>
              <Text style={styles.kpiTitle}>Avg. Attendance</Text>
              <Text style={styles.kpiSub}>Present & Late roll-calls</Text>
            </TouchableOpacity>

            {/* Card 5: Meetings This Month */}
            <TouchableOpacity
              style={styles.kpiCard}
              activeOpacity={0.8}
              onPress={() => onNavigateTab(3)} // Meetings Tab
            >
              <View style={[styles.kpiIconWrap, { backgroundColor: '#F0FDF4' }]}>
                <Calendar size={20} color="#15803D" />
              </View>
              <Text style={styles.kpiValue}>{stats.totalMeetingsThisMonth}</Text>
              <Text style={styles.kpiTitle}>Meetings in {MONTH_NAMES[selectedMonth - 1].slice(0, 3)}</Text>
              <Text style={styles.kpiSub}>Fellowships conducted</Text>
            </TouchableOpacity>

            {/* Card 6: Follow-ups Pending */}
            <TouchableOpacity
              style={styles.kpiCard}
              activeOpacity={0.8}
              onPress={() => onNavigateTab(5)} // Navigate to Follow-ups
            >
              <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF2F2' }]}>
                <AlertCircle size={20} color="#DC2626" />
              </View>
              <Text style={[styles.kpiValue, { color: '#DC2626' }]}>{stats.membersRequiringFollowup}</Text>
              <Text style={styles.kpiTitle}>Care Follow-ups</Text>
              <Text style={styles.kpiSub}>Pending & upcoming check-ins</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Leadership Actions */}
          <Text style={styles.sectionHeading}>DIRECT ACTIONS</Text>
          <View style={styles.actionsRow}>
            {isPlatformSuperAdmin && (
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                onPress={onOpenCreateCell}
                activeOpacity={0.85}
              >
                <PlusCircle size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnPrimaryTxt}>New Care Cell</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={onOpenCreateMeeting}
              activeOpacity={0.85}
            >
              <CalendarPlus size={18} color="#1A2D5A" style={{ marginRight: 8 }} />
              <Text style={styles.actionBtnSecondaryTxt}>Schedule Meeting</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnTertiary}
              onPress={() => onNavigateTab(4)}
              activeOpacity={0.85}
            >
              <ClipboardCheck size={18} color="#059669" style={{ marginRight: 8 }} />
              <Text style={styles.actionBtnTertiaryTxt}>Mark Attendance</Text>
            </TouchableOpacity>
          </View>

          {/* Guidelines Banner */}
          <View style={styles.guidelineBanner}>
            <Sparkles size={18} color="#D97706" style={{ marginRight: 10, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.guidelineTitle}>Rhema Care Cell Philosophy</Text>
              <Text style={styles.guidelineBody}>
                Care Cells foster deep fellowship, pastoral warmth, and authentic Bible study. Cell leaders guide their members through prayer, regular follow-up visits, and active attendance roll-calls.
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  filterRow: {
    marginBottom: 10,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1A2D5A',
    borderColor: '#1A2D5A',
  },
  filterChipTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTxtActive: {
    color: '#FFFFFF',
  },
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 14,
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2D5A',
    letterSpacing: 0.5,
  },
  periodNav: {
    flexDirection: 'row',
    gap: 8,
  },
  periodArrow: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodArrowTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A2D5A',
    marginTop: -2,
  },
  loadingWrap: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    width: (width - 44) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  kpiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A2D5A',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  sectionHeading: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  actionBtnPrimary: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2D5A',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#1A2D5A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBtnPrimaryTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionBtnSecondary: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#1A2D5A',
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnSecondaryTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  actionBtnTertiary: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnTertiaryTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  guidelineBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
  },
  guidelineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  guidelineBody: {
    fontSize: 12,
    lineHeight: 18,
    color: '#B45309',
    fontWeight: '500',
  },
});

