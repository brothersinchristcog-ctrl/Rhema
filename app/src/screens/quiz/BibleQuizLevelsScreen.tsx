import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  BookOpen,
  Globe,
  ChevronRight,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { QuizDifficulty } from '../../types/Quiz';
import { QUIZ_CATEGORIES } from '../../constants/BibleQuizCategories';
import { useQuizLanguage } from '../../context/QuizLanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { getQuizStrings } from '../../constants/BibleQuizTranslations';
import QuizLanguageModal from './QuizLanguageModal';

export default function BibleQuizLevelsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { quizLanguage, quizLanguageOption } = useQuizLanguage();
  const { isDark } = useTheme();

  const category: string = route?.params?.category || 'Family';
  const categoryTitleParam: string = route?.params?.categoryTitle || category;
  const routeImage: string = route?.params?.categoryImage || '';
  const categoryObj = QUIZ_CATEGORIES.find(
    (c) => c.id.toLowerCase() === category.toLowerCase() || c.name.toLowerCase() === category.toLowerCase()
  );
  const categoryImage: string = routeImage || categoryObj?.imageUrl || 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800';

  const [langModalVisible, setLangModalVisible] = useState<boolean>(false);

  const ui = getQuizStrings(quizLanguage);
  const categoryDisplayName = ui.categories[category] || categoryTitleParam;

  // Navigate to the new Stages screen passing category + chosen difficulty
  const handleSelectDifficulty = (diff: QuizDifficulty) => {
    navigation.navigate('BibleQuizStages', {
      category,
      difficulty: diff,
      categoryTitle: categoryDisplayName,
      categoryImage,
    });
  };

  const difficulties: { key: QuizDifficulty; name: string; sub: string }[] = [
    { key: 'easy',   name: ui.easy,   sub: quizLanguage === 'te' ? 'ప్రారంభం'  : 'Beginner'     },
    { key: 'medium', name: ui.medium, sub: quizLanguage === 'te' ? 'మధ్యస్థం' : 'Intermediate' },
    { key: 'hard',   name: ui.hard,   sub: quizLanguage === 'te' ? 'ఉన్నతం'   : 'Advanced'     },
  ];

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0b1120' : '#FAF7F2' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0b1120' : '#FAF7F2'} />

      {/* Header */}
      <View
        style={[
          styles.headerCardWrapper,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 6 }
        ]}
      >
        <LinearGradient
          colors={['#527C78', '#355B56']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerDecoCircle1} pointerEvents="none" />
          <View style={styles.headerDecoCircle2} pointerEvents="none" />

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#355B56" />
          </TouchableOpacity>

          <View style={styles.headerCenter} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {categoryDisplayName}
            </Text>
            <View style={styles.headerTitleAccentBar} />
          </View>

          {/* Language Selector Pill */}
          <TouchableOpacity
            style={styles.langPill}
            onPress={() => setLangModalVisible(true)}
            activeOpacity={0.8}
          >
            <Globe size={13} color="#355B56" />
            <Text style={styles.langPillTxt}>{quizLanguageOption.nativeName}</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.curvedHeroWrapper}>
          <ImageBackground
            source={{
              uri: categoryImage || 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800',
            }}
            style={styles.curvedHeroImageBg}
            imageStyle={styles.curvedHeroImage}
          >
            <LinearGradient
              colors={['rgba(11, 17, 32, 0.2)', 'rgba(11, 17, 32, 0.82)', 'rgba(11, 17, 32, 0.97)']}
              locations={[0, 0.45, 1]}
              style={styles.curvedHeroOverlay}
            >
              <View style={styles.heroPillQuiz}>
                <BookOpen size={11} color="#60a5fa" />
                <Text style={styles.heroPillQuizTxt}>{ui.quizTitle.toUpperCase()}</Text>
              </View>

              <Text style={styles.heroTitle}>{categoryDisplayName}</Text>
              <Text style={styles.heroSub}>
                {quizLanguage === 'te'
                  ? 'మీ స్థాయిని ఎంచుకుని విశ్వాసంలో ముందుకు సాగండి.'
                  : 'Choose your difficulty level and grow in Scripture knowledge.'}
              </Text>
            </LinearGradient>
          </ImageBackground>
        </View>

        {/* Section Label */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            {ui.selectDifficulty}
          </Text>
        </View>

        {/* Vertical Difficulty Cards — tap to navigate */}
        <View style={styles.difficultyList}>
          {difficulties.map((diff, idx) => {
            const accentGradient: [string, string, string] =
              diff.key === 'easy'
                ? ['#1d4ed8', '#2563eb', '#3b82f6']
                : diff.key === 'medium'
                ? ['#b45309', '#d97706', '#f59e0b']
                : ['#064e3b', '#065f46', '#10b981'];

            return (
              <TouchableOpacity
                key={diff.key}
                style={[
                  styles.diffRowCard,
                  {
                    marginBottom: idx < difficulties.length - 1 ? 12 : 0,
                    shadowColor: accentGradient[1],
                    shadowOffset: { width: 0, height: 5 },
                    shadowOpacity: 0.4,
                    shadowRadius: 10,
                    elevation: 5,
                  },
                ]}
                onPress={() => handleSelectDifficulty(diff.key)}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.diffRowInner}
                >
                  {/* Left accent bar */}
                  <View style={[styles.diffRowAccentBar, { backgroundColor: 'rgba(255,255,255,0.35)' }]} />

                  <View style={styles.diffRowContent}>
                    <Text style={styles.diffRowTitle}>{diff.name}</Text>
                    <Text style={styles.diffRowSub}>{diff.sub}</Text>
                  </View>

                  <View style={styles.diffRowRight}>
                    <View style={styles.levelsTag}>
                      <Text style={styles.levelsTagTxt}>
                        {quizLanguage === 'te' ? '30 స్థాయిలు' : '30 Levels'}
                      </Text>
                    </View>
                    <ChevronRight size={20} color="rgba(255,255,255,0.85)" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <QuizLanguageModal
        visible={langModalVisible}
        onClose={() => setLangModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  headerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
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
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E4EEEA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    zIndex: 10,
  },
  langPillTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#355B56',
  },
  scrollArea: {
    flex: 1,
  },
  curvedHeroWrapper: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#141d2e',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  curvedHeroImageBg: {
    width: '100%',
    minHeight: 180,
  },
  curvedHeroImage: {
    borderRadius: 22,
  },
  curvedHeroOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 20,
    paddingTop: 16,
  },
  heroPillQuiz: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 8,
  },
  heroPillQuizTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: '#ffffff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 17,
  },
  sectionHeaderRow: {
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  difficultyList: {
    marginHorizontal: 16,
  },
  diffRowCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  diffRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    minHeight: 72,
  },
  diffRowAccentBar: {
    width: 4,
    height: 38,
    borderRadius: 2,
    marginRight: 14,
  },
  diffRowContent: {
    flex: 1,
  },
  diffRowTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 3,
  },
  diffRowSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  diffRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelsTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelsTagTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
});
