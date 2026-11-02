import React, { useState, useCallback } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, BookOpen } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { BibleService } from '../services/BibleService';

const { width } = Dimensions.get('window');

export default function BibleChaptersScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { bookName, lang: paramLang, bookIndex: paramBookIndex } = route.params || {};
  const { isDark, colors } = useTheme();
  const { language, t } = useLanguage();
  const [readChapters, setReadChapters] = useState<Set<number>>(new Set());

  const currentLang = paramLang || language;
  const resolvedBookIndex = paramBookIndex !== undefined 
    ? paramBookIndex 
    : BibleService.getBookIndex(bookName);
  
  const displayBookName = BibleService.getBookName(resolvedBookIndex, currentLang);
  const count = BibleService.getChapterCount(resolvedBookIndex);
  const chapters = Array.from({ length: count }, (_, i) => i + 1);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.background} />
      
      {/* Header */}
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
          {displayBookName}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.secTitle, { color: colors.text }]}>
          {t('bible.chapters')}
        </Text>
        <View style={styles.grid}>
          {chapters.map((chapter) => {
            const isRead = readChapters.has(chapter);
            return (
              <TouchableOpacity 
                key={chapter} 
                style={[
                  styles.chapterBox, 
                  { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                  isRead && { backgroundColor: isDark ? '#064e3b' : '#d1fae5', borderColor: '#10b981', borderWidth: 1 }
                ]}
                onPress={() => navigation.navigate('BibleReader', { 
                  bookIndex: resolvedBookIndex,
                  bookName: displayBookName, 
                  chapter, 
                  lang: currentLang 
                })}
              >
                <Text style={[styles.chapterNum, { color: isDark ? '#fff' : '#1a2d5a' }, isRead && { color: isDark ? '#34d399' : '#047857' }]}>
                  {chapter}
                </Text>
                {isRead && (
                  <View style={{ position: 'absolute', top: 4, right: 4 }}>
                    <CheckCircle2 color="#10b981" size={12} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
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
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  scroll: { flex: 1, padding: 20 },
  secTitle: { fontSize: 16, fontWeight: '800', marginBottom: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start'
  },
  chapterBox: {
    width: (width - 76) / 5,
    height: (width - 76) / 5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    position: 'relative'
  },
  chapterNum: { fontSize: 16, fontWeight: '800' }
});
