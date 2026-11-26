import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  ClipboardCheck,
  Plus,
  Heart,
  Megaphone,
  Home,
  MapPin,
} from 'lucide-react-native';
import { AdminTabContext } from '../../../context/AdminTabContext';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import CareCellService from '../../../services/CareCellService';
import { useAdminTheme, createAdminThemedStyles } from '../../../utils/adminThemeHelper';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import {
  makeScopedCacheKey,
  getInstantMemory,
  loadWithInstantCache,
} from '../../../utils/instantCache';
import { CareCell, CareCellMeeting } from '../../../types/CareCellTypes';

const { width } = Dimensions.get('window');

type SubTabKey = 'overview' | 'manage' | 'members' | 'locations' | 'meetings' | 'attendance' | 'visits' | 'followups' | 'announcements';

const SUB_TABS = [
  { key: 'overview' as SubTabKey, label: 'Overview', icon: LayoutDashboard },
  { key: 'manage' as SubTabKey, label: 'Care Cells', icon: Building2 },
  { key: 'members' as SubTabKey, label: 'Members', icon: Users },
  { key: 'locations' as SubTabKey, label: 'Member Locations', icon: MapPin },
  { key: 'meetings' as SubTabKey, label: 'Meetings', icon: Calendar },
  { key: 'attendance' as SubTabKey, label: 'Attendance', icon: ClipboardCheck },
  { key: 'visits' as SubTabKey, label: 'Visits', icon: Home },
  { key: 'followups' as SubTabKey, label: 'Follow-ups', icon: Heart },
  { key: 'announcements' as SubTabKey, label: 'Notices & Prayer', icon: Megaphone },
];

