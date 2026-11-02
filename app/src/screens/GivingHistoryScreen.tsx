import React, { useState, useEffect, useRef } from 'react';
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
  Image
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
  Clock
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import FirestoreService from '../services/FirestoreService';
import { formatDateDisplay } from '../utils/DateUtils';
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

export default function GivingHistoryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {  isDark, toggleTheme , colors } = useTheme();
  const { activeChurch } = useChurch();
  const { t, language } = useLanguage();
  
  const [donations, setDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  
  const [selectedDonation, setSelectedDonation] = useState<any | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  // Custom Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const receiptRef = useRef<any>(null);

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    if (!user?.phoneNumber) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const history = await FirestoreService.getMemberDonations(user.phoneNumber);
      const successful = history.filter(d => {
         const st = (d.status || '').toLowerCase();
         return st === 'success' || st === 'approved' || st === 'paid' || st === 'confirmed' || !d.status;
      });
      setDonations(successful);
    } catch (error) {
      console.error('Error fetching giving history:', error);
      Alert.alert(t('common.error') || 'Error', t('giving.loadError'));
    } finally {
      setLoading(false);
    }
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
    if (activeFilter === 'All') return true;
    const cat = (d.donationType || d.category || '').toLowerCase();
    return cat.includes(activeFilter.toLowerCase());
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
            marginBottom: 20,
            marginTop: 10
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
              const status = (donation.status || 'success').toLowerCase();
              const isPending = status.includes('pending');
              const isFailed = status === 'failed' || status === 'rejected';

              return (
                <TouchableOpacity 
                  key={donation.id} 
                  style={[styles.donationCard, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => openDonationDetails(donation)}
                >
                  <View style={[styles.donationIconBox, { backgroundColor: isDark ? '#1F1F23' : '#F1F5F9' }]}>
                    <CreditCard size={20} color={colors.accent || (isDark ? '#38BDF8' : '#0F766E')} />
                  </View>
                  <View style={styles.donationInfo}>
                    <Text style={[styles.donationType, { color: colors.text, fontWeight: '700' }]}>
                      {getLocalizedCategory(donation.donationType || donation.category)}
                    </Text>
                    <Text style={[styles.donationDate, { color: colors.textSecondary }]}>
                      {getDonationDate(donation)}
                    </Text>
                  </View>
                  <View style={styles.donationAmountBox}>
                    <Text style={[styles.donationAmount, { color: colors.text, fontWeight: '800' }]}>
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
              );
            })
          )}
        </View>
      </ScrollView>

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
                      <Text style={[styles.receiptValue, { color: colors.text }]}>{selectedDonation.id}</Text>
                    </View>
                    
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
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
});
