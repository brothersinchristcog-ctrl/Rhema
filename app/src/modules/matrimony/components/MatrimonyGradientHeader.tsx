import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';

interface MatrimonyGradientHeaderProps {
  title: string;
  onBack: () => void;
}

export default function MatrimonyGradientHeader({
  title,
  onBack,
}: MatrimonyGradientHeaderProps) {
  const insets = useSafeAreaInsets();
  const { isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const textColor = isDark ? '#FFFFFF' : '#1E293B';

  return (
    <LinearGradient
      colors={
        isDark
          ? ['rgba(251, 146, 60, 0.34)', 'rgba(234, 88, 12, 0.18)', '#1E293B']
          : ['#FFD4B3', '#FFE8D6', '#FFF5ED']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[
        styles.headerWrap,
        {
          paddingTop: insets.top + 10,
          borderBottomColor: isDark ? 'rgba(251, 146, 60, 0.35)' : '#FED7AA',
        },
      ]}
    >
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ArrowLeft size={22} color={textColor} />
      </TouchableOpacity>

      <Text
        style={[
          styles.title,
          { color: textColor, fontFamily, fontSize: scaleFont(18) },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>

      <View style={styles.rightSpacer} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '800',
  },
  rightSpacer: {
    width: 34,
  },
});
