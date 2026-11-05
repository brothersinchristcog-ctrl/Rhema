import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import {
  X,
  Search,
  Download,
  Share2,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  Phone,
  MessageCircle,
  Filter,
  BarChart2,
} from 'lucide-react-native';
import EventRsvpService, {
  EventRsvpRecord,
  EventRsvpStatus,
  EventRsvpStats,
  MemberRsvpListItem,
} from '../../services/EventRsvpService';
import FirestoreService from '../../services/FirestoreService';

const { width } = Dimensions.get('window');

export interface EventRsvpAnalyticsModalProps {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  eventDate?: string;
  churchId?: string;
  isDark?: boolean;
}

type FilterOption = 'All' | 'Going' | 'Interested' | 'Not Going' | 'Not Responded';

export const EventRsvpAnalyticsModal: React.FC<EventRsvpAnalyticsModalProps> = ({
  visible,
  onClose,
  eventId,
  eventTitle,
  eventDate,
  churchId,
  isDark = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvpRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterOption>('All');
  const [exporting, setExporting] = useState(false);

  // Load church members and subscribe to RSVPs
  useEffect(() => {
    if (!visible || !eventId) return;

    let isMounted = true;
    setLoading(true);

    const initData = async () => {
      try {
        const cId = churchId || (await FirestoreService.getChurchId()) || 'rhema';
        const churchMembers = await EventRsvpService.getChurchMembersForRsvp(cId);
        if (isMounted) {
          setMembers(churchMembers);
        }
      } catch (err) {
        console.warn('[EventRsvpAnalyticsModal] Failed to load church members:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initData();

    // Subscribe to all RSVPs for this event in real-time
    const unsub = EventRsvpService.listenToAllEventRsvps(
      churchId,
      eventId,
      (records) => {
        if (isMounted) {
          setRsvps(records);
        }
      }
    );

    return () => {
      isMounted = false;
      unsub();
    };
  }, [visible, eventId, churchId]);

  // Combine members and RSVP responses into a comprehensive roster
  const combinedRoster = useMemo<MemberRsvpListItem[]>(() => {
    const rsvpMap = new Map<string, EventRsvpRecord>();
    rsvps.forEach((r) => {
      rsvpMap.set(r.memberId || r.id, r);
    });

    // Start with all church members
    const roster: MemberRsvpListItem[] = members.map((m) => {
      const r = rsvpMap.get(m.id);
      return {
        id: m.id,
        name: m.name || m.fullName || 'Member',
        phone: m.phone || m.phoneNumber || '',
        photo: m.photoUrl || m.profilePicture || '',
        status: r ? r.status : 'Not Responded',
        respondedAt: r?.updatedAt || r?.createdAt || null,
      };
    });

    // Also include any RSVPs that might not be in the church member collection
    rsvps.forEach((r) => {
      if (!roster.some((item) => item.id === (r.memberId || r.id))) {
        roster.push({
          id: r.memberId || r.id,
          name: r.memberName || 'Member',
          phone: r.memberPhone || '',
          photo: r.memberPhoto || '',
          status: r.status,
          respondedAt: r.updatedAt || r.createdAt,
        });
      }
    });

    return roster;
  }, [members, rsvps]);

  // Compute live participation stats
  const stats = useMemo(() => {
    const totalInvited = combinedRoster.length;
    let goingCount = 0;
    let interestedCount = 0;
    let notGoingCount = 0;
    let notRespondedCount = 0;

    combinedRoster.forEach((m) => {
      if (m.status === 'Going') goingCount++;
      else if (m.status === 'Interested') interestedCount++;
      else if (m.status === 'Not Going') notGoingCount++;
      else notRespondedCount++;
    });

    const totalResponses = goingCount + interestedCount + notGoingCount;
    const responseRate = totalInvited > 0 ? Math.round((totalResponses / totalInvited) * 100) : 0;
    const goingRate = totalInvited > 0 ? Math.round((goingCount / totalInvited) * 100) : 0;

    return {
      totalInvited,
      totalResponses,
      goingCount,
      interestedCount,
      notGoingCount,
      notRespondedCount,
      responseRate,
      goingRate,
    };
  }, [combinedRoster]);

  // Filter roster by search query and selected status pill
  const filteredRoster = useMemo(() => {
    let result = combinedRoster;

    if (selectedFilter !== 'All') {
      result = result.filter((item) => item.status === selectedFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter((item) => {
        const nameMatch = item.name.toLowerCase().includes(query);
        const phoneMatch = item.phone?.toLowerCase().includes(query);
        return nameMatch || phoneMatch;
      });
    }

    // Sort: Going first, then Interested, then Not Going, then Not Responded
    const order: Record<string, number> = {
      'Going': 1,
      'Interested': 2,
      'Not Going': 3,
      'Not Responded': 4,
    };

    return [...result].sort((a, b) => {
      const rankA = order[a.status] || 5;
      const rankB = order[b.status] || 5;
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    });
  }, [combinedRoster, selectedFilter, searchQuery]);

  // Handle CSV Export & Share
  const handleExport = async () => {
    try {
      setExporting(true);
      await EventRsvpService.exportParticipationReport({
        eventTitle,
        eventDate: eventDate || 'Upcoming',
        stats: {
          goingCount: stats.goingCount,
          interestedCount: stats.interestedCount,
          notGoingCount: stats.notGoingCount,
          totalResponses: stats.totalResponses,
        },
        rsvps,
        members: combinedRoster,
      });
    } catch (err: any) {
      console.error('[EventRsvpAnalyticsModal] Export error:', err);
      Alert.alert('Export Failed', err.message || 'Could not export participation report.');
    } finally {
      setExporting(false);
    }
  };

  // Direct Phone Call
  const handleCall = (phone?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No contact number registered for this member.');
      return;
    }
    const clean = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${clean}`);
  };

  // Direct WhatsApp Message
  const handleWhatsApp = (name: string, phone?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No mobile number registered for this member.');
      return;
    }
    const clean = phone.replace(/[^0-9]/g, '');
    const intl = clean.startsWith('91') ? clean : `91${clean.slice(-10)}`;
    const msg = encodeURIComponent(
      `Hello ${name}, regarding "${eventTitle}" on ${eventDate || 'our upcoming service'}, we look forward to having you! Please let us know if you need any assistance.`
    );
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };

  // Status Badge Component
  const renderStatusBadge = (status: MemberRsvpListItem['status']) => {
    switch (status) {
      case 'Going':
        return (
          <View style={[styles.badge, styles.badgeGoing]}>
            <CheckCircle2 size={11} color="#047857" style={{ marginRight: 3 }} />
            <Text style={[styles.badgeTxt, styles.badgeTxtGoing]}>Going</Text>
          </View>
        );
      case 'Interested':
        return (
          <View style={[styles.badge, styles.badgeInterested]}>
            <Clock size={11} color="#B45309" style={{ marginRight: 3 }} />
            <Text style={[styles.badgeTxt, styles.badgeTxtInterested]}>Interested</Text>
          </View>
        );
      case 'Not Going':
        return (
          <View style={[styles.badge, styles.badgeNotGoing]}>
            <XCircle size={11} color="#B91C1C" style={{ marginRight: 3 }} />
            <Text style={[styles.badgeTxt, styles.badgeTxtNotGoing]}>Not Going</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.badge, styles.badgeNoResponse]}>
            <HelpCircle size={11} color="#64748B" style={{ marginRight: 3 }} />
            <Text style={[styles.badgeTxt, styles.badgeTxtNoResponse]}>Not Responded</Text>
          </View>
        );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
        {/* ── Header ── */}
        <View style={[styles.header, isDark ? styles.headerDark : styles.headerLight]}>
          <TouchableOpacity
            style={[styles.closeBtn, isDark ? styles.closeBtnDark : styles.closeBtnLight]}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color={isDark ? '#F1F5F9' : '#0F172A'} />
          </TouchableOpacity>

          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={[styles.headerTitle, isDark ? styles.textDark : styles.textLight]} numberOfLines={1}>
              RSVP Participation
            </Text>
            <Text style={[styles.headerSub, isDark ? styles.subDark : styles.subLight]} numberOfLines={1}>
              {eventTitle} {eventDate ? `· ${eventDate}` : ''}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.exportBtn}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.8}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Share2 size={14} color="#FFFFFF" />
                <Text style={styles.exportBtnTxt}>Export</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={[styles.loadingTxt, isDark ? styles.subDark : styles.subLight]}>
              Loading participation records...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredRoster}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <>
                {/* ── KPI Metrics Cards ── */}
                <View style={styles.kpiGrid}>
                  {/* Total Invited */}
                  <View style={[styles.kpiCard, isDark ? styles.kpiCardDark : styles.kpiCardLight]}>
                    <Text style={[styles.kpiLabel, isDark ? styles.subDark : styles.subLight]}>INVITED</Text>
                    <Text style={[styles.kpiValue, isDark ? styles.textDark : styles.textLight]}>
                      {stats.totalInvited}
                    </Text>
                    <Text style={[styles.kpiSub, isDark ? styles.subDark : styles.subLight]}>
                      Active members
                    </Text>
                  </View>

                  {/* Going */}
                  <View style={[styles.kpiCard, styles.kpiCardGoing, isDark && styles.kpiCardDark]}>
                    <Text style={[styles.kpiLabel, { color: '#047857' }]}>GOING</Text>
                    <Text style={[styles.kpiValue, { color: '#059669' }]}>
                      {stats.goingCount}
                    </Text>
                    <Text style={[styles.kpiSub, { color: '#047857' }]}>
                      {stats.goingRate}% of invited
                    </Text>
                  </View>

                  {/* Interested */}
                  <View style={[styles.kpiCard, styles.kpiCardInterested, isDark && styles.kpiCardDark]}>
                    <Text style={[styles.kpiLabel, { color: '#B45309' }]}>INTERESTED</Text>
                    <Text style={[styles.kpiValue, { color: '#D97706' }]}>
                      {stats.interestedCount}
                    </Text>
                    <Text style={[styles.kpiSub, { color: '#B45309' }]}>
                      May attend
                    </Text>
                  </View>

                  {/* Not Going */}
                  <View style={[styles.kpiCard, styles.kpiCardNotGoing, isDark && styles.kpiCardDark]}>
                    <Text style={[styles.kpiLabel, { color: '#B91C1C' }]}>NOT GOING</Text>
                    <Text style={[styles.kpiValue, { color: '#DC2626' }]}>
                      {stats.notGoingCount}
                    </Text>
                    <Text style={[styles.kpiSub, { color: '#B91C1C' }]}>
                      Cannot attend
                    </Text>
                  </View>

                  {/* Not Responded */}
                  <View style={[styles.kpiCard, isDark ? styles.kpiCardDark : styles.kpiCardLight]}>
                    <Text style={[styles.kpiLabel, isDark ? styles.subDark : styles.subLight]}>PENDING</Text>
                    <Text style={[styles.kpiValue, { color: '#64748B' }]}>
                      {stats.notRespondedCount}
                    </Text>
                    <Text style={[styles.kpiSub, isDark ? styles.subDark : styles.subLight]}>
                      No response yet
                    </Text>
                  </View>
                </View>

                {/* ── Participation Rate Banner ── */}
                <View
                  style={[
                    styles.rateBanner,
                    isDark ? styles.rateBannerDark : styles.rateBannerLight,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rateTitle, isDark ? styles.textDark : styles.textLight]}>
                      Participation Rate: {stats.responseRate}%
                    </Text>
                    <Text style={[styles.rateSub, isDark ? styles.subDark : styles.subLight]}>
                      {stats.totalResponses} out of {stats.totalInvited} members have confirmed their availability
                    </Text>
                  </View>
                  <View style={styles.ratePill}>
                    <BarChart2 size={14} color="#4F46E5" />
                    <Text style={styles.ratePillTxt}>{stats.goingCount} Going</Text>
                  </View>
                </View>

                {/* ── Search Bar ── */}
                <View
                  style={[
                    styles.searchBox,
                    isDark ? styles.searchBoxDark : styles.searchBoxLight,
                  ]}
                >
                  <Search size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                  <TextInput
                    style={[styles.searchInput, isDark ? styles.textDark : styles.textLight]}
                    placeholder="Search by member name or phone..."
                    placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <X size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── Filter Pills ── */}
                <View style={styles.filterRow}>
                  {(
                    [
                      { key: 'All', label: `All (${combinedRoster.length})` },
                      { key: 'Going', label: `Going (${stats.goingCount})` },
                      { key: 'Interested', label: `Interested (${stats.interestedCount})` },
                      { key: 'Not Going', label: `Not Going (${stats.notGoingCount})` },
                      { key: 'Not Responded', label: `Pending (${stats.notRespondedCount})` },
                    ] as { key: FilterOption; label: string }[]
                  ).map((f) => {
                    const isSelected = selectedFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[
                          styles.filterPill,
                          isDark ? styles.filterPillDark : styles.filterPillLight,
                          isSelected && styles.filterPillActive,
                        ]}
                        onPress={() => setSelectedFilter(f.key)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.filterPillTxt,
                            isDark ? styles.subDark : styles.subLight,
                            isSelected && styles.filterPillTxtActive,
                          ]}
                        >
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.rosterHeader}>
                  <Text style={[styles.rosterTitle, isDark ? styles.textDark : styles.textLight]}>
                    Member Response Roster ({filteredRoster.length})
                  </Text>
                </View>
              </>
            }
            renderItem={({ item, index }) => (
              <View
                style={[
                  styles.rosterCard,
                  isDark ? styles.rosterCardDark : styles.rosterCardLight,
                ]}
              >
                {/* Avatar / Index */}
                <View style={[styles.avatar, isDark ? styles.avatarDark : styles.avatarLight]}>
                  <Text style={[styles.avatarTxt, isDark ? styles.textDark : styles.textLight]}>
                    {item.name ? item.name.charAt(0).toUpperCase() : '#'}
                  </Text>
                </View>

                {/* Details */}
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={[styles.memberName, isDark ? styles.textDark : styles.textLight]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.memberPhone, isDark ? styles.subDark : styles.subLight]}>
                    {item.phone || 'No phone registered'}
                  </Text>
                </View>

                {/* Status Badge */}
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {renderStatusBadge(item.status)}

                  {/* Actions: Call & WhatsApp */}
                  {!!item.phone && (
                    <View style={styles.memberActions}>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleCall(item.phone)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Phone size={13} color="#059669" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: '#ECFDF5' }]}
                        onPress={() => handleWhatsApp(item.name, item.phone)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MessageCircle size={13} color="#10B981" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Users size={36} color={isDark ? '#52525B' : '#CBD5E1'} />
                <Text style={[styles.emptyTitle, isDark ? styles.textDark : styles.textLight]}>
                  No members found
                </Text>
                <Text style={[styles.emptySub, isDark ? styles.subDark : styles.subLight]}>
                  {searchQuery
                    ? `No matching results for "${searchQuery}"`
                    : 'No members match the selected filter.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
};

export default EventRsvpAnalyticsModal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerLight: {
    backgroundColor: '#F8FAFC',
  },
  containerDark: {
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLight: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E2E8F0',
  },
  headerDark: {
    backgroundColor: '#1E293B',
    borderBottomColor: '#334155',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnLight: {
    backgroundColor: '#F1F5F9',
  },
  closeBtnDark: {
    backgroundColor: '#334155',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  exportBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingTxt: {
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: '28%',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  kpiCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  kpiCardDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  kpiCardGoing: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  kpiCardInterested: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kpiCardNotGoing: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 10,
  },
  rateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    gap: 10,
  },
  rateBannerLight: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  rateBannerDark: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  rateTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  rateSub: {
    fontSize: 11,
    marginTop: 2,
  },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  ratePillTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchBoxLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  searchBoxDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  filterPillDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterPillTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  filterPillTxtActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rosterTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rosterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  rosterCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  rosterCardDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLight: {
    backgroundColor: '#EEF2FF',
  },
  avatarDark: {
    backgroundColor: '#334155',
  },
  avatarTxt: {
    fontSize: 14,
    fontWeight: '800',
  },
  memberName: {
    fontSize: 13,
    fontWeight: '700',
  },
  memberPhone: {
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeGoing: {
    backgroundColor: '#ECFDF5',
  },
  badgeInterested: {
    backgroundColor: '#FFFBEB',
  },
  badgeNotGoing: {
    backgroundColor: '#FEF2F2',
  },
  badgeNoResponse: {
    backgroundColor: '#F1F5F9',
  },
  badgeTxt: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTxtGoing: {
    color: '#047857',
  },
  badgeTxtInterested: {
    color: '#B45309',
  },
  badgeTxtNotGoing: {
    color: '#B91C1C',
  },
  badgeTxtNoResponse: {
    color: '#64748B',
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

