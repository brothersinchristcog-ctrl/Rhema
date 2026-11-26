import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Alert, Dimensions, Platform, Modal } from 'react-native';
import { ChevronLeft, Search, CheckCircle2, SlidersHorizontal, Gift, Send, Info, CheckCircle, X } from 'lucide-react-native';
import FirestoreService from '../../services/FirestoreService';
import { useChurch } from '../../context/ChurchContext';
import Theme from '../../theme/Theme';
import CachedImage from '../../components/CachedImage';
import { getInstantMemory, loadWithInstantCache, makeScopedCacheKey } from '../../utils/instantCache';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');

const parseCelebrationDateParts = (rawDate: any): { year: number; month: number; day: number } | null => {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const clean = rawDate.trim().split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length < 3) return null;

  let year = 0;
  let month = 0;
  let day = 0;
  if (parts[0].length === 4) {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (parts[2].length === 4) {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  }
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year: isNaN(year) ? 0 : year, month, day };
};

const getUtcCalendarDiffDays = (month: number, day: number, now: Date): number => {
  const cy = now.getFullYear();
  const todayUtc = Date.UTC(cy, now.getMonth(), now.getDate());
  const eventUtc = Date.UTC(cy, month - 1, day);
  return Math.round((eventUtc - todayUtc) / 86400000);
};

