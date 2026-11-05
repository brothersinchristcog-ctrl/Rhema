import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  CheckCircle2,
  Clock,
  Users,
  Vote,
  AlertCircle,
  BarChart3,
  Check,
  Calendar,
} from 'lucide-react-native';
import EventRsvpService, {
  EventRsvpStatus,
  EventRsvpStats,
  EventRsvpRecord,
} from '../services/EventRsvpService';

export interface EventRsvpPollCardProps {
  eventId: string;
  churchId?: string;
  eventTitle: string;
  eventDate?: string;
  rsvpDeadline?: string;
  currentUser?: {
    id: string;
    name?: string;
    phone?: string;
    photo?: string;
  };
  isAdmin?: boolean;
  onViewAnalytics?: () => void;
  isDark?: boolean;
}

const RSVP_OPTIONS: {
  key: EventRsvpStatus;
  label: string;
  sub: string;
  badgeEmoji: string;
  activeColor: string;
  activeBgLight: string;
  activeBgDark: string;
  activeBorderLight: string;
  activeBorderDark: string;
  barColor: string;
}[] = [
  {
    key: 'Going',
    label: 'Going',
    sub: 'I will attend',
    badgeEmoji: '🟢',
    activeColor: '#059669',
    activeBgLight: '#ECFDF5',
    activeBgDark: 'rgba(5, 150, 105, 0.20)',
    activeBorderLight: '#10B981',
    activeBorderDark: '#059669',
    barColor: '#10B981',
  },
  {
    key: 'Interested',
    label: 'Interested',
    sub: 'I may attend',
    badgeEmoji: '🟡',
    activeColor: '#D97706',
    activeBgLight: '#FFFBEB',
    activeBgDark: 'rgba(217, 119, 6, 0.20)',
    activeBorderLight: '#F59E0B',
    activeBorderDark: '#D97706',
    barColor: '#F59E0B',
  },
  {
    key: 'Not Going',
    label: 'Not Going',
    sub: 'Cannot attend',
    badgeEmoji: '🔴',
    activeColor: '#DC2626',
    activeBgLight: '#FEF2F2',
    activeBgDark: 'rgba(220, 38, 38, 0.20)',
    activeBorderLight: '#EF4444',
    activeBorderDark: '#DC2626',
    barColor: '#EF4444',
  },
];

