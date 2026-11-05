
const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) return cleanUrl;
  return cleanUrl;
};
import YoutubePlayer from 'react-native-youtube-iframe';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Platform, StatusBar, Linking, Alert, Dimensions, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronLeft, Bookmark, Globe, Sliders, ExternalLink } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { SupportedLanguage } from '../locales';
import { WorshipSong } from '../services/FirestoreService';
import { SongLanguageHelper } from '../services/SongLanguageHelper';
import { TransliterationService } from '../services/TransliterationService';

interface SongDetailModalProps {
  visible: boolean;
  song: WorshipSong | null;
  onClose: () => void;
  isDark: boolean;
  isSaved?: boolean;
  onToggleSave?: (song: WorshipSong) => void;
  currentSongIndex?: number;
  totalSongs?: number;
  onNext?: () => void;
  onPrev?: () => void;
  headerColors?: [string, string];
  bottomBarColors?: [string, string];
  onEdit?: (song: WorshipSong) => void;
  onDelete?: (song: WorshipSong) => void;
}

const { width } = Dimensions.get('window');

export default function SongDetailModal({
  visible,
  song,
  onClose,
  isDark,
  isSaved = false,
  onToggleSave,
  currentSongIndex = -1,
  totalSongs = 0,
  onNext,
  onPrev,
  headerColors = ['#2b52a1', '#1a3673'],
  bottomBarColors = ['#2b52a1', '#1a3673'],
  onEdit,
  onDelete
}: SongDetailModalProps) {
  const { language, t } = useLanguage();
  const { colors, currentThemeOption } = useTheme();
  const [selectedLangOverride, setSelectedLangOverride] = useState<SupportedLanguage | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);
  const currentSongIndexRef = useRef(currentSongIndex);
  const totalSongsRef = useRef(totalSongs);
  const lastSwipeTimeRef = useRef(0);

  useEffect(() => {
    onNextRef.current = onNext;
    onPrevRef.current = onPrev;
    currentSongIndexRef.current = currentSongIndex;
    totalSongsRef.current = totalSongs;
  }, [onNext, onPrev, currentSongIndex, totalSongs]);

  useEffect(() => {
    setSelectedLangOverride(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [song?.id]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,

      // Only claim the gesture if the movement is predominantly horizontal
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        const isHorizontal = Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.5;
        if (!isHorizontal) return false;

        const hasNext = !!onNextRef.current && (totalSongsRef.current <= 0 || currentSongIndexRef.current < totalSongsRef.current - 1);
        const hasPrev = !!onPrevRef.current && (totalSongsRef.current <= 0 || currentSongIndexRef.current > 0);

        if (dx < -18 && hasNext) return true; // Swiping left -> next song
        if (dx > 18 && hasPrev) return true;  // Swiping right -> prev song
        return false;
      },

      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        const { dx, dy } = gestureState;
        const isHorizontal = Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.5;
        if (!isHorizontal) return false;

        const hasNext = !!onNextRef.current && (totalSongsRef.current <= 0 || currentSongIndexRef.current < totalSongsRef.current - 1);
        const hasPrev = !!onPrevRef.current && (totalSongsRef.current <= 0 || currentSongIndexRef.current > 0);

        if (dx < -18 && hasNext) return true;
        if (dx > 18 && hasPrev) return true;
        return false;
      },

      onPanResponderTerminationRequest: () => false,

      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const now = Date.now();
        if (now - lastSwipeTimeRef.current < 350) return;

        const hasNext = !!onNextRef.current && (totalSongsRef.current <= 0 || currentSongIndexRef.current < totalSongsRef.current - 1);
        const hasPrev = !!onPrevRef.current && (totalSongsRef.current <= 0 || currentSongIndexRef.current > 0);

        // Swipe left (finger moves right-to-left): navigate to next song
        const isSwipeLeft = dx < -40 || (dx < -20 && vx < -0.35);
        // Swipe right (finger moves left-to-right): navigate to previous song
        const isSwipeRight = dx > 40 || (dx > 20 && vx > 0.35);

        if (isSwipeLeft && hasNext) {
          lastSwipeTimeRef.current = now;
          onNextRef.current?.();
        } else if (isSwipeRight && hasPrev) {
          lastSwipeTimeRef.current = now;
          onPrevRef.current?.();
        }
      },
    })
  ).current;

  if (!visible || !song) return null;

  // Prioritize Telugu as the default viewing language
  const availableLanguages = SongLanguageHelper.getAvailableSongLanguages(song, 'te').sort((a, b) => {
    if (a.code === 'te') return -1;
    if (b.code === 'te') return 1;
    if (a.code === 'en') return -1;
    if (b.code === 'en') return 1;
    return 0;
  });

  const hasTelugu = availableLanguages.some(l => l.code === 'te') ||
    !!song.lyricsTe ||
    !!song.titleTe ||
    TransliterationService.isTeluguText(song.lyrics || '') ||
    TransliterationService.isTeluguText(song.title || '');

  const defaultLang: SupportedLanguage = hasTelugu ? 'te' : (language && language !== 'en' ? language : 'te');
  const activeLyricsLang = selectedLangOverride || defaultLang;

  const { primary, secondary } = SongLanguageHelper.getSongTitle(song, activeLyricsLang);
  const subtitle = secondary || (song.category ? SongLanguageHelper.getLocalizedCategory(song.category, activeLyricsLang) : '');
  const lyricsInfo = SongLanguageHelper.getSongLyrics(song, activeLyricsLang);

  const songLead = song.ledBy || (song as any).songLead || (song as any).leadBy || (song as any).leader;

  const openYouTube = (idOrUrl: string) => {
    const trimmed = idOrUrl.trim();
    const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://www.youtube.com/watch?v=${trimmed}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Unable to open YouTube video link.');
    });
  };

  const hasKey = !!(song.key && song.key.trim().length > 0 && song.key !== '—');
  const hasTempo = !!(song.tempo && song.tempo.trim().length > 0 && song.tempo !== '—');
  const hasVerses = !!(song.verses && song.verses.trim().length > 0 && song.verses !== '—');
  const hasCustomTimeSig = !!(song.timeSignature && song.timeSignature.trim().length > 0 && song.timeSignature !== '4/4' && song.timeSignature !== '—');
  const hasArrangement = hasKey || hasTempo || hasVerses || hasCustomTimeSig;
  const hasBandFlow = !!(song.prelude || song.interlude);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.modalCard, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
                    {/* ── Screen Header (Clean circular back button & title) ── */}
          <View
            style={[
              styles.headerRow,
              { paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 12 }
            ]}
          >
            <TouchableOpacity
              style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.8}
            >
              <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
                {primary}
              </Text>
              {subtitle ? (
                <Text style={[styles.headerSubtitleText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {onToggleSave ? (
              <TouchableOpacity
                style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => onToggleSave(song)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.8}
              >
                <Bookmark 
                  size={18} 
                  color={isSaved ? (!isDark ? '#0F172A' : '#E8C46E') : colors.textSecondary} 
                  fill={isSaved ? (!isDark ? '#0F172A' : '#E8C46E') : 'none'} 
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerRightSpacer} />
            )}
          </View>

          <View style={styles.modalScroll}>
            {/* Multiple translations tab switcher */}
            {availableLanguages.length > 1 && (
              <View style={styles.langSelectorRow}>
                {availableLanguages.map(item => {
                  const isSelected = (lyricsInfo.langCode === item.code);
                  return (
                    <TouchableOpacity
                      key={item.code}
                      style={[
                        styles.langPill,
                        { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#3F3F46' : '#0F172A' },
                        isSelected && { backgroundColor: isDark ? '#3F3F46' : '#0F172A', borderColor: isDark ? '#52525B' : '#0F172A' }
                      ]}
                      onPress={() => setSelectedLangOverride(item.code)}
                    >
                      <Text style={[
                        styles.langPillTxt,
                        { color: isDark ? '#94a3b8' : '#64748b' },
                        isSelected && { color: '#fff', fontWeight: '800' }
                      ]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Song Leader / Leading Person ── */}
            {songLead ? (
              <View style={[styles.leaderCard, { backgroundColor: isDark ? '#18181B' : '#F0FDF4', borderColor: isDark ? '#27272A' : '#BBF7D0' }]}>
                <View style={styles.leaderAvatar}>
                  <Text style={styles.leaderAvatarTxt}>{songLead.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.leaderName, { color: isDark ? '#F1F5F9' : '#14532D' }]} numberOfLines={1}>
                    {songLead}
                  </Text>
                  <Text style={[styles.leaderRole, { color: isDark ? '#4ADE80' : '#16A34A' }]}>
                    🎤 Designated Song Leader
                  </Text>
                </View>
                <View style={{ backgroundColor: isDark ? '#064e3b' : '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#6ee7b7' : '#15803D' }}>ASSIGNED</Text>
                </View>
              </View>
            ) : null}

            {/* ── In-App Embedded YouTube Video Player ── */}
            {(() => {
              const yId = song.youtubeId ? extractYoutubeId(song.youtubeId) : '';
              if (!yId || yId.length !== 11) return null;
              const playerWidth = Math.min(width - 40, 480);
              const playerHeight = Math.round((playerWidth * 9) / 16);
              return (
                <View style={{
                  marginBottom: 16,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: '#000',
                  borderWidth: 1,
                  borderColor: isDark ? '#27272A' : '#E2E8F0',
                  alignItems: 'center',
                  height: playerHeight,
                }}>
                  <YoutubePlayer
                    height={playerHeight}
                    width={playerWidth}
                    videoId={yId}
                    play={false}
                  />
                </View>
              );
            })()}

            {/* ── Musical Arrangement Chart ── */}
            {hasArrangement ? (
              <View style={[styles.chartCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                <View style={styles.chartHeaderRow}>
                  <Sliders size={13} color={isDark ? '#94A3B8' : '#1a2d5a'} />
                  <Text style={[styles.chartHeaderTitle, { color: isDark ? '#A1A1AA' : '#0F172A' }]}>
                    MUSICAL ARRANGEMENT
                  </Text>
                  <View style={{ backgroundColor: isDark ? '#27272A' : '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 'auto' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#93C5FD' : '#1D4ED8' }}>SETLIST CHART</Text>
                  </View>
                </View>
                <View style={styles.chartColsRow}>
                  <View style={[styles.chartCol, { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                    <Text style={[styles.chartColLbl, { color: isDark ? '#94A3B8' : '#64748B' }]}>KEY</Text>
                    <Text style={[styles.chartColVal, { color: isDark ? '#38BDF8' : '#0284C7' }]}>{song.key || '—'}</Text>
                  </View>
                  <View style={[styles.chartCol, { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                    <Text style={[styles.chartColLbl, { color: isDark ? '#94A3B8' : '#64748B' }]}>TIME SIG</Text>
                    <Text style={[styles.chartColVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{song.timeSignature || '4/4'}</Text>
                  </View>
                  <View style={[styles.chartCol, { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                    <Text style={[styles.chartColLbl, { color: isDark ? '#94A3B8' : '#64748B' }]}>TEMPO</Text>
                    <Text style={[styles.chartColVal, { color: isDark ? '#FBBF24' : '#D97706' }]}>{song.tempo ? `${song.tempo} BPM` : '—'}</Text>
                  </View>
                  <View style={[styles.chartCol, { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                    <Text style={[styles.chartColLbl, { color: isDark ? '#94A3B8' : '#64748B' }]}>VERSES</Text>
                    <Text style={[styles.chartColVal, { color: isDark ? '#34D399' : '#059669' }]}>{song.verses || '—'}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* ── Band Arrangement (Prelude & Interlude) ── */}
            {hasBandFlow ? (
              <View style={[styles.bandCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                <Text style={[styles.bandHeader, { color: isDark ? '#A1A1AA' : '#0F172A' }]}>BAND ARRANGEMENT</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  {song.prelude ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bandSubLbl}>PRELUDE</Text>
                      <View style={{ backgroundColor: isDark ? '#134e4a' : '#F0FDFA', borderWidth: 1, borderColor: isDark ? '#0f766e' : '#CCFBF1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#5eead4' : '#0F766E' }}>{song.prelude}</Text>
                      </View>
                    </View>
                  ) : null}
                  {song.interlude ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bandSubLbl}>INTERLUDE</Text>
                      <View style={{ backgroundColor: isDark ? '#27272A' : '#EFF6FF', borderWidth: 1, borderColor: isDark ? '#3F3F46' : '#DBEAFE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#93c5fd' : '#1D4ED8' }}>{song.interlude}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* ── Worship & Thematic Notes ── */}
            {song.notes ? (
              <View style={[styles.notesCard, { backgroundColor: isDark ? '#2e2315' : '#FFFBEB', borderColor: isDark ? '#78350f' : '#FDE68A' }]}>
                <Text style={[styles.notesLbl, { color: isDark ? '#FBBF24' : '#92400E' }]}>WORSHIP & THEMATIC NOTES</Text>
                <Text style={[styles.notesTxt, { color: isDark ? '#FDE68A' : '#78350F' }]}>💡 {song.notes}</Text>
              </View>
            ) : null}

            <Text style={[styles.modalSecHeader, { color: isDark ? '#FFFFFF' : '#0F172A', marginTop: 12 }]}>
              {t('songs.lyricsAndScripts')}
              {lyricsInfo.langName ? ` · ${lyricsInfo.langName}` : ''}
            </Text>

            <View style={[styles.lyricsBox, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0', borderWidth: 1, position: 'relative' }]}>
              
              <View style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, flexDirection: 'row', gap: 8 }}>
                {onEdit && (
                  <TouchableOpacity 
                    style={{ 
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                      borderWidth: 1, borderColor: isDark ? '#3F3F46' : '#E2E8F0',
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12
                    }} 
                    onPress={() => onEdit(song)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#94a3b8' : '#64748b' }}>
                      {t('songs.edit')}
                    </Text>
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity 
                    style={{ 
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: '#fee2e2',
                      borderWidth: 1, borderColor: '#fecaca',
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12
                    }} 
                    onPress={() => onDelete(song)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>
                      {t('songs.delete')}
                    </Text>
                  </TouchableOpacity>
                )}
                
              </View>

              <View style={{ marginTop: (onEdit || onDelete) ? 36 : 0, marginBottom: 12 }}>

                {lyricsInfo.isFallback && (
                  <View style={[styles.fallbackNotice, { backgroundColor: isDark ? '#27272A' : '#FEF3C7', borderColor: isDark ? '#3F3F46' : '#FDE68A' }]}>
                    <Text style={[styles.fallbackNoticeTxt, { color: isDark ? '#f8fafc' : '#92400e' }]}>
                      ℹ️ {t('songs.originalContentNotice', { lang: lyricsInfo.langName })}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[styles.lyricsText, { color: colors.text }]}>
                {lyricsInfo.lyrics || t('songs.noLyrics')}
              </Text>
            </View>
            <View style={{ height: 120 }} />
          </View>
        </ScrollView>

        {(totalSongs > 0 && onPrev && onNext) && (
          <LinearGradient 
            colors={isDark ? ['#18181B', '#27272A'] : ['#0F172A', '#0F172A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.bottomBar, { borderWidth: 1, borderColor: isDark ? '#3F3F46' : '#E2E8F0' }]}
          >
            <TouchableOpacity 
              style={[styles.barAction, currentSongIndex <= 0 && { opacity: 0.3 }, { backgroundColor: 'transparent' }]} 
              onPress={onPrev}
              disabled={currentSongIndex <= 0}
            >
              <ChevronLeft color="#fff" size={24} />
            </TouchableOpacity>
            
            <View style={styles.barMain}>
              <Text style={[styles.barMainTxt, { color: '#fff' }]}>
                {currentSongIndex !== -1 ? `${currentSongIndex + 1} / ${totalSongs}` : ''}
              </Text>
              <Text style={styles.barSwipeHintTxt}>
                ← Swipe to change song →
              </Text>
            </View>

            <TouchableOpacity 
              style={[styles.barAction, currentSongIndex >= totalSongs - 1 && { opacity: 0.3 }, { backgroundColor: 'transparent' }]}
              onPress={onNext}
              disabled={currentSongIndex >= totalSongs - 1}
            >
              <ChevronLeft color="#fff" size={24} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
          </LinearGradient>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalCard: { flex: 1 },
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
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerSubtitleText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  headerRightSpacer: {
    width: 44,
    height: 44,
  },
  modalHeader: {
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: Platform.OS === 'ios' ? 120 : 100,
  },
  modalTitleEn: { fontSize: 14, fontWeight: '800', color: '#fff', textAlign: 'center', marginHorizontal: 50 },
  modalTitleTe: { fontSize: 12, color: '#aac4e8', marginTop: 2, fontWeight: '600', textAlign: 'center', marginHorizontal: 50 },
  backBtn: { zIndex: 10, padding: 5, marginLeft: -10 },
  modalScroll: { flex: 1, padding: 20 },
  langSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1
  },
  langPillTxt: {
    fontSize: 12,
    fontWeight: '600'
  },
  youtubeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 8,
  },
  youtubeIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center'
  },
  youtubeBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.3
  },
  leaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
    gap: 10
  },
  leaderAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center'
  },
  leaderAvatarTxt: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800'
  },
  leaderName: {
    fontSize: 14,
    fontWeight: '800'
  },
  leaderRole: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1
  },
  chartCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10
  },
  chartHeaderTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  chartColsRow: {
    flexDirection: 'row',
    gap: 8
  },
  chartCol: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 0.5,
  },
  chartColLbl: {
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 3,
  },
  chartColVal: {
    fontSize: 13,
    fontWeight: '900',
  },
  bandCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12
  },
  bandHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  bandSubLbl: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 4
  },
  notesCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12
  },
  notesLbl: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  notesTxt: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18
  },
  transliteratedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'center',
    marginBottom: 8,
  },
  transliteratedBadgeTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  fallbackNotice: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  fallbackNoticeTxt: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalSecHeader: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 15, textAlign: 'center' },
  lyricsBox: { borderRadius: 16, padding: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  lyricsText: { fontSize: 16, lineHeight: 28, fontWeight: '500', fontStyle: 'italic', textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    height: 60,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 }
  },
  barAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  barMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  barSwipeHintTxt: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  barMainTxt: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5
  },
});