const MemberAvatar = React.memo(({ member, initials, styles, bgColor }: any) => {
  const [imgError, setImgError] = React.useState(false);
  const possibleUrls = [
    member.profilePhoto, member.photoURL, member.photoUrl, 
    member.ProfilePhoto, member.profileImage, member.Photo, 
    member.PhotoUrl, member.photo
  ];
  const validUrl = possibleUrls.find((url: any) => typeof url === 'string' && url.trim() !== '' && url !== 'null' && url !== 'undefined');

  if (validUrl && !imgError) {
    return (
      <CachedImage 
        uri={validUrl.trim()} 
        style={styles.avatar} 
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View style={[styles.avatar, { backgroundColor: bgColor }]}>
      <Text style={styles.avatarTxt}>{initials}</Text>
    </View>
  );
});

const getAvatarColor = (name: string) => {
  const colors = ['#734062', '#1A4F5B', '#42518E', '#D97736'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export default function AdminCelebrationsList({
  category,
  activeTab,
  onSelectMember,
  listHeaderComponent = null,
  listFooterComponent = null,
}: {
  category: string;
  activeTab: string;
  onSelectMember: (member: any) => void;
  listHeaderComponent?: React.ReactElement | null;
  listFooterComponent?: React.ReactElement | null;
}) {
  const { isDark, secondaryText } = useAdminTheme();
  const { activeChurch } = useChurch();
  const celebrationsListCacheKey = useMemo(
    () => makeScopedCacheKey('admin_celebrations_all_list_v1', activeChurch?.id || 'default', 'admin'),
    [activeChurch?.id]
  );
  const initialCachedAll = useMemo(
    () => getInstantMemory<any[]>(celebrationsListCacheKey),
    [celebrationsListCacheKey]
  );
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(!initialCachedAll);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allRecords, setAllRecords] = useState<any[]>(() => initialCachedAll || []);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    const mem = getInstantMemory<any[]>(celebrationsListCacheKey);
    if (mem) {
      setAllRecords(mem);
      setLoading(false);
    }

    const loadData = async () => {
      try {
        await loadWithInstantCache<any[]>(
          celebrationsListCacheKey,
          async () => {
            const data = await FirestoreService.getAllCelebrations();
            const getValidPhotoUrl = (obj: any) => {
              const fields = ['ProfilePhoto', 'profilePhoto', 'Photo', 'photoUrl', 'photoURL', 'PhotoUrl', 'photo', 'profileImageUrl'];
              for (const f of fields) {
                if (obj[f] && typeof obj[f] === 'string' && obj[f].trim() !== '' && obj[f] !== 'null' && obj[f] !== 'undefined') return obj[f].trim();
              }
              return null;
            };

            const now = new Date();
            const currentYear = now.getFullYear();
            const todayUtc = Date.UTC(currentYear, now.getMonth(), now.getDate());
            const processed: any[] = [];

            const processEvent = (d: any, rawDateVal: any, type: string) => {
              const parsed = parseCelebrationDateParts(rawDateVal);
              if (!parsed) return null;
              const { year, month, day } = parsed;
              const age = year > 1900 ? currentYear - year : 0;

              const dateObj = new Date(currentYear, month - 1, day);
              const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              const displayName = (d.Name || d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown').trim();
              const nameParts = displayName.split(/\s+/);
              const initials = nameParts.length > 1
                ? (nameParts[0][0] || '') + (nameParts[nameParts.length - 1][0] || '')
                : (nameParts[0][0] || '').substring(0, 2);

              const thisYearUtc = Date.UTC(currentYear, month - 1, day);
              let sortDiff = thisYearUtc - todayUtc;
              if (sortDiff < 0) sortDiff += 366 * 86400000;

              return {
                ...d,
                id: `${d.Id || d.id}_${type}`,
                originalId: d.Id || d.id,
                name: displayName,
                initials: initials.toUpperCase(),
                photoUrl: getValidPhotoUrl(d),
                dateStr,
                age,
                phone: d.MobilePhone || d.directPhone || d.Phone || d.phone || '',
                referencePhone: d.referencePhone || '',
                isReferencePhone: d.isReferencePhone || false,
                rawMonth: month,
                rawDay: day,
                sortDiff,
                celebrationType: type,
              };
            };

            data.forEach((d: any) => {
              const bDate = d.Birthdate || d.dob || d.birthdate || d.dateOfBirth || d.birthday;
              const aDate = d.Anniversary_Date__c || d.anniversaryDate || d.marriageDate || d.anniversary;
              const baptDate = d.Baptism_Date__c || d.baptismDate || d.baptism;

              const bday = processEvent(d, bDate, 'Birthday');
              const wedding = processEvent(d, aDate, 'Wedding Anniversary');
              const baptism = processEvent(d, baptDate, 'Baptism Anniversary');

              if (bday) processed.push(bday);
              if (wedding) processed.push(wedding);
              if (baptism) processed.push(baptism);
            });

            processed.sort((a, b) => a.sortDiff - b.sortDiff);
            return processed;
          },
          (processed) => {
            if (!mountedRef.current) return;
            setAllRecords(processed);
            setLoading(false);
          },
          { ttlMs: 5 * 60 * 1000, freshSkipMs: 0 }
        );
      } catch (err) {
        console.error('Error loading celebrations list:', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [celebrationsListCacheKey]);

  const filteredMembers = useMemo(() => {
    const queryLower = searchQuery.trim().toLowerCase();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const todayUtc = Date.UTC(currentYear, now.getMonth(), now.getDate());

    return allRecords.filter((m) => {
      if (category !== 'All' && m.celebrationType !== category) return false;
      if (queryLower && !(m.name || '').toLowerCase().includes(queryLower)) return false;
      if (activeTab === 'All') return true;

      const diffDays = getUtcCalendarDiffDays(m.rawMonth, m.rawDay, now);

      if (activeTab === 'Today') {
        return diffDays === 0;
      } else if (activeTab === 'Upcoming') {
        return diffDays > 0;
      } else if (activeTab === 'Week') {
        let wrapDiff = diffDays;
        if (wrapDiff < 0) {
          wrapDiff = Math.round((Date.UTC(currentYear + 1, m.rawMonth - 1, m.rawDay) - todayUtc) / 86400000);
        }
        return wrapDiff >= 0 && wrapDiff <= 7;
      } else if (activeTab === 'Month') {
        return m.rawMonth === currentMonth;
      } else if (activeTab === 'Past') {
        return diffDays < 0;
      }
      return true;
    });
  }, [allRecords, category, activeTab, searchQuery]);

  const renderMemberCard = useCallback(({ item: member }: { item: any }) => (
    <TouchableOpacity 
      style={[
        styles.memberCard,
        {
          borderWidth: 1.5,
          borderColor: isDark ? '#27272A' : '#CBD5E1',
          marginHorizontal: 20,
        }
      ]} 
      onPress={() => onSelectMember(member)}
      activeOpacity={0.75}
    >
      <MemberAvatar 
        member={member} 
        initials={member.initials || (member.name ? member.name.substring(0, 2).toUpperCase() : 'U')} 
        styles={styles} 
        bgColor={getAvatarColor(member.name || 'U')} 
      />
      
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
        <View style={styles.memberMetaRow}>
          <View style={styles.tag}>
            <Text style={styles.tagTxt} numberOfLines={1} adjustsFontSizeToFit>
              {member.celebrationType ? member.celebrationType.toUpperCase() : category.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.metaTxt}>• {member.dateStr} {member.age ? `• ${member.age} yrs` : ''}</Text>
        </View>
      </View>
    </TouchableOpacity>
  ), [isDark, onSelectMember, category]);

  const handleAutoSendAll = async () => {
    if (filteredMembers.length === 0) return;
    setShowConfirmModal(true);
  };

  const executeAutoSendAll = async () => {
    setShowConfirmModal(false);
    setIsSendingAll(true);
    try {
      for (const member of filteredMembers) {
        const memberCelebrationType = member.celebrationType || category;
        const lowerType = String(memberCelebrationType).toLowerCase();
        const isBirthday = lowerType.includes('birthday');
        const isWeddingAnniv = lowerType.includes('anniversary') && !lowerType.includes('baptism');
        const title = `${isBirthday ? '🎂 Happy Birthday' : isWeddingAnniv ? '💐 Happy Anniversary' : '🕊️ Happy Baptism Anniversary'}, ${member.name}!`;
        const content = `Praise the Lord!\n\nDear ${member.name}, wishing you a very Happy ${memberCelebrationType}! May God bless you abundantly.\n\nWith Love ❤️\n${activeChurch?.name || 'Your Church'}`;
        const pushType = isBirthday ? 'birthday' : isWeddingAnniv ? 'anniversary' : 'baptism_anniversary';

        await FirestoreService.createNotificationBroadcast({
          title,
          content,
          date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
          type: pushType,
          celebrationCategory: memberCelebrationType,
          isCelebration: true,
          targetChurchId: activeChurch?.id || 'rhema',
          targetMemberId: member.originalId || member.Id || member.id || '',
          targetPhone: member.phone || '',
          silent: false,
        });
      }
      setSuccessMessage(`Automated wishes sent to ${filteredMembers.length} members!`);
      setShowSuccessModal(true);
    } catch (err) {
      console.error('Error auto sending:', err);
      Alert.alert('Error', 'An error occurred while sending automated wishes.');
    } finally {
      setIsSendingAll(false);
    }
  };

  const searchAndHeaderNode = (
    <View>
      {listHeaderComponent}
      <View style={[styles.searchRow, { marginHorizontal: 20, marginRight: 20 }]}>
        <View style={[
          styles.searchBox, 
          { 
            marginRight: 0,
            borderWidth: 1.5,
            borderColor: isDark ? '#3F3F46' : '#94A3B8',
            backgroundColor: isDark ? '#18181B' : '#FFFFFF',
          }
        ]}>
          <Search size={18} color={isDark ? '#A1A1AA' : '#64748B'} style={styles.searchIcon} />
          <TextInput 
            style={[styles.searchInput, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
            placeholder="Search by name..."
            placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={isDark ? '#A1A1AA' : '#64748B'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.listHeaderRow, { marginHorizontal: 20 }]}>
        <Text style={styles.foundText}>{filteredMembers.length} members found</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={loading ? [] : filteredMembers}
        keyExtractor={(item, idx) => String(item.id || idx)}
        renderItem={renderMemberCard}
        ListHeaderComponent={searchAndHeaderNode}
        ListFooterComponent={listFooterComponent}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#BE9A3A" />
            </View>
          ) : (
            <View style={{ paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: secondaryText, textAlign: 'center' }}>
                No celebrations match the selected filter.
              </Text>
            </View>
          )
        }
      />

      {/* Confirm Auto-Send Modal */}
      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={[styles.modalIconBox, { backgroundColor: '#E0E7FF' }]}>
              <Info size={32} color="#4338CA" />
            </View>
            <Text style={styles.modalTitle}>Confirm Auto-Send</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to automatically send push notifications to all {filteredMembers.length} members celebrating today?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowConfirmModal(false)}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={executeAutoSendAll}>
                <Text style={styles.modalConfirmTxt}>Send to All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSuccessModal(false)}>
              <X size={20} color="#6B7280" />
            </TouchableOpacity>
            <View style={[styles.modalIconBox, { backgroundColor: '#D1FAE5' }]}>
              <CheckCircle size={32} color="#10B981" />
            </View>
            <Text style={styles.modalTitle}>Success!</Text>
            <Text style={styles.modalMessage}>{successMessage}</Text>
            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setShowSuccessModal(false)}>
              <Text style={styles.modalDoneTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F0',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FAF8F0',
    justifyContent: 'center',
    alignItems: 'center'
  },
    header: { 
    backgroundColor: '#1a2d5a', 
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    zIndex: 10,
  },
  backBtn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 2 },
  backBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  heroTitles: { flex: 1, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)', paddingLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 11, color: '#F3EAD9', marginTop: 2 },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  autoSendBtn: {
    backgroundColor: '#37469B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  autoSendBtnTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  
  content: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  sectionTitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  tabsScroll: {
    marginBottom: 20,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabBtnActive: {
    backgroundColor: '#162057',
    borderColor: '#162057',
  },
  tabTxt: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTxtActive: {
    color: '#FFFFFF',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    marginRight: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  foundText: {
    color: '#64748B',
    fontSize: 14,
    marginBottom: 16,
  },
  memberCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarTxt: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  memberMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  tag: {
    backgroundColor: '#FDE68A', // Yellow/Gold
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagTxt: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metaTxt: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  actionCol: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: 56,
    marginLeft: 12,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalCancelTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#37469B',
    alignItems: 'center',
  },
  modalConfirmTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalDoneBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  modalDoneTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  }
}));
