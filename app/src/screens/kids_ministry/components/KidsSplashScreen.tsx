import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Shield, BookOpen, Award, ArrowRight, Sparkles } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

interface Props {
  onEnter: () => void;
  churchName?: string;
}

export default function KidsSplashScreen({ onEnter, churchName }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in and scale up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
      // Progress bar animation (2.5s)
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 2500,
        useNativeDriver: false,
      }),
    ]).start();

    // Subtle breathing glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const progressWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Top Ministry Banner */}
      <View style={styles.topHeader}>
        <Text style={styles.topMotto}>
          {churchName || 'RHEMA GLOBAL MINISTRIES'}
        </Text>
      </View>

      {/* Main Center Content */}
      <Animated.View
        style={[
          styles.centerContent,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Golden Cross & Crown Emblem */}
        <View style={styles.emblemContainer}>
          <Animated.View
            style={[
              styles.glowAura,
              {
                opacity: glowAnim,
              },
            ]}
          />
          <View style={styles.emblemBox}>
            <Text style={styles.crossSymbol}>✝</Text>
            <Text style={styles.kidsLabel}>KIDS</Text>
            <View style={styles.nextGenPill}>
              <Text style={styles.nextGenText}>NEXT GEN</Text>
            </View>
          </View>
        </View>

        {/* Grand Welcome Typography */}
        <Text style={styles.welcomeSub}>Welcome to</Text>
        <Text style={styles.brandTitle}>Rhema Kids</Text>
        <Text style={styles.tagline}>Sunday School & Child Ministry</Text>

        {/* Mark 10:14 Scripture Card */}
        <View style={styles.scriptureCard}>
          <Text style={styles.scriptureTelugu}>
            "చిన్న బిడ్డలను నా యొద్దకు రానియ్యుడి, వారిని ఆటంకపరచవద్దు; దేవుని రాజ్యము వీరిదే."
          </Text>
          <Text style={styles.scriptureEnglish}>
            "Let the little children come to Me, and do not hinder them, for the kingdom of God belongs to such as these."
          </Text>
          <Text style={styles.scriptureRef}>— మార్కు (Mark) 10:14</Text>
        </View>

        {/* 3 Core Highlights */}
        <View style={styles.highlightsRow}>
          <View style={styles.highlightPill}>
            <Shield size={12} color="#10B981" />
            <Text style={styles.highlightText}>Safe Check-In</Text>
          </View>
          <View style={styles.highlightPill}>
            <BookOpen size={12} color="#60A5FA" />
            <Text style={styles.highlightText}>Bilingual LMS</Text>
          </View>
          <View style={styles.highlightPill}>
            <Award size={12} color="#FBBF24" />
            <Text style={styles.highlightText}>Bible Quizzes</Text>
          </View>
        </View>
      </Animated.View>

      {/* Bottom Progress Bar & Enter Button */}
      <View style={styles.bottomArea}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
        </View>

        <TouchableOpacity
          style={styles.enterBtn}
          onPress={onEnter}
          activeOpacity={0.88}
        >
          <Text style={styles.enterBtnText}>Enter Rhema Kids</Text>
          <ArrowRight size={18} color="#000000" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: Platform.OS === 'ios' ? 48 : 32,
  },
  topHeader: {
    paddingTop: 8,
  },
  topMotto: {
    color: '#FBBF24',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 2.2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  centerContent: {
    alignItems: 'center',
    width: '100%',
    marginVertical: 'auto',
  },
  emblemContainer: {
    position: 'relative',
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowAura: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(251, 191, 36, 0.22)',
  },
  emblemBox: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#1A2D5A',
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FBBF24',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
    position: 'relative',
  },
  crossSymbol: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
  },
  kidsLabel: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  nextGenPill: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  nextGenText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  welcomeSub: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '600',
  },
  brandTitle: {
    fontSize: 34,
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tagline: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  scriptureCard: {
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    alignItems: 'center',
  },
  scriptureTelugu: {
    fontSize: 13,
    color: '#FEF3C7',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
  scriptureEnglish: {
    fontSize: 12,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: 8,
  },
  scriptureRef: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  highlightsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  highlightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#18181B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  highlightText: {
    color: '#D4D4D8',
    fontSize: 11,
    fontWeight: '600',
  },
  bottomArea: {
    width: '100%',
    gap: 14,
    paddingBottom: 8,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: '#18181B',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FBBF24',
    borderRadius: 999,
  },
  enterBtn: {
    width: '100%',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  enterBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
