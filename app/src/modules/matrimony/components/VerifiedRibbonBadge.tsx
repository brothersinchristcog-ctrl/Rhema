import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path, Polygon } from 'react-native-svg';
import { useTheme } from '../../../context/ThemeContext';

interface VerifiedRibbonBadgeProps {
  label?: string;
  fontFamily?: string;
}

export default function VerifiedRibbonBadge({
  label = 'Verified',
  fontFamily,
}: VerifiedRibbonBadgeProps) {
  const { isDark } = useTheme();
  const ribbonBg = isDark ? 'rgba(2, 115, 212, 0.22)' : '#EAF3FC';
  const labelColor = isDark ? '#7DD3FC' : '#0B63B6';

  return (
    <View style={styles.container}>
      <Svg width={108} height={26} viewBox="0 0 108 26" style={StyleSheet.absoluteFill}>
        {/* Pale blue swallowtail ribbon behind the scalloped seal */}
        <Polygon points="13,3 106,3 98,13 106,23 13,23" fill={ribbonBg} />
        {/* Solid royal-blue scalloped verified rosette + white checkmark */}
        <G transform="translate(1, 1)">
          <Path
            d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
            fill="#0273D4"
          />
          <Path
            d="m8.8 12.2 2.1 2.1 4.3-4.3"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </G>
      </Svg>
      <Text style={[styles.label, { color: labelColor, fontFamily }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 108,
    height: 26,
    justifyContent: 'center',
    paddingLeft: 31,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
