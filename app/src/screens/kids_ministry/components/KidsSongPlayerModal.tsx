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
} from 'react-native';
import { X, Music, Play, ExternalLink, Heart } from 'lucide-react-native';
import RhemaYouTubePlayer, { cleanVideoId } from '../../../components/RhemaYouTubePlayer';
import { KidsWorshipSong } from '../../../types/KidsMinistryTypes';

const { width } = Dimensions.get('window');

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
  if (!song) return null;

  const [lyricsTab, setLyricsTab] = useState<'both' | 'telugu' | 'english'>('both');
  const videoId = cleanVideoId(song.youtubeVideoId) || '8cT6qGj7DkE';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.headerTitleSerif}>{song.title}</Text>
            <Text style={styles.headerTeluguSub}>{song.titleTelugu}</Text>
          </View>

          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>Action Song</Text>
          </View>
        </View>

        {/* Video Player */}
        <View style={styles.playerContainer}>
          <RhemaYouTubePlayer
            videoId={videoId}
            height={220}
            width={width}
            autoPlay
          />
        </View>

        {/* Lyrics Language Switcher */}
        <View style={styles.lyricsTabRow}>
          <TouchableOpacity
            style={[styles.lyricsTab, lyricsTab === 'both' && styles.lyricsTabActive]}
            onPress={() => setLyricsTab('both')}
          >
            <Text style={[styles.lyricsTabText, lyricsTab === 'both' && styles.lyricsTabTextActive]}>
              Bilingual Lyrics
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.lyricsTab, lyricsTab === 'telugu' && styles.lyricsTabActive]}
            onPress={() => setLyricsTab('telugu')}
          >
            <Text style={[styles.lyricsTabText, lyricsTab === 'telugu' && styles.lyricsTabTextActive]}>
              తెలుగు (Telugu)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.lyricsTab, lyricsTab === 'english' && styles.lyricsTabActive]}
            onPress={() => setLyricsTab('english')}
          >
            <Text style={[styles.lyricsTabText, lyricsTab === 'english' && styles.lyricsTabTextActive]}>
              English
            </Text>
          </TouchableOpacity>
        </View>

        {/* Lyrics & Playlist Scroll */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Lyrics Box */}
          <View style={styles.lyricsCard}>
            {(lyricsTab === 'both' || lyricsTab === 'english') && (
              <View style={styles.lyricsBlock}>
                <Text style={styles.lyricsLangTag}>ENGLISH LYRICS</Text>
                <Text style={styles.lyricsTextEng}>{song.lyricsEnglish}</Text>
              </View>
            )}

            {(lyricsTab === 'both' || lyricsTab === 'telugu') && (
              <View style={[styles.lyricsBlock, { marginTop: lyricsTab === 'both' ? 14 : 0 }]}>
                <Text style={[styles.lyricsLangTag, { color: '#FBBF24' }]}>తెలుగు సాహిత్యం</Text>
                <Text style={styles.lyricsTextTel}>{song.lyricsTelugu}</Text>
              </View>
            )}
          </View>

          {/* More Action Songs Playlist */}
          <Text style={styles.playlistHeader}>MORE SUNDAY SCHOOL SONGS</Text>
          <View style={styles.playlistCol}>
            {allSongs
              .filter(s => s.id !== song.id)
              .map(other => (
                <TouchableOpacity
                  key={other.id}
                  style={styles.playlistItem}
                  onPress={() => onSelectSong(other)}
                  activeOpacity={0.88}
                >
                  <View style={styles.songEmojiBox}>
                    <Text style={{ fontSize: 22 }}>{other.coverEmoji || '🎵'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playlistTitle}>{other.title}</Text>
                    <Text style={styles.playlistSub}>{other.titleTelugu} · {other.duration}</Text>
                  </View>
                  <Play size={16} color="#FBBF24" />
                </TouchableOpacity>
              ))}
          </View>
        </ScrollView>
      </View>
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
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
    flex: 1,
  },
  headerTitleSerif: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerTeluguSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
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
    height: 220,
    backgroundColor: '#09090B',
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
