import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  StatusBar,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Rect,
  RadialGradient as SvgRadialGradient,
  LinearGradient as SvgLinearGradient,
  Stop,
  Polygon,
} from 'react-native-svg';

interface SplashScreenProps {
  onFinish?: () => void;
}

interface DiamondDividerProps {
  id: string;
}

const DiamondDivider: React.FC<DiamondDividerProps> = ({ id }) => (
  <View style={styles.dividerContainer}>
    <Svg width={190} height={18} viewBox="0 0 190 18">
      <Defs>
        <SvgLinearGradient id={`lineLeft_${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#C99E50" stopOpacity="0" />
          <Stop offset="100%" stopColor="#C99E50" stopOpacity="0.85" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`lineRight_${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#C99E50" stopOpacity="0.85" />
          <Stop offset="100%" stopColor="#C99E50" stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      {/* Left tapering golden hairline */}
      <Rect x="15" y="8.5" width="70" height="1" fill={`url(#lineLeft_${id})`} />
      {/* Central burnished gold diamond */}
      <Polygon points="95,4 100,9 95,14 90,9" fill="#C99E50" />
      {/* Right tapering golden hairline */}
      <Rect x="105" y="8.5" width="70" height="1" fill={`url(#lineRight_${id})`} />
    </Svg>
  </View>
);

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const bgFade = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    // Staggered smooth native fade for an ultra-crisp vector reveal
    Animated.parallel([
      Animated.timing(bgFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 750,
        delay: 150,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      onFinishRef.current?.();
    }, 2500);

    return () => clearTimeout(timer);
  }, [bgFade, contentFade]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent
      />

      {/* ── Pristine White & Pearl Silk Gradient Background ── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: bgFade }]}>
        {/* Luminous multi-stop white-to-pearl-lavender linear gradient */}
        <LinearGradient
          colors={['#FFFFFF', '#FAF9FD', '#F4F2FA', '#ECE7F6', '#F7F5FC', '#FFFFFF']}
          locations={[0, 0.2, 0.45, 0.75, 0.9, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Delicate ambient soft pearl luminescence in corners */}
        <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
          <Defs>
            <SvgRadialGradient id="topWhiteGlow" cx="50%" cy="0%" r="55%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.4" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </SvgRadialGradient>
            <SvgRadialGradient id="softLilacGlow" cx="80%" cy="60%" r="50%">
              <Stop offset="0%" stopColor="#E8E1F7" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#E8E1F7" stopOpacity="0" />
            </SvgRadialGradient>
            <SvgRadialGradient id="softGoldGlow" cx="20%" cy="85%" r="45%">
              <Stop offset="0%" stopColor="#F9F2E3" stopOpacity="0.55" />
              <Stop offset="100%" stopColor="#F9F2E3" stopOpacity="0" />
            </SvgRadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#topWhiteGlow)" />
          <Rect width="100%" height="100%" fill="url(#softLilacGlow)" />
          <Rect width="100%" height="100%" fill="url(#softGoldGlow)" />
        </Svg>
      </Animated.View>

      {/* ── Vector Typography & Accents ── */}
      <Animated.View style={[styles.contentWrapper, { opacity: contentFade }]}>
        {/* Center Brand & Message Section */}
        <View style={styles.centerSection}>
          <Text style={styles.brandTitle}>RHEMA</Text>
          <Text style={styles.brandSubtitle}>GLOBAL MINISTRIES</Text>

          {/* Top Diamond Divider */}
          <DiamondDivider id="top" />

          {/* Transforming text framed symmetrically in the middle */}
          <View style={styles.taglineContainer}>
            <Text style={styles.taglineRow}>Transforming Lives</Text>
            <Text style={styles.taglineRow}>through the Word of God</Text>
          </View>

          {/* Bottom Diamond Divider placed directly below transforming text */}
          <DiamondDivider id="bottom" />
        </View>

        {/* Bottom Welcome Section */}
        <View style={styles.bottomSection}>
          <Text style={styles.welcomeText}>Welcome to the Rhema family</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 60 : 70,
    // Raised higher up from the bottom for clear device navigation clearance
    paddingBottom: Platform.OS === 'android' ? 76 : 90,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: -25,
  },
  brandTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: Math.min(width * 0.125, 48),
    fontWeight: '400', // Classical elegant regular serif (not bold)
    letterSpacing: 10,
    color: '#1A1230',
    textAlign: 'center',
    paddingLeft: 10, // Offsets trailing letterSpacing to ensure optical center
  },
  brandSubtitle: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 6,
    color: '#3A2858',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 14,
    paddingLeft: 6, // Offsets trailing letterSpacing
  },
  dividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
  },
  taglineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  taglineRow: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
    fontSize: 20.5, // Increased slightly for enhanced legibility
    lineHeight: 29,
    fontWeight: '400', // Slender, delicate literary serif
    letterSpacing: 0.5,
    color: '#2B1A52',
    textAlign: 'center',
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10, // Gives additional upward lift
  },
  welcomeText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#281744',
    textAlign: 'center',
    marginTop: 8,
  },
});
