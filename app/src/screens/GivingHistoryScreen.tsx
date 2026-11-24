import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  Alert,
  StatusBar,
  Dimensions,
  Image,
  RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  ChevronLeft,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  X,
  Download,
  CreditCard,
  Gift,
  Clock,
  Trash2,
  FileText,
  HeartHandshake,
  Repeat,
  Pause,
  Play
} from 'lucide-react-native';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import PledgeFormModal from '../components/PledgeFormModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../constants/ChurchConfig';
import FirestoreService from '../services/FirestoreService';
import { formatDateDisplay } from '../utils/DateUtils';
import { getInstantMemory, readInstantCache, writeInstantCache } from '../utils/instantCache';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

const { width } = Dimensions.get('window');

const FILTERS = [
  { id: 'All', labelKey: 'giving.filterAll' },
  { id: 'Tithe', labelKey: 'giving.categories.tithe' },
  { id: 'Offering', labelKey: 'giving.categories.offering' },
  { id: 'Special', labelKey: 'giving.categories.special' },
  { id: 'Building', labelKey: 'giving.categories.building' },
  { id: 'Missions', labelKey: 'giving.categories.missions' },
  { id: 'Other', labelKey: 'giving.categories.others' },
];

export default function GivingHistoryScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const { activeChurch, churchId } = useChurch();
  const { t, language } = useLanguage();
  const effectiveChurchId = churchId || activeChurch?.id || RHEMA_CHURCH_ID;

  const historyCacheKey = `giving_history_${effectiveChurchId}_${user?.uid || member?.phone || 'anon'}_v1`;
  const initialCachedHistory = getInstantMemory<{
    donations: any[];
    pledges: any[];
    mandates: any[];
  }>(historyCacheKey);

  const initialTabParam = route?.params?.initialTab;
  const [activeSection, setActiveSection] = useState<'donations' | 'pledges' | 'mandates'>(
    initialTabParam === 'pledges' || initialTabParam === 'mandates' ? initialTabParam : 'donations'
  );
  const [donations, setDonations] = useState<any[]>(() => initialCachedHistory?.donations || []);
  const [pledges, setPledges] = useState<any[]>(() => initialCachedHistory?.pledges || []);
  const [mandates, setMandates] = useState<any[]>(() => initialCachedHistory?.mandates || []);
  const [loading, setLoading] = useState(() => !initialCachedHistory);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [recurringFilter, setRecurringFilter] = useState<'all' | 'one_time' | 'recurring'>('all');
  const [showPledgeModal, setShowPledgeModal] = useState(false);

  const [selectedDonation, setSelectedDonation] = useState<any | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Custom Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const receiptRef = useRef<any>(null);

  useEffect(() => {
    if (route?.params?.initialTab === 'pledges' || route?.params?.initialTab === 'mandates' || route?.params?.initialTab === 'donations') {
      setActiveSection(route.params.initialTab);
    }
  }, [route?.params?.initialTab]);

  const fetchHistory = useCallback(async (isRefresh = false, silent = false) => {
    const memberPhone = member?.phone || user?.phoneNumber || null;
    const memberUid = user?.uid || null;

    if (!memberPhone && !memberUid) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let hasCached = Boolean(getInstantMemory(historyCacheKey));
    if (!isRefresh && !hasCached) {
      const diskHistory = await readInstantCache<{
        donations: any[];
        pledges: any[];
        mandates: any[];
      }>(historyCacheKey);
      if (diskHistory?.data) {
        setDonations(diskHistory.data.donations || []);
        setPledges(diskHistory.data.pledges || []);
        setMandates(diskHistory.data.mandates || []);
        setLoading(false);
        hasCached = true;
      }
    }

    if (isRefresh && !silent) {
      setRefreshing(true);
    } else if (!hasCached && !silent) {
      setLoading(true);
    }

    try {
      const [historyResult, pledgesResult, mandatesResult] = await Promise.allSettled([
        FirestoreService.getMemberDonations(memberPhone, memberUid),
        memberUid
          ? firestore()
              .collection(RHEMA_ROOT_COLLECTION)
              .doc(effectiveChurchId)
              .collection('pledges')
              .where('memberUid', '==', memberUid)
              .get()
          : Promise.resolve(null),
        memberUid
          ? firestore()
              .collection(RHEMA_ROOT_COLLECTION)
              .doc(effectiveChurchId)
              .collection('recurring_mandates')
              .where('memberUid', '==', memberUid)
              .get()
          : Promise.resolve(null),
      ]);

      let nextDonations: any[] | null = null;
      let nextPledges: any[] | null = null;
      let nextMandates: any[] | null = null;

      if (historyResult.status === 'fulfilled') {
        nextDonations = historyResult.value.filter(d => {
          const st = (d.status || '').toLowerCase();
          return (
            st === 'completed' ||
            st === 'success' ||
            st === 'approved' ||
            st === 'paid' ||
            st === 'confirmed' ||
            !d.status
          );
        });
        setDonations(nextDonations);
      }

      if (pledgesResult.status === 'fulfilled' && pledgesResult.value) {
        nextPledges = pledgesResult.value.docs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
        setPledges(nextPledges);
      }

      if (mandatesResult.status === 'fulfilled' && mandatesResult.value) {
        nextMandates = mandatesResult.value.docs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMandates(nextMandates);
      }

      const prevMem = getInstantMemory<{ donations: any[]; pledges: any[]; mandates: any[] }>(historyCacheKey);
      writeInstantCache(historyCacheKey, {
        donations: nextDonations ?? prevMem?.donations ?? [],
        pledges: nextPledges ?? prevMem?.pledges ?? [],
        mandates: nextMandates ?? prevMem?.mandates ?? [],
      }).catch(() => {});
    } catch (error) {
      console.error('Error fetching giving history:', error);
      if (!hasCached && !silent) {
        Alert.alert(t('common.error') || 'Error', t('giving.loadError'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [member?.phone, user?.phoneNumber, user?.uid, effectiveChurchId, historyCacheKey, t]);

  const handleManageMandate = (mandate: any, action: 'pause' | 'resume' | 'cancel') => {
    const actionLabel = action === 'cancel' ? 'Cancel Mandate' : action === 'pause' ? 'Pause Auto-Pay' : 'Resume Auto-Pay';
    Alert.alert(
      actionLabel,
      `Are you sure you want to ${action} your ${mandate.frequency} ₹${Number(mandate.amount || 0).toLocaleString('en-IN')} ${mandate.category} recurring donation?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Confirm',
          style: action === 'cancel' ? 'destructive' : 'default',
          onPress: async () => {
            setManagingId(mandate.id);
            try {
              const fn = functions().app.functions('asia-south1').httpsCallable('manageRazorpayRecurringDonation');
              const res = await fn({ subscriptionId: mandate.subscriptionId || mandate.id, action, churchId: effectiveChurchId });
              const newStatus = (res.data as any)?.status || action;
              setMandates(prev => prev.map(m => (m.id === mandate.id ? { ...m, status: newStatus } : m)));
            } catch (err: any) {
              Alert.alert('Update Failed', err?.message || 'Unable to update recurring mandate.');
            } finally {
              setManagingId(null);
            }
          },
        },
      ]
    );
  };

  const handleCancelOrDeletePledge = (pledge: any) => {
    const hasReceived = Number(pledge.receivedAmount || 0) > 0;
    Alert.alert(
      hasReceived ? 'Cancel Pledge' : 'Delete Pledge',
      hasReceived
        ? 'Mark this pledge as cancelled and stop future reminders? Previously received donations remain in your history.'
        : 'Delete this pledge commitment?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: hasReceived ? 'Cancel Pledge' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(pledge.id);
            try {
              const ref = firestore()
                .collection(RHEMA_ROOT_COLLECTION)
                .doc(effectiveChurchId)
                .collection('pledges')
                .doc(pledge.id);
              if (hasReceived) {
                await ref.update({ status: 'cancelled', reminderEnabled: false, updatedAt: firestore.FieldValue.serverTimestamp() });
                setPledges(prev => prev.map(p => (p.id === pledge.id ? { ...p, status: 'cancelled', reminderEnabled: false } : p)));
              } else {
                await ref.delete();
                setPledges(prev => prev.filter(p => p.id !== pledge.id));
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Unable to update pledge.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchHistory(false, false);
    const unsubFocus = navigation?.addListener?.('focus', () => {
      fetchHistory(true, true);
    });
    return () => {
      if (typeof unsubFocus === 'function') unsubFocus();
    };
  }, [fetchHistory, navigation]);

  const handleDeleteDonation = (donation: any) => {
    const formattedAmt = Number(donation.amount || 0).toLocaleString('en-IN');
    const label = getLocalizedCategory(donation.donationType || donation.category);
    Alert.alert(
      'Delete Payment Record',
      `Remove this ${label} record (₹${formattedAmt}) from your history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(donation.id);
            try {
              await Promise.all([
                firestore().collection('church_donations').doc(donation.id).delete().catch(() => {}),
                firestore()
                  .collection(RHEMA_ROOT_COLLECTION)
                  .doc(effectiveChurchId)
                  .collection('donations')
                  .doc(donation.id)
                  .delete()
                  .catch(() => {}),
              ]);
              setDonations(prev => prev.filter(item => item.id !== donation.id));
            } catch (err) {
              console.error('Error deleting giving history record:', err);
              Alert.alert(t('common.error') || 'Error', 'Failed to delete payment record.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const calculateTotal = () => {
    return donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  };

  const getLocalizedCategory = (type: string | undefined): string => {
    if (!type) return t('giving.type');
    const lower = type.toLowerCase().trim();

    if (lower.startsWith('others:') || lower.startsWith('other:')) {
      const customName = type.substring(type.indexOf(':') + 1).trim();
      return `${t('giving.categories.others')}: ${customName}`;
    }
    if (lower.includes('tithe')) return t('giving.categories.tithe');
    if (lower.includes('offering')) return t('giving.categories.offering');
    if (lower.includes('mission')) return t('giving.categories.missions');
    if (lower.includes('building')) return t('giving.categories.building');
    if (lower.includes('special')) return t('giving.categories.special');
    if (lower.includes('thanksgiving')) return t('giving.categories.thanksgiving');
    if (lower.includes('other')) return t('giving.categories.others');

    return type;
  };

  const handleDownloadReceipt = async (donation: any) => {
    try {
      setDownloading(true);
      
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert(t('giving.permissionRequired'), t('giving.permissionMessage'));
        setDownloading(false);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));

      if (receiptRef.current) {
        const uri = await receiptRef.current.capture();
        await MediaLibrary.saveToLibraryAsync(uri);
        setSuccessMessage(t('giving.receiptSaved'));
        setShowSuccessModal(true);
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert(t('common.error') || 'Error', t('giving.saveError'));
    } finally {
      setDownloading(false);
    }
  };

  const openDonationDetails = (donation: any) => {
    setSelectedDonation(donation);
    setShowDetailsModal(true);
  };

  const formatAmount = (amt: number) => {
    return '₹' + Number(amt).toLocaleString('en-IN');
  };

  const getDonationDate = (d: any) => {
    if (d.createdAt && d.createdAt.toDate) {
      return formatDateDisplay(d.createdAt.toDate().toISOString().split('T')[0]);
    }
    if (d.date) {
        return formatDateDisplay(d.date);
    }
    return 'Unknown Date';
  };

  const filteredDonations = donations.filter(d => {
    const matchesCat =
      activeFilter === 'All' ||
      (d.donationType || d.category || '').toLowerCase().includes(activeFilter.toLowerCase());
    if (!matchesCat) return false;
    if (recurringFilter === 'recurring') return d.recurringType === 'recurring';
    if (recurringFilter === 'one_time') return d.recurringType !== 'recurring';
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* ── Page Header ── */}
            {/* ── Screen Header (Clean circular back button & title) ── */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8 }
        ]}
      >
        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          {t('giving.historyTitle')}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchHistory(true)}
            tintColor={colors.accent || '#FCD34D'}
          />
        }
      >
        {/* ── Section Tabs (Donations / My Pledges / Recurring) ── */}
        <View style={[styles.sectionTabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { id: 'donations' as const, label: `Donations (${donations.length})` },
            { id: 'pledges' as const, label: `Pledges (${pledges.length})` },
            { id: 'mandates' as const, label: `Recurring (${mandates.length})` },
          ].map((tab) => {
            const active = activeSection === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.sectionTabBtn,
                  active && { backgroundColor: isDark ? 'rgba(252,211,77,0.18)' : (colors.accent || '#0F766E') },
                ]}
                onPress={() => setActiveSection(tab.id)}
              >
                <Text
                  style={[
                    styles.sectionTabTxt,
                    { color: active ? (isDark ? '#FCD34D' : '#FFFFFF') : colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeSection === 'donations' && (
          <>
            {/* ── Summary Card ── */}
            <View style={{
                backgroundColor: colors.surface, 
                borderColor: colors.border, 
                borderWidth: 1, 
                elevation: isDark ? 0 : 3, 
                shadowColor: '#000', 
                shadowOffset: { width: 0, height: 4 }, 
                shadowOpacity: isDark ? 0 : 0.05, 
                shadowRadius: 15, 
                borderRadius: 16, 
                padding: 20, 
                marginBottom: 16,
                marginTop: 6
            }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{t('giving.totalGiven')}</Text>
                        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{formatAmount(calculateTotal())}</Text>
                    </View>
                    <View style={{ width: 1, height: '80%', backgroundColor: colors.border }} />
                    <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{t('giving.totalDonations')}</Text>
                        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{donations.length}</Text>
                    </View>
                </View>
            </View>

            {/* ── One-Time vs Recurring Pill Filter ── */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[
                { id: 'all' as const, label: 'All Payments' },
                { id: 'one_time' as const, label: 'One-Time' },
                { id: 'recurring' as const, label: 'Recurring' },
              ].map((rf) => {
                const active = recurringFilter === rf.id;
                return (
                  <TouchableOpacity
                    key={rf.id}
                    onPress={() => setRecurringFilter(rf.id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 14,
                      backgroundColor: active ? (isDark ? 'rgba(252,211,77,0.16)' : '#FEF3C7') : colors.surface,
                      borderWidth: 1,
                      borderColor: active ? (isDark ? '#FCD34D' : '#F59E0B') : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: active ? (isDark ? '#FCD34D' : '#92400E') : colors.textSecondary,
                      }}
                    >
                      {rf.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Categories Filter ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, paddingBottom: 5 }} contentContainerStyle={{ gap: 10 }}>
          {FILTERS.map(filter => {
            const isActive = activeFilter === filter.id;
            return (
              <TouchableOpacity 
                key={filter.id}
                onPress={() => setActiveFilter(filter.id)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isActive ? (colors.accent || (isDark ? '#38BDF8' : '#0F766E')) : colors.surface,
                  borderWidth: 1,
                  borderColor: isActive ? (colors.accent || (isDark ? '#38BDF8' : '#0F766E')) : colors.border
                }}
              >
                <Text style={{ 
                  color: isActive ? '#FFFFFF' : colors.textSecondary,
                  fontWeight: isActive ? '700' : '600',
                  fontSize: 13
                }}>
                  {t(filter.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Donations List ── */}
        <View style={styles.listContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('giving.recentTransactions')}</Text>
          
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.accent || (isDark ? "#38BDF8" : "#0F766E")} />
            </View>
          ) : filteredDonations.length === 0 ? (
            <View style={styles.emptyState}>
              <Gift size={48} color={isDark ? '#475569' : '#cbd5e1'} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('giving.noTransactions')}</Text>
            </View>
          ) : (
            filteredDonations.map((donation) => {
              const status = (donation.status || 'completed').toLowerCase();
              const isPending = status.includes('pending');
              const isFailed = status === 'failed' || status === 'rejected' || status === 'cancelled';
              const accentColor = isPending ? '#d97706' : isFailed ? '#dc2626' : '#10b981';
              const isDeleting = deletingId === donation.id;

              return (
                <View
                  key={donation.id}
                  style={[
                    styles.donationCard,
                    {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderLeftWidth: 4,
                      borderLeftColor: accentColor,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.donationCardTopRow}
                    onPress={() => openDonationDetails(donation)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.donationIconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5' }]}>
                      <CreditCard size={20} color={accentColor} />
                    </View>
                    <View style={styles.donationInfo}>
                      <Text style={[styles.donationType, { color: colors.text, fontWeight: '800' }]}>
                        {getLocalizedCategory(donation.donationType || donation.category)}
                      </Text>
                      <Text style={[styles.donationDate, { color: colors.textSecondary }]}>
                        {getDonationDate(donation)}
                      </Text>
                      {!!donation.paymentId && (
                        <Text style={[styles.donationPaymentId, { color: colors.textSecondary }]} numberOfLines={1}>
                          {donation.paymentMethod || 'Razorpay'} · {donation.paymentId}
                        </Text>
                      )}
                    </View>
                    <View style={styles.donationAmountBox}>
                      <Text style={[styles.donationAmount, { color: isDark ? '#FCD34D' : colors.text, fontWeight: '800' }]}>
                        {formatAmount(donation.amount)}
                      </Text>

                      {isPending ? (
                        <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(217,119,6,0.18)' : '#fef3c7' }]}>
                          <Clock size={12} color="#d97706" />
                          <Text style={[styles.statusText, { color: '#d97706' }]}>{t('giving.statusPending')}</Text>
                        </View>
                      ) : isFailed ? (
                        <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(220,38,38,0.18)' : '#fee2e2' }]}>
                          <X size={12} color="#dc2626" />
                          <Text style={[styles.statusText, { color: '#dc2626' }]}>{t('giving.statusFailed')}</Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(22,163,74,0.18)' : '#dcfce7' }]}>
                          <CheckCircle2 size={12} color="#16a34a" />
                          <Text style={styles.statusText}>{t('giving.statusSuccess')}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={[styles.cardActionsDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.cardDeleteBtn,
                        {
                          backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                          borderColor: isDark ? 'rgba(239,68,68,0.28)' : '#FECACA',
                        },
                      ]}
                      onPress={() => handleDeleteDonation(donation)}
                      disabled={isDeleting}
                      activeOpacity={0.75}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#ef4444" />
                      ) : (
                        <>
                          <Trash2 size={14} color="#ef4444" />
                          <Text style={styles.cardDeleteTxt}>Delete</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.cardReceiptBtn,
                        {
                          backgroundColor: isDark ? 'rgba(252,211,77,0.14)' : '#FEF3C7',
                          borderColor: isDark ? 'rgba(252,211,77,0.35)' : '#FDE68A',
                        },
                      ]}
                      onPress={() => openDonationDetails(donation)}
                      activeOpacity={0.8}
                    >
                      <FileText size={14} color={isDark ? '#FCD34D' : '#92400E'} />
                      <Text style={[styles.cardReceiptTxt, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                        View Receipt
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
          </>
        )}

        {/* ── MY PLEDGES TAB ── */}
        {activeSection === 'pledges' && (
          <View style={styles.listContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>My Faith Pledges</Text>
              <TouchableOpacity
                style={[
                  styles.newPledgeBtn,
                  {
                    backgroundColor: isDark ? 'rgba(252,211,77,0.16)' : '#FEF3C7',
                    borderColor: isDark ? '#FCD34D' : '#F59E0B',
                  },
                ]}
                onPress={() => setShowPledgeModal(true)}
              >
                <HeartHandshake size={14} color={isDark ? '#FCD34D' : '#92400E'} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#FCD34D' : '#92400E' }}>New Pledge</Text>
              </TouchableOpacity>
            </View>

            {pledges.length === 0 ? (
              <View style={styles.emptyState}>
                <HeartHandshake size={48} color={isDark ? '#475569' : '#cbd5e1'} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No pledges submitted yet.</Text>
              </View>
            ) : (
              pledges.map((pledge) => {
                const st = String(pledge.status || 'active').toLowerCase();
                const isFulfilled = st === 'fulfilled' || Number(pledge.pendingAmount ?? pledge.pledgeAmount ?? 0) <= 0;
                const isCancelled = st === 'cancelled';
                const accent = isFulfilled ? '#10b981' : isCancelled ? '#ef4444' : st === 'overdue' ? '#f59e0b' : '#3b82f6';
                const pledgedAmt = Number(pledge.pledgeAmount || 0);
                const receivedAmt = Number(pledge.receivedAmount || 0);
                const pendingAmt = Math.max(0, Number(pledge.pendingAmount ?? (pledgedAmt - receivedAmt)));
                const isDeleting = deletingId === pledge.id;

                return (
                  <View
                    key={pledge.id}
                    style={[
                      styles.donationCard,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderLeftWidth: 4,
                        borderLeftColor: accent,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.donationType, { color: colors.text, fontWeight: '800' }]}>
                          {getLocalizedCategory(pledge.category)}
                        </Text>
                        <Text style={[styles.donationDate, { color: colors.textSecondary }]}>
                          {String(pledge.frequency || 'monthly').replace('_', '-').toUpperCase()}
                          {pledge.eventTitle ? ` · ${pledge.eventTitle}` : ''}
                        </Text>
                        {!!pledge.nextDueDate && !isFulfilled && !isCancelled && (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                            Next Due: {pledge.nextDueDate}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: isFulfilled ? '#dcfce7' : isCancelled ? '#fee2e2' : '#dbeafe' }]}>
                        <Text style={[styles.statusText, { color: accent, marginLeft: 0, textTransform: 'uppercase' }]}>
                          {st.replace('_', ' ')}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.pledgeMetricsRow, { borderColor: colors.border }]}>
                      <View style={styles.pledgeMetricCol}>
                        <Text style={[styles.pledgeMetricLbl, { color: colors.textSecondary }]}>Pledged</Text>
                        <Text style={[styles.pledgeMetricVal, { color: colors.text }]}>{formatAmount(pledgedAmt)}</Text>
                      </View>
                      <View style={styles.pledgeMetricCol}>
                        <Text style={[styles.pledgeMetricLbl, { color: colors.textSecondary }]}>Received</Text>
                        <Text style={[styles.pledgeMetricVal, { color: '#10b981' }]}>{formatAmount(receivedAmt)}</Text>
                      </View>
                      <View style={styles.pledgeMetricCol}>
                        <Text style={[styles.pledgeMetricLbl, { color: colors.textSecondary }]}>Pending</Text>
                        <Text style={[styles.pledgeMetricVal, { color: pendingAmt > 0 ? '#f59e0b' : '#10b981' }]}>
                          {formatAmount(pendingAmt)}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.cardActionsDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.cardActionsRow}>
                      {!isCancelled && !isFulfilled && (
                        <TouchableOpacity
                          style={[
                            styles.cardDeleteBtn,
                            {
                              backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                              borderColor: isDark ? 'rgba(239,68,68,0.28)' : '#FECACA',
                            },
                          ]}
                          onPress={() => handleCancelOrDeletePledge(pledge)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <ActivityIndicator size="small" color="#ef4444" />
                          ) : (
                            <>
                              <Trash2 size={14} color="#ef4444" />
                              <Text style={styles.cardDeleteTxt}>{receivedAmt > 0 ? 'Cancel' : 'Delete'}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      {!isFulfilled && !isCancelled && pendingAmt > 0 && (
                        <TouchableOpacity
                          style={[
                            styles.cardReceiptBtn,
                            {
                              backgroundColor: isDark ? 'rgba(16,185,129,0.18)' : '#D1FAE5',
                              borderColor: isDark ? 'rgba(16,185,129,0.4)' : '#6EE7B7',
                            },
                          ]}
                          onPress={() => navigation.navigate('Give', { pledgeId: pledge.id })}
                        >
                          <CreditCard size={14} color={isDark ? '#34D399' : '#065F46'} />
                          <Text style={[styles.cardReceiptTxt, { color: isDark ? '#34D399' : '#065F46' }]}>
                            Pay Pledge
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── RECURRING MANDATES TAB ── */}
        {activeSection === 'mandates' && (
          <View style={styles.listContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recurring Auto-Pay Mandates</Text>

            {mandates.length === 0 ? (
              <View style={styles.emptyState}>
                <Repeat size={48} color={isDark ? '#475569' : '#cbd5e1'} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recurring mandates configured.</Text>
              </View>
            ) : (
              mandates.map((m) => {
                const st = String(m.status || 'created').toLowerCase();
                const isActive = st === 'active' || st === 'authenticated';
                const isPaused = st === 'paused';
                const isBusy = managingId === m.id;
                const statusColor = isActive ? '#10b981' : isPaused ? '#f59e0b' : '#ef4444';

                return (
                  <View
                    key={m.id}
                    style={[
                      styles.donationCard,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderLeftWidth: 4,
                        borderLeftColor: statusColor,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.donationType, { color: colors.text, fontWeight: '800' }]}>
                          {getLocalizedCategory(m.category)} · {String(m.frequency || 'monthly').toUpperCase()}
                        </Text>
                        <Text style={[styles.donationDate, { color: colors.textSecondary }]}>
                          Mandate ID: {m.subscriptionId || m.id}
                        </Text>
                        {!!m.nextChargeDate && isActive && (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                            Next Charge: {m.nextChargeDate} · Paid Cycles: {m.totalPaidCount || 0}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.donationAmount, { color: isDark ? '#FCD34D' : colors.text }]}>
                          {formatAmount(m.amount || 0)}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: isActive ? '#dcfce7' : isPaused ? '#fef3c7' : '#fee2e2' }]}>
                          <Text style={[styles.statusText, { color: statusColor, marginLeft: 0, textTransform: 'uppercase' }]}>
                            {st}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {(isActive || isPaused) && (
                      <>
                        <View style={[styles.cardActionsDivider, { backgroundColor: colors.border }]} />
                        <View style={styles.cardActionsRow}>
                          <TouchableOpacity
                            style={[
                              styles.cardDeleteBtn,
                              {
                                backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                                borderColor: isDark ? 'rgba(239,68,68,0.28)' : '#FECACA',
                              },
                            ]}
                            onPress={() => handleManageMandate(m, 'cancel')}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <ActivityIndicator size="small" color="#ef4444" />
                            ) : (
                              <Text style={styles.cardDeleteTxt}>Cancel</Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.cardReceiptBtn,
                              {
                                backgroundColor: isDark ? 'rgba(252,211,77,0.14)' : '#FEF3C7',
                                borderColor: isDark ? 'rgba(252,211,77,0.35)' : '#FDE68A',
                              },
                            ]}
                            onPress={() => handleManageMandate(m, isPaused ? 'resume' : 'pause')}
                            disabled={isBusy}
                          >
                            {isPaused ? (
                              <Play size={14} color={isDark ? '#FCD34D' : '#92400E'} />
                            ) : (
                              <Pause size={14} color={isDark ? '#FCD34D' : '#92400E'} />
                            )}
                            <Text style={[styles.cardReceiptTxt, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                              {isPaused ? 'Resume' : 'Pause'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Pledge Commitment Form Modal ── */}
      <PledgeFormModal
        visible={showPledgeModal}
        onClose={() => setShowPledgeModal(false)}
        onPledgeCreated={() => fetchHistory(true)}
        onPayFirstInstallment={(pledge) => navigation.navigate('Give', { pledgeId: pledge.id })}
      />

      {/* ── Donation Details Modal ── */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('giving.transactionDetails')}</Text>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)} style={styles.closeBtn}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedDonation && (
              <ScrollView style={styles.modalBody}>
                {/* ── Receipt View for Downloading ── */}
                <ViewShot ref={receiptRef} options={{ format: 'png', quality: 1 }}>
                  <View style={[styles.receiptContainer, { backgroundColor: isDark ? '#141416' : '#fff', borderColor: colors.border }]}>
                    <View style={styles.receiptHeader}>
                      {activeChurch?.theme?.logoUrl || (activeChurch as any)?.logoUrl || (activeChurch as any)?.profilePhoto ? (
                        <Image source={{ uri: activeChurch?.theme?.logoUrl || (activeChurch as any)?.logoUrl || (activeChurch as any)?.profilePhoto }} style={styles.receiptLogo} />
                      ) : (
                        <View style={[styles.receiptLogoPlaceholder, { backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E') }]}>
                          <Text style={styles.receiptLogoText}>{(activeChurch?.name || 'W').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={[styles.receiptChurchName, { color: colors.text }]}>{activeChurch?.name || 'Church'}</Text>
                      <Text style={[styles.receiptTitle, { color: colors.textSecondary }]}>{t('giving.donationReceipt')}</Text>
                    </View>
                    
                    <View style={[styles.receiptDivider, { backgroundColor: colors.border }]} />
                    
                    <View style={styles.receiptDetailRow}>
                      <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>{t('giving.amount')}</Text>
                      <Text style={[styles.receiptValueLarge, { color: colors.text }]}>{formatAmount(selectedDonation.amount)}</Text>
                    </View>
                    
                    <View style={styles.receiptDetailRow}>
                      <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>{t('giving.date')}</Text>
                      <Text style={[styles.receiptValue, { color: colors.text }]}>{getDonationDate(selectedDonation)}</Text>
                    </View>
                    
                    <View style={styles.receiptDetailRow}>
                      <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>{t('giving.type')}</Text>
                      <Text style={[styles.receiptValue, { color: colors.text }]}>{getLocalizedCategory(selectedDonation.donationType || selectedDonation.category)}</Text>
                    </View>

                    <View style={styles.receiptDetailRow}>
                      <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>{t('giving.referenceId')}</Text>
                      <Text style={[styles.receiptValue, { color: colors.text }]}>{selectedDonation.paymentId || selectedDonation.id}</Text>
                    </View>

                    {!!selectedDonation.paymentMethod && (
                      <View style={styles.receiptDetailRow}>
                        <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>{t('giving.paymentMethod')}</Text>
                        <Text style={[styles.receiptValue, { color: colors.text }]}>{selectedDonation.paymentMethod}</Text>
                      </View>
                    )}
                    
                    <View style={styles.receiptDetailRow}>
                      <Text style={styles.receiptLabel}>{t('giving.paymentStatus')}</Text>
                      <View style={styles.receiptStatusRow}>
                        {(() => {
                          const status = (selectedDonation.status || 'success').toLowerCase();
                          if (status.includes('pending')) {
                            return (
                              <>
                                <Clock size={16} color="#d97706" />
                                <Text style={[styles.receiptStatusText, { color: '#d97706' }]}>{t('giving.pendingVerification')}</Text>
                              </>
                            );
                          } else if (status === 'failed' || status === 'rejected') {
                            return (
                              <>
                                <X size={16} color="#dc2626" />
                                <Text style={[styles.receiptStatusText, { color: '#dc2626' }]}>{t('giving.statusFailed')}</Text>
                              </>
                            );
                          }
                          return (
                            <>
                              <CheckCircle2 size={16} color="#16a34a" />
                              <Text style={styles.receiptStatusText}>{t('giving.statusSuccess')}</Text>
                            </>
                          );
                        })()}
                      </View>
                    </View>

                    <View style={[styles.receiptDivider, { backgroundColor: colors.border }]} />
                    
                    <View style={styles.receiptFooter}>
                      <Text style={[styles.receiptFooterText, { color: colors.textSecondary }]}>{t('giving.thankYouGiving')}</Text>
                      <Text style={[styles.receiptFooterText, { color: colors.textSecondary }]}>{t('giving.verseQuote')}</Text>
                    </View>
                  </View>
                </ViewShot>

                <TouchableOpacity 
                  style={[styles.downloadBtn, { backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E') }, downloading && { opacity: 0.7 }]} 
                  onPress={() => handleDownloadReceipt(selectedDonation)}
                  disabled={downloading}
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Download size={20} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.downloadBtnText}>{t('giving.downloadReceipt')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Beautiful Success Modal */}
      <Modal visible={showSuccessModal} animationType="fade" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 1000 }}>
          <View style={{ width: '100%', borderRadius: 20, padding: 24, paddingVertical: 40, alignItems: 'center', elevation: 10, backgroundColor: colors.surface }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
              <CheckCircle2 size={36} color="#16a34a" />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 8, color: colors.text }}>{t('common.success')}</Text>
            <Text style={{ fontSize: 15, textAlign: 'center', marginBottom: 20, lineHeight: 20, color: colors.textSecondary }}>
              {successMessage}
            </Text>
            
            <TouchableOpacity 
              style={{ paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#16a34a', width: '100%', marginTop: 10 }}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('common.done') || 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
    headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  circularBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 44,
    height: 44,
  },
  headerCardWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(228, 238, 234, 0.25)',
  },
  headerDecoCircle1: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(228, 238, 234, 0.10)',
    top: -50,
    right: -25,
  },
  headerDecoCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(228, 238, 234, 0.08)',
    bottom: -40,
    left: 35,
  },
  headerCenterTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  headerTitleAccentBar: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E4EEEA',
    marginTop: 5,
    opacity: 0.85,
  },
  headerRightIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500' },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 25,
    marginTop: -10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e2e8f0',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  listContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
  },
  donationCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  donationCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  donationPaymentId: {
    fontSize: 11,
    marginTop: 3,
  },
  cardActionsDivider: {
    height: 1,
    marginVertical: 12,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardDeleteTxt: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 12,
  },
  cardReceiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardReceiptTxt: {
    fontWeight: '800',
    fontSize: 12,
  },
  donationIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  donationInfo: {
    flex: 1,
  },
  donationType: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  donationDate: {
    fontSize: 13,
  },
  donationAmountBox: {
    alignItems: 'flex-end',
  },
  donationAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    color: '#16a34a',
    fontWeight: '600',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '70%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 5,
  },
  modalBody: {
    flex: 1,
  },
  receiptContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 25,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  receiptLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 10,
  },
  receiptLogoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  receiptLogoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  receiptChurchName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
  },
  receiptTitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    borderStyle: 'dashed',
    marginVertical: 15,
  },
  receiptDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  receiptLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  receiptValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: '60%',
    textAlign: 'right',
  },
  receiptValueLarge: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  receiptStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
    marginLeft: 4,
  },
  receiptFooter: {
    alignItems: 'center',
    marginTop: 10,
  },
  receiptFooterText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  downloadBtn: {
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 30,
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTabBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  sectionTabBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTabTxt: {
    fontSize: 12,
    fontWeight: '800',
  },
  newPledgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  pledgeMetricsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 10,
  },
  pledgeMetricCol: {
    flex: 1,
  },
  pledgeMetricLbl: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pledgeMetricVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
});
