import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  Plus,
  BookOpen,
  Award,
  Music,
  Trash2,
  Sparkles,
} from 'lucide-react-native';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { KidsBibleStory, KidsQuiz, KidsWorshipSong } from '../../../../types/KidsMinistryTypes';

interface AdminContentManagerModalProps {
  visible: boolean;
  stories: KidsBibleStory[];
  quizzes: KidsQuiz[];
  songs: KidsWorshipSong[];
  churchId: string;
  onClose: () => void;
}

export default function AdminContentManagerModal({
  visible,
  stories,
  quizzes,
  songs,
  churchId,
  onClose,
}: AdminContentManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'stories' | 'quizzes' | 'songs'>('stories');
  const [showAddStory, setShowAddStory] = useState(false);
  const [showAddSong, setShowAddSong] = useState(false);

  // New Story Form
  const [storyTitle, setStoryTitle] = useState('');
  const [storyTelugu, setStoryTelugu] = useState('');
  const [storyRef, setStoryRef] = useState('Genesis 1');
  const [storySummary, setStorySummary] = useState('');
  const [storyEmoji, setStoryEmoji] = useState('📖');

  // New Song Form
  const [songTitle, setSongTitle] = useState('');
  const [songTelugu, setSongTelugu] = useState('');
  const [songVideoId, setSongVideoId] = useState('');
  const [songLyricsEng, setSongLyricsEng] = useState('');
  const [songLyricsTel, setSongLyricsTel] = useState('');

  const [saving, setSaving] = useState(false);

  const handleSaveStory = async () => {
    if (!storyTitle.trim()) {
      Alert.alert('Required', 'Please enter a story title');
      return;
    }
    try {
      setSaving(true);
      await KidsMinistryService.createStory(churchId, {
        storyId: `STORY-${Date.now().toString().slice(-4)}`,
        title: storyTitle.trim(),
        titleTelugu: storyTelugu.trim() || storyTitle.trim(),
        scriptureRef: storyRef.trim(),
        theme: 'Bible Faith',
        coverEmoji: storyEmoji.trim() || '📖',
        readTime: '5 min',
        summary: storySummary.trim(),
        summaryTelugu: storyTelugu.trim(),
        pages: [
          {
            pageNumber: 1,
            heading: storyTitle.trim(),
            illustrationEmoji: storyEmoji.trim() || '📖',
            textEnglish: storySummary.trim() || 'A beautiful story from the Holy Bible.',
            textTelugu: storyTelugu.trim() || 'పరిశుద్ధ బైబిల్ గ్రంథమునుండి ఒక అద్భుతమైన కథ.',
          },
        ],
        reflectionQuestions: [
          {
            questionEnglish: 'What lesson did we learn from this story?',
            questionTelugu: 'ఈ కథ నుండి మనం ఏమి నేర్చుకున్నాము?',
          },
        ],
      });
      Alert.alert('Story Created! 🎉', `"${storyTitle}" has been added to the Bible LMS.`);
      setStoryTitle('');
      setStoryTelugu('');
      setStorySummary('');
      setShowAddStory(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save story');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSong = async () => {
    if (!songTitle.trim() || !songVideoId.trim()) {
      Alert.alert('Required', 'Please enter song title and YouTube video ID / URL');
      return;
    }
    try {
      setSaving(true);
      await KidsMinistryService.createSong(churchId, {
        songId: `SONG-${Date.now().toString().slice(-4)}`,
        title: songTitle.trim(),
        titleTelugu: songTelugu.trim() || songTitle.trim(),
        category: 'action_song',
        youtubeVideoId: songVideoId.trim(),
        coverEmoji: '🎵',
        duration: '3:00',
        lyricsEnglish: songLyricsEng.trim() || songTitle.trim(),
        lyricsTelugu: songLyricsTel.trim() || songTelugu.trim(),
      });
      Alert.alert('Song Added! 🎵', `"${songTitle}" is now ready for Sunday School worship.`);
      setSongTitle('');
      setSongTelugu('');
      setSongVideoId('');
      setSongLyricsEng('');
      setSongLyricsTel('');
      setShowAddSong(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save song');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStory = (id: string, title: string) => {
    Alert.alert('Delete Story', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => KidsMinistryService.deleteStory(churchId, id) },
    ]);
  };

  const handleDeleteSong = (id: string, title: string) => {
    Alert.alert('Delete Song', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => KidsMinistryService.deleteSong(churchId, id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTag}>BIBLE CONTENT STUDIO</Text>
              <Text style={styles.headerTitleSerif}>Sunday School LMS CMS</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Mode Tabs */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'stories' && styles.tabActive]}
              onPress={() => setActiveTab('stories')}
            >
              <Text style={[styles.tabText, activeTab === 'stories' && styles.tabTextActive]}>
                Stories ({stories.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'quizzes' && styles.tabActive]}
              onPress={() => setActiveTab('quizzes')}
            >
              <Text style={[styles.tabText, activeTab === 'quizzes' && styles.tabTextActive]}>
                Quizzes ({quizzes.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'songs' && styles.tabActive]}
              onPress={() => setActiveTab('songs')}
            >
              <Text style={[styles.tabText, activeTab === 'songs' && styles.tabTextActive]}>
                Songs ({songs.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: STORIES */}
          {activeTab === 'stories' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
              {!showAddStory ? (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => setShowAddStory(true)}
                  activeOpacity={0.88}
                >
                  <Plus size={16} color="#000000" strokeWidth={2.8} />
                  <Text style={styles.addBtnText}>Add Illustrated Bible Story</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.formBox}>
                  <Text style={styles.formTitle}>New Bible Story</Text>
                  <TextInput
                    style={styles.input}
                    value={storyTitle}
                    onChangeText={setStoryTitle}
                    placeholder="Story Title in English (e.g. Birth of Jesus)"
                    placeholderTextColor="#6B7280"
                  />
                  <TextInput
                    style={styles.input}
                    value={storyTelugu}
                    onChangeText={setStoryTelugu}
                    placeholder="Title in Telugu (e.g. యేసుక్రీస్తు జననము)"
                    placeholderTextColor="#6B7280"
                  />
                  <TextInput
                    style={styles.input}
                    value={storyRef}
                    onChangeText={setStoryRef}
                    placeholder="Scripture Reference (e.g. Luke 2:1-20)"
                    placeholderTextColor="#6B7280"
                  />
                  <TextInput
                    style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                    value={storySummary}
                    onChangeText={setStorySummary}
                    placeholder="Brief story narrative..."
                    placeholderTextColor="#6B7280"
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={styles.cancelFormBtn}
                      onPress={() => setShowAddStory(false)}
                    >
                      <Text style={styles.cancelFormText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveFormBtn, saving && { opacity: 0.7 }]}
                      onPress={handleSaveStory}
                      disabled={saving}
                    >
                      <Text style={styles.saveFormText}>Publish Story</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {stories.map(s => (
                <View key={s.id} style={styles.itemCard}>
                  <Text style={{ fontSize: 24 }}>{s.coverEmoji || '📖'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{s.title}</Text>
                    <Text style={styles.itemSub}>{s.titleTelugu} · {s.scriptureRef}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteStory(s.id, s.title)}>
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* TAB 2: QUIZZES */}
          {activeTab === 'quizzes' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
              {quizzes.map(q => (
                <View key={q.id} style={styles.itemCard}>
                  <Text style={{ fontSize: 24 }}>{q.coverEmoji || '🏆'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{q.title}</Text>
                    <Text style={styles.itemSub}>
                      {q.questions?.length || 0} Questions · Reward: {q.pointsReward} pts · {q.badgeReward}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* TAB 3: WORSHIP SONGS */}
          {activeTab === 'songs' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
              {!showAddSong ? (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => setShowAddSong(true)}
                  activeOpacity={0.88}
                >
                  <Plus size={16} color="#000000" strokeWidth={2.8} />
                  <Text style={styles.addBtnText}>Add Kids Action Song</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.formBox}>
                  <Text style={styles.formTitle}>New Action Worship Song</Text>
                  <TextInput
                    style={styles.input}
                    value={songTitle}
                    onChangeText={setSongTitle}
                    placeholder="Song Title (e.g. My God is So Big)"
                    placeholderTextColor="#6B7280"
                  />
                  <TextInput
                    style={styles.input}
                    value={songTelugu}
                    onChangeText={setSongTelugu}
                    placeholder="Telugu Title (e.g. నా దేవుడు ఎంతో గొప్పవాడు)"
                    placeholderTextColor="#6B7280"
                  />
                  <TextInput
                    style={styles.input}
                    value={songVideoId}
                    onChangeText={setSongVideoId}
                    placeholder="YouTube Video ID or URL (e.g. 8cT6qGj7DkE)"
                    placeholderTextColor="#6B7280"
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={styles.cancelFormBtn}
                      onPress={() => setShowAddSong(false)}
                    >
                      <Text style={styles.cancelFormText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveFormBtn, saving && { opacity: 0.7 }]}
                      onPress={handleSaveSong}
                      disabled={saving}
                    >
                      <Text style={styles.saveFormText}>Publish Song</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {songs.map(song => (
                <View key={song.id} style={styles.itemCard}>
                  <Text style={{ fontSize: 24 }}>{song.coverEmoji || '🎵'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{song.title}</Text>
                    <Text style={styles.itemSub}>{song.titleTelugu} · YouTube ID: {song.youtubeVideoId}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteSong(song.id, song.title)}>
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Close */}
          <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
            <Text style={styles.closeFooterText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#27272A',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1.5,
  },
  headerTitleSerif: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  list: {
    gap: 8,
    paddingBottom: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    marginBottom: 8,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
  formBox: {
    backgroundColor: '#09090B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FBBF24',
    marginBottom: 8,
    gap: 8,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
  },
  input: {
    backgroundColor: '#18181B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#FFFFFF',
  },
  cancelFormBtn: {
    flex: 1,
    backgroundColor: '#27272A',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelFormText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  saveFormBtn: {
    flex: 1,
    backgroundColor: '#FBBF24',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveFormText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '800',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeFooterBtn: {
    backgroundColor: '#27272A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  closeFooterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
