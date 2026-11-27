import firestore from '@react-native-firebase/firestore';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Image, Dimensions, Alert, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  BookOpen, 
  BookPlus, 
  Calendar, 
  Mic, 
  PlusSquare, 
  Bell, 
  MapPin, 
  LogOut,
  Grid,
  Heart,
  Users,
  Gift,
  Smartphone,
  Info,
  Phone,
  Settings,
  CreditCard,
  MessageCircle,
  ClipboardCheck,
  Wallet,
  Home,
  MoreHorizontal,
  HeartHandshake,
  Sparkles,
  Droplets,
  Video,
  Music,
  CalendarPlus,
  CalendarDays,
  Briefcase,
  Crown,
  CalendarClock,
  Building2,
  Sliders,
  ChevronLeft,
  Eye,
  X,
  Image as ImageIcon,
  Award,
  UserCheck,
  Shield,
  Video as VideoIcon,
  Headset
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useAdminTheme } from '../utils/adminThemeHelper';
import Theme from '../theme/Theme';
import { AdminTabContext } from '../context/AdminTabContext';
import { CustomAlert } from '../components/CustomAlert';
import AdminDashboard from '../screens/admin/AdminDashboard';
import ChurchService from '../services/ChurchService';
import { RHEMA_CHURCH_ID } from '../constants/ChurchConfig';
import { isSuperAdminMember } from '../utils/roleUtils';
import { perfMonitor } from '../utils/perfMonitor';
import { getModuleKeyForAdminTab } from '../constants/AdminModules';

const { width } = Dimensions.get('window');

const DotGridIcon = ({ color, size }: { color: string; size: number }) => {
  const dotSize = size * 0.22;
  return (
    <View style={{ width: size, height: size, justifyContent: 'space-between' }}>
      {[0, 1, 2].map(row => (
        <View key={row} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[0, 1, 2].map(col => (
            <View key={col} style={{ 
              width: dotSize, 
              height: dotSize, 
              borderRadius: dotSize / 2, 
              backgroundColor: color 
            }} />
          ))}
        </View>
      ))}
    </View>
  );
};

