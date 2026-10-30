import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  PanResponder, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions,
  ActivityIndicator,
  Image,
  ImageBackground,
  RefreshControl,
  Alert,
  StatusBar,
  Platform,
  Share,
  Modal,
  Linking,
  Animated,
  Easing,
  Pressable,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDateDisplay, formatSermonDuration } from '../utils/DateUtils';
import { 
  Bell, 
  Hexagon,
  Book, 
  Play, 
  ChevronRight, 
  Share2, 
  Mic, 
  Heart, 
  Calendar, 
  MapPin,
  CircleDollarSign as DollarSign,
  BookOpen,
  Sparkles,
  MessageSquare,
  Users,
  MoreHorizontal,
  CheckCircle,
  Sun,
  Sunset,
  Moon,
  Award,
  Trophy,
  Music,
  Image as ImageIcon,
  FileText,
  X,
  Globe,
  Check,
  Phone,
  Mail,
  Info,
  Video,
  Download,
  Image as LucideImage,
  Clock,
  CalendarCheck,
  ArrowUpRight,
  ArrowRight
} from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import RNShare from 'react-native-share';

import firestore from '@react-native-firebase/firestore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import HexagonDate from '../components/HexagonDate';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import Theme from '../theme/Theme';
import FirestoreService, { DailyPromise, ScheduleEvent, AppMember, Sermon } from '../services/FirestoreService';
import VerseNotificationService, { DailyVerse } from '../services/VerseNotificationService';
import { BibleService } from '../services/BibleService';
import { SupportedLanguage } from '../locales';
import { CustomAlert } from '../components/CustomAlert';
import Svg, { Path, Circle, Ellipse, Rect, Polygon, Defs, LinearGradient as SvgLinearGradient, RadialGradient as SvgRadialGradient, Stop, Text as SvgText, Mask, G } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const YoutubeIcon = ({ size = 26, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.507a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.507 9.388.507 9.388.507s7.517 0 9.388-.507a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837z" />
    <Polygon points="9.5 8.5 15.5 12 9.5 15.5" fill="#ef4444" />
  </Svg>
);

const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]+)/);
  return match ? match[1] : cleanUrl;
};

const AnimatedCameraIcon = ({ size = 20, color = "#fff", scrollY, triggerY }: { size?: number, color?: string, scrollY?: Animated.Value, triggerY?: number }) => {
  const bodyTranslateX = useRef(new Animated.Value(-50)).current;
  const bodyTranslateY = useRef(new Animated.Value(-50)).current;
  const bodyRotate = useRef(new Animated.Value(-90)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;

  const lensTranslateX = useRef(new Animated.Value(50)).current;
  const lensTranslateY = useRef(new Animated.Value(50)).current;
  const lensRotate = useRef(new Animated.Value(90)).current;
  const lensOpacity = useRef(new Animated.Value(0)).current;

  const played = useRef(false);

  useEffect(() => {
    // Reset values
    bodyTranslateX.setValue(-50);
    bodyTranslateY.setValue(-50);
    bodyRotate.setValue(-90);
    bodyOpacity.setValue(0);

    lensTranslateX.setValue(50);
    lensTranslateY.setValue(50);
    lensRotate.setValue(90);
    lensOpacity.setValue(0);
    played.current = false;

    const playAnim = () => {
      if (played.current) return;
      played.current = true;
      Animated.sequence([
        Animated.delay(100),
        Animated.parallel([
          Animated.spring(bodyTranslateX, { toValue: 0, friction: 5, tension: 40, useNativeDriver: true }),
          Animated.spring(bodyTranslateY, { toValue: 0, friction: 5, tension: 40, useNativeDriver: true }),
          Animated.spring(bodyRotate, { toValue: 0, friction: 4, tension: 40, useNativeDriver: true }),
          Animated.timing(bodyOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          
          Animated.spring(lensTranslateX, { toValue: 0, friction: 5, tension: 40, useNativeDriver: true }),
          Animated.spring(lensTranslateY, { toValue: 0, friction: 5, tension: 40, useNativeDriver: true }),
          Animated.spring(lensRotate, { toValue: 0, friction: 4, tension: 40, useNativeDriver: true }),
          Animated.timing(lensOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true })
        ])
      ]).start();
    };

    let listenerId: string | undefined;

    if (scrollY && triggerY !== undefined && triggerY > 0) {
      const windowHeight = Dimensions.get('window').height;
      // Account for the ScrollView's massive top padding (~280px)
      const absoluteY = triggerY + 280;

      listenerId = scrollY.addListener(({ value }) => {
        // It enters the bottom of the screen when `value + windowHeight >= absoluteY + 50`
        // It leaves the top of the screen when `value > absoluteY`
        const isVisible = (value + windowHeight >= absoluteY + 100) && (value <= absoluteY + 50);

        if (isVisible && !played.current) {
          playAnim();
        } else if (!isVisible && played.current) {
          // Reset animation so it plays AGAIN next time it scrolls into view
          played.current = false;
          bodyTranslateX.setValue(-50);
          bodyTranslateY.setValue(-50);
          bodyRotate.setValue(-90);
          bodyOpacity.setValue(0);
          lensTranslateX.setValue(50);
          lensTranslateY.setValue(50);
          lensRotate.setValue(90);
          lensOpacity.setValue(0);
        }
      });
      
    } else if (!scrollY) {
      playAnim();
    }

    return () => {
      if (scrollY && listenerId) {
        scrollY.removeListener(listenerId);
      }
    };
  }, [scrollY, triggerY]);

  const bodySpin = bodyRotate.interpolate({
    inputRange: [-90, 0],
    outputRange: ['-90deg', '0deg']
  });
  
  const lensSpin = lensRotate.interpolate({
    inputRange: [0, 90],
    outputRange: ['0deg', '90deg']
  });

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      {/* Body Part */}
      <Animated.View style={{ 
        position: 'absolute', 
        transform: [{ translateX: bodyTranslateX }, { translateY: bodyTranslateY }, { rotate: bodySpin }],
        opacity: bodyOpacity 
      }}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Rect x="2" y="6" width="14" height="12" rx="2" />
        </Svg>
      </Animated.View>

      {/* Lens Part */}
      <Animated.View style={{ 
        position: 'absolute', 
        transform: [{ translateX: lensTranslateX }, { translateY: lensTranslateY }, { rotate: lensSpin }],
        opacity: lensOpacity 
      }}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
        </Svg>
      </Animated.View>
    </View>
  );
};

const { width, height } = Dimensions.get('window');

// Utility to strip HTML tags
const stripHtml = (html: string | undefined): string => {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').trim();
};

