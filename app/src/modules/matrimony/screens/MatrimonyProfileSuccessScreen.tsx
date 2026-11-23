import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import { getProfileSubjectFromContext } from '../utils/profileSubject';

export default function MatrimonyProfileSuccessScreen({ navigation, route }: any) {
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;
  const subjectCopy = getProfileSubjectFromContext(
    route?.params?.draftData,
    route?.params?.initialData
  );

  const scaleAnim = useRef(new Animated.Value(0.4)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'MatrimonyPhotoUpload', params: route?.params }],
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigation, route?.params, scaleAnim, fadeAnim]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <Animated.View
        style={[
          styles.centerBox,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View
          style={[
            styles.outerHalo,
            { backgroundColor: isDark ? 'rgba(21, 128, 61, 0.20)' : '#DCFCE7' },
          ]}
        >
          <View style={styles.greenCircle}>
            <Check size={44} color="#FFFFFF" strokeWidth={3.2} />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text, fontFamily, fontSize: scaleFont(22) }]}>
          Profile Created Successfully!
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: colors.textSecondary, fontFamily, fontSize: scaleFont(14) },
          ]}
        >
          {subjectCopy.successSubtitle}
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  outerHalo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  greenCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 21,
  },
});