export default function AdminCareCellsHub() {
  const { isDark, screenBg, cardSurface, primaryText, secondaryText, borderColor } = useAdminTheme();
  const primaryBtnBg = isDark ? '#FFFFFF' : '#0F172A';
  const primaryBtnText = isDark ? '#000000' : '#FFFFFF';
  const inactivePillBg = isDark ? '#18181B' : '#FFFFFF';
  const inactivePillBorder = isDark ? '#27272A' : '#CBD5E1';

  const insets = useSafeAreaInsets();
  const { goBack, setTabByName } = useContext(AdminTabContext);
  const { user, member, isPlatformSuperAdmin } = useAuth();
  const { activeChurch } = useChurch();
  const activeChurchId = activeChurch?.id || RHEMA_CHURCH_ID;
  const cellsCacheKey = useMemo(
    () =>
      makeScopedCacheKey(
        'admin_care_cells_list_v1',
        activeChurchId,
        isPlatformSuperAdmin ? 'superadmin' : user?.uid || member?.id || 'admin'
      ),
    [activeChurchId, isPlatformSuperAdmin, user?.uid, member?.id]
  );

  const initialCellsCache = useMemo(
    () => getInstantMemory<CareCell[]>(cellsCacheKey),
    [cellsCacheKey]
  );

  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('overview');
  const [cells, setCells] = useState<CareCell[]>(initialCellsCache || []);
  const [loadingCells, setLoadingCells] = useState(!initialCellsCache);

  // Selected cell context shared across tabs
  const [selectedCellId, setSelectedCellId] = useState<string>(() =>
    initialCellsCache && initialCellsCache.length > 0 ? initialCellsCache[0].id : ''
  );
  const [selectedMeetingForAttendance, setSelectedMeetingForAttendance] = useState<CareCellMeeting | null>(null);

  // Modals
  const [createCellModalVisible, setCreateCellModalVisible] = useState(false);
  const [editingCell, setEditingCell] = useState<CareCell | null>(null);

  const [createMeetingModalVisible, setCreateMeetingModalVisible] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<CareCellMeeting | null>(null);

  const loadAllCells = useCallback(
    async (forceRefresh = false) => {
      try {
        await loadWithInstantCache<CareCell[]>({
          key: cellsCacheKey,
          freshSkipMs: 45_000,
          forceRefresh,
          screenName: 'AdminCareCellsHub',
          fetcher: async () => {
            const list = await CareCellService.getCareCells(activeChurchId);
            return isPlatformSuperAdmin
              ? list
              : list.filter(
                  (c) =>
                    (Array.isArray(c.assignedAdminIds) && c.assignedAdminIds.includes(user?.uid)) ||
                    c.leaderId === member?.id ||
                    c.leaderId === user?.uid ||
                    c.assistantLeaderId === member?.id ||
                    c.assistantLeaderId === user?.uid
                );
          },
          onCached: (cached) => {
            setCells(cached);
            if (cached.length > 0) {
              setSelectedCellId((prev) => prev || cached[0].id);
            }
            setLoadingCells(false);
          },
          onFresh: (fresh) => {
            setCells(fresh);
            if (fresh.length > 0) {
              setSelectedCellId((prev) => prev || fresh[0].id);
            }
            setLoadingCells(false);
          },
        });
      } catch (e) {
        console.error('Error loading Care Cells in AdminCareCellsHub:', e);
      } finally {
        setLoadingCells(false);
      }
    },
    [cellsCacheKey, activeChurchId, isPlatformSuperAdmin, user?.uid, member?.id]
  );

  useEffect(() => {
    loadAllCells(false);
  }, [loadAllCells]);

  const handleBack = () => {
    if (goBack) {
      goBack();
    } else if (setTabByName) {
      setTabByName('Dashboard');
    }
  };

  const activeCellsCount = cells.filter((c) => c.status === 'Active').length;
  const headerTopPadding =
    Platform.OS === 'android'
      ? Math.max(insets.top, StatusBar.currentHeight || 28) + 6
      : insets.top + 6;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={screenBg} />

      {/* Hero Header */}
      <View
        style={[
          styles.heroHeader,
          {
            paddingTop: headerTopPadding,
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {/* Left: Back Button */}
          <View style={{ minWidth: 40, alignItems: 'flex-start', justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={handleBack}
              style={styles.circularBackBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* Middle: Title */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text
              style={[
                styles.headerTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                },
              ]}
              numberOfLines={1}
            >
              Care Cells
            </Text>
            <Text style={[styles.headerSubtitle, { color: isDark ? '#A1A1AA' : '#64748B' }]} numberOfLines={1}>
              {activeCellsCount} active fellowship {activeCellsCount === 1 ? 'group' : 'groups'}
            </Text>
          </View>

          {/* Right: + New Button */}
          <View style={{ minWidth: 40, alignItems: 'flex-end', justifyContent: 'center' }}>
            {isPlatformSuperAdmin ? (
              <TouchableOpacity
                style={[
                  styles.quickAddHeaderBtn,
                  {
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    borderColor: isDark ? '#FFFFFF' : '#000000',
                  },
                ]}
                onPress={() => {
                  setEditingCell(null);
                  setCreateCellModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} style={{ marginRight: 4 }} />
                <Text style={[styles.quickAddHeaderBtnTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                  New Cell
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40, height: 40 }} />
            )}
          </View>
        </View>
      </View>

      {/* Segmented Subtab Navigation Bar */}
      <View style={styles.tabBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarScroll}>
          {SUB_TABS.map((tab) => {
            const isActive = activeSubTab === tab.key;
            const Icon = tab.icon;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabPill,
                  {
                    backgroundColor: isActive ? primaryBtnBg : inactivePillBg,
                    borderColor: isActive ? primaryBtnBg : inactivePillBorder,
                  },
                ]}
                onPress={() => setActiveSubTab(tab.key)}
                activeOpacity={0.85}
              >
                <Icon
                  size={14}
                  color={isActive ? primaryBtnText : secondaryText}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <Text
                  style={[
                    styles.tabPillTxt,
                    { color: isActive ? primaryBtnText : secondaryText },
                    isActive && styles.tabPillTxtActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tab Views (lazy-required per active subtab so heavy maps/tabs never parse upfront) */}
      <View style={styles.tabContentArea}>
        {(() => {
          switch (activeSubTab) {
            case 'overview': {
              const CareCellsOverviewTab = require('./tabs/CareCellsOverviewTab').default;
              return (
                <CareCellsOverviewTab
                  churchId={activeChurchId}
                  cells={cells}
                  onNavigateTab={(idxOrKey: number | SubTabKey) => {
                    const target =
                      typeof idxOrKey === 'string'
                        ? idxOrKey
                        : SUB_TABS[idxOrKey]?.key || 'overview';
                    setActiveSubTab(target);
                  }}
                  onOpenCreateCell={() => {
                    setEditingCell(null);
                    setCreateCellModalVisible(true);
                  }}
                  onOpenCreateMeeting={() => {
                    setEditingMeeting(null);
                    setCreateMeetingModalVisible(true);
                  }}
                />
              );
            }
            case 'manage': {
              const CareCellsManageTab = require('./tabs/CareCellsManageTab').default;
              return (
                <CareCellsManageTab
                  cells={cells}
                  onRefreshCells={() => loadAllCells(true)}
                  onOpenCreateCell={() => {
                    setEditingCell(null);
                    setCreateCellModalVisible(true);
                  }}
                  onEditCell={(cell: CareCell) => {
                    setEditingCell(cell);
                    setCreateCellModalVisible(true);
                  }}
                  onManageMembers={(cell: CareCell) => {
                    setSelectedCellId(cell.id);
                    setActiveSubTab('members');
                  }}
                  onViewMeetings={(cell: CareCell) => {
                    setSelectedCellId(cell.id);
                    setActiveSubTab('meetings');
                  }}
                />
              );
            }
            case 'members': {
              const CareCellMembersTab = require('./tabs/CareCellMembersTab').default;
              return (
                <CareCellMembersTab
                  churchId={activeChurchId}
                  cells={cells}
                  selectedCellId={selectedCellId}
                  onSelectCellId={setSelectedCellId}
                />
              );
            }
            case 'locations': {
              const CareCellMemberLocationsTab = require('./tabs/CareCellMemberLocationsTab').default;
              return (
                <CareCellMemberLocationsTab
                  churchId={activeChurchId}
                  cells={cells}
                  selectedCellId={selectedCellId}
                  onSelectCellId={setSelectedCellId}
                />
              );
            }
            case 'meetings': {
              const CareCellMeetingsTab = require('./tabs/CareCellMeetingsTab').default;
              return (
                <CareCellMeetingsTab
                  churchId={activeChurchId}
                  cells={cells}
                  selectedCellId={selectedCellId}
                  onSelectCellId={setSelectedCellId}
                  onOpenCreateMeeting={() => {
                    setEditingMeeting(null);
                    setCreateMeetingModalVisible(true);
                  }}
                  onEditMeeting={(meeting: CareCellMeeting) => {
                    setEditingMeeting(meeting);
                    setCreateMeetingModalVisible(true);
                  }}
                  onMarkAttendance={(meeting: CareCellMeeting) => {
                    setSelectedMeetingForAttendance(meeting);
                    setActiveSubTab('attendance');
                  }}
                />
              );
            }
            case 'attendance': {
              const CareCellAttendanceTab = require('./tabs/CareCellAttendanceTab').default;
              return (
                <CareCellAttendanceTab
                  churchId={activeChurchId}
                  cells={cells}
                  selectedMeeting={selectedMeetingForAttendance}
                  onClearSelectedMeeting={() => setSelectedMeetingForAttendance(null)}
                />
              );
            }
            case 'visits': {
              const CareCellVisitsTab = require('./tabs/CareCellVisitsTab').default;
              return (
                <CareCellVisitsTab
                  churchId={activeChurchId}
                  cells={cells}
                  selectedCellId={selectedCellId}
                  onSelectCellId={setSelectedCellId}
                />
              );
            }
            case 'followups': {
              const CareCellFollowupsTab = require('./tabs/CareCellFollowupsTab').default;
              return (
                <CareCellFollowupsTab
                  churchId={activeChurchId}
                  cells={cells}
                  selectedCellId={selectedCellId}
                  onSelectCell={setSelectedCellId}
                />
              );
            }
            case 'announcements': {
              const CareCellAnnouncePrayerTab = require('./tabs/CareCellAnnouncePrayerTab').default;
              return (
                <CareCellAnnouncePrayerTab
                  churchId={activeChurchId}
                  cells={cells}
                />
              );
            }
            default:
              return null;
          }
        })()}
      </View>

      {/* Create / Edit Care Cell Modal (lazy-required & mounted only while open) */}
      {createCellModalVisible && (() => {
        const CareCellFormModal = require('./components/CareCellFormModal').default;
        return (
          <CareCellFormModal
            visible={createCellModalVisible}
            cellToEdit={editingCell}
            onClose={() => {
              setCreateCellModalVisible(false);
              setEditingCell(null);
            }}
            onSaved={() => loadAllCells(true)}
          />
        );
      })()}

      {/* Create / Edit Meeting Modal (lazy-required & mounted only while open) */}
      {createMeetingModalVisible && (() => {
        const MeetingFormModal = require('./components/MeetingFormModal').default;
        return (
          <MeetingFormModal
            visible={createMeetingModalVisible}
            cells={cells}
            defaultCellId={selectedCellId}
            meetingToEdit={editingMeeting}
            onClose={() => {
              setCreateMeetingModalVisible(false);
              setEditingMeeting(null);
            }}
            onSaved={() => loadAllCells(true)}
          />
        );
      })()}
    </SafeAreaView>
  );
}

const styles = createAdminThemedStyles({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
    textAlign: 'center',
  },
  quickAddHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 999,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  quickAddHeaderBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
  },
  tabBarContainer: {
    marginBottom: 8,
  },
  tabBarScroll: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  tabPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tabPillTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  tabPillTxtActive: {
    fontWeight: '800',
  },
  tabContentArea: {
    flex: 1,
  },
});

