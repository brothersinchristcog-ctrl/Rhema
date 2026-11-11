import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
  Platform,
  Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  ArrowLeft,
  CheckCircle, 
  MessageCircle, 
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Heart,
  BookOpen
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import FirestoreService, { AppMember } from '../services/FirestoreService';
import { PrayerRequest } from '../types/schema';

interface PrayerFormProps {
  prayerInput: string;
  setPrayerInput: (text: string) => void;
  category: string;
  setCategory: (cat: string) => void;
  categories: any[];
  isSubmitting: boolean;
  handleSubmit: () => void;
  isPublic: boolean;
  setIsPublic: (val: boolean) => void;
}

const getPrayerCategoryLabel = (label: string, t: any) => {
  if (!label) return '';
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('me')) {
    return t('prayer.categories.prayForMe');
  }
  if (normalized.includes('family')) {
    return t('prayer.categories.prayForFamily');
  }
  if (normalized.includes('healing')) {
    return t('prayer.categories.prayForHealing');
  }
  if (normalized.includes('peace') || normalized.includes('strength')) {
    return t('prayer.categories.prayForPeaceAndStrength');
  }
  if (normalized.includes('other')) {
    return t('prayer.categories.other');
  }
  return label;
};

const PrayerForm = ({ 
  prayerInput, 
  setPrayerInput, 
  category, 
  setCategory, 
  categories, 
  isSubmitting, 
  handleSubmit,
  isPublic,
  setIsPublic
}: PrayerFormProps) => {
  const { t } = useLanguage();
  const { isDark, colors } = useTheme();

  return (
    <View style={[styles.composeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.composeHeader, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <CheckCircle size={16} color={colors.textSecondary} />
        <Text style={[styles.composeHeaderText, { color: colors.text }]}>{t('prayer.submitPrayerRequestHeader')}</Text>
      </View>
      <View style={styles.composeBody}>
        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('prayer.selectCategory')}</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.catList}
        >
          {categories.map((cat) => {
            const isCatSelected = category === cat.label;
            return (
              <TouchableOpacity 
                key={cat.label}
                style={[
                  styles.catBtn, 
                  { 
                    backgroundColor: isCatSelected ? (isDark ? '#FFFFFF' : '#0F172A') : colors.background, 
                    borderColor: isCatSelected ? (isDark ? '#FFFFFF' : '#0F172A') : colors.border 
                  }
                ]}
                onPress={() => setCategory(cat.label)}
                activeOpacity={0.7}
              >
                <Text style={styles.catIcon}>{cat.icon}</Text>
                <Text style={[styles.catLabel, { color: isCatSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary, fontWeight: isCatSelected ? '800' : '600' }]}>
                  {getPrayerCategoryLabel(cat.label, t)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('prayer.detailedRequest')}</Text>
        <TextInput
          style={[
            styles.composeInput,
            { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
          ]}
          placeholder={t('prayer.requestPlaceholder')}
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={4}
          value={prayerInput}
          onChangeText={setPrayerInput}
          blurOnSubmit={false}
        />

        {/* Public Toggle & Submit Request on Same Line */}
        <View style={styles.composeFooter}>
          <TouchableOpacity 
            style={styles.toggleContainer}
            onPress={() => setIsPublic(!isPublic)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleLabel, { color: colors.text }]}>{t('prayer.publicToggle')}</Text>
            <View style={[styles.toggleSwitch, isPublic && { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }]}>
              <View style={[styles.toggleThumb, isPublic && [styles.toggleThumbActive, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]]} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.submitBtn, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }, isSubmitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
            ) : (
              <Text 
                style={[styles.submitBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {t('prayer.submitBtn')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default function PrayerWallScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user, member: authMember } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const { t } = useLanguage();
  const [member, setMember] = useState<AppMember | null>(null);
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [prayedSet, setPrayedSet] = useState(new Set<string>());
  const [replyInputs, setReplyInputs] = useState<{[key: string]: string}>({});
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  
  // Form State
  const [prayerInput, setPrayerInput] = useState('');
  const [category, setCategory] = useState('Pray for me');
  const [isPublic, setIsPublic] = useState(false);
  const [activeTab, setActiveTab] = useState<'my_requests' | 'public_requests'>(route?.params?.tab || 'my_requests');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (route?.params?.tab) {
      setActiveTab(route.params.tab);
    }
  }, [route?.params?.tab]);

  const categories = [
    { label: 'Pray for me', icon: '👤' },
    { label: 'Pray for my family', icon: '🏠' },
    { label: 'Pray for healing', icon: '🏥' },
    { label: 'Pray for peace and strength', icon: '🕊️' },
    { label: 'Other (if necessary)', icon: '✨' }
  ];

  const fetchPrayers = async (contactId?: string, isRefreshing = false) => {
    try {
      const uid = user?.uid;
      const phone = user?.phoneNumber;
      const data = await FirestoreService.getPrayerRequests({ contactId });
      setPrayers(data);
      // Restore prayedSet from Firestore prayedBy array
      if (uid || phone) {
        const alreadyPrayed = new Set<string>();
        data.forEach((p: any) => {
          if (
            (uid && p.prayedBy?.includes(uid)) ||
            (phone && p.prayedBy?.includes(phone))
          ) {
            alreadyPrayed.add(p.id);
          }
        });
        setPrayedSet(alreadyPrayed);
      }
    } catch (error) {
      console.error('Error fetching prayers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      let contactId = undefined;
      if (user?.phoneNumber) {
        const result = await FirestoreService.checkContactExists(user.phoneNumber);
        if (result?.exists && result.member) {
          setMember(result.member);
          contactId = result.member.id;
        }
      }
      fetchPrayers(contactId, false);
    };
    init();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPrayers(member?.id || undefined, true);
  };

  const handleSubmit = async () => {
    if (!prayerInput.trim()) {
      Alert.alert(t('prayer.missingInfo'), t('prayer.pleaseShareRequest'));
      return;
    }

    const submitterName = (member?.name || authMember?.name || user?.displayName || '').trim() || 'Church Member';
    const submitterPhone = user?.phoneNumber || member?.phone || authMember?.phone || '';
    const submitterId = member?.id || authMember?.id || user?.uid || null;

    setIsSubmitting(true);
    try {
      await FirestoreService.submitPrayerRequest({
        name: submitterName,
        memberName: submitterName,
        authorName: submitterName,
        phone: submitterPhone,
        contactId: submitterId,
        request: prayerInput,
        category: category,
        isAnonymous: false,
        uid: user?.uid || submitterId,
        type: isPublic ? 'public' : 'private',
        isPublic: isPublic
      });
      
      setShowSuccess(true);
      setPrayerInput('');
      fetchPrayers(member?.id || undefined, true);
    } catch (err) {
      Alert.alert(t('common.error'), t('prayer.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTimeAgo = (rawDate: any) => {
    try {
      // Firestore Timestamp has a .toDate() method
      const date: Date = rawDate?.toDate ? rawDate.toDate() 
        : rawDate instanceof Date ? rawDate 
        : new Date(rawDate);

      if (!date || isNaN(date.getTime())) return 'Recently';

      const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
      if (seconds < 60) return 'Just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days} days ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };



  const handleReplySubmit = async (caseId: string) => {
    const comment = replyInputs[caseId]?.trim();
    if (!comment) return;
    
    setSubmittingReplyId(caseId);
    try {
      const authorName = member?.name || user?.displayName || 'Member';
      await FirestoreService.addPrayerComment(caseId, comment, authorName);
      setReplyInputs(prev => ({ ...prev, [caseId]: '' }));
      fetchPrayers(member?.id || undefined, true);
    } catch (err) {
      Alert.alert('Error', 'Unable to post comment. Please try again.');
    } finally {
      setSubmittingReplyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      t('prayer.deleteRequestTitle'),
      t('prayer.deleteRequestConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('common.delete'), 
          style: 'destructive',
          onPress: async () => {
            try {
              await FirestoreService.deletePrayerRequest(id);
              fetchPrayers(member?.id || undefined, true);
            } catch (err) {
              Alert.alert(t('common.error'), t('prayer.submitError'));
            }
          }
        }
      ]
    );
  };

  const handlePray = async (id: string) => {
    if (prayedSet.has(id)) return;
    const uid = user?.uid || user?.phoneNumber || 'anon';
    const memberName = member?.name || user?.displayName || 'A Member';
    // Optimistic update
    setPrayedSet(prev => new Set([...prev, id]));
    setPrayers(prev => prev.map(p =>
      p.id === id
        ? { ...p, prayCount: (p.prayCount || 0) + 1, prayedByNames: [...(p.prayedByNames || []), memberName] }
        : p
    ));
    try {
      await FirestoreService.incrementPrayCount(id, uid, memberName);
    } catch (err) {
      // Rollback on failure
      setPrayedSet(prev => { const s = new Set(prev); s.delete(id); return s; });
      setPrayers(prev => prev.map(p =>
        p.id === id
          ? { ...p, prayCount: Math.max(0, (p.prayCount || 0) - 1), prayedByNames: (p.prayedByNames || []).filter(n => n !== memberName) }
          : p
      ));
      Alert.alert('Error', 'Could not record your prayer. Try again.');
    }
  };

  const renderPrayerItem = ({ item }: { item: PrayerRequest }) => {
    const isAnswered = item.isAnswered;
    const initial = item.name.charAt(0).toUpperCase();
    const isOwner = !!(user?.phoneNumber && item.phone && user.phoneNumber === item.phone)
      || !!(member?.id && (item.contactId === member.id || item.authorId === member.id));
    const hasPrayed = prayedSet.has(item.id) || !!(user?.uid && item.prayedBy?.includes(user.uid))
      || !!(user?.phoneNumber && item.prayedBy?.includes(user.phoneNumber));
    const isPublicTab = activeTab === 'public_requests';
    const isExpanded = expandedItems.has(item.id);
    const prayedNames: string[] = Array.isArray(item.prayedByNames) ? item.prayedByNames : [];
    const prayCount = item.prayCount || 0;

    const toggleExpand = () => {
      setExpandedItems(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
        return next;
      });
    };

    // ── PUBLIC PRAYERS TAB ─────────────────────────────────
    if (isPublicTab) {
      return (
        <View style={[styles.prayerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={[styles.avatar, { backgroundColor: '#7c3aed' }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {getTimeAgo(item.createdAt)} · {getPrayerCategoryLabel(item.category, t) || 'General'}
              </Text>
            </View>
          </View>

          {/* Prayer Text */}
          <Text style={[styles.prayerText, { color: colors.text }]}>{item.text}</Text>

          {/* Attached Bible Verse from Pastor */}
          {(item.bibleVerse || item.verseReference) ? (
            <View style={{
              backgroundColor: '#fffbeb',
              borderRadius: 10,
              padding: 10,
              marginBottom: 10,
              borderLeftWidth: 3,
              borderLeftColor: '#d97706',
              borderWidth: 1,
              borderColor: '#fef3c7'
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <BookOpen size={14} color="#b45309" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#b45309' }}>
                  {item.bibleVerse || item.verseReference}
                </Text>
              </View>
              {item.verseText ? (
                <Text style={{ fontSize: 12, fontStyle: 'italic', color: '#78350f', lineHeight: 17 }}>
                  "{item.verseText}"
                </Text>
              ) : null}
              {item.verseTextTe && item.verseTextTe.trim() !== (item.verseText || '').trim() ? (
                <Text style={{ fontSize: 11, fontStyle: 'italic', color: '#92400e', marginTop: 3, lineHeight: 16 }}>
                  "{item.verseTextTe}"
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Button Row: Pray btn + Chevron */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              style={[styles.prayBtnSmall, { backgroundColor: colors.accent }, hasPrayed && styles.prayBtnActive]}
              onPress={() => handlePray(item.id)}
              disabled={hasPrayed}
              activeOpacity={0.8}
            >
              <CheckCircle2 size={14} color={hasPrayed ? '#4ade80' : '#fff'} />
              <Text style={[styles.prayBtnText, hasPrayed && styles.prayBtnTextActive]}>
                {hasPrayed ? t('prayer.praying') : t('prayer.willPrayForYou')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chevronBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={toggleExpand}
              activeOpacity={0.7}
            >
              {isExpanded
                ? <ChevronUp size={18} color={colors.text} />
                : <ChevronDown size={18} color={colors.text} />}
            </TouchableOpacity>
          </View>

          {/* Dropdown: Members Praying List */}
          {isExpanded && prayedNames.length > 0 && (
            <View style={[styles.prayingNamesBox, { marginTop: 12 }]}>
              <Text style={[styles.prayingNamesHeader, { color: colors.textSecondary }]}>{t('prayer.membersPraying')}</Text>
              {prayedNames.map((name, idx) => (
                <View key={idx} style={styles.prayingNameRow}>
                  <View style={[styles.prayingNameDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.prayingNameText, { color: colors.text }]}>{name}</Text>
                </View>
              ))}
            </View>
          )}
          {isExpanded && prayedNames.length === 0 && (
            <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 10, fontStyle: 'italic' }}>
              {t('prayer.beFirstToPray')}
            </Text>
          )}
        </View>
      );
    }

    // ── MY REQUESTS TAB ────────────────────────────────────
    return (
      <View
        style={[
          styles.prayerCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
          item.isAnswered && { borderLeftWidth: 4, borderLeftColor: '#16a34a' },
        ]}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: item.isAnswered ? '#16a34a' : '#7c3aed' }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {getTimeAgo(item.createdAt)} · {getPrayerCategoryLabel(item.category, t) || 'General'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {item.isAnswered && (
              <View style={{ backgroundColor: isDark ? 'rgba(22, 163, 74, 0.2)' : '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#4ade80' : '#16a34a' }}>✨ {t('prayer.answered')}</Text>
              </View>
            )}
            {isOwner && (
              <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                <Trash2 size={18} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Prayer Text */}
        <Text style={[styles.prayerText, { color: colors.text }]}>{item.text}</Text>

        {/* Attached Bible Verse from Pastor */}
        {(item.bibleVerse || item.verseReference) ? (
          <View style={{
            backgroundColor: isDark ? 'rgba(217, 119, 6, 0.14)' : '#fffbeb',
            borderRadius: 12,
            padding: 12,
            marginTop: 10,
            borderLeftWidth: 3,
            borderLeftColor: isDark ? '#F59E0B' : '#d97706',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 158, 11, 0.28)' : '#fef3c7'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <BookOpen size={14} color={isDark ? '#FBBF24' : '#b45309'} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#FBBF24' : '#b45309' }}>
                {item.bibleVerse || item.verseReference}
              </Text>
            </View>
            {item.verseText ? (
              <Text style={{ fontSize: 13, fontStyle: 'italic', color: isDark ? '#FDE68A' : '#78350f', lineHeight: 18 }}>
                "{item.verseText}"
              </Text>
            ) : null}
            {item.verseTextTe && item.verseTextTe.trim() !== (item.verseText || '').trim() ? (
              <Text style={{ fontSize: 12, fontStyle: 'italic', color: isDark ? '#FCD34D' : '#92400e', marginTop: 4, lineHeight: 17 }}>
                "{item.verseTextTe}"
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Admin Response */}
        {item.isAnswered && item.replies && item.replies.length > 0 && (
          <View style={{ marginTop: 12 }}>
            {item.replies.map((reply: any, idx: number) => (
              <View key={reply.id || idx} style={{
                backgroundColor: isDark ? 'rgba(22, 163, 74, 0.14)' : '#f0fdf4',
                borderRadius: 12,
                padding: 14,
                marginBottom: 8,
                borderLeftWidth: 3,
                borderLeftColor: isDark ? '#22C55E' : '#16a34a'
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#4ADE80' : '#15803d' }}>
                    🙏 {reply.author}
                  </Text>
                  <Text style={{ fontSize: 11, color: isDark ? '#86EFAC' : '#64748B' }}>
                    {new Date(reply.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: isDark ? '#DCFCE7' : '#166534', lineHeight: 22 }}>{reply.body}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Comment Input — always visible for owner */}
        {isOwner && (
          <View style={[styles.addReplyContainer, { marginTop: 10 }]}>
            <TextInput
              style={[
                styles.replyInput,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
              ]}
              placeholder={item.isAnswered ? 'Write a thank you or comment...' : 'Awaiting Admin response...'}
              placeholderTextColor="#94a3b8"
              value={replyInputs[item.id] || ''}
              onChangeText={(text) => setReplyInputs(prev => ({ ...prev, [item.id]: text }))}
              multiline
              editable={!!item.isAnswered}
            />
            <TouchableOpacity
              style={[styles.replySubmitBtn, { backgroundColor: colors.accent }, (!replyInputs[item.id]?.trim() || !item.isAnswered) && styles.replySubmitBtnDisabled]}
              onPress={() => handleReplySubmit(item.id)}
              disabled={!replyInputs[item.id]?.trim() || !item.isAnswered || submittingReplyId === item.id}
            >
              {submittingReplyId === item.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.replySubmitText}>Post</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent || colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>{t('prayer.connecting')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.background} />
      
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
          {t('prayer.title')}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <FlatList
        style={{ flex: 1, backgroundColor: colors.background }}
        data={activeTab === 'my_requests' 
          ? prayers.filter(p => 
              p.contactId === member?.id || p.authorId === member?.id
            ) 
          : prayers.filter(p => p.isPublic && p.isAnswered && !p.isClosed)}
        renderItem={renderPrayerItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a2d5a" />}
        ListHeaderComponent={
          <View>
            <View style={[
              styles.tabsContainer, 
              { 
                backgroundColor: isDark ? '#18181B' : '#F1F5F9', 
                borderColor: isDark ? '#27272A' : '#E2E8F0', 
                borderWidth: 1, 
                marginTop: 18 
              }
            ]}>
              {/* My Prayers Button */}
              <TouchableOpacity 
                style={[
                  styles.tabBtn, 
                  activeTab === 'my_requests' && [
                    styles.tabBtnActive,
                    { 
                      backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
                      shadowColor: '#000',
                      shadowOpacity: isDark ? 0.3 : 0.12,
                      shadowRadius: 4,
                      elevation: 3,
                    }
                  ]
                ]}
                onPress={() => setActiveTab('my_requests')}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.tabBtnText, 
                  { 
                    color: activeTab === 'my_requests' 
                      ? (isDark ? '#000000' : '#FFFFFF') 
                      : (isDark ? '#A1A1AA' : '#64748B'),
                    fontWeight: activeTab === 'my_requests' ? '800' : '600',
                  }
                ]}>
                  {t('prayer.myPrayers')}
                </Text>
              </TouchableOpacity>

              {/* All Prayers Button */}
              <TouchableOpacity 
                style={[
                  styles.tabBtn, 
                  activeTab === 'public_requests' && [
                    styles.tabBtnActive,
                    { 
                      backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
                      shadowColor: '#000',
                      shadowOpacity: isDark ? 0.3 : 0.12,
                      shadowRadius: 4,
                      elevation: 3,
                    }
                  ]
                ]}
                onPress={() => setActiveTab('public_requests')}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.tabBtnText, 
                  { 
                    color: activeTab === 'public_requests' 
                      ? (isDark ? '#000000' : '#FFFFFF') 
                      : (isDark ? '#A1A1AA' : '#64748B'),
                    fontWeight: activeTab === 'public_requests' ? '800' : '600',
                  }
                ]}>
                  {t('prayer.allPrayers')}
                </Text>
              </TouchableOpacity>
            </View>
            {activeTab === 'my_requests' && (
              <PrayerForm 
                prayerInput={prayerInput}
                setPrayerInput={setPrayerInput}
                category={category}
                setCategory={setCategory}
                categories={categories}
                isSubmitting={isSubmitting}
                handleSubmit={handleSubmit}
                isPublic={isPublic}
                setIsPublic={setIsPublic}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MessageCircle size={50} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('prayer.noPrayers')}</Text>
          </View>
        }
      />

      {/* Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.successIconBox}><CheckCircle size={40} color="#fff" /></View>
            <Text style={[styles.successTitle, { color: colors.text }]}>{t('prayer.requestSubmitted')}</Text>
            <Text style={[styles.successSub, { color: colors.textSecondary }]}>{t('prayer.requestSubmittedSub')}</Text>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.accent }]} onPress={() => setShowSuccess(false)}>
              <Text style={styles.doneBtnTxt}>{t('prayer.amen')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F2' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF7F2' },
  loadingText: { color: '#1a2d5a', marginTop: 15, fontWeight: '600' },

  // Header
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerCenterTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
  headerSub: { color: '#aac4e8', fontSize: 12, marginTop: 2 },
  themeToggle: { 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  themeToggleText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  listContainer: { paddingBottom: 150 },

  // Compose Card
  composeCard: { 
    marginHorizontal: 16, 
    marginVertical: 14,
    backgroundColor: '#fff', 
    borderRadius: 24, 
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  composeHeader: { 
    backgroundColor: 'transparent', 
    paddingVertical: 14, 
    paddingHorizontal: 20, 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10 
  },
  composeHeaderText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  composeBody: { padding: 16 },
  inputLabel: { fontSize: 12, fontWeight: '800', color: '#1e293b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  catList: { gap: 10, paddingBottom: 12 },
  catBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FAF7F2', 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: '#f1f5f9',
    gap: 6
  },
  catBtnActive: { backgroundColor: '#1a2d5a', borderColor: '#1a2d5a' },
  catIcon: { fontSize: 15 },
  catLabel: { fontSize: 12.5, color: '#475569', fontWeight: '700' },
  catLabelActive: { color: '#fff' },

  composeInput: { 
    width: '100%', 
    backgroundColor: '#FAF7F2', 
    borderRadius: 16, 
    padding: 14, 
    fontSize: 14.5, 
    lineHeight: 22,
    color: '#1e293b', 
    borderWidth: 1.5, 
    borderColor: '#e2e8f0',
    minHeight: 120, 
    textAlignVertical: 'top',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  
  composeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  toggleLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1e293b',
  },
  toggleSwitch: {
    width: 40,
    height: 24,
    backgroundColor: '#cbd5e1',
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: { backgroundColor: '#1a2d5a' },
  toggleThumb: {
    width: 20,
    height: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: { transform: [{ translateX: 16 }] },

  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 14,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabBtnActive: { 
    elevation: 3,
  },
  tabBtnText: { fontSize: 13.5, fontWeight: '700' },
  tabBtnTextActive: { color: '#fff', fontWeight: '800' },

  quickReplyBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickReplyText: { fontSize: 13, fontWeight: '600', color: '#475569' },

  submitBtn: { 
    backgroundColor: '#1a2d5a', 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    borderRadius: 14, 
    elevation: 4,
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  submitBtnText: { color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'center' },

  // Prayer Card
  prayerCard: { 
    backgroundColor: '#fff', 
    borderRadius: 22, 
    padding: 18, 
    marginHorizontal: 20, 
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  cardAnswered: { borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 15 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  nameAnswered: { color: '#1e293b' },
  answeredBadge: { color: '#059669', fontWeight: '700', fontSize: 12 },
  countBadge: { backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  countText: { fontSize: 11, color: '#16a34a', fontWeight: '700' },
  countTextAnswered: { color: '#059669', backgroundColor: '#f0fdf4' },
  metaText: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  
  textContainer: { backgroundColor: '#FAF7F2', padding: 18, borderRadius: 18, marginBottom: 15, borderWidth: 1, borderColor: '#f1f5f9' },
  textContainerAnswered: { backgroundColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: '#10b981' },
  prayerText: { fontSize: 15, color: '#1e293b', lineHeight: 24, marginTop: 10, marginBottom: 16 },
  prayerTextAnswered: { color: '#334155', fontWeight: '500' },

  // Action Row
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  prayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a2d5a',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    flex: 1,
  },
  prayBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a2d5a',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  prayBtnActive: { backgroundColor: '#15803d', borderWidth: 2, borderColor: '#4ade80' },
  prayBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  prayBtnTextActive: { color: '#bbf7d0' },
  chevronBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0'
  },
  chevronIcon: { fontSize: 16, color: '#1a2d5a', fontWeight: '700' },
  ownerBadge: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  ownerBadgeText: { fontSize: 13, color: '#475569', fontWeight: '600' },

  // Expanded section
  expandedSection: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  prayingNamesBox: { marginBottom: 12 },
  prayingNamesHeader: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1, marginBottom: 8 },
  prayingNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  prayingNameDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1a2d5a' },
  prayingNameText: { fontSize: 14, color: '#1e293b', fontWeight: '500' },

  repliesContainer: { marginBottom: 15, marginLeft: 15, paddingLeft: 15, borderLeftWidth: 2, borderLeftColor: '#e2e8f0' },
  repliesHeader: { fontSize: 13, fontWeight: '800', color: '#1a2d5a', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  replyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  replyAuthor: { fontSize: 13, fontWeight: '700', color: '#1a2d5a' },
  replyDate: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  replyBody: { fontSize: 14, color: '#475569', lineHeight: 22 },

  addReplyContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 5,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end'
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: '#1e293b',
    minHeight: 44,
    maxHeight: 100
  },
  replySubmitBtn: {
    backgroundColor: '#1a2d5a',
    paddingHorizontal: 15,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  replySubmitBtnDisabled: {
    backgroundColor: '#94a3b8'
  },
  replySubmitText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700'
  },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iprayedBtn: { 
    backgroundColor: '#f1f5f9', 
    paddingHorizontal: 18, 
    paddingVertical: 10, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  iprayedBtnActive: { backgroundColor: '#1a2d5a', borderColor: '#1a2d5a' },
  iprayedText: { fontSize: 13, color: '#fff', fontWeight: '800' },
  iprayedTextAnswered: { color: '#16a34a' },
  footerDate: { fontSize: 12, color: '#94a3b8' },

  // Empty State
  emptyState: { padding: 40, alignItems: 'center', marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1a2d5a', marginTop: 15 },
  emptySub: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  // Success Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 45, 90, 0.9)', justifyContent: 'center', alignItems: 'center', padding: 25 },
  successCard: { backgroundColor: '#fff', width: '100%', borderRadius: 32, padding: 35, alignItems: 'center', elevation: 25 },
  successIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center', marginBottom: 25 },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#1a2d5a', marginBottom: 12, textAlign: 'center' },
  successSub: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 24, marginBottom: 30 },
  doneBtn: { backgroundColor: '#c13b2d', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 18, width: '100%', alignItems: 'center' },
  doneBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 1 },

  // Wall Section Header
  wallSectionHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginVertical: 15, 
    paddingHorizontal: 20 
  },
  wallHeaderLine: { 
    flex: 1, 
    height: 1, 
    backgroundColor: '#e2e8f0' 
  },
  wallHeaderText: { 
    marginHorizontal: 15, 
    fontSize: 11, 
    fontWeight: '800', 
    color: '#1a2d5a', 
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  }
});
