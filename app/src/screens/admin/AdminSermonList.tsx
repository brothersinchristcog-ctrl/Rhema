import React, { useState, useEffect, useContext } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  ActivityIndicator, 
  Platform, 
  StatusBar,
  Dimensions,
  Alert,
  Modal,
  Image
} from 'react-native';
import { 
  Search, 
  Play, 
  Plus, 
  ChevronRight, 
  RefreshCw,
  Clock,
  Edit2,
  Trash2,
  ChevronLeft
, ArrowLeft } from 'lucide-react-native';
import { AdminTabContext } from '../../context/AdminTabContext';
import { LinearGradient } from 'expo-linear-gradient';

import FirestoreService, { Sermon } from '../../services/FirestoreService';
import { Linking } from 'react-native';
import { formatSermonDuration, formatDateDisplay, formatDateTimeDisplay } from '../../utils/DateUtils';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');

const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]+)/);
  return match ? match[1] : cleanUrl;
};

export default function AdminSermonList() {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const { setActiveTab, setEditingData, setTabByName } = useContext(AdminTabContext);
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [sermonToDelete, setSermonToDelete] = useState<Sermon | null>(null);

  const [customCategories, setCustomCategories] = useState<string[]>([]);

  useEffect(() => {
    fetchSermons();
  }, []);

  const fetchSermons = async () => {
    setLoading(true);
    try {
      const [data, cats] = await Promise.all([
        FirestoreService.getSermons(50),
        FirestoreService.getSermonCategories().catch(() => [])
      ]);
      setSermons(data);
      if (Array.isArray(cats)) setCustomCategories(cats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (sermon: Sermon) => {
    setEditingData(sermon);
    setTabByName?.('New Sermon'); // Switch to New Sermon editor tab
  };

  const handlePlay = (sermon: Sermon) => {
    const id = sermon.youtubeId;
    if (!id) {
      if (sermon.audioUrl) Linking.openURL(sermon.audioUrl);
      return;
    }
    
    let url = id;
    if (!id.includes('http') && id.length === 11) {
      url = `https://www.youtube.com/watch?v=${id}`;
    }
    Linking.openURL(url).catch(err => console.error(err));
  };

  const confirmDeleteSermon = async () => {
    if (!sermonToDelete?.id) return;
    try {
      setLoading(true);
      await FirestoreService.deleteSermon(sermonToDelete.id);
      fetchSermons(); // Refresh list after delete
      setSermonToDelete(null);
      setShowDeleteSuccess(true);
      setTimeout(() => setShowDeleteSuccess(false), 2500);
    } catch (err: any) {
      Alert.alert("Delete Failed", err.message || "Could not delete sermon.");
      setSermonToDelete(null);
      setLoading(false);
    }
  };

  // Parse all unique categories
  const allCategories = [
    ...sermons.flatMap(s => s.categories ? s.categories.split(';') : []),
    ...customCategories
  ];
  const uniqueCategories = [...new Set(allCategories.filter(Boolean))];

  const stats = {
    published: sermons.filter(s => s.status === 'Published' || !s.status).length,
    scheduled: sermons.filter(s => s.status === 'Scheduled').length,
    drafts: sermons.filter(s => s.status === 'Draft').length,
    categories: uniqueCategories.length
  };

  const categoryList = ['All', ...uniqueCategories];
  const filteredSermons = sermons.filter(s => {
    if (filter === 'All') return true;
    if (filter === 'Published') return s.status === 'Published' || !s.status;
    if (filter === 'Scheduled') return s.status === 'Scheduled';
    if (filter === 'Drafts') return s.status === 'Draft';
    // Filter by specific category
    return s.categories && s.categories.split(';').includes(filter);
  });

  if (loading && sermons.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a2d5a" />
      </View>
    );
  }

  const getPublishedDateTime = (sermon: any): string => {
    // 1. Explicit publishedAt timestamp/string
    if (sermon.publishedAt) {
      const formatted = formatDateTimeDisplay(sermon.publishedAt);
      if (formatted) return formatted;
    }

    // 2. Scheduled publish target time
    if (sermon.scheduledPublishAt && sermon.status === 'Published') {
      const formatted = formatDateTimeDisplay(sermon.scheduledPublishAt);
      if (formatted) return formatted;
    }

    // 3. Transition timestamp when status was updated to Published
    if (sermon.updatedAt && sermon.status === 'Published') {
      const formatted = formatDateTimeDisplay(sermon.updatedAt);
      if (formatted) return formatted;
    }

    // 4. Creation timestamp for immediately published sermons
    if (sermon.createdAt) {
      const formatted = formatDateTimeDisplay(sermon.createdAt);
      if (formatted) return formatted;
    }

    return '';
  };

  const renderSermonItem = (sermon: any, idx: number) => {
    const cleanYId = extractYoutubeId(sermon.youtubeId || '');
    const thumbUri = sermon.thumbnailUrl || sermon.imageUrl || (cleanYId && cleanYId.length === 11 ? `https://img.youtube.com/vi/${cleanYId}/hqdefault.jpg` : null);

    return (
      <View 
        key={sermon.id} 
        style={[
          styles.sermonItem,
          {
            backgroundColor: isDark ? '#18181B' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0',
            borderWidth: 1.2,
          }
        ]}
      >
        {/* Left Column: Content */}
        <View style={styles.sermonCardContent}>
          {/* Top Row: YouTube Thumbnail + English & Telugu Titles */}
          <View style={styles.sermonCardTopRow}>
            <TouchableOpacity 
              style={[
                styles.siThumb, 
                { 
                  backgroundColor: isDark ? '#27272A' : '#1E293B',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)',
                  borderWidth: 1,
                }
              ]}
              onPress={() => handlePlay(sermon)}
              activeOpacity={0.8}
            >
              {thumbUri ? (
                <>
                  <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  <View style={styles.siThumbOverlay}>
                    <View style={styles.siPlayCircle}>
                      <Play size={12} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 1.5 }} />
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.siPlayCircle}>
                  <Play size={13} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 1.5 }} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.siTitlesContainer} 
              onPress={() => handleEdit(sermon)}
              activeOpacity={0.85}
            >
              <Text 
                style={[
                  styles.siTitle, 
                  { color: isDark ? '#FFFFFF' : '#0F172A' }
                ]} 
                numberOfLines={2}
              >
                {sermon.title}
              </Text>

              {sermon.titleTelugu ? (
                <Text 
                  style={[
                    styles.siTe, 
                    { color: isDark ? '#C6A66B' : '#98713D' }
                  ]} 
                  numberOfLines={1}
                >
                  {sermon.titleTelugu}
                </Text>
              ) : null}
            </TouchableOpacity>
          </View>

          {/* Bottom Section: Starts from below YouTube card */}
          <TouchableOpacity 
            style={styles.sermonCardBottomSection} 
            onPress={() => handleEdit(sermon)}
            activeOpacity={0.85}
          >
            {/* Pastor, Date & Duration */}
            <Text style={[styles.siMeta, { color: isDark ? '#E4E4E7' : '#334155' }]} numberOfLines={1}>
              {sermon.pastor} · {formatDateDisplay(sermon.date)} {sermon.duration && formatSermonDuration(sermon.duration) ? `· ${formatSermonDuration(sermon.duration)}` : ''}
            </Text>

            {/* Published / Scheduled / Draft Notice Text (Full text displayed) */}
            {sermon.status === 'Scheduled' && sermon.scheduledDate ? (
              <Text style={[styles.siSchedMeta, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                ⏰ Auto-publishes: {formatDateDisplay(sermon.scheduledDate)}{sermon.scheduledTime ? ` at ${sermon.scheduledTime}` : ''}
              </Text>
            ) : (sermon.status === 'Published' || !sermon.status) ? (
              <Text style={[styles.siPublishedMeta, { color: isDark ? '#34D399' : '#15803D' }]}>
                📢 Published: {getPublishedDateTime(sermon) || formatDateDisplay(sermon.date)}
              </Text>
            ) : (
              <Text style={[styles.siDraftMeta, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                📝 Draft (Unpublished)
              </Text>
            )}

            {/* Horizontal scrollable badges row (Categories, Audio, Pending/Schedule) */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={{ marginTop: 8 }}
              contentContainerStyle={styles.siFootScroll}
            >
              {/* Series / Categories Badges (Sunday Service, Special Messages, Women's Fasting, etc.) */}
              {sermon.categories ? (
                sermon.categories.split(';').map((cat: string) => {
                  const trimmed = cat.trim();
                  if (!trimmed) return null;
                  return (
                    <View 
                      key={trimmed} 
                      style={[
                        styles.badgeSeries,
                        {
                          backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#E2E8F0',
                        }
                      ]}
                    >
                      <Text style={[styles.badgeSeriesTxt, { color: isDark ? '#E4E4E7' : '#334155' }]}>{trimmed}</Text>
                    </View>
                  );
                })
              ) : null}

              {/* Audio Badge */}
              {sermon.audioUrl ? (
                <View 
                  style={[
                    styles.badgeIcon,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#F0FDF4',
                      borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#DCFCE7',
                      borderWidth: 1,
                    }
                  ]}
                >
                  <Text style={[styles.badgeIconTxt, { color: isDark ? '#34D399' : '#16A34A' }]}>🎙️ Audio</Text>
                </View>
              ) : null}

              {/* Pending or Schedule Badge */}
              {sermon.status === 'Draft' ? (
                <View 
                  style={[
                    styles.badgeStatus, 
                    isDark ? styles.statusDraftBgDark : styles.statusDraftBg
                  ]}
                >
                  <Text 
                    style={[
                      styles.badgeStatusTxt, 
                      isDark ? styles.statusDraftTxtDark : styles.statusDraftTxt
                    ]}
                  >
                    Pending
                  </Text>
                </View>
              ) : sermon.status === 'Scheduled' ? (
                <View 
                  style={[
                    styles.badgeStatus, 
                    isDark ? styles.statusSchedBgDark : styles.statusSchedBg
                  ]}
                >
                  <Text 
                    style={[
                      styles.badgeStatusTxt, 
                      isDark ? styles.statusSchedTxtDark : styles.statusSchedTxt
                    ]}
                  >
                    Scheduled
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </TouchableOpacity>
        </View>

        {/* Right Side Only: Edit & Delete Actions (Clean icon+text, square boxes removed, line moved right) */}
        <View 
          style={[
            styles.actionsContainer,
            {
              borderLeftColor: isDark ? 'rgba(255, 255, 255, 0.32)' : '#94A3B8',
            }
          ]}
        >
          <TouchableOpacity 
            style={styles.editAction} 
            onPress={() => handleEdit(sermon)}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 6, left: 6, right: 6 }}
          >
            <Edit2 size={17} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2.2} />
            <Text style={[styles.editActionTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.deleteAction} 
            onPress={() => setSermonToDelete(sermon)}
            activeOpacity={0.6}
            hitSlop={{ top: 6, bottom: 8, left: 6, right: 6 }}
          >
            <Trash2 size={17} color={isDark ? '#F87171' : '#DC2626'} strokeWidth={2.2} />
            <Text style={[styles.deleteActionTxt, { color: isDark ? '#F87171' : '#DC2626' }]}>Del</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStatCard = (
    key: string,
    label: string,
    count: number,
    accentColor: string,
    accentColorDark: string,
    lightGrad: [string, string, string],
    darkGrad: [string, string, string],
    filterTarget: string
  ) => {
    const isSelected = filter === filterTarget;
    const activeColor = isDark ? accentColorDark : accentColor;

    return (
      <TouchableOpacity
        key={key}
        style={[
          styles.statCard,
          {
            borderColor: isSelected
              ? activeColor
              : isDark
              ? 'rgba(255, 255, 255, 0.14)'
              : 'rgba(0, 0, 0, 0.08)',
            borderWidth: isSelected ? 2 : 1,
            backgroundColor: isDark ? '#18181B' : '#FFFFFF',
          }
        ]}
        onPress={() => setFilter(isSelected ? 'All' : filterTarget)}
        activeOpacity={0.75}
      >
        <LinearGradient
          colors={isDark ? darkGrad : lightGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statGlassInner}
        >
          <View style={[styles.statNotch, { backgroundColor: activeColor }]} />
          <Text style={[styles.statNum, { color: activeColor }]}>{count}</Text>
          <View style={styles.statLabelRow}>
            <Text
              style={[
                styles.statLbl,
                { color: isDark ? '#E4E4E7' : '#334155' },
                isSelected && { color: activeColor, fontWeight: '800' }
              ]}
            >
              {label}
            </Text>
            {isSelected && (
              <View style={[styles.activeIndicatorDot, { backgroundColor: activeColor }]} />
            )}
          </View>
          <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            {isSelected ? 'Active ✓' : 'Tap to filter'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* ── Hero Section ── */}
      <View style={[styles.hero, {
        backgroundColor: isDark ? '#000000' : '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
        paddingBottom: 14,
        marginBottom: 4
      }]}>
        <View style={styles.heroTitleRow}>
          <TouchableOpacity
            onPress={() => { if (setTabByName) setTabByName('Dashboard'); else setActiveTab(0); }}
            style={[styles.circularBackBtn, {
              backgroundColor: isDark ? '#000000' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#E2E8F0',
              borderWidth: 1.5,
            }]}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  textAlign: 'center',
                  fontSize: 20,
                  fontWeight: '800',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                  letterSpacing: -0.4,
                }
              ]}
              numberOfLines={1}
            >
              Sermons
            </Text>
          </View>

          <TouchableOpacity 
            style={[
              styles.newBtn, 
              { 
                flexShrink: 0,
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
                borderRadius: 999,
                paddingHorizontal: 13,
                paddingVertical: 7.5,
                borderWidth: 1.5,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }
            ]} 
            onPress={() => { setEditingData(null); setTabByName?.('New Sermon'); }}
            activeOpacity={0.8}
          >
            <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
            <Text 
              style={[
                styles.newBtnTxt, 
                { 
                  color: isDark ? '#000000' : '#FFFFFF', 
                  fontWeight: '800', 
                  fontSize: 11.5 
                }
              ]} 
              numberOfLines={1}
            >
              New Sermon
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* ── Stats Bar ── */}
        <View style={styles.statsRow}>
          {renderStatCard(
            'published',
            'Published',
            stats.published,
            '#059669',
            '#34D399',
            ['#FFFFFF', '#F7FCF9', '#ECFDF5'],
            ['rgba(16, 185, 129, 0.16)', 'rgba(24, 24, 27, 0.65)', 'rgba(15, 15, 18, 0.95)'],
            'Published'
          )}
          {stats.scheduled > 0 &&
            renderStatCard(
              'scheduled',
              'Scheduled',
              stats.scheduled,
              '#7C3AED',
              '#A78BFA',
              ['#FFFFFF', '#FAF5FF', '#F3E8FF'],
              ['rgba(139, 92, 246, 0.16)', 'rgba(24, 24, 27, 0.65)', 'rgba(15, 15, 18, 0.95)'],
              'Scheduled'
            )}
          {renderStatCard(
            'drafts',
            'Drafts',
            stats.drafts,
            '#D97706',
            '#FBBF24',
            ['#FFFFFF', '#FFFDF7', '#FEF3C7'],
            ['rgba(245, 158, 11, 0.16)', 'rgba(24, 24, 27, 0.65)', 'rgba(15, 15, 18, 0.95)'],
            'Drafts'
          )}
          {renderStatCard(
            'series',
            'Series',
            stats.categories,
            '#2563EB',
            '#60A5FA',
            ['#FFFFFF', '#F8FAFC', '#EFF6FF'],
            ['rgba(59, 130, 246, 0.16)', 'rgba(24, 24, 27, 0.65)', 'rgba(15, 15, 18, 0.95)'],
            'SeriesGroup'
          )}
        </View>

        {/* ── Filter Badges / Chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingRight: 14, paddingVertical: 4 }}>
          {categoryList.map(f => {
            const isSelected = filter === f;
            const count = f === 'All' 
              ? sermons.length 
              : sermons.filter(s => s.categories && s.categories.split(';').includes(f)).length;

            return (
              <TouchableOpacity 
                key={f} 
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected
                      ? (isDark ? '#FFFFFF' : '#000000')
                      : (isDark ? '#18181B' : '#FFFFFF'),
                    borderColor: isSelected
                      ? (isDark ? '#FFFFFF' : '#000000')
                      : (isDark ? 'rgba(255, 255, 255, 0.18)' : '#E2E8F0'),
                    borderWidth: 1.5,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    marginRight: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    elevation: isSelected ? 3 : 1,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isSelected ? 0.2 : 0.05,
                    shadowRadius: 3,
                  }
                ]}
                onPress={() => setFilter(f)}
                activeOpacity={0.8}
              >
                <Text 
                  style={[
                    styles.filterChipTxt,
                    {
                      color: isSelected
                        ? (isDark ? '#000000' : '#FFFFFF')
                        : (isDark ? '#FFFFFF' : '#0F172A'),
                      fontSize: 11.5,
                      fontWeight: '800',
                    }
                  ]}
                >
                  {f}
                </Text>
                <View
                  style={{
                    backgroundColor: isSelected
                      ? (isDark ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.22)')
                      : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)'),
                    paddingHorizontal: 6,
                    paddingVertical: 1.5,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? (isDark ? '#000000' : '#FFFFFF')
                        : (isDark ? '#A1A1AA' : '#64748B'),
                      fontSize: 10,
                      fontWeight: '800',
                    }}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filter === 'SeriesGroup' ? (
          <View>
            {uniqueCategories.map(cat => {
              const catSermons = sermons.filter(s => s.categories && s.categories.split(';').includes(cat));
              if (catSermons.length === 0) return null;
              return (
                <View key={cat} style={{ marginBottom: 12 }}>
                  <Text style={styles.listLabel}>{cat}</Text>
                  {catSermons.map((sermon, idx) => renderSermonItem(sermon, idx))}
                </View>
              );
            })}
          </View>
        ) : (
          <View>
            <Text style={styles.listLabel}>Latest Sermons</Text>
            {filteredSermons.map((sermon, idx) => renderSermonItem(sermon, idx))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Delete Confirmation Modal ── */}
      {sermonToDelete && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.successBg}>
            <View style={styles.successCard}>
              <View style={[styles.successIconOuter, { backgroundColor: '#FEF2F2' }]}>
                <View style={[styles.successIconInner, { backgroundColor: '#DC2626' }]}>
                  <Trash2 size={28} color="#fff" />
                </View>
              </View>
              <Text style={styles.successTitle}>Delete Sermon?</Text>
              <Text style={styles.successDesc}>
                Are you sure you want to delete "{sermonToDelete.title}"? This action cannot be undone.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' }}>
                <TouchableOpacity style={[styles.successSecBtn, { flex: 1 }]} onPress={() => setSermonToDelete(null)}>
                  <Text style={styles.successSecTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.successActionBtn, { flex: 1, backgroundColor: '#DC2626', marginBottom: 0 }]} onPress={confirmDeleteSermon}>
                  <Text style={styles.successActionTxt}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Delete Success Modal */}
      {showDeleteSuccess && (
        <View style={styles.toastOverlay}>
          <View style={styles.toastCard}>
            <View style={styles.toastIconBox}>
              <Trash2 size={24} color="#DC2626" />
            </View>
            <View>
              <Text style={styles.toastTitle}>Sermon Deleted</Text>
              <Text style={styles.toastSub}>The sermon has been permanently removed.</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  // ─── Layout ──────────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: '#EDE8DC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EDE8DC' },
  scroll: { padding: 14, paddingBottom: 100 },

  // ─── Hero ────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    overflow: 'visible',
    position: 'relative',
    marginBottom: 6,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
  heroTitle: { color: '#0F172A', fontSize: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  heroSub: { color: '#64748b', fontSize: 13 },
  newBtn: { 
    backgroundColor: '#000000', 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13, 
    paddingVertical: 7.5, 
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  newBtnTxt: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },

  // ─── Stats Row ───────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { 
    flex: 1, 
    minWidth: 96,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statGlassInner: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNotch: {
    width: 22,
    height: 3,
    borderRadius: 1.5,
    marginBottom: 6,
  },
  statNum: { 
    fontSize: 22, 
    fontWeight: '800', 
    letterSpacing: -0.5,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statLbl: { 
    fontSize: 10.5, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.6,
  },
  activeIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statHintTxt: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
  },

  // ─── Filter Badges / Chips ────────────────────────────────────────────────
  filterRow: { flexDirection: 'row', marginBottom: 16 },
  filterChip: { 
    paddingHorizontal: 14, 
    paddingVertical: 7, 
    borderRadius: 999, 
    backgroundColor: '#FFFFFF', 
    borderWidth: 1.5, 
    borderColor: '#E2E8F0', 
    marginRight: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  filterChipActive: { backgroundColor: '#000000', borderColor: '#000000' },
  filterChipTxt: { fontSize: 11.5, fontWeight: '800', color: '#0F172A' },
  filterChipTxtActive: { color: '#FFFFFF' },

  // ─── List ────────────────────────────────────────────────────────────────
  listLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4, paddingLeft: 4 },

  sermonItem: { 
    borderRadius: 18, 
    borderWidth: 1.2, 
    padding: 14, 
    marginBottom: 14, 
    flexDirection: 'row', 
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2 
  },
  sermonCardContent: {
    flex: 1,
    paddingRight: 6,
  },
  sermonCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  siThumb: { 
    width: 76, 
    height: 52, 
    borderRadius: 11, 
    justifyContent: 'center', 
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  siThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  siPlayCircle: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  siTitlesContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  siTitle: { 
    fontSize: 15.5, 
    fontWeight: '800', 
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  siTe: { 
    fontSize: 13.5, 
    fontStyle: 'italic', 
    marginTop: 3, 
    lineHeight: 18,
  },
  sermonCardBottomSection: {
    marginTop: 9,
  },
  siMeta: { 
    fontSize: 12.5, 
    fontWeight: '700',
    lineHeight: 17,
  },
  siPublishedMeta: { 
    fontSize: 11.5, 
    marginTop: 4, 
    fontWeight: '600',
  },
  siSchedMeta: { 
    fontSize: 11.5, 
    marginTop: 4, 
    fontWeight: '700',
  },
  siDraftMeta: { 
    fontSize: 11.5, 
    marginTop: 4, 
    fontWeight: '600',
  },
  specialMsgBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  specialMsgTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  siFootScroll: { 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 7, 
    paddingVertical: 2,
    paddingRight: 8,
  },
  
  badgeSeries: { 
    paddingHorizontal: 9, 
    paddingVertical: 4, 
    borderRadius: 999, 
    borderWidth: 1, 
  },
  badgeSeriesTxt: { 
    fontSize: 10.5, 
    fontWeight: '800', 
    textTransform: 'uppercase', 
    letterSpacing: 0.3,
  },
  
  badgeIcon: { 
    paddingHorizontal: 9, 
    paddingVertical: 4, 
    borderRadius: 999, 
    borderWidth: 1,
  },
  badgeIconTxt: { 
    fontSize: 11, 
    fontWeight: '700',
  },

  badgeStatus: { 
    paddingHorizontal: 9, 
    paddingVertical: 4, 
    borderRadius: 999, 
    borderWidth: 1, 
  },
  statusPubBg: { backgroundColor: '#EDF7F1', borderColor: '#A3D9B8' },
  statusPubTxt: { color: '#15803D' },
  statusPubBgDark: { backgroundColor: 'rgba(16, 185, 129, 0.16)', borderColor: 'rgba(16, 185, 129, 0.35)' },
  statusPubTxtDark: { color: '#34D399' },
  statusSchedBg: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  statusSchedTxt: { color: '#B45309' },
  statusSchedBgDark: { backgroundColor: 'rgba(245, 158, 11, 0.16)', borderColor: 'rgba(245, 158, 11, 0.35)' },
  statusSchedTxtDark: { color: '#FBBF24' },
  statusDraftBg: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  statusDraftTxt: { color: '#475569' },
  statusDraftBgDark: { backgroundColor: 'rgba(148, 163, 184, 0.14)', borderColor: 'rgba(148, 163, 184, 0.3)' },
  statusDraftTxtDark: { color: '#CBD5E1' },
  badgeStatusTxt: { fontSize: 10.5, fontWeight: '800' },
  
  // Actions Container (Right Side Only - Line moved right, square boxes removed)
  actionsContainer: { 
    borderLeftWidth: 2, 
    paddingLeft: 8,
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  editAction: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 2,
    paddingHorizontal: 4,
    gap: 2.5,
  },
  editActionTxt: { 
    fontSize: 9.5, 
    fontWeight: '800', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5,
  },
  deleteAction: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 2,
    paddingHorizontal: 4,
    gap: 2.5,
  },
  deleteActionTxt: { 
    fontSize: 9.5, 
    fontWeight: '800', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5,
  },

  // Toast
  toastOverlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  toastCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, paddingRight: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, shadowColor: '#1a2d5a', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6, borderWidth: 1, borderColor: 'rgba(26,45,90,0.05)' },
  toastIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' },
  toastTitle: { fontSize: 14, fontWeight: '800', color: '#1a2d5a' },
  toastSub: { fontSize: 11, color: '#6B7280', marginTop: 2, fontWeight: '500' },

  // Confirmation Modal
  successBg: { flex: 1, backgroundColor: 'rgba(26,45,90, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '92%', maxWidth: 400, alignItems: 'center', elevation: 10 },
  successIconOuter: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  successIconInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#2E6B4F', justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: 20, fontWeight: '900', color: '#1a2d5a', marginBottom: 8, textAlign: 'center' },
  successDesc: { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  successActionBtn: { backgroundColor: '#1a2d5a', height: 48, borderRadius: 12, width: '100%', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  successActionTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  successSecBtn: { height: 48, borderRadius: 12, width: '100%', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  successSecTxt: { color: '#1a2d5a', fontSize: 13, fontWeight: '800' }
}));
