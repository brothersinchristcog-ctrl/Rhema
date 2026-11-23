import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  StatusBar,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import { ChildRecord } from '../../../types/KidsMinistryTypes';

const WELCOME_GIRL_ILLUSTRATION = require('../../../../assets/rhema_kids_welcome_girl.png');

interface Props {
  childrenList: ChildRecord[];
  loadingChildren?: boolean;
  selectedChildIndex?: number;
  onSelectChild?: (index: number) => void;
  onContinue: () => void;
  onAddKid: () => void;
  onBack: () => void;
  churchName?: string;
}

export default function KidsSplashScreen({
  childrenList,
  loadingChildren = false,
  onContinue,
  onAddKid,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const hasChildren = childrenList.length > 0;

  const palette = {
    bg: isDark ? '#0B0F19' : '#FFFDF8',
    topBlob: isDark ? 'rgba(139, 92, 246, 0.16)' : '#EFE9FE',
    sideBlob: isDark ? 'rgba(139, 92, 246, 0.12)' : '#F3EDFF',
    backCircle: isDark ? '#181E2E' : '#FFFFFF',
    backBorder: isDark ? '#2D3548' : '#E5E7EB',
    title: isDark ? '#F8FAFC' : '#1E1B4B',
    subtitle: isDark ? '#94A3B8' : '#64748B',
    bubbleBg: isDark ? '#271E4A' : '#EFE9FE',
    bubbleText: isDark ? '#EDE9FE' : '#1E1B4B',
    primaryBtn: '#7C3AED',
    secondaryText: isDark ? '#C4B5FD' : '#6D28D9',
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={palette.bg}
      />

      {/* Playful Pastel Corner Shapes matching modern child-friendly entry UI */}
      <View style={[styles.topLeftBlob, { backgroundColor: palette.topBlob }]} pointerEvents="none" />
      <View style={[styles.rightMidBlob, { backgroundColor: palette.sideBlob }]} pointerEvents="none" />
      <View
        style={[
          styles.bottomLeftLeafA,
          { backgroundColor: isDark ? 'rgba(74, 222, 128, 0.16)' : '#86EFAC' },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.bottomLeftLeafB,
          { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.18)' : '#A3E635' },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.bottomRightLeafA,
          { backgroundColor: isDark ? 'rgba(74, 222, 128, 0.16)' : '#86EFAC' },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.bottomRightLeafB,
          { backgroundColor: isDark ? 'rgba(132, 204, 22, 0.18)' : '#A3E635' },
        ]}
        pointerEvents="none"
      />

      {/* Top Row: Back button */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={[
            styles.backBtn,
            { backgroundColor: palette.backCircle, borderColor: palette.backBorder },
          ]}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={palette.title} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(24, insets.bottom + 16) },
        ]}
      >
        <Animated.View
          style={[
            styles.centerWrap,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Welcome Headline */}
          <Text style={[styles.headline, { color: palette.title }]}>
            {hasChildren ? 'Welcome to Rhema Kids!' : "Welcome! Let's get started"}
          </Text>
          <Text style={[styles.subHeadline, { color: palette.subtitle }]}>
            {hasChildren
              ? "We're so happy you're here!"
              : 'Sunday School, Bible stories & fun learning'}
          </Text>

          {loadingChildren ? (
            <View style={{ paddingVertical: 56, alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color={palette.primaryBtn} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: palette.subtitle }}>
                Loading Rhema Kids...
              </Text>
            </View>
          ) : (
            <>
              {/* Central Cartoon Girl Welcome Illustration (transparent PNG directly on background) */}
              <View style={styles.heroIllustrationWrap}>
                <Image
                  source={WELCOME_GIRL_ILLUSTRATION}
                  style={styles.heroIllustrationImage}
                  resizeMode="contain"
                />
              </View>

              {/* Soft Lavender Welcome Bubble */}
              <View style={[styles.greetingBubble, { backgroundColor: palette.bubbleBg }]}>
                <Text style={[styles.greetingTitle, { color: palette.bubbleText }]}>
                  Hi there! 👋
                </Text>
                <Text style={[styles.greetingDesc, { color: palette.bubbleText }]}>
                  {hasChildren
                    ? "Let's explore amazing Bible stories, Sunday School lessons & songs made just for you!"
                    : 'Add your child to unlock Sunday School check-in, Bible stories, quizzes & worship songs!'}
                </Text>
              </View>

              {/* Primary CTA Button */}
              {hasChildren ? (
                <>
                  <TouchableOpacity
                    style={[styles.primaryCtaBtn, { backgroundColor: palette.primaryBtn }]}
                    onPress={onContinue}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.primaryCtaText}>Continue</Text>
                    <View style={styles.ctaArrowCircle}>
                      <ArrowRight size={18} color={palette.primaryBtn} strokeWidth={2.8} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryAddLink}
                    onPress={onAddKid}
                    activeOpacity={0.75}
                  >
                    <Plus size={15} color={palette.secondaryText} strokeWidth={2.6} />
                    <Text style={[styles.secondaryAddText, { color: palette.secondaryText }]}>
                      Add Kid
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryCtaBtn, { backgroundColor: palette.primaryBtn }]}
                  onPress={onAddKid}
                  activeOpacity={0.88}
                >
                  <Text style={styles.primaryCtaText}>Add Kid</Text>
                  <View style={styles.ctaArrowCircle}>
                    <Plus size={18} color={palette.primaryBtn} strokeWidth={3} />
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  topLeftBlob: {
    position: 'absolute',
    top: -60,
    left: -50,
    width: 210,
    height: 190,
    borderRadius: 100,
  },
  rightMidBlob: {
    position: 'absolute',
    top: '44%',
    right: -70,
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  bottomLeftLeafA: {
    position: 'absolute',
    bottom: -24,
    left: -14,
    width: 78,
    height: 78,
    borderRadius: 39,
    transform: [{ rotate: '25deg' }],
  },
  bottomLeftLeafB: {
    position: 'absolute',
    bottom: -18,
    left: 34,
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  bottomRightLeafA: {
    position: 'absolute',
    bottom: -24,
    right: -14,
    width: 78,
    height: 78,
    borderRadius: 39,
    transform: [{ rotate: '-25deg' }],
  },
  bottomRightLeafB: {
    position: 'absolute',
    bottom: -18,
    right: 34,
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    zIndex: 2,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 6,
  },
  centerWrap: {
    alignItems: 'center',
    width: '100%',
  },
  headline: {
    fontSize: 27,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subHeadline: {
    fontSize: 14.5,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  heroIllustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  heroIllustrationImage: {
    width: 215,
    height: 215,
  },
  greetingBubble: {
    width: '100%',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  greetingTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  greetingDesc: {
    fontSize: 14.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
  },
  primaryCtaBtn: {
    width: '100%',
    height: 56,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '800',
  },
  ctaArrowCircle: {
    position: 'absolute',
    right: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryAddLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryAddText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
});
