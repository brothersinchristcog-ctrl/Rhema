import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, FlatList, Modal, StatusBar, Platform } from 'react-native';
import { ArrowLeft, Search, Calendar as CalIcon, Download, Share2, CheckCircle2, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GoldCoin3D from '../../../components/GoldCoin3D';
import { COLORS, formatCurrency, formatDate, formatReceiptNo, generateBulkDonationReceipt, getBulkDonationReceiptHTML } from './AdminDonationsUtils';
import { useAuth } from '../../../context/AuthContext';
import { WebView } from 'react-native-webview';
import { db } from '../../../services/firebaseConfig';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminTheme } from '../../../utils/adminThemeHelper';

export default function AdminDonationsList({ donations = [], onNavigate }: any) {
  const { isDark } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('All');
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const { user, member } = useAuth();
  const authorizerName = member?.name || user?.displayName || user?.email || 'Authorized Administrator';

  const dateOpts = ["All", "Today", "This Week", "This Month", "This Year"];

  const filteredList = donations.filter((d: any) => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q || (d.name?.toLowerCase() || '').includes(q) || (d.id?.toLowerCase() || '').includes(q) || (d.ref?.toLowerCase() || '').includes(q);
    
    let matchDate = true;
    if (d.date && dateFilter !== 'All') {
      const dt = new Date(d.date);
      const today = new Date();
      if (dateFilter === "Today") matchDate = dt.toDateString() === today.toDateString();
      if (dateFilter === "This Week") {
        const startWeek = new Date(today);
        startWeek.setDate(today.getDate() - today.getDay());
        matchDate = dt >= startWeek;
      }
      if (dateFilter === "This Month") matchDate = dt >= new Date(today.getFullYear(), today.getMonth(), 1);
      if (dateFilter === "This Year") matchDate = dt >= new Date(today.getFullYear(), 0, 1);
    }
    
    // Hide corrupt literal template string IDs
    const isCorrupt = d.id?.includes('${');
    if (isCorrupt) {
      db.collection('ledger_donations').doc(d.id).delete().catch(console.error);
    }

    return matchQ && matchDate && !isCorrupt;
  });

  const handleLongPress = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handlePress = (item: any) => {
    if (selectedIds.size > 0) {
      handleLongPress(item.id);
    } else {
      onNavigate('details', item);
    }
  };

  const isSelectionMode = selectedIds.size > 0;
  const canGenerateReceipt = isSelectionMode || filteredList.length > 0;
  const receiptList = isSelectionMode ? filteredList.filter((d: any) => selectedIds.has(d.id)) : filteredList;
  const displayType = isSelectionMode 
    ? (Array.from(new Set(receiptList.map((d: any) => d.type))).length === 1 ? receiptList[0].type : 'CUSTOM') 
    : 'ALL';

  const totalAmount = filteredList.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);

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
            paddingBottom: 10,
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
              Offline Donations
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
              {filteredList.length} record{filteredList.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Monochrome Add Button */}
          <TouchableOpacity 
            style={[
              styles.addBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderWidth: 1.5,
              },
            ]} 
            onPress={() => onNavigate('create')}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Plus color={isDark ? '#000000' : '#FFFFFF'} size={22} strokeWidth={2.8} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {/* Total Offline Donations Summary Card */}
        <View style={{ marginBottom: 14 }}>
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
                {dateFilter === 'All' ? 'Total Offline Donations' : `${dateFilter} Offline Donations`}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.summaryAmount} numberOfLines={1}>
                {formatCurrency(totalAmount)}
              </Text>
            </LinearGradient>
          </View>
        </View>

        {/* Filters */}
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            {dateOpts.map(o => {
              const active = dateFilter === o;
              return (
                <TouchableOpacity 
                  key={o} 
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: active ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#18181B' : '#FFFFFF'),
                      borderColor: active ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1'),
                      borderWidth: 1.5,
                    },
                  ]} 
                  onPress={() => setDateFilter(o)}
                >
                  <Text 
                    style={[
                      styles.filterPillText, 
                      {
                        color: active ? (isDark ? '#000000' : '#FFFFFF') : (isDark ? '#94A3B8' : '#64748B'),
                        fontWeight: active ? '700' : '600',
                      },
                    ]}
                  >
                    {o}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Search Input (below Badges) */}
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

        {/* Monochrome Bulk Action Button */}
        {canGenerateReceipt && receiptList.length > 0 && (
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
        )}

        {filteredList.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 38, marginBottom: 10, opacity: 0.6 }}>🕊️</Text>
            <Text style={[styles.emptyText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              No donations match your search or filters.
            </Text>
          </View>
        ) : (
          <FlatList 
            data={filteredList}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <TouchableOpacity 
                  style={[
                    styles.donItem, 
                    {
                      backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                      borderColor: isSelected 
                        ? (isDark ? '#FFFFFF' : '#000000') 
                        : (isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1'),
                      borderWidth: 1.5,
                    },
                  ]} 
                  onPress={() => handlePress(item)}
                  onLongPress={() => handleLongPress(item.id)}
                  delayLongPress={300}
                >
                  <View style={styles.donTop}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text 
                        style={[styles.donName, { color: isDark ? '#FFFFFF' : '#0F172A' }]} 
                        numberOfLines={1}
                      >
                        {item.name === 'Anonymous' ? 'Unknown Donor' : item.name}
                      </Text>
                      <View 
                        style={[
                          styles.donTypeWrap,
                          {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <Text style={[styles.donType, { color: isDark ? '#E4E4E7' : '#334155' }]}>
                          {item.type}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isSelected && <CheckCircle2 color={isDark ? '#FFFFFF' : '#000000'} size={20} />}
                      <Text style={[styles.donAmount, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                        {formatCurrency(item.amount)}
                      </Text>
                    </View>
                  </View>
                  <View 
                    style={[
                      styles.donMeta,
                      {
                        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#F1F5F9',
                      },
                    ]}
                  >
                    <Text style={[styles.donMetaText, { color: isDark ? '#94A3B8' : '#64748B' }]}>{formatDate(item.date)}</Text>
                    <Text style={[styles.donMetaText, { color: isDark ? '#94A3B8' : '#64748B' }]}>{item.method}</Text>
                    <Text style={[styles.donMetaText, { color: isDark ? '#94A3B8' : '#64748B' }]}>{formatReceiptNo(item.id)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

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
  container: {
    flex: 1,
  },
  topbar: {
    width: '100%',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchWrap: {
    position: 'relative',
    marginBottom: 14,
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
  filterScroll: {
    maxHeight: 44,
    marginBottom: 10,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  donItem: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  donTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  donName: {
    fontSize: 16,
    fontWeight: '700',
  },
  donAmount: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  donTypeWrap: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  donType: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  donMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  donMetaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  bulkBtnText: {
    fontSize: 15,
    fontWeight: '700',
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
});