export const EventRsvpPollCard: React.FC<EventRsvpPollCardProps> = ({
  eventId,
  churchId,
  eventTitle,
  eventDate,
  rsvpDeadline,
  currentUser,
  isAdmin = false,
  onViewAnalytics,
  isDark = false,
}) => {
  const [selectedResponse, setSelectedResponse] = useState<EventRsvpStatus | null>(null);
  const [stats, setStats] = useState<EventRsvpStats>({
    goingCount: 0,
    interestedCount: 0,
    notGoingCount: 0,
    totalResponses: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [optimisticSelection, setOptimisticSelection] = useState<EventRsvpStatus | null>(null);

  // Check if RSVP deadline has expired
  const isDeadlinePassed = useMemo(() => {
    if (!rsvpDeadline) return false;
    try {
      let deadlineTimestamp: number | null = null;
      if (rsvpDeadline.includes('-') && rsvpDeadline.split('-')[0].length === 2) {
        // DD-MM-YYYY format
        const [d, m, y] = rsvpDeadline.split('-').map(Number);
        deadlineTimestamp = new Date(y, m - 1, d, 23, 59, 59).getTime();
      } else {
        deadlineTimestamp = new Date(rsvpDeadline).getTime();
      }
      if (deadlineTimestamp && !isNaN(deadlineTimestamp)) {
        return Date.now() > deadlineTimestamp;
      }
    } catch {
      return false;
    }
    return false;
  }, [rsvpDeadline]);

  // Listen to member's personal response in real-time
  useEffect(() => {
    if (!eventId || !currentUser?.id) return;
    const unsub = EventRsvpService.listenToMemberRsvp(
      churchId,
      eventId,
      currentUser.id,
      (record: EventRsvpRecord | null) => {
        if (record && record.status) {
          setSelectedResponse(record.status);
          setOptimisticSelection(record.status);
        } else {
          setSelectedResponse(null);
          setOptimisticSelection(null);
        }
      }
    );
    return () => unsub();
  }, [churchId, eventId, currentUser?.id]);

  // Listen to aggregate event RSVP stats in real-time
  useEffect(() => {
    if (!eventId) return;
    const unsub = EventRsvpService.listenToEventStats(
      churchId,
      eventId,
      (newStats) => {
        setStats(newStats);
      }
    );
    return () => unsub();
  }, [churchId, eventId]);

  const activeResponse = optimisticSelection ?? selectedResponse;

  // Handle Response Selection
  const handleSelectOption = async (option: EventRsvpStatus) => {
    if (isDeadlinePassed) {
      Alert.alert(
        'RSVP Closed',
        'The RSVP deadline for this event has passed. Responses are now locked.'
      );
      return;
    }

    if (!currentUser?.id) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to submit your RSVP attendance response.'
      );
      return;
    }

    if (activeResponse === option) {
      // Already selected
      return;
    }

    // Apply optimistic update immediately
    const prevSelection = activeResponse;
    setOptimisticSelection(option);
    setSubmitting(true);

    try {
      await EventRsvpService.submitRsvp(
        churchId,
        eventId,
        eventTitle,
        {
          id: currentUser.id,
          name: currentUser.name || 'Member',
          phone: currentUser.phone || '',
          photoURL: currentUser.photo || '',
        },
        option
      );
      setSelectedResponse(option);
    } catch (err: any) {
      console.error('[EventRsvpPollCard] Submit RSVP error:', err);
      // Revert optimistic selection on failure
      setOptimisticSelection(prevSelection);
      Alert.alert('RSVP Error', 'Could not save your response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Percentages for progress bar
  const total = stats.totalResponses || 0;
  const goingPct = total > 0 ? Math.round((stats.goingCount / total) * 100) : 0;
  const interestedPct = total > 0 ? Math.round((stats.interestedCount / total) * 100) : 0;
  const notGoingPct = total > 0 ? Math.max(0, 100 - goingPct - interestedPct) : 0;

  return (
    <View
      style={[
        styles.card,
        isDark ? styles.cardDark : styles.cardLight,
      ]}
    >
      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, isDark ? styles.iconWrapDark : styles.iconWrapLight]}>
            <Vote size={18} color={isDark ? '#A5B4FC' : '#4F46E5'} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, isDark ? styles.textDark : styles.textLight]}>
              RSVP Participation Poll
            </Text>
            <Text style={[styles.headerSub, isDark ? styles.subDark : styles.subLight]}>
              {isDeadlinePassed ? 'Responses closed' : 'Let the leadership know to help us prepare'}
            </Text>
          </View>
        </View>

        {isDeadlinePassed ? (
          <View style={styles.closedBadge}>
            <Clock size={11} color="#B45309" style={{ marginRight: 4 }} />
            <Text style={styles.closedBadgeTxt}>CLOSED</Text>
          </View>
        ) : (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeTxt}>LIVE</Text>
          </View>
        )}
      </View>

      {/* ── Question ── */}
      <View style={styles.questionBox}>
        <Text style={[styles.questionText, isDark ? styles.textDark : styles.textLight]}>
          Are you attending this event?
        </Text>
        <Text style={[styles.questionSub, isDark ? styles.subDark : styles.subLight]}>
          మీరు ఈ కార్యక్రమంలో పాల్గొంటున్నారా?
        </Text>
      </View>

      {/* ── Response Options ── */}
      <View style={styles.optionsRow}>
        {RSVP_OPTIONS.map((opt) => {
          const isSelected = activeResponse === opt.key;
          const count =
            opt.key === 'Going'
              ? stats.goingCount
              : opt.key === 'Interested'
              ? stats.interestedCount
              : stats.notGoingCount;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;

          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => handleSelectOption(opt.key)}
              disabled={isDeadlinePassed || submitting}
              activeOpacity={0.8}
              style={[
                styles.optionBtn,
                isDark ? styles.optionBtnDark : styles.optionBtnLight,
                isSelected && {
                  borderColor: isDark ? opt.activeBorderDark : opt.activeBorderLight,
                  borderWidth: 2,
                  backgroundColor: isDark ? opt.activeBgDark : opt.activeBgLight,
                  transform: [{ scale: 1.02 }],
                },
                isDeadlinePassed && !isSelected && { opacity: 0.55 },
              ]}
            >
              {/* Selected indicator check badge */}
              {isSelected && (
                <View
                  style={[
                    styles.selectedBadge,
                    { backgroundColor: opt.activeColor },
                  ]}
                >
                  <Check size={11} color="#FFFFFF" strokeWidth={3} />
                </View>
              )}

              <Text style={styles.optEmoji}>{opt.badgeEmoji}</Text>
              <Text
                style={[
                  styles.optLabel,
                  isDark ? styles.textDark : styles.textLight,
                  isSelected && { color: opt.activeColor, fontWeight: '800' },
                ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
              <Text
                style={[
                  styles.optSub,
                  isDark ? styles.subDark : styles.subLight,
                  isSelected && { color: opt.activeColor },
                ]}
                numberOfLines={1}
              >
                {opt.sub}
              </Text>

              {/* Count & % pill */}
              <View
                style={[
                  styles.countPill,
                  isDark ? styles.countPillDark : styles.countPillLight,
                  isSelected && {
                    backgroundColor: opt.activeColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countPillTxt,
                    isDark ? styles.textDark : styles.textLight,
                    isSelected && { color: '#FFFFFF', fontWeight: '800' },
                  ]}
                >
                  {count} {total > 0 ? `(${pct}%)` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Submitting indicator */}
      {submitting && (
        <View style={styles.submittingRow}>
          <ActivityIndicator size="small" color="#4F46E5" />
          <Text style={[styles.submittingTxt, isDark ? styles.subDark : styles.subLight]}>
            Updating your response...
          </Text>
        </View>
      )}

      {/* ── Participation Progress Bar ── */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBarWrapper}>
          {total === 0 ? (
            <View
              style={[
                styles.emptyBar,
                { backgroundColor: isDark ? '#3F3F46' : '#E2E8F0' },
              ]}
            />
          ) : (
            <View style={styles.segmentedBar}>
              {goingPct > 0 && (
                <View
                  style={{
                    flex: goingPct,
                    backgroundColor: '#10B981',
                    height: 8,
                    borderTopLeftRadius: 4,
                    borderBottomLeftRadius: 4,
                    borderTopRightRadius: interestedPct === 0 && notGoingPct === 0 ? 4 : 0,
                    borderBottomRightRadius: interestedPct === 0 && notGoingPct === 0 ? 4 : 0,
                  }}
                />
              )}
              {interestedPct > 0 && (
                <View
                  style={{
                    flex: interestedPct,
                    backgroundColor: '#F59E0B',
                    height: 8,
                    borderTopLeftRadius: goingPct === 0 ? 4 : 0,
                    borderBottomLeftRadius: goingPct === 0 ? 4 : 0,
                    borderTopRightRadius: notGoingPct === 0 ? 4 : 0,
                    borderBottomRightRadius: notGoingPct === 0 ? 4 : 0,
                  }}
                />
              )}
              {notGoingPct > 0 && (
                <View
                  style={{
                    flex: notGoingPct,
                    backgroundColor: '#EF4444',
                    height: 8,
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4,
                    borderTopLeftRadius: goingPct === 0 && interestedPct === 0 ? 4 : 0,
                    borderBottomLeftRadius: goingPct === 0 && interestedPct === 0 ? 4 : 0,
                  }}
                />
              )}
            </View>
          )}
        </View>

        {/* Legend / Stats row */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={[styles.legendTxt, isDark ? styles.subDark : styles.subLight]}>
              Going: <Text style={{ fontWeight: '700' }}>{stats.goingCount}</Text>
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={[styles.legendTxt, isDark ? styles.subDark : styles.subLight]}>
              Interested: <Text style={{ fontWeight: '700' }}>{stats.interestedCount}</Text>
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={[styles.legendTxt, isDark ? styles.subDark : styles.subLight]}>
              Not Going: <Text style={{ fontWeight: '700' }}>{stats.notGoingCount}</Text>
            </Text>
          </View>
          <View style={[styles.legendItem, { marginLeft: 'auto' }]}>
            <Users size={12} color={isDark ? '#94A3B8' : '#64748B'} style={{ marginRight: 3 }} />
            <Text style={[styles.legendTxt, { fontWeight: '800' }, isDark ? styles.textDark : styles.textLight]}>
              {total} Total
            </Text>
          </View>
        </View>
      </View>

      {/* Deadline Info Footer */}
      {rsvpDeadline && (
        <View
          style={[
            styles.deadlineContainer,
            isDark ? styles.deadlineContainerDark : styles.deadlineContainerLight,
          ]}
        >
          <Clock size={13} color={isDeadlinePassed ? '#EF4444' : isDark ? '#A5B4FC' : '#4F46E5'} />
          <Text
            style={[
              styles.deadlineTxt,
              {
                color: isDeadlinePassed
                  ? '#EF4444'
                  : isDark
                  ? '#C7D2FE'
                  : '#3730A3',
              },
            ]}
          >
            {isDeadlinePassed
              ? `RSVP closed on ${rsvpDeadline}`
              : `RSVP Deadline: ${rsvpDeadline} · You can change your response anytime before deadline.`}
          </Text>
        </View>
      )}

      {/* ── Admin Action to View Detailed Participation Analytics ── */}
      {isAdmin && onViewAnalytics && (
        <TouchableOpacity
          style={[
            styles.adminAnalyticsBtn,
            isDark ? styles.adminAnalyticsBtnDark : styles.adminAnalyticsBtnLight,
          ]}
          onPress={onViewAnalytics}
          activeOpacity={0.85}
        >
          <BarChart3 size={15} color={isDark ? '#A5B4FC' : '#4338CA'} />
          <Text
            style={[
              styles.adminAnalyticsBtnTxt,
              { color: isDark ? '#A5B4FC' : '#4338CA' },
            ]}
          >
            Admin: View Detailed Participation & Member Roster
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default EventRsvpPollCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1.5,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E7FF',
    ...Platform.select({
      ios: {
        shadowColor: '#4F46E5',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardDark: {
    backgroundColor: '#18181B',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  textLight: {
    color: '#0F172A',
  },
  textDark: {
    color: '#F8FAFC',
  },
  subLight: {
    color: '#64748B',
  },
  subDark: {
    color: '#94A3B8',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapLight: {
    backgroundColor: '#EEF2FF',
  },
  iconWrapDark: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  closedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  closedBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  questionBox: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  questionText: {
    fontSize: 15,
    fontWeight: '800',
  },
  questionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  optionBtnLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  optionBtnDark: {
    backgroundColor: '#27272A',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedBadge: {
    position: 'absolute',
    top: -6,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    zIndex: 10,
  },
  optEmoji: {
    fontSize: 18,
    marginBottom: 4,
  },
  optLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  optSub: {
    fontSize: 9,
    marginBottom: 8,
    textAlign: 'center',
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  countPillLight: {
    backgroundColor: '#E2E8F0',
  },
  countPillDark: {
    backgroundColor: '#3F3F46',
  },
  countPillTxt: {
    fontSize: 10,
    fontWeight: '700',
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  submittingTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  progressBarWrapper: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  emptyBar: {
    height: 8,
    width: '100%',
    borderRadius: 4,
  },
  segmentedBar: {
    flexDirection: 'row',
    height: 8,
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTxt: {
    fontSize: 11,
  },
  deadlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 10,
    marginTop: 10,
  },
  deadlineContainerLight: {
    backgroundColor: '#EEF2FF',
  },
  deadlineContainerDark: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  deadlineTxt: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  adminAnalyticsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  adminAnalyticsBtnLight: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  adminAnalyticsBtnDark: {
    backgroundColor: 'rgba(99, 102, 241, 0.20)',
    borderColor: 'rgba(99, 102, 241, 0.40)',
  },
  adminAnalyticsBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
  },
});

