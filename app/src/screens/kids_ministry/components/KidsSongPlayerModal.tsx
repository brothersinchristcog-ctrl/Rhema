import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
  Linking,
  StatusBar,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Music,
  Pause,
  Play,
  Volume2,
  Maximize2,
  Minimize2,
} from 'lucide-react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Audio } from 'expo-av';
import { KidsWorshipSong } from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';
import { isColorLight } from '../../SongsScreen';
import { getSermonCardColor, POSTER as SERMON_POSTER_GRADIENTS } from '../../SermonsScreen';
import { useVideoOrientationController } from '../../../utils/videoOrientation';

function extractYoutubeId(urlOrId?: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') return '';
  const clean = urlOrId.trim();
  const match = clean.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/
  );
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  return clean;
}

function formatMillis(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

interface KidsSongPlayerModalProps {
  visible: boolean;
  song: KidsWorshipSong | null;
  allSongs: KidsWorshipSong[];
  onClose: () => void;
  onSelectSong: (s: KidsWorshipSong) => void;
}

export default function KidsSongPlayerModal({
  visible,
  song,
  allSongs,
  onClose,
  onSelectSong,
}: KidsSongPlayerModalProps) {
  const { isDark } = useTheme();
  const [lyricsTab, setLyricsTab] = useState<'both' | 'english' | 'telugu'>('both');
  const [playingVideo, setPlayingVideo] = useState(false);

  // Audio playback state when song has an uploaded audioUrl
  const soundRef = useRef<Audio.Sound | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPositionMs, setAudioPositionMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);

  const unloadAudio = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // Ignore cleanup errors
      }
      soundRef.current = null;
    }
    setAudioPlaying(false);
    setAudioLoading(false);
    setAudioPositionMs(0);
    setAudioDurationMs(0);
  };

  useEffect(() => {
    setPlayingVideo(false);
    unloadAudio();
    return () => {
      unloadAudio();
    };
  }, [song?.id, visible]);

  const videoId = song ? extractYoutubeId(song.youtubeVideoId) : '';
  const {
    isLandscape,
    playerWidth: stageWidth,
    playerHeight: stageHeight,
    handleFullScreenChange,
    toggleOrientation,
  } = useVideoOrientationController(
    visible && Boolean(videoId),
    `modal:KidsSongPlayer:${song?.id || 'song'}`,
    { theaterInLandscape: false, horizontalPadding: 32, maxPortraitWidth: 680, landscapeVerticalReserve: 72 }
  );

  if (!song) return null;

  const screenBg = isDark ? '#0B0F19' : '#FFFDF9';
  const cardBg = isDark ? '#151B2B' : '#FFFFFF';
  const innerBg = isDark ? '#1E2538' : '#F8F4EC';
  const border = isDark ? '#283149' : '#EAE4D7';
  const textPrimary = isDark ? '#F8FAFC' : '#111827';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const goldAccent = isDark ? '#FBBF24' : '#B45309';
  const goldBg = isDark ? 'rgba(251, 191, 36, 0.14)' : '#FEF3C7';
  const violetAccent = isDark ? '#A78BFA' : '#7C3AED';
  const violetSoft = isDark ? 'rgba(139, 92, 246, 0.16)' : '#EFE9FE';
  const barStyle = isDark ? 'light-content' : 'dark-content';

  const hasAudio = Boolean(song.audioUrl && song.audioUrl.trim().length > 0);
  const thumbUri =
    song.thumbnailUrl ||
    (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '');

  const categoryLabel =
    song.category === 'action_dance'
      ? 'Action Dance'
      : song.category === 'praise'
      ? 'Kids Praise'
      : song.category === 'hymn'
      ? 'Kids Hymn'
      : 'Action Song';

  const handleToggleAudio = async () => {
    if (!song.audioUrl) return;
    try {
      if (soundRef.current) {
        if (audioPlaying) {
          await soundRef.current.pauseAsync();
          setAudioPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setAudioPlaying(true);
        }
        return;
      }

      setAudioLoading(true);
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: song.audioUrl },
        { shouldPlay: true },
        status => {
          if (!status.isLoaded) return;
          setAudioPositionMs(status.positionMillis || 0);
          setAudioDurationMs(status.durationMillis || 0);
          setAudioPlaying(status.isPlaying);
          if (status.didJustFinish) {
            setAudioPlaying(false);
            setAudioPositionMs(0);
            sound.setPositionAsync(0).catch(() => {});
          }
        }
      );
      soundRef.current = sound;
    } catch {
      setAudioPlaying(false);
    } finally {
      setAudioLoading(false);
    }
  };

  const openYoutubeExternal = () => {
    if (!videoId) return;
    const appUrl = `vnd.youtube://${videoId}`;
    const webUrl = `https://www.youtube.com/watch?v=${videoId}`;
    Linking.canOpenURL(appUrl)
      .then(supported => Linking.openURL(supported ? appUrl : webUrl))
      .catch(() => Linking.openURL(webUrl));
  };

  const audioProgressPct =
    audioDurationMs > 0 ? Math.min(100, Math.round((audioPositionMs / audioDurationMs) * 100)) : 0;

  const otherSongs = allSongs.filter(s => s.id !== song.id);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* Clean Editorial Header */}
          <View style={[styles.headerRow, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.backBtn, { backgroundColor: cardBg, borderColor: border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={19} color={textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerEyebrow, { color: violetAccent }]}>
                {categoryLabel.toUpperCase()}
              </Text>
              <Text style={[styles.headerTitleSerif, { color: textPrimary }]} numberOfLines={1}>
                {song.title}
              </Text>
            </View>

            {videoId ? (
              <TouchableOpacity
                onPress={toggleOrientation}
                style={[styles.backBtn, { backgroundColor: cardBg, borderColor: border }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {isLandscape ? (
                  <Minimize2 size={18} color={textPrimary} />
                ) : (
                  <Maximize2 size={18} color={textPrimary} />
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ width: 38 }} />
            )}
          </View>

          {/* Full Scrollable Page (Media + Audio + Bilingual Lyrics + Up Next) */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Rounded 16:9 Media Stage */}
            <View style={[styles.stageCard, { backgroundColor: cardBg, borderColor: border, alignSelf: 'center', width: stageWidth }]}>
              <View style={[styles.stage16x9Frame, { width: stageWidth, height: stageHeight }]}>
                {videoId ? (
                  <YoutubePlayer
                    height={stageHeight}
                    width={stageWidth}
                    videoId={videoId}
                    play={playingVideo}
                    onFullScreenChange={handleFullScreenChange}
                    onChangeState={state => {
                      if (state === 'ended') setPlayingVideo(false);
                    }}
                  />
                ) : thumbUri ? (
                  <Image
                    source={{ uri: thumbUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={SERMON_POSTER_GRADIENTS[0]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, styles.posterFallback]}
                  >
                    <Text style={{ fontSize: 44 }}>{song.coverEmoji || '🎵'}</Text>
                    <Text style={styles.posterTitleFallback} numberOfLines={2}>
                      {song.title}
                    </Text>
                  </LinearGradient>
                )}
              </View>

              {/* Built-In Audio Player Bar (when uploaded audio exists) */}
              {hasAudio && (
                <View
                  style={[
                    styles.audioBar,
                    { backgroundColor: innerBg, borderTopColor: border },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.audioPlayCircle, { backgroundColor: violetAccent }]}
                    onPress={handleToggleAudio}
                    disabled={audioLoading}
                    activeOpacity={0.85}
                  >
                    {audioLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : audioPlaying ? (
                      <Pause size={16} color="#FFFFFF" fill="#FFFFFF" />
                    ) : (
                      <Play size={16} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
                    )}
                  </TouchableOpacity>

                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={styles.audioLabelRow}>
                      <Text style={[styles.audioTrackName, { color: textPrimary }]} numberOfLines={1}>
                        {song.audioFileName || 'Worship Audio Track'}
                      </Text>
                      <Text style={[styles.audioTimeLabel, { color: textSecondary }]}>
                        {audioDurationMs > 0
                          ? `${formatMillis(audioPositionMs)} / ${formatMillis(audioDurationMs)}`
                          : song.duration || 'Audio'}
                      </Text>
                    </View>
                    <View style={[styles.audioTrackBg, { backgroundColor: border }]}>
                      <View
                        style={[
                          styles.audioTrackFill,
                          { width: `${audioProgressPct}%`, backgroundColor: violetAccent },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Title, Telugu Subtitle & Action Pills */}
            <View style={styles.titleBlock}>
              <View style={styles.badgesRow}>
                <View style={[styles.metaPill, { backgroundColor: violetSoft }]}>
                  <Music size={12} color={violetAccent} />
                  <Text style={[styles.metaPillText, { color: violetAccent }]}>{categoryLabel}</Text>
                </View>

                <View style={[styles.metaPill, { backgroundColor: goldBg }]}>
                  <Clock size={12} color={goldAccent} />
                  <Text style={[styles.metaPillText, { color: goldAccent }]}>
                    {song.duration || '3:00'}
                  </Text>
                </View>

                {videoId ? (
                  <TouchableOpacity
                    style={[
                      styles.metaPill,
                      {
                        backgroundColor: cardBg,
                        borderWidth: 1,
                        borderColor: border,
                        marginLeft: 'auto',
                      },
                    ]}
                    onPress={openYoutubeExternal}
                    activeOpacity={0.82}
                  >
                    <ExternalLink size={12} color={textPrimary} />
                    <Text style={[styles.metaPillText, { color: textPrimary }]}>YouTube App</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={[styles.heroTitleSerif, { color: textPrimary }]}>{song.title}</Text>
              {song.titleTelugu ? (
                <Text style={[styles.heroSubtitleTe, { color: textSecondary }]}>
                  {song.titleTelugu}
                </Text>
              ) : null}
            </View>

            {/* Lyrics Language Switcher */}
            <View style={[styles.langSwitcherRow, { backgroundColor: innerBg, borderColor: border }]}>
              {(
                [
                  { id: 'both', label: 'Bilingual' },
                  { id: 'english', label: 'English' },
                  { id: 'telugu', label: 'తెలుగు' },
                ] as const
              ).map(tab => {
                const active = lyricsTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.langTab,
                      active && { backgroundColor: cardBg, borderColor: border, borderWidth: 1 },
                    ]}
                    onPress={() => setLyricsTab(tab.id)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.langTabText,
                        { color: active ? violetAccent : textSecondary },
                        active && { fontWeight: '800' },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Clean Editorial Lyrics Card */}
            <View style={[styles.lyricsCard, { backgroundColor: cardBg, borderColor: border }]}>
              {(lyricsTab === 'both' || lyricsTab === 'english') && (
                <View style={styles.lyricsSection}>
                  <View style={styles.lyricsSectionHeader}>
                    <Volume2 size={14} color={violetAccent} />
                    <Text style={[styles.lyricsSectionEyebrow, { color: violetAccent }]}>
                      ENGLISH LYRICS
                    </Text>
                  </View>
                  <Text style={[styles.lyricsBodyEng, { color: textPrimary }]}>
                    {song.lyricsEnglish?.trim() || 'Sing along with joyful praise!'}
                  </Text>
                </View>
              )}

              {lyricsTab === 'both' && <View style={[styles.lyricsDivider, { backgroundColor: border }]} />}

              {(lyricsTab === 'both' || lyricsTab === 'telugu') && (
                <View
                  style={[
                    styles.lyricsSection,
                    {
                      backgroundColor: isDark ? 'rgba(251, 191, 36, 0.06)' : '#FFFDF6',
                      borderRadius: 14,
                      padding: lyricsTab === 'both' ? 14 : 0,
                      borderWidth: lyricsTab === 'both' ? 1 : 0,
                      borderColor: isDark ? 'rgba(251, 191, 36, 0.16)' : '#F5E8C8',
                    },
                  ]}
                >
                  <View style={styles.lyricsSectionHeader}>
                    <Music size={14} color={goldAccent} />
                    <Text style={[styles.lyricsSectionEyebrow, { color: goldAccent }]}>
                      తెలుగు సాహిత్యం (TELUGU LYRICS)
                    </Text>
                  </View>
                  <Text style={[styles.lyricsBodyTel, { color: textPrimary }]}>
                    {song.lyricsTelugu?.trim() || 'తెలుగు సాహిత్యం త్వరలో జోడించబడుతుంది.'}
                  </Text>
                </View>
              )}
            </View>

            {/* More Sunday School Action Songs */}
            {otherSongs.length > 0 && (
              <View style={styles.queueSection}>
                <Text style={[styles.queueHeader, { color: textSecondary }]}>
                  MORE ACTION SONGS ({otherSongs.length})
                </Text>
                <View style={styles.queueList}>
                  {otherSongs.map((other, idx) => {
                    const cardColor = getSermonCardColor(idx).color;
                    const isLight = isColorLight(cardColor);
                    const qTitleColor = isLight ? '#0F172A' : '#FFFFFF';
                    const qSubColor = isLight ? '#334155' : 'rgba(255, 255, 255, 0.82)';
                    const qActionBg = isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(255, 255, 255, 0.20)';
                    const otherVid = extractYoutubeId(other.youtubeVideoId);
                    const otherThumb =
                      other.thumbnailUrl ||
                      (otherVid ? `https://img.youtube.com/vi/${otherVid}/mqdefault.jpg` : '');
                    const posterColors =
                      SERMON_POSTER_GRADIENTS[idx % SERMON_POSTER_GRADIENTS.length];

                    return (
                      <TouchableOpacity
                        key={other.id}
                        style={[
                          styles.queueCard,
                          {
                            backgroundColor: cardColor,
                            borderColor: isLight
                              ? 'rgba(15, 23, 42, 0.08)'
                              : 'rgba(255, 255, 255, 0.14)',
                          },
                        ]}
                        onPress={() => onSelectSong(other)}
                        activeOpacity={0.86}
                      >
                        <View style={styles.queueThumbBox}>
                          {otherThumb ? (
                            <Image
                              source={{ uri: otherThumb }}
                              style={StyleSheet.absoluteFill}
                              resizeMode="cover"
                            />
                          ) : (
                            <LinearGradient
                              colors={posterColors}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={[StyleSheet.absoluteFill, styles.queueThumbFallback]}
                            >
                              <Text style={{ fontSize: 20 }}>{other.coverEmoji || '🎵'}</Text>
                            </LinearGradient>
                          )}
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.queueTitle, { color: qTitleColor }]} numberOfLines={1}>
                            {other.title}
                          </Text>
                          <Text style={[styles.queueSub, { color: qSubColor }]} numberOfLines={1}>
                            {other.titleTelugu
                              ? `${other.titleTelugu} · ${other.duration || '3:00'}`
                              : `Worship & Lyrics · ${other.duration || '3:00'}`}
                          </Text>
                        </View>

                        <View style={[styles.queuePlayCircle, { backgroundColor: qActionBg }]}>
                          <Play size={13} color={qTitleColor} fill={qTitleColor} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  headerTitleSerif: {
    fontSize: 16.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    marginTop: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 42,
    gap: 16,
  },
  stageCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  stage16x9Frame: {
    width: '100%',
    backgroundColor: '#0F172A',
    overflow: 'hidden',
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  posterTitleFallback: {
    color: '#FDE68A',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  audioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  audioPlayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  audioTrackName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  audioTimeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  audioTrackBg: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  audioTrackFill: {
    height: '100%',
    borderRadius: 999,
  },
  titleBlock: {
    gap: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  metaPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  heroTitleSerif: {
    fontSize: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    lineHeight: 28,
    marginTop: 2,
  },
  heroSubtitleTe: {
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  langSwitcherRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  langTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  langTabText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  lyricsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  lyricsSection: {
    gap: 8,
  },
  lyricsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lyricsSectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  lyricsBodyEng: {
    fontSize: 15.5,
    lineHeight: 24,
    fontWeight: '500',
  },
  lyricsDivider: {
    height: 1,
    width: '100%',
  },
  lyricsBodyTel: {
    fontSize: 15.5,
    lineHeight: 26,
    fontWeight: '500',
  },
  queueSection: {
    gap: 10,
    marginTop: 4,
  },
  queueHeader: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  queueList: {
    gap: 10,
  },
  queueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
  },
  queueThumbBox: {
    width: 74,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    flexShrink: 0,
  },
  queueThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  queueSub: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  queuePlayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
