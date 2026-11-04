import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import {
  Calendar,
  Clock,
  MapPin,
  BookOpen,
  CalendarPlus,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Edit2,
  ChevronDown,
  Sparkles,
} from 'lucide-react-native';
import CareCellService from '../../../../services/CareCellService';
import { formatDateDisplay } from '../../../../utils/DateUtils';
import { CareCell, CareCellMeeting } from '../../../../types/CareCellTypes';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CareCellMeetingsTabProps {
  cells: CareCell[];
  selectedCellId?: string;
  onSelectCellId: (id: string) => void;
  onOpenCreateMeeting: () => void;
  onEditMeeting: (meeting: CareCellMeeting) => void;
  onMarkAttendance: (meeting: CareCellMeeting) => void;
}

export default function CareCellMeetingsTab({
  cells,
  selectedCellId,
  onSelectCellId,
  onOpenCreateMeeting,
  onEditMeeting,
  onMarkAttendance,
}: CareCellMeetingsTabProps) {
  const activeCellId = selectedCellId || 'ALL';
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState<'All' | 'Upcoming' | 'Completed' | 'Cancelled'>('All');

  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<CareCellMeeting[]>([]);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const churchId = await CareCellService.getChurchId();
      const list = await CareCellService.getMeetings(churchId, activeCellId, {
        month: selectedMonth,
        year: selectedYear,
        status: statusFilter,
      });
      setMeetings(list);
    } catch (e) {
      console.error('Error loading Care Cell meetings:', e);
    } finally {
      setLoading(false);
    }
  }, [activeCellId, selectedMonth, selectedYear, statusFilter]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const handleCancelMeeting = (meeting: CareCellMeeting) => {
    Alert.alert(
      'Cancel Meeting',
      `Are you sure you want to cancel the meeting "${meeting.title}" scheduled for ${formatDateDisplay(meeting.date)}?`,
      [
        { text: 'Keep Scheduled', style: 'cancel' },
        {
          text: 'Cancel Meeting',
          style: 'destructive',
          onPress: async () => {
            try {
              const churchId = await CareCellService.getChurchId();
              await CareCellService.cancelMeeting(churchId, meeting.id);
              loadMeetings();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel meeting.');
            }
          },
        },
      ]
    );
  };

  const renderMeetingCard = ({ item }: { item: CareCellMeeting }) => {
    const isUpcoming = item.status === 'Upcoming';
    const isCompleted = item.status === 'Completed';
    const isCancelled = item.status === 'Cancelled';

    return (
      <View style={[styles.card, isCancelled && styles.cardCancelled]}>
        {/* Top Badges */}
        <View style={styles.cardHeader}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeTxt}>{item.meetingType || 'Fellowship'}</Text>
          </View>
          <View
            style={[
              styles.statusChip,
              isUpcoming && styles.statusUpcoming,
              isCompleted && styles.statusCompleted,
              isCancelled && styles.statusCancelled,
            ]}
          >
            <Text
              style={[
                styles.statusChipTxt,
                isUpcoming && styles.statusUpcomingTxt,
                isCompleted && styles.statusCompletedTxt,
                isCancelled && styles.statusCancelledTxt,
              ]}
            >
              {item.status}
            </Text>
          </View>
        </View>

        {/* Title & Cell */}
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardCellMeta}>
          {item.cellCode ? `${item.cellCode} — ` : ''}{item.cellName || 'Care Cell'}
        </Text>

        {/* Schedule & Venue Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={13} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={styles.metaTxt}>{formatDateDisplay(item.date)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Clock size={13} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={styles.metaTxt}>{item.startTime}{item.endTime ? ` - ${item.endTime}` : ''}</Text>
          </View>
          {item.location ? (
            <View style={[styles.metaItem, { flex: 1 }]}>
              <MapPin size={13} color="#64748B" style={{ marginRight: 4 }} />
              <Text style={styles.metaTxt} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
        </View>

        {/* Scripture Reading Box (if present) */}
        {item.bibleBook ? (
          <View style={styles.scriptureBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <BookOpen size={13} color="#1A2D5A" style={{ marginRight: 5 }} />
              <Text style={styles.scriptureRef}>
                {item.bibleBook} {item.bibleChapter}:{item.bibleVerse}
              </Text>
            </View>
            {item.scriptureTextEn ? (
              <Text style={styles.scriptureSnippet} numberOfLines={2}>
                "{item.scriptureTextEn}"
              </Text>
            ) : null}
            {item.scriptureTextTe ? (
              <Text style={styles.scriptureSnippetTe} numberOfLines={2}>
                "{item.scriptureTextTe}"
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Notes/Description */}
        {item.description ? (
          <Text style={styles.descTxt} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        {/* Actions Row */}
        <View style={styles.cardActions}>
          {!isCancelled && (
            <TouchableOpacity
              style={styles.markAttendanceBtn}
              onPress={() => onMarkAttendance(item)}
              activeOpacity={0.8}
            >
              <ClipboardCheck size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.markAttendanceBtnTxt}>
                {isCompleted ? 'Review Attendance' : 'Mark Attendance'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => onEditMeeting(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Edit2 size={15} color="#1A2D5A" />
          </TouchableOpacity>

          {!isCancelled && isUpcoming && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancelMeeting(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <XCircle size={15} color="#DC2626" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Cell Filter Bar */}
      <View style={styles.cellSelectorRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cellSelectorScroll}>
          <TouchableOpacity
            style={[styles.cellChip, activeCellId === 'ALL' && styles.cellChipActive]}
            onPress={() => onSelectCellId('ALL')}
          >
            <Text style={[styles.cellChipTxt, activeCellId === 'ALL' && styles.cellChipTxtActive]}>
              All Cells
            </Text>
          </TouchableOpacity>

          {cells.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.cellChip, activeCellId === c.id && styles.cellChipActive]}
              onPress={() => onSelectCellId(c.id)}
            >
              <Text style={[styles.cellChipTxt, activeCellId === c.id && styles.cellChipTxtActive]}>
                {c.cellCode}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Period & Schedule Meeting Row */}
      <View style={styles.periodRow}>
        <View style={styles.periodDisplay}>
          <TouchableOpacity
            onPress={() => {
              if (selectedMonth === 1) {
                setSelectedMonth(12);
                setSelectedYear((y) => y - 1);
              } else {
                setSelectedMonth((m) => m - 1);
              }
            }}
            style={styles.periodArrow}
          >
            <Text style={styles.periodArrowTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.periodTxt}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (selectedMonth === 12) {
                setSelectedMonth(1);
                setSelectedYear((y) => y + 1);
              } else {
                setSelectedMonth((m) => m + 1);
              }
            }}
            style={styles.periodArrow}
          >
            <Text style={styles.periodArrowTxt}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.scheduleBtn} onPress={onOpenCreateMeeting} activeOpacity={0.85}>
          <CalendarPlus size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
          <Text style={styles.scheduleBtnTxt}>Schedule Meeting</Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter Chips */}
      <View style={styles.statusFilterRow}>
        {(['All', 'Upcoming', 'Completed', 'Cancelled'] as const).map((st) => (
          <TouchableOpacity
            key={st}
            style={[styles.statusFilterChip, statusFilter === st && styles.statusFilterChipActive]}
            onPress={() => setStatusFilter(st)}
          >
            <Text style={[styles.statusFilterChipTxt, statusFilter === st && styles.statusFilterChipTxtActive]}>
              {st}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Meetings List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1A2D5A" />
          <Text style={styles.loadingTxt}>Fetching scheduled meetings...</Text>
        </View>
      ) : (
        <FlatList
          data={meetings}
          keyExtractor={(item) => item.id}
          renderItem={renderMeetingCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Calendar size={44} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Meetings Found</Text>
              <Text style={styles.emptySubtitle}>
                No fellowship gatherings scheduled for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  cellSelectorRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  cellSelectorScroll: {
    flexDirection: 'row',
  },
  cellChip: {
    paddingHorizontal: 12,
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
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  periodDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  periodArrow: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodArrowTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A2D5A',
    marginTop: -2,
  },
  periodTxt: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1A2D5A',
    marginHorizontal: 8,
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2D5A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  scheduleBtnTxt: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statusFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  statusFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
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
    paddingTop: 6,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  cardCancelled: {
    opacity: 0.7,
    backgroundColor: '#FAF9F6',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  typeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeTxt: {
    fontSize: 11,
    fontWeight: '700',
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
  statusUpcoming: {
    backgroundColor: '#EFF6FF',
  },
  statusUpcomingTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  statusCompleted: {
    backgroundColor: '#ECFDF5',
  },
  statusCompletedTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  statusCancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusCancelledTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardCellMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
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
  scriptureBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 10,
  },
  scriptureRef: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2D5A',
  },
  scriptureSnippet: {
    fontSize: 11.5,
    fontStyle: 'italic',
    color: '#475569',
    lineHeight: 16,
  },
  scriptureSnippetTe: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 17,
    marginTop: 2,
  },
  descTxt: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 17,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  markAttendanceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2D5A',
    paddingVertical: 9,
    borderRadius: 10,
  },
  markAttendanceBtnTxt: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
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