/* ───────────── Premium Top Section: Theme & Icons ───────────── */
const C = {
  navy: '#1b2a5e', teal: '#527a73', tealD: '#1c3834', ink: '#17302c',
  gold: '#e8c46e', goldD: '#a47c28', ivory: '#fffaf0', bg: '#faf7f2', muted: '#5d6c93',
  foil: ['#fff6d6', '#f0d58a', '#c99a3a', '#f4e0a0', '#d9b255'] as const,
};
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const HeaderSun = ({ size = 21, color = C.gold }: { size?: number, color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round">
    <Circle cx="12" cy="12" r="4" />
    <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
const HeaderSunset = ({ size = 21, color = C.gold }: { size?: number, color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round">
    <Path d="M5 18a7 7 0 0 1 14 0M12 5v3M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4M2 18h20" />
  </Svg>
);
const HeaderMoon = ({ size = 21, color = C.gold }: { size?: number, color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round">
    <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
);
const Cross = ({ w = 9, h = 12, color = C.gold }: { w?: number, h?: number, color?: string }) => (
  <Svg width={w} height={h} viewBox="0 0 24 28">
    <Path d="M9.5 0h5v8H22v5h-7.5v15h-5V13H2V8h7.5z" fill={color} />
  </Svg>
);
const BellFilled = ({ size = 20, color = C.tealD }: { size?: number, color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 2a1.5 1.5 0 0 1 1.5 1.5v.6A6.5 6.5 0 0 1 18.5 10.5c0 4.5 2 5.5 2.5 6.5H3c.5-1 2.5-2 2.5-6.5A6.5 6.5 0 0 1 10.5 4.1V3.5A1.5 1.5 0 0 1 12 2zM9.5 19h5a2.5 2.5 0 0 1-5 0z"
      fill={color}
    />
  </Svg>
);
const Corner = ({ style }: { style?: any }) => (
  <Svg width={22} height={22} viewBox="0 0 22 22" style={[{ position: 'absolute' }, style]}>
    <Path d="M1 21V9Q1 1 9 1H21" stroke={C.gold} strokeWidth={1.3} fill="none" />
    <Path d="M6 6l2.5 2.5L6 11 3.5 8.5z" fill={C.gold} />
  </Svg>
);
const ArchWindow = () => (
  <Svg width={136} height={232} viewBox="0 -14 120 214" style={gStyles.arch} fill="none" stroke={C.gold} strokeWidth={1}>
    <Path d="M6 200V84Q6 22 60 6Q114 22 114 84V200" />
    <Path d="M20 200V88Q20 32 60 18Q100 32 100 88V200" />
    <Path d="M34 200V92Q34 44 60 32Q86 44 86 92V200" />
    <Circle cx="60" cy="78" r="12" />
    <Path d="M60 66v24M48 78h24" />
    <Path d="M60 -12V2M54 -6h12" strokeWidth={1.6} />
  </Svg>
);

const DAYS_LIST = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONS_LIST = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const getGreetingData = (d: Date) => {
  const h = d.getHours();
  if (h < 12) return { text: 'Good Morning,', Icon: HeaderSun };
  if (h < 17) return { text: 'Good Afternoon,', Icon: HeaderSun };
  if (h < 21) return { text: 'Good Evening,', Icon: HeaderSunset };
  return { text: 'Good Night,', Icon: HeaderMoon };
};

const formatEventTime = (timeStr?: string, lang: 'en' | 'te' = 'en') => {
  if (!timeStr) return '';
  try {
    const timePart = timeStr.includes('T') ? timeStr.split('T')[1].split('.')[0] : timeStr;
    const [hours, minutes] = timePart.split(':');
    const h = parseInt(hours, 10);
    if (isNaN(h)) return timeStr;
    const ampmEn = h >= 12 ? 'PM' : 'AM';

    let ampmTe = '';
    if (h < 12) ampmTe = 'ఉదయం'; // Morning
    else if (h < 16) ampmTe = 'మధ్యాహ్నం'; // Afternoon
    else if (h < 20) ampmTe = 'సాయంత్రం'; // Evening
    else ampmTe = 'రాత్రి'; // Night

    const formattedHours = h % 12 || 12;
    if (lang === 'te') {
      return `${ampmTe} ${formattedHours}:${minutes}`;
    }
    return `${formattedHours}:${minutes} ${ampmEn}`;
  } catch {
    return timeStr;
  }
};

/* ───────────── floating gold dust ───────────── */
const Dust = () => {
  const specks = useMemo(
    () => Array.from({ length: 12 }, (_, k) => ({
      left: `${6 + k * 8}%`, dur: 7000 + (k % 5) * 1600, delay: k * 900, drift: (k % 2 ? 1 : -1) * (8 + (k % 4) * 6),
      v: new Animated.Value(0),
    })), []);
  useEffect(() => {
    const loops = specks.map((s) => Animated.loop(Animated.sequence([
      Animated.delay(s.delay),
      Animated.timing(s.v, { toValue: 1, duration: s.dur, easing: Easing.linear, useNativeDriver: true }),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [specks]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {specks.map((s, i) => (
        <Animated.View
          key={i}
          style={[gStyles.speck, {
            left: s.left as any,
            opacity: s.v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
            transform: [
              { translateY: s.v.interpolate({ inputRange: [0, 1], outputRange: [0, -230] }) },
              { translateX: s.v.interpolate({ inputRange: [0, 1], outputRange: [0, s.drift] }) },
            ],
          }]}
        />
      ))}
    </View>
  );
};

/* ───────────── greeting card ───────────── */
export const GreetingCard = ({ userName = 'Prabhakar Yeddula' }: { userName?: string }) => {
  const now = useMemo(() => new Date(), []);
  const { text: greet, Icon } = getGreetingData(now);
  const [first, ...rest] = (userName || 'Beloved').trim().split(/\s+/);
  const last = rest.join(' ');

  // entrance, tilt, glare, sheen
  const enter = useRef(new Animated.Value(0)).current;
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;
  const glareX = useRef(new Animated.Value(0)).current;
  const glareY = useRef(new Animated.Value(0)).current;
  const glareO = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const size = useRef({ w: 360, h: 204 });

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(3500),
      Animated.timing(sheen, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [enter, sheen]);

  const spring = (v: Animated.Value, to: number) => Animated.spring(v, { toValue: to, friction: 7, tension: 80, useNativeDriver: true }).start();
  const onTouch = (e: any) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const { w, h } = size.current;
    const nx = Math.min(Math.max(x / w, 0), 1), ny = Math.min(Math.max(y / h, 0), 1);
    spring(tiltY, (nx - 0.5) * 2);   // -1..1
    spring(tiltX, (0.5 - ny) * 2);
    glareX.setValue(nx * w - 110); glareY.setValue(ny * h - 110);
    spring(glareO, 1);
  };
  const onRelease = () => { spring(tiltX, 0); spring(tiltY, 0); spring(glareO, 0); };

  return (
    <Animated.View
      onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
      onTouchStart={onTouch} onTouchMove={onTouch} onTouchEnd={onRelease} onTouchCancel={onRelease}
      style={[gStyles.cardWrap, {
        opacity: enter,
        transform: [
          { perspective: 900 },
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          { rotateX: tiltX.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] }) },
          { rotateY: tiltY.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }) },
        ],
      }]}
    >
      {/* gold foil border */}
      <LinearGradient colors={C.foil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={gStyles.foilBorder}>
        <View style={gStyles.cardInner}>
          <LinearGradient colors={['#4f8076', '#2d5750', '#15302c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* warm light top-left */}
          <View style={[gStyles.glow, { width: 300, height: 300, top: -170, left: -150, backgroundColor: 'rgba(255,232,160,0.10)' }]} />
          <View style={[gStyles.glow, { width: 190, height: 190, top: -100, left: -90, backgroundColor: 'rgba(255,232,160,0.12)' }]} />
          <ArchWindow />
          <Dust />

          {/* sheen sweep */}
          <Animated.View
            pointerEvents="none"
            style={[gStyles.sheen, { transform: [{ translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-120, 480] }) }, { rotate: '18deg' }] }]}
          >
            <LinearGradient colors={['transparent', 'rgba(255,240,190,0.22)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>

          {/* inner frame + corner ornaments */}
          <View pointerEvents="none" style={gStyles.innerFrame} />
          <Corner style={{ left: 10, top: 10 }} />
          <Corner style={{ right: 10, top: 10, transform: [{ scaleX: -1 }] }} />
          <Corner style={{ left: 10, bottom: 10, transform: [{ scaleY: -1 }] }} />
          <Corner style={{ right: 10, bottom: 10, transform: [{ scaleX: -1 }, { scaleY: -1 }] }} />

          {/* content */}
          <View style={gStyles.cardRow}>
            <View style={{ flex: 1 }}>
              <View style={gStyles.eyeRow}>
                <LinearGradient colors={['rgba(232,196,110,0)', C.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gStyles.eyeLine} />
                <Text style={gStyles.eye}>BELOVED IN CHRIST</Text>
              </View>
              <View style={gStyles.greetRow}>
                <Icon />
                <Text style={gStyles.greet}>{greet}</Text>
              </View>
              <Text style={gStyles.name}>{first}</Text>
              {!!last && <Text style={gStyles.name}>{last}</Text>}

              <View style={gStyles.rule}>
                <LinearGradient colors={['rgba(232,196,110,0)', C.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gStyles.ruleLine} />
                <View style={gStyles.diamond} />
                <LinearGradient colors={[C.gold, 'rgba(232,196,110,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gStyles.ruleLine} />
              </View>

              <View style={gStyles.blessed}>
                <LinearGradient colors={C.foil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={gStyles.blessedCoin}>
                  <Cross w={8} h={11} color="#3a2a06" />
                </LinearGradient>
                <Text style={gStyles.blessedText}>Blessed {DAYS_LIST[now.getDay()]}</Text>
              </View>
            </View>

            {/* calendar card */}
            <View style={gStyles.cal}>
              <LinearGradient colors={['#ffe5cd', '#ffd9b8']} style={gStyles.calMonthBox}>
                <Text style={gStyles.calMonth}>{MONS_LIST[now.getMonth()]}</Text>
              </LinearGradient>
              <Text style={gStyles.calDay}>{now.getDate()}</Text>
              <Text style={gStyles.calWeek}>{DAYS_LIST[now.getDay()]}</Text>
            </View>
          </View>

          {/* glare that follows the finger */}
          <Animated.View
            pointerEvents="none"
            style={[gStyles.glare, { opacity: glareO, transform: [{ translateX: glareX }, { translateY: glareY }] }]}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

/* ───────────── events ticker ───────────── */
const TICKER_SPEED = 38; // px per second

const TodayBadge = () => {
  const ring = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const r = Animated.loop(Animated.sequence([
      Animated.delay(2000),
      Animated.timing(ring, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    r.start(); p.start();
    return () => { r.stop(); p.stop(); };
  }, [ring, pulse]);
  const rotate = ring.interpolate({
    inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1],
    outputRange: ['0deg', '16deg', '-14deg', '10deg', '-6deg', '3deg', '-1deg', '0deg'],
  });
  return (
    <View style={gStyles.fix}>
      <View style={gStyles.badgeRow}>
        <LinearGradient colors={C.foil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={gStyles.medal}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <BellFilled size={14} color={C.tealD} />
          </Animated.View>
        </LinearGradient>
        <View style={gStyles.ribbon}>
          <Svg width={86} height={30} viewBox="0 0 112 38" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id="todayGoldGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#fff0bc" /><Stop offset="50%" stopColor="#e5be64" /><Stop offset="100%" stopColor="#a37624" />
              </SvgLinearGradient>
              <SvgLinearGradient id="todayGreenGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#41736a" /><Stop offset="100%" stopColor="#142c28" />
              </SvgLinearGradient>
            </Defs>
            {/* Ultra-sharp chevron arrow point with crisp metallic gold rim */}
            <Path d="M0 0H94L112 19L94 38H0Z" fill="url(#todayGoldGrad)" />
            <Path d="M1.6 1.6H93.2L109.2 19L93.2 36.4H1.6Z" fill="url(#todayGreenGrad)" />
          </Svg>
          <Animated.View style={[gStyles.liveDot, { opacity: pulse }]} />
          <Text style={gStyles.todayText}>TODAY</Text>
        </View>
      </View>
    </View>
  );
};

export const EventsTicker = ({
  events = [],
  onSeeAll,
  onEventPress,
}: {
  events?: any[];
  onSeeAll?: () => void;
  onEventPress?: (event: any) => void;
}) => {
  const x = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const [setW, setSetW] = useState(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (setW > 0) {
      animRef.current?.stop();
      x.setValue(0);
      const duration = (setW / TICKER_SPEED) * 1000;
      animRef.current = Animated.loop(
        Animated.timing(x, {
          toValue: -setW,
          duration: Math.max(3000, duration),
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animRef.current.start();
    }
    return () => {
      animRef.current?.stop();
    };
  }, [setW]);

  useEffect(() => {
    const l = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [shimmer]);

  const renderSet = (key: string, measure?: boolean) => (
    <View key={key} style={gStyles.set} onLayout={measure ? (e) => setSetW(e.nativeEvent.layout.width) : undefined}>
      {events.map((ev: any, i: number) => (
        <TouchableOpacity
          key={`${key}-${i}`}
          style={gStyles.item}
          onPress={() => onEventPress ? onEventPress(ev) : onSeeAll?.()}
          activeOpacity={0.75}
        >
          {/* English block */}
          <Text style={gStyles.itemTitle}>{ev.title}</Text>
          <View style={gStyles.timeCap}>
            <Text style={gStyles.timeText}>⏰ {ev.time}</Text>
          </View>

          {/* Telugu block — always shown */}
          {ev.titleTelugu ? (
            <>
              <Text style={gStyles.langDivider}>|</Text>
              <Text style={gStyles.itemTitleTe}>{ev.titleTelugu}</Text>
              <View style={[gStyles.timeCap, { borderColor: 'rgba(74, 122, 113, 0.45)', backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                <Text style={[gStyles.timeText, { color: C.tealD }]}>⏰ {ev.timeTelugu || ev.time}</Text>
              </View>
            </>
          ) : null}

          <View style={gStyles.sep} />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={gStyles.mq}>
      {/* top gold rule with travelling glint */}
      <LinearGradient colors={['#fff7dc', '#f1dc9b']} style={[gStyles.rule5, { top: 0 }]}>
        <Animated.View style={{ width: 120, height: 5, transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 440] }) }] }}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.95)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      </LinearGradient>

      <View style={gStyles.mqHead}>
        <Text style={{ fontSize: 16 }}>🎉</Text>
        <Text style={gStyles.mqTitle}>UPCOMING EVENTS</Text>
        <LinearGradient colors={['#c9a24a', 'rgba(201,162,74,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gStyles.mqLine} />
        <Pressable onPress={onSeeAll} style={gStyles.seeAll} hitSlop={8}>
          <Text style={gStyles.seeAllText}>See all</Text>
          <ArrowRight size={13} color={C.teal} />
        </Pressable>
      </View>

      <View style={gStyles.row}>
        {/* Ticker viewport: text scrolls strictly next to the sharp badge */}
        <View style={gStyles.tickerViewport}>
          <Animated.View style={[gStyles.track, { transform: [{ translateX: x }] }]}>
            {renderSet('a', true)}
            {renderSet('b', false)}
          </Animated.View>
          <LinearGradient colors={['rgba(251,243,221,0)', '#fbf3dd']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gStyles.fadeRight} pointerEvents="none" />
          <LinearGradient colors={['#fbf3dd', 'rgba(251,243,221,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gStyles.fadeLeft} pointerEvents="none" />
        </View>

        {/* Clean, sharp Today badge only — NO card or rectangle behind it */}
        <TodayBadge />
      </View>

      <LinearGradient colors={['#f1dc9b', '#fff7dc']} style={[gStyles.rule5, { bottom: 0 }]} />
    </View>
  );
};

/* ───────────── styles for greeting card & ticker ───────────── */
const gStyles = StyleSheet.create({
  cardWrap: { borderRadius: 30, backgroundColor: '#2d5750', elevation: 14, shadowColor: '#15302c', shadowOpacity: 0.42, shadowRadius: 20, shadowOffset: { width: 0, height: 14 } },
  foilBorder: { borderRadius: 30, padding: 1.5 },
  cardInner: { borderRadius: 28.5, overflow: 'hidden', minHeight: 204 },
  glow: { position: 'absolute', borderRadius: 999 },
  arch: { position: 'absolute', right: 2, top: -6, opacity: 0.34 },
  speck: { position: 'absolute', bottom: -8, width: 3, height: 3, borderRadius: 2, backgroundColor: '#ffe9a8', shadowColor: '#ffe28c', shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  sheen: { position: 'absolute', top: -40, bottom: -40, width: 90 },
  innerFrame: { position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(232,196,110,0.28)' },
  glare: { position: 'absolute', left: 0, top: 0, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,244,200,0.14)' },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 26, paddingLeft: 26, paddingRight: 18, gap: 12 },
  eyeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  eyeLine: { width: 22, height: 1 },
  eye: { color: C.gold, fontSize: 9.5, fontWeight: '600', letterSpacing: 3 },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  greet: { color: '#f3e3b4', fontFamily: SERIF, fontStyle: 'italic', fontSize: 17.5 },
  name: { color: '#fbe9b4', fontFamily: SERIF, fontWeight: '700', fontSize: 30, lineHeight: 34, letterSpacing: -0.2, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 5 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15, marginBottom: 14, width: 90 },
  ruleLine: { flex: 1, height: 1 },
  diamond: { width: 6, height: 6, backgroundColor: '#f0d58a', transform: [{ rotate: '45deg' }] },
  blessed: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, paddingLeft: 7, paddingRight: 16, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(232,196,110,0.65)', backgroundColor: 'rgba(255,255,255,0.08)' },
  blessedCoin: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  blessedText: { color: '#fff3cf', fontSize: 12, fontWeight: '500', letterSpacing: 0.8 },

  cal: { width: 92, borderRadius: 22, overflow: 'hidden', backgroundColor: '#fff', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, borderWidth: 3, borderColor: 'rgba(232,196,110,0.45)' },
  calMonthBox: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 8, paddingBottom: 7 },
  calMonth: { color: '#e8590c', fontSize: 13, fontWeight: '700', letterSpacing: 2.5 },
  calDay: { color: C.navy, fontSize: 35, fontWeight: '800', lineHeight: 40, paddingTop: 5 },
  calWeek: { color: '#2c3b6b', fontSize: 13, fontWeight: '500', paddingTop: 2, paddingBottom: 12 },

  mq: {
    backgroundColor: '#fbf3dd',
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#5a3c0a',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,0.45)',
  },
  rule5: { position: 'absolute', left: 0, right: 0, height: 4, overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#c9a24a', zIndex: 5 },
  mqHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 7, paddingBottom: 6 },
  mqTitle: { color: C.goldD, fontSize: 10.5, fontWeight: '700', letterSpacing: 2.2 },
  mqLine: { flex: 1, height: 1 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeAllText: { color: C.teal, fontSize: 11, fontWeight: '600' },
  row: { height: 44, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(201,162,74,0.5)', justifyContent: 'center' },
  tickerViewport: { position: 'absolute', left: 102, right: 0, top: 0, bottom: 0, overflow: 'hidden', justifyContent: 'center' },
  track: { flexDirection: 'row', alignItems: 'center' },
  set: { flexDirection: 'row', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  itemTitle: { color: '#0B1938', fontWeight: '800', fontSize: 14.5, letterSpacing: -0.2 },
  itemTitleTe: { color: '#1c3834', fontWeight: '700', fontSize: 13.5, letterSpacing: -0.1 },
  langDivider: { color: 'rgba(164, 124, 40, 0.45)', fontSize: 13, marginHorizontal: 3, fontWeight: '300' },
  timeCap: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(164,124,40,0.5)', backgroundColor: 'rgba(255,255,255,0.6)' },
  timeText: { color: C.goldD, fontFamily: SERIF, fontStyle: 'italic', fontSize: 12 },
  sep: { width: 6, height: 6, marginLeft: 12, marginRight: 24, backgroundColor: '#e0bb62', transform: [{ rotate: '45deg' }] },
  fadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 32, zIndex: 5 },
  fadeLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 22, zIndex: 5 },
  fix: { position: 'absolute', left: 6, top: 0, bottom: 0, justifyContent: 'center', zIndex: 20 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  medal: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 2, borderWidth: 1.5, borderColor: '#fff6d6', elevation: 4, shadowColor: '#15302c', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 3 } },
  ribbon: { width: 86, height: 30, marginLeft: -13, flexDirection: 'row', alignItems: 'center', paddingLeft: 18 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#ff6a5c', marginRight: 5, shadowColor: '#ff6a5c', shadowOpacity: 0.9, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } },
  todayText: { color: '#f4e0a0', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
});


// --- Memory Cache for Instant Navigation ---
let cachedPromise: DailyPromise | null = null;
let cachedPromiseThumbnail: string | null = null;
let cachedTodayEvents: ScheduleEvent[] = [];
let cachedEvents: ScheduleEvent[] = [];
let cachedLatestSermon: Sermon | null = null;
let cachedLatestPrayer: any | null = null;
let cachedPrayerCount: number = 0;
let cachedTodayFourVerses: DailyVerse[] = [];

const AnimatedParticle = ({ left, size, duration, delay, color, opacity }: any) => {
  const translateY = React.useRef(new Animated.Value(0)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(translateY, { toValue: 20, duration: 0, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 0, duration: 0, useNativeDriver: true })
        ]),
        Animated.parallel([
          Animated.timing(translateY, { toValue: -150, duration: duration, easing: Easing.linear, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(fadeAnim, { toValue: opacity, duration: duration * 0.3, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: opacity, duration: duration * 0.4, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 0, duration: duration * 0.3, useNativeDriver: true })
          ])
        ])
      ])
    );
    const timeout = setTimeout(() => {
      anim.start();
    }, delay || 0);
    return () => { clearTimeout(timeout); anim.stop(); };
  }, []);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          borderRadius: size / 2,
          left: left,
          width: size,
          height: size,
          backgroundColor: color || '#FCD34D',
          opacity: fadeAnim,
          transform: [{ translateY }],
          bottom: '0%'
        }
      ]}
    />
  );
};

let hasShownCelebrationThisSession = false; /* forced refresh */ // Reset by script

// ── Daily Verse Card ───────────────────────────────────────────────────────
// Curated daily shades for each period (rotates each day of the year)
const MORNING_ORANGE_SHADES = [
  '#f97316', // Sunrise Vibrant Orange
  '#fb923c', // Tangerine Glow
  '#ff6b35', // Warm Coral Orange
  '#f59e0b', // Amber Sun Orange
  '#ff7a00', // Electric Sunset Orange
  '#ea580c', // Warm Autumn Rust
  '#f9844a', // Terracotta Dawn
  '#fdba74', // Radiant Apricot
  '#ff5722', // Deep Sunrise Flame
  '#f77f00', // Marigold Orange
  '#d97706', // Honey Gold Orange
  '#fc5c65', // Sunset Coral
  '#e65100', // Rich Deep Orange
  '#ff9f43', // Golden Tangerine
];

const AFTERNOON_BLUE_SHADES = [
  '#3b82f6', // Vivid Afternoon Blue
  '#2563eb', // Royal Cobalt Blue
  '#0284c7', // Deep Ocean Blue
  '#1d4ed8', // Sapphire Blue
  '#0ea5e9', // Horizon Blue
  '#4f46e5', // Indigo Azure
  '#6366f1', // Electric Iris Blue
  '#2980b9', // Belize Blue
  '#3498db', // Summer Sky Blue
  '#1e40af', // Midnight Blue
  '#0984e3', // Electronic Ocean
  '#4338ca', // Deep Royal Blue
  '#5352ed', // Neon Blue
  '#3c40c6', // Majestic Cobalt
];

const EVENING_PURPLE_SHADES = [
  '#a855f7', // Twilight Purple
  '#9333ea', // Deep Amethyst
  '#c084fc', // Radiant Orchid
  '#8b5cf6', // Electric Violet
  '#d946ef', // Fuchsia Twilight
  '#7c3aed', // Imperial Purple
  '#a21caf', // Sunset Berry
  '#e879f9', // Lilac Glow
  '#8e44ad', // Wisteria Purple
  '#6c5ce7', // Exotic Iris
  '#b83280', // Plum Twilight
  '#9b59b6', // Amethyst Dusk
  '#be185d', // Velvet Dusk
  '#706fd3', // Lavender Nightfall
];

const NIGHT_SKYBLUE_SHADES = [
  '#38bdf8', // Luminous Sky Blue
  '#06b6d4', // Cyan Sky
  '#22d3ee', // Electric Ice Sky
  '#0ea5e9', // Clear Sky Blue
  '#67e8f9', // Glacier Blue
  '#00cec9', // Robin Egg Cyan
  '#7dd3fc', // Celestial Azure
  '#00d2d3', // Neon Sky Turquoise
  '#2bcbba', // Aqua Marine Sky
  '#48dbfb', // Vibrant Ice Sky
  '#1dd1a1', // Breeze Aqua
  '#54a0ff', // Clear Daybreak Sky
  '#0abde3', // Pacific Sky
  '#81ecec', // Crystal Sky
];

const getDayIndex = (date: Date = new Date()): number => {
  const epoch = new Date('2026-10-30T00:00:00Z');
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((target.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
  return Math.abs(diffDays);
};

export const getPeriodGreeting = (period: string, t?: any): string => {
  if (!t) return `Good ${period}`;
  const p = (period || '').toLowerCase();
  if (p.includes('morning')) return t('home.greetingMorning');
  if (p.includes('afternoon')) return t('home.greetingAfternoon');
  if (p.includes('evening')) return t('home.greetingEvening');
  if (p.includes('night')) return t('home.greetingNight');
  return `Good ${period}`;
};

export interface LocalizedVerseDisplay {
  primaryVerse: string;
  primaryReference: string;
  secondaryVerse?: string;
  secondaryReference?: string;
  isAvailableInLanguage: boolean;
}

export const getLocalizedVerse = (verse: any, lang: string): LocalizedVerseDisplay => {
  if (!verse) {
    return { primaryVerse: '', primaryReference: '', isAvailableInLanguage: false };
  }

  // 1. If language is English ('en')
  if (lang === 'en') {
    // When English is selected, display both Telugu and English on the card if Telugu is available
    if (verse.verseTe && verse.verseTe.trim().length > 0) {
      return {
        primaryVerse: verse.verseTe.trim(),
        primaryReference: verse.referenceTe || '',
        secondaryVerse: (verse.verseEn || verse.verse || '').trim(),
        secondaryReference: verse.referenceEn || verse.reference || '',
        isAvailableInLanguage: true,
      };
    }
    return {
      primaryVerse: verse.verseEn || verse.verse || '',
      primaryReference: verse.referenceEn || verse.reference || '',
      isAvailableInLanguage: true,
    };
  }

  // 2. Check direct language-specific fields on the verse:
  // e.g., verseTe / referenceTe, verseHi / referenceHi, verseTa / referenceTa, etc.
  const cap = lang.charAt(0).toUpperCase() + lang.slice(1);
  const directVerse = verse[`verse${cap}`] || verse[`verse_${lang}`] || verse.translations?.[lang]?.verse || (typeof verse.translations?.[lang] === 'string' ? verse.translations[lang] : undefined);
  const directRef = verse[`reference${cap}`] || verse[`reference_${lang}`] || verse.translations?.[lang]?.reference;

  if (directVerse && typeof directVerse === 'string' && directVerse.trim().length > 0) {
    const locRef = directRef || BibleService.getLocalizedReference(verse.referenceEn || verse.reference || '', lang as any) || verse.referenceEn || '';
    return {
      primaryVerse: directVerse.trim(),
      primaryReference: locRef,
      secondaryVerse: verse.verseEn ? verse.verseEn.trim() : undefined,
      secondaryReference: verse.referenceEn || '',
      isAvailableInLanguage: true,
    };
  }

  // 3. If selected language is Telugu ('te') and verse.verseTe is present
  if (lang === 'te' && verse.verseTe && verse.verseTe.trim().length > 0) {
    const teRef = verse.referenceTe || BibleService.getLocalizedReference(verse.referenceEn || verse.reference || '', 'te') || verse.referenceEn || '';
    return {
      primaryVerse: verse.verseTe.trim(),
      primaryReference: teRef,
      secondaryVerse: verse.verseEn ? verse.verseEn.trim() : undefined,
      secondaryReference: verse.referenceEn || '',
      isAvailableInLanguage: true,
    };
  }

  // 4. If selected language verse text is still fetching / not directly stored,
  // dynamically localize the reference (e.g. "Psalms 78:52" -> "भजन संहिता 78:52")
  // and fall back cleanly to original English verse without machine-translating:
  const localizedRef = BibleService.getLocalizedReference(verse.referenceEn || verse.reference || '', lang as any);
  return {
    primaryVerse: verse.verseEn || verse.verse || '',
    primaryReference: localizedRef || verse.referenceEn || verse.reference || '',
    isAvailableInLanguage: false,
  };
};

export const getPeriodTheme = (period: string, date: Date = new Date(), t?: any) => {
  const dayIdx = getDayIndex(date);
  const greeting = t ? getPeriodGreeting(period, t) : `Good ${period}`;
  if (period === 'Morning') {
    const color = MORNING_ORANGE_SHADES[dayIdx % MORNING_ORANGE_SHADES.length];
    return { Icon: Sun, color, greeting };
  } else if (period === 'Afternoon') {
    const color = AFTERNOON_BLUE_SHADES[dayIdx % AFTERNOON_BLUE_SHADES.length];
    return { Icon: Sun, color, greeting };
  } else if (period === 'Evening') {
    const color = EVENING_PURPLE_SHADES[dayIdx % EVENING_PURPLE_SHADES.length];
    return { Icon: Sunset, color, greeting };
  } else {
    const color = NIGHT_SKYBLUE_SHADES[dayIdx % NIGHT_SKYBLUE_SHADES.length];
    return { Icon: Moon, color, greeting };
  }
};

const PERIOD_COLORS: Record<string, string[]> = {
  get Morning() { return [getPeriodTheme('Morning').color, '#ea580c']; },
  get Afternoon() { return [getPeriodTheme('Afternoon').color, '#1d4ed8']; },
  get Evening() { return [getPeriodTheme('Evening').color, '#7e22ce']; },
  get Night() { return [getPeriodTheme('Night').color, '#0284c7']; },
};

/**
 * Progressive time-based unlock for Daily Verses:
 * - 12:00 AM – 11:59 AM (hour < 12) : 1 card  (Good Morning)
 * - 12:00 PM –  4:59 PM (hour < 17) : 2 cards (Good Morning + Good Afternoon)
 * -  5:00 PM –  7:59 PM (hour < 20) : 3 cards (Good Morning + Good Afternoon + Good Evening)
 * -  8:00 PM – 11:59 PM (hour >= 20): 4 cards (Good Morning + Good Afternoon + Good Evening + Good Night)
 */
const getUnlockedVersesCount = (date: Date = new Date()): number => {
  const hour = date.getHours();
  if (hour < 12) return 1; // 12:00 AM - 11:59 AM
  if (hour < 17) return 2; // 12:00 PM - 4:59 PM
  if (hour < 20) return 3; // 5:00 PM - 7:59 PM
  return 4;                // 8:00 PM - 11:59 PM
};

const getCurrentPeriod = (date: Date = new Date()): string => {
  const hour = date.getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 20) return 'Evening';
  return 'Night';
};

const VERSE_PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];
const VERSE_THEMES: Record<string, { Icon: any; color: string; greeting: string }> = {
  get Morning() { return getPeriodTheme('Morning'); },
  get Afternoon() { return getPeriodTheme('Afternoon'); },
  get Evening() { return getPeriodTheme('Evening'); },
  get Night() { return getPeriodTheme('Night'); },
};

const getDynamicGradient = (date: Date, period: string, periodIndex: number): readonly [string, string, ...string[]] => {
  const theme = getPeriodTheme(period, date);
  const color = theme.color;
  if (period === 'Morning') {
    return ['#7c2d12', color];
  } else if (period === 'Afternoon') {
    return ['#172554', color];
  } else if (period === 'Evening') {
    return ['#3b0764', color];
  } else {
    return ['#082f49', color];
  }
};

const DailyVerseCard = ({ verse, period, onPress }: { verse: DailyVerse | null; period: string; onPress: () => void }) => {
  const { language, t } = useLanguage();
  if (!verse) return null;
  const colors = PERIOD_COLORS[period] || PERIOD_COLORS.Morning;
  const loc = getLocalizedVerse(verse, language);
  const greeting = getPeriodGreeting(period, t);
  const cardTitle = `🕊️  ${greeting.toUpperCase()} · ${t('home.quickDailyVerse').toUpperCase()}`;

  const cardContent = (
    <>
      {/* Decorative circles */}
      <View style={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130, borderRadius: 65, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' }} />
      <View style={{ position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>
          {cardTitle}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' }}>
          {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>
      <Text numberOfLines={3} style={{
        color: '#fff', fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        fontWeight: '700', lineHeight: 24, marginBottom: loc.secondaryVerse && loc.secondaryVerse !== loc.primaryVerse ? 6 : 10,
      }}>
        “{loc.primaryVerse}”
      </Text>
      {loc.secondaryVerse && loc.secondaryVerse !== loc.primaryVerse ? (
        <Text numberOfLines={3} style={{
          color: 'rgba(255,255,255,0.92)', fontSize: 15, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
          fontStyle: 'italic', lineHeight: 22, fontWeight: '500', marginBottom: 10,
        }}>
          “{loc.secondaryVerse}”
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' }}>
          — {loc.secondaryReference && loc.secondaryReference !== loc.primaryReference ? `${loc.primaryReference}   —   ${loc.secondaryReference}` : loc.primaryReference}
        </Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
        }}>
          <BookOpen size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('home.readFullVerse')}</Text>
        </View>
      </View>
    </>
  );

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ marginHorizontal: 0, marginBottom: 20 }}>
      {verse.backgroundUrl ? (
        <ImageBackground
          source={{ uri: verse.backgroundUrl }}
          style={{
            borderRadius: 20, padding: 20, overflow: 'hidden',
            shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
          }}
          imageStyle={{ borderRadius: 20 }}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
            style={StyleSheet.absoluteFillObject}
          />
          {cardContent}
        </ImageBackground>
      ) : (
        <LinearGradient colors={colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{
          borderRadius: 20, padding: 20, overflow: 'hidden',
          shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
        }}>
          {cardContent}
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { user, signOut, member: authMember } = useAuth();
  const { activeChurch, isImpersonating, impersonatedBranchName, stopImpersonation } = useChurch();
  const { mode, toggleTheme, colors } = useTheme();
  const isDark = false; // Home screen uses a clean white cream background
  const { language, setLanguage, languages, t } = useLanguage();
  const [member, setMember] = useState<AppMember | null>(authMember as AppMember | null);
  const [promise, setPromise] = useState<DailyPromise | null>(cachedPromise);
  const [todayEvents, setTodayEvents] = useState<ScheduleEvent[]>(cachedTodayEvents);
  const [events, setEvents] = useState<ScheduleEvent[]>(cachedEvents);
  const [latestSermon, setLatestSermon] = useState<Sermon | null>(cachedLatestSermon);
  const [latestPrayer, setLatestPrayer] = useState<any | null>(cachedLatestPrayer);
  const [prayerCount, setPrayerCount] = useState(cachedPrayerCount);
  const [loading, setLoading] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dynamicHeaderHeight, setDynamicHeaderHeight] = useState(0);
  const [todayVerse, setTodayVerse] = useState<DailyVerse | null>(null);
  const [todayPeriod, setTodayPeriod] = useState<string>(getCurrentPeriod());
  // Floating Live Celebrations State
  const [liveCelebrations, setLiveCelebrations] = useState<any[]>([]);
  const [unreadLiveMsgs, setUnreadLiveMsgs] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const emojiAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const curveLineAnim = useRef(new Animated.Value(0)).current;
  const [currentEmojiIdx, setCurrentEmojiIdx] = useState(0);
  const bellRingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(bellRingAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(bellRingAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bellRingAnim]);

  const bellRotate = bellRingAnim.interpolate({
    inputRange: [0, 0.12, 0.25, 0.38, 0.52, 0.66, 0.8, 1],
    outputRange: ['0deg', '-18deg', '16deg', '-12deg', '8deg', '-4deg', '2deg', '0deg'],
  });

  // Load today's daily verse
  useEffect(() => {
    const period = getCurrentPeriod();
    setTodayPeriod(period);
    VerseNotificationService.getVerseForDate(new Date(), period).then(async v => {
      if (v) {
        if (language !== 'en') {
          const lv = await VerseNotificationService.localizeVerse(v, language as any);
          setTodayVerse(lv);
        } else {
          setTodayVerse(v);
        }
      }
    }).catch(() => {});
  }, [language]);

  const fetchLiveCelebrations = async () => {
    if (!activeChurch?.id) return;
    try {
      const FirestoreService = require('../services/FirestoreService').default;
      const allCelebs = await FirestoreService.getAllCelebrations(activeChurch.id);
      
      const today = new Date();
      const m = today.getMonth() + 1;
      const d = today.getDate();
      
      const todays = allCelebs.filter((c: any) => {
        let isCeleb = false;
        ['dob', 'anniversaryDate', 'baptismDate'].forEach(field => {
          if (c[field]) {
            const parts = c[field].split('-');
            let mm, dd;
            if (parts[0].length === 4) { mm = parseInt(parts[1], 10); dd = parseInt(parts[2], 10); } 
            else { dd = parseInt(parts[0], 10); mm = parseInt(parts[1], 10); }
            if (mm === m && dd === d) isCeleb = true;
          }
        });
        return isCeleb;
      });
      
      
      // Bulletproof check for the current user's own birthday
      const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const isToday = (dateString?: string) => {
        if (!dateString) return false;
        const datePart = dateString.split('T')[0];
        const parts = datePart.split(/[-/]/);
        if (parts.length >= 3) {
          let mm, dd;
          if (parts[0].length === 4) {
            mm = parts[1].padStart(2, '0');
            dd = parts[2].padStart(2, '0');
          } else {
            dd = parts[0].padStart(2, '0');
            mm = parts[1].padStart(2, '0');
          }
          return `${mm}-${dd}` === todayMonthDay;
        }
        return false;
      };

      if (member) {
        const isSelfBirthday = isToday((member as any).dob);
        if (isSelfBirthday) {
          const alreadyInTodays = todays.some((t: any) => t.Id === (member as any).id || t.Phone === (member as any).phone);
          if (!alreadyInTodays) {
            todays.push({
              ...member,
              Id: (member as any).id || 'self',
              Name: (member as any).name || (member as any).firstName || 'Member',
              dob: (member as any).dob,
              isSelf: true
            });
          }
        }
      }

      setLiveCelebrations(todays);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLiveCelebrations();
  }, [activeChurch?.id, member]);

  useFocusEffect(
    React.useCallback(() => {
      // Refresh current time on focus to unlock new time-based cards immediately
      setCurrentTime(new Date());

      // Always re-fetch the latest server daily promise on screen focus to ensure zero stale cache
      FirestoreService.getDailyPromise(true).then((fresh) => {
        if (fresh) {
          cachedPromise = fresh;
          setPromise(fresh);
          AsyncStorage.setItem('@cached_daily_promise', JSON.stringify(fresh));
          cachedPromiseThumbnail = fresh.imageUrl || null;
          setPromiseThumbnail(fresh.imageUrl || null);
        }
      }).catch(() => {});

      // Always re-fetch the latest published sermon on screen focus to ensure zero stale cache
      FirestoreService.getLatestSermon().then((fresh) => {
        if (fresh) {
          cachedLatestSermon = fresh;
          setLatestSermon(fresh);
        }
      }).catch(() => {});

      if (liveCelebrations.length === 0 || !activeChurch?.id) return;

      const todayStr = new Date().toISOString().split('T')[0];
      const unsubscribe = firestore()
        .collection('Rhema Church')
        .doc(activeChurch.id)
        .collection('live_celebrations')
        .doc(todayStr)
        .collection('messages')
        .onSnapshot(async (snapshot) => {
          if (!snapshot) return;
          const lastRead = await AsyncStorage.getItem(`@lastReadCeleb_${todayStr}`);
          const lastReadTime = lastRead ? parseInt(lastRead, 10) : 0;
          
          let unread = 0;
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const msgTime = data.createdAt?.toMillis?.() || (typeof data.createdAt === 'number' ? data.createdAt : 0);
            if (msgTime > lastReadTime) {
              unread++;
            }
          });
          setUnreadLiveMsgs(unread);
        });
        
      return () => unsubscribe();
    }, [liveCelebrations.length, activeChurch?.id])
  );
  
  // Load saved position (Commented out to reset position)
    /*
    AsyncStorage.getItem('@live_celebrations_pos').then(val => {
      if (val) {
        try {
          const { x, y } = JSON.parse(val);
          if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y) && Math.abs(x) < 2000 && Math.abs(y) < 2000) {
            pan.setValue({ x, y });
          } else {
             AsyncStorage.removeItem('@live_celebrations_pos');
          }
        } catch (e) {}
      }
    });
    */
  useEffect(() => {
    if (liveCelebrations.length === 0) return;
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(emojiAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(emojiAnim, { toValue: 0, duration: 250, useNativeDriver: true })
      ]).start(() => {
        setCurrentEmojiIdx(prev => (prev + 1) % 4);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [liveCelebrations.length]);

  useEffect(() => {
    if (liveCelebrations.length === 0) return;
    const wave = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(waveAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        Animated.delay(1500)
      ])
    );
    wave.start();
    return () => wave.stop();
  }, [liveCelebrations.length]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(curveLineAnim, {
        toValue: 1,
        duration: 12000, // Doubled to maintain speed since travel distance is much larger
        easing: Easing.linear, // Prevents jumping/stuttering from default ease-in-out
        useNativeDriver: false,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, gestureState) => Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gesture) => {
        pan.flattenOffset();
        AsyncStorage.setItem('@live_celebrations_pos', JSON.stringify({ x: (pan.x as any)._value, y: (pan.y as any)._value }));
      }
    })
  ).current;

  const getEmoji = () => {
    const emojis = ['🎂', '💍', '💧', '🎉'];
    return emojis[currentEmojiIdx];
  };

  const [activeMeeting, setActiveMeeting] = useState<any | null>(null);
  const isGuest = user?.isAnonymous;

  const [promiseThumbnail, setPromiseThumbnail] = useState<string | null>(cachedPromiseThumbnail);
  const [carouselSlide, setCarouselSlide] = useState(0); // 0 = text, 1 = image
  const carouselScrollRef = useRef<ScrollView>(null);
  
  // Daily Verses & Custom Promise Carousel State
  // Unified slide count for both Custom Promise and 4 Daily Verses
  const getUnifiedSlideCount = () => {
    const customSlides = (promise ? 1 : 0) + (promise && promiseThumbnail ? 1 : 0);
    const versesCount = visibleVerses.length;
    const timingsCount = hasServiceTimings ? 1 : 0;
    return customSlides + (versesCount > 0 ? versesCount : (customSlides > 0 ? 0 : 1)) + timingsCount;
  };
  const useWeChristianDailyPromise = true;
  const hasServiceTimings = !!(activeChurch?.serviceTimings && activeChurch.serviceTimings.length > 0);
  const [todayFourVerses, setTodayFourVerses] = useState<DailyVerse[]>(() => {
    if (cachedTodayFourVerses && cachedTodayFourVerses.length > 0) return cachedTodayFourVerses;
    try {
      const initial = VerseNotificationService.getSynchronousInitialVerses(0);
      const verses = initial[0]?.verses || [];
      if (verses.length > 0) cachedTodayFourVerses = verses;
      return verses;
    } catch (_) {
      return [];
    }
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Periodically refresh time every 60s so newly unlocked time-based cards appear automatically
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Time-based progressive unlocked verses (Morning -> +Afternoon -> +Evening -> +Night)
  const unlockedCount = getUnlockedVersesCount(currentTime);
  const visibleVerses = todayFourVerses.slice(0, Math.min(todayFourVerses.length, unlockedCount));
  const verseAutoScrollTimer = useRef<any>(null);
  const captureVerseRef = useRef<ViewShot>(null);
  const capturePromiseRef = useRef<ViewShot>(null);
  const [captureVerseConfig, setCaptureVerseConfig] = useState<{ verse: DailyVerse; period: string; theme: any } | null>(null);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [isSharingCard, setIsSharingCard] = useState(false);

  // Sermons Card Swipeable & Auto-Scroll Carousel State
  const [sermonSlide, setSermonSlide] = useState(0);
  const [sermonCardWidth, setSermonCardWidth] = useState(0);
  const sermonScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (sermonCardWidth <= 0) return;
    const timer = setInterval(() => {
      setSermonSlide(prev => {
        const next = (prev + 1) % 3;
        sermonScrollRef.current?.scrollTo({ x: next * sermonCardWidth, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [sermonCardWidth]);

  const sermonSlideRef = useRef(0);
  const sermonCardWidthRef = useRef(0);
  sermonSlideRef.current = sermonSlide;
  sermonCardWidthRef.current = sermonCardWidth;

  const sermonPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 8,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 8,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const width = sermonCardWidthRef.current || 140;
        const cur = sermonSlideRef.current;
        if (g.dx < -20 || g.dx > 20) {
          const next = g.dx < 0 ? (cur + 1) % 3 : (cur + 2) % 3;
          setSermonSlide(next);
          sermonScrollRef.current?.scrollTo({ x: next * width, animated: true });
        }
      },
    })
  ).current;

  // Automatically localize the 4 Daily Verses when language changes or when verses are fetched
  useEffect(() => {
    if (!todayFourVerses || todayFourVerses.length === 0) return;
    if (language === 'en') return;

    let isMounted = true;
    VerseNotificationService.localizeVerses(todayFourVerses, language as any)
      .then(localized => {
        if (!isMounted || !localized) return;
        const cap = language.charAt(0).toUpperCase() + language.slice(1);
        const hasLocalized = localized.some((v: any) => v[`verse${cap}`]);
        if (hasLocalized) {
          cachedTodayFourVerses = localized;
          setTodayFourVerses(localized);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [language, todayFourVerses.length]);
  
  // -- Sticky Header Animation --
  const [onlineMeetingsY, setOnlineMeetingsY] = useState(0);
  const [quickAccessY, setQuickAccessY] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerPadding = Math.max(insets.top + 8, Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 36));
  const HEADER_SCROLL_DISTANCE = 85;
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [0, -HEADER_SCROLL_DISTANCE],
    extrapolate: 'clamp'
  });
  const topRowOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE / 1.5],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error' | 'warning';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info'
  });

  const fetchData = async () => {
    try {
      // 1. Try to load cached promise for instant rendering on cold boot
      if (!promise) {
        AsyncStorage.getItem('@cached_daily_promise').then(val => {
          if (val && !promise) {
            try {
              const cached = JSON.parse(val);
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              if (cached.date === todayStr) {
                setPromise(cached);
                if (cached.imageUrl) setPromiseThumbnail(cached.imageUrl);
              } else {
                AsyncStorage.removeItem('@cached_daily_promise');
              }
            } catch (e) {}
          }
        }).catch(() => {});
      }

      // 2. Fetch Member Details non-blocking
      if (user?.phoneNumber) {
        FirestoreService.checkContactExists(user.phoneNumber).then((res: any) => {
          if (res?.exists && res?.member) {
            setMember(res.member);
            const mId = res.member.id;
            FirestoreService.updateLastAppOpened(mId);
            // Fetch Latest Prayer async
            FirestoreService.getPrayerRequests({ contactId: mId }).then((prayers: any[]) => {
              if (prayers && prayers.length > 0) {
                cachedLatestPrayer = prayers[0];
                cachedPrayerCount = prayers.length;
                setLatestPrayer(cachedLatestPrayer);
                setPrayerCount(cachedPrayerCount);
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }

      // 3. Fetch Daily Promise non-blocking
      FirestoreService.getDailyPromise().then((prom: any) => {
        if (prom) {
          cachedPromise = prom;
          setPromise(prom);
          AsyncStorage.setItem('@cached_daily_promise', JSON.stringify(prom));
          if (prom.imageUrl) {
            cachedPromiseThumbnail = prom.imageUrl;
            setPromiseThumbnail(prom.imageUrl);
          } else {
            cachedPromiseThumbnail = null;
            setPromiseThumbnail(null);
          }
        } else {
          cachedPromise = null;
          setPromise(null);
          AsyncStorage.removeItem('@cached_daily_promise');
          cachedPromiseThumbnail = null;
          setPromiseThumbnail(null);
        }
      }).catch(() => {});

      // 3b. Fetch Today's 4 Verses for Carousel
      VerseNotificationService.getTodayVerses(false).then((verses: DailyVerse[]) => {
        if (verses && verses.length > 0) {
          cachedTodayFourVerses = verses;
          setTodayFourVerses(verses);
          if (language !== 'en') {
            VerseNotificationService.localizeVerses(verses, language as any).then(lv => {
              if (lv) {
                cachedTodayFourVerses = lv;
                setTodayFourVerses(lv);
              }
            }).catch(() => {});
          }
        }
      }).catch(() => {});

      // 4. Fetch Today's Events non-blocking
      FirestoreService.getTodayEvents().then((ev: any) => {
        cachedTodayEvents = ev || [];
        setTodayEvents(cachedTodayEvents);
      }).catch(() => {});

      // 5. Fetch Upcoming Events non-blocking
      FirestoreService.getUpcomingEvents(3).then((ev: any) => {
        cachedEvents = ev || [];
        setEvents(cachedEvents);
      }).catch(() => {});

      // 6. Fetch Latest Sermon non-blocking
      FirestoreService.getLatestSermon().then((s: any) => {
        if (s) {
          cachedLatestSermon = s;
          setLatestSermon(cachedLatestSermon);
        }
      }).catch(() => {});

    } catch (error) {
      console.error('Error fetching home data:', error);
    } finally {
      // Unblock UI immediately so skeletons/cached UI can render while background fetches run
      setLoading(false);
      setInitialFetchDone(true);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, activeChurch?.id]);

  useEffect(() => {
    if (authMember) {
      setMember(authMember as AppMember);
    }
  }, [authMember]);

  // Listen for Live/Upcoming Google Meets
  useEffect(() => {
    if (!activeChurch?.id) return;
    const unsubscribe = firestore()
      .collection('Rhema Church')
      .doc(activeChurch.id)
      .collection('online_meetings')
      .where('status', 'in', ['upcoming', 'live'])
      .onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const meetings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Assuming the first returned is the active one, or sort by startTime
          setActiveMeeting(meetings[0]);
        } else {
          setActiveMeeting(null);
        }
      });
    return () => unsubscribe();
  }, [activeChurch?.id]);

  // Real-time listener for Today's Daily Promise so updates reflect immediately
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    FirestoreService.listenDailyPromise((freshPromise) => {
      if (freshPromise) {
        cachedPromise = freshPromise;
        setPromise(freshPromise);
        AsyncStorage.setItem('@cached_daily_promise', JSON.stringify(freshPromise));
        cachedPromiseThumbnail = freshPromise.imageUrl || null;
        setPromiseThumbnail(freshPromise.imageUrl || null);
      } else {
        cachedPromise = null;
        setPromise(null);
        AsyncStorage.removeItem('@cached_daily_promise');
        cachedPromiseThumbnail = null;
        setPromiseThumbnail(null);
      }
    }).then(unsub => {
      unsubscribe = unsub;
    }).catch(err => {
      console.warn('[HomeScreen] listenDailyPromise error:', err);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeChurch?.id]);

  // Real-time listener for Latest Sermon so updates reflect immediately
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    FirestoreService.listenLatestSermon((freshSermon) => {
      if (freshSermon) {
        cachedLatestSermon = freshSermon;
        setLatestSermon(freshSermon);
      }
    }).then(unsub => {
      unsubscribe = unsub;
    }).catch(err => {
      console.warn('[HomeScreen] listenLatestSermon error:', err);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeChurch?.id]);

  // Check for Celebrations
  useEffect(() => {
    if (!member) return;

    const checkCelebrations = async () => {
      try {
        const today = new Date();
        const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Helper to check if a date string (YYYY-MM-DD) matches today's month and day
        const isToday = (dateString?: string) => {
          if (!dateString) return false;
          const parts = dateString.split('T')[0].split('-');
          if (parts.length >= 3) {
            return `${parts[1]}-${parts[2]}` === todayMonthDay;
          }
          return false;
        };

        const activeCelebrations: string[] = [];
        if (isToday((member as any).dob)) activeCelebrations.push('birthday');
        if (isToday((member as any).anniversaryDate)) activeCelebrations.push('wedding');
        if (isToday((member as any).baptismDate)) activeCelebrations.push('baptism');

        if (activeCelebrations.length > 0) {
          if (!(global as any).hasShownCelebration) {
            (global as any).hasShownCelebration = true;
            setTimeout(() => {
              navigation.navigate('Celebration', { 
                celebrations: activeCelebrations, 
                name: (member as any).name || (member as any).firstName || 'Member' 
              });
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Error checking celebrations:', error);
      }
    };

    // Only run if not guest
    if (!isGuest) {
      checkCelebrations();
    }
  }, [member, isGuest]);

  // Helper to restart verse carousel auto-scroll after touch or slide change
  const restartVerseTimer = (startIndex: number) => {
    clearInterval(verseAutoScrollTimer.current);
    const count = getUnifiedSlideCount();
    if (count <= 1) return;
    verseAutoScrollTimer.current = setInterval(() => {
      setCarouselSlide(prev => {
        const next = (prev + 1) % count;
        carouselScrollRef.current?.scrollTo({ x: next * screenWidth, animated: true });
        return next;
      });
    }, 7000);
  };

  // Load 4 verses on mount and whenever church changes
  useEffect(() => {
    VerseNotificationService.getTodayVerses(false).then(verses => {
      if (verses && verses.length > 0) {
        cachedTodayFourVerses = verses;
        setTodayFourVerses(verses);
        if (language !== 'en') {
          VerseNotificationService.localizeVerses(verses, language as any).then(lv => {
            if (lv) {
              cachedTodayFourVerses = lv;
              setTodayFourVerses(lv);
            }
          }).catch(() => {});
        }
      }
      // Silently refresh in background to ensure latest Unsplash images are synced
      VerseNotificationService.getTodayVerses(true).then(freshVerses => {
        if (freshVerses && freshVerses.length > 0) {
          cachedTodayFourVerses = freshVerses;
          setTodayFourVerses(freshVerses);
          if (language !== 'en') {
            VerseNotificationService.localizeVerses(freshVerses, language as any).then(lv => {
              if (lv) {
                cachedTodayFourVerses = lv;
                setTodayFourVerses(lv);
              }
            }).catch(() => {});
          }
        }
      }).catch(() => {});
    }).catch(() => {});
  }, [activeChurch?.id, language]);

  // Carousel auto-slide logic (supports progressive verses when ON, or church promise & thumbnail when OFF, plus service timings)
  useEffect(() => {
    if (useWeChristianDailyPromise) {
      if (visibleVerses.length === 0) return;

      // Determine initial slide based on current time
      const hour = currentTime.getHours();
      let initialIndex = 0; // Morning (12:00 AM - 11:59 AM)
      if (hour >= 12 && hour < 17) initialIndex = 1; // Afternoon (12:00 PM - 4:59 PM)
      else if (hour >= 17 && hour < 20) initialIndex = 2; // Evening (5:00 PM - 7:59 PM)
      else if (hour >= 20) initialIndex = 3; // Night (8:00 PM - 11:59 PM)

      initialIndex = Math.min(initialIndex, Math.max(0, visibleVerses.length - 1));
      setCarouselSlide(initialIndex);

      setTimeout(() => {
        carouselScrollRef.current?.scrollTo({ x: initialIndex * screenWidth, animated: false });
      }, 300);

      // Start auto-scroll for unlocked verses + service timings
      const totalOnSlides = getUnifiedSlideCount();
      clearInterval(verseAutoScrollTimer.current);
      if (totalOnSlides > 1) {
        verseAutoScrollTimer.current = setInterval(() => {
          setCarouselSlide(prev => {
            const next = (prev + 1) % totalOnSlides;
            carouselScrollRef.current?.scrollTo({ x: next * screenWidth, animated: true });
            return next;
          });
        }, 7000);
      }

      return () => clearInterval(verseAutoScrollTimer.current);
    } else {
      clearInterval(verseAutoScrollTimer.current);
      const totalOffSlides = 1 + (promiseThumbnail ? 1 : 0) + (hasServiceTimings ? 1 : 0);
      if (totalOffSlides <= 1) {
        setCarouselSlide(0);
        return;
      }
      setCarouselSlide(0);
      const interval = setInterval(() => {
        setCarouselSlide(prev => {
          const next = (prev + 1) % totalOffSlides;
          carouselScrollRef.current?.scrollTo({ x: next * screenWidth, animated: true });
          return next;
        });
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [useWeChristianDailyPromise, visibleVerses.length, promiseThumbnail, hasServiceTimings, screenWidth]);

  const goToSlide = (idx: number) => {
    setCarouselSlide(idx);
    carouselScrollRef.current?.scrollTo({ x: idx * screenWidth, animated: true });
    if (useWeChristianDailyPromise) {
      restartVerseTimer(idx);
    }
  };

  const handleShareDailyVerse = async (verse: DailyVerse, period: string) => {
    try {
      const loc = getLocalizedVerse(verse, language);
      const greeting = getPeriodGreeting(period, t);
      const churchName = activeChurch?.name || '';
      
      let message = `🕊️ ${greeting} · ${t('home.quickDailyVerse')}\n\n"${stripHtml(loc.primaryVerse)}"\n— ${loc.primaryReference || 'Scripture'}`;
      if (loc.secondaryVerse && loc.secondaryVerse !== loc.primaryVerse) {
        message += `\n\n"${stripHtml(loc.secondaryVerse)}"\n— ${loc.secondaryReference || 'Scripture'}`;
      }
      if (churchName) {
        message += `\n\n${churchName} 🙏`;
      }

      const theme = VERSE_THEMES[period] || VERSE_THEMES.Morning;
      setCaptureVerseConfig({ verse, period, theme });
      setIsSharingCard(true);

      setTimeout(async () => {
        try {
          if (captureVerseRef.current?.capture) {
            const uri = await captureVerseRef.current.capture();
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
              await Sharing.shareAsync(uri, {
                mimeType: 'image/png',
                dialogTitle: `🕊️ ${greeting} · ${t('home.quickDailyVerse')} · ${churchName || 'Daily Verse'}`,
                UTI: 'public.png',
              });
            } else {
              await Share.share({ message });
            }
          } else {
            await Share.share({ message });
          }
        } catch (e) {
          console.error('Error capturing verse card for share:', e);
          await Share.share({ message });
        } finally {
          setIsSharingCard(false);
          setCaptureVerseConfig(null);
        }
      }, 1000);
    } catch (error) {
      console.error('Error sharing daily verse:', error);
      setIsSharingCard(false);
    }
  };

  const handleSaveDailyVerseCard = async (verse: DailyVerse, period: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('gallery.alerts.permissionTitle') || 'Permission Needed', t('gallery.alerts.permissionMsg') || 'Please allow photo gallery permission to save the verse card.');
        return;
      }
      const theme = VERSE_THEMES[period] || VERSE_THEMES.Morning;
      setCaptureVerseConfig({ verse, period, theme });
      setIsSavingCard(true);

      setTimeout(async () => {
        try {
          if (captureVerseRef.current?.capture) {
            const uri = await captureVerseRef.current.capture();
            await MediaLibrary.saveToLibraryAsync(uri);
            const greeting = getPeriodGreeting(period, t);
            setAlertConfig({
              visible: true,
              title: t('gallery.toasts.savedSuccess') || 'Saved to Gallery!',
              message: `${greeting} · ${t('home.quickDailyVerse')}`,
              type: 'success'
            });
          }
        } catch (e) {
          console.error('Failed to capture verse card:', e);
          Alert.alert(t('common.error') || 'Error', t('gallery.alerts.downloadError') || 'Failed to save verse card image.');
        } finally {
          setIsSavingCard(false);
          setCaptureVerseConfig(null);
        }
      }, 1000);
    } catch (e) {
      console.error(e);
      setIsSavingCard(false);
    }
  };

  const handleOpenMembers = () => {
    if (!member) {
      Alert.alert('Sign In Required', 'Please complete your profile configuration first.');
      return;
    }
    // Removed the !member.accountId check to allow members to add family members using their own ID
    navigation.navigate('Members');
  };

  const handleSharePromise = async () => {
    if (!promise) return;
    setIsSharingCard(true);

    try {
      const verseEn = stripHtml(promise.verse || '');
      const verseTe = stripHtml(promise.verseTelugu || '');
      const churchName = (isImpersonating && impersonatedBranchName)
        ? impersonatedBranchName
        : (activeChurch?.name || (member as any)?.churchName || (authMember as any)?.churchName || '');

      const cleanYId = promise.youtubeId ? extractYoutubeId(promise.youtubeId) : '';
      const watchText = cleanYId ? `\n\nWatch Devotional: https://youtu.be/${cleanYId}` : '';
      const churchText = churchName ? `\n\n${churchName} 🙏` : ' 🙏';

      const message = `Today's Promise · ఈ రోజు వాగ్దానం\n\n"${verseEn}"\n— ${promise.verseReferenceEn || promise.verseReference || 'Scripture'}${verseTe ? `\n\n"${verseTe}"\n— ${promise.verseReferenceTe || 'వాగ్దానం'}` : ''}${watchText}${churchText}`;

      // Always copy full message text to clipboard as guaranteed backup
      try {
        await Clipboard.setStringAsync(message);
      } catch (_) {}

      // Candidate image: uploaded promise thumbnail / imageUrl / YouTube thumbnail
      const targetImageUrl = promise.imageUrl || promiseThumbnail || (cleanYId ? `https://img.youtube.com/vi/${cleanYId}/hqdefault.jpg` : null);

      let localFileUri: string | null = null;
      let mimeType = 'image/jpeg';

      if (targetImageUrl) {
        try {
          if (targetImageUrl.startsWith('file://') || targetImageUrl.startsWith('content://') || targetImageUrl.startsWith('data:')) {
            localFileUri = targetImageUrl;
          } else {
            const isPng = targetImageUrl.toLowerCase().includes('.png');
            mimeType = isPng ? 'image/png' : 'image/jpeg';
            const ext = isPng ? 'png' : 'jpg';
            const destination = `${FileSystem.cacheDirectory}todays_promise_share.${ext}`;
            const downloadRes = await FileSystem.downloadAsync(targetImageUrl, destination);
            localFileUri = downloadRes.uri;
          }
        } catch (dlErr) {
          console.warn('Could not download promise thumbnail, trying capture fallback:', dlErr);
        }
      }

      // If no remote thumbnail or download failed, capture Today's Promise card via ViewShot
      if (!localFileUri && capturePromiseRef.current?.capture) {
        try {
          const capturedUri = await capturePromiseRef.current.capture();
          localFileUri = capturedUri;
          mimeType = 'image/png';
        } catch (capErr) {
          console.warn('ViewShot promise card capture failed:', capErr);
        }
      }

      // Clear loading indicator before presenting share sheet to avoid overlay freezes
      setIsSharingCard(false);

      if (localFileUri) {
        let fileUri = localFileUri;
        if (!fileUri.startsWith('file://') && !fileUri.startsWith('content://') && !fileUri.startsWith('data:')) {
          fileUri = `file://${fileUri}`;
        }

        // Attempt 1: Native Share with image and caption attached (react-native-share)
        try {
          await RNShare.open({
            title: `Today's Promise · ${churchName || 'Daily Promise'}`,
            message,
            url: fileUri,
            type: mimeType,
            subject: `Today's Promise · ${churchName || 'Daily Promise'}`,
          });
          return;
        } catch (shareOpenErr: any) {
          const errMsg = shareOpenErr?.message || String(shareOpenErr);
          if (errMsg.includes('User did not share') || errMsg.includes('dismiss') || errMsg.includes('cancel') || shareOpenErr?.code === 'CANCELLED') {
            // User cancelled the share dialog
            return;
          }
          console.warn('RNShare.open failed, trying expo-sharing fallback:', shareOpenErr);
        }

        // Attempt 2: expo-sharing fallback with the image file
        try {
          const isSharingAvailable = await Sharing.isAvailableAsync();
          if (isSharingAvailable) {
            await Sharing.shareAsync(fileUri, {
              dialogTitle: `Today's Promise · ${churchName || 'Daily Promise'}`,
              mimeType,
              UTI: mimeType === 'image/png' ? 'public.png' : 'public.jpeg',
            });
            return;
          }
        } catch (expoShareErr: any) {
          console.warn('Expo sharing failed:', expoShareErr);
        }
      }

      // Attempt 3: Built-in text sharing fallback
      await Share.share({ message });
    } catch (error) {
      console.error('Error sharing promise:', error);
    } finally {
      setIsSharingCard(false);
    }
  };

  const onRefresh = async () => {
    (global as any).hasShownCelebration = false;
    setRefreshing(true);
    fetchData();
  };

  const handleGuestProtectedNavigation = (screenName: string, params?: any) => {
    if (isGuest) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to access this feature.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Sign In', onPress: () => signOut() }
        ]
      );
    } else {
      navigation.navigate(screenName, params);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greetingMorning');
    if (hour < 17) return t('home.greetingAfternoon');
    if (hour < 21) return t('home.greetingEvening');
    return t('home.greetingNight');
  };

  const getTeluguDay = () => {
    const days = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
    return days[new Date().getDay()];
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '--:--';
    try {
      const timePart = timeStr.includes('T') ? timeStr.split('T')[1].split('.')[0] : timeStr;
      const [hours, minutes] = timePart.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formattedHours = h % 12 || 12;
      return `${formattedHours}:${minutes} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };

  const formatTeluguDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const monthsTe = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
      return `${monthsTe[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    } catch (e) {
      return dateStr;
    }
  };

  const parseServiceDisplay = (name: string, explicitNote?: string) => {
    if (explicitNote && explicitNote.trim()) {
      return { title: name.trim(), note: explicitNote.trim() };
    }
    const match = (name || '').match(/^(.*?)\s*(\(.*?\))\s*$/);
    if (match) {
      return { title: match[1].trim(), note: match[2].trim() };
    }
    return { title: (name || '').trim(), note: null };
  };

  const renderServiceTimingsSlide = () => {
    const timings = activeChurch?.serviceTimings || [];
    if (timings.length === 0) return null;

    return (
      <View key="service-timings-slide" style={[styles.phSlide, { width: screenWidth }]}>
        <LinearGradient
          colors={['#527C78', '#527C78']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.phInner, styles.serviceSlideCleanInner]}
        >
          {/* Subtle background curved accent ring on top right */}
          <View style={{ position: 'absolute', top: -50, right: -50, width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }} />

          {/* Centered Header */}
          <Text style={styles.serviceSlideCleanTitle}>{t('home.churchServiceTimings')}</Text>
          <View style={styles.serviceSlideCleanBar} />

          {/* Service Items List */}
          <ScrollView
            style={styles.serviceSlideCleanScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {timings.map((service, idx) => {
              if (!service.name && !service.startTime && !service.endTime) return null;
              const { title, note } = parseServiceDisplay(service.name, service.note);
              const timeDisplay = (service.startTime || service.endTime)
                ? `${service.startTime || ''}${service.startTime && service.endTime ? ' - ' : ''}${service.endTime || ''}`
                : '';

              return (
                <View key={service.id || idx} style={styles.serviceSlideCleanRow}>
                  <View style={styles.serviceSlideCleanLeft}>
                    <Text style={styles.serviceSlideCleanName} numberOfLines={2}>
                      {title || `Service #${idx + 1}`}
                    </Text>
                    {note ? (
                      <Text style={styles.serviceSlideCleanNote}>
                        {note}
                      </Text>
                    ) : null}
                  </View>

                  {timeDisplay ? (
                    <Text style={styles.serviceSlideCleanTime}>
                      {timeDisplay}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </LinearGradient>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: '#1a2d5a' }]}>
        <ActivityIndicator size="large" color="#FCD34D" />
        <Text style={styles.screenLoadingText}>{activeChurch?.name || 'Welcome'} — {activeChurch?.tagline || 'Connect & Grow'}</Text>
      </View>
    );
  }

  const todayMonthShort = currentTime.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const todayDateNum = currentTime.getDate();
  const todayWeekdayFull = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
  const churchDisplayName = activeChurch?.name || 'Rhema Global Ministries';
  const churchInitials = churchDisplayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() || '')
    .join('') || 'RG';

  const currentUserName = isImpersonating
    ? 'Branch Admin'
    : ((`${member?.firstName || ''} ${member?.lastName || ''}`.trim()) || member?.name || user?.displayName || 'Beloved');

  const tickerEvents = useMemo(() => {
    const list = (todayEvents && todayEvents.length > 0) ? todayEvents : (events || []);
    if (list.length === 0) {
      const timings = activeChurch?.serviceTimings || [];
      if (timings.length > 0) {
        return timings.map((st: any) => {
          const sEn = st.startTime ? formatEventTime(st.startTime, 'en') : '';
          const eEn = st.endTime ? formatEventTime(st.endTime, 'en') : '';
          const timeEn = sEn ? (eEn ? `${sEn} - ${eEn}` : sEn) : '10:00 AM';

          const sTe = st.startTime ? formatEventTime(st.startTime, 'te') : '';
          const eTe = st.endTime ? formatEventTime(st.endTime, 'te') : '';
          const timeTe = sTe ? (eTe ? `${sTe} - ${eTe}` : sTe) : timeEn;

          return {
            title: st.name || 'Church Service',
            titleTelugu: st.nameTelugu || st.name || 'చర్చి సర్వీస్',
            time: timeEn,
            timeTelugu: timeTe,
            raw: st,
          };
        });
      }
      return [
        { title: 'Morning Prayer', titleTelugu: 'ఉదయ కాల ప్రార్థన', time: '6:00 AM - 7:30 AM', timeTelugu: 'ఉదయం 6:00 - 7:30' },
        { title: 'Worship Service', titleTelugu: 'ఆరాధన కూడిక', time: '10:00 AM - 12:30 PM', timeTelugu: 'ఉదయం 10:00 - మధ్యాహ్నం 12:30' },
        { title: 'Evening Fellowship', titleTelugu: 'సాయంకాల సహవాసం', time: '6:30 PM - 8:30 PM', timeTelugu: 'సాయంత్రం 6:30 - రాత్రి 8:30' },
      ];
    }
    return list.map((ev: any) => {
      const sEn = ev.startTime ? formatEventTime(ev.startTime, 'en') : '';
      const eEn = ev.endTime ? formatEventTime(ev.endTime, 'en') : '';
      const timeEn = sEn ? (eEn ? `${sEn} - ${eEn}` : sEn) : (ev.date ? formatDateDisplay(ev.date) : 'Today');

      const sTe = ev.startTime ? formatEventTime(ev.startTime, 'te') : '';
      const eTe = ev.endTime ? formatEventTime(ev.endTime, 'te') : '';
      const timeTe = sTe ? (eTe ? `${sTe} - ${eTe}` : sTe) : timeEn;

      return {
        title: ev.title || 'Church Event',
        titleTelugu: ev.titleTelugu || ev.title,
        time: timeEn,
        timeTelugu: timeTe,
        raw: ev,
      };
    });
  }, [todayEvents, events, activeChurch]);


  return (
    <View style={[styles.mainContainer, { backgroundColor: '#FAF7F2' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF7F2" />
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
      
      {/* ── Fixed Top Church Header Row (Stays in Place While Content Scrolls Behind It) ── */}
      <View 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          zIndex: 10, 
          backgroundColor: '#FAF7F2',
          paddingTop: headerPadding,
          paddingHorizontal: 14,
          paddingBottom: 6,
        }}
        onLayout={(e) => setDynamicHeaderHeight(e.nativeEvent.layout.height)}
      >
        {/* SECTION 1: Clean Top Church Identity Row (Full Title Always Visible) */}
        <View style={[styles.rhemaTopIdentityRow, { marginBottom: 4 }]}>
          <View style={styles.headerLeft}>
            <View style={styles.rhemaLogoCircle}>
              {activeChurch?.theme?.logoUrl ? (
                <Image 
                  source={{ uri: activeChurch.theme.logoUrl }} 
                  style={styles.rhemaLogoImg}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={['#1E64D8', '#082B7A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.rhemaLogoGradient}
                >
                  <Text style={styles.rhemaLogoInitials}>{churchInitials}</Text>
                </LinearGradient>
              )}
            </View>
            <View style={styles.titleCol}>
              <Text 
                style={styles.rhemaCardTitle} 
                numberOfLines={1} 
                adjustsFontSizeToFit 
                minimumFontScale={0.6}
                maxFontSizeMultiplier={1.1}
              >
                {churchDisplayName}
              </Text>
              <Text 
                style={styles.rhemaCardSubtitle} 
                numberOfLines={1} 
                adjustsFontSizeToFit 
                minimumFontScale={0.7}
                maxFontSizeMultiplier={1.1}
              >
                {activeChurch?.tagline || 'Together In Christ'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.rhemaBellButton} 
              onPress={() => navigation.navigate('Updates')}
              activeOpacity={0.75}
            >
              <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
                <Bell color="#0B1938" size={21} strokeWidth={2.2} />
              </Animated.View>
              <View style={styles.rhemaBellDot} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Animated.ScrollView 
        style={styles.scroll} 
        contentContainerStyle={{ 
          paddingTop: dynamicHeaderHeight > 0 ? dynamicHeaderHeight + 4 : headerPadding + 74,
          paddingBottom: 180
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0055D4" progressViewOffset={dynamicHeaderHeight > 0 ? dynamicHeaderHeight + 4 : headerPadding + 74} />
        }
      >
        {/* SECTION 2: Premium Greeting Card (Beloved In Christ with Interactive 3D Tilt) */}
        <View style={{ paddingHorizontal: 14, marginTop: 4, marginBottom: 16 }}>
          <GreetingCard userName={currentUserName} />
        </View>

        {/* Upcoming Events Marquee Ticker (Padded with matching card shape) */}
        <View style={{ paddingHorizontal: 14, marginBottom: 16 }}>
          <EventsTicker 
            events={tickerEvents} 
            onSeeAll={() => navigation.navigate('Events')} 
            onEventPress={(evItem) => {
              if (evItem?.raw) {
                navigation.navigate('EventDetails', { event: evItem.raw });
              } else {
                navigation.navigate('Events');
              }
            }} 
          />
        </View>
        <View style={styles.contentPad}>
          {/* ── Daily Promise / Daily Verse Carousel ── */}
          <View style={styles.promiseHero}>
            {/* Slides */}
            <ScrollView
              ref={carouselScrollRef}
              horizontal
              pagingEnabled
              bounces={false}
              overScrollMode="never"
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const maxSlides = getUnifiedSlideCount();
                const slide = Math.min(Math.max(0, Math.round(e.nativeEvent.contentOffset.x / screenWidth)), maxSlides - 1);
                setCarouselSlide(slide);
                if (useWeChristianDailyPromise) {
                  restartVerseTimer(slide);
                }
              }}
            >
              <>
              {/* ── Slide: Church Custom Promise Card (if published) ── */}
              {promise && (
                <TouchableOpacity 
                  activeOpacity={0.9}
                  style={[styles.phSlide, { width: screenWidth }]} 
                  onPress={() => handleGuestProtectedNavigation('Promise')}
                >
                  <View style={styles.vdCleanWhiteCard}>
                    <View style={styles.vdWatermarkCircle} pointerEvents="none" />
                    <View style={styles.vdWatermarkBook} pointerEvents="none">
                      <BookOpen size={64} color="rgba(255, 255, 255, 0.14)" strokeWidth={1.5} />
                    </View>

                    <Text style={styles.phLabel} maxFontSizeMultiplier={1.15}>
                      {t('home.todaysPromise') || "Today's Promise"}
                    </Text>

                    <View style={styles.vdVerseBlock}>
                      <View style={styles.vdVerticalLine} />
                      <View style={styles.vdVerseTextContainer}>
                        <Text style={styles.vdTopRightQuote} pointerEvents="none">”</Text>
                        {promise?.verseTelugu ? (
                          <Text style={styles.vdVerseTe} numberOfLines={5} maxFontSizeMultiplier={1.15}>
                            {stripHtml(promise.verseTelugu)}
                          </Text>
                        ) : null}
                        <Text style={styles.vdVerseEn} numberOfLines={4} maxFontSizeMultiplier={1.15}>
                          {promise ? stripHtml(promise.verse) : ''}
                        </Text>
                        <View style={styles.vdReferenceRow}>
                          {promise?.verseReferenceTe ? (
                            <>
                              <Text style={styles.vdRefPrimary} maxFontSizeMultiplier={1.15}>{promise.verseReferenceTe}</Text>
                              <Text style={styles.vdRefDivider} maxFontSizeMultiplier={1.15}>|</Text>
                            </>
                          ) : null}
                          <Text style={styles.vdRefSecondary} maxFontSizeMultiplier={1.15}>
                            {promise ? (promise.verseReferenceEn || promise.verseReference) : ''}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.vdActions}>
                      <TouchableOpacity style={styles.vdShareBtn} onPress={handleSharePromise}>
                        <Share2 size={17} color="#355B56" />
                        <Text style={styles.vdShareBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>{t('common.share')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.vdSaveBtn} 
                        onPress={() => {
                          handleGuestProtectedNavigation('DailyVideo', { 
                            youtubeId: promise?.youtubeId,
                            videoTitle: promise?.videoTitle || (promise?.verseReferenceEn ? `${promise.verseReferenceEn} Devotional` : undefined),
                            pastor: promise?.pastor
                          });
                        }}
                      >
                        <Play size={17} color="#355B56" fill="#355B56" />
                        <Text style={styles.vdSaveBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>{t('common.watchVideo')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* ── Slide: Church Custom Promise Thumbnail (if available) ── */}
              {promise && promiseThumbnail && (
                <View style={[styles.phSlide, styles.phThumbnailSlide, { width: screenWidth }]}>
                  <LinearGradient
                    colors={['#527C78', '#527C78']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, paddingTop: 16, borderRadius: 24, overflow: 'hidden' }}
                  >
                    <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.15)' }} />
                    <View style={{ position: 'absolute', top: -10, right: -10, width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.1)' }} />
                    <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.1)' }} />
                    <Text style={styles.phLabel} maxFontSizeMultiplier={1.15}>{t('home.todaysPromise') || "Today's Promise"}</Text>
                    <Image
                      source={{ uri: promiseThumbnail }}
                      style={[styles.phThumbnailImg, { flex: 1 }]}
                      resizeMode="contain"
                    />
                    <View style={[styles.phActions, { paddingHorizontal: 16, paddingBottom: 14 }]}>
                      <TouchableOpacity style={styles.phShareBtn} onPress={handleSharePromise}>
                        <Share2 size={18} color="#355B56" />
                        <Text style={styles.phBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>{t('common.share')}</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                </View>
              )}

                  {visibleVerses.length > 0 ? (
                    visibleVerses.map((verse, idx) => {
                      const period = visibleVerses.length === 1 
                        ? getCurrentPeriod(currentTime) 
                        : (VERSE_PERIODS[idx] || getCurrentPeriod(currentTime));
                      const loc = getLocalizedVerse(verse, language);
                      const greeting = getPeriodGreeting(period, t);

                      return (
                        <TouchableOpacity
                          key={verse.id || idx}
                          activeOpacity={0.92}
                          style={[styles.vdSlide, { width: screenWidth }]}
                          onPress={() => navigation.navigate('VerseOfTheDay', { verseId: verse.id, period })}
                        >
                          <View style={[styles.vdCleanWhiteCard, verse.backgroundUrl ? { backgroundColor: '#1A2E2B' } : undefined]}>
                            {verse.backgroundUrl ? (
                              <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                                <ImageBackground
                                  source={{ uri: verse.backgroundUrl }}
                                  style={StyleSheet.absoluteFillObject}
                                  imageStyle={{ borderRadius: 24 }}
                                  resizeMode="cover"
                                >
                                  <LinearGradient
                                    colors={['rgba(24, 46, 42, 0.45)', 'rgba(15, 23, 42, 0.88)']}
                                    style={StyleSheet.absoluteFillObject}
                                  />
                                </ImageBackground>
                              </View>
                            ) : (
                              <>
                                {/* Subtle bottom-right open book & soft circle watermark */}
                                <View style={styles.vdWatermarkCircle} pointerEvents="none" />
                                <View style={styles.vdWatermarkBook} pointerEvents="none">
                                  <BookOpen size={64} color="rgba(255, 255, 255, 0.14)" strokeWidth={1.5} />
                                </View>
                              </>
                            )}

                            <Text style={styles.phLabel} maxFontSizeMultiplier={1.15}>
                              {greeting}
                            </Text>

                            {/* Main Verse Block */}
                            <View style={styles.vdVerseBlock}>
                              <View style={styles.vdVerticalLine} />
                              <View style={styles.vdVerseTextContainer}>
                                <Text style={styles.vdTopRightQuote} pointerEvents="none">”</Text>

                                {/* Primary localized verse (Telugu / Primary) */}
                                <Text 
                                  style={[styles.vdVerseTe, !loc.secondaryVerse && { fontSize: 17, lineHeight: 26 }]} 
                                  numberOfLines={5}
                                  maxFontSizeMultiplier={1.15}
                                >
                                  {stripHtml(loc.primaryVerse)}
                                </Text>

                                {/* Secondary verse (English) if distinct */}
                                {loc.secondaryVerse && loc.secondaryVerse !== loc.primaryVerse ? (
                                  <Text style={styles.vdVerseEn} numberOfLines={4} maxFontSizeMultiplier={1.15}>
                                    {stripHtml(loc.secondaryVerse)}
                                  </Text>
                                ) : null}

                                {/* Reference Line inside Scripture column */}
                                <View style={styles.vdReferenceRow}>
                                  <Text style={styles.vdRefPrimary} maxFontSizeMultiplier={1.15}>
                                    {loc.primaryReference}
                                  </Text>
                                  {loc.secondaryReference && loc.secondaryReference !== loc.primaryReference ? (
                                    <>
                                      <Text style={styles.vdRefDivider} maxFontSizeMultiplier={1.15}>|</Text>
                                      <Text style={styles.vdRefSecondary} maxFontSizeMultiplier={1.15}>
                                        {loc.secondaryReference}
                                      </Text>
                                    </>
                                  ) : null}
                                </View>
                              </View>
                            </View>

                            {/* Action Buttons: Background #E4EEEA · Text and icon #355B56 */}
                            <View style={styles.vdActions}>
                              <TouchableOpacity 
                                style={styles.vdShareBtn} 
                                onPress={() => handleShareDailyVerse(verse, period)}
                                activeOpacity={0.75}
                              >
                                <Share2 size={17} color="#355B56" />
                                <Text style={styles.vdShareBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>{t('common.share')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={styles.vdSaveBtn} 
                                onPress={() => handleSaveDailyVerseCard(verse, period)}
                                activeOpacity={0.75}
                              >
                                <Download size={17} color="#355B56" />
                                <Text style={styles.vdSaveBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>{t('common.saveCard')}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    // Loading placeholder while 4 verses load
                    <View style={[styles.vdSlide, { width: screenWidth }]}>
                      <View style={[styles.vdCleanWhiteCard, { justifyContent: 'center', alignItems: 'center', minHeight: 240 }]}>
                        <ActivityIndicator size="small" color="#E4EEEA" />
                        <Text style={{ color: '#FFFFFF', fontSize: 12, marginTop: 8 }}>{t('common.loading')}</Text>
                      </View>
                    </View>
                  )}

                  {/* Slide: Church Service Timings */}
                  {hasServiceTimings && renderServiceTimingsSlide()}
                </>
            </ScrollView>

            {/* Dot Indicators (Dynamically adapts to visible verse count, thumbnail, and service timings) */}
            {(() => {
              const totalDots = getUnifiedSlideCount();

              if (totalDots <= 1) return null;

              return (
                <View style={styles.dotRow}>
                  {Array.from({ length: totalDots }).map((_, i) => (
                    <TouchableOpacity key={i} onPress={() => goToSlide(i)} style={styles.dotHit}>
                      <View style={[styles.dot, carouselSlide === i && styles.dotActive]} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
          </View>

          {/* ── Editorial Bento-Grid Quick Access Section ── */}
          <View
            style={styles.bentoSectionWrapper}
            onLayout={(e) => {
              const y = Math.round(e.nativeEvent.layout.y);
              setQuickAccessY(prev => Math.abs(prev - y) > 10 ? y : prev);
            }}
          >
            {/* Header Row: "Quick Access" styled with church title typography */}
            <View style={styles.bentoHeaderRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text 
                  style={[styles.bentoHeaderTitle, isDark && { color: '#e2e8f0' }]}
                  numberOfLines={1}
                >
                  {t('home.quickAccess')}
                </Text>
              </View>
              <Text style={styles.bentoHeaderSubtitle}>Tap to explore</Text>
            </View>

            {/* ── ROW 1: Sermons (Tall Card) + Stacked Daily Verse & Events (Right Column) ── */}
            <View style={styles.bentoRow1}>
              {/* Left Column: Sermons Card - PanResponder Swipeable & Auto-Scroll */}
              <View 
                {...sermonPanResponder.panHandlers}
                style={styles.claySermonsTouch}
              >
                <LinearGradient
                  colors={['#0D3D34', '#072620']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.claySermonsCard}
                >
                  {/* 3D Retro Vintage Microphone for Sermons */}
                  <TouchableOpacity 
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('Sermons')}
                    style={{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Image
                      source={require('../../assets/retro_mic_3d.png')}
                      style={{ width: 26, height: 46 }}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>

                  {/* Bottom Text + Swipeable Slides & Indicator */}
                  <View 
                    style={styles.claySermonsBottom}
                    onLayout={(e) => {
                      const w = e.nativeEvent.layout.width;
                      if (w > 0 && Math.abs(w - sermonCardWidth) > 1) {
                        setSermonCardWidth(w);
                      }
                    }}
                  >
                    {/* Swipeable Carousel */}
                    <ScrollView
                      ref={sermonScrollRef}
                      horizontal
                      pagingEnabled
                      scrollEnabled={false}
                      showsHorizontalScrollIndicator={false}
                      style={{ width: sermonCardWidth > 0 ? sermonCardWidth : '100%' }}
                    >
                      {/* Slide 1 */}
                      <View style={{ width: sermonCardWidth > 0 ? sermonCardWidth : 140, paddingRight: 4 }}>
                        <Text
                          style={styles.claySermonsTitle}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {t('home.quickSermons')}
                        </Text>
                        <Text style={styles.claySermonsSub} numberOfLines={2}>
                          Watch & listen to transformative messages
                        </Text>
                      </View>

                      {/* Slide 2 */}
                      <View style={{ width: sermonCardWidth > 0 ? sermonCardWidth : 140, paddingRight: 4 }}>
                        <Text
                          style={styles.claySermonsTitle}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          Sermon Videos
                        </Text>
                        <Text style={styles.claySermonsSub} numberOfLines={2}>
                          Rhema Global Ministries sermon videos
                        </Text>
                      </View>

                      {/* Slide 3 */}
                      <View style={{ width: sermonCardWidth > 0 ? sermonCardWidth : 140, paddingRight: 4 }}>
                        <Text
                          style={styles.claySermonsTitle}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          Watch Online
                        </Text>
                        <Text style={styles.claySermonsSub} numberOfLines={2}>
                          Stream life-changing sermons anytime
                        </Text>
                      </View>
                    </ScrollView>

                    <View style={styles.claySermonsFooterRow}>
                      {/* Pill Dashes in Bottom Left (Active indicator corresponds to slide) */}
                      <View style={styles.claySermonsDashRow}>
                        <TouchableOpacity 
                          activeOpacity={0.7} 
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          onPress={() => { setSermonSlide(0); sermonScrollRef.current?.scrollTo({ x: 0, animated: true }); }}
                        >
                          <View style={sermonSlide === 0 ? styles.claySermonsDashActive : styles.claySermonsDashInactive} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          activeOpacity={0.7} 
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          onPress={() => { setSermonSlide(1); sermonScrollRef.current?.scrollTo({ x: sermonCardWidth, animated: true }); }}
                        >
                          <View style={sermonSlide === 1 ? styles.claySermonsDashActive : styles.claySermonsDashInactive} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          activeOpacity={0.7} 
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          onPress={() => { setSermonSlide(2); sermonScrollRef.current?.scrollTo({ x: sermonCardWidth * 2, animated: true }); }}
                        >
                          <View style={sermonSlide === 2 ? styles.claySermonsDashActive : styles.claySermonsDashInactive} />
                        </TouchableOpacity>
                      </View>

                      {/* White Circular Action Button with Upward Cross Arrow */}
                      <TouchableOpacity 
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Sermons')}
                        style={styles.clayArrowCircleMd}
                      >
                        <ArrowUpRight size={12} color="#0C3830" strokeWidth={2.4} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* Right Column: Daily Verse + Events - Clean, visible borders */}
              <View style={styles.bentoRow1RightCol}>
                {/* Songs Card: Rich Royal Purple Gradient */}
                <TouchableOpacity
                  style={styles.clayDailyVerseTouch}
                  activeOpacity={0.88}
                  onPress={() => handleGuestProtectedNavigation('Songs')}
                >
                  <LinearGradient
                    colors={['#582B8A', '#3C1665', '#240842']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.clayDailyVerseCard, { borderColor: '#7E43BA' }]}
                  >
                    {/* 3D Microphone with Music Notes */}
                    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                      <Image
                        source={require('../../assets/3d_sermons.png')}
                        style={{ width: 38, height: 38 }}
                        resizeMode="contain"
                      />
                    </View>

                    <View style={{ flex: 1, zIndex: 2, justifyContent: 'center', marginLeft: 8, marginRight: 24 }}>
                      <Text
                        style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 14 }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        {t('home.quickSongs')}
                      </Text>
                      <Text
                        style={[styles.clayCardSub, { color: '#E8D4FC', fontSize: 11, marginTop: 2 }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Worship songs
                      </Text>
                    </View>

                    <View style={[styles.clayArrowCircleMd, { position: 'absolute', right: 8, bottom: 8 }]}>
                      <ArrowUpRight size={11} color="#3C1665" strokeWidth={2.4} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Events Card: Bright Warm Amber Mocha Gradient */}
                <TouchableOpacity
                  style={styles.clayEventsTouch}
                  activeOpacity={0.88}
                  onPress={() => navigation.navigate('Events')}
                >
                  <LinearGradient
                    colors={['#A86E42', '#865128', '#633714']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.clayEventsCard, { borderColor: '#BF875D' }]}
                  >
                    {/* 3D Spiral Calendar Icon */}
                    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                      <Image
                        source={require('../../assets/3d_events.png')}
                        style={{ width: 38, height: 38 }}
                        resizeMode="contain"
                      />
                    </View>

                    <View style={{ flex: 1, zIndex: 2, justifyContent: 'center', marginLeft: 8, marginRight: 24 }}>
                      <Text
                        style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 14 }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        {t('home.quickEvents')}
                      </Text>
                      <Text
                        style={[styles.clayCardSub, { color: '#F9E9DC', fontSize: 11, marginTop: 2 }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Church services
                      </Text>
                    </View>

                    <View style={[styles.clayArrowCircleMd, { position: 'absolute', right: 8, bottom: 8 }]}>
                      <ArrowUpRight size={11} color="#633714" strokeWidth={2.4} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── ROW 2: Give / Tithe Banner (Clean, Exact Medallion + Hand with Heart) ── */}
            <TouchableOpacity
              style={styles.clayGiveTouch}
              activeOpacity={0.88}
              onPress={() => {
                if (!activeChurch?.features?.hasGiving) {
                  setAlertConfig({
                    visible: true,
                    title: 'Coming Soon',
                    message: 'Online donations via the app are coming soon. Please contact the church administration for offline donation options.',
                    type: 'info'
                  });
                } else {
                  handleGuestProtectedNavigation('Give');
                }
              }}
            >
              <LinearGradient
                colors={['#0B0A08', '#1C1507', '#5B4413', '#B98F2E', '#E8C766']}
                start={{ x: 0, y: 0.25 }}
                end={{ x: 1, y: 0.75 }}
                style={styles.clayGiveCard}
              >
                {/* 3D Gold Coins behind the Give badge */}
                <GiveCoins scrollY={scrollY} triggerY={quickAccessY} />

                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  {/* Circular Embossed Gold Medallion with Exact Hand + Heart */}
                  <LinearGradient
                    colors={['#FFF0B8', '#DDAE3A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.clayGiveIconCircle}
                  >
                    <View style={styles.clayIconShine} pointerEvents="none" />
                    <Image source={require('../../assets/give_hand_heart.png')} style={{ width: 28, height: 28 }} resizeMode="contain" />
                  </LinearGradient>

                  <View style={{ flex: 1, justifyContent: 'center', marginLeft: 10, marginRight: 96 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFE7A0', fontSize: 16 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {language === 'en' ? 'Give / Tithe' : t('home.quickGiving')}
                    </Text>
                    <Text style={[styles.clayCardSub, { color: '#D8C48A', fontSize: 11, marginTop: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      Sow a seed · Online giving
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* ── ROW 3: Daily Verse + Attendance ── */}
            <View style={styles.bentoRow3}>
              {/* Left: Daily Verse */}
              <TouchableOpacity
                style={styles.claySongsTouch}
                activeOpacity={0.88}
                onPress={() => {
                  if (todayVerse) {
                    navigation.navigate('VerseOfTheDay', { verseId: todayVerse.id, period: todayPeriod });
                  } else if (visibleVerses && visibleVerses.length > 0) {
                    navigation.navigate('VerseOfTheDay', { verseId: visibleVerses[0].id, period: VERSE_PERIODS[0] || 'Morning' });
                  } else {
                    handleGuestProtectedNavigation('Promise');
                  }
                }}
              >
                <LinearGradient
                  colors={['#3B78C2', '#22559C', '#123972']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.claySongsCard, { borderColor: '#5B92DA' }]}
                >
                  {/* Warm Champagne Claymorphic Squircle with 4-Pointed Star */}
                  <LinearGradient
                    colors={['#FEF3C7', '#FDE68A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.clayIconBoxLg}
                  >
                    <View style={styles.clayIconShine} pointerEvents="none" />
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="#78350F">
                      <Path d="M12 0 C12 6.6 6.6 12 0 12 C6.6 12 12 17.4 12 24 C12 17.4 17.4 12 24 12 C17.4 12 12 6.6 12 0 Z" />
                    </Svg>
                  </LinearGradient>

                  <View style={{ flex: 1, zIndex: 2, justifyContent: 'center', marginLeft: 8, marginRight: 24 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                    >
                      {t('home.quickDailyVerse')}
                    </Text>
                  </View>

                  <View style={[styles.clayArrowCircleMd, { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.28)' }]}>
                    <ArrowUpRight size={12} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* Right: Attendance - Soft Charcoal #343A3A Gradient with Genuinely Large Text */}
              <TouchableOpacity
                style={styles.clayAttendanceTouch}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('Attendance')}
              >
                <LinearGradient
                  colors={['#424A4A', '#343A3A', '#262B2B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.clayAttendanceCard, { borderColor: '#4F5959' }]}
                >
                  {/* 3D Attendance Checklist Clipboard Icon */}
                  <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 0, marginRight: 2 }}>
                    <Image
                      source={require('../../assets/3d_attendance.png')}
                      style={{ width: 42, height: 42 }}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={{ flex: 1, zIndex: 2, justifyContent: 'center', marginLeft: 4, marginRight: 20 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 18.5, fontWeight: '900', letterSpacing: -0.3 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.88}
                    >
                      {t('nav.attendance') || 'Attendance'}
                    </Text>
                  </View>

                  <View style={[styles.clayArrowCircleMd, { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.28)' }]}>
                    <ArrowUpRight size={12} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* ── ROW 4: 2-Column Cards (Sermon Notes & Bible Quiz) - Text Next to Icon ── */}
            <View style={styles.bentoRow4}>
              {/* Sermon Notes */}
              <TouchableOpacity
                style={styles.clayQuarterTouch}
                activeOpacity={0.85}
                onPress={() => handleGuestProtectedNavigation('MemberNotes')}
              >
                <LinearGradient
                  colors={['#2E72A6', '#1A537D', '#0E3756']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.clayQuarterCard, { borderColor: '#4C91C9' }]}
                >
                  {/* 3D Notepad with Writing Pen Icon */}
                  <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 2, marginRight: 4 }}>
                    <Image
                      source={require('../../assets/3d_sermon_notes.png')}
                      style={{ width: 36, height: 36 }}
                      resizeMode="contain"
                    />
                  </View>

                  {/* Text Next to Icon */}
                  <View style={{ flex: 1, zIndex: 2, justifyContent: 'center', marginLeft: 6, marginRight: 22 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' }]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {t('home.quickSermonNotes')}
                    </Text>
                  </View>

                  {/* Bottom-right: Arrow */}
                  <View style={[styles.clayArrowCircleMd, { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.28)' }]}>
                    <ArrowUpRight size={12} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* Bible Quiz */}
              <TouchableOpacity
                style={styles.clayQuarterTouch}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('BibleQuizHome')}
              >
                <LinearGradient
                  colors={['#248A54', '#15653B', '#0B3F23']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.clayQuarterCard, { borderColor: '#3EAA70' }]}
                >
                  {/* 3D Golden Trophy Icon */}
                  <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 2, marginRight: 4 }}>
                    <Image
                      source={require('../../assets/3d_bible_quiz.png')}
                      style={{ width: 30, height: 38 }}
                      resizeMode="contain"
                    />
                  </View>

                  {/* Text Next to Icon */}
                  <View style={{ flex: 1, zIndex: 2, justifyContent: 'center', marginLeft: 6, marginRight: 22 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' }]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {t('home.quickBibleQuiz') || 'Bible Quiz'}
                    </Text>
                  </View>

                  {/* Bottom-right: Arrow */}
                  <View style={[styles.clayArrowCircleMd, { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.28)' }]}>
                    <ArrowUpRight size={12} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* ── ROW 5: 3 Capsule Pills (Members, Online Meetings, Attendance) ── */}
            <View
              style={styles.bentoBottomPillsRow}
              onLayout={(e) => setOnlineMeetingsY(e.nativeEvent.layout.y)}
            >
              {/* Members Pill */}
              <TouchableOpacity
                style={styles.clayBottomTouch}
                onPress={handleOpenMembers}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#A32E52', '#7D1C3A', '#560D24']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.clayBottomPill, { borderColor: '#BD456C' }]}
                >


                  {/* 3D Members Group Icon */}
                  <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                    <Image
                      source={require('../../assets/3d_members.png')}
                      style={{ width: 30, height: 26 }}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={{ flex: 1, zIndex: 2, marginHorizontal: 3, justifyContent: 'center', paddingRight: 16 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', letterSpacing: -0.2 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {t('home.quickMembers')}
                    </Text>
                  </View>

                  <View style={[styles.clayArrowCircleXs, { position: 'absolute', right: 5, bottom: 5 }]}>
                    <ArrowUpRight size={9.5} color="#7D1C3A" strokeWidth={2.4} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* Online Meetings Pill */}
              <TouchableOpacity
                style={styles.clayBottomTouch}
                onPress={() => navigation.navigate('OnlineMeetings')}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#2563EB', '#1D4ED8', '#143896']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.clayBottomPill, { borderColor: '#5C91FA' }]}
                >


                  {/* 3D Online Meetings Laptop Icon */}
                  <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                    <Image
                      source={require('../../assets/3d_online_meetings.png')}
                      style={{ width: 30, height: 30 }}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={{ flex: 1, zIndex: 2, marginHorizontal: 3, justifyContent: 'center', paddingRight: 16 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 11.5, lineHeight: 13.5, fontWeight: '800', letterSpacing: -0.2 }]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      Online{'\n'}Meetings
                    </Text>
                  </View>

                  <View style={[styles.clayArrowCircleXs, { position: 'absolute', right: 5, bottom: 5 }]}>
                    <ArrowUpRight size={9.5} color="#1D4ED8" strokeWidth={2.4} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* YouTube Pill */}
              <TouchableOpacity
                style={styles.clayBottomTouch}
                onPress={() => {
                  const yUrl = activeChurch?.socialLinks?.youtube?.trim();
                  if (yUrl) {
                    navigation.navigate('YouTubeLive', { channelUrl: yUrl });
                  } else {
                    setAlertConfig({
                      visible: true,
                      title: 'Link Not Configured',
                      message: 'No YouTube Live link has been configured for this church. Please go to Church Settings and set the YouTube Live link.',
                      type: 'info'
                    });
                  }
                }}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#182624', '#101817', '#0A100F']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.clayBottomPill, { borderColor: '#243835' }]}
                >


                  {/* 3D YouTube Icon */}
                  <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                    <Image
                      source={require('../../assets/3d_youtube.png')}
                      style={{ width: 30, height: 30 }}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={{ flex: 1, zIndex: 2, marginHorizontal: 3, justifyContent: 'center', paddingRight: 16 }}>
                    <Text
                      style={[styles.clayCardTitle, { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', letterSpacing: -0.2 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {t('home.quickYoutubeLive') || 'YouTube Live'}
                    </Text>
                  </View>

                  <View style={[styles.clayArrowCircleXs, { position: 'absolute', right: 5, bottom: 5 }]}>
                    <ArrowUpRight size={9.5} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
        </View>

          {/* ── Arched Navigation Section ── */}
          <View style={{ marginTop: 4, marginBottom: 30, width: '100%', height: 165, alignItems: 'center' }}>
            <View style={{ position: 'absolute', top: 32, left: 0, right: 0, height: 100 }}>
              <Svg width={width} height={100}>
                <Path
                  d={`M -20 70 Q ${width/2} -60 ${width + 20} 70`}
                  stroke={isDark ? '#3b82f6' : 'rgba(82, 124, 120, 0.45)'}
                  strokeWidth={2}
                  strokeDasharray="7, 6"
                  fill="none"
                />
              </Svg>
            </View>

            <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', paddingHorizontal: 32, alignItems: 'flex-start', paddingTop: 10 }}>
              {/* About Us */}
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 25, width: 86 }}
                onPress={() => navigation.navigate('AboutUs')}
                activeOpacity={0.82}
              >
                <View style={[styles.archMedallionOuter, { shadowColor: '#E11D48' }]}>
                  <LinearGradient
                    colors={['#FFF1F2', '#FFE4E6']}
                    style={styles.archMedallionInner}
                  >
                    <Users size={25} color="#E11D48" strokeWidth={2.2} />
                  </LinearGradient>
                </View>
                <Text style={{ color: isDark ? '#f8fafc' : '#0B1938', fontWeight: '800', fontSize: 13, textAlign: 'center' }}>{t('home.aboutUs')}</Text>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center' }}>{t('home.aboutUsSub')}</Text>
              </TouchableOpacity>

              {/* Contact Us */}
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: -5, width: 86 }}
                onPress={() => navigation.navigate('ContactUs')}
                activeOpacity={0.82}
              >
                <View style={[styles.archMedallionOuter, { shadowColor: '#7C3AED' }]}>
                  <LinearGradient
                    colors={['#F5F3FF', '#EDE9FE']}
                    style={styles.archMedallionInner}
                  >
                    <MessageSquare size={25} color="#7C3AED" strokeWidth={2.2} />
                  </LinearGradient>
                </View>
                <Text style={{ color: isDark ? '#f8fafc' : '#0B1938', fontWeight: '800', fontSize: 13, textAlign: 'center' }}>{t('home.contactUs')}</Text>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center' }}>{t('home.contactUsSub')}</Text>
              </TouchableOpacity>

              {/* Gallery */}
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 25, width: 86 }}
                onPress={() => navigation.navigate('Gallery')}
                activeOpacity={0.82}
              >
                <View style={[styles.archMedallionOuter, { shadowColor: '#355B56' }]}>
                  <LinearGradient
                    colors={['#E4EEEA', '#D1E5DF']}
                    style={styles.archMedallionInner}
                  >
                    <LucideImage size={25} color="#355B56" strokeWidth={2.2} />
                  </LinearGradient>
                </View>
                <Text style={{ color: isDark ? '#f8fafc' : '#0B1938', fontWeight: '800', fontSize: 13, textAlign: 'center' }}>{t('home.gallery')}</Text>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center' }}>{t('home.gallerySub')}</Text>
              </TouchableOpacity>
            </View>
          </View>


          {/* ─── Upcoming Events ─── */}
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} color={isDark ? '#FCD34D' : '#1a2d5a'} />
              <Text style={[styles.sectionHeaderTxt, { color: isDark ? '#f1f5f9' : '#1a2d5a' }]}>{t('home.upcomingEvents')}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Events')}>
              <Text style={[styles.sectionSeeAll, { color: isDark ? '#FCD34D' : '#1a2d5a' }]}>{t('home.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.eventBanner}>
            <View style={styles.ebList}>
              {events.length > 0 ? (
                events.map((item: any, index: number) => (
                  <View key={`${item.id || 'evt'}-${index}`}>
                    <TouchableOpacity 
                      style={styles.ebItem} 
                      onPress={() => navigation.navigate('EventDetails', { event: item })}
                    >
                      <View style={styles.ebThumbnailContainer}>
                        <Image 
                          source={{ uri: item.image || item.bannerUrl || 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=400' }}
                          style={styles.ebThumbnail}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={styles.ebInfo}>
                        <Text style={styles.ebTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                        
                        <View style={styles.highlightRow}>
                          <View style={styles.dateBadge}>
                            <Calendar size={11} color="#1a2d5a" />
                            <Text style={styles.badgeTextMain}>
                              {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {item.endDate && item.endDate !== item.date ? ` – ${new Date(item.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                            </Text>
                          </View>
                        </View>
  
                        <View style={[styles.highlightRow, { marginTop: 4 }]}>
                          <View style={styles.timeBadge}>
                            <Play size={8} color="#c0392b" fill="#c0392b" style={{ transform: [{ rotate: '90deg' }] }} />
                            <Text style={styles.timeBadgeText}>{formatTime(item.startTime)} – {formatTime(item.endTime)}</Text>
                          </View>
                        </View>
  
                        <View style={[styles.ebMetaRow, { marginTop: 6, alignItems: 'flex-start' }]}>
                          <MapPin size={11} color="#64748b" style={{ marginTop: 2 }} />
                          <Text style={styles.ebMetaText}>{item.address || item.location || t('home.churchMainHall')}</Text>
                        </View>
                        
                        <Text style={styles.ebDetailsLink}>{t('home.details')}</Text>
                      </View>
                    </TouchableOpacity>
                    {index < events.length - 1 && <View style={styles.ebDivider} />}
                  </View>
                ))
              ) : (
                <View style={styles.emptyEvents}>
                  <Calendar size={32} color="#94a3b8" />
                  <Text style={styles.emptyEventsTxt}>{t('events.noUpcomingEvents')}</Text>
                  <Text style={styles.emptyEventsSub}>{t('home.emptyEventsSub')}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ─── Latest Sermon ─── */}
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Mic size={16} color={isDark ? '#FCD34D' : '#1a2d5a'} />
              <Text style={[styles.sectionHeaderTxt, { color: isDark ? '#f1f5f9' : '#1a2d5a' }]}>{t('sermons.latestSermon')}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Sermons')}>
              <Text style={[styles.sectionSeeAll, { color: isDark ? '#FCD34D' : '#1a2d5a' }]}>{t('home.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sermonCard}>
            <TouchableOpacity style={styles.scBody} onPress={() => latestSermon ? navigation.navigate('SermonVideo', { sermonData: latestSermon }) : navigation.navigate('Sermons')}>
              <View style={styles.scThumb}>
                {(() => {
                  const yId = extractYoutubeId(latestSermon?.youtubeId || '');
                  const thumbUri = latestSermon?.thumbnailUrl || latestSermon?.imageUrl || (yId && yId.length === 11 ? `https://img.youtube.com/vi/${yId}/hqdefault.jpg` : null);
                  return thumbUri ? (
                    <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  ) : null;
                })()}
                <View style={styles.playIconOverlay}>
                   <Play size={20} color="#fff" fill="#c0392b" />
                </View>
              </View>
              <View style={styles.scInfo}>
                <Text style={styles.scTitle} numberOfLines={1}>
                  {latestSermon?.title || t('home.exploreSermons')}
                </Text>
                {latestSermon?.titleTelugu ? (
                  <Text style={styles.scTitleTe} numberOfLines={1}>{latestSermon.titleTelugu}</Text>
                ) : null}
                <Text style={styles.scMeta} numberOfLines={1}>
                  {latestSermon?.pastor || t('sermons.pastor')}
                  {latestSermon?.date ? ` • ${formatDateDisplay(latestSermon.date)}` : ''}
                  {latestSermon?.duration && formatSermonDuration(latestSermon.duration) ? ` • ${formatSermonDuration(latestSermon.duration)}` : ''}
                </Text>
              </View>
              <View style={styles.playBtnCircle}>
                <Play size={18} color="#1a2d5a" />
              </View>
            </TouchableOpacity>
          </View>

          {/* ─── Prayer Wall ─── */}
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Heart size={16} color={isDark ? '#FCD34D' : '#1a2d5a'} fill={isDark ? 'rgba(252,211,77,0.2)' : 'rgba(26,45,90,0.15)'} />
              <Text style={[styles.sectionHeaderTxt, { color: isDark ? '#f1f5f9' : '#1a2d5a' }]}>{t('prayer.title')}</Text>
            </View>
            <TouchableOpacity onPress={() => handleGuestProtectedNavigation('Prayer')}>
              <Text style={[styles.sectionSeeAll, { color: isDark ? '#FCD34D' : '#1a2d5a' }]}>{t('home.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.prayerCard, { marginBottom: 40 }]}>
            <TouchableOpacity style={styles.pcBody} onPress={() => handleGuestProtectedNavigation('Prayer')}>
              <View style={styles.pcTextContainer}>
                <Text style={styles.pcText} numberOfLines={3}>
                  {latestPrayer ? `"${latestPrayer.text}" — ${latestPrayer.name}` : t('home.prayerDefaultPrompt')}
                </Text>
              </View>
              <View style={styles.pcFoot}>
                <TouchableOpacity style={styles.prayedBtn} onPress={() => Alert.alert(t('home.prayedAlertTitle'), t('home.prayedAlertMsg'))}>
                   <CheckCircle size={14} color="#1a2d5a" />
                   <Text style={styles.prayedBtnTxt}>{t('home.iPrayedBtn')}</Text>
                </TouchableOpacity>
                <Text style={styles.pcSeeAll}>{prayerCount} {t('home.prayerRequestsCount')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.ScrollView>

      {liveCelebrations.length > 0 && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.floatingBtnContainer,
            { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
          ]}
        >
          <Animated.View style={{ transform: [{ scale: waveAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={() => navigation.navigate('LiveCelebrationsChat', { celebrations: liveCelebrations })}
              style={styles.floatingBtn}
            >
              <Animated.Text style={[styles.floatingEmoji, { opacity: emojiAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                {getEmoji()}
              </Animated.Text>
              <View style={styles.floatingIndicator} />
              {unreadLiveMsgs > 0 && (
                <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{unreadLiveMsgs}</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.floatingLabel}>{t('home.liveCelebrations')}</Text>
        </Animated.View>
      )}

      {/* Hidden capture view for saving daily verse card */}
      {captureVerseConfig && (
        <View style={{ position: 'absolute', top: -10000, left: -10000 }}>
          <ViewShot ref={captureVerseRef} options={{ format: 'png', quality: 1 }}>
            <View style={{ width, height: width * 1.5, backgroundColor: '#0a1945' }} collapsable={false}>
              {captureVerseConfig.verse.backgroundUrl ? (
                <Image
                  source={{ uri: captureVerseConfig.verse.backgroundUrl }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
              ) : null}
              <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.88)']}
                style={StyleSheet.absoluteFillObject}
              />
              {(() => {
                const capLoc = getLocalizedVerse(captureVerseConfig.verse, language);
                const capGreeting = getPeriodGreeting(captureVerseConfig.period, t);
                const Icon = captureVerseConfig.theme.Icon;
                return (
                  <View style={{ flex: 1, padding: 26, justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: captureVerseConfig.theme.color, justifyContent: 'center', alignItems: 'center' }}>
                        <Icon color="#fff" size={26} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 20, fontWeight: '900', color: captureVerseConfig.theme.color, letterSpacing: 1.2 }}>
                          {capGreeting.toUpperCase()}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#fff', opacity: 0.8, fontWeight: '600', marginTop: 2 }}>
                          {new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', marginVertical: 20 }}>
                      <View style={{ width: 4, borderRadius: 2, backgroundColor: captureVerseConfig.theme.color, marginRight: 16 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#ffffff', fontSize: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', lineHeight: 30, marginBottom: capLoc.secondaryVerse && capLoc.secondaryVerse !== capLoc.primaryVerse ? 14 : 0 }}>
                          "{stripHtml(capLoc.primaryVerse)}"
                        </Text>
                        {capLoc.secondaryVerse && capLoc.secondaryVerse !== capLoc.primaryVerse ? (
                          <Text style={{ color: '#ffffff', fontSize: 18, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '600', fontStyle: 'italic', lineHeight: 28, opacity: 0.95 }}>
                            "{stripHtml(capLoc.secondaryVerse)}"
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={{ alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 16 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: captureVerseConfig.theme.color, letterSpacing: 0.5 }}>
                        {capLoc.secondaryReference && capLoc.secondaryReference !== capLoc.primaryReference
                          ? `${capLoc.primaryReference}   —   ${capLoc.secondaryReference}`
                          : capLoc.primaryReference}
                      </Text>
                      {activeChurch?.name ? (
                        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 8, fontWeight: '700', letterSpacing: 0.5 }}>
                          {activeChurch.name}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })()}
            </View>
          </ViewShot>
        </View>
      )}

      {/* Hidden capture view for Today's Promise fallback card */}
      {promise && (
        <View style={{ position: 'absolute', top: -10000, left: -10000 }}>
          <ViewShot ref={capturePromiseRef} options={{ format: 'png', quality: 1 }}>
            <View style={{ width, minHeight: width * 1.35, backgroundColor: '#0a1945' }} collapsable={false}>
              <LinearGradient
                colors={['#17357a', '#0a1945']}
                style={StyleSheet.absoluteFillObject}
              />
              {/* Decorative circles */}
              <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.15)' }} />
              <View style={{ position: 'absolute', top: -10, right: -10, width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.1)' }} />
              <View style={{ position: 'absolute', bottom: -50, left: -20, width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.1)' }} />

              <View style={{ flex: 1, padding: 26, justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#fbbf24', letterSpacing: 1.5 }}>
                    {t('home.todaysPromise')}
                  </Text>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginTop: 4 }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>

                <View style={{ marginVertical: 20 }}>
                  <Text style={{ color: '#ffffff', fontSize: 19, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '600', fontStyle: 'italic', lineHeight: 28 }}>
                    "{stripHtml(promise.verse || '')}"
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fbbf24', marginTop: 6, textAlign: 'right' }}>
                    — {promise.verseReferenceEn || promise.verseReference || 'Scripture'}
                  </Text>

                  {promise.verseTelugu ? (
                    <>
                      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 14 }} />
                      <Text style={{ color: '#ffffff', fontSize: 18, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '600', lineHeight: 28 }}>
                        "{stripHtml(promise.verseTelugu)}"
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fbbf24', marginTop: 6, textAlign: 'right' }}>
                        — {promise.verseReferenceTe || 'వాగ్దానం'}
                      </Text>
                    </>
                  ) : null}
                </View>

                <View style={{ alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 16 }}>
                  {((isImpersonating && impersonatedBranchName) ? impersonatedBranchName : (activeChurch?.name || (member as any)?.churchName || (authMember as any)?.churchName)) ? (
                    <Text style={{ fontSize: 15, color: '#ffffff', fontWeight: '800', letterSpacing: 0.5 }}>
                      {(isImpersonating && impersonatedBranchName) ? impersonatedBranchName : (activeChurch?.name || (member as any)?.churchName || (authMember as any)?.churchName)} 🙏
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </ViewShot>
        </View>
      )}

      {/* Saving / Sharing Card Overlay Spinner */}
      {(isSavingCard || isSharingCard) && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={{ color: '#ffffff', marginTop: 14, fontWeight: '700', fontSize: 15 }}>
              {isSharingCard ? 'Preparing card to share...' : 'Saving card to gallery...'}
            </Text>
          </View>
        </View>
      )}



    </View>
  );
}

function GridItem({
  icon,
  label,
  color,
  gradient,
  onPress,
  isDark,
}: {
  icon: any;
  label: string;
  color: string;
  gradient?: readonly [string, string];
  onPress: () => void;
  isDark: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.91,
      useNativeDriver: true,
      speed: 35,
      bounciness: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 25,
      bounciness: 8,
    }).start();
  };

  const gradColors: readonly [string, string] = gradient || [color, color];

  return (
    <Pressable
      style={styles.iconItem}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.iconCardFrame,
          {
            shadowColor: color,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={gradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconBox}
        >
          {/* Specular Glass Highlight Circles */}
          <View style={styles.iconShineTop} pointerEvents="none" />
          <View style={styles.iconShineBottom} pointerEvents="none" />
          <View style={styles.iconInnerRing} pointerEvents="none" />
          {icon}
        </LinearGradient>
      </Animated.View>
      <Text
        style={[styles.iconLbl, { color: isDark ? '#e2e8f0' : '#1E293B' }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.15}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Brown Treasure Pot with Brown Handles, Gold Color Lines:
// Coins fall one-by-one from the top and visibly fill the pot across the edge of the pot mouth!
// Once the pot mouth is filled, the remaining coins hit the edge, overflow, and fall onto the ground.
const GoldCoinFace = ({ size = 15 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 30 30">
    <Defs>
      <SvgRadialGradient id="brownPotCoinGrad" cx="35%" cy="30%" rx="80%" ry="80%" fx="35%" fy="30%">
        <Stop offset="0" stopColor="#FFF9C7" />
        <Stop offset="0.35" stopColor="#FFD700" />
        <Stop offset="0.75" stopColor="#F5B800" />
        <Stop offset="1" stopColor="#A86E06" />
      </SvgRadialGradient>
    </Defs>
    {/* 3D Dark Gold Base Rim */}
    <Circle cx={15} cy={16.5} r={13} fill="#6E4403" />
    {/* Shiny Gold Coin Face */}
    <Circle cx={15} cy={14} r={13} fill="url(#brownPotCoinGrad)" stroke="#7D4E03" strokeWidth={1.2} />
    {/* Inner Decorative Milled Ring */}
    <Circle cx={15} cy={14} r={9.5} fill="none" stroke="#9A690B" strokeWidth={1} strokeDasharray="2.5,2" opacity={0.8} />
    {/* Currency Symbol ₹ */}
    <SvgText x={15} y={18.5} fontSize={12} fontWeight="bold" fill="#6B4102" textAnchor="middle">₹</SvgText>
    {/* Specular Glint */}
    <Ellipse cx={10} cy={8.5} rx={4.5} ry={2.2} fill="#FFFFFF" opacity={0.7} />
  </Svg>
);

const GiveCoins = ({ scrollY, triggerY }: { scrollY?: Animated.Value; triggerY?: number }) => {
  const t = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const isPlaying = useRef(false);

  useEffect(() => {
    const startLoop = () => {
      if (isPlaying.current) return;
      isPlaying.current = true;
      t.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(t, {
          toValue: 1,
          duration: 10800,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loopRef.current.start();
    };

    const stopLoop = () => {
      if (!isPlaying.current) return;
      isPlaying.current = false;
      loopRef.current?.stop();
      t.setValue(0);
    };

    if (!scrollY || triggerY === undefined || triggerY <= 0) {
      // Fallback: start loop if no scroll trigger provided
      startLoop();
      return () => stopLoop();
    }

    const windowHeight = Dimensions.get('window').height;
    // Account for header & scroll offsets so it triggers when user scrolls to Quick Access
    const absoluteY = triggerY + 140;

    // Start loop if already in view
    startLoop();

    const listenerId = scrollY.addListener(({ value }) => {
      // It becomes visible when Quick Access scrolls into view
      const isVisible = (value + windowHeight >= absoluteY + 50) && (value <= absoluteY + 750);
      if (isVisible) {
        startLoop();
      } else {
        stopLoop();
      }
    });

    return () => {
      if (scrollY && listenerId) {
        try {
          scrollY.removeListener(listenerId);
        } catch (_) {}
      }
      stopLoop();
    };
  }, [scrollY, triggerY]);

  const seg = (pts: [number, number][]) => {
    // Ensure inputRange is strictly monotonically non-decreasing (prevents Invariant Violation from float precision)
    const input: number[] = [];
    const output: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      let x = pts[i][0];
      const y = pts[i][1];
      if (input.length > 0 && x <= input[input.length - 1]) {
        x = input[input.length - 1] + 0.0001;
      }
      input.push(x);
      output.push(y);
    }
    return t.interpolate({
      inputRange: input,
      outputRange: output,
    });
  };

  // Stage 1: Initial 4 coins slowly fall straight into the pot mouth and go inside to fill the belly
  const fillingCoins = [
    { start: 0.02, landT: 0.10, startX: 50, landX: 47, landY: 23 },
    { start: 0.11, landT: 0.19, startX: 54, landX: 52, landY: 21 },
    { start: 0.20, landT: 0.28, startX: 48, landX: 46, landY: 22 },
    { start: 0.29, landT: 0.37, startX: 52, landX: 50, landY: 20 },
  ].map((c, i) => (
    <Animated.View
      key={'fc' + i}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 14,
        height: 14,
        zIndex: 10 + i,
        opacity: seg([
          [0, 0],
          [c.start, 0],
          [c.start + 0.01, 1],
          [c.landT - 0.015, 1],
          [c.landT + 0.005, 0],
          [1, 0],
        ]),
        transform: [
          {
            translateX: seg([
              [0, c.startX],
              [c.start, c.startX],
              [c.landT, c.landX],
              [1, c.landX],
            ]),
          },
          {
            translateY: seg([
              [0, -18],
              [c.start, -18],
              [c.start + 0.03, 6],
              [c.landT, c.landY],
              [1, c.landY],
            ]),
          },
          {
            scaleX: seg([
              [0, 1],
              [c.start, 1],
              [c.start + 0.02, 0.4],
              [c.landT, 1],
              [1, 1],
            ]),
          },
          {
            scaleY: seg([
              [0, 1],
              [c.landT - 0.02, 1],
              [c.landT, 0.6],
              [1, 0.6],
            ]),
          },
        ],
      }}
    >
      <GoldCoinFace size={14} />
    </Animated.View>
  ));

  // Summit Coin: Drops and settles with a realistic bounce on top of the crest heap!
  const summitCoin = (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 14,
        height: 14,
        zIndex: 22,
        opacity: seg([
          [0, 0],
          [0.60, 0],
          [0.61, 1],
          [0.94, 1],
          [0.98, 0],
          [1, 0],
        ]),
        transform: [
          { translateX: 47 },
          {
            translateY: seg([
              [0, -18],
              [0.60, -18],
              [0.63, 4],
              [0.65, 12],
              [0.66, 10.5],
              [0.67, 12],
              [1, 12],
            ]),
          },
          {
            scaleX: seg([
              [0, 1],
              [0.60, 1],
              [0.63, 0.35],
              [0.66, 1],
              [1, 1],
            ]),
          },
          {
            scaleY: seg([
              [0, 1],
              [0.65, 1],
              [0.66, 0.65],
              [1, 0.65],
            ]),
          },
        ],
      }}
    >
      <GoldCoinFace size={14} />
    </Animated.View>
  );

  // Stage 2: Once the pot mouth is overflowing, subsequent coins tumble over the mouth heap and brown handles onto the ground!
  const overflowingGroundCoins = [
    // Bounces left past left brown handle into left ground pile
    { start: 0.68, hitT: 0.73, landT: 0.79, startX: 52, bounceX: 22, groundX: 12, groundY: 60, rot: '-22deg' },
    // Bounces right past right brown handle into right ground pile
    { start: 0.74, hitT: 0.79, landT: 0.85, startX: 52, bounceX: 82, groundX: 88, groundY: 60, rot: '24deg' },
    // Tumbles down center-front into front ground pile
    { start: 0.80, hitT: 0.85, landT: 0.91, startX: 52, bounceX: 42, groundX: 38, groundY: 65, rot: '-14deg' },
    // Tumbles down front-right into front ground scatter
    { start: 0.86, hitT: 0.91, landT: 0.96, startX: 52, bounceX: 64, groundX: 62, groundY: 66, rot: '12deg' },
  ].map((c, i) => (
    <Animated.View
      key={'ogc' + i}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 14,
        height: 14,
        zIndex: 25 + i,
        opacity: seg([
          [0, 0],
          [c.start, 0],
          [c.start + 0.01, 1],
          [0.94, 1],
          [0.98, 0],
          [1, 0],
        ]),
        transform: [
          {
            translateX: seg([
              [0, c.startX],
              [c.start, c.startX],
              [c.hitT, c.bounceX],
              [c.landT, c.groundX],
              [1, c.groundX],
            ]),
          },
          {
            translateY: seg([
              [0, -18],
              [c.start, -18],
              [c.hitT, 16],
              [c.hitT + 0.02, 30],
              [c.landT - 0.01, c.groundY - 5],
              [c.landT, c.groundY],
            ]),
          },
          {
            scaleX: seg([
              [0, 1],
              [c.start, 1],
              [c.hitT, 0.4],
              [c.hitT + 0.02, 1],
              [c.landT, 0.9],
              [1, 0.9],
            ]),
          },
          {
            scaleY: seg([
              [0, 1],
              [c.landT - 0.01, 1],
              [c.landT, 0.55],
              [1, 0.55],
            ]),
          },
          {
            rotate: c.rot,
          },
        ],
      }}
    >
      <GoldCoinFace size={14} />
    </Animated.View>
  ));

  // Stage 3: REAL GOLD COINS BED ON THE GROUND!
  const groundCoinsList = [
    // Left Ground Pile (stacked coin edges & tilted coins)
    { x: 10, y: 62, size: 14, scaleY: 0.48, rot: '0deg', z: 1 },
    { x: 10, y: 60.5, size: 14, scaleY: 0.48, rot: '0deg', z: 2 },
    { x: 10, y: 59, size: 14, scaleY: 0.48, rot: '0deg', z: 3 },
    { x: 14, y: 56, size: 14, scaleY: 0.55, rot: '-20deg', z: 5 },
    { x: 2, y: 64, size: 13, scaleY: 0.48, rot: '10deg', z: 2 },
    { x: 2, y: 62.5, size: 13, scaleY: 0.48, rot: '10deg', z: 3 },
    { x: 6, y: 69, size: 13, scaleY: 0.45, rot: '15deg', z: 4 },
    { x: 18, y: 70, size: 13, scaleY: 0.45, rot: '-12deg', z: 4 },
    { x: 26, y: 71, size: 13, scaleY: 0.45, rot: '6deg', z: 4 },

    // Right Ground Pile (stacked coin edges & tilted coins)
    { x: 80, y: 62, size: 14, scaleY: 0.48, rot: '0deg', z: 1 },
    { x: 80, y: 60.5, size: 14, scaleY: 0.48, rot: '0deg', z: 2 },
    { x: 80, y: 59, size: 14, scaleY: 0.48, rot: '0deg', z: 3 },
    { x: 76, y: 56, size: 14, scaleY: 0.55, rot: '22deg', z: 5 },
    { x: 90, y: 64, size: 13, scaleY: 0.48, rot: '-8deg', z: 2 },
    { x: 90, y: 62.5, size: 13, scaleY: 0.48, rot: '-8deg', z: 3 },
    { x: 94, y: 69, size: 13, scaleY: 0.45, rot: '-16deg', z: 4 },
    { x: 84, y: 70, size: 13, scaleY: 0.45, rot: '10deg', z: 4 },
    { x: 72, y: 71, size: 13, scaleY: 0.45, rot: '-5deg', z: 4 },

    // Front Center Overlapping Coins (exact match to reference image: large prominent tilted coins!)
    { x: 38, y: 63, size: 16, scaleY: 0.65, rot: '-26deg', z: 8 },
    { x: 52, y: 63, size: 16, scaleY: 0.65, rot: '28deg', z: 9 },
    { x: 45, y: 68, size: 15, scaleY: 0.50, rot: '-4deg', z: 10 },
    { x: 32, y: 72, size: 12, scaleY: 0.45, rot: '12deg', z: 6 },
    { x: 62, y: 72, size: 12, scaleY: 0.45, rot: '-10deg', z: 6 },
  ];

  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 2, bottom: 2, width: 108, height: 78 }}>
      {/* 1. Ground Shadow under pot and surrounding coins */}
      <Svg width={108} height={20} viewBox="0 0 108 20" style={{ position: 'absolute', left: 0, bottom: 0 }}>
        <Ellipse cx={54} cy={12} rx={50} ry={6} fill="#000000" opacity={0.6} />
      </Svg>

      {/* 2. Pot Opening Cavity (Dark inside mouth behind coins) */}
      <Svg width={80} height={56} viewBox="0 0 80 56" style={{ position: 'absolute', left: 14, bottom: 6 }}>
        <Ellipse cx={40} cy={8} rx={16} ry={4} fill="#120A02" />
      </Svg>

      {/* 3. Coins falling straight into the pot to fill the belly */}
      {fillingCoins}

      {/* 4. BROWN TREASURE POT WITH BROWN HANDLES & GOLD COLOR LINES */}
      <Svg width={80} height={56} viewBox="0 0 80 56" style={{ position: 'absolute', left: 14, bottom: 6 }}>
        <Defs>
          <SvgLinearGradient id="treasurePotBodyGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#1C1107" />
            <Stop offset="0.35" stopColor="#5C3F14" />
            <Stop offset="0.6" stopColor="#3C270A" />
            <Stop offset="1" stopColor="#140B03" />
          </SvgLinearGradient>
          <SvgLinearGradient id="handleBrownGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#2E1706" />
            <Stop offset="0.5" stopColor="#5C3B14" />
            <Stop offset="1" stopColor="#261203" />
          </SvgLinearGradient>
          <SvgLinearGradient id="treasurePotGoldLinesGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#B07A10" />
            <Stop offset="0.45" stopColor="#FFE680" />
            <Stop offset="1" stopColor="#B07A10" />
          </SvgLinearGradient>
        </Defs>

        {/* Brown Side Handles on Bulbous Pot Belly */}
        <Circle cx={8} cy={28} r={4.5} fill="none" stroke="url(#handleBrownGrad)" strokeWidth={2.6} />
        <Circle cx={72} cy={28} r={4.5} fill="none" stroke="url(#handleBrownGrad)" strokeWidth={2.6} />

        {/* Pot Body Silhouette (Flared mouth, slender neck, bulbous round pot belly, flat base) */}
        <Path
          d="M25 8 C25 12 28 14 28 16 C28 18 12 24 12 34 C12 46 24 52 40 52 C56 52 68 46 68 34 C68 24 52 18 52 16 C52 14 55 12 55 8 Z"
          fill="url(#treasurePotBodyGrad)"
          stroke="#E0B040"
          strokeWidth={0.8}
        />

        {/* Gold Color Lines: Horizontal Bands Across the Bulbous Pot Belly */}
        <Path d="M14 26 C24 31 56 31 66 26" fill="none" stroke="url(#treasurePotGoldLinesGrad)" strokeWidth={2.2} />
        <Path d="M14 40 C24 45 56 45 66 40" fill="none" stroke="url(#treasurePotGoldLinesGrad)" strokeWidth={1.6} />

        {/* Gold Color Line Around the Slender Pot Neck */}
        <Path d="M28 16 C34 19 46 19 52 16" fill="none" stroke="url(#treasurePotGoldLinesGrad)" strokeWidth={1.8} />

        {/* Flared Gold Top Mouth Rim */}
        <Ellipse cx={40} cy={8} rx={16} ry={4} fill="none" stroke="url(#treasurePotGoldLinesGrad)" strokeWidth={2.6} />
        <Path d="M24 8 C24 13 56 13 56 8" fill="none" stroke="url(#treasurePotGoldLinesGrad)" strokeWidth={2.2} strokeLinecap="round" />

        {/* Pot Surface Highlights */}
        <Path d="M18 24 C15 30 16 38 20 44" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" opacity={0.42} />

        {/* Gold Pedestal Feet */}
        <Ellipse cx={28} cy={52} rx={6} ry={1.8} fill="#E0B040" />
        <Ellipse cx={52} cy={52} rx={6} ry={1.8} fill="#E0B040" />
      </Svg>

      {/* 5. OVERFLOWING COIN HEAP AT POT MOUTH (Blooms and rises from pot mouth naturally as coins fill it!) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 108,
          height: 78,
          zIndex: 18,
          opacity: seg([
            [0, 0],
            [0.37, 0],
            [0.42, 0.25],
            [0.48, 0.55],
            [0.54, 0.80],
            [0.60, 1.0],
            [0.94, 1],
            [0.98, 0],
            [1, 0],
          ]),
          transform: [
            {
              scale: seg([
                [0, 0.25],
                [0.37, 0.25],
                [0.42, 0.45],
                [0.48, 0.70],
                [0.54, 0.88],
                [0.60, 1.0],
                [1, 1.0],
              ]),
            },
            {
              translateY: seg([
                [0, 10],
                [0.37, 10],
                [0.42, 7.5],
                [0.48, 4.5],
                [0.54, 2],
                [0.60, 0],
                [1, 0],
              ]),
            },
          ],
        }}
      >
        <Svg width={108} height={78} viewBox="0 0 108 78">
          <Defs>
            <SvgRadialGradient id="moundCoinGold" cx="35%" cy="30%" rx="80%" ry="80%">
              <Stop offset="0" stopColor="#FFFAD2" />
              <Stop offset="0.3" stopColor="#FFD700" />
              <Stop offset="0.75" stopColor="#E6A800" />
              <Stop offset="1" stopColor="#8C5803" />
            </SvgRadialGradient>
          </Defs>

          {/* Layer 1: Base coins nestled across the mouth rim opening */}
          <Ellipse cx={54} cy={24} rx={14} ry={3.8} fill="url(#moundCoinGold)" stroke="#6E3F02" strokeWidth={0.8} />

          {/* Layer 2: Tilted coins forming the middle mound */}
          <G transform="rotate(-20, 46, 20)">
            <Ellipse cx={46} cy={20} rx={6.2} ry={4.2} fill="url(#moundCoinGold)" stroke="#6E3F02" strokeWidth={0.8} />
            <Ellipse cx={46} cy={20} rx={4.5} ry={2.8} fill="none" stroke="#9A690B" strokeWidth={0.5} strokeDasharray="1.5,1.2" opacity={0.7} />
            <Ellipse cx={44} cy={18.5} rx={2} ry={1.2} fill="#FFFFFF" opacity={0.75} />
          </G>

          <G transform="rotate(22, 62, 20)">
            <Ellipse cx={62} cy={20} rx={6.2} ry={4.2} fill="url(#moundCoinGold)" stroke="#6E3F02" strokeWidth={0.8} />
            <Ellipse cx={62} cy={20} rx={4.5} ry={2.8} fill="none" stroke="#9A690B" strokeWidth={0.5} strokeDasharray="1.5,1.2" opacity={0.7} />
            <Ellipse cx={60} cy={18.5} rx={2} ry={1.2} fill="#FFFFFF" opacity={0.75} />
          </G>

          <G transform="rotate(32, 49, 17)">
            <Ellipse cx={49} cy={17} rx={5.8} ry={3.8} fill="url(#moundCoinGold)" stroke="#6E3F02" strokeWidth={0.8} />
            <Ellipse cx={47.5} cy={15.5} rx={2} ry={1.2} fill="#FFFFFF" opacity={0.75} />
          </G>

          <G transform="rotate(-16, 59, 17)">
            <Ellipse cx={59} cy={17} rx={5.8} ry={3.8} fill="url(#moundCoinGold)" stroke="#6E3F02" strokeWidth={0.8} />
            <Ellipse cx={57.5} cy={15.5} rx={2} ry={1.2} fill="#FFFFFF" opacity={0.75} />
          </G>

          {/* Layer 3: Top crest/summit coins crowning the mound */}
          <G transform="rotate(6, 54, 15)">
            <Ellipse cx={54} cy={15} rx={6.2} ry={4.0} fill="url(#moundCoinGold)" stroke="#6E3F02" strokeWidth={0.8} />
            <Ellipse cx={54} cy={15} rx={4.4} ry={2.6} fill="none" stroke="#9A690B" strokeWidth={0.5} strokeDasharray="1.5,1.2" opacity={0.7} />
            <Ellipse cx={52} cy={13.5} rx={2.2} ry={1.2} fill="#FFFFFF" opacity={0.8} />
          </G>

          {/* Front lip overlapping coins (flowing over the front rim lip) */}
          <G transform="rotate(-8, 54, 23.5)">
            <Ellipse cx={54} cy={23.5} rx={6.8} ry={4.2} fill="url(#moundCoinGold)" stroke="#6E3F02" strokeWidth={0.8} />
            <Ellipse cx={54} cy={23.5} rx={4.8} ry={2.8} fill="none" stroke="#9A690B" strokeWidth={0.5} strokeDasharray="1.5,1.2" opacity={0.7} />
            <Ellipse cx={52} cy={22} rx={2.2} ry={1.2} fill="#FFFFFF" opacity={0.8} />
          </G>
        </Svg>
      </Animated.View>

      {/* 6. Summit Coin (Perched at top of heap, just like the reference image!) */}
      {summitCoin}

      {/* 7. REAL GOLD COINS BED ON GROUND (Visible when overflow begins, matching reference image!) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 108,
          height: 78,
          zIndex: 20,
          opacity: seg([
            [0, 0],
            [0.72, 0],
            [0.78, 0.45],
            [0.84, 0.75],
            [0.90, 0.95],
            [0.94, 1],
            [0.98, 0],
            [1, 0],
          ]),
          transform: [
            {
              scale: seg([
                [0, 0.75],
                [0.72, 0.75],
                [0.78, 0.88],
                [0.86, 0.96],
                [0.92, 1.0],
                [1, 1.0],
              ]),
            },
          ],
        }}
      >
        {groundCoinsList.map((gc, idx) => (
          <View
            key={'gr-coin-' + idx}
            style={{
              position: 'absolute',
              left: gc.x,
              top: gc.y,
              zIndex: gc.z,
              transform: [{ scaleY: gc.scaleY }, { rotate: gc.rot }],
            }}
          >
            <GoldCoinFace size={gc.size} />
          </View>
        ))}
      </Animated.View>

      {/* 8. Dynamic overflowing coins splashing into ground piles */}
      {overflowingGroundCoins}
    </View>
  );
};
const styles = StyleSheet.create({

  floatingBtnContainer: {
    position: 'absolute',
    top: '45%', // middle of the right side
    right: 20,
    alignItems: 'center',
    zIndex: 999,
    elevation: 1000,
  },
  floatingBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.5)', // Gold border
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingEmoji: {
    fontSize: 32,
  },
  floatingIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  floatingLabel: {
    color: '#d4af37',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    backgroundColor: '#1a2d5a',
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden'
  },
  mainContainer: { flex: 1, backgroundColor: '#FAF7F2' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a2d5a' },
  screenLoadingText: { color: '#FCD34D', marginTop: 15, fontSize: 14, fontWeight: '700' },
  
  scroll: { flex: 1 },
  contentPad: { paddingBottom: 160 },
  
  // ── Top Two Sections (Church Header Row + Light-Blue Greeting Card) ──
  topBgCurveBlue: {
    position: 'absolute',
    top: -45,
    right: 10,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(186, 230, 253, 0.5)',
  },
  topBgCurvePeach: {
    position: 'absolute',
    top: -15,
    right: -55,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(254, 215, 170, 0.48)',
  },
  rhemaTopIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 12,
  },
  rhemaLogoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#0E48A8',
    shadowColor: '#082B7A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  rhemaLogoImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  rhemaLogoGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rhemaLogoInitials: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.5,
  },
  rhemaCardTitle: {
    color: '#0B1938',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  rhemaCardSubtitle: {
    color: '#5A708E',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  rhemaBellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0B1938',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  rhemaBellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F95738',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  rhemaGreetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  greetingShapeMidCyan: {
    position: 'absolute',
    top: -40,
    right: 25,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(147, 197, 253, 0.45)',
  },
  greetingShapeRightSoftBlue: {
    position: 'absolute',
    top: -20,
    right: -45,
    width: 175,
    height: 175,
    borderRadius: 87.5,
    backgroundColor: 'rgba(186, 230, 253, 0.55)',
  },
  greetingShapeBottomBlueArc: {
    position: 'absolute',
    bottom: -95,
    right: 30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(96, 165, 250, 0.42)',
  },
  greetingShapeBottomLeftPeach: {
    position: 'absolute',
    bottom: -65,
    left: -25,
    width: 170,
    height: 140,
    borderRadius: 80,
    backgroundColor: 'rgba(253, 186, 116, 0.35)',
  },
  rhemaGreetingLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
    justifyContent: 'center',
    zIndex: 2,
  },
  rhemaGreetingRegular: {
    color: '#1E3A5F',
    fontSize: 19,
    fontWeight: '400',
    marginBottom: 3,
  },
  rhemaMemberName: {
    color: '#0B1938',
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: 0.1,
  },
  rhemaBlessedPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(186, 230, 253, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  rhemaBlessedStar: {
    color: '#0055D4',
    fontSize: 12,
    fontWeight: '800',
  },
  rhemaBlessedText: {
    color: '#0055D4',
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  rhemaWhiteDateCard: {
    width: 74,
    flexShrink: 0,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    shadowColor: '#0B1938',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 2,
  },
  rhemaWhiteDateHeader: {
    width: '100%',
    backgroundColor: '#FFE4C4',
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rhemaWhiteDateBody: {
    width: '100%',
    paddingTop: 4,
    paddingBottom: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rhemaDateMonth: {
    color: '#EA580C',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  rhemaDateNumber: {
    color: '#0B1938',
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 31,
  },
  rhemaDateWeekday: {
    color: '#1E295B',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },

  appHeader: {
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  particleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#FCD34D',
    borderRadius: 5,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, justifyContent: 'space-between', zIndex: 2 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, paddingRight: 10 },
  logoCircle: { width: 44, height: 44, backgroundColor: 'transparent', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  logoImg: { width: 44, height: 44, borderRadius: 22 },
  titleCol: { marginLeft: 10, flex: 1, minWidth: 0 },
  hdTitle: { color: '#F3EAD9', fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  hdSub: { color: '#aac4e8', fontSize: 10, marginTop: 1, fontWeight: '500' },
  
  headerRight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, zIndex: 2, flexShrink: 0 },
  actionIconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  notifBadge: { position: 'absolute', top: 8, right: 10, width: 6, height: 6, backgroundColor: '#ef4444', borderRadius: 3 },
  avatarWrapper: { width: 40, height: 40, borderRadius: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  
  goldDivider: { height: 1, marginVertical: 18, width: '100%', opacity: 0.7, zIndex: 2 },
  
  greetingSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 2 },
  greetingLeft: { flex: 1 },
  greetingText: { color: '#FCD34D', fontSize: 22, fontWeight: '400', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', marginBottom: 2, letterSpacing: 0.5, textShadowColor: 'rgba(252, 211, 77, 0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  userNameCream: { color: '#F3EAD9', fontSize: 22, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', letterSpacing: 0.5 },
  
  greetingRight: { alignItems: 'center', justifyContent: 'center', marginLeft: 15 },
  calendarBadgeWrap: { width: 66, height: 66, justifyContent: 'center', alignItems: 'center' },
  calendarTextOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  calMonth: { color: '#F3EAD9', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  calDay: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: -4 },
  calWeekday: { color: '#aac4e8', fontSize: 13, fontWeight: '600', marginTop: 8 },

  promiseHero: {
    marginHorizontal: 0,
    marginTop: 20,
    backgroundColor: 'transparent',
  },
  phSlide: {
    width: width,
    paddingHorizontal: 16,
  },
  phInner: {
    borderRadius: 24,
    padding: 24,
  },
  phThumbnailSlide: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  phThumbnailImg: {
    width: '100%',
    borderRadius: 20,
  },
  // Dot indicators
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'transparent',
    gap: 8,
  },
  dotHit: { padding: 4 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dotActive: {
    width: 22,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0055D4',
  },

  // ── Clean "Our Service Timings" Carousel Slide Styles (No Yellow, Matches Image) ──
  serviceSlideCleanInner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    justifyContent: 'flex-start',
    borderRadius: 20,
    overflow: 'hidden',
  },
  serviceSlideCleanTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  serviceSlideCleanBar: {
    width: 30,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#93C5FD',
    alignSelf: 'center',
    marginTop: 5,
    marginBottom: 14,
  },
  serviceSlideCleanScroll: {
    flex: 1,
  },
  serviceSlideCleanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  serviceSlideCleanLeft: {
    flex: 1,
    paddingRight: 8,
  },
  serviceSlideCleanName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  serviceSlideCleanNote: {
    fontSize: 10.5,
    fontWeight: '400',
    color: '#93C5FD',
    marginTop: 2,
    lineHeight: 14,
  },
  serviceSlideCleanTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
    textAlign: 'right',
    letterSpacing: 0.2,
    paddingTop: 1,
  },
  phLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  phEn: { color: '#fff', fontSize: 15, fontWeight: '600', fontStyle: 'italic', lineHeight: 24, marginBottom: 4 },
  phRefEn: { color: '#FCD34D', fontSize: 12, fontWeight: '700', marginBottom: 15, textAlign: 'right' },
  phDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 15 },
  phTe: { color: '#fff', fontSize: 16, fontStyle: 'italic', lineHeight: 26, marginBottom: 4 },
  phRefTe: { color: '#FCD34D', fontSize: 13, fontWeight: '700', marginBottom: 20, textAlign: 'right' },
  phActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  phShareBtn: { flex: 1, backgroundColor: '#E4EEEA', borderRadius: 14, paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 },
  phWatchBtn: { flex: 1, backgroundColor: '#E4EEEA', borderRadius: 14, paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 },
  phBtnTxt: { color: '#355B56', fontSize: 13, fontWeight: '700' },

  // Clean White Daily Verse Card Styles (Matching reference image)
  vdSlide: {
    width: width,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  vdCleanWhiteCard: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#527C78',
    padding: 20,
    minHeight: 270,
    justifyContent: 'space-between',
  },
  vdWatermarkCircle: {
    position: 'absolute',
    bottom: 35,
    right: -25,
    width: 125,
    height: 125,
    borderRadius: 62.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  vdWatermarkBook: {
    position: 'absolute',
    bottom: 64,
    right: 14,
  },
  vdCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  vdIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vdTitleWrapper: {
    flex: 1,
  },
  vdPeriodTitleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  vdPeriodSubtitleText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  vdMenuDotsBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  vdMenuDotsTxt: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  vdVerseBlock: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  vdVerticalLine: {
    width: 3.5,
    borderRadius: 2,
    backgroundColor: '#93C5FD',
    marginRight: 14,
  },
  vdVerseTextContainer: {
    flex: 1,
    position: 'relative',
    paddingVertical: 2,
    paddingRight: 8,
  },
  vdTopRightQuote: {
    fontSize: 48,
    position: 'absolute',
    top: -12,
    right: 0,
    fontWeight: '900',
    color: 'rgba(255, 255, 255, 0.22)',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  vdVerseTe: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 10,
    paddingRight: 24,
  },
  vdVerseEn: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '400',
    fontStyle: 'italic',
    lineHeight: 23,
    marginBottom: 12,
  },
  vdReferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
    gap: 8,
  },
  vdRefPrimary: {
    color: '#FCD34D',
    fontSize: 13.5,
    fontWeight: '700',
  },
  vdRefDivider: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13.5,
    fontWeight: '600',
  },
  vdRefSecondary: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13.5,
    fontWeight: '600',
  },
  vdActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  vdShareBtn: {
    flex: 1,
    backgroundColor: '#E4EEEA',
    borderRadius: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  vdSaveBtn: {
    flex: 1,
    backgroundColor: '#E4EEEA',
    borderRadius: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  vdShareBtnTxt: {
    color: '#355B56',
    fontSize: 14,
    fontWeight: '700',
  },
  vdSaveBtnTxt: {
    color: '#355B56',
    fontSize: 14,
    fontWeight: '700',
  },

  marqueeWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f1e3d',
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.2)',
  },
  marqueeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: '#1a2d5a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(252,211,77,0.25)',
    gap: 8,
  },
  marqueeTitleEmoji: { fontSize: 16 },
  marqueeTitleText: {
    color: '#FCD34D',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    flex: 1,
  },
  marqueeTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    overflow: 'hidden',
  },
  marqueeTickerBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginHorizontal: 10,
    borderRadius: 5,
  },
  marqueeTickerBadgeTxt: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  marqueeContent: { flex: 1, overflow: 'hidden' },
  marqueeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  marqueeEventDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FCD34D',
    marginRight: 8,
  },
  marqueeItemTitle: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  marqueeItemTitleTe: {
    color: '#FCD34D',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  marqueeTimePill: {
    backgroundColor: 'rgba(252,211,77,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.4)',
  },
  marqueeItemTime: { color: '#FCD34D', fontSize: 12, fontWeight: '800' },
  marqueeItemLoc: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '500',
    marginLeft: 8,
  },
  marqueeSeparator: { color: 'rgba(252,211,77,0.35)', fontSize: 12, marginHorizontal: 4 },
  marqueeLangDivider: { color: 'rgba(255,255,255,0.25)', fontSize: 14, fontWeight: '300', marginHorizontal: 6 },
  marqueeEventDotTe: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FCD34D',
    marginRight: 8,
  },
  marqueeTimePillTe: {
    backgroundColor: 'rgba(252,211,77,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.4)',
  },
  marqueeItemTimeTe: { color: '#FCD34D', fontSize: 12, fontWeight: '800' },
  marqueeItemLocTe: { color: '#94a3b8', fontSize: 11.5, fontWeight: '500', marginLeft: 8 },

  // Section header (external to card)
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 8 },
  sectionHeaderTxt: { fontSize: 16, fontWeight: '800', color: '#1a2d5a' },
  sectionSeeAll: { fontSize: 12, fontWeight: '700', color: '#1a2d5a' },

  // Event Banner (clean card, no header band)
  eventBanner: { marginHorizontal: 16, marginBottom: 4, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, borderWidth: 1, borderColor: '#f1f5f9' },
  ebHd: { backgroundColor: '#1a2d5a', paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ebHdLbl: { fontSize: 12, color: '#fff', fontWeight: '700' },
  ebSeeAll: { fontSize: 11, color: '#aac4e8', fontWeight: '600' },
  ebList: { padding: 0 },
  ebItem: { flexDirection: 'row', padding: 15, alignItems: 'center' },
  ebDivider: { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 15 },
  ebThumbnailContainer: { width: 100, height: 56, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  ebThumbnail: { width: 100, height: 56, borderRadius: 8 },
  ebInfo: { flex: 1 },
  ebTitle: { fontSize: 13.5, fontWeight: '800', color: '#1a2d5a', marginBottom: 5 },
  ebDetailsLink: { fontSize: 10, fontWeight: '800', color: '#1a2d5a', marginTop: 8 },
  highlightRow: { flexDirection: 'row', alignItems: 'center' },
  dateBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fffbeb', 
    paddingHorizontal: 7, 
    paddingVertical: 3, 
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#fef3c7',
    gap: 4
  },
  timeBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#f8fafc', 
    paddingHorizontal: 7, 
    paddingVertical: 3, 
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 4
  },
  badgeTextMain: { fontSize: 9.5, fontWeight: '700', color: '#1a2d5a' },
  badgeTextSub: { fontSize: 9.5, color: '#475569', fontWeight: '500' },
  timeBadgeText: { fontSize: 9, fontWeight: '700', color: '#c0392b' },
  ebMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  
  emptyEvents: { padding: 30, alignItems: 'center', justifyContent: 'center' },
  emptyEventsTxt: { color: '#1a2d5a', fontSize: 13, fontWeight: '700', marginTop: 12 },
  emptyEventsSub: { color: '#94a3b8', fontSize: 11, marginTop: 4 },

    // ── Editorial Bento-Grid Quick Access Styles ──
  bentoSectionWrapper: {
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 16,
  },
  bentoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 3,
  },
  bentoHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0B1938',
    letterSpacing: 0,
  },
  bentoHeaderSubtitle: {
    fontSize: 12.5,
    color: '#5A708E',
    fontWeight: '500',
  },
  bentoRow1: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'stretch',
  },
  bentoSermonsTouch: {
    flex: 0.94,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#092B26',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  bentoSermonsCard: {
    flex: 1,
    minHeight: 173,
    borderRadius: 24,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  bentoDarkInnerRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(248, 217, 139, 0.22)',
  },
  bentoGoldInnerRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 252, 240, 0.6)',
  },
  bento3DIconDark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(247, 220, 148, 0.45)',
    borderBottomWidth: 1.2,
    borderBottomColor: 'rgba(0, 0, 0, 0.55)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(247, 220, 148, 0.2)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.35)',
    elevation: 4,
    shadowColor: '#200D02',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    overflow: 'hidden',
  },
  bento3DIconGold: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255, 255, 255, 0.85)',
    borderBottomWidth: 1.2,
    borderBottomColor: 'rgba(163, 107, 26, 0.55)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.45)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(163, 107, 26, 0.35)',
    elevation: 4,
    shadowColor: '#3A1A06',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    overflow: 'hidden',
  },
  // Claymorphic & Glassmorphic Quick Access Card Styles
  clayIconBoxLg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.24)',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    overflow: 'hidden',
  },
  clayIconBoxMd: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.24)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3.5 },
    shadowOpacity: 0.28,
    shadowRadius: 4.5,
    overflow: 'hidden',
  },
  clayIconBoxSm: {
    width: 27,
    height: 27,
    borderRadius: 8.5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.24)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.26,
    shadowRadius: 3.5,
    overflow: 'hidden',
  },
  clayIconBoxRow4: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.24)',
    elevation: 4.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  clayIconShine: {
    position: 'absolute',
    top: 3,
    left: 4,
    width: '46%',
    height: '30%',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 20,
    transform: [{ rotate: '-18deg' }],
  },
  clayArrowCircleLg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
  },
  clayArrowCircleMd: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 2.5,
  },
  clayArrowCircleSm: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  clayArrowCircleXs: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  claySermonsTouch: {
    flex: 0.94,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#092B26',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  claySermonsCard: {
    flex: 1,
    minHeight: 144,
    borderRadius: 22,
    backgroundColor: '#0D3D34',
    padding: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#527C78',
  },
  claySermonsBottom: {
    marginTop: 4,
  },
  claySermonsTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#FFFDF9',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 2,
  },
  claySermonsSub: {
    fontSize: 10,
    lineHeight: 13.5,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    marginBottom: 4,
  },
  claySermonsFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  claySermonsDashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
  },
  claySermonsDashActive: {
    width: 18,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#FFFDF9',
  },
  claySermonsDashInactive: {
    width: 9,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  bentoRow1RightCol: {
    flex: 1.06,
    justifyContent: 'space-between',
    gap: 9,
  },
  clayDailyVerseTouch: {
    flex: 1,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#240842',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  clayDailyVerseCard: {
    flex: 1,
    minHeight: 80,
    borderRadius: 20,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#7E43BA',
  },
  clayEventsTouch: {
    flex: 1,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#1F1710',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  clayEventsCard: {
    flex: 1,
    minHeight: 80,
    borderRadius: 20,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#7F6754',
  },
  clayCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  clayCardSub: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  clayGiveTouch: {
    marginTop: 9,
    borderRadius: 22,
    elevation: 3,
    shadowColor: '#4A1D16',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
  },
  clayGiveCard: {
    minHeight: 82,
    borderRadius: 22,
    backgroundColor: '#F6DFD3',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: '#B8902C',
  },
  clayGiveIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 245, 200, 0.85)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(90, 60, 5, 0.55)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  clayGiveDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(70, 35, 10, 0.16)',
    marginHorizontal: 8,
  },
  clayGiveActionPill: {
    borderWidth: 1.3,
    borderColor: '#E8C25A',
    paddingHorizontal: 16,
    paddingVertical: 7.5,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  clayGiveActionTxt: {
    color: '#F6D56E',
    fontSize: 13,
    fontWeight: '700',
  },
  bentoRow3: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 9,
    alignItems: 'stretch',
  },
  clayAttendanceTouch: {
    flex: 1,
    borderRadius: 22,
    elevation: 4,
    shadowColor: '#1A1D1D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  clayAttendanceCard: {
    minHeight: 84,
    borderRadius: 22,
    backgroundColor: '#343A3A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#4F5959',
  },
  clayYoutubeTouch: {
    flex: 1,
    borderRadius: 22,
    elevation: 4,
    shadowColor: '#420F12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  clayYoutubeCard: {
    minHeight: 84,
    borderRadius: 22,
    backgroundColor: '#101817',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#243835',
  },
  bentoLiveBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  bentoLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  bentoLiveTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFDF9',
    letterSpacing: 0.8,
  },
  claySongsTouch: {
    flex: 1,
    borderRadius: 22,
    elevation: 3,
    shadowColor: '#3A1A54',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
  },
  claySongsCard: {
    minHeight: 84,
    borderRadius: 22,
    backgroundColor: '#F3ECFA',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8DCF8',
  },
  bentoRow4: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  clayQuarterTouch: {
    flex: 1,
    borderRadius: 20,
  },
  clayQuarterCard: {
    minHeight: 84,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    elevation: 2.5,
    shadowColor: '#2A1A0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    borderWidth: 1.5,
  },
  clayAccentBar: {
    width: 20,
    height: 2.5,
    borderRadius: 1.25,
    marginTop: 3,
  },
  clayQuarterBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bentoBottomPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 9,
  },
  clayBottomTouch: {
    flex: 1,
    borderRadius: 18,
  },
  clayBottomPill: {
    minHeight: 62,
    borderRadius: 18,
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    elevation: 2.5,
    shadowColor: '#2A1A0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    borderWidth: 1,
  },

  quickAccessHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 18,
    marginTop: 18,
    marginBottom: 16,
    gap: 12,
  },
  quickAccessTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickAccessAccentBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#355B56',
  },
  quickAccessHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(53, 91, 86, 0.14)',
  },
  secLbl: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0B1938',
    letterSpacing: 0.4,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  iconItem: {
    width: '24%',
    alignItems: 'center',
    marginBottom: 18,
  },
  iconCardFrame: {
    padding: 3.5,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconShineTop: {
    position: 'absolute',
    top: -16,
    right: -16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  iconShineBottom: {
    position: 'absolute',
    bottom: -14,
    left: -14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconInnerRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  iconLbl: {
    fontSize: 11.5,
    color: '#1E293B',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.1,
    lineHeight: 15,
    paddingHorizontal: 2,
  },
  quickActionPillWrapper: {
    flex: 1,
    borderRadius: 22,
    padding: 2.5,
    backgroundColor: '#FFFFFF',
    elevation: 5,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  quickActionPillGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19.5,
    overflow: 'hidden',
  },
  quickActionPillGlow: {
    position: 'absolute',
    top: -20,
    right: -15,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  quickActionPillIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  archMedallionOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 4,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 6,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  archMedallionInner: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Sermon Card (clean card, no header band)
  sermonCard: { marginHorizontal: 16, marginBottom: 4, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, borderWidth: 1, borderColor: '#f1f5f9' },
  scHd: { backgroundColor: '#1a2d5a', paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scHdLblRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  scHdLbl: { fontSize: 12, color: '#fff', fontWeight: '700' },
  scSee: { fontSize: 11, color: '#aac4e8', fontWeight: '600' },
  scBody: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 15 },
  scThumb: { width: 80, height: 50, backgroundColor: '#0f172a', borderRadius: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  playIconOverlay: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  scInfo: { flex: 1 },
  scTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  scTitleTe: { fontSize: 12, color: '#334155', marginBottom: 4 },
  scMeta: { fontSize: 10.5, color: '#64748b' },
  playBtnCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },

  // Prayer Card (clean card, no header band)
  prayerCard: { marginHorizontal: 16, marginBottom: 4, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, borderWidth: 1, borderColor: '#f1f5f9' },
  pcHd: { backgroundColor: '#1a2d5a', paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pcHdLblRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  pcHdLbl: { fontSize: 12, color: '#fff', fontWeight: '700' },
  pcCount: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  pcBody: { padding: 16 },
  pcTextContainer: { backgroundColor: '#FAF7F2', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 15 },
  pcText: { fontSize: 13, color: '#334155', lineHeight: 22, fontStyle: 'italic' },
  pcFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prayedBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#bfdbfe' },
  prayedBtnTxt: { color: '#1a2d5a', fontSize: 12, fontWeight: '700' },
  pcSeeAll: { fontSize: 11.5, color: '#94a3b8', fontWeight: '600' },

  // Modal Styles for Household Members
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    padding: 8,
  },
  modalLoading: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  ebMetaText: {
    fontSize: 10, 
    color: '#64748b', 
    fontWeight: '500', 
    lineHeight: 14
  },
  modalScroll: {
    padding: 20,
  },
  noFamily: {
    padding: 40,
    alignItems: 'center',
  },
  noFamilyText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  contactCard: {
    paddingVertical: 16,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a2d5a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  roleBadgeText: {
    color: '#1e40af',
    fontSize: 10,
    fontWeight: '700',
  },
  contactDetails: {
    marginTop: 12,
    paddingLeft: 56,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardDark: {
    backgroundColor: '#1F2937',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  langModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  langModalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 360,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  langModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  langModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a2d5a',
  },
  langModalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  langModalNative: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  langModalName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    marginTop: 2,
  },
});