export default function AdminNavigator({ navigation, route }: any) {
  const { signOut, user, member, setViewMode, isPlatformSuperAdmin, canAccessAdminModule } = useAuth();
  const { activeChurch, isImpersonating, impersonatedBranchName, stopImpersonation } = useChurch();



  const { isDark, colors, fontStyle, scaleFont, appFontFamily, screenBg, cardSurface, primaryText, secondaryText } = useAdminTheme();
  const isSuperAdminUser = isSuperAdminMember(member, isPlatformSuperAdmin);

  const [activeTab, setActiveTab] = useState(0);
  const [tabHistory, setTabHistory] = useState<number[]>([]);
  const [editingData, setEditingData] = useState(null);
  const activeTabRef = useRef(0);
  const tabHistoryRef = useRef<number[]>([]);
  activeTabRef.current = activeTab;
  tabHistoryRef.current = tabHistory;

  const [hasCareCellAccess, setHasCareCellAccess] = useState(false);

  useEffect(() => {
    if (isSuperAdminUser) {
      setHasCareCellAccess(true);
      return;
    }
    if (!user?.uid) {
      setHasCareCellAccess(false);
      return;
    }

    const churchId = activeChurch?.id || RHEMA_CHURCH_ID;

    // Bounded real-time listener for cell assignments (serves cache first and updates live)
    const unsubscribe = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('careCells')
      .limit(100)
      .onSnapshot((snap) => {
        if (snap) {
          const matching = snap.docs.some(doc => {
            const d = doc.data();
            const assigned = Array.isArray(d.assignedAdminIds) ? d.assignedAdminIds : [];
            return assigned.includes(user.uid) || d.leaderId === user.uid || d.assistantLeaderId === user.uid;
          });
          setHasCareCellAccess(matching);
        }
      }, (err) => {
        console.warn('⚠️ [AdminNavigator] Care Cells access listener error:', err);
      });

    return () => unsubscribe();
  }, [user?.uid, isSuperAdminUser, activeChurch?.id]);

  const dashboardScrollYRef = useRef(0);
  const getDashboardScrollY = useCallback(() => dashboardScrollYRef.current, []);
  const setDashboardScrollY = useCallback((y: number) => {
    dashboardScrollYRef.current = y;
  }, []);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error' | 'warning' | 'confirm';
    onConfirm?: () => void;
  }>({ visible: false, title: '', message: '', type: 'info' });

  const userTypeUpper = String(member?.userType || '').toUpperCase();
  const hasWhatsAppTabRole = userTypeUpper.includes('ADMIN') || userTypeUpper.includes('SUPER');

  const tabs = useMemo(() => {
    const rawTabs = [
      { name: 'Dashboard', icon: DotGridIcon, getComponent: () => AdminDashboard },
      ...(activeChurch?.isParentOrganization
        ? [{ name: 'Church Branches', icon: Building2, getComponent: () => require('../screens/admin/AdminOrganization').default }]
        : []),
      { name: 'Promises', icon: BookOpen, getComponent: () => require('../screens/admin/AdminPromiseList').default },
      { name: 'New Promise', icon: BookPlus, getComponent: () => require('../screens/admin/AdminPromiseEditor').default },
      { name: 'Schedule', icon: CalendarClock, getComponent: () => require('../screens/admin/AdminPromiseCalendar').default },
      ...(isSuperAdminUser
        ? [{ name: 'Daily Verses', icon: Sparkles, getComponent: () => require('../screens/admin/AdminDailyVersesManager').default }]
        : []),
      { name: 'Sermons', icon: Mic, getComponent: () => require('../screens/admin/AdminSermonList').default },
      { name: 'New Sermon', icon: Video, getComponent: () => require('../screens/admin/AdminSermonEditor').default },
      { name: 'Songs', icon: Music, getComponent: () => require('../screens/admin/AdminSongEditor').default },
      { name: 'Notifications', icon: Bell, getComponent: () => require('../screens/admin/AdminNotificationBroadcast').default },
      { name: 'Events', icon: CalendarDays, getComponent: () => require('../screens/admin/AdminEventList').default },
      { name: 'New Event', icon: CalendarPlus, getComponent: () => require('../screens/admin/AdminEventEditor').default },
      { name: 'Pastor Event', icon: Briefcase, getComponent: () => require('../screens/admin/pastor_events/PastorEventDashboard').default },
      { name: 'Prayers', icon: Heart, getComponent: () => require('../screens/admin/AdminPrayerModeration').default },
      { name: 'Testimonies', icon: Sparkles, getComponent: () => require('../screens/admin/AdminTestimonies').default },
      { name: 'Attendance', icon: ClipboardCheck, getComponent: () => require('../screens/admin/AdminAttendance').default },
      ...(isSuperAdminUser || hasCareCellAccess
        ? [{ name: 'Care Cells', icon: HeartHandshake, getComponent: () => require('../screens/admin/care_cells/AdminCareCellsHub').default }]
        : []),
      { name: 'Kids Ministry', icon: Crown, getComponent: () => require('../screens/admin/kids_ministry/AdminKidsHub').default },
      { name: 'Service Roster', icon: CalendarDays, getComponent: () => require('../screens/admin/AdminServicePlanner').default },
      { name: 'Job Circle', icon: Briefcase, getComponent: () => require('../screens/admin/job_circle/AdminJobCircleDashboard').default },
      { name: 'Volunteer Management', icon: HeartHandshake, getComponent: () => require('../screens/admin/AdminVolunteerManagement').default },
      { name: 'Members', icon: Users, getComponent: () => require('../screens/admin/AdminMembers').default },
      { name: 'Approvals', icon: UserCheck, getComponent: () => require('../screens/admin/AdminRegistrationApprovals').default },
      { name: 'Celebrations', icon: Gift, getComponent: () => require('../screens/admin/AdminCelebrations').default },
      { name: 'Gallery', icon: ImageIcon, getComponent: () => require('../screens/admin/gallery/AdminGalleryNavigator').default },
      ...(hasWhatsAppTabRole
        ? [{ name: 'WhatsApp', icon: MessageCircle, getComponent: () => require('../screens/admin/AdminWhatsAppInbox').default }]
        : []),
      { name: 'Support Team', icon: Headset, getComponent: () => require('../screens/admin/AdminSupportTeam').default },
      { name: 'Church Settings', icon: Sliders, getComponent: () => require('../screens/admin/AdminChurchSettings').default },
      ...(isSuperAdminUser
        ? [
            { name: 'Expense', icon: Wallet, getComponent: () => require('../screens/admin/AdminFinanceDashboard').default },
            { name: 'Donations', icon: HeartHandshake, getComponent: () => require('../screens/admin/DonationsDashboard').default },
          ]
        : []),
      { name: 'Online Meetings', icon: VideoIcon, getComponent: () => require('../screens/admin/AdminOnlineMeetings').default },
      { name: 'New Online Meeting', icon: VideoIcon, getComponent: () => require('../screens/admin/AdminOnlineMeetingEditor').default },
      { name: 'Bible Quiz', icon: Award, getComponent: () => require('../screens/admin/quiz/AdminQuizList').default },
      { name: 'Baptism', icon: Droplets, getComponent: () => require('../screens/admin/AdminBaptism').default },
      { name: 'Rhema Matrimony', icon: HeartHandshake, getComponent: () => require('../screens/admin/AdminMatrimonyScreen').default },
      ...(isSuperAdminUser
        ? [{ name: 'App Admin', icon: Shield, getComponent: () => require('../screens/admin/SuperAdminDashboard').default }]
        : []),
    ];

    return rawTabs.filter((tab) => {
      const moduleKey = getModuleKeyForAdminTab(tab.name);
      return canAccessAdminModule(moduleKey, hasCareCellAccess);
    });
  }, [activeChurch?.isParentOrganization, isSuperAdminUser, hasCareCellAccess, hasWhatsAppTabRole, canAccessAdminModule]);

  const activeTabNameRef = useRef<string>('Dashboard');
  useEffect(() => {
    const currentName = activeTabNameRef.current;
    if (!currentName) return;
    const newIndex = tabs.findIndex((t) => t.name === currentName);
    if (newIndex === -1) {
      activeTabNameRef.current = 'Dashboard';
      setActiveTab(0);
      setTabHistory([]);
      setEditingData(null);
      if (currentName !== 'Dashboard') {
        setAlertConfig({
          visible: true,
          title: 'Access Updated',
          message: `Access to "${currentName}" is no longer enabled for your account.`,
          type: 'info',
        });
      }
    } else if (newIndex !== activeTabRef.current) {
      setActiveTab(newIndex);
    }
  }, [tabs]);

  useEffect(() => {
    activeTabNameRef.current = tabs[activeTab]?.name || 'Dashboard';
  }, [activeTab, tabs]);

  useEffect(() => {
    if (route?.params?.targetTab) {
      const target = String(route.params.targetTab).trim();
      const lower = target.toLowerCase();
      const idx = tabs.findIndex(t => 
        t.name.toLowerCase() === lower ||
        (lower.includes('prayer') && t.name === 'Prayers') ||
        (lower.includes('baptism') && t.name === 'Baptism') ||
        (lower.includes('testimon') && t.name === 'Testimonies') ||
        (lower.includes('volunteer') && t.name === 'Volunteer Management') ||
        (lower.includes('job') && t.name === 'Job Circle') ||
        (lower.includes('matrimony') && t.name === 'Rhema Matrimony') ||
        (lower.includes('kids') && t.name === 'Kids Ministry') ||
        ((lower.includes('approv') || lower.includes('registrat')) && t.name === 'Approvals') ||
        ((lower.includes('roster') || lower.includes('service')) && t.name === 'Service Roster')
      );
      if (idx !== -1 && idx !== activeTabRef.current) {
        setTimeout(() => {
          const prevTab = activeTabRef.current;
          setTabHistory(prev => [...prev, prevTab]);
          setActiveTab(idx);
        }, 0);
      } else if (idx === -1 && lower !== 'dashboard') {
        setAlertConfig({
          visible: true,
          title: 'Access Restricted',
          message: `You do not have permission to open "${target}". Contact your Super Admin for access.`,
          type: 'warning',
        });
        navigation?.setParams?.({ targetTab: undefined });
      }
    }
  }, [route?.params?.targetTab, route?.params?.timestamp, route?.params?.requestId, route?.params?.prayerId, route?.params?.testimonyId, route?.params?.serviceId, route?.params?.applicationId, tabs, navigation]);

  const handleSetTab = useCallback((index: number) => {
    if (index !== activeTabRef.current) {
      const tabName = tabs[index]?.name;
      
      if ((tabName === 'WhatsApp') && !activeChurch?.whatsappIntegrationEnabled) {
        setAlertConfig({
          visible: true,
          title: 'WhatsApp Integration Not Enabled',
          message: 'WhatsApp Integration is not enabled for your church. Please contact the Rhema support team to activate this feature. Once enabled, you will be able to use WhatsApp Integration from the Celebrations module.',
          type: 'info'
        });
        return;
      }
      
      const premiumTabs = [
        'Promises', 'New Promise', 'Schedule', 'Promise Calendar', 'Add Promise', 'Daily Verses',
        'Sermons', 'New Sermon', 'Songs', 'Events', 'New Event', 'Pastor Event',
        'Prayers', 'Celebrations', 'Gallery', 'Expense', 'Donations', 
        'Online Meetings', 'New Online Meeting',
        'WhatsApp', 'Bible Quiz', 'Baptism'
      ];
      
      if (premiumTabs.includes(tabName) && ChurchService.isSubscriptionExpired(activeChurch)) {
        navigation.navigate('Subscription');
        return;
      }

      if (tabName) {
        perfMonitor.startRouteTransition(`Admin:${tabName}`);
      }

      // Defer the heavy component unmount/mount to the next tick. 
      // This allows the tap animation to finish instantly, making the UI feel highly responsive.
      setTimeout(() => {
        const current = activeTabRef.current;
        setTabHistory(prev => [...prev, current]);
        const targetTabName = tabs[index]?.name || '';
        const safeTabNames = [
          'Promises', 'New Promise', 'Schedule', 'Promise Calendar', 'Add Promise', 'Daily Verses',
          'Sermons', 'New Sermon', 
          'Events', 'New Event',
          'Online Meetings', 'New Online Meeting'
        ];
        if (!safeTabNames.includes(targetTabName)) {
          setEditingData(null);
        }
        setActiveTab(index);
      }, 0);
    }
  }, [tabs, activeChurch, navigation]);

  const setTabByName = useCallback((name: string) => {
    const idx = tabs.findIndex(t => t.name === name);
    if (idx !== -1) handleSetTab(idx);
  }, [tabs, handleSetTab]);

  const handleBack = useCallback(() => {
    if (tabHistoryRef.current.length > 0) {
      const prevTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
      setTabHistory(prev => prev.slice(0, -1));
      setActiveTab(prevTab);
    } else if (activeTabRef.current !== 0) {
      setActiveTab(0);
    }
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (tabHistoryRef.current.length > 0 || activeTabRef.current !== 0) {
        handleBack();
        return true; // Prevent default behavior
      }
      return false; // Let default behavior happen (e.g., exit app)
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [handleBack]);

  const safeActiveTab = (activeTab >= 0 && activeTab < tabs.length) ? activeTab : 0;
  const ActiveComponent = useMemo(
    () => (tabs[safeActiveTab] || tabs[0]).getComponent() as any,
    [tabs, safeActiveTab]
  );
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const isHomeActive = activeTab === 0;
  const isPromisesActive = tabs.findIndex(t => t.name === 'Promises') === activeTab;
  const isSermonsActive = tabs.findIndex(t => t.name === 'Sermons') === activeTab;
  const isPrayersActive = tabs.findIndex(t => t.name === 'Prayers') === activeTab;
  const isEventsActive = tabs.findIndex(t => t.name === 'Events') === activeTab;
  const isCelebrationsActive = tabs.findIndex(t => t.name === 'Celebrations') === activeTab;
  
  // Removed isPromisesActive from the list below per user request to hide the bottom tab bar on Promises
  const isMainTabActive = isHomeActive || isSermonsActive || isPrayersActive || isEventsActive || isCelebrationsActive;

  let barBgColor = '#1a2d5a';
  let activeIconColor = '#1e2b4d';
  let inactiveIconColor = '#a89f91';

  if (isHomeActive) {
    barBgColor = '#0F4C5C'; // Deep Premium Teal
    activeIconColor = '#0F4C5C';
    inactiveIconColor = 'rgba(255,255,255,0.7)';
  } else if (isSermonsActive) {
    barBgColor = '#382B5C'; // Royal Indigo
    activeIconColor = '#382B5C';
    inactiveIconColor = 'rgba(255,255,255,0.7)';
  } else if (isPrayersActive) {
    barBgColor = '#1F5F3B'; // Forest Green
    activeIconColor = '#1F5F3B';
    inactiveIconColor = 'rgba(255,255,255,0.7)';
  } else if (isEventsActive) {
    barBgColor = '#9C4325'; // Terracotta Rust
    activeIconColor = '#9C4325';
    inactiveIconColor = 'rgba(255,255,255,0.7)';
  } else if (isCelebrationsActive) {
    barBgColor = '#121212'; // Sleek Black
    activeIconColor = '#121212';
    inactiveIconColor = 'rgba(255,255,255,0.7)';
  }

  const isSuperAdminTab = tabs[activeTab]?.name === 'App Admin';

  const tabContextValue = useMemo(
    () => ({
      activeTab,
      setActiveTab: handleSetTab,
      editingData,
      setEditingData,
      goBack: handleBack,
      setTabByName,
      dashboardScrollY: dashboardScrollYRef.current,
      getDashboardScrollY,
      setDashboardScrollY,
    }),
    [activeTab, handleSetTab, editingData, handleBack, setTabByName, getDashboardScrollY, setDashboardScrollY]
  );

  // We provide handleSetTab via setActiveTab so child components can push to history
  return (
    <AdminTabContext.Provider value={tabContextValue}>
      <View style={[styles.container, { backgroundColor: isSuperAdminTab ? '#0a0f1e' : screenBg }]}>
        {!isSuperAdminTab && (
          <SafeAreaView edges={['top']} style={{ backgroundColor: isSuperAdminTab ? '#0a0f1e' : (isHomeActive ? (isDark ? '#2D180C' : '#FFC59E') : screenBg) }} />
        )}
        
        {isImpersonating && (
          <TouchableOpacity 
            activeOpacity={0.8}
            style={{ 
              backgroundColor: isDark ? '#18181B' : '#1a2d5a', 
              marginHorizontal: 16,
              marginTop: 12,
              marginBottom: 4,
              borderRadius: 100, // Pill shape
              paddingVertical: 10, 
              paddingHorizontal: 14,
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              borderWidth: isDark ? 1 : 0,
              borderColor: '#27272A',
              shadowColor: '#1a2d5a',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 8,
              zIndex: 10
            }}
            onPress={() => {
              setAlertConfig({
                visible: true,
                title: "Return to Main Church",
                message: "Are you sure you want to stop viewing this branch and return to your main organization dashboard?",
                type: 'confirm',
                onConfirm: async () => { 
                  if (setDashboardScrollY) setDashboardScrollY(0);
                  handleSetTab(0);
                  await stopImpersonation(); 
                }
              });
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Eye size={18} color="#fff" />
              </View>
              <View style={{ flex: 1, paddingRight: 12, justifyContent: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: scaleFont(10), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, fontFamily: appFontFamily }}>
                  Viewing Branch
                </Text>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: scaleFont(14), fontFamily: appFontFamily }}>
                  {impersonatedBranchName}
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
              <Text style={{ color: '#ef4444', fontSize: scaleFont(12), fontWeight: '800', fontFamily: appFontFamily }}>Exit</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Custom Alert Modal */}
        {alertConfig.visible && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <View style={{ backgroundColor: cardSurface, width: '85%', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: isDark ? 1 : 0, borderColor: '#27272A' }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16, backgroundColor: alertConfig.type === 'error' ? '#fee2e2' : alertConfig.type === 'confirm' ? '#e0e7ff' : alertConfig.type === 'warning' ? '#fef3c7' : alertConfig.type === 'info' ? '#e0f2fe' : '#dcfce7' }}>
                {alertConfig.type === 'error' ? (
                  <Text style={{fontSize: 24}}>❌</Text>
                ) : alertConfig.type === 'confirm' ? (
                  <Text style={{fontSize: 24}}>❓</Text>
                ) : alertConfig.type === 'warning' ? (
                  <Text style={{fontSize: 24}}>⚠️</Text>
                ) : alertConfig.type === 'info' ? (
                  <Text style={{fontSize: 24}}>ℹ️</Text>
                ) : (
                  <Text style={{fontSize: 24}}>✅</Text>
                )}
              </View>
              <Text style={{ fontSize: scaleFont(22), fontWeight: '800', color: primaryText, marginBottom: 8, textAlign: 'center', fontFamily: appFontFamily }}>{alertConfig.title}</Text>
              <Text style={{ fontSize: scaleFont(15), color: secondaryText, textAlign: 'center', marginBottom: 24, lineHeight: scaleFont(22), fontFamily: appFontFamily }}>{alertConfig.message}</Text>
              
              <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'center' }}>
                {alertConfig.type === 'confirm' && (
                  <TouchableOpacity style={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginRight: 12, backgroundColor: isDark ? '#27272A' : '#f1f5f9' }} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                    <Text style={{ color: primaryText, fontSize: scaleFont(16), fontWeight: '700', fontFamily: appFontFamily }}>Cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={{ paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, minWidth: 120, alignItems: 'center', backgroundColor: alertConfig.type === 'error' ? '#ef4444' : alertConfig.type === 'confirm' ? '#1a2d5a' : alertConfig.type === 'warning' ? '#f59e0b' : alertConfig.type === 'info' ? '#0ea5e9' : '#22c55e' }} 
                  onPress={() => {
                    setAlertConfig({...alertConfig, visible: false});
                    if (alertConfig.onConfirm) alertConfig.onConfirm();
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: scaleFont(16), fontWeight: '700', fontFamily: appFontFamily }}>{alertConfig.type === 'confirm' ? 'Yes, Return' : 'Got it'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={[styles.content, { backgroundColor: screenBg }]}>
          {activeTab === 0 ? (
            <AdminDashboard navigation={navigation} allTabs={tabs} />
          ) : (
            <ActiveComponent navigation={navigation} routeParams={route?.params} />
          )}
        </View>

        {/* Premium Floating Bottom Tab Bar Removed */}

        {/* Full-Height Left Side Drawer Overlay Removed */}

      </View>
    </AdminTabContext.Provider>
  );
}

const FONTS = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 }, 
  header: { },
  
  // Bottom Tab Bar
  bottomTabBarWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 56 : 48, // Pushed up further
    left: 16,
    right: 16,
    backgroundColor: 'transparent',
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff', // Default, gets overridden dynamically
    borderRadius: 36, 
    paddingHorizontal: 8,
    paddingVertical: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  activeCircle: {
    backgroundColor: '#ffffff', // Perfect white circle for active
    width: 50,
    height: 50,
    borderRadius: 25, // Half of width/height to make a perfect circle
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveCircle: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomTabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },

  headerTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 12,
  },
  hamburgerBtn: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  datePill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  datePillTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18, 
    backgroundColor: '#fff', 
    justifyContent: 'center', 
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5
  },
  logoImage: { 
    width: 26, 
    height: 26 
  },
  headerText: { flex: 1, marginLeft: 12, marginBottom: 4 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '600', fontFamily: FONTS.serif },
  headerSub: { color: '#aac4e8', fontSize: 11, marginTop: 1 },
  roleBadge: { 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 12 
  },
  roleTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },

  content: { flex: 1 },

  // Classic Side Drawer Styles
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', // Dim background
  },
  drawerContent: {
    width: width * 0.75,
    maxWidth: 340,
    backgroundColor: '#1a2d5a', // Original Navy Blue
    height: '100%',
    paddingTop: Platform.OS === 'ios' ? 50 : 30, // Safe area top padding
    shadowColor: '#000',
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 20,
  },
  drawerProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    marginTop: 10,
    gap: 15,
  },
  drawerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden', // Forces the logo to be a perfect circle
  },
  drawerName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  drawerEmail: { color: '#aac4e8', fontSize: 12, marginTop: 4 },
  drawerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20,
    marginBottom: 5,
  },
  drawerSectionTitle: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 26,
    marginBottom: 10,
    marginTop: 10,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  drawerItemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  drawerItemText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 16,
  },
  drawerItemTextActive: {
    color: '#FCD34D',
    fontWeight: '800',
  },
  drawerFooter: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 50 : 45, // Pushed up to safely clear Android nav bar
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  drawerSignOutBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
  },
  drawerSignOutTxt: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 15 
  }
});
