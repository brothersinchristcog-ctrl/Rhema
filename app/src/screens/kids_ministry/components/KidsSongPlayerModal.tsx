import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { X, Music, Play, ExternalLink, Heart } from 'lucide-react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { KidsWorshipSong } from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';

const { width } = Dimensions.get('window');

function extractYoutubeId(urlOrId?: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') return '';
  const clean = urlOrId.trim();
  const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  return clean;
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
  const { isDark, colors: themeColors } = useTheme();
  const [lyricsTab, setLyricsTab] = useState<'both' | 'telugu' | 'english'>('both');
  const [playing, setPlaying] = useState(false);

  if (!song) return null;

  const screenBg = isDark ? '#000000' : (themeColors.background || '#FAF7F2');
  const cardBg = isDark ? '#18181B' : (themeColors.surface || '#FFFFFF');
  const innerBg = isDark ? '#09090B' : '#F1F5F9';
  const border = isDark ? '#27272A' : (themeColors.border || '#E2E8F0');
  const textPrimary = isDark ? '#FFFFFF' : (themeColors.text || '#0F172A');
  const textSecondary = isDark ? '#9CA3AF' : (themeColors.textSecondary || '#64748B');
  const goldAccent = isDark ? '#FBBF24' : '#D97706';
  const pillActiveBg = isDark ? '#FFFFFF' : '#0F172A';
  const pillActiveText = isDark ? '#000000' : '#FFFFFF';
  const barStyle = isDark ? 'light-content' : 'dark-content';

  const videoId = extractYoutubeId(song.youtubeVideoId) || 'AyKSwGvUbcY';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />
          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? '#18181B' : '#F1F5F9' }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerTitles}>
              <Text style={[styles.headerTitleSerif, { color: textPrimary }]} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={[styles.headerTeluguSub, { color: textSecondary }]} numberOfLines={1}>
                {song.titleTelugu}
              </Text>
            </View>

            <View style={[styles.categoryBadge, { backgroundColor: isDark ? '#18181B' : '#FEF3C7', borderColor: isDark ? '#27272A' : '#FDE68A' }]}>
              <Text style={[styles.categoryBadgeText, { color: goldAccent }]}>Action Song</Text>
            </View>
          </View>

          {/* Video Player */}
          <View style={[styles.playerContainer, { backgroundColor: innerBg }]}>
            <YoutubePlayer
              height={220}
              width={width}
              videoId={videoId}
              play={playing}
              onChangeState={(state) => {
                if (state === 'ended') setPlaying(false);
              }}
            />
            <TouchableOpacity
              style={[styles.openYoutubeBtn, { backgroundColor: cardBg, borderTopColor: border, borderBottomWidth: 1, borderBottomColor: border }]}
              onPress={() => {
                const appUrl = `vnd.youtube://${videoId}`;
                const webUrl = `https://www.youtube.com/watch?v=${videoId}`;
                Linking.canOpenURL(appUrl).then(supported => {
                  if (supported) {
                    Linking.openURL(appUrl);
                  } else {
                    Linking.openURL(webUrl);
                  }
                }).catch(() => Linking.openURL(webUrl));
              }}
              activeOpacity={0.8}
            >
              <ExternalLink size={13} color={goldAccent} />
              <Text style={[styles.openYoutubeText, { color: goldAccent }]}>Watch on YouTube App (Full Screen)</Text>
            </TouchableOpacity>
          </View>

          {/* Lyrics Language Switcher */}
          <View style={[styles.lyricsTabRow, { backgroundColor: isDark ? '#18181B' : '#F1F5F9', borderWidth: 1, borderColor: border }]}>
            <TouchableOpacity
              style={[styles.lyricsTab, lyricsTab === 'both' && { backgroundColor: pillActiveBg }]}
              onPress={() => setLyricsTab('both')}
            >
              <Text style={[styles.lyricsTabText, { color: textSecondary }, lyricsTab === 'both' && { color: pillActiveText, fontWeight: '700' }]}>
                Bilingual Lyrics
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.lyricsTab, lyricsTab === 'telugu' && { backgroundColor: pillActiveBg }]}
              onPress={() => setLyricsTab('telugu')}
            >
              <Text style={[styles.lyricsTabText, { color: textSecondary }, lyricsTab === 'telugu' && { color: pillActiveText, fontWeight: '700' }]}>
                తెలుగు (Telugu)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.lyricsTab, lyricsTab === 'english' && { backgroundColor: pillActiveBg }]}
              onPress={() => setLyricsTab('english')}
            >
              <Text style={[styles.lyricsTabText, { color: textSecondary }, lyricsTab === 'english' && { color: pillActiveText, fontWeight: '700' }]}>
                English
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lyrics & Playlist Scroll */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Lyrics Box */}
            <View style={[styles.lyricsCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}>
              {(lyricsTab === 'both' || lyricsTab === 'english') && (
                <View style={styles.lyricsBlock}>
                  <Text style={[styles.lyricsLangTag, { color: textSecondary }]}>ENGLISH LYRICS</Text>
                  <Text style={[styles.lyricsTextEng, { color: textPrimary }]}>{song.lyricsEnglish}</Text>
                </View>
              )}

              {(lyricsTab === 'both' || lyricsTab === 'telugu') && (
                <View style={[styles.lyricsBlock, { marginTop: lyricsTab === 'both' ? 14 : 0 }]}>
                  <Text style={[styles.lyricsLangTag, { color: goldAccent }]}>తెలుగు సాహిత్యం</Text>
                  <Text style={[styles.lyricsTextTel, { color: textPrimary }]}>{song.lyricsTelugu}</Text>
                </View>
              )}
            </View>

            {/* More Action Songs Playlist */}
            <Text style={[styles.playlistHeader, { color: textSecondary }]}>MORE SUNDAY SCHOOL SONGS</Text>
            <View style={styles.playlistCol}>
              {allSongs
                .filter(s => s.id !== song.id)
                .map(other => (
                  <TouchableOpacity
                    key={other.id}
                    style={[styles.playlistItem, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}
                    onPress={() => onSelectSong(other)}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.songEmojiBox, { backgroundColor: innerBg }]}>
                      <Text style={{ fontSize: 22 }}>{other.coverEmoji || '🎵'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.playlistTitle, { color: textPrimary }]}>{other.title}</Text>
                      <Text style={[styles.playlistSub, { color: textSecondary }]}>
                        {other.titleTelugu} · {other.duration}
                      </Text>
                    </View>
                    <Play size={16} color={goldAccent} />
                  </TouchableOpacity>
                ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitleSerif: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerTeluguSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    textAlign: 'center',
  },
  categoryBadge: {
    backgroundColor: '#18181B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FBBF24',
  },
  playerContainer: {
    width: '100%',
    backgroundColor: '#09090B',
  },
  openYoutubeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#18181B',
    borderTopWidth: 1,
    borderTopColor: '#27272A',
  },
  openYoutubeText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
  },
  lyricsTabRow: {
    flexDirection: 'row',
    backgroundColor: '#18181B',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    padding: 3,
  },
  lyricsTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  lyricsTabActive: {
    backgroundColor: '#FFFFFF',
  },
  lyricsTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  lyricsTabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14,
  },
  lyricsCard: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  lightShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  lyricsBlock: {
    gap: 6,
  },
  lyricsLangTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  lyricsTextEng: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 22,
    fontWeight: '500',
  },
  lyricsTextTel: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 24,
    fontWeight: '500',
  },
  playlistHeader: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  playlistCol: {
    gap: 8,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  songEmojiBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  playlistSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
});
