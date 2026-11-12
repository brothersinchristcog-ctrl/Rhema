import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  StatusBar,
  Dimensions,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  ArrowLeft,
  MoreVertical,
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  FileText, 
  Save, 
  X, 
  Calendar,
  CheckSquare,
  Square,
  Combine
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { CustomAlert } from '../components/CustomAlert';

const { width, height } = Dimensions.get('window');

interface SermonNote {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  category?: string;
  titleTe?: string;
  titleEn?: string;
  titleHi?: string;
  titleTa?: string;
  titleMr?: string;
  titleMl?: string;
  titleKn?: string;
  contentTe?: string;
  contentEn?: string;
  contentHi?: string;
  contentTa?: string;
  contentMr?: string;
  contentMl?: string;
  contentKn?: string;
  translations?: Record<string, { title?: string; content?: string; category?: string }>;
}

export default function MemberNotesScreen({ navigation, route }: any) {
  const { isDark, colors } = useTheme();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const { prefillTitle, prefillContent } = route?.params || {};
  const [notes, setNotes] = useState<SermonNote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Modal & form states
  const [modalVisible, setModalVisible] = useState(false);
  const [isViewMode, setIsViewMode] = useState(true); // open in read-only by default
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Merge & Selection states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error' | 'warning';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'success'
  });
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeTitle, setMergeTitle] = useState('');

  const getNoteDisplayTitle = (note?: SermonNote | null): string => {
    if (!note) return '';
    if (note.translations && note.translations[language]?.title) {
      return note.translations[language].title!;
    }
    const langKey = language.charAt(0).toUpperCase() + language.slice(1);
    const directLangVal = (note as any)[`title${langKey}`];
    if (directLangVal) return directLangVal;

    if (language === 'en' && (note as any).titleEn) return (note as any).titleEn;

    return note.title || '';
  };

  const getNoteDisplayContent = (note?: SermonNote | null): string => {
    if (!note) return '';
    if (note.translations && note.translations[language]?.content) {
      return note.translations[language].content!;
    }
    const langKey = language.charAt(0).toUpperCase() + language.slice(1);
    const directLangVal = (note as any)[`content${langKey}`];
    if (directLangVal) return directLangVal;

    if (language === 'en' && (note as any).contentEn) return (note as any).contentEn;

    return note.content || '';
  };

  const getCategoryLabel = (category?: string): string => {
    if (!category) return '';
    const catKey = category.toLowerCase().trim().replace(/[\s_-]+/g, '');
    if (catKey === 'all') return t('memberNotes.categories.all');
    if (catKey === 'sundayservice') return t('memberNotes.categories.sundayService');
    if (catKey === 'biblestudy') return t('memberNotes.categories.bibleStudy');
    if (catKey === 'prayermeeting') return t('memberNotes.categories.prayerMeeting');
    if (catKey === 'youthmeeting') return t('memberNotes.categories.youthMeeting');
    if (catKey === 'personalreflection') return t('memberNotes.categories.personalReflection');
    if (catKey === 'other') return t('memberNotes.categories.other');
    return category;
  };

  useEffect(() => {
    loadNotes();
  }, [route?.params?.refreshId]);

  // Auto-open create modal when pre-fill params are passed (e.g. from Bible Search)
  useEffect(() => {
    if (prefillTitle || prefillContent) {
      setNoteTitle(prefillTitle || t('memberNotes.categories.bibleStudy') + ' ' + t('memberNotes.title'));
      setNoteContent(prefillContent || '');
      setEditingNoteId(null);
      setModalVisible(true);
    }
  }, [prefillTitle, prefillContent]);

  const loadNotes = async () => {
    try {
      const stored = await AsyncStorage.getItem('@SermonPersonalNotes');
      if (stored) {
        setNotes(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error loading sermon notes:', e);
    }
  };

  const saveNotesToStorage = async (newNotesList: SermonNote[]) => {
    try {
      await AsyncStorage.setItem('@SermonPersonalNotes', JSON.stringify(newNotesList));
    } catch (e) {
      console.error('Error saving sermon notes:', e);
      Alert.alert(t('common.error'), t('memberNotes.saveError'));
    }
  };

  const handleCreateOrEditNote = () => {
    if (!noteTitle.trim()) {
      Alert.alert(t('memberNotes.required'), t('memberNotes.enterTitlePrompt'));
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let updatedNotes: SermonNote[];

    if (editingNoteId) {
      // Editing Mode - preserves existing extra fields like category/translations
      updatedNotes = notes.map(n => 
        n.id === editingNoteId 
          ? { ...n, title: noteTitle.trim(), content: noteContent.trim(), timestamp: dateStr }
          : n
      );
    } else {
      // Creating Mode
      const newNote: SermonNote = {
        id: Date.now().toString(),
        title: noteTitle.trim(),
        content: noteContent.trim(),
        timestamp: dateStr
      };
      updatedNotes = [newNote, ...notes];
    }

    setNotes(updatedNotes);
    saveNotesToStorage(updatedNotes);
    
    // Close modal & reset fields
    setModalVisible(false);
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
  };

  const handleDeleteNote = (id: string) => {
    Alert.alert(
      t('memberNotes.deleteNoteTitle'),
      t('memberNotes.deleteNoteConfirm'),
      [
        { text: t('memberNotes.cancel'), style: 'cancel' },
        { 
          text: t('memberNotes.delete'), 
          style: 'destructive',
          onPress: () => {
            const filtered = notes.filter(n => n.id !== id);
            setNotes(filtered);
            saveNotesToStorage(filtered);
            setAlertConfig({ 
              visible: true, 
              title: t('memberNotes.noteDeletedTitle'), 
              message: t('memberNotes.noteDeletedMsg'), 
              type: 'success' 
            });
          }
        }
      ]
    );
  };

  const openViewMode = (note: SermonNote) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setIsViewMode(true); // always open read-only first
    setModalVisible(true);
  };

  const openCreateForm = () => {
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setIsViewMode(false); // new note always opens in edit mode
    setModalVisible(true);
  };

  const toggleSelection = (id: string) => {
    setSelectedNoteIds(prev => 
      prev.includes(id) ? prev.filter(noteId => noteId !== id) : [...prev, id]
    );
  };

  const handleMergeNotes = () => {
    if (!mergeTitle.trim()) {
      Alert.alert(t('memberNotes.required'), t('memberNotes.enterMergeTitlePrompt'));
      return;
    }

    const notesToMerge = notes.filter(n => selectedNoteIds.includes(n.id));
    
    // Combine content
    let combinedContent = '';
    notesToMerge.forEach((note) => {
      combinedContent += `--- ${getNoteDisplayTitle(note)} ---\n${getNoteDisplayContent(note)}\n\n`;
    });

    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const newNote: SermonNote = {
      id: Date.now().toString(),
      title: mergeTitle.trim(),
      content: combinedContent.trim(),
      timestamp: dateStr
    };

    // Remove the original notes that were merged
    const remainingNotes = notes.filter(n => !selectedNoteIds.includes(n.id));
    const updatedNotes = [newNote, ...remainingNotes];

    setNotes(updatedNotes);
    saveNotesToStorage(updatedNotes);

    // Reset selection and close modal
    setMergeModalVisible(false);
    setMergeTitle('');
    setIsSelectionMode(false);
    setSelectedNoteIds([]);
  };

  const filteredNotes = notes.filter(n => {
    const displayTitle = getNoteDisplayTitle(n).toLowerCase();
    const displayContent = getNoteDisplayContent(n).toLowerCase();
    const origTitle = (n.title || '').toLowerCase();
    const origContent = (n.content || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return (
      displayTitle.includes(q) ||
      displayContent.includes(q) ||
      origTitle.includes(q) ||
      origContent.includes(q)
    );
  });

  const renderNoteCard = ({ item }: { item: SermonNote }) => {
    const isSelected = selectedNoteIds.includes(item.id);
    const displayTitle = getNoteDisplayTitle(item);
    const displayContent = getNoteDisplayContent(item);

    return (
      <View style={[
        styles.noteCard, 
        { 
          backgroundColor: isDark ? '#18181B' : '#FFFFFF',
          borderColor: isSelectionMode && isSelected ? (isDark ? '#FFFFFF' : '#0F172A') : (isDark ? '#3F3F46' : '#CBD5E1'),
          borderWidth: isSelectionMode && isSelected ? 2 : 1.2,
        }
      ]}>
        <TouchableOpacity 
          style={[
            styles.noteCardBody, 
            isSelectionMode && { flexDirection: 'row', alignItems: 'center' }
          ]} 
          activeOpacity={0.7}
          onPress={() => isSelectionMode ? toggleSelection(item.id) : openViewMode(item)}
          onLongPress={() => {
            if (!isSelectionMode) {
              setIsSelectionMode(true);
              toggleSelection(item.id);
            }
          }}
        >
          {isSelectionMode && (
            <View style={{ marginRight: 14 }}>
              {isSelected ? (
                <CheckSquare size={22} color={isDark ? '#FFFFFF' : '#0F172A'} />
              ) : (
                <Square size={22} color={isDark ? '#52525B' : '#CBD5E1'} />
              )}
            </View>
          )}

          <View style={{ flex: 1 }}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.noteCardTitle, { color: colors.text }]} numberOfLines={1}>
                {displayTitle}
              </Text>
              <View style={styles.dateBadge}>
                <Calendar size={12} color={isDark ? '#E4E4E7' : '#334155'} />
                <Text style={[styles.dateText, { color: isDark ? '#E4E4E7' : '#334155' }]}>{item.timestamp}</Text>
              </View>
            </View>
            
            {item.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                <Text style={[styles.categoryBadgeTxt, { color: colors.text }]}>
                  {getCategoryLabel(item.category)}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.noteCardSnippet, { color: isDark ? '#F4F4F5' : '#1E293B' }]} numberOfLines={3}>
              {displayContent || t('memberNotes.noAdditionalText')}
            </Text>
          </View>
        </TouchableOpacity>

        {!isSelectionMode && (
          <View style={[
            styles.cardActionsRow, 
            { 
              backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
              borderTopWidth: 1.2,
              borderTopColor: isDark ? '#3F3F46' : '#CBD5E1'
            }
          ]}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openViewMode(item)}>
              <Edit3 size={14} color={colors.text} />
              <Text style={[styles.actionBtnTxt, { color: colors.text }]}>{t('memberNotes.view')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteNote(item.id)}>
              <Trash2 size={14} color="#EF4444" />
              <Text style={[styles.actionBtnTxt, { color: '#EF4444' }]}>{t('memberNotes.delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : (colors.background || '#FAF7F2') }]}>
      <StatusBar 
        barStyle={isDark ? 'light-content' : 'dark-content'} 
        backgroundColor={isDark ? '#000000' : (colors.background || '#FAF7F2')} 
      />

      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />

      {/* ── Screen Header ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
          }
        ]}
      >
        <TouchableOpacity
          style={styles.circularBackBtn}
          onPress={() => {
            if (isSelectionMode) {
              setIsSelectionMode(false);
              setSelectedNoteIds([]);
            } else {
              navigation.goBack();
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          {isSelectionMode ? (
            <X size={20} color={colors.text} strokeWidth={2.4} />
          ) : (
            <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
          )}
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          {isSelectionMode 
            ? `${selectedNoteIds.length} ${t('memberNotes.select')}` 
            : t('memberNotes.title')}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isSelectionMode ? (
            <TouchableOpacity
              style={[
                styles.selectionToggleBtn,
                {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderColor: isDark ? '#27272A' : '#E2E8F0',
                  borderWidth: 1
                }
              ]}
              onPress={() => {
                if (selectedNoteIds.length === notes.length) {
                  setSelectedNoteIds([]);
                } else {
                  setSelectedNoteIds(notes.map(n => n.id));
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                {selectedNoteIds.length === notes.length ? t('memberNotes.cancel') : t('memberNotes.categories.all')}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.circularBackBtn}
              onPress={() => setIsMenuOpen(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.8}
            >
              <MoreVertical size={20} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Dropdown Menu Modal */}
      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setIsMenuOpen(false)} activeOpacity={1}>
          <View style={[
            styles.menuContainer,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: isDark ? '#27272A' : '#E2E8F0',
              borderWidth: 1,
            }
          ]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setIsMenuOpen(false);
              openCreateForm();
            }}>
              <Plus size={18} color={colors.text} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>{t('memberNotes.addNote')}</Text>
            </TouchableOpacity>
            {notes.length > 0 && (
              <TouchableOpacity style={styles.menuItem} onPress={() => {
                setIsMenuOpen(false);
                setIsSelectionMode(true);
                setSelectedNoteIds([]);
              }}>
                <CheckSquare size={18} color={colors.text} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>{t('memberNotes.select')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Search Input */}
      <View style={[
        styles.searchBarContainer,
        {
          backgroundColor: isDark ? '#18181B' : '#FFFFFF',
          borderColor: isDark ? '#27272A' : '#E2E8F0',
          borderWidth: 1,
        }
      ]}>
        <Search size={19} color={colors.textSecondary} />
        <TextInput
          placeholder={t('memberNotes.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity 
            onPress={() => setSearchQuery('')} 
            style={[styles.searchClearBtn, { backgroundColor: isDark ? '#27272A' : '#E2E8F0' }]}
          >
            <Text style={[styles.searchClearTxt, { color: colors.textSecondary }]}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notes List */}
      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderNoteCard}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyStateContainer}>
            <FileText size={48} color={isDark ? '#3F3F46' : '#CBD5E1'} />
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
              {t('memberNotes.noNotesFound')}
            </Text>
            <Text style={[styles.emptyStateSubtitle, { color: colors.textSecondary }]}>
              {t('memberNotes.emptySubtitle')}
            </Text>
            <TouchableOpacity 
              style={[
                styles.createFirstBtn, 
                { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }
              ]} 
              onPress={openCreateForm}
              activeOpacity={0.8}
            >
              <Plus size={16} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 6 }} strokeWidth={2.4} />
              <Text style={[styles.createFirstBtnTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                {t('memberNotes.createFirstNote')}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Floating Merge Button */}
      {isSelectionMode && selectedNoteIds.length > 1 && (
        <TouchableOpacity 
          style={[
            styles.floatingMergeBtn,
            { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }
          ]}
          onPress={() => setMergeModalVisible(true)}
          activeOpacity={0.85}
        >
          <Combine size={18} color={isDark ? '#000000' : '#FFFFFF'} />
          <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
            {t('memberNotes.mergeSelected', { count: selectedNoteIds.length })}
          </Text>
        </TouchableOpacity>
      )}

      {/* Merge Title Prompt Modal */}
      <Modal
        visible={mergeModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setMergeModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={[
            styles.modalCardPrompt,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: isDark ? '#27272A' : '#E2E8F0',
              borderWidth: 1,
            }
          ]}>
            <Text style={[{ fontSize: 18, fontWeight: '800', marginBottom: 8, color: colors.text }]}>
              {t('memberNotes.nameSermonGroup')}
            </Text>
            <Text style={[{ fontSize: 13, color: colors.textSecondary, marginBottom: 18, lineHeight: 19 }]}>
              {t('memberNotes.mergeSubtitle', { count: selectedNoteIds.length })}
            </Text>
            
            <TextInput
              placeholder={t('memberNotes.mergePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.titleInput, 
                { 
                  color: colors.text, 
                  borderColor: colors.border, 
                  backgroundColor: isDark ? '#27272A' : '#FAF7F2',
                  marginBottom: 20 
                }
              ]}
              value={mergeTitle}
              onChangeText={setMergeTitle}
              maxLength={80}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ 
                  flex: 1, 
                  paddingVertical: 14, 
                  borderRadius: 14, 
                  backgroundColor: isDark ? '#27272A' : '#F1F5F9', 
                  alignItems: 'center' 
                }}
                onPress={() => setMergeModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  {t('memberNotes.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ 
                  flex: 1, 
                  paddingVertical: 14, 
                  borderRadius: 14, 
                  backgroundColor: isDark ? '#FFFFFF' : '#0F172A', 
                  alignItems: 'center' 
                }}
                onPress={handleMergeNotes}
                activeOpacity={0.8}
              >
                <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }}>
                  {t('memberNotes.mergeNotes')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View / Create / Edit Note Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={[
            styles.modalCard,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: isDark ? '#27272A' : '#E2E8F0'
            }
          ]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: isDark ? '#27272A' : '#E2E8F0', borderBottomWidth: 1 }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {!editingNoteId 
                  ? t('memberNotes.createNote') 
                  : isViewMode 
                    ? t('memberNotes.viewNote') 
                    : t('memberNotes.editNote')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {/* Edit toggle button when in view mode */}
                {editingNoteId && isViewMode && (
                  <TouchableOpacity
                    style={[
                      styles.modalEditToggleBtn,
                      { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }
                    ]}
                    onPress={() => setIsViewMode(false)}
                    activeOpacity={0.8}
                  >
                    <Edit3 size={14} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
                      {t('memberNotes.edit')}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={[styles.modalCloseBtn, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
                  onPress={() => setModalVisible(false)}
                  activeOpacity={0.8}
                >
                  <X size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* View Mode: Read-Only */}
            {isViewMode && editingNoteId ? (
              (() => {
                const activeNote = notes.find(n => n.id === editingNoteId);
                const displayTitle = activeNote ? getNoteDisplayTitle(activeNote) : noteTitle;
                const displayContent = (activeNote ? getNoteDisplayContent(activeNote) : noteContent) || t('memberNotes.noContentYet');
                const category = activeNote?.category;

                return (
                  <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('memberNotes.sermonTitle')}</Text>
                    <View style={[
                      styles.titleInput, 
                      { 
                        backgroundColor: isDark ? '#27272A' : '#FAF7F2', 
                        borderColor: colors.border, 
                        justifyContent: 'center',
                        marginBottom: 16
                      }
                    ]}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{displayTitle}</Text>
                    </View>

                    {category ? (
                      <>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('memberNotes.categoryLabel')}</Text>
                        <View style={[
                          styles.categoryPill, 
                          { 
                            backgroundColor: isDark ? '#27272A' : '#F1F5F9', 
                            borderColor: colors.border, 
                            alignSelf: 'flex-start',
                            marginBottom: 16
                          }
                        ]}>
                          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                            {getCategoryLabel(category)}
                          </Text>
                        </View>
                      </>
                    ) : null}

                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('memberNotes.sermonDetails')}</Text>
                    <View style={[
                      styles.contentInput, 
                      { 
                        backgroundColor: isDark ? '#27272A' : '#FAF7F2', 
                        borderColor: colors.border, 
                        minHeight: 180, 
                        height: undefined 
                      }
                    ]}>
                      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>
                        {displayContent}
                      </Text>
                    </View>

                    <View style={{ height: 60 }} />
                  </ScrollView>
                );
              })()
            ) : (
              /* Edit/Create Mode: Editable Inputs */
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('memberNotes.sermonTitle')}</Text>
                <TextInput
                  placeholder={t('memberNotes.titlePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.titleInput, 
                    { 
                      color: colors.text, 
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#27272A' : '#FAF7F2',
                      marginBottom: 16
                    }
                  ]}
                  value={noteTitle}
                  onChangeText={setNoteTitle}
                  maxLength={80}
                />

                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('memberNotes.sermonDetails')}</Text>
                <TextInput
                  placeholder={t('memberNotes.contentPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.contentInput, 
                    { 
                      color: colors.text, 
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#27272A' : '#FAF7F2',
                      marginBottom: 24
                    }
                  ]}
                  value={noteContent}
                  onChangeText={setNoteContent}
                  multiline={true}
                  numberOfLines={10}
                  textAlignVertical="top"
                />

                {/* Save Button */}
                <TouchableOpacity 
                  style={[
                    styles.saveBtn,
                    { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }
                  ]} 
                  onPress={handleCreateOrEditNote}
                  activeOpacity={0.85}
                >
                  <Save size={18} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 8 }} />
                  <Text style={[styles.saveBtnTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                    {editingNoteId ? t('memberNotes.saveChanges') : t('memberNotes.saveNote')}
                  </Text>
                </TouchableOpacity>
                <View style={{ height: 60 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1.2,
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  
  // Menu styles
  menuOverlay: { 
    flex: 1, 
    backgroundColor: 'transparent' 
  },
  menuContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 104 : 84,
    right: 20,
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 170,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600'
  },

  // Search
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 8,
    marginLeft: 8
  },
  searchClearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearTxt: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
    textAlign: 'center',
  },

  listContent: { 
    padding: 16, 
  },

  // Card styles
  noteCard: {
    borderRadius: 18,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden'
  },
  noteCardBody: {
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  noteCardTitle: { 
    fontSize: 15, 
    fontWeight: '800', 
    flex: 1, 
    marginRight: 10 
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  dateText: { 
    fontSize: 11, 
    fontWeight: '700' 
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6
  },
  categoryBadgeTxt: {
    fontSize: 11,
    fontWeight: '700'
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1
  },
  noteCardSnippet: { 
    fontSize: 13.5, 
    lineHeight: 20, 
    fontWeight: '600' 
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  actionBtnTxt: { 
    fontSize: 12, 
    fontWeight: '700' 
  },

  // Empty State
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
    paddingHorizontal: 30
  },
  emptyStateTitle: { 
    fontSize: 16, 
    fontWeight: '800', 
    marginTop: 15, 
    marginBottom: 8 
  },
  emptyStateSubtitle: { 
    fontSize: 13, 
    textAlign: 'center', 
    lineHeight: 20, 
    marginBottom: 20 
  },
  createFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  createFirstBtnTxt: { 
    fontSize: 13, 
    fontWeight: '800' 
  },

  // Floating Merge
  floatingMergeBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },

  // Modal styles
  modalBg: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.55)', 
    justifyContent: 'flex-end' 
  },
  modalCardPrompt: {
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 40 : 24,
    borderRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  modalCard: { 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    height: height * 0.85, 
    padding: 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingBottom: 16, 
    marginBottom: 16 
  },
  modalTitle: { 
    fontSize: 18, 
    fontWeight: '800' 
  },
  modalEditToggleBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  modalCloseBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  modalScroll: { 
    flex: 1 
  },
  inputLabel: { 
    fontSize: 11, 
    fontWeight: '700', 
    letterSpacing: 0.3, 
    marginBottom: 6 
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  contentInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    height: 180,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },
  saveBtnTxt: { 
    fontSize: 15, 
    fontWeight: '800' 
  }
});
