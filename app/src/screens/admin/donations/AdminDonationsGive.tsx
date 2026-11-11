import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, StatusBar, Platform, TextInput } from 'react-native';
import { ArrowLeft, CheckCircle, Download, Share2, CheckCircle2, Search } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GoldCoin3D from '../../../components/GoldCoin3D';
import { COLORS, formatCurrency, formatDate, generateBulkDonationReceipt, getBulkDonationReceiptHTML } from './AdminDonationsUtils';
import { db } from '../../../services/firebaseConfig';
import FirestoreService from '../../../services/FirestoreService';
import ReceiptModal from '../../../components/ReceiptModal';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

const CATEGORIES = [
  { id: 'All', label: 'All', icon: '📋' },
  { id: 'Tithe', label: 'Tithe', icon: '🙏' },
  { id: 'Offering', label: 'Offering', icon: '🎁' },
  { id: 'Missions', label: 'Missions', icon: '🌍' },
  { id: 'Building', label: 'Building', icon: '🏛️' },
  { id: 'Special', label: 'Special', icon: '💎' },
  { id: 'Other', label: 'Other', icon: '📝' }
];

export default function AdminDonationsGive({ onNavigate }: any) {
  const { isDark } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [donations, setDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDonation, setSelectedDonation] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPdfModal, setShowPdfModal] = useState(false);
  const { user, member } = useAuth();
  const authorizerName = member?.name || user?.displayName || user?.email || 'Authorized Administrator';

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: any = null;

    try {
      // Fetch online member donations from church_donations
      unsubscribe = db.collection('church_donations')
        .onSnapshot((snapshot) => {
          if (!isMounted) return;
          if (snapshot) {
            const fetched = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            fetched.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            setDonations(fetched);
          }
          setLoading(false);
        }, async (error) => {
          if (!isMounted) return;
          console.warn("⚠️ church_donations onSnapshot bypassed:", error?.message);
          // Fallback to church donations
          try {
            const fallback = await FirestoreService.getDonations();
            if (isMounted && fallback && fallback.length > 0) {
              setDonations(fallback);
            }
          } catch (fErr) {}
          setLoading(false);
        });
    } catch (e: any) {
      console.warn("⚠️ Failed to listen to church_donations:", e?.message);
      setLoading(false);
    }

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const filteredDonations = donations.filter(d => {
    const matchCat = activeCategory === 'All' || (d.category || '').startsWith(activeCategory);
    const q = searchQuery.toLowerCase().trim();
    const matchQ = !q 
      || (d.userName?.toLowerCase() || '').includes(q) 
      || (d.name?.toLowerCase() || '').includes(q) 
      || (d.id?.toLowerCase() || '').includes(q) 
      || (d.category?.toLowerCase() || '').includes(q)
      || (d.paymentId?.toLowerCase() || '').includes(q)
      || (d.orderId?.toLowerCase() || '').includes(q);
    return matchCat && matchQ;
  });

  const totalAmount = filteredDonations
    .filter(d => d.status === 'completed')
    .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

  const handleLongPress = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handlePress = (donation: any) => {
    if (selectedIds.size > 0) {
      handleLongPress(donation.id);
    } else {
      setSelectedDonation(donation);
      setShowReceipt(true);
    }
  };

  const isSelectionMode = selectedIds.size > 0;
  const receiptList = isSelectionMode ? filteredDonations.filter(d => selectedIds.has(d.id)) : filteredDonations;
  const canGenerateReceipt = isSelectionMode || (activeCategory !== 'All' && filteredDonations.length > 0);
  const displayType = isSelectionMode 
    ? (Array.from(new Set(receiptList.map(d => d.category))).length === 1 ? receiptList[0].category : 'CUSTOM') 
    : activeCategory;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />

      {/* ── Modern Centered Header (Pure Black in Dark Mode, Pure White in White Mode) ── */}
      <View
        style={[
          styles.topbar,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1.5,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
            paddingTop: Platform.OS === 'ios' ? 56 : 16,
            paddingBottom: 16,
            paddingHorizontal: 16,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity 
            style={[
              styles.backBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : '#CBD5E1',
                borderWidth: 1.5,
              },
            ]} 
            onPress={() => onNavigate('dashboard')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.4} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '800',
                color: isDark ? '#FFFFFF' : '#0F172A',
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              Online Donations
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: isDark ? '#94A3B8' : '#64748B',
                marginTop: 2,
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              Member Payments
            </Text>
          </View>

          {/* Spacer to keep title centered */}
          <View style={{ width: 40 }} />
        </View>
      </View>

      {/* Summary Card (at top) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, marginBottom: 4 }}>
        <View
          style={[
            styles.summaryCardWrapper,
            {
              shadowColor: '#DFB245',
              shadowOpacity: isDark ? 0.40 : 0.20,
            },
          ]}
        >
          <LinearGradient
            colors={['#09090B', '#14120E', '#3D2F12', '#967426', '#E5B84B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.summaryCard}
          >
            {/* Subtle Top Specular Sheen */}
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.16)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.specularSheen}
              pointerEvents="none"
            />

            <View style={styles.coinWrap}>
              <GoldCoin3D size={36} />
            </View>

            <Text style={styles.summaryLabel} numberOfLines={1}>
              {activeCategory === 'All' ? 'Total Online Donations' : `${activeCategory} Total`}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.summaryAmount} numberOfLines={1}>
              {formatCurrency(totalAmount)}
            </Text>
          </LinearGradient>
        </View>
      </View>

      {/* Filter Badges */}
      <View style={[styles.filterContainer, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.badge,
                  {
                    backgroundColor: isActive 
                      ? (isDark ? '#FFFFFF' : '#000000') 
                      : (isDark ? '#18181B' : '#FFFFFF'),
                    borderColor: isActive 
                      ? (isDark ? '#FFFFFF' : '#000000') 
                      : (isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1'),
                    borderWidth: 1.5,
                  },
                ]}
                onPress={() => setActiveCategory(cat.id)}
              >
                <Text style={styles.badgeIcon}>{cat.icon}</Text>
                <Text 
                  style={[
                    styles.badgeText,
                    {
                      color: isActive 
                        ? (isDark ? '#000000' : '#FFFFFF') 
                        : (isDark ? '#94A3B8' : '#64748B'),
                      fontWeight: isActive ? '700' : '600',
                    },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Input below Badges */}
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <View style={styles.searchWrap}>
          <Search color={isDark ? '#94A3B8' : '#64748B'} size={18} style={styles.searchIcon} />
          <TextInput 
            style={[
              styles.searchInput,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
                borderWidth: 1.5,
                color: isDark ? '#FFFFFF' : '#0F172A',
              },
            ]}
            placeholder="Search by name, ID, or reference"
            placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Monochrome Bulk Action Button */}
      {canGenerateReceipt && receiptList.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <TouchableOpacity 
            style={[
              styles.bulkBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
              },
            ]} 
            onPress={() => setShowPdfModal(true)}
            activeOpacity={0.8}
          >
            <Download color={isDark ? '#000000' : '#FFFFFF'} size={18} />
            <Text style={[styles.bulkBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
              Generate Receipt ({receiptList.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Donation History List */}
      <ScrollView style={styles.content} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#000000'} style={{ marginTop: 40 }} />
        ) : filteredDonations.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              No online payments found for this category.
            </Text>
          </View>
        ) : (
          filteredDonations.map(donation => {
            const isSelected = selectedIds.has(donation.id);
            return (
              <TouchableOpacity 
                key={donation.id} 
                style={[
                  styles.historyCard,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor: isSelected 
                      ? (isDark ? '#FFFFFF' : '#000000') 
                      : (isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1'),
                    borderWidth: 1.5,
                  },
                ]}
                onPress={() => handlePress(donation)}
                onLongPress={() => handleLongPress(donation.id)}
                delayLongPress={300}
              >
                <View style={styles.historyCardLeft}>
                  <View 
                    style={[
                      styles.historyIconBox, 
                      { 
                        backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                      },
                    ]}
                  >
                    {isSelected ? (
                      <CheckCircle2 size={24} color={isDark ? '#FFFFFF' : '#000000'} />
                    ) : (
                      <CheckCircle size={20} color={donation.status === 'completed' ? "#10b981" : (donation.status === 'failed' ? "#ef4444" : "#f59e0b")} />
                    )}
                  </View>
                  <View>
                    <Text style={[styles.historyNameText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                      {donation.userName || donation.name || 'Anonymous'}
                    </Text>
                    <Text style={[styles.historyCatText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      {donation.category}
                    </Text>
                    <Text style={[styles.historyDateText, { color: isDark ? '#71717A' : '#94A3B8' }]}>
                      {donation.date ? new Date(donation.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.historyAmountText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                    {formatCurrency(donation.amount)}
                  </Text>
                  {donation.status !== 'completed' && (
                    <Text style={[styles.statusText, { color: donation.status === 'failed' ? '#ef4444' : '#f59e0b' }]}>
                      {donation.status}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Receipt Modal for Online Donations */}
      <ReceiptModal 
        visible={showReceipt} 
        onClose={() => setShowReceipt(false)} 
        donation={selectedDonation} 
      />

      {/* Bulk Receipt Modal */}
      <Modal visible={showPdfModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#F8FAFC' }}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />
          <View 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: 16, 
              paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44) + 12, 
              backgroundColor: isDark ? '#000000' : '#FFFFFF',
              borderBottomWidth: 1.5,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
            }}
          >
            <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 18, fontWeight: '700' }}>Receipt Preview</Text>
            <TouchableOpacity onPress={() => setShowPdfModal(false)} style={{ padding: 4 }}>
              <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 15, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
          
          <View 
            style={{ 
              flex: 1, 
              margin: 16, 
              borderRadius: 12, 
              overflow: 'hidden', 
              borderWidth: 1.5, 
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1', 
              backgroundColor: '#FFFFFF',
            }}
          >
            <WebView originWhitelist={['*']} source={{ html: getBulkDonationReceiptHTML(receiptList, displayType, authorizerName) }} style={{ flex: 1 }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, padding: 20, paddingBottom: 40 }}>
            <TouchableOpacity 
              style={{ 
                backgroundColor: isDark ? '#FFFFFF' : '#000000', 
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
                paddingHorizontal: 20, 
                paddingVertical: 12, 
                borderRadius: 24, 
                alignItems: 'center', 
                flexDirection: 'row', 
                gap: 8,
              }} 
              onPress={() => generateBulkDonationReceipt(receiptList, displayType, false, authorizerName)}
            >
              <Download size={16} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Download</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ 
                backgroundColor: isDark ? '#FFFFFF' : '#000000', 
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
                paddingHorizontal: 20, 
                paddingVertical: 12, 
                borderRadius: 24, 
                alignItems: 'center', 
                flexDirection: 'row', 
                gap: 8,
              }} 
              onPress={() => generateBulkDonationReceipt(receiptList, displayType, true, authorizerName)}
            >
              <Share2 size={16} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topbar: { width: '100%' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContainer: {
    paddingVertical: 14,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  badgeIcon: {
    fontSize: 14,
  },
  badgeText: {
    fontSize: 13,
  },
  summaryCardWrapper: {
    borderRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
  summaryCard: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: 'rgba(229, 184, 75, 0.35)',
    borderTopColor: 'rgba(255, 240, 180, 0.60)',
  },
  specularSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
  },
  coinWrap: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(229, 184, 75, 0.40)',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C0F05',
    letterSpacing: -0.5,
  },
  searchWrap: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    top: '50%',
    transform: [{ translateY: -9 }],
    zIndex: 1,
  },
  searchInput: {
    borderRadius: 12,
    padding: 12,
    paddingLeft: 42,
    fontSize: 14,
    fontWeight: '500',
  },
  content: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  historyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyNameText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  historyCatText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyDateText: {
    fontSize: 11,
    fontWeight: '500',
  },
  historyAmountText: {
    fontSize: 16,
    fontWeight: '800',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  bulkBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
