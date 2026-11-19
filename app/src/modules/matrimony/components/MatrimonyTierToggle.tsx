import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../context/ThemeContext';

const ORANGE_GRADIENT: readonly [string, string] = ['#FB923C', '#EA580C'];
const ORANGE_TEXT = '#EA580C';

interface MatrimonyTierToggleProps {
  value: 'regular' | 'prime';
  onChange: (next: 'regular' | 'prime') => void;
  fontFamily?: string;
}

export default function MatrimonyTierToggle({
  value,
  onChange,
  fontFamily,
}: MatrimonyTierToggleProps) {
  const { colors, isDark } = useTheme();
  const surface = isDark ? colors.surface : '#FFFFFF';
  const activeInnerBg = isDark ? '#334155' : '#FFFFFF';
  const activeTextColor = isDark ? '#FDBA74' : ORANGE_TEXT;

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: surface,
          borderColor: isDark ? colors.border : '#E2E8F0',
        },
      ]}
    >
      {(['regular', 'prime'] as const).map((tierKey) => {
        const active = value === tierKey;
        const label = tierKey === 'regular' ? 'Regular' : 'PRIME';

        if (active) {
          return (
            <TouchableOpacity
              key={tierKey}
              activeOpacity={0.85}
              onPress={() => onChange(tierKey)}
            >
              <LinearGradient
                colors={ORANGE_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.activeGradientBorder}
              >
                <View style={[styles.activeInnerWhite, { backgroundColor: activeInnerBg }]}>
                  <Text style={[styles.text, { color: activeTextColor, fontWeight: '800', fontFamily }]}>
                    {label}
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={tierKey}
            activeOpacity={0.85}
            onPress={() => onChange(tierKey)}
            style={styles.inactiveBtn}
          >
            <Text
              style={[
                styles.text,
                {
                  color: tierKey === 'prime' ? colors.text : colors.textSecondary,
                  fontWeight: tierKey === 'prime' ? '700' : '600',
                  fontFamily,
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    padding: 3,
    borderWidth: 1,
  },
  activeGradientBorder: {
    borderRadius: 19,
    padding: 1.5,
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 3,
    elevation: 2,
  },
  activeInnerWhite: {
    paddingHorizontal: 21,
    paddingVertical: 6.5,
    borderRadius: 17.5,
  },
  inactiveBtn: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 18,
  },
  text: {
    fontSize: 13.5,
  },
});
