import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Rect,
  RadialGradient as SvgRadialGradient,
  Stop,
  Path,
} from 'react-native-svg';
import { RHEMA_LOGO_PATH, RHEMA_LOGO_VIEWBOX } from './rhemaLogoPath';

interface SplashScreenProps {
  onFinish?: () => void;
}

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

      {/* ── Rhema Global Ministries Vector Branding in Dead Center ── */}
      <Animated.View style={[styles.centerContainer, { opacity: contentFade }]}>
        <View style={styles.brandScaleWrap}>
          <View style={styles.brandLogoBox}>
            <Svg width="100%" height="100%" viewBox={RHEMA_LOGO_VIEWBOX}>
              <Path d={RHEMA_LOGO_PATH} fill="#0B1F5C" fillRule="evenodd" />
            </Svg>
            <Text style={styles.brandSub} numberOfLines={1} adjustsFontSizeToFit>
              GLOBAL MINISTRIES
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  brandScaleWrap: {
    width: 210,
    height: 88,
    transform: [{ scale: 1.3 }],
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandLogoBox: {
    width: 210,
    height: 88,
  },
  brandSub: {
    position: 'absolute',
    left: 73,
    top: 67,
    width: 136,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 2.2,
    color: '#07153F',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});
