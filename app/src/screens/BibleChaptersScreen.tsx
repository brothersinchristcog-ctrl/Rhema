import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Dimensions, 
  StatusBar, 
  Platform 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { SupportedLanguage } from '../locales';
import { BibleService } from '../services/BibleService';

const { width } = Dimensions.get('window');

const VERSES_LABELS: Record<string, string> = {
  en: 'Verses',
  te: 'వచనములు',
  hi: 'पद',
  ta: 'வசனங்கள்',
  mr: 'वचने',
  ml: 'വാക്യങ്ങൾ',
  kn: 'ವಚನಗಳು',
};

export default function BibleChaptersScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { bookName, lang: paramLang, bookIndex: paramBookIndex } = route.params || {};
  const { isDark, colors } = useTheme();
  const { language, t } = useLanguage();
  const [savedBibleLang, setSavedBibleLang] = useState<SupportedLanguage | null>(null);
  const [readChapters, setReadChapters] = useState<Set<number>>(new Set());
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!paramLang) {
      AsyncStorage.getItem('@BibleSelectedLanguage').then(saved => {
        if (saved) setSavedBibleLang(saved as SupportedLanguage);
      });
    }
  }, [paramLang]);

  const currentLang = (paramLang || savedBibleLang || language) as SupportedLanguage;
  const resolvedBookIndex = paramBookIndex !== undefined 
    ? paramBookIndex 
    : BibleService.getBookIndex(bookName);
  
  const displayBookName = BibleService.getBookName(resolvedBookIndex, currentLang);
  const count = BibleService.getChapterCount(resolvedBookIndex);
  const chapters = Array.from({ length: count }, (_, i) => i + 1);

  const verseCount = selectedChapter ? BibleService.getVerseCount(resolvedBookIndex, selectedChapter) : 0;
  const verses = Array.from({ length: verseCount }, (_, i) => i + 1);

  useFocusEffect(
    useCallback(() => {
      const loadProgress = async () => {
        try {
          const stored = await AsyncStorage.getItem('@BibleReadProgress');
          if (stored) {
            const progress = JSON.parse(stored);
            const read = new Set<number>();
            progress.forEach((key: string) => {
              const [bIdx, c] = key.split('-');
              if (parseInt(bIdx) === resolvedBookIndex) {
                read.add(parseInt(c));
              }
            });
            setReadChapters(read);
          }
        } catch (e) {
          console.log('Error loading progress:', e);
        }
      };
      loadProgress();
    }, [resolvedBookIndex])
  );

  const handleSelectChapter = (chapter: number) => {
    setSelectedChapter(chapter);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSelectVerse = (verse?: number) => {
    if (!selectedChapter) return;
    navigation.navigate('BibleReader', {
      bookIndex: resolvedBookIndex,
      bookName: displayBookName,
      chapter: selectedChapter,
      targetVerse: verse,
      lang: currentLang,
    });
  };

  const activeBadgeBg = isDark ? '#FFFFFF' : '#000000';
  const activeBadgeText = isDark ? '#000000' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.16)' : '#94A3B8';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.background} />
      
      {/* ── Screen Header (Clean back button & title) ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            borderBottomWidth: 1.2,
            borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
          }
        ]}
      >
        <TouchableOpacity
          style={styles.circularBackBtn}
          onPress={() => {
            if (selectedChapter) {
              setSelectedChapter(null);
            } else {
              navigation.goBack();
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={22} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerCenterColumn}>
          <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
            {displayBookName}
          </Text>
        </View>

        <View style={styles.headerRightSpacer} />
      </View>

      {/* ── Mode Selector Tabs: Chapters vs Verses (when a chapter is chosen) ── */}
      <View style={[styles.stepTabsWrap, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <TouchableOpacity
          style={[
            styles.stepTabBtn,
            !selectedChapter && { backgroundColor: activeBadgeBg }
          ]}
          activeOpacity={0.85}
          onPress={() => setSelectedChapter(null)}
        >
          <Text
            style={[
              styles.stepTabTxt,
              { color: !selectedChapter ? activeBadgeText : colors.textSecondary }
            ]}
          >
            {t('bible.chapters')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.stepTabBtn,
            selectedChapter !== null && { backgroundColor: activeBadgeBg },
            selectedChapter === null && { opacity: 0.5 }
          ]}
          activeOpacity={0.85}
          disabled={selectedChapter === null}
        >
          <Text
            style={[
              styles.stepTabTxt,
              { color: selectedChapter !== null ? activeBadgeText : colors.textSecondary }
            ]}
          >
            {VERSES_LABELS[currentLang] || VERSES_LABELS.en}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!selectedChapter ? (
          /* ── STEP 1: Centered Chapters Grid ── */
          <View style={styles.sectionBlock}>
            <View style={styles.grid}>
              {chapters.map((chapter) => {
                const isRead = readChapters.has(chapter);
                return (
                  <TouchableOpacity 
                    key={chapter} 
                    activeOpacity={0.8}
                    style={[
                      styles.chapterBox, 
                      {
                        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.7)' : 'rgba(255, 255, 255, 0.85)',
                        borderColor: cardBorder,
                        borderWidth: 1.2,
                      },
                      isRead && {
                        backgroundColor: isDark ? '#064e3b' : '#d1fae5',
                        borderColor: '#10b981',
                        borderWidth: 1.4,
                      }
                    ]}
                    onPress={() => handleSelectChapter(chapter)}
                  >
                    <Text
                      style={[
                        styles.chapterNum,
                        { color: isDark ? '#FFFFFF' : '#0F172A' },
                        isRead && { color: isDark ? '#34d399' : '#047857' }
                      ]}
                    >
                      {chapter}
                    </Text>
                    {isRead && (
                      <View style={styles.readCheckBadge}>
                        <CheckCircle2 color="#10b981" size={12} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          /* ── STEP 2: Centered Verses Grid ── */
          <View style={styles.sectionBlock}>
            <View style={styles.grid}>
              {verses.map((verseNum) => (
                <TouchableOpacity
                  key={verseNum}
                  activeOpacity={0.78}
                  style={[
                    styles.chapterBox,
                    {
                      backgroundColor: isDark ? 'rgba(39, 39, 42, 0.7)' : 'rgba(255, 255, 255, 0.88)',
                      borderColor: cardBorder,
                      borderWidth: 1.2,
                    }
                  ]}
                  onPress={() => handleSelectVerse(verseNum)}
                >
                  <Text style={[styles.chapterNum, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                    {verseNum}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  circularBackBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenterColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerSubtitleText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 44,
    height: 44,
  },
  stepTabsWrap: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
    padding: 4,
    borderRadius: 24,
    borderWidth: 1.2,
    gap: 8,
  },
  stepTabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTabTxt: {
    fontSize: 13,
    fontWeight: '800',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    alignItems: 'center',
  },
  sectionBlock: {
    width: '100%',
    alignItems: 'center',
  },
  secTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  chapterBox: {
    width: (width - 88) / 5,
    height: (width - 88) / 5,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    position: 'relative',
  },
  chapterNum: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  readCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
