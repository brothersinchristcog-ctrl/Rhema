import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { Crown } from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';

interface VerifiedRibbonBadgeProps {
  label?: string;
  fontFamily?: string;
  variant?: 'verified' | 'prime_verified';
  tier?: 'free' | 'silver' | 'gold' | 'platinum';
}

export default function VerifiedRibbonBadge({
  label = 'Verified',
  fontFamily,
  tier,
}: VerifiedRibbonBadgeProps) {
  const { isDark } = useTheme();
  const isPaidMember = tier === 'silver' || tier === 'gold' || tier === 'platinum';

  const verifiedColor = isDark ? '#60A5FA' : '#0B63B6';
  const sealFill = '#0273D4';
  const paidCircleBg = isDark ? '#6D28D9' : '#4C1D95';
  const paidTextColor = isDark ? '#C4B5FD' : '#4C1D95';

  return (
    <View style={styles.row}>
      <View style={styles.verifiedPart}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <G>
            <Path
              d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
              fill={sealFill}
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
        <Text style={[styles.verifiedText, { color: verifiedColor, fontFamily }]} numberOfLines={1}>
          {label}
        </Text>
      </View>

      {isPaidMember ? (
        <View style={styles.paidPart}>
          <View style={[styles.paidCircle, { backgroundColor: paidCircleBg }]}>
            <Crown size={10} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
          </View>
          <Text style={[styles.paidText, { color: paidTextColor, fontFamily }]} numberOfLines={1}>
            Paid Member
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  verifiedPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  paidPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paidCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
